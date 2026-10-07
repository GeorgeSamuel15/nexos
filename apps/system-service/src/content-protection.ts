import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { NexOSError } from '@nexos/core';
import type { FileContentProtection, ProtectedFileContent } from '@nexos/filesystem';
import type { StoredFileNode } from '@nexos/storage';

import type { UserService } from './user-service.js';

function additionalData(userId: string): Buffer {
  return Buffer.from(`nexos:file-content:v1:${userId}`, 'utf8');
}

function shouldEncrypt(path: string): boolean {
  return path === '/home' || path.startsWith('/home/');
}

export class UserFileContentProtection implements FileContentProtection {
  constructor(private readonly users: UserService) {}

  protect(path: string, content: string): ProtectedFileContent {
    if (!shouldEncrypt(path) || !this.users.currentUserId()) {
      return { content, encrypted: false, ownerUserId: null, iv: null, authTag: null };
    }
    const user = this.users.requireActive();
    const key = this.users.contentKey();
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(additionalData(user.id));
      const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]).toString(
        'base64',
      );
      return {
        content: encrypted,
        encrypted: true,
        ownerUserId: user.id,
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
      };
    } finally {
      key.fill(0);
    }
  }

  reveal(node: StoredFileNode): string {
    if (!node.encrypted) return node.content ?? '';
    this.assertAccess(node);
    const ownerUserId = node.contentOwnerUserId;
    if (!ownerUserId || !node.contentIv || !node.contentAuthTag || node.content === null) {
      throw new NexOSError('INTERNAL_ERROR', `Encrypted metadata is incomplete for ${node.path}.`);
    }
    const key = this.users.contentKey();
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(node.contentIv, 'base64'));
      decipher.setAAD(additionalData(ownerUserId));
      decipher.setAuthTag(Buffer.from(node.contentAuthTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(node.content, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new NexOSError(
        'INTERNAL_ERROR',
        `Encrypted content could not be opened: ${node.path}`,
        {},
        { cause: error },
      );
    } finally {
      key.fill(0);
    }
  }

  assertAccess(node: StoredFileNode): void {
    if (!node.encrypted) return;
    const user = this.users.requireActive();
    if (node.contentOwnerUserId !== user.id) {
      throw new NexOSError('PERMISSION_DENIED', 'This encrypted file belongs to another user.');
    }
  }

  canAccess(node: StoredFileNode): boolean {
    return !node.encrypted || node.contentOwnerUserId === this.users.currentUserId();
  }
}
