import { mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  AppManifest,
  ClipboardEntry,
  FileNode,
  NexOSSettings,
  NotificationRecord,
  Permission,
  PermissionGrant,
  UserProfile,
} from '@nexos/types';

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlRow = Record<string, unknown>;

interface Migration {
  version: number;
  description: string;
  sql: string;
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    description: 'Initial NexOS system schema',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        avatar TEXT,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE fs_nodes (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        parent_path TEXT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('file', 'directory')),
        mime_type TEXT,
        content TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        system INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        accessed_at TEXT NOT NULL,
        trashed_at TEXT,
        original_path TEXT
      );
      CREATE INDEX fs_nodes_parent_idx ON fs_nodes(parent_path);
      CREATE INDEX fs_nodes_accessed_idx ON fs_nodes(accessed_at DESC);
      CREATE INDEX fs_nodes_trashed_idx ON fs_nodes(trashed_at);

      CREATE TABLE applications (
        id TEXT PRIMARY KEY,
        manifest_json TEXT NOT NULL,
        package_json TEXT,
        builtin INTEGER NOT NULL DEFAULT 0,
        installed_at TEXT NOT NULL
      );

      CREATE TABLE permissions (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        granted INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, application_id, permission)
      );

      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        application_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        dismissed INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

      CREATE TABLE clipboard_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX clipboard_user_idx ON clipboard_history(user_id, created_at DESC);

      CREATE TABLE application_preferences (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        application_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, application_id, key)
      );
    `,
  },
  {
    version: 2,
    description: 'Application package provenance and publisher trust',
    sql: `
      ALTER TABLE applications ADD COLUMN publisher_json TEXT;
      ALTER TABLE applications ADD COLUMN trust_level TEXT NOT NULL DEFAULT 'unsigned';
      ALTER TABLE applications ADD COLUMN package_hash TEXT;
      ALTER TABLE applications ADD COLUMN signature_verified INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 3,
    description: 'Per-user content encryption metadata and wrapped keys',
    sql: `
      CREATE TABLE user_secrets (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        kdf_salt TEXT NOT NULL,
        wrap_iv TEXT NOT NULL,
        wrap_auth_tag TEXT NOT NULL,
        wrapped_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      ALTER TABLE fs_nodes ADD COLUMN content_encrypted INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE fs_nodes ADD COLUMN content_owner_user_id TEXT;
      ALTER TABLE fs_nodes ADD COLUMN content_iv TEXT;
      ALTER TABLE fs_nodes ADD COLUMN content_auth_tag TEXT;
    `,
  },
];

function row(value: unknown, context: string): SqlRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid database row returned for ${context}`);
  }
  return value as SqlRow;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid text column: ${field}`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return text(value, field);
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`Invalid numeric column: ${field}`);
  }
  return Number(value);
}

function boolean(value: unknown, field: string): boolean {
  return integer(value, field) === 1;
}

export class NexOSDatabase {
  readonly #database: DatabaseSync;

  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.#database = new DatabaseSync(path);
    this.#database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.#database.exec('PRAGMA journal_mode = WAL;');
  }

  migrate(): void {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const applied = new Set(
      this.all('SELECT version FROM schema_migrations').map((item) =>
        integer(item['version'], 'version'),
      ),
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.transaction(() => {
        this.exec(migration.sql);
        this.run(
          'INSERT INTO schema_migrations(version, description, applied_at) VALUES (?, ?, ?)',
          [migration.version, migration.description, new Date().toISOString()],
        );
      });
    }
  }

  exec(sql: string): void {
    this.#database.exec(sql);
  }

  run(
    sql: string,
    parameters: readonly SqlValue[] = [],
  ): { changes: number; lastInsertRowid: number } {
    const result = this.#database.prepare(sql).run(...parameters);
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  get(sql: string, parameters: readonly SqlValue[] = []): SqlRow | null {
    const result = this.#database.prepare(sql).get(...parameters);
    return result === undefined ? null : row(result, sql);
  }

  all(sql: string, parameters: readonly SqlValue[] = []): SqlRow[] {
    return this.#database
      .prepare(sql)
      .all(...parameters)
      .map((item) => row(item, sql));
  }

  transaction<T>(operation: () => T): T {
    this.#database.exec('BEGIN IMMEDIATE');
    try {
      const value = operation();
      this.#database.exec('COMMIT');
      return value;
    } catch (error) {
      this.#database.exec('ROLLBACK');
      throw error;
    }
  }

  sizeBytes(): number {
    if (this.path === ':memory:') return 0;
    try {
      return statSync(this.path).size;
    } catch {
      return 0;
    }
  }

  close(): void {
    this.#database.close();
  }
}

export interface StoredFileNode extends FileNode {
  content: string | null;
  contentOwnerUserId: string | null;
  contentIv: string | null;
  contentAuthTag: string | null;
}

function parseFile(item: SqlRow): StoredFileNode {
  const kind = text(item['kind'], 'kind');
  if (kind !== 'file' && kind !== 'directory') throw new Error('Invalid file kind in database');
  return {
    id: text(item['id'], 'id'),
    path: text(item['path'], 'path'),
    parentPath: nullableText(item['parent_path'], 'parent_path'),
    name: text(item['name'], 'name'),
    kind,
    mimeType: nullableText(item['mime_type'], 'mime_type'),
    content: nullableText(item['content'], 'content'),
    size: integer(item['size'], 'size'),
    encrypted: boolean(item['content_encrypted'], 'content_encrypted'),
    contentOwnerUserId: nullableText(item['content_owner_user_id'], 'content_owner_user_id'),
    contentIv: nullableText(item['content_iv'], 'content_iv'),
    contentAuthTag: nullableText(item['content_auth_tag'], 'content_auth_tag'),
    favorite: boolean(item['favorite'], 'favorite'),
    system: boolean(item['system'], 'system'),
    createdAt: text(item['created_at'], 'created_at'),
    updatedAt: text(item['updated_at'], 'updated_at'),
    accessedAt: text(item['accessed_at'], 'accessed_at'),
    trashedAt: nullableText(item['trashed_at'], 'trashed_at'),
    originalPath: nullableText(item['original_path'], 'original_path'),
  };
}

export class FileRepository {
  constructor(private readonly database: NexOSDatabase) {}

  get(path: string, includeTrashed = false): StoredFileNode | null {
    const result = this.database.get(
      `SELECT * FROM fs_nodes WHERE path = ? ${includeTrashed ? '' : 'AND trashed_at IS NULL'}`,
      [path],
    );
    return result ? parseFile(result) : null;
  }

  listChildren(parentPath: string, includeTrashed = false): StoredFileNode[] {
    return this.database
      .all(
        `SELECT * FROM fs_nodes WHERE parent_path = ? ${includeTrashed ? '' : 'AND trashed_at IS NULL'} ORDER BY kind DESC, name COLLATE NOCASE`,
        [parentPath],
      )
      .map(parseFile);
  }

  listDescendants(path: string, includeTrashed = false): StoredFileNode[] {
    const escaped = path.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
    return this.database
      .all(
        `SELECT * FROM fs_nodes WHERE path LIKE ? ESCAPE '\\' ${includeTrashed ? '' : 'AND trashed_at IS NULL'} ORDER BY length(path)`,
        [`${escaped}/%`],
      )
      .map(parseFile);
  }

  listAll(includeTrashed = false): StoredFileNode[] {
    return this.database
      .all(
        `SELECT * FROM fs_nodes ${includeTrashed ? '' : 'WHERE trashed_at IS NULL'} ORDER BY path`,
      )
      .map(parseFile);
  }

  upsert(node: StoredFileNode): void {
    this.database.run(
      `INSERT INTO fs_nodes(
        id, path, parent_path, name, kind, mime_type, content, size, favorite, system,
        created_at, updated_at, accessed_at, trashed_at, original_path,
        content_encrypted, content_owner_user_id, content_iv, content_auth_tag
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        parent_path=excluded.parent_path, name=excluded.name, kind=excluded.kind,
        mime_type=excluded.mime_type, content=excluded.content, size=excluded.size,
        favorite=excluded.favorite, system=excluded.system, updated_at=excluded.updated_at,
        accessed_at=excluded.accessed_at, trashed_at=excluded.trashed_at,
        original_path=excluded.original_path, content_encrypted=excluded.content_encrypted,
        content_owner_user_id=excluded.content_owner_user_id, content_iv=excluded.content_iv,
        content_auth_tag=excluded.content_auth_tag`,
      [
        node.id,
        node.path,
        node.parentPath,
        node.name,
        node.kind,
        node.mimeType,
        node.content,
        node.size,
        node.favorite ? 1 : 0,
        node.system ? 1 : 0,
        node.createdAt,
        node.updatedAt,
        node.accessedAt,
        node.trashedAt,
        node.originalPath,
        node.encrypted ? 1 : 0,
        node.contentOwnerUserId,
        node.contentIv,
        node.contentAuthTag,
      ],
    );
  }

  updateById(node: StoredFileNode): void {
    const result = this.database.run(
      `UPDATE fs_nodes SET path=?, parent_path=?, name=?, kind=?, mime_type=?, content=?,
       size=?, favorite=?, system=?, updated_at=?, accessed_at=?, trashed_at=?, original_path=?
       , content_encrypted=?, content_owner_user_id=?, content_iv=?, content_auth_tag=?
       WHERE id=?`,
      [
        node.path,
        node.parentPath,
        node.name,
        node.kind,
        node.mimeType,
        node.content,
        node.size,
        node.favorite ? 1 : 0,
        node.system ? 1 : 0,
        node.updatedAt,
        node.accessedAt,
        node.trashedAt,
        node.originalPath,
        node.encrypted ? 1 : 0,
        node.contentOwnerUserId,
        node.contentIv,
        node.contentAuthTag,
        node.id,
      ],
    );
    if (result.changes !== 1) throw new Error(`File node no longer exists: ${node.path}`);
  }

  deleteById(id: string): void {
    this.database.run('DELETE FROM fs_nodes WHERE id = ?', [id]);
  }

  search(query: string, limit = 100): StoredFileNode[] {
    return this.database
      .all(
        `SELECT * FROM fs_nodes WHERE trashed_at IS NULL AND name LIKE ? ESCAPE '\\'
         ORDER BY favorite DESC, accessed_at DESC LIMIT ?`,
        [
          `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`,
          limit,
        ],
      )
      .map(parseFile);
  }

  recent(limit: number): StoredFileNode[] {
    return this.database
      .all(
        `SELECT * FROM fs_nodes WHERE kind='file' AND trashed_at IS NULL
         ORDER BY accessed_at DESC LIMIT ?`,
        [limit],
      )
      .map(parseFile);
  }

  favorites(): StoredFileNode[] {
    return this.database
      .all(
        `SELECT * FROM fs_nodes WHERE favorite=1 AND trashed_at IS NULL
         ORDER BY kind DESC, name COLLATE NOCASE`,
      )
      .map(parseFile);
  }

  trashed(): StoredFileNode[] {
    return this.database
      .all('SELECT * FROM fs_nodes WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC')
      .map(parseFile);
  }

  transaction<T>(operation: () => T): T {
    return this.database.transaction(operation);
  }
}

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

function parseUser(item: SqlRow): StoredUser {
  return {
    id: text(item['id'], 'id'),
    username: text(item['username'], 'username'),
    displayName: text(item['display_name'], 'display_name'),
    avatar: nullableText(item['avatar'], 'avatar'),
    passwordHash: text(item['password_hash'], 'password_hash'),
    createdAt: text(item['created_at'], 'created_at'),
    lastLoginAt: nullableText(item['last_login_at'], 'last_login_at'),
  };
}

export class UserRepository {
  constructor(private readonly database: NexOSDatabase) {}

  list(): StoredUser[] {
    return this.database.all('SELECT * FROM users ORDER BY created_at').map(parseUser);
  }

  getById(id: string): StoredUser | null {
    const result = this.database.get('SELECT * FROM users WHERE id=?', [id]);
    return result ? parseUser(result) : null;
  }

  getByUsername(username: string): StoredUser | null {
    const result = this.database.get('SELECT * FROM users WHERE username=? COLLATE NOCASE', [
      username,
    ]);
    return result ? parseUser(result) : null;
  }

  create(user: StoredUser): void {
    this.database.run(
      `INSERT INTO users(id, username, display_name, avatar, password_hash, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.username,
        user.displayName,
        user.avatar,
        user.passwordHash,
        user.createdAt,
        user.lastLoginAt,
      ],
    );
  }

  setLastLogin(id: string, timestamp: string): void {
    this.database.run('UPDATE users SET last_login_at=? WHERE id=?', [timestamp, id]);
  }
}

export interface StoredUserSecret {
  userId: string;
  kdfSalt: string;
  wrapIv: string;
  wrapAuthTag: string;
  wrappedKey: string;
  createdAt: string;
  updatedAt: string;
}

function parseUserSecret(item: SqlRow): StoredUserSecret {
  return {
    userId: text(item['user_id'], 'user_id'),
    kdfSalt: text(item['kdf_salt'], 'kdf_salt'),
    wrapIv: text(item['wrap_iv'], 'wrap_iv'),
    wrapAuthTag: text(item['wrap_auth_tag'], 'wrap_auth_tag'),
    wrappedKey: text(item['wrapped_key'], 'wrapped_key'),
    createdAt: text(item['created_at'], 'created_at'),
    updatedAt: text(item['updated_at'], 'updated_at'),
  };
}

export class UserSecretRepository {
  constructor(private readonly database: NexOSDatabase) {}

  get(userId: string): StoredUserSecret | null {
    const result = this.database.get('SELECT * FROM user_secrets WHERE user_id=?', [userId]);
    return result ? parseUserSecret(result) : null;
  }

  upsert(secret: StoredUserSecret): void {
    this.database.run(
      `INSERT INTO user_secrets(
         user_id, kdf_salt, wrap_iv, wrap_auth_tag, wrapped_key, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         kdf_salt=excluded.kdf_salt, wrap_iv=excluded.wrap_iv,
         wrap_auth_tag=excluded.wrap_auth_tag, wrapped_key=excluded.wrapped_key,
         updated_at=excluded.updated_at`,
      [
        secret.userId,
        secret.kdfSalt,
        secret.wrapIv,
        secret.wrapAuthTag,
        secret.wrappedKey,
        secret.createdAt,
        secret.updatedAt,
      ],
    );
  }
}

export class SettingsRepository {
  constructor(private readonly database: NexOSDatabase) {}

  get(userId: string): NexOSSettings | null {
    const result = this.database.get('SELECT value_json FROM settings WHERE user_id=?', [userId]);
    if (!result) return null;
    return JSON.parse(text(result['value_json'], 'value_json')) as NexOSSettings;
  }

  set(userId: string, settings: NexOSSettings): void {
    this.database.run(
      `INSERT INTO settings(user_id, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`,
      [userId, JSON.stringify(settings), new Date().toISOString()],
    );
  }
}

export interface StoredApplication {
  manifest: AppManifest;
  packageJson: string | null;
  builtin: boolean;
  installedAt: string;
  publisherJson: string | null;
  trustLevel: 'system' | 'verified' | 'community' | 'unsigned';
  packageHash: string | null;
  signatureVerified: boolean;
}

function parseApplication(item: SqlRow): StoredApplication {
  return {
    manifest: JSON.parse(text(item['manifest_json'], 'manifest_json')) as AppManifest,
    packageJson: nullableText(item['package_json'], 'package_json'),
    builtin: boolean(item['builtin'], 'builtin'),
    installedAt: text(item['installed_at'], 'installed_at'),
    publisherJson: nullableText(item['publisher_json'], 'publisher_json'),
    trustLevel: text(item['trust_level'], 'trust_level') as StoredApplication['trustLevel'],
    packageHash: nullableText(item['package_hash'], 'package_hash'),
    signatureVerified: boolean(item['signature_verified'], 'signature_verified'),
  };
}

export class ApplicationRepository {
  constructor(private readonly database: NexOSDatabase) {}

  list(): StoredApplication[] {
    return this.database
      .all('SELECT * FROM applications ORDER BY builtin DESC, id')
      .map(parseApplication);
  }

  get(id: string): StoredApplication | null {
    const result = this.database.get('SELECT * FROM applications WHERE id=?', [id]);
    return result ? parseApplication(result) : null;
  }

  upsert(application: StoredApplication): void {
    this.database.run(
      `INSERT INTO applications(
         id, manifest_json, package_json, builtin, installed_at,
         publisher_json, trust_level, package_hash, signature_verified
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET manifest_json=excluded.manifest_json,
       package_json=excluded.package_json, builtin=excluded.builtin,
       publisher_json=excluded.publisher_json, trust_level=excluded.trust_level,
       package_hash=excluded.package_hash, signature_verified=excluded.signature_verified`,
      [
        application.manifest.id,
        JSON.stringify(application.manifest),
        application.packageJson,
        application.builtin ? 1 : 0,
        application.installedAt,
        application.publisherJson,
        application.trustLevel,
        application.packageHash,
        application.signatureVerified ? 1 : 0,
      ],
    );
  }

  remove(id: string): void {
    this.database.run('DELETE FROM applications WHERE id=? AND builtin=0', [id]);
  }
}

function parsePermission(item: SqlRow): PermissionGrant {
  return {
    userId: text(item['user_id'], 'user_id'),
    applicationId: text(item['application_id'], 'application_id'),
    permission: text(item['permission'], 'permission') as Permission,
    granted: boolean(item['granted'], 'granted'),
    updatedAt: text(item['updated_at'], 'updated_at'),
  };
}

export class PermissionRepository {
  constructor(private readonly database: NexOSDatabase) {}

  list(userId: string, applicationId: string): PermissionGrant[] {
    return this.database
      .all('SELECT * FROM permissions WHERE user_id=? AND application_id=? ORDER BY permission', [
        userId,
        applicationId,
      ])
      .map(parsePermission);
  }

  get(userId: string, applicationId: string, permission: Permission): PermissionGrant | null {
    const result = this.database.get(
      'SELECT * FROM permissions WHERE user_id=? AND application_id=? AND permission=?',
      [userId, applicationId, permission],
    );
    return result ? parsePermission(result) : null;
  }

  set(grant: PermissionGrant): void {
    this.database.run(
      `INSERT INTO permissions(user_id, application_id, permission, granted, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, application_id, permission)
       DO UPDATE SET granted=excluded.granted, updated_at=excluded.updated_at`,
      [grant.userId, grant.applicationId, grant.permission, grant.granted ? 1 : 0, grant.updatedAt],
    );
  }
}

function parseNotification(item: SqlRow): NotificationRecord {
  return {
    id: text(item['id'], 'id'),
    applicationId: text(item['application_id'], 'application_id'),
    title: text(item['title'], 'title'),
    message: text(item['message'], 'message'),
    createdAt: text(item['created_at'], 'created_at'),
    read: boolean(item['is_read'], 'is_read'),
    dismissed: boolean(item['dismissed'], 'dismissed'),
  };
}

export class NotificationRepository {
  constructor(private readonly database: NexOSDatabase) {}

  list(userId: string): NotificationRecord[] {
    return this.database
      .all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 200', [
        userId,
      ])
      .map(parseNotification);
  }

  add(userId: string, notification: NotificationRecord): void {
    this.database.run(
      `INSERT INTO notifications(id, user_id, application_id, title, message, created_at, is_read, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notification.id,
        userId,
        notification.applicationId,
        notification.title,
        notification.message,
        notification.createdAt,
        notification.read ? 1 : 0,
        notification.dismissed ? 1 : 0,
      ],
    );
  }

  markRead(userId: string, id: string): void {
    this.database.run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [id, userId]);
  }

  dismiss(userId: string, id: string): void {
    this.database.run('UPDATE notifications SET dismissed=1, is_read=1 WHERE id=? AND user_id=?', [
      id,
      userId,
    ]);
  }

  dismissAll(userId: string): void {
    this.database.run('UPDATE notifications SET dismissed=1, is_read=1 WHERE user_id=?', [userId]);
  }
}

function parseClipboard(item: SqlRow): ClipboardEntry {
  return {
    id: text(item['id'], 'id'),
    text: text(item['text'], 'text'),
    createdAt: text(item['created_at'], 'created_at'),
  };
}

export class ClipboardRepository {
  constructor(private readonly database: NexOSDatabase) {}

  list(userId: string): ClipboardEntry[] {
    return this.database
      .all('SELECT * FROM clipboard_history WHERE user_id=? ORDER BY created_at DESC LIMIT 30', [
        userId,
      ])
      .map(parseClipboard);
  }

  add(userId: string, entry: ClipboardEntry): void {
    this.database.transaction(() => {
      this.database.run('DELETE FROM clipboard_history WHERE user_id=? AND text=?', [
        userId,
        entry.text,
      ]);
      this.database.run(
        'INSERT INTO clipboard_history(id, user_id, text, created_at) VALUES (?, ?, ?, ?)',
        [entry.id, userId, entry.text, entry.createdAt],
      );
      this.database.run(
        `DELETE FROM clipboard_history WHERE user_id=? AND id NOT IN (
          SELECT id FROM clipboard_history WHERE user_id=? ORDER BY created_at DESC LIMIT 30
        )`,
        [userId, userId],
      );
    });
  }

  clear(userId: string): void {
    this.database.run('DELETE FROM clipboard_history WHERE user_id=?', [userId]);
  }
}

export interface StorageSummary {
  files: number;
  directories: number;
  contentBytes: number;
  recycleBinItems: number;
}

export function getStorageSummary(database: NexOSDatabase): StorageSummary {
  const result = database.get(`
    SELECT
      SUM(CASE WHEN kind='file' THEN 1 ELSE 0 END) AS files,
      SUM(CASE WHEN kind='directory' THEN 1 ELSE 0 END) AS directories,
      COALESCE(SUM(size), 0) AS content_bytes,
      SUM(CASE WHEN trashed_at IS NOT NULL THEN 1 ELSE 0 END) AS recycle_bin_items
    FROM fs_nodes
  `);
  if (!result) return { files: 0, directories: 0, contentBytes: 0, recycleBinItems: 0 };
  return {
    files: integer(result['files'] ?? 0, 'files'),
    directories: integer(result['directories'] ?? 0, 'directories'),
    contentBytes: integer(result['content_bytes'] ?? 0, 'content_bytes'),
    recycleBinItems: integer(result['recycle_bin_items'] ?? 0, 'recycle_bin_items'),
  };
}
