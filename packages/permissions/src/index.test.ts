import { describe, expect, it } from 'vitest';

import type { AppManifest, Permission, PermissionGrant } from '@nexos/types';

import { PermissionService, type PermissionStore } from './index.js';

const applications: Readonly<Record<string, AppManifest>> = {
  'dev.example.notes': {
    id: 'dev.example.notes',
    name: 'Example Notes',
    description: 'Permission test application.',
    version: '1.0.0',
    icon: 'notebook',
    entry: 'notes',
    runtime: 'builtin',
    permissions: ['filesystem.read', 'filesystem.write'],
    singleInstance: true,
    system: false,
    defaultWidth: 640,
    defaultHeight: 480,
    fileExtensions: ['.note'],
  },
  'com.nexos.system-test': {
    id: 'com.nexos.system-test',
    name: 'System Test',
    description: 'Trusted system permission test application.',
    version: '1.0.0',
    icon: 'settings',
    entry: 'system-test',
    runtime: 'builtin',
    permissions: ['filesystem.read', 'filesystem.write'],
    singleInstance: true,
    system: true,
    defaultWidth: 640,
    defaultHeight: 480,
    fileExtensions: [],
  },
};

function createPermissionService(): PermissionService {
  const grants = new Map<string, PermissionGrant>();
  const key = (userId: string, applicationId: string, permission: Permission): string =>
    `${userId}:${applicationId}:${permission}`;
  const store: PermissionStore = {
    list: (userId, applicationId) =>
      [...grants.values()].filter(
        (grant) => grant.userId === userId && grant.applicationId === applicationId,
      ),
    get: (userId, applicationId, permission) =>
      grants.get(key(userId, applicationId, permission)) ?? null,
    set: (grant) => grants.set(key(grant.userId, grant.applicationId, grant.permission), grant),
  };
  return new PermissionService(store, {
    currentUserId: () => 'user-1',
    application: (applicationId) => applications[applicationId] ?? null,
  });
}

describe('PermissionService', () => {
  it('requires a grant for a sensitive third-party capability', () => {
    const permissions = createPermissionService();
    expect(permissions.isGranted('dev.example.notes', 'filesystem.write')).toBe(false);

    permissions.set('dev.example.notes', 'filesystem.write', true);

    expect(permissions.isGranted('dev.example.notes', 'filesystem.write')).toBe(true);
  });

  it('rejects capabilities absent from the manifest', () => {
    const permissions = createPermissionService();
    expect(() => permissions.set('dev.example.notes', 'clipboard', true)).toThrow(
      /did not declare/i,
    );
    expect(permissions.isGranted('dev.example.notes', 'clipboard')).toBe(false);
  });

  it('allows declared system capabilities and honors explicit sensitive denials', () => {
    const permissions = createPermissionService();
    expect(permissions.isGranted('com.nexos.system-test', 'filesystem.read')).toBe(true);
    expect(permissions.isGranted('com.nexos.system-test', 'filesystem.write')).toBe(true);
    permissions.set('com.nexos.system-test', 'filesystem.write', false);
    expect(permissions.isGranted('com.nexos.system-test', 'filesystem.write')).toBe(false);
  });
});
