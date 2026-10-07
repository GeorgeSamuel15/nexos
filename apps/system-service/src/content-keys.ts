import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';

import { NexOSError } from '@nexos/core';
import type { StoredUserSecret } from '@nexos/storage';

const contentKeyLength = 32;
const wrapKeyLength = 32;
const kdfCost = 32_768;
const kdfBlockSize = 8;
const kdfParallelization = 1;

function deriveWrapKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      wrapKeyLength,
      {
        N: kdfCost,
        r: kdfBlockSize,
        p: kdfParallelization,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

function additionalData(userId: string): Buffer {
  return Buffer.from(`nexos:user-content-key:v1:${userId}`, 'utf8');
}

export async function createWrappedContentKey(
  userId: string,
  password: string,
): Promise<{ key: Buffer; secret: StoredUserSecret }> {
  const key = randomBytes(contentKeyLength);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrapKey = await deriveWrapKey(password, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', wrapKey, iv);
    cipher.setAAD(additionalData(userId));
    const wrapped = Buffer.concat([cipher.update(key), cipher.final()]);
    const now = new Date().toISOString();
    return {
      key,
      secret: {
        userId,
        kdfSalt: salt.toString('base64'),
        wrapIv: iv.toString('base64'),
        wrapAuthTag: cipher.getAuthTag().toString('base64'),
        wrappedKey: wrapped.toString('base64'),
        createdAt: now,
        updatedAt: now,
      },
    };
  } finally {
    wrapKey.fill(0);
  }
}

export async function unwrapContentKey(
  secret: StoredUserSecret,
  password: string,
): Promise<Buffer> {
  const wrapKey = await deriveWrapKey(password, Buffer.from(secret.kdfSalt, 'base64'));
  try {
    const decipher = createDecipheriv('aes-256-gcm', wrapKey, Buffer.from(secret.wrapIv, 'base64'));
    decipher.setAAD(additionalData(secret.userId));
    decipher.setAuthTag(Buffer.from(secret.wrapAuthTag, 'base64'));
    const key = Buffer.concat([
      decipher.update(Buffer.from(secret.wrappedKey, 'base64')),
      decipher.final(),
    ]);
    if (key.byteLength !== contentKeyLength) {
      key.fill(0);
      throw new NexOSError('INTERNAL_ERROR', 'The stored content key has an invalid length.');
    }
    return key;
  } catch (error) {
    if (error instanceof NexOSError) throw error;
    throw new NexOSError(
      'INTERNAL_ERROR',
      'The encrypted content key could not be unlocked.',
      {},
      { cause: error },
    );
  } finally {
    wrapKey.fill(0);
  }
}
