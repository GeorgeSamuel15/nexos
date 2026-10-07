import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NexOSSystemService } from './index.js';

describe('NexOSSystemService', () => {
  let service: NexOSSystemService;

  beforeEach(() => {
    service = new NexOSSystemService({ dataDirectory: '.', databasePath: ':memory:' });
    service.initialize();
  });

  afterEach(() => service.close());

  it('boots with built-in applications and a default filesystem', () => {
    const boot = service.initialize();
    expect(boot.auth.hasUsers).toBe(false);
    expect(boot.applications.some((application) => application.id === 'com.nexos.files')).toBe(
      true,
    );
    expect(service.filesystem.stat('/home/Documents').kind).toBe('directory');
  });

  it('creates users with a hashed password and authenticates them', async () => {
    const profile = await service.users.create({
      username: 'alex',
      displayName: 'Alex Rivera',
      password: 'a-strong-password',
    });
    expect(profile.username).toBe('alex');
    const stored = service.database.get('SELECT password_hash FROM users WHERE username = ?', [
      'alex',
    ]);
    expect(stored?.['password_hash']).not.toBe('a-strong-password');
    expect(stored?.['password_hash']).toMatch(/^scrypt\$/);
    service.users.logout();
    await expect(
      service.users.login({ username: 'alex', password: 'wrong-password' }),
    ).rejects.toThrow(/incorrect/i);
    await expect(
      service.users.login({ username: 'alex', password: 'a-strong-password' }),
    ).resolves.toMatchObject({ username: 'alex' });
  });

  it('installs validated declarative app packages without native execution', async () => {
    await service.users.create({
      username: 'alex',
      displayName: 'Alex Rivera',
      password: 'a-strong-password',
    });
    const output = await service.registry.command(['install', 'focus-timer']);
    expect(output).toMatch(/Installed Focus Timer/);
    expect(service.applications.get('community.nexos.focus-timer').builtin).toBe(false);
  });

  it('encrypts user file content at rest and unlocks it with the account password', async () => {
    const user = await service.users.create({
      username: 'alex',
      displayName: 'Alex Rivera',
      password: 'a-strong-password',
    });
    service.filesystem.writeFile('/home/Documents/private.txt', 'private content');

    const stored = service.database.get(
      `SELECT content, content_encrypted, content_owner_user_id
       FROM fs_nodes WHERE path=?`,
      ['/home/Documents/private.txt'],
    );
    expect(stored?.['content']).not.toBe('private content');
    expect(stored?.['content_encrypted']).toBe(1);
    expect(stored?.['content_owner_user_id']).toBe(user.id);
    expect(service.database.get('SELECT * FROM user_secrets WHERE user_id=?', [user.id])).not.toBe(
      null,
    );
    expect(service.filesystem.readFile('/home/Documents/private.txt')).toBe('private content');

    service.users.lock();
    expect(() => service.filesystem.readFile('/home/Documents/private.txt')).toThrow(/unlock/i);
    await service.users.unlock('a-strong-password');
    expect(service.filesystem.readFile('/home/Documents/private.txt')).toBe('private content');
  });

  it('hides encrypted files from other NexOS users', async () => {
    await service.users.create({
      username: 'alex',
      displayName: 'Alex Rivera',
      password: 'a-strong-password',
    });
    service.filesystem.writeFile('/home/Documents/alex-only.txt', 'owner content');

    await service.users.create({
      username: 'taylor',
      displayName: 'Taylor Morgan',
      password: 'another-strong-password',
    });

    expect(
      service.filesystem
        .readdir('/home/Documents')
        .some((node) => node.path === '/home/Documents/alex-only.txt'),
    ).toBe(false);
    expect(() => service.filesystem.stat('/home/Documents/alex-only.txt')).toThrow(/another user/i);
  });
});
