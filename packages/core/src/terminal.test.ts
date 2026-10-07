import { beforeEach, describe, expect, it } from 'vitest';

import type { FileNode, FileStat, FilesApi, SystemInformation } from '@nexos/types';

import { TerminalSession, type TerminalEnvironment } from './terminal.js';

const timestamp = '2026-01-01T00:00:00.000Z';

function parentPath(path: string): string | null {
  if (path === '/') return null;
  const parent = path.slice(0, path.lastIndexOf('/'));
  return parent || '/';
}

function fileNode(path: string, kind: FileNode['kind'], size = 0): FileNode {
  return {
    id: path,
    path,
    parentPath: parentPath(path),
    name: path === '/' ? '' : (path.split('/').at(-1) ?? ''),
    kind,
    mimeType: kind === 'file' ? 'text/plain' : null,
    size,
    encrypted: false,
    favorite: false,
    system: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    accessedAt: timestamp,
    trashedAt: null,
    originalPath: null,
  };
}

function createFilesApi(): FilesApi {
  const directories = new Set(['/', '/home', '/home/Documents']);
  const files = new Map([['/home/Documents/Welcome to NexOS.md', '# Welcome to NexOS']]);
  const requireNode = (path: string): FileNode => {
    if (directories.has(path)) return fileNode(path, 'directory');
    const content = files.get(path);
    if (content !== undefined) return fileNode(path, 'file', content.length);
    throw new Error(`Path not found: ${path}`);
  };
  return {
    readFile: async (path) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`File not found: ${path}`);
      return content;
    },
    writeFile: async (path, content) => {
      files.set(path, content);
      return fileNode(path, 'file', content.length);
    },
    mkdir: async (path) => {
      directories.add(path);
      return fileNode(path, 'directory');
    },
    readdir: async (path) => [
      ...[...directories]
        .filter((candidate) => candidate !== path && parentPath(candidate) === path)
        .map((candidate) => fileNode(candidate, 'directory')),
      ...[...files.entries()]
        .filter(([candidate]) => parentPath(candidate) === path)
        .map(([candidate, content]) => fileNode(candidate, 'file', content.length)),
    ],
    rename: async (path, newName) => {
      const parent = parentPath(path) ?? '/';
      const destination = `${parent === '/' ? '' : parent}/${newName}`;
      const content = files.get(path);
      if (content !== undefined) {
        files.delete(path);
        files.set(destination, content);
        return fileNode(destination, 'file', content.length);
      }
      directories.delete(path);
      directories.add(destination);
      return fileNode(destination, 'directory');
    },
    remove: async (path) => {
      files.delete(path);
      directories.delete(path);
    },
    restore: async (path) => requireNode(path),
    copy: async (source, destination) => {
      const content = files.get(source);
      if (content === undefined) throw new Error(`File not found: ${source}`);
      files.set(destination, content);
      return fileNode(destination, 'file', content.length);
    },
    move: async (source, destination) => {
      const content = files.get(source);
      if (content === undefined) throw new Error(`File not found: ${source}`);
      files.delete(source);
      files.set(destination, content);
      return fileNode(destination, 'file', content.length);
    },
    stat: async (path): Promise<FileStat> => ({
      ...requireNode(path),
      childCount: [...directories, ...files.keys()].filter(
        (candidate) => parentPath(candidate) === path,
      ).length,
    }),
    search: async (query) =>
      [...files.keys()]
        .filter((path) => path.toLowerCase().includes(query.toLowerCase()))
        .map((path) => fileNode(path, 'file', files.get(path)?.length ?? 0)),
    recent: async () => [],
    favorites: async () => [],
    setFavorite: async (path, favorite) => ({ ...requireNode(path), favorite }),
    emptyTrash: async () => undefined,
  };
}

const systemInformation: SystemInformation = {
  nexosVersion: '0.2.0',
  platform: 'test',
  release: '1',
  architecture: 'x64',
  hostname: 'nexos-test',
  cpuModel: 'Test CPU',
  cpuCount: 4,
  totalMemory: 8 * 1_073_741_824,
  freeMemory: 4 * 1_073_741_824,
  uptime: 120,
  electronVersion: '38.8.6',
  nodeVersion: process.versions.node,
  chromeVersion: 'test',
  storagePath: ':memory:',
};

describe('TerminalSession', () => {
  let terminal: TerminalSession;
  let opened: Array<{ id: string; payload?: Record<string, string> }>;

  beforeEach(() => {
    opened = [];
    const environment: TerminalEnvironment = {
      files: createFilesApi(),
      listApplications: async () => [
        {
          id: 'com.nexos.text-editor',
          name: 'Text Editor',
          description: 'Edit text files.',
          version: '1.0.0',
          icon: 'file-text',
          entry: 'text-editor',
          runtime: 'builtin',
          permissions: ['filesystem.read', 'filesystem.write'],
          singleInstance: false,
          system: false,
          defaultWidth: 800,
          defaultHeight: 600,
          fileExtensions: ['.txt', '.md'],
        },
      ],
      listProcesses: async () => [],
      stopProcess: async () => undefined,
      systemInformation: async () => systemInformation,
      currentUser: async () => ({
        id: 'user-1',
        username: 'alex',
        displayName: 'Alex Rivera',
        avatar: null,
        createdAt: timestamp,
        lastLoginAt: timestamp,
      }),
      openApplication: async (id, payload) => {
        opened.push(payload ? { id, payload } : { id });
      },
      power: async () => undefined,
      packageCommand: async (arguments_) => `nx:${arguments_.join(':')}`,
    };
    terminal = new TerminalSession(environment);
  });

  it('parses quoted text and performs real filesystem commands', async () => {
    await terminal.execute('cd Documents');
    await terminal.execute('mkdir project');
    await terminal.execute('cd project');
    await terminal.execute('echo "hello NexOS" > readme.txt');

    await expect(terminal.execute('cat readme.txt')).resolves.toEqual({
      output: 'hello NexOS',
      clear: false,
    });
    await expect(terminal.execute('pwd')).resolves.toMatchObject({
      output: '/home/Documents/project',
    });
  });

  it('uses file associations when opening a virtual file', async () => {
    await terminal.execute('open "/home/Documents/Welcome to NexOS.md"');
    expect(opened).toEqual([
      {
        id: 'com.nexos.text-editor',
        payload: { path: '/home/Documents/Welcome to NexOS.md' },
      },
    ]);
  });

  it('delegates nx commands through the package-manager port', async () => {
    await expect(terminal.execute('nx search notes')).resolves.toEqual({
      output: 'nx:search:notes',
      clear: false,
    });
  });
});
