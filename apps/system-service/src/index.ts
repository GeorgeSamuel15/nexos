import { join } from 'node:path';

import { NexOSError } from '@nexos/core';
import { TypedEventBus } from '@nexos/events';
import { VirtualFileSystem } from '@nexos/filesystem';
import { PermissionService } from '@nexos/permissions';
import { ProcessManager } from '@nexos/process-manager';
import {
  ApplicationRepository,
  ClipboardRepository,
  FileRepository,
  NexOSDatabase,
  NotificationRepository,
  PermissionRepository,
  SettingsRepository,
  UserSecretRepository,
  UserRepository,
} from '@nexos/storage';
import {
  defaultSettings,
  type BootProgress,
  type BootResult,
  type NexAIAction,
  type Permission,
} from '@nexos/types';

import { ApplicationService } from './application-service.js';
import { UserFileContentProtection } from './content-protection.js';
import { PackageRegistryService } from './registry-service.js';
import {
  ClipboardHistoryService,
  NexAIService,
  NotificationService,
  SearchService,
  SettingsService,
  SystemInformationService,
  manifestsOnly,
} from './services.js';
import { UserService } from './user-service.js';

export interface NexOSSystemServiceOptions {
  dataDirectory: string;
  databasePath?: string;
  onBootProgress?(progress: BootProgress): void;
}

export class NexOSSystemService {
  readonly events = new TypedEventBus();
  readonly database: NexOSDatabase;
  readonly processes = new ProcessManager(this.events);
  readonly users: UserService;
  readonly filesystem: VirtualFileSystem;
  readonly applications: ApplicationService;
  readonly registry: PackageRegistryService;
  readonly permissions: PermissionService;
  readonly settings: SettingsService;
  readonly notifications: NotificationService;
  readonly clipboard: ClipboardHistoryService;
  readonly search: SearchService;
  readonly systemInformation: SystemInformationService;
  readonly ai: NexAIService;

  #initialized = false;
  readonly #onBootProgress: (progress: BootProgress) => void;

  constructor(options: NexOSSystemServiceOptions) {
    const databasePath = options.databasePath ?? join(options.dataDirectory, 'nexos.sqlite');
    this.database = new NexOSDatabase(databasePath);
    this.#onBootProgress = options.onBootProgress ?? (() => undefined);

    const users = new UserRepository(this.database);
    const settings = new SettingsRepository(this.database);
    const applications = new ApplicationRepository(this.database);
    const permissions = new PermissionRepository(this.database);

    this.users = new UserService(
      users,
      settings,
      new UserSecretRepository(this.database),
      this.events,
    );
    this.filesystem = new VirtualFileSystem(
      new FileRepository(this.database),
      this.events,
      new UserFileContentProtection(this.users),
    );
    this.applications = new ApplicationService(applications, this.processes);
    this.permissions = new PermissionService(permissions, {
      currentUserId: () => this.users.currentUserId(),
      application: (applicationId) => this.applications.getManifest(applicationId),
    });
    this.settings = new SettingsService(settings, this.users);
    this.registry = new PackageRegistryService(this.applications, this.settings);
    this.notifications = new NotificationService(
      new NotificationRepository(this.database),
      this.users,
      this.events,
      this.settings,
    );
    this.clipboard = new ClipboardHistoryService(
      new ClipboardRepository(this.database),
      this.users,
      this.settings,
    );
    this.search = new SearchService(this.applications, this.filesystem);
    this.systemInformation = new SystemInformationService(this.database, databasePath);
    this.ai = new NexAIService(this.applications);
  }

  initialize(): BootResult {
    if (!this.#initialized) {
      this.progress('database', 'Opening system database…', 10);
      this.database.migrate();
      this.progress('migrations', 'Applying storage migrations…', 30);
      this.filesystem.initialize();
      this.progress('filesystem', 'Mounting virtual filesystem…', 55);
      this.applications.initialize();
      this.progress('applications', 'Registering applications…', 76);
      this.#initialized = true;
    }
    const auth = this.users.state();
    this.progress('session', 'Restoring user session…', 90);
    const settings = auth.currentUser && !auth.locked ? this.settings.get() : defaultSettings;
    this.progress('ready', 'Desktop ready', 100);
    return {
      auth,
      settings,
      applications: manifestsOnly(this.applications.list()),
    };
  }

  assertActive(): void {
    this.users.requireActive();
  }

  assertPermission(applicationId: string, permission: Permission): void {
    this.users.requireActive();
    this.permissions.assert(applicationId, permission);
  }

  executeAIAction(actionInput: NexAIAction, confirmed: boolean): string {
    this.users.requireActive();
    const action = this.ai.validateAction(actionInput);
    if (action.destructive && !confirmed) {
      throw new NexOSError(
        'PERMISSION_DENIED',
        'NexAI requires explicit confirmation before destructive actions.',
      );
    }
    switch (action.tool) {
      case 'apps.open': {
        const id = action.arguments['applicationId'];
        if (!id) throw new NexOSError('INVALID_INPUT', 'NexAI did not provide an application ID.');
        this.applications.get(id);
        return `Approved opening ${id}.`;
      }
      case 'files.search': {
        const query = action.arguments['query'] ?? '';
        return `${this.filesystem.search(query).length} matching file(s) found.`;
      }
      case 'settings.open':
        return `Approved opening Settings at ${action.arguments['section'] ?? 'system'}.`;
      case 'system.lock':
        return 'Approved locking NexOS.';
      case 'files.remove': {
        const path = action.arguments['path'];
        if (!path) throw new NexOSError('INVALID_INPUT', 'NexAI did not provide a file path.');
        this.filesystem.remove(path);
        return `${path} was moved to the recycle bin.`;
      }
    }
  }

  close(): void {
    this.processes.clear();
    this.events.clear();
    this.users.dispose();
    this.database.close();
  }

  private progress(stage: BootProgress['stage'], label: string, progress: number): void {
    this.#onBootProgress({ stage, label, progress });
  }
}

export * from './application-service.js';
export * from './content-keys.js';
export * from './content-protection.js';
export * from './manifests.js';
export * from './package-trust.js';
export * from './registry-service.js';
export * from './services.js';
export * from './user-service.js';
