import { posix } from 'node:path';
import { randomUUID } from 'node:crypto';

import { NexOSError } from '@nexos/core';
import type { TypedEventBus } from '@nexos/events';
import type { FileNode, FileStat, FileWriteOptions } from '@nexos/types';
import type { FileRepository, StoredFileNode } from '@nexos/storage';

const defaultDirectories = [
  '/',
  '/home',
  '/home/Desktop',
  '/home/Documents',
  '/home/Downloads',
  '/home/Pictures',
  '/home/Music',
  '/home/Videos',
  '/home/.Trash',
  '/system',
  '/apps',
  '/temp',
] as const;

const protectedPaths = new Set(['/', '/system', '/apps', '/home/.Trash']);

function publicNode(node: StoredFileNode): FileNode {
  const {
    content: _content,
    contentOwnerUserId: _contentOwnerUserId,
    contentIv: _contentIv,
    contentAuthTag: _contentAuthTag,
    ...metadata
  } = node;
  void _content;
  void _contentOwnerUserId;
  void _contentIv;
  void _contentAuthTag;
  return metadata;
}

export interface ProtectedFileContent {
  content: string;
  encrypted: boolean;
  ownerUserId: string | null;
  iv: string | null;
  authTag: string | null;
}

export interface FileContentProtection {
  protect(path: string, content: string): ProtectedFileContent;
  reveal(node: StoredFileNode): string;
  assertAccess(node: StoredFileNode): void;
  canAccess(node: StoredFileNode): boolean;
}

const plaintextContentProtection: FileContentProtection = {
  protect: (_path, content) => ({
    content,
    encrypted: false,
    ownerUserId: null,
    iv: null,
    authTag: null,
  }),
  reveal: (node) => node.content ?? '',
  assertAccess: () => undefined,
  canAccess: () => true,
};

export function normalizePath(input: string): string {
  if (input.includes('\0'))
    throw new NexOSError('INVALID_INPUT', 'Paths cannot contain null bytes.');
  if (!input.startsWith('/'))
    throw new NexOSError('INVALID_INPUT', 'NexOS paths must be absolute.');
  const normalized = posix.normalize(input.replaceAll('\\', '/'));
  if (normalized.length > 1024) throw new NexOSError('INVALID_INPUT', 'Path is too long.');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

function validateName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new NexOSError('INVALID_INPUT', `Invalid file name: ${name || '(empty)'}`);
  }
  if (name.length > 255) throw new NexOSError('INVALID_INPUT', 'File name is too long.');
}

function parentPath(path: string): string | null {
  return path === '/' ? null : posix.dirname(path);
}

function baseName(path: string): string {
  return path === '/' ? '' : posix.basename(path);
}

function inferMimeType(path: string): string {
  const extension = posix.extname(path).toLowerCase();
  const types: Readonly<Record<string, string>> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };
  return types[extension] ?? 'application/octet-stream';
}

export class VirtualFileSystem {
  constructor(
    private readonly repository: FileRepository,
    private readonly events: TypedEventBus,
    private readonly contentProtection: FileContentProtection = plaintextContentProtection,
  ) {}

  initialize(): void {
    const now = new Date().toISOString();
    for (const path of defaultDirectories) {
      if (this.repository.get(path, true)) continue;
      this.repository.upsert({
        id: randomUUID(),
        path,
        parentPath: parentPath(path),
        name: baseName(path),
        kind: 'directory',
        mimeType: null,
        content: null,
        size: 0,
        encrypted: false,
        contentOwnerUserId: null,
        contentIv: null,
        contentAuthTag: null,
        favorite: path === '/home/Documents' || path === '/home/Downloads',
        system: protectedPaths.has(path),
        createdAt: now,
        updatedAt: now,
        accessedAt: now,
        trashedAt: null,
        originalPath: null,
      });
    }
    const welcomePath = '/home/Documents/Welcome to NexOS.md';
    if (!this.repository.get(welcomePath, true)) {
      this.writeFile(
        welcomePath,
        '# Welcome to NexOS\n\nNexOS is a secure TypeScript desktop environment. Open Terminal and run `help` to get started.\n',
        { create: true, overwrite: false, mimeType: 'text/markdown' },
      );
    }
  }

  readFile(inputPath: string): string {
    const path = normalizePath(inputPath);
    const node = this.requireNode(path);
    if (node.kind !== 'file') throw new NexOSError('INVALID_INPUT', `${path} is a directory.`);
    this.contentProtection.assertAccess(node);
    node.accessedAt = new Date().toISOString();
    this.repository.updateById(node);
    return this.contentProtection.reveal(node);
  }

  writeFile(inputPath: string, content: string, options: FileWriteOptions = {}): FileNode {
    const path = normalizePath(inputPath);
    if (path === '/') throw new NexOSError('PROTECTED_RESOURCE', 'Cannot write to the root node.');
    const parent = this.requireDirectory(parentPath(path)!);
    if (parent.trashedAt)
      throw new NexOSError('INVALID_INPUT', 'Cannot write inside the recycle bin.');
    const existing = this.repository.get(path, true);
    const create = options.create ?? true;
    const overwrite = options.overwrite ?? true;
    if (!existing && !create) throw new NexOSError('NOT_FOUND', `File not found: ${path}`);
    if (existing?.kind === 'directory')
      throw new NexOSError('INVALID_INPUT', `${path} is a directory.`);
    if (existing && !overwrite)
      throw new NexOSError('ALREADY_EXISTS', `File already exists: ${path}`);
    if (existing) this.contentProtection.assertAccess(existing);
    const now = new Date().toISOString();
    const protectedContent = this.contentProtection.protect(path, content);
    const node: StoredFileNode = {
      id: existing?.id ?? randomUUID(),
      path,
      parentPath: parent.path,
      name: baseName(path),
      kind: 'file',
      mimeType: options.mimeType ?? existing?.mimeType ?? inferMimeType(path),
      content: protectedContent.content,
      size: new TextEncoder().encode(content).byteLength,
      encrypted: protectedContent.encrypted,
      contentOwnerUserId: protectedContent.ownerUserId,
      contentIv: protectedContent.iv,
      contentAuthTag: protectedContent.authTag,
      favorite: existing?.favorite ?? false,
      system: existing?.system ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      accessedAt: now,
      trashedAt: null,
      originalPath: null,
    };
    this.repository.upsert(node);
    this.events.emit(
      existing ? 'file:updated' : 'file:created',
      existing ? { path } : { path, kind: 'file' },
    );
    return publicNode(node);
  }

  mkdir(inputPath: string): FileNode {
    const path = normalizePath(inputPath);
    if (path === '/') return publicNode(this.requireNode('/'));
    validateName(baseName(path));
    if (this.repository.get(path, true))
      throw new NexOSError('ALREADY_EXISTS', `Path already exists: ${path}`);
    const parent = this.requireDirectory(parentPath(path)!);
    const now = new Date().toISOString();
    const node: StoredFileNode = {
      id: randomUUID(),
      path,
      parentPath: parent.path,
      name: baseName(path),
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
    this.repository.upsert(node);
    this.events.emit('file:created', { path, kind: 'directory' });
    return publicNode(node);
  }

  readdir(inputPath: string, includeTrashed = false): FileNode[] {
    const path = normalizePath(inputPath);
    this.requireDirectory(path, includeTrashed);
    return this.repository
      .listChildren(path, includeTrashed)
      .filter((node) => this.contentProtection.canAccess(node))
      .map(publicNode);
  }

  stat(inputPath: string): FileStat {
    const node = this.requireNode(normalizePath(inputPath), true);
    this.contentProtection.assertAccess(node);
    return {
      ...publicNode(node),
      childCount:
        node.kind === 'directory' ? this.repository.listChildren(node.path, true).length : 0,
    };
  }

  rename(inputPath: string, newName: string): FileNode {
    validateName(newName);
    const path = normalizePath(inputPath);
    const destination = normalizePath(`${parentPath(path) ?? '/'}/${newName}`);
    return this.relocate(path, destination);
  }

  move(sourceInput: string, destinationInput: string): FileNode {
    return this.relocate(normalizePath(sourceInput), normalizePath(destinationInput));
  }

  copy(sourceInput: string, destinationInput: string): FileNode {
    const source = normalizePath(sourceInput);
    const destination = normalizePath(destinationInput);
    const root = this.requireNode(source);
    this.assertWritable(root);
    if (destination.startsWith(`${source}/`))
      throw new NexOSError('INVALID_INPUT', 'Cannot copy a directory into itself.');
    if (this.repository.get(destination, true))
      throw new NexOSError('ALREADY_EXISTS', `Destination already exists: ${destination}`);
    this.requireDirectory(parentPath(destination)!);
    const nodes = [root, ...this.repository.listDescendants(source)];
    for (const node of nodes) this.contentProtection.assertAccess(node);
    let copiedRoot: StoredFileNode | null = null;
    this.repository.transaction(() => {
      for (const node of nodes) {
        const targetPath =
          node.path === source ? destination : `${destination}${node.path.slice(source.length)}`;
        const now = new Date().toISOString();
        const copy: StoredFileNode = {
          ...node,
          id: randomUUID(),
          path: targetPath,
          parentPath: parentPath(targetPath),
          name: baseName(targetPath),
          favorite: false,
          system: false,
          createdAt: now,
          updatedAt: now,
          accessedAt: now,
          trashedAt: null,
          originalPath: null,
        };
        this.repository.upsert(copy);
        if (node.path === source) copiedRoot = copy;
      }
    });
    this.events.emit('file:created', { path: destination, kind: root.kind });
    if (!copiedRoot)
      throw new NexOSError('INTERNAL_ERROR', 'Copy operation produced no root node.');
    return publicNode(copiedRoot);
  }

  remove(inputPath: string, permanent = false): void {
    const path = normalizePath(inputPath);
    const root = this.requireNode(path, true);
    this.assertWritable(root);
    const descendants = this.repository.listDescendants(path, true);
    for (const node of [root, ...descendants]) this.contentProtection.assertAccess(node);
    if (permanent || root.trashedAt) {
      this.repository.transaction(() => {
        for (const node of [...descendants].reverse()) this.repository.deleteById(node.id);
        this.repository.deleteById(root.id);
      });
      this.events.emit('file:deleted', { path, permanent: true });
      return;
    }
    const trashPath = `/home/.Trash/${randomUUID().slice(0, 8)}-${root.name}`;
    const timestamp = new Date().toISOString();
    this.repository.transaction(() => {
      for (const node of [root, ...descendants]) {
        const oldPath = node.path;
        const nextPath =
          node.path === path ? trashPath : `${trashPath}${node.path.slice(path.length)}`;
        node.path = nextPath;
        node.parentPath = parentPath(nextPath);
        node.name = baseName(nextPath);
        node.trashedAt = timestamp;
        node.originalPath = oldPath;
        node.updatedAt = timestamp;
        this.repository.updateById(node);
      }
    });
    this.events.emit('file:deleted', { path, permanent: false });
  }

  restore(inputPath: string): FileNode {
    const path = normalizePath(inputPath);
    const root = this.requireNode(path, true);
    if (!root.trashedAt || !root.originalPath)
      throw new NexOSError('INVALID_INPUT', `${path} is not a recycle-bin item.`);
    const destination = root.originalPath;
    if (this.repository.get(destination, true))
      throw new NexOSError('ALREADY_EXISTS', `Cannot restore because ${destination} exists.`);
    this.requireDirectory(parentPath(destination)!);
    const descendants = this.repository.listDescendants(path, true);
    for (const node of [root, ...descendants]) this.contentProtection.assertAccess(node);
    const timestamp = new Date().toISOString();
    this.repository.transaction(() => {
      for (const node of [root, ...descendants]) {
        const nextPath = node.originalPath;
        if (!nextPath) throw new NexOSError('INTERNAL_ERROR', 'Missing original recycle-bin path.');
        node.path = nextPath;
        node.parentPath = parentPath(nextPath);
        node.name = baseName(nextPath);
        node.trashedAt = null;
        node.originalPath = null;
        node.updatedAt = timestamp;
        this.repository.updateById(node);
      }
    });
    return publicNode(root);
  }

  search(query: string): FileNode[] {
    const normalized = query.trim();
    return normalized
      ? this.repository
          .search(normalized)
          .filter((node) => this.contentProtection.canAccess(node))
          .map(publicNode)
      : [];
  }

  recent(limit = 20): FileNode[] {
    return this.repository
      .recent(Math.min(Math.max(limit, 1), 100))
      .filter((node) => this.contentProtection.canAccess(node))
      .map(publicNode);
  }

  favorites(): FileNode[] {
    return this.repository
      .favorites()
      .filter((node) => this.contentProtection.canAccess(node))
      .map(publicNode);
  }

  setFavorite(inputPath: string, favorite: boolean): FileNode {
    const node = this.requireNode(normalizePath(inputPath));
    this.contentProtection.assertAccess(node);
    node.favorite = favorite;
    node.updatedAt = new Date().toISOString();
    this.repository.updateById(node);
    this.events.emit('file:updated', { path: node.path });
    return publicNode(node);
  }

  emptyTrash(): void {
    const nodes = this.repository
      .trashed()
      .filter((node) => this.contentProtection.canAccess(node));
    this.repository.transaction(() => {
      for (const node of [...nodes].sort((a, b) => b.path.length - a.path.length)) {
        this.repository.deleteById(node.id);
      }
    });
  }

  private relocate(source: string, destination: string): FileNode {
    const root = this.requireNode(source);
    this.assertWritable(root);
    validateName(baseName(destination));
    if (destination.startsWith(`${source}/`))
      throw new NexOSError('INVALID_INPUT', 'Cannot move a directory into itself.');
    if (this.repository.get(destination, true))
      throw new NexOSError('ALREADY_EXISTS', `Destination already exists: ${destination}`);
    this.requireDirectory(parentPath(destination)!);
    const descendants = this.repository.listDescendants(source, true);
    for (const node of [root, ...descendants]) this.contentProtection.assertAccess(node);
    const timestamp = new Date().toISOString();
    this.repository.transaction(() => {
      for (const node of [root, ...descendants]) {
        const nextPath =
          node.path === source ? destination : `${destination}${node.path.slice(source.length)}`;
        node.path = nextPath;
        node.parentPath = parentPath(nextPath);
        node.name = baseName(nextPath);
        node.updatedAt = timestamp;
        this.repository.updateById(node);
      }
    });
    this.events.emit('file:updated', { path: destination });
    return publicNode(root);
  }

  private requireNode(path: string, includeTrashed = false): StoredFileNode {
    const node = this.repository.get(path, includeTrashed);
    if (!node) throw new NexOSError('NOT_FOUND', `Path not found: ${path}`);
    return node;
  }

  private requireDirectory(path: string, includeTrashed = false): StoredFileNode {
    const node = this.requireNode(path, includeTrashed);
    if (node.kind !== 'directory')
      throw new NexOSError('INVALID_INPUT', `${path} is not a directory.`);
    return node;
  }

  private assertWritable(node: StoredFileNode): void {
    this.contentProtection.assertAccess(node);
    if (node.system || protectedPaths.has(node.path))
      throw new NexOSError('PROTECTED_RESOURCE', `${node.path} is protected by NexOS.`);
  }
}
