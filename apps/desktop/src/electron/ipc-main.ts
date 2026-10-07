import { clipboard, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';

import { serializeError } from '@nexos/core';
import type { NexOSSystemService } from '@nexos/system-service';
import type { NexOSSettings, PowerAction } from '@nexos/types';

import { channels, nullInputSchema, powerActionSchema, schemas } from './ipc-contract.js';
import type { DeclarativeAppHostManager } from './declarative-app-host.js';

interface IpcSuccess<T> {
  ok: true;
  value: T;
}

interface IpcFailure {
  ok: false;
  error: ReturnType<typeof serializeError>;
}

export type IpcResponse<T> = IpcSuccess<T> | IpcFailure;

function trustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url;
  if (!url) return false;
  if (url.startsWith('file://')) return true;
  try {
    const parsed = new URL(url);
    return (
      process.env['NODE_ENV'] !== 'production' &&
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      parsed.port === '5173'
    );
  } catch {
    return false;
  }
}

function handle<Input, Output>(
  channel: string,
  schema: z.ZodType<Input>,
  operation: (input: Input, event: IpcMainInvokeEvent) => Output | Promise<Output>,
): void {
  ipcMain.handle(channel, async (event, input: unknown): Promise<IpcResponse<Output>> => {
    try {
      if (!trustedSender(event)) throw new Error('Rejected IPC call from an untrusted frame.');
      const validated = schema.parse(input);
      return { ok: true, value: await operation(validated, event) };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  });
}

function requirePermission(
  service: NexOSSystemService,
  permission:
    | 'filesystem.read'
    | 'filesystem.write'
    | 'process.read'
    | 'process.kill'
    | 'system.settings'
    | 'notifications'
    | 'clipboard',
): void {
  service.assertPermission('com.nexos.shell', permission);
}

export function registerIpcHandlers(
  service: NexOSSystemService,
  getWindow: () => BrowserWindow | null,
  appHosts: DeclarativeAppHostManager,
  power: (action: PowerAction) => Promise<void>,
): () => void {
  handle(channels.systemInitialize, nullInputSchema, () => service.initialize());
  handle(channels.systemInformation, nullInputSchema, () => {
    service.assertActive();
    return service.systemInformation.information();
  });
  handle(channels.systemStorage, nullInputSchema, () => {
    service.assertActive();
    return service.systemInformation.storage();
  });
  handle(channels.systemPower, powerActionSchema, power);

  handle(channels.usersState, nullInputSchema, () => service.users.state());
  handle(channels.usersCreate, schemas.createUser, (input) => service.users.create(input));
  handle(channels.usersLogin, schemas.login, (input) => service.users.login(input));
  handle(channels.usersLogout, nullInputSchema, () => service.users.logout());
  handle(channels.usersLock, nullInputSchema, () => service.users.lock());
  handle(channels.usersUnlock, schemas.unlock, (password) => service.users.unlock(password));
  handle(channels.usersList, nullInputSchema, () => service.users.list());

  handle(channels.filesRead, schemas.filePath, (path) => {
    requirePermission(service, 'filesystem.read');
    return service.filesystem.readFile(path);
  });
  handle(channels.filesWrite, schemas.fileWrite, ({ path, content, options }) => {
    requirePermission(service, 'filesystem.write');
    return options
      ? service.filesystem.writeFile(path, content, options)
      : service.filesystem.writeFile(path, content);
  });
  handle(channels.filesMkdir, schemas.filePath, (path) => {
    requirePermission(service, 'filesystem.write');
    return service.filesystem.mkdir(path);
  });
  handle(channels.filesReaddir, schemas.readdir, ({ path, includeTrashed }) => {
    requirePermission(service, 'filesystem.read');
    return service.filesystem.readdir(path, includeTrashed);
  });
  handle(channels.filesRename, schemas.rename, ({ path, newName }) => {
    requirePermission(service, 'filesystem.write');
    return service.filesystem.rename(path, newName);
  });
  handle(channels.filesRemove, schemas.remove, ({ path, permanent }) => {
    requirePermission(service, 'filesystem.write');
    return service.filesystem.remove(path, permanent);
  });
  handle(channels.filesRestore, schemas.filePath, (path) => {
    requirePermission(service, 'filesystem.write');
    return service.filesystem.restore(path);
  });
  handle(channels.filesCopy, schemas.transfer, ({ source, destination }) => {
    requirePermission(service, 'filesystem.write');
    return service.filesystem.copy(source, destination);
  });
  handle(channels.filesMove, schemas.transfer, ({ source, destination }) => {
    requirePermission(service, 'filesystem.write');
    return service.filesystem.move(source, destination);
  });
  handle(channels.filesStat, schemas.filePath, (path) => {
    requirePermission(service, 'filesystem.read');
    return service.filesystem.stat(path);
  });
  handle(channels.filesSearch, schemas.search, (query) => {
    requirePermission(service, 'filesystem.read');
    return service.filesystem.search(query);
  });
  handle(channels.filesRecent, schemas.recent, (limit) => {
    requirePermission(service, 'filesystem.read');
    return service.filesystem.recent(limit);
  });
  handle(channels.filesFavorites, nullInputSchema, () => {
    requirePermission(service, 'filesystem.read');
    return service.filesystem.favorites();
  });
  handle(channels.filesSetFavorite, schemas.favorite, ({ path, favorite }) => {
    requirePermission(service, 'filesystem.write');
    return service.filesystem.setFavorite(path, favorite);
  });
  handle(channels.filesEmptyTrash, nullInputSchema, () => {
    requirePermission(service, 'filesystem.write');
    return service.filesystem.emptyTrash();
  });

  handle(channels.appsList, nullInputSchema, () => {
    service.assertActive();
    return service.applications.list();
  });
  handle(channels.appsGet, schemas.applicationId, (applicationId) => {
    service.assertActive();
    return service.applications.get(applicationId);
  });
  handle(channels.appsLaunch, schemas.applicationId, (applicationId) => {
    service.assertActive();
    return service.applications.launch(applicationId);
  });
  handle(channels.appsClose, schemas.pid, (pid) => service.applications.close(pid));
  handle(channels.appsInstall, schemas.bytes, (bytes) => {
    requirePermission(service, 'system.settings');
    return service.applications.installPackage(bytes);
  });
  handle(channels.appsUninstall, schemas.applicationId, (applicationId) => {
    requirePermission(service, 'system.settings');
    return service.applications.uninstall(applicationId);
  });
  handle(channels.appsPackageInfo, schemas.bytes, (bytes) => {
    service.assertActive();
    return service.applications.packageInfo(bytes);
  });
  handle(channels.appsRegistryStatus, nullInputSchema, () => {
    service.assertActive();
    return service.registry.status();
  });
  handle(channels.appsRegistrySearch, schemas.search, (query) => {
    service.assertActive();
    return service.registry.search(query);
  });
  handle(channels.appsRegistryInstall, schemas.packageName, (packageName) => {
    requirePermission(service, 'system.settings');
    return service.registry.install(packageName);
  });
  handle(channels.appsPackageCommand, schemas.packageCommand, (arguments_) => {
    service.assertActive();
    return service.registry.command(arguments_);
  });

  handle(channels.windowsHostMount, schemas.hostMount, async (input) => {
    service.assertActive();
    await appHosts.mount(input);
  });
  handle(channels.windowsHostUpdate, schemas.hostUpdate, (input) => appHosts.update(input));
  handle(channels.windowsHostUnmount, schemas.uuid, (windowId) => appHosts.destroy(windowId));
  handle(channels.windowsHostFocus, schemas.uuid, (windowId) => appHosts.focus(windowId));

  handle(channels.processesList, nullInputSchema, () => {
    requirePermission(service, 'process.read');
    return service.processes.list();
  });
  handle(channels.processesGet, schemas.pid, (pid) => {
    requirePermission(service, 'process.read');
    return service.processes.get(pid);
  });
  handle(channels.processesStop, schemas.pid, (pid) => {
    requirePermission(service, 'process.kill');
    return service.processes.stop(pid);
  });

  handle(channels.settingsGet, nullInputSchema, () => service.settings.get());
  handle(channels.settingsUpdate, schemas.settings, (update) => {
    requirePermission(service, 'system.settings');
    const cleaned = Object.fromEntries(
      Object.entries(update).filter((entry) => entry[1] !== undefined),
    ) as Partial<NexOSSettings>;
    return service.settings.update(cleaned);
  });

  handle(channels.notificationsList, nullInputSchema, () => service.notifications.list());
  handle(channels.notificationsShow, schemas.notification, (input) => {
    requirePermission(service, 'notifications');
    return service.notifications.show(input);
  });
  handle(channels.notificationsRead, schemas.uuid, (id) => service.notifications.markRead(id));
  handle(channels.notificationsDismiss, schemas.uuid, (id) => service.notifications.dismiss(id));
  handle(channels.notificationsDismissAll, nullInputSchema, () =>
    service.notifications.dismissAll(),
  );

  handle(channels.permissionsList, schemas.applicationId, (applicationId) =>
    service.permissions.list(applicationId),
  );
  handle(channels.permissionsRequest, schemas.permissionRequest, async (request) => {
    service.assertActive();
    if (service.permissions.isGranted(request.applicationId, request.permission)) return true;
    const window = getWindow();
    if (!window) return false;
    const result = await dialog.showMessageBox(window, {
      type: 'question',
      buttons: ['Deny', 'Allow'],
      defaultId: 0,
      cancelId: 0,
      title: 'NexOS permission request',
      message: `${request.applicationName} wants ${request.permission}`,
      detail: request.reason,
      noLink: true,
    });
    const granted = result.response === 1;
    service.permissions.set(request.applicationId, request.permission, granted);
    return granted;
  });
  handle(
    channels.permissionsSet,
    schemas.permissionSet,
    ({ applicationId, permission, granted }) => {
      requirePermission(service, 'system.settings');
      return service.permissions.set(applicationId, permission, granted);
    },
  );

  handle(channels.clipboardRead, nullInputSchema, () => {
    requirePermission(service, 'clipboard');
    const value = clipboard.readText();
    service.clipboard.record(value);
    return value;
  });
  handle(channels.clipboardWrite, schemas.clipboardText, (value) => {
    requirePermission(service, 'clipboard');
    clipboard.writeText(value);
    service.clipboard.record(value);
  });
  handle(channels.clipboardHistory, nullInputSchema, () => {
    requirePermission(service, 'clipboard');
    return service.clipboard.history();
  });
  handle(channels.clipboardClear, nullInputSchema, () => {
    requirePermission(service, 'clipboard');
    return service.clipboard.clear();
  });

  handle(channels.searchQuery, schemas.search, (query) => {
    service.assertActive();
    return service.search.query(query);
  });
  handle(channels.aiChat, schemas.aiMessage, (message) => {
    service.assertActive();
    return service.ai.chat(message);
  });
  handle(channels.aiExecute, schemas.aiExecute, ({ action, confirmed }) =>
    service.executeAIAction(action, confirmed),
  );

  const unsubscribeNotification = service.events.on('notification:created', ({ notification }) =>
    getWindow()?.webContents.send(channels.notificationCreated, notification),
  );

  return () => {
    unsubscribeNotification();
    for (const channel of Object.values(channels)) ipcMain.removeHandler(channel);
  };
}
