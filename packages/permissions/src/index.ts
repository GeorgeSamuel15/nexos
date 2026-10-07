import { NexOSError } from '@nexos/core';
import type { AppManifest, Permission, PermissionGrant } from '@nexos/types';

export interface PermissionStore {
  list(userId: string, applicationId: string): PermissionGrant[];
  get(userId: string, applicationId: string, permission: Permission): PermissionGrant | null;
  set(grant: PermissionGrant): void;
}

export interface PermissionContext {
  currentUserId(): string | null;
  application(applicationId: string): AppManifest | null;
}

const sensitivePermissions = new Set<Permission>([
  'camera',
  'microphone',
  'network',
  'system.settings',
  'process.kill',
  'clipboard',
  'filesystem.write',
]);

export class PermissionService {
  constructor(
    private readonly store: PermissionStore,
    private readonly context: PermissionContext,
  ) {}

  list(applicationId: string): PermissionGrant[] {
    return this.store.list(this.requireUser(), applicationId);
  }

  isGranted(applicationId: string, permission: Permission): boolean {
    const manifest = this.context.application(applicationId);
    if (!manifest) throw new NexOSError('APP_NOT_FOUND', `Application not found: ${applicationId}`);
    if (!manifest.permissions.includes(permission)) return false;
    if (manifest.system && !sensitivePermissions.has(permission)) return true;
    const grant = this.store.get(this.requireUser(), applicationId, permission);
    if (grant) return grant.granted;
    return manifest.system;
  }

  assert(applicationId: string, permission: Permission): void {
    if (!this.isGranted(applicationId, permission)) {
      throw new NexOSError('PERMISSION_DENIED', `${applicationId} does not have ${permission}.`, {
        applicationId,
        permission,
      });
    }
  }

  set(applicationId: string, permission: Permission, granted: boolean): void {
    const manifest = this.context.application(applicationId);
    if (!manifest) throw new NexOSError('APP_NOT_FOUND', `Application not found: ${applicationId}`);
    if (!manifest.permissions.includes(permission)) {
      throw new NexOSError('INVALID_INPUT', `${manifest.name} did not declare ${permission}.`);
    }
    this.store.set({
      userId: this.requireUser(),
      applicationId,
      permission,
      granted,
      updatedAt: new Date().toISOString(),
    });
  }

  private requireUser(): string {
    const userId = this.context.currentUserId();
    if (!userId)
      throw new NexOSError('AUTH_REQUIRED', 'Sign in to manage application permissions.');
    return userId;
  }
}
