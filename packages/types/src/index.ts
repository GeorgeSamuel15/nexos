import { z } from 'zod';

export const permissionSchema = z.enum([
  'filesystem.read',
  'filesystem.write',
  'camera',
  'microphone',
  'notifications',
  'network',
  'system.settings',
  'process.read',
  'process.kill',
  'clipboard',
]);

export type Permission = z.infer<typeof permissionSchema>;

export const appManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/),
  name: z.string().min(1).max(80),
  description: z.string().max(240).default(''),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i),
  icon: z.string().min(1).max(60),
  entry: z.string().min(1).max(120),
  runtime: z.enum(['builtin', 'declarative']).default('declarative'),
  permissions: z.array(permissionSchema).default([]),
  singleInstance: z.boolean().default(true),
  system: z.boolean().default(false),
  defaultWidth: z.number().int().min(320).max(2400).default(900),
  defaultHeight: z.number().int().min(240).max(1600).default(640),
  fileExtensions: z.array(z.string().regex(/^\.[a-z0-9]+$/i)).default([]),
});

export type AppManifest = z.infer<typeof appManifestSchema>;

export const appPublisherSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/),
  name: z.string().min(1).max(100),
  keyId: z.string().min(1).max(120),
  publicKey: z
    .string()
    .min(80)
    .max(4_096)
    .refine(
      (value) =>
        value.startsWith('-----BEGIN PUBLIC KEY-----') &&
        value.trimEnd().endsWith('-----END PUBLIC KEY-----'),
      'Publisher public key must be a PEM encoded public key',
    ),
});

export type AppPublisher = z.infer<typeof appPublisherSchema>;

export const appSignatureSchema = z.object({
  algorithm: z.literal('ed25519'),
  keyId: z.string().min(1).max(120),
  value: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .max(512),
  signedAt: z.string().datetime(),
});

export type AppSignature = z.infer<typeof appSignatureSchema>;

export type PublisherTrust = 'system' | 'verified' | 'community' | 'unsigned';

export const registryPackageSummarySchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  manifest: appManifestSchema,
  publisherName: z.string().min(1).max(100).nullable(),
  signed: z.boolean(),
});

export type RegistryPackageSummary = z.infer<typeof registryPackageSummarySchema>;

export const registrySearchResponseSchema = z.object({
  packages: z.array(registryPackageSummarySchema).max(100),
});

export interface RegistryStatus {
  enabled: boolean;
  url: string;
  mode: 'local' | 'online';
}

export const nxAppPackageSchema = z.object({
  format: z.literal('nexos-app-v1'),
  manifest: appManifestSchema.extend({ runtime: z.literal('declarative') }),
  application: z.object({
    kind: z.literal('document-viewer'),
    title: z.string().min(1).max(120),
    body: z.string().max(200_000),
  }),
  assets: z.record(z.string(), z.string()).default({}),
  publisher: appPublisherSchema.optional(),
  signature: appSignatureSchema.optional(),
});

export type NxAppPackage = z.infer<typeof nxAppPackageSchema>;

export type FileKind = 'file' | 'directory';

export interface FileNode {
  id: string;
  path: string;
  parentPath: string | null;
  name: string;
  kind: FileKind;
  mimeType: string | null;
  size: number;
  encrypted: boolean;
  favorite: boolean;
  system: boolean;
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
  trashedAt: string | null;
  originalPath: string | null;
}

export interface FileStat extends FileNode {
  childCount: number;
}

export interface FileWriteOptions {
  create?: boolean | undefined;
  overwrite?: boolean | undefined;
  mimeType?: string | undefined;
}

export type ProcessState = 'running' | 'suspended' | 'stopped' | 'crashed';

export interface ProcessInfo {
  pid: number;
  applicationId: string;
  applicationName: string;
  startedAt: string;
  state: ProcessState;
  cpuPercent: number;
  memoryBytes: number;
  windowCount: number;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthState {
  hasUsers: boolean;
  currentUser: UserProfile | null;
  locked: boolean;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  avatar?: string | null | undefined;
}

export interface LoginInput {
  username: string;
  password: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type TaskbarPosition = 'bottom' | 'top';

export interface NexOSSettings {
  theme: ThemeMode;
  accent: string;
  wallpaper: string;
  taskbarPosition: TaskbarPosition;
  taskbarCompact: boolean;
  reduceMotion: boolean;
  clipboardHistory: boolean;
  notificationsEnabled: boolean;
  registryEnabled: boolean;
  registryUrl: string;
}

export interface NotificationRecord {
  id: string;
  applicationId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  dismissed: boolean;
}

export interface CreateNotificationInput {
  applicationId: string;
  title: string;
  message: string;
}

export interface SystemInformation {
  nexosVersion: string;
  platform: string;
  release: string;
  architecture: string;
  hostname: string;
  cpuModel: string;
  cpuCount: number;
  totalMemory: number;
  freeMemory: number;
  uptime: number;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  storagePath: string;
}

export interface StorageInformation {
  databaseBytes: number;
  files: number;
  directories: number;
  contentBytes: number;
  recycleBinItems: number;
}

export type BootStage =
  'database' | 'migrations' | 'filesystem' | 'applications' | 'session' | 'ready';

export interface BootProgress {
  stage: BootStage;
  label: string;
  progress: number;
}

export interface BootResult {
  auth: AuthState;
  settings: NexOSSettings;
  applications: AppManifest[];
}

export type PowerAction = 'lock' | 'logout' | 'restart' | 'shutdown';

export interface PermissionGrant {
  userId: string;
  applicationId: string;
  permission: Permission;
  granted: boolean;
  updatedAt: string;
}

export interface PermissionRequest {
  applicationId: string;
  applicationName: string;
  permission: Permission;
  reason: string;
}

export interface ClipboardEntry {
  id: string;
  text: string;
  createdAt: string;
}

export interface AppLaunchResult {
  manifest: AppManifest;
  process: ProcessInfo;
}

export interface InstalledApplication {
  manifest: AppManifest;
  installedAt: string;
  builtin: boolean;
  declarativeContent: { title: string; body: string } | null;
  provenance: PackageProvenance;
}

export interface PackageProvenance {
  publisher: Pick<AppPublisher, 'id' | 'name' | 'keyId'> | null;
  trust: PublisherTrust;
  packageHash: string | null;
  signatureVerified: boolean;
}

export interface PackageInspection {
  manifest: AppManifest;
  provenance: PackageProvenance;
}

export type SearchResultType = 'application' | 'file' | 'setting' | 'command';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  icon: string;
  action: string;
}

export interface NexAIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  proposedAction: NexAIAction | null;
}

export interface NexAIAction {
  id: string;
  tool: 'apps.open' | 'files.search' | 'settings.open' | 'system.lock' | 'files.remove';
  description: string;
  destructive: boolean;
  arguments: Record<string, string>;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WindowState = 'normal' | 'minimized' | 'maximized';

export interface ManagedWindow {
  id: string;
  applicationId: string;
  processId: number;
  title: string;
  icon: string;
  bounds: WindowBounds;
  restoreBounds: WindowBounds | null;
  state: WindowState;
  focused: boolean;
  zIndex: number;
  payload: Record<string, string>;
}

export interface CreateWindowInput {
  applicationId: string;
  processId: number;
  title: string;
  icon: string;
  bounds?: Partial<WindowBounds>;
  payload?: Record<string, string>;
}

export interface DeclarativeAppHostInput {
  windowId: string;
  applicationId: string;
  bounds: WindowBounds;
  theme: 'light' | 'dark';
  accent: string;
  visible: boolean;
}

export interface DeclarativeAppHostUpdate {
  windowId: string;
  bounds: WindowBounds;
  theme: 'light' | 'dark';
  accent: string;
  visible: boolean;
}

export interface SystemEventMap {
  'app:opened': { applicationId: string; pid: number };
  'app:closed': { applicationId: string; pid: number };
  'window:created': { windowId: string; applicationId: string };
  'window:closed': { windowId: string; applicationId: string };
  'file:created': { path: string; kind: FileKind };
  'file:updated': { path: string };
  'file:deleted': { path: string; permanent: boolean };
  'process:started': { process: ProcessInfo };
  'process:stopped': { process: ProcessInfo };
  'notification:created': { notification: NotificationRecord };
  'user:logged-in': { user: UserProfile };
  'user:logged-out': { userId: string };
  'system:locked': { userId: string };
}

export interface FilesApi {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, options?: FileWriteOptions): Promise<FileNode>;
  mkdir(path: string): Promise<FileNode>;
  readdir(path: string, includeTrashed?: boolean): Promise<FileNode[]>;
  rename(path: string, newName: string): Promise<FileNode>;
  remove(path: string, permanent?: boolean): Promise<void>;
  restore(path: string): Promise<FileNode>;
  copy(source: string, destination: string): Promise<FileNode>;
  move(source: string, destination: string): Promise<FileNode>;
  stat(path: string): Promise<FileStat>;
  search(query: string): Promise<FileNode[]>;
  recent(limit?: number): Promise<FileNode[]>;
  favorites(): Promise<FileNode[]>;
  setFavorite(path: string, favorite: boolean): Promise<FileNode>;
  emptyTrash(): Promise<void>;
}

export interface NexOSBridge {
  system: {
    initialize(): Promise<BootResult>;
    information(): Promise<SystemInformation>;
    storage(): Promise<StorageInformation>;
    power(action: PowerAction): Promise<void>;
    onBootProgress(callback: (progress: BootProgress) => void): () => void;
  };
  users: {
    state(): Promise<AuthState>;
    create(input: CreateUserInput): Promise<UserProfile>;
    login(input: LoginInput): Promise<UserProfile>;
    logout(): Promise<void>;
    lock(): Promise<void>;
    unlock(password: string): Promise<UserProfile>;
    list(): Promise<UserProfile[]>;
  };
  files: FilesApi;
  apps: {
    list(): Promise<InstalledApplication[]>;
    get(applicationId: string): Promise<InstalledApplication>;
    launch(applicationId: string): Promise<AppLaunchResult>;
    close(pid: number): Promise<void>;
    installPackage(bytes: Uint8Array): Promise<InstalledApplication>;
    uninstall(applicationId: string): Promise<void>;
    packageInfo(bytes: Uint8Array): Promise<PackageInspection>;
    registryStatus(): Promise<RegistryStatus>;
    registrySearch(query: string): Promise<RegistryPackageSummary[]>;
    installFromRegistry(packageName: string): Promise<InstalledApplication>;
    packageCommand(arguments_: string[]): Promise<string>;
  };
  windows: {
    mountDeclarativeHost(input: DeclarativeAppHostInput): Promise<void>;
    updateDeclarativeHost(input: DeclarativeAppHostUpdate): Promise<void>;
    unmountDeclarativeHost(windowId: string): Promise<void>;
    focusDeclarativeHost(windowId: string): Promise<void>;
  };
  processes: {
    list(): Promise<ProcessInfo[]>;
    get(pid: number): Promise<ProcessInfo>;
    stop(pid: number): Promise<void>;
  };
  settings: {
    get(): Promise<NexOSSettings>;
    update(update: Partial<NexOSSettings>): Promise<NexOSSettings>;
  };
  notifications: {
    list(): Promise<NotificationRecord[]>;
    show(input: CreateNotificationInput): Promise<NotificationRecord>;
    markRead(id: string): Promise<void>;
    dismiss(id: string): Promise<void>;
    dismissAll(): Promise<void>;
    onCreated(callback: (notification: NotificationRecord) => void): () => void;
  };
  permissions: {
    list(applicationId: string): Promise<PermissionGrant[]>;
    request(permission: PermissionRequest): Promise<boolean>;
    set(applicationId: string, permission: Permission, granted: boolean): Promise<void>;
  };
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
    history(): Promise<ClipboardEntry[]>;
    clearHistory(): Promise<void>;
  };
  search: {
    query(query: string): Promise<SearchResult[]>;
  };
  ai: {
    chat(message: string): Promise<NexAIMessage>;
    execute(action: NexAIAction, confirmed: boolean): Promise<string>;
  };
}

declare global {
  interface Window {
    nexos: NexOSBridge;
  }
}

export const defaultSettings: NexOSSettings = {
  theme: 'dark',
  accent: '#7c5cff',
  wallpaper: 'aurora',
  taskbarPosition: 'bottom',
  taskbarCompact: false,
  reduceMotion: false,
  clipboardHistory: true,
  notificationsEnabled: true,
  registryEnabled: false,
  registryUrl: 'https://registry.nexos.dev',
};

export const createUserInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(10).max(256),
  avatar: z.string().max(2_000_000).nullable().optional(),
});

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(256),
});

export const settingsUpdateSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    wallpaper: z.string().min(1).max(120),
    taskbarPosition: z.enum(['bottom', 'top']),
    taskbarCompact: z.boolean(),
    reduceMotion: z.boolean(),
    clipboardHistory: z.boolean(),
    notificationsEnabled: z.boolean(),
    registryEnabled: z.boolean(),
    registryUrl: z
      .string()
      .url()
      .max(300)
      .refine((value) => new URL(value).protocol === 'https:', 'Registry URL must use HTTPS'),
  })
  .partial()
  .strict();

export const filePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.startsWith('/'), 'Path must be absolute');

export const createNotificationSchema = z.object({
  applicationId: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(1000),
});

export const permissionRequestSchema = z.object({
  applicationId: z.string().min(1).max(120),
  applicationName: z.string().min(1).max(80),
  permission: permissionSchema,
  reason: z.string().min(1).max(300),
});

export const nexAIActionSchema = z.object({
  id: z.string().uuid(),
  tool: z.enum(['apps.open', 'files.search', 'settings.open', 'system.lock', 'files.remove']),
  description: z.string().min(1).max(300),
  destructive: z.boolean(),
  arguments: z.record(z.string(), z.string()),
});
