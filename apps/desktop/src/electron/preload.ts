import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type {
  AppLaunchResult,
  AuthState,
  BootProgress,
  BootResult,
  ClipboardEntry,
  CreateNotificationInput,
  CreateUserInput,
  DeclarativeAppHostInput,
  DeclarativeAppHostUpdate,
  FileNode,
  FileStat,
  FileWriteOptions,
  InstalledApplication,
  LoginInput,
  NexAIAction,
  NexAIMessage,
  NexOSBridge,
  NexOSSettings,
  NotificationRecord,
  PackageInspection,
  Permission,
  PermissionGrant,
  PermissionRequest,
  PowerAction,
  ProcessInfo,
  RegistryPackageSummary,
  RegistryStatus,
  SearchResult,
  StorageInformation,
  SystemInformation,
  UserProfile,
} from '@nexos/types';

import { channels } from './ipc-contract.js';

interface BridgeErrorShape {
  name: string;
  code: string;
  message: string;
  details: Readonly<Record<string, string>>;
}

interface IpcSuccess {
  ok: true;
  value: unknown;
}

interface IpcFailure {
  ok: false;
  error: BridgeErrorShape;
}

function isResponse(value: unknown): value is IpcSuccess | IpcFailure {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

async function invoke<T>(channel: string, input: unknown = null): Promise<T> {
  const response: unknown = await ipcRenderer.invoke(channel, input);
  if (!isResponse(response)) throw new Error('NexOS received an invalid IPC response.');
  if (!response.ok) {
    const error = new Error(response.error.message);
    error.name = response.error.name;
    Object.assign(error, { code: response.error.code, details: response.error.details });
    throw error;
  }
  return response.value as T;
}

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: NexOSBridge = {
  system: {
    initialize: () => invoke<BootResult>(channels.systemInitialize),
    information: () => invoke<SystemInformation>(channels.systemInformation),
    storage: () => invoke<StorageInformation>(channels.systemStorage),
    power: (action: PowerAction) => invoke<void>(channels.systemPower, action),
    onBootProgress: (callback: (progress: BootProgress) => void) =>
      subscribe(channels.systemBootProgress, callback),
  },
  users: {
    state: () => invoke<AuthState>(channels.usersState),
    create: (input: CreateUserInput) => invoke<UserProfile>(channels.usersCreate, input),
    login: (input: LoginInput) => invoke<UserProfile>(channels.usersLogin, input),
    logout: () => invoke<void>(channels.usersLogout),
    lock: () => invoke<void>(channels.usersLock),
    unlock: (password: string) => invoke<UserProfile>(channels.usersUnlock, password),
    list: () => invoke<UserProfile[]>(channels.usersList),
  },
  files: {
    readFile: (path: string) => invoke<string>(channels.filesRead, path),
    writeFile: (path: string, content: string, options?: FileWriteOptions) =>
      options
        ? invoke<FileNode>(channels.filesWrite, { path, content, options })
        : invoke<FileNode>(channels.filesWrite, { path, content }),
    mkdir: (path: string) => invoke<FileNode>(channels.filesMkdir, path),
    readdir: (path: string, includeTrashed = false) =>
      invoke<FileNode[]>(channels.filesReaddir, { path, includeTrashed }),
    rename: (path: string, newName: string) =>
      invoke<FileNode>(channels.filesRename, { path, newName }),
    remove: (path: string, permanent = false) =>
      invoke<void>(channels.filesRemove, { path, permanent }),
    restore: (path: string) => invoke<FileNode>(channels.filesRestore, path),
    copy: (source: string, destination: string) =>
      invoke<FileNode>(channels.filesCopy, { source, destination }),
    move: (source: string, destination: string) =>
      invoke<FileNode>(channels.filesMove, { source, destination }),
    stat: (path: string) => invoke<FileStat>(channels.filesStat, path),
    search: (query: string) => invoke<FileNode[]>(channels.filesSearch, query),
    recent: (limit = 20) => invoke<FileNode[]>(channels.filesRecent, limit),
    favorites: () => invoke<FileNode[]>(channels.filesFavorites),
    setFavorite: (path: string, favorite: boolean) =>
      invoke<FileNode>(channels.filesSetFavorite, { path, favorite }),
    emptyTrash: () => invoke<void>(channels.filesEmptyTrash),
  },
  apps: {
    list: () => invoke<InstalledApplication[]>(channels.appsList),
    get: (applicationId: string) => invoke<InstalledApplication>(channels.appsGet, applicationId),
    launch: (applicationId: string) => invoke<AppLaunchResult>(channels.appsLaunch, applicationId),
    close: (pid: number) => invoke<void>(channels.appsClose, pid),
    installPackage: (bytes: Uint8Array) =>
      invoke<InstalledApplication>(channels.appsInstall, bytes),
    uninstall: (applicationId: string) => invoke<void>(channels.appsUninstall, applicationId),
    packageInfo: (bytes: Uint8Array) => invoke<PackageInspection>(channels.appsPackageInfo, bytes),
    registryStatus: () => invoke<RegistryStatus>(channels.appsRegistryStatus),
    registrySearch: (query: string) =>
      invoke<RegistryPackageSummary[]>(channels.appsRegistrySearch, query),
    installFromRegistry: (packageName: string) =>
      invoke<InstalledApplication>(channels.appsRegistryInstall, packageName),
    packageCommand: (arguments_: string[]) =>
      invoke<string>(channels.appsPackageCommand, arguments_),
  },
  windows: {
    mountDeclarativeHost: (input: DeclarativeAppHostInput) =>
      invoke<void>(channels.windowsHostMount, input),
    updateDeclarativeHost: (input: DeclarativeAppHostUpdate) =>
      invoke<void>(channels.windowsHostUpdate, input),
    unmountDeclarativeHost: (windowId: string) =>
      invoke<void>(channels.windowsHostUnmount, windowId),
    focusDeclarativeHost: (windowId: string) => invoke<void>(channels.windowsHostFocus, windowId),
  },
  processes: {
    list: () => invoke<ProcessInfo[]>(channels.processesList),
    get: (pid: number) => invoke<ProcessInfo>(channels.processesGet, pid),
    stop: (pid: number) => invoke<void>(channels.processesStop, pid),
  },
  settings: {
    get: () => invoke<NexOSSettings>(channels.settingsGet),
    update: (update: Partial<NexOSSettings>) =>
      invoke<NexOSSettings>(channels.settingsUpdate, update),
  },
  notifications: {
    list: () => invoke<NotificationRecord[]>(channels.notificationsList),
    show: (input: CreateNotificationInput) =>
      invoke<NotificationRecord>(channels.notificationsShow, input),
    markRead: (id: string) => invoke<void>(channels.notificationsRead, id),
    dismiss: (id: string) => invoke<void>(channels.notificationsDismiss, id),
    dismissAll: () => invoke<void>(channels.notificationsDismissAll),
    onCreated: (callback: (notification: NotificationRecord) => void) =>
      subscribe(channels.notificationCreated, callback),
  },
  permissions: {
    list: (applicationId: string) =>
      invoke<PermissionGrant[]>(channels.permissionsList, applicationId),
    request: (permission: PermissionRequest) =>
      invoke<boolean>(channels.permissionsRequest, permission),
    set: (applicationId: string, permission: Permission, granted: boolean) =>
      invoke<void>(channels.permissionsSet, { applicationId, permission, granted }),
  },
  clipboard: {
    readText: () => invoke<string>(channels.clipboardRead),
    writeText: (text: string) => invoke<void>(channels.clipboardWrite, text),
    history: () => invoke<ClipboardEntry[]>(channels.clipboardHistory),
    clearHistory: () => invoke<void>(channels.clipboardClear),
  },
  search: {
    query: (query: string) => invoke<SearchResult[]>(channels.searchQuery, query),
  },
  ai: {
    chat: (message: string) => invoke<NexAIMessage>(channels.aiChat, message),
    execute: (action: NexAIAction, confirmed: boolean) =>
      invoke<string>(channels.aiExecute, { action, confirmed }),
  },
};

contextBridge.exposeInMainWorld('nexos', bridge);
