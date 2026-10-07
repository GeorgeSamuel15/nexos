import { randomUUID } from 'node:crypto';

import { NexOSError } from '@nexos/core';
import type { TypedEventBus } from '@nexos/events';
import { NodeRuntimeHostAdapter, type RuntimeHostAdapter } from '@nexos/runtime';
import type {
  ClipboardRepository,
  NexOSDatabase,
  NotificationRepository,
  SettingsRepository,
} from '@nexos/storage';
import { getStorageSummary } from '@nexos/storage';
import {
  createNotificationSchema,
  defaultSettings,
  nexAIActionSchema,
  settingsUpdateSchema,
  type AppManifest,
  type ClipboardEntry,
  type CreateNotificationInput,
  type NexAIAction,
  type NexAIMessage,
  type NexOSSettings,
  type NotificationRecord,
  type SearchResult,
  type StorageInformation,
  type SystemInformation,
} from '@nexos/types';

import type { ApplicationService } from './application-service.js';
import { validateRegistryUrl } from './registry-service.js';
import type { UserService } from './user-service.js';
import type { VirtualFileSystem } from '@nexos/filesystem';

export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly users: UserService,
  ) {}

  get(): NexOSSettings {
    const user = this.users.requireActive();
    const stored = this.repository.get(user.id) ?? defaultSettings;
    return { ...defaultSettings, ...stored };
  }

  update(update: Partial<NexOSSettings>): NexOSSettings {
    const validated = settingsUpdateSchema.parse(update);
    if (validated.registryUrl) validateRegistryUrl(validated.registryUrl);
    const user = this.users.requireActive();
    const current = this.get();
    const next: NexOSSettings = {
      theme: validated.theme ?? current.theme,
      accent: validated.accent ?? current.accent,
      wallpaper: validated.wallpaper ?? current.wallpaper,
      taskbarPosition: validated.taskbarPosition ?? current.taskbarPosition,
      taskbarCompact: validated.taskbarCompact ?? current.taskbarCompact,
      reduceMotion: validated.reduceMotion ?? current.reduceMotion,
      clipboardHistory: validated.clipboardHistory ?? current.clipboardHistory,
      notificationsEnabled: validated.notificationsEnabled ?? current.notificationsEnabled,
      registryEnabled: validated.registryEnabled ?? current.registryEnabled,
      registryUrl: validated.registryUrl ?? current.registryUrl,
    };
    this.repository.set(user.id, next);
    return next;
  }
}

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly users: UserService,
    private readonly events: TypedEventBus,
    private readonly settings: SettingsService,
  ) {}

  list(): NotificationRecord[] {
    return this.repository.list(this.users.requireActive().id);
  }

  show(input: CreateNotificationInput): NotificationRecord {
    const validated = createNotificationSchema.parse(input);
    const user = this.users.requireActive();
    const notification: NotificationRecord = {
      id: randomUUID(),
      applicationId: validated.applicationId,
      title: validated.title,
      message: validated.message,
      createdAt: new Date().toISOString(),
      read: false,
      dismissed: false,
    };
    this.repository.add(user.id, notification);
    if (this.settings.get().notificationsEnabled) {
      this.events.emit('notification:created', { notification });
    }
    return notification;
  }

  markRead(id: string): void {
    this.repository.markRead(this.users.requireActive().id, id);
  }

  dismiss(id: string): void {
    this.repository.dismiss(this.users.requireActive().id, id);
  }

  dismissAll(): void {
    this.repository.dismissAll(this.users.requireActive().id);
  }
}

export class ClipboardHistoryService {
  constructor(
    private readonly repository: ClipboardRepository,
    private readonly users: UserService,
    private readonly settings: SettingsService,
  ) {}

  history(): ClipboardEntry[] {
    if (!this.settings.get().clipboardHistory) return [];
    return this.repository.list(this.users.requireActive().id);
  }

  record(text: string): void {
    if (!text || !this.settings.get().clipboardHistory) return;
    const entry: ClipboardEntry = {
      id: randomUUID(),
      text: text.slice(0, 100_000),
      createdAt: new Date().toISOString(),
    };
    this.repository.add(this.users.requireActive().id, entry);
  }

  clear(): void {
    this.repository.clear(this.users.requireActive().id);
  }
}

const settingSearchEntries = [
  ['appearance', 'Appearance', 'Theme, accent and visual preferences'],
  ['personalization', 'Personalization', 'Wallpaper and desktop preferences'],
  ['applications', 'Applications', 'Installed apps and defaults'],
  ['accounts', 'Accounts', 'Users and sign-in'],
  ['privacy', 'Privacy', 'Clipboard and data controls'],
  ['security', 'Security', 'Permissions and protection'],
  ['storage', 'Storage', 'Files and recycle bin'],
  ['notifications', 'Notifications', 'Alerts and notification history'],
  ['keyboard', 'Keyboard', 'Shortcuts and input'],
  ['about', 'About NexOS', 'Version and runtime information'],
] as const;

const commandSearchEntries = [
  ['lock', 'Lock NexOS', 'Secure the current session'],
  ['shutdown', 'Shut down', 'Close NexOS safely'],
  ['restart', 'Restart NexOS', 'Restart the desktop runtime'],
  ['terminal', 'Open Terminal', 'Run a NexOS command'],
] as const;

export class SearchService {
  constructor(
    private readonly applications: ApplicationService,
    private readonly filesystem: VirtualFileSystem,
  ) {}

  query(input: string): SearchResult[] {
    const query = input.trim().toLowerCase();
    if (!query) return [];
    const apps: SearchResult[] = this.applications
      .manifests()
      .filter(
        (app) =>
          app.id !== 'com.nexos.shell' &&
          `${app.name} ${app.description}`.toLowerCase().includes(query),
      )
      .map((app) => ({
        id: app.id,
        type: 'application',
        title: app.name,
        subtitle: app.description,
        icon: app.icon,
        action: `app:${app.id}`,
      }));
    const files: SearchResult[] = this.filesystem
      .search(query)
      .slice(0, 12)
      .map((file) => ({
        id: file.id,
        type: 'file',
        title: file.name,
        subtitle: file.path,
        icon: file.kind === 'directory' ? 'folder' : 'file',
        action: `file:${file.path}`,
      }));
    const settings: SearchResult[] = settingSearchEntries
      .filter((entry) => entry.join(' ').toLowerCase().includes(query))
      .map(([id, title, subtitle]) => ({
        id: `setting-${id}`,
        type: 'setting',
        title,
        subtitle,
        icon: 'settings',
        action: `setting:${id}`,
      }));
    const commands: SearchResult[] = commandSearchEntries
      .filter((entry) => entry.join(' ').toLowerCase().includes(query))
      .map(([id, title, subtitle]) => ({
        id: `command-${id}`,
        type: 'command',
        title,
        subtitle,
        icon: 'command',
        action: `command:${id}`,
      }));
    return [...apps, ...files, ...settings, ...commands].slice(0, 30);
  }
}

export class SystemInformationService {
  constructor(
    private readonly database: NexOSDatabase,
    private readonly storagePath: string,
    private readonly runtime: RuntimeHostAdapter = new NodeRuntimeHostAdapter(),
  ) {}

  information(): SystemInformation {
    const snapshot = this.runtime.systemInformation();
    return {
      nexosVersion: '0.2.0',
      ...snapshot,
      storagePath: this.storagePath,
    };
  }

  storage(): StorageInformation {
    return {
      databaseBytes: this.database.sizeBytes(),
      ...getStorageSummary(this.database),
    };
  }
}

export class NexAIService {
  constructor(private readonly applications: ApplicationService) {}

  chat(input: string): NexAIMessage {
    const message = input.trim();
    if (!message) throw new NexOSError('INVALID_INPUT', 'Enter a message for NexAI.');
    const lower = message.toLowerCase();
    let content =
      'I can open applications, help find files, explain settings, or suggest safe troubleshooting steps. What would you like to do?';
    let proposedAction: NexAIAction | null = null;

    if (lower.includes('open')) {
      const application = this.applications
        .manifests()
        .find(
          (app) =>
            lower.includes(app.name.toLowerCase()) ||
            lower.includes(app.id.split('.').at(-1) ?? ''),
        );
      if (application) {
        content = `I can open ${application.name} for you.`;
        proposedAction = {
          id: randomUUID(),
          tool: 'apps.open',
          description: `Open ${application.name}`,
          destructive: false,
          arguments: { applicationId: application.id },
        };
      }
    } else if (lower.includes('find') || lower.includes('search')) {
      const query = message.replace(/^(find|search(?: for)?)\s+/i, '').trim();
      content = `I can search NexOS files for “${query || message}”.`;
      proposedAction = {
        id: randomUUID(),
        tool: 'files.search',
        description: `Search files for ${query || message}`,
        destructive: false,
        arguments: { query: query || message },
      };
    } else if (
      lower.includes('setting') ||
      lower.includes('theme') ||
      lower.includes('wallpaper')
    ) {
      content = 'I can open the relevant NexOS Settings section.';
      proposedAction = {
        id: randomUUID(),
        tool: 'settings.open',
        description: 'Open NexOS Settings',
        destructive: false,
        arguments: { section: lower.includes('theme') ? 'appearance' : 'system' },
      };
    } else if (lower.includes('lock')) {
      content = 'Locking hides your desktop and requires your password to return.';
      proposedAction = {
        id: randomUUID(),
        tool: 'system.lock',
        description: 'Lock NexOS',
        destructive: false,
        arguments: {},
      };
    }

    return {
      id: randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      proposedAction,
    };
  }

  validateAction(action: NexAIAction): NexAIAction {
    return nexAIActionSchema.parse(action);
  }
}

export function manifestsOnly(applications: ReturnType<ApplicationService['list']>): AppManifest[] {
  return applications.map((application) => application.manifest);
}
