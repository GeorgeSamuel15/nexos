import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileRepository, NexOSDatabase, type StoredFileNode } from './index.js';

describe('NexOSDatabase', () => {
  let database: NexOSDatabase;

  beforeEach(() => {
    database = new NexOSDatabase(':memory:');
    database.migrate();
  });

  afterEach(() => database.close());

  it('applies migrations idempotently', () => {
    database.migrate();
    const migrations = database.all('SELECT * FROM schema_migrations');
    expect(migrations.map((migration) => migration['version'])).toEqual([1, 2, 3]);
  });

  it('persists virtual file nodes', () => {
    const files = new FileRepository(database);
    const now = new Date().toISOString();
    const node: StoredFileNode = {
      id: 'node-1',
      path: '/home',
      parentPath: '/',
      name: 'home',
      kind: 'directory',
      mimeType: null,
      content: null,
      size: 0,
      encrypted: false,
      contentOwnerUserId: null,
      contentIv: null,
      contentAuthTag: null,
      favorite: false,
      system: false,
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
      trashedAt: null,
      originalPath: null,
    };

    files.upsert(node);
    expect(files.get('/home')).toEqual(node);
  });
});
