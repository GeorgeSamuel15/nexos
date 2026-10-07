import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TypedEventBus } from '@nexos/events';
import { FileRepository, NexOSDatabase } from '@nexos/storage';

import { VirtualFileSystem } from './index.js';

describe('VirtualFileSystem', () => {
  let database: NexOSDatabase;
  let filesystem: VirtualFileSystem;

  beforeEach(() => {
    database = new NexOSDatabase(':memory:');
    database.migrate();
    filesystem = new VirtualFileSystem(new FileRepository(database), new TypedEventBus());
    filesystem.initialize();
  });

  afterEach(() => database.close());

  it('creates, reads and updates files', () => {
    filesystem.writeFile('/home/Documents/test.txt', 'hello');
    expect(filesystem.readFile('/home/Documents/test.txt')).toBe('hello');
    filesystem.writeFile('/home/Documents/test.txt', 'updated');
    expect(filesystem.stat('/home/Documents/test.txt').size).toBe(7);
  });

  it('moves directory trees atomically', () => {
    filesystem.mkdir('/home/Documents/project');
    filesystem.writeFile('/home/Documents/project/readme.md', '# Project');
    filesystem.move('/home/Documents/project', '/home/Desktop/project');
    expect(filesystem.readFile('/home/Desktop/project/readme.md')).toBe('# Project');
    expect(() => filesystem.stat('/home/Documents/project')).toThrow(/not found/i);
  });

  it('moves files to the recycle bin and restores them', () => {
    filesystem.writeFile('/home/Documents/delete-me.txt', 'recoverable');
    filesystem.remove('/home/Documents/delete-me.txt');
    const trash = filesystem.readdir('/home/.Trash', true);
    expect(trash).toHaveLength(1);
    filesystem.restore(trash[0]!.path);
    expect(filesystem.readFile('/home/Documents/delete-me.txt')).toBe('recoverable');
  });

  it('protects system paths', () => {
    expect(() => filesystem.remove('/system', true)).toThrow(/protected/i);
  });
});
