import { z } from 'zod';

import {
  createNotificationSchema,
  createUserInputSchema,
  filePathSchema,
  loginInputSchema,
  nexAIActionSchema,
  permissionRequestSchema,
  permissionSchema,
  settingsUpdateSchema,
} from '@nexos/types';

export const channels = {
  systemInitialize: 'nexos:system:initialize',
  systemInformation: 'nexos:system:information',
  systemStorage: 'nexos:system:storage',
  systemPower: 'nexos:system:power',
  systemBootProgress: 'nexos:event:boot-progress',
  usersState: 'nexos:users:state',
  usersCreate: 'nexos:users:create',
  usersLogin: 'nexos:users:login',
  usersLogout: 'nexos:users:logout',
  usersLock: 'nexos:users:lock',
  usersUnlock: 'nexos:users:unlock',
  usersList: 'nexos:users:list',
  filesRead: 'nexos:files:read',
  filesWrite: 'nexos:files:write',
  filesMkdir: 'nexos:files:mkdir',
  filesReaddir: 'nexos:files:readdir',
  filesRename: 'nexos:files:rename',
  filesRemove: 'nexos:files:remove',
  filesRestore: 'nexos:files:restore',
  filesCopy: 'nexos:files:copy',
  filesMove: 'nexos:files:move',
  filesStat: 'nexos:files:stat',
  filesSearch: 'nexos:files:search',
  filesRecent: 'nexos:files:recent',
  filesFavorites: 'nexos:files:favorites',
  filesSetFavorite: 'nexos:files:set-favorite',
  filesEmptyTrash: 'nexos:files:empty-trash',
  appsList: 'nexos:apps:list',
  appsGet: 'nexos:apps:get',
  appsLaunch: 'nexos:apps:launch',
  appsClose: 'nexos:apps:close',
  appsInstall: 'nexos:apps:install',
  appsUninstall: 'nexos:apps:uninstall',
  appsPackageInfo: 'nexos:apps:package-info',
  appsRegistryStatus: 'nexos:apps:registry-status',
  appsRegistrySearch: 'nexos:apps:registry-search',
  appsRegistryInstall: 'nexos:apps:registry-install',
  appsPackageCommand: 'nexos:apps:package-command',
  windowsHostMount: 'nexos:windows:host-mount',
  windowsHostUpdate: 'nexos:windows:host-update',
  windowsHostUnmount: 'nexos:windows:host-unmount',
  windowsHostFocus: 'nexos:windows:host-focus',
  processesList: 'nexos:processes:list',
  processesGet: 'nexos:processes:get',
  processesStop: 'nexos:processes:stop',
  settingsGet: 'nexos:settings:get',
  settingsUpdate: 'nexos:settings:update',
  notificationsList: 'nexos:notifications:list',
  notificationsShow: 'nexos:notifications:show',
  notificationsRead: 'nexos:notifications:read',
  notificationsDismiss: 'nexos:notifications:dismiss',
  notificationsDismissAll: 'nexos:notifications:dismiss-all',
  notificationCreated: 'nexos:event:notification-created',
  permissionsList: 'nexos:permissions:list',
  permissionsRequest: 'nexos:permissions:request',
  permissionsSet: 'nexos:permissions:set',
  clipboardRead: 'nexos:clipboard:read',
  clipboardWrite: 'nexos:clipboard:write',
  clipboardHistory: 'nexos:clipboard:history',
  clipboardClear: 'nexos:clipboard:clear',
  searchQuery: 'nexos:search:query',
  aiChat: 'nexos:ai:chat',
  aiExecute: 'nexos:ai:execute',
} as const;

export const nullInputSchema = z.null();
export const boundedStringSchema = z.string().max(100_000);
export const applicationIdSchema = z.string().min(1).max(120);
export const uuidSchema = z.string().uuid();
export const pidSchema = z.number().int().min(1).max(2_147_483_647);
export const packageNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const powerActionSchema = z.enum(['lock', 'logout', 'restart', 'shutdown']);
export const bytesSchema = z
  .instanceof(Uint8Array)
  .refine((value) => value.byteLength <= 5 * 1024 * 1024);

const windowBoundsSchema = z.object({
  x: z.number().int().min(0).max(16_384),
  y: z.number().int().min(0).max(16_384),
  width: z.number().int().min(1).max(16_384),
  height: z.number().int().min(1).max(16_384),
});

const hostAppearanceSchema = z.object({
  theme: z.enum(['light', 'dark']),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  visible: z.boolean(),
});

export const fileWriteSchema = z.object({
  path: filePathSchema,
  content: z.string().max(5_000_000),
  options: z
    .object({
      create: z.boolean().optional(),
      overwrite: z.boolean().optional(),
      mimeType: z.string().max(120).optional(),
    })
    .optional(),
});

export const schemas = {
  createUser: createUserInputSchema,
  login: loginInputSchema,
  unlock: z.string().min(1).max(256),
  filePath: filePathSchema,
  fileWrite: fileWriteSchema,
  readdir: z.object({ path: filePathSchema, includeTrashed: z.boolean().default(false) }),
  rename: z.object({ path: filePathSchema, newName: z.string().min(1).max(255) }),
  remove: z.object({ path: filePathSchema, permanent: z.boolean().default(false) }),
  transfer: z.object({ source: filePathSchema, destination: filePathSchema }),
  recent: z.number().int().min(1).max(100).default(20),
  favorite: z.object({ path: filePathSchema, favorite: z.boolean() }),
  applicationId: applicationIdSchema,
  pid: pidSchema,
  bytes: bytesSchema,
  packageName: packageNameSchema,
  packageCommand: z.array(z.string().max(300)).max(8),
  hostMount: z.object({
    windowId: uuidSchema,
    applicationId: applicationIdSchema,
    bounds: windowBoundsSchema,
    ...hostAppearanceSchema.shape,
  }),
  hostUpdate: z.object({
    windowId: uuidSchema,
    bounds: windowBoundsSchema,
    ...hostAppearanceSchema.shape,
  }),
  settings: settingsUpdateSchema,
  notification: createNotificationSchema,
  uuid: uuidSchema,
  permissionRequest: permissionRequestSchema,
  permissionSet: z.object({
    applicationId: applicationIdSchema,
    permission: permissionSchema,
    granted: z.boolean(),
  }),
  clipboardText: z.string().max(100_000),
  search: z.string().max(300),
  aiMessage: z.string().min(1).max(4_000),
  aiExecute: z.object({ action: nexAIActionSchema, confirmed: z.boolean() }),
};
