import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { app, BrowserWindow, dialog, session } from 'electron';

import { NexOSSystemService } from '@nexos/system-service';
import type { PowerAction } from '@nexos/types';

import { channels } from './ipc-contract.js';
import { DeclarativeAppHostManager } from './declarative-app-host.js';
import { registerIpcHandlers } from './ipc-main.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const developmentUrl = process.env['VITE_DEV_SERVER_URL'];
const userDataOverride = process.env['NEXOS_USER_DATA_DIR'];
const isAutomatedTest = process.env['NODE_ENV'] === 'test';

if (userDataOverride?.trim()) app.setPath('userData', resolve(userDataOverride));
if (isAutomatedTest) {
  app.commandLine.appendSwitch('headless');
  app.commandLine.appendSwitch('ozone-platform', 'headless');
  app.disableHardwareAcceleration();
}

let mainWindow: BrowserWindow | null = null;
let systemService: NexOSSystemService | null = null;
let appHosts: DeclarativeAppHostManager | null = null;
let unregisterIpc: (() => void) | null = null;

function validDevelopmentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '5173';
  } catch {
    return false;
  }
}

async function handlePower(action: PowerAction): Promise<void> {
  if (!systemService) return;
  switch (action) {
    case 'lock':
      appHosts?.destroyAll();
      systemService.users.lock();
      break;
    case 'logout':
      appHosts?.destroyAll();
      systemService.processes.clear();
      systemService.users.logout();
      break;
    case 'restart':
      app.relaunch();
      app.exit(0);
      break;
    case 'shutdown':
      app.quit();
      break;
  }
}

async function createMainWindow(): Promise<void> {
  const preload = join(currentDirectory, '../preload/index.cjs');
  mainWindow = new BrowserWindow({
    title: 'NexOS',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#080b14',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (!current || new URL(url).origin !== new URL(current).origin) event.preventDefault();
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    void dialog
      .showMessageBox({
        type: 'error',
        title: 'NexOS desktop recovered',
        message: 'The desktop renderer stopped unexpectedly.',
        detail: 'NexOS can safely reload the desktop without resetting your files.',
        buttons: ['Reload desktop', 'Close NexOS'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) mainWindow?.reload();
        else app.quit();
      });
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    appHosts?.destroyAll();
    mainWindow = null;
  });

  if (developmentUrl && validDevelopmentUrl(developmentUrl)) {
    await mainWindow.loadURL(developmentUrl);
  } else {
    await mainWindow.loadFile(join(currentDirectory, '../../dist/index.html'));
  }
}

const singleInstance = isAutomatedTest || app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    systemService = new NexOSSystemService({
      dataDirectory: app.getPath('userData'),
      onBootProgress: (progress) => {
        mainWindow?.webContents.send(channels.systemBootProgress, progress);
      },
    });
    appHosts = new DeclarativeAppHostManager(() => mainWindow, systemService.applications);
    unregisterIpc = registerIpcHandlers(systemService, () => mainWindow, appHosts, handlePower);
    await createMainWindow();
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  unregisterIpc?.();
  unregisterIpc = null;
  appHosts?.destroyAll();
  appHosts = null;
  systemService?.close();
  systemService = null;
});
