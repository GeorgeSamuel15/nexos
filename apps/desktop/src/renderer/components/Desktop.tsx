import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Bell,
  ChevronUp,
  FolderPlus,
  LockKeyhole,
  MonitorCog,
  Power,
  Search,
  Volume2,
  Wifi,
} from 'lucide-react';
import { useStore } from 'zustand';

import { nexos } from '@nexos/sdk';
import type {
  AppManifest,
  InstalledApplication,
  ManagedWindow,
  NexOSSettings,
  NotificationRecord,
  SearchResult,
  UserProfile,
  WindowBounds,
} from '@nexos/types';
import { IconButton, Menu, MenuItem } from '@nexos/ui';
import { windowManagerStore } from '@nexos/window-manager';

import { AppIcon } from '../app-icons';
import { DesktopProvider, type DesktopRuntime } from '../desktop-context';
import {
  LauncherPanel,
  NotificationCenter,
  PowerMenu,
  QuickSettings,
  SearchPanel,
  ToastStack,
} from './ShellPanels';
import { WindowFrame } from './WindowFrame';

type Panel = 'launcher' | 'search' | 'notifications' | 'quick' | 'power' | null;

function manifestToInstalled(manifest: AppManifest): InstalledApplication {
  return {
    manifest,
    installedAt: '',
    builtin: true,
    declarativeContent: null,
    provenance: {
      publisher: null,
      trust: 'system',
      packageHash: null,
      signatureVerified: true,
    },
  };
}

function useClock(): Date {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return time;
}

export function Desktop({
  user,
  initialSettings,
  initialApplications,
  onSessionChanged,
}: {
  user: UserProfile;
  initialSettings: NexOSSettings;
  initialApplications: AppManifest[];
  onSessionChanged(): void;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [applications, setApplications] = useState<InstalledApplication[]>(
    initialApplications.map(manifestToInstalled),
  );
  const [panel, setPanel] = useState<Panel>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [toasts, setToasts] = useState<NotificationRecord[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [workArea, setWorkArea] = useState<WindowBounds>({ x: 0, y: 0, width: 1280, height: 760 });
  const workAreaReference = useRef<HTMLDivElement>(null);
  const windows = useStore(windowManagerStore, (state) => state.windows);
  const activeWindowId = useStore(windowManagerStore, (state) => state.activeWindowId);
  const clock = useClock();

  const refreshApplications = useCallback(async () => {
    setApplications(await nexos.apps.list());
  }, []);

  const refreshNotifications = useCallback(async () => {
    setNotifications(await nexos.notifications.list());
  }, []);

  useEffect(() => {
    void Promise.all([refreshApplications(), refreshNotifications()]);
    return nexos.notifications.onCreated((notification) => {
      setNotifications((current) => [notification, ...current]);
      setToasts((current) => [...current.slice(-2), notification]);
      window.setTimeout(
        () => setToasts((current) => current.filter((item) => item.id !== notification.id)),
        4_500,
      );
    });
  }, [refreshApplications, refreshNotifications]);

  useEffect(() => {
    const element = workAreaReference.current;
    if (!element) return;
    const update = () =>
      setWorkArea({ x: 0, y: 0, width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const launchApp = useCallback(
    async (applicationId: string, payload: Record<string, string> = {}) => {
      const application = applications.find((item) => item.manifest.id === applicationId);
      if (!application) throw new Error(`Application is not installed: ${applicationId}`);
      const existing = windowManagerStore
        .getState()
        .windows.find((window) => window.applicationId === applicationId);
      if (application.manifest.singleInstance && existing) {
        windowManagerStore.getState().updatePayload(existing.id, payload);
        windowManagerStore.getState().focusWindow(existing.id);
        return;
      }
      const result = await nexos.apps.launch(applicationId);
      windowManagerStore.getState().createWindow({
        applicationId,
        processId: result.process.pid,
        title: result.manifest.name,
        icon: result.manifest.icon,
        bounds: {
          width: Math.min(result.manifest.defaultWidth, Math.max(360, workArea.width - 40)),
          height: Math.min(result.manifest.defaultHeight, Math.max(280, workArea.height - 40)),
        },
        payload,
      });
    },
    [applications, workArea.height, workArea.width],
  );

  const openFile = useCallback(
    async (path: string) => {
      const stat = await nexos.files.stat(path);
      if (stat.kind === 'directory') {
        await launchApp('com.nexos.files', { path });
        return;
      }
      const dot = path.lastIndexOf('.');
      const extension = dot >= 0 ? path.slice(dot).toLowerCase() : '';
      const application =
        applications.find((item) => item.manifest.fileExtensions.includes(extension)) ??
        applications.find((item) => item.manifest.id === 'com.nexos.text-editor');
      if (!application) throw new Error(`No application can open ${path}.`);
      await launchApp(application.manifest.id, { path });
    },
    [applications, launchApp],
  );

  const notify = useCallback(
    async (title: string, message: string, applicationId = 'com.nexos.shell') => {
      await nexos.notifications.show({ title, message, applicationId });
    },
    [],
  );

  const closeWindow = useCallback(async (window: ManagedWindow) => {
    windowManagerStore.getState().closeWindow(window.id);
    try {
      await nexos.apps.close(window.processId);
    } catch (reason) {
      const code = (reason as { code?: string }).code;
      if (code !== 'PROCESS_NOT_FOUND') throw reason;
    }
  }, []);

  const terminateProcess = useCallback(async (pid: number) => {
    await nexos.processes.stop(pid);
    windowManagerStore.getState().closeProcessWindows(pid);
  }, []);

  const updateSettings = useCallback(
    async (update: Partial<NexOSSettings>) => {
      const previous = settings;
      setSettings((current) => ({ ...current, ...update }));
      try {
        setSettings(await nexos.settings.update(update));
      } catch (error) {
        setSettings(previous);
        throw error;
      }
    },
    [settings],
  );

  const lock = useCallback(async () => {
    await nexos.system.power('lock');
    onSessionChanged();
  }, [onSessionChanged]);

  const logout = useCallback(async () => {
    windowManagerStore.getState().reset();
    await nexos.system.power('logout');
    onSessionChanged();
  }, [onSessionChanged]);

  const runtime = useMemo<DesktopRuntime>(
    () => ({
      user,
      settings,
      applications,
      launchApp,
      openFile,
      closeWindow,
      terminateProcess,
      updateSettings,
      notify,
      refreshApplications,
      lock,
      logout,
    }),
    [
      user,
      settings,
      applications,
      launchApp,
      openFile,
      closeWindow,
      terminateProcess,
      updateSettings,
      notify,
      refreshApplications,
      lock,
      logout,
    ],
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset['theme'] =
        settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.style.setProperty('--accent', settings.accent);
      document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.accent, settings.reduceMotion, settings.theme]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, [contenteditable="true"]') ?? false;
      if (event.altKey && event.key === 'Tab') {
        event.preventDefault();
        windowManagerStore.getState().cycleFocus(event.shiftKey ? -1 : 1);
        return;
      }
      if (event.altKey && event.key === 'F4') {
        event.preventDefault();
        const active = windowManagerStore
          .getState()
          .windows.find((item) => item.id === windowManagerStore.getState().activeWindowId);
        if (active) void closeWindow(active);
        return;
      }
      if (typing || !event.metaKey) {
        if (event.key === 'Escape') setPanel(null);
        return;
      }
      const key = event.key.toLowerCase();
      if (['e', 'r', 'd', 'l'].includes(key)) event.preventDefault();
      if (key === 'e') void launchApp('com.nexos.files');
      if (key === 'r') setPanel('search');
      if (key === 'd') windowManagerStore.getState().showDesktop();
      if (key === 'l') void lock();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [closeWindow, launchApp, lock]);

  const searchAction = async (result: SearchResult) => {
    const [kind, ...parts] = result.action.split(':');
    const value = parts.join(':');
    if (kind === 'app') await launchApp(value);
    else if (kind === 'file') await openFile(value);
    else if (kind === 'setting') await launchApp('com.nexos.settings', { section: value });
    else if (kind === 'command') {
      if (value === 'lock') await lock();
      else if (value === 'shutdown') await nexos.system.power('shutdown');
      else if (value === 'restart') await nexos.system.power('restart');
      else if (value === 'terminal') await launchApp('com.nexos.terminal');
    }
  };

  const createDesktopFolder = async () => {
    let index = 1;
    while (true) {
      const name = index === 1 ? 'New folder' : `New folder ${index}`;
      try {
        await nexos.files.mkdir(`/home/Desktop/${name}`);
        await notify('Folder created', `${name} was added to your desktop.`);
        break;
      } catch (error) {
        if ((error as { code?: string }).code !== 'ALREADY_EXISTS') throw error;
        index += 1;
      }
    }
    setContextMenu(null);
  };

  const openContextMenu = (event: ReactMouseEvent) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const togglePanel = (next: Exclude<Panel, null>) => {
    setContextMenu(null);
    setPanel((current) => (current === next ? null : next));
  };

  const desktopApps = [
    'com.nexos.files',
    'com.nexos.terminal',
    'com.nexos.notes',
    'com.nexos.nexai',
  ];

  return (
    <DesktopProvider runtime={runtime}>
      <div
        className={`desktop-shell taskbar-${settings.taskbarPosition} ${settings.taskbarCompact ? 'taskbar-compact' : ''}`}
        data-wallpaper={settings.wallpaper}
        onPointerDown={() => setContextMenu(null)}
      >
        <div ref={workAreaReference} className="desktop-work-area" onContextMenu={openContextMenu}>
          <div className="desktop-icons" aria-label="Desktop shortcuts">
            {desktopApps.map((id) => {
              const application = applications.find((item) => item.manifest.id === id);
              return application ? (
                <button
                  key={id}
                  type="button"
                  onDoubleClick={() => void launchApp(id)}
                  onClick={(event) => {
                    if (event.detail === 1) event.currentTarget.focus();
                  }}
                >
                  <span className="app-icon app-icon--desktop">
                    <AppIcon name={application.manifest.icon} size={29} />
                  </span>
                  <span>{application.manifest.name}</span>
                </button>
              ) : null;
            })}
          </div>
          {windows.map((window) => (
            <WindowFrame
              key={window.id}
              window={window}
              workArea={workArea}
              shellOverlayOpen={panel !== null || contextMenu !== null}
            />
          ))}
        </div>

        <Taskbar
          windows={windows}
          activeWindowId={activeWindowId}
          applications={applications}
          clock={clock}
          notificationCount={notifications.filter((item) => !item.read && !item.dismissed).length}
          panel={panel}
          onTogglePanel={togglePanel}
          onLaunch={launchApp}
        />

        {panel ? (
          <button
            className="panel-dismiss-layer"
            aria-label="Close panel"
            onClick={() => setPanel(null)}
          />
        ) : null}
        {panel === 'launcher' ? (
          <LauncherPanel
            applications={applications}
            user={user}
            onLaunch={(id) => void launchApp(id)}
            onClose={() => setPanel(null)}
            onOpenSettings={() => {
              setPanel(null);
              void launchApp('com.nexos.settings');
            }}
          />
        ) : null}
        {panel === 'search' ? (
          <SearchPanel
            onAction={(result) => void searchAction(result)}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {panel === 'notifications' ? (
          <NotificationCenter
            notifications={notifications}
            onRefresh={() => void refreshNotifications()}
          />
        ) : null}
        {panel === 'quick' ? (
          <QuickSettings settings={settings} onUpdate={(update) => void updateSettings(update)} />
        ) : null}
        {panel === 'power' ? (
          <PowerMenu onLock={() => void lock()} onLogout={() => void logout()} />
        ) : null}

        {contextMenu ? (
          <Menu
            className="desktop-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <MenuItem onClick={() => void launchApp('com.nexos.terminal')}>
              <AppIcon name="terminal" size={16} /> Open Terminal
            </MenuItem>
            <MenuItem onClick={() => void createDesktopFolder()}>
              <FolderPlus size={16} /> New folder
            </MenuItem>
            <MenuItem
              onClick={() => void launchApp('com.nexos.settings', { section: 'appearance' })}
            >
              <MonitorCog size={16} /> Personalize
            </MenuItem>
            <MenuItem onClick={() => void lock()}>
              <LockKeyhole size={16} /> Lock NexOS
            </MenuItem>
          </Menu>
        ) : null}
        <ToastStack notifications={toasts} />
      </div>
    </DesktopProvider>
  );
}

function Taskbar({
  windows,
  activeWindowId,
  applications,
  clock,
  notificationCount,
  panel,
  onTogglePanel,
  onLaunch,
}: {
  windows: ManagedWindow[];
  activeWindowId: string | null;
  applications: InstalledApplication[];
  clock: Date;
  notificationCount: number;
  panel: Panel;
  onTogglePanel(panel: Exclude<Panel, null>): void;
  onLaunch(applicationId: string): Promise<void>;
}) {
  const pinned = ['com.nexos.files', 'com.nexos.terminal'];
  const focusWindow = useStore(windowManagerStore, (state) => state.focusWindow);
  const minimizeWindow = useStore(windowManagerStore, (state) => state.minimizeWindow);
  const restoreWindow = useStore(windowManagerStore, (state) => state.restoreWindow);

  const clickWindow = (window: ManagedWindow) => {
    if (window.state === 'minimized') restoreWindow(window.id);
    else if (window.id === activeWindowId) minimizeWindow(window.id);
    else focusWindow(window.id);
  };

  return (
    <nav className="taskbar" aria-label="NexOS taskbar">
      <div className="taskbar-start">
        <IconButton
          className={`nexos-launch-button ${panel === 'launcher' ? 'is-active' : ''}`}
          label="Open NexOS launcher"
          onClick={() => onTogglePanel('launcher')}
        >
          <span className="nexos-glyph">N</span>
        </IconButton>
        <button
          className={`taskbar-search ${panel === 'search' ? 'is-active' : ''}`}
          type="button"
          onClick={() => onTogglePanel('search')}
        >
          <Search size={17} />
          <span>Search NexOS</span>
        </button>
        <span className="taskbar-divider" />
        {pinned.map((id) => {
          const application = applications.find((item) => item.manifest.id === id);
          const running = windows.find((window) => window.applicationId === id);
          return application ? (
            <IconButton
              key={id}
              className={running ? 'has-running-app' : ''}
              label={application.manifest.name}
              onClick={() => (running ? clickWindow(running) : void onLaunch(id))}
            >
              <AppIcon name={application.manifest.icon} size={20} />
            </IconButton>
          ) : null;
        })}
        <span className="taskbar-divider" />
        <div className="running-apps">
          {windows
            .filter((window) => !pinned.includes(window.applicationId))
            .map((window) => (
              <button
                key={window.id}
                type="button"
                className={`${window.id === activeWindowId && window.state !== 'minimized' ? 'is-active' : ''}`}
                onClick={() => clickWindow(window)}
                title={window.title}
              >
                <AppIcon name={window.icon} size={18} />
                <span>{window.title}</span>
                <i />
              </button>
            ))}
        </div>
      </div>
      <div className="system-tray">
        <IconButton label="Show hidden system icons">
          <ChevronUp size={15} />
        </IconButton>
        <button
          type="button"
          className={`tray-status ${panel === 'quick' ? 'is-active' : ''}`}
          onClick={() => onTogglePanel('quick')}
          aria-label="Open quick settings"
        >
          <Wifi size={15} />
          <Volume2 size={15} />
        </button>
        <button
          type="button"
          className={`tray-clock ${panel === 'notifications' ? 'is-active' : ''}`}
          onClick={() => onTogglePanel('notifications')}
          aria-label="Open notifications"
        >
          <span>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <small>{clock.toLocaleDateString([], { month: 'short', day: 'numeric' })}</small>
          {notificationCount > 0 ? <em>{Math.min(notificationCount, 9)}</em> : null}
        </button>
        <IconButton
          className={panel === 'notifications' ? 'is-active' : ''}
          label="Notifications"
          onClick={() => onTogglePanel('notifications')}
        >
          <Bell size={17} />
        </IconButton>
        <IconButton
          className={panel === 'power' ? 'is-active' : ''}
          label="Power menu"
          onClick={() => onTogglePanel('power')}
        >
          <Power size={17} />
        </IconButton>
      </div>
    </nav>
  );
}
