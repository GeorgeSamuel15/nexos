import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';

import { NexOSError } from '@nexos/core';
import type { TypedEventBus } from '@nexos/events';
import type { SettingsRepository, UserRepository, UserSecretRepository } from '@nexos/storage';
import {
  createUserInputSchema,
  defaultSettings,
  loginInputSchema,
  type AuthState,
  type CreateUserInput,
  type LoginInput,
  type UserProfile,
} from '@nexos/types';

import { createWrappedContentKey, unwrapContentKey } from './content-keys.js';

const scryptCost = 16_384;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const derivedKeyLength = 64;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      derivedKeyLength,
      {
        N: scryptCost,
        r: scryptBlockSize,
        p: scryptParallelization,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return [
    'scrypt',
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltText, keyText] = stored.split('$');
  if (
    algorithm !== 'scrypt' ||
    Number(cost) !== scryptCost ||
    Number(blockSize) !== scryptBlockSize ||
    Number(parallelization) !== scryptParallelization ||
    !saltText ||
    !keyText
  ) {
    throw new NexOSError('INTERNAL_ERROR', 'The stored password format is unsupported.');
  }
  const expected = Buffer.from(keyText, 'base64');
  const actual = await deriveKey(password, Buffer.from(saltText, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicProfile(
  user: ReturnType<UserRepository['getById']> extends infer T ? NonNullable<T> : never,
): UserProfile {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export class UserService {
  #currentUserId: string | null = null;
  #locked = false;
  #contentKey: Buffer | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly settings: SettingsRepository,
    private readonly secrets: UserSecretRepository,
    private readonly events: TypedEventBus,
  ) {}

  state(): AuthState {
    const current = this.#currentUserId ? this.users.getById(this.#currentUserId) : null;
    return {
      hasUsers: this.users.list().length > 0,
      currentUser: current ? publicProfile(current) : null,
      locked: this.#locked,
    };
  }

  current(): UserProfile | null {
    return this.state().currentUser;
  }

  currentUserId(): string | null {
    return this.#currentUserId;
  }

  list(): UserProfile[] {
    return this.users.list().map(publicProfile);
  }

  async create(input: CreateUserInput): Promise<UserProfile> {
    const validated = createUserInputSchema.parse(input);
    if (this.users.getByUsername(validated.username)) {
      throw new NexOSError('ALREADY_EXISTS', 'That username is already in use.');
    }
    if (this.users.list().length > 0 && !this.#currentUserId) {
      throw new NexOSError('AUTH_REQUIRED', 'Sign in before adding another account.');
    }
    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      username: validated.username.toLowerCase(),
      displayName: validated.displayName,
      avatar: validated.avatar ?? null,
      passwordHash: await hashPassword(validated.password),
      createdAt: now,
      lastLoginAt: now,
    };
    this.users.create(user);
    const wrappedContentKey = await createWrappedContentKey(user.id, validated.password);
    this.secrets.upsert(wrappedContentKey.secret);
    this.settings.set(user.id, defaultSettings);
    this.#currentUserId = user.id;
    this.replaceContentKey(wrappedContentKey.key);
    this.#locked = false;
    const profile = publicProfile(user);
    this.events.emit('user:logged-in', { user: profile });
    return profile;
  }

  async login(input: LoginInput): Promise<UserProfile> {
    const validated = loginInputSchema.parse(input);
    const user = this.users.getByUsername(validated.username);
    const valid = user ? await verifyPassword(validated.password, user.passwordHash) : false;
    if (!user || !valid) throw new NexOSError('AUTH_INVALID', 'Incorrect username or password.');
    await this.loadContentKey(user.id, validated.password);
    const timestamp = new Date().toISOString();
    this.users.setLastLogin(user.id, timestamp);
    this.#currentUserId = user.id;
    this.#locked = false;
    const updated = this.users.getById(user.id);
    if (!updated) throw new NexOSError('INTERNAL_ERROR', 'The signed-in account disappeared.');
    const profile = publicProfile(updated);
    this.events.emit('user:logged-in', { user: profile });
    return profile;
  }

  logout(): void {
    if (this.#currentUserId) this.events.emit('user:logged-out', { userId: this.#currentUserId });
    this.#currentUserId = null;
    this.#locked = false;
    this.replaceContentKey(null);
  }

  lock(): void {
    if (!this.#currentUserId) throw new NexOSError('AUTH_REQUIRED', 'No active session to lock.');
    this.#locked = true;
    this.replaceContentKey(null);
    this.events.emit('system:locked', { userId: this.#currentUserId });
  }

  async unlock(password: string): Promise<UserProfile> {
    if (!this.#currentUserId || !this.#locked)
      throw new NexOSError('AUTH_INVALID', 'NexOS is not locked.');
    const user = this.users.getById(this.#currentUserId);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new NexOSError('AUTH_INVALID', 'Incorrect password.');
    }
    await this.loadContentKey(user.id, password);
    this.#locked = false;
    return publicProfile(user);
  }

  contentKey(): Buffer {
    this.requireActive();
    if (!this.#contentKey)
      throw new NexOSError('AUTH_REQUIRED', 'Unlock NexOS to access encrypted files.');
    return Buffer.from(this.#contentKey);
  }

  dispose(): void {
    this.replaceContentKey(null);
    this.#currentUserId = null;
    this.#locked = false;
  }

  requireActive(): UserProfile {
    if (!this.#currentUserId || this.#locked)
      throw new NexOSError(
        'AUTH_REQUIRED',
        this.#locked ? 'Unlock NexOS to continue.' : 'Sign in to continue.',
      );
    const user = this.users.getById(this.#currentUserId);
    if (!user) throw new NexOSError('AUTH_REQUIRED', 'The active account no longer exists.');
    return publicProfile(user);
  }

  private async loadContentKey(userId: string, password: string): Promise<void> {
    const stored = this.secrets.get(userId);
    if (stored) {
      this.replaceContentKey(await unwrapContentKey(stored, password));
      return;
    }
    const created = await createWrappedContentKey(userId, password);
    this.secrets.upsert(created.secret);
    this.replaceContentKey(created.key);
  }

  private replaceContentKey(key: Buffer | null): void {
    this.#contentKey?.fill(0);
    this.#contentKey = key;
  }
}
