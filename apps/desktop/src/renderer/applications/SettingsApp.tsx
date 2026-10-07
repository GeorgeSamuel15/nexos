import { useEffect, useState } from 'react';
import {
  AppWindow,
  Bell,
  Brush,
  Check,
  ChevronRight,
  CircleUserRound,
  Database,
  HardDrive,
  Info,
  Keyboard,
  LockKeyhole,
  Monitor,
  Palette,
  Shield,
} from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type {
  InstalledApplication,
  Permission,
  PermissionGrant,
  StorageInformation,
  SystemInformation,
  UserProfile,
} from '@nexos/types';
import { Button, Card, Input, Select, Sidebar, Toggle } from '@nexos/ui';

import { AppIcon } from '../app-icons';
import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

const sections = [
  ['system', 'System', Monitor],
  ['appearance', 'Appearance', Palette],
  ['personalization', 'Personalization', Brush],
  ['applications', 'Applications', AppWindow],
  ['accounts', 'Accounts', CircleUserRound],
  ['privacy', 'Privacy', LockKeyhole],
  ['security', 'Security', Shield],
  ['storage', 'Storage', HardDrive],
  ['notifications', 'Notifications', Bell],
  ['keyboard', 'Keyboard', Keyboard],
  ['about', 'About NexOS', Info],
] as const;

type SectionId = (typeof sections)[number][0];

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

export default function SettingsApp({ window }: ApplicationProperties) {
  const desktop = useDesktop();
  const requested = window.payload['section'] as SectionId | undefined;
  const [section, setSection] = useState<SectionId>(
    requested && sections.some(([id]) => id === requested) ? requested : 'system',
  );
  const [system, setSystem] = useState<SystemInformation | null>(null);
  const [storage, setStorage] = useState<StorageInformation | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [applications, setApplications] = useState<InstalledApplication[]>(desktop.applications);
  const [securityApp, setSecurityApp] = useState('com.nexos.notes');
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [clipboardCount, setClipboardCount] = useState<number | null>(null);
  const [registryUrl, setRegistryUrl] = useState(desktop.settings.registryUrl);
  const [registryError, setRegistryError] = useState<string | null>(null);

  useEffect(() => {
    if (requested && sections.some(([id]) => id === requested)) setSection(requested);
  }, [requested]);

  const refresh = async () => {
    const [systemValue, storageValue, usersValue, applicationsValue] = await Promise.all([
      nexos.system.information(),
      nexos.system.storage(),
      nexos.users.list(),
      nexos.apps.list(),
    ]);
    setSystem(systemValue);
    setStorage(storageValue);
    setUsers(usersValue);
    setApplications(applicationsValue);
    setClipboardCount((await nexos.clipboard.history()).length);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    void nexos.permissions.list(securityApp).then(setGrants);
  }, [securityApp]);

  const selectedSecurityApp = applications.find((app) => app.manifest.id === securityApp);
  const currentSection = sections.find(([id]) => id === section);

  const setPermission = async (permission: Permission, granted: boolean) => {
    await nexos.permissions.set(securityApp, permission, granted);
    setGrants(await nexos.permissions.list(securityApp));
  };

  const uninstall = async (application: InstalledApplication) => {
    await nexos.apps.uninstall(application.manifest.id);
    await desktop.refreshApplications();
    setApplications(await nexos.apps.list());
  };

  const saveRegistryUrl = async () => {
    try {
      await desktop.updateSettings({ registryUrl: registryUrl.trim() });
      setRegistryError(null);
    } catch (reason) {
      setRegistryError(reason instanceof Error ? reason.message : 'Invalid registry URL.');
    }
  };

  const content = (() => {
    switch (section) {
      case 'system':
        return (
          <>
            <SettingsHero
              icon={<Monitor size={30} />}
              title="System"
              subtitle="NexOS runtime and desktop behaviour"
            />
            <SettingsGroup title="Device">
              <SettingsRow title="Device name" description={system?.hostname ?? 'Loading…'} />
              <SettingsRow
                title="Architecture"
                description={system ? `${system.platform} · ${system.architecture}` : 'Loading…'}
              />
              <SettingsRow title="Processor" description={system?.cpuModel ?? 'Loading…'} />
              <SettingsRow
                title="Memory"
                description={
                  system
                    ? `${formatBytes(system.totalMemory - system.freeMemory)} used of ${formatBytes(system.totalMemory)}`
                    : 'Loading…'
                }
              />
            </SettingsGroup>
            <SettingsGroup title="Desktop">
              <SettingsRow
                title="Compact taskbar"
                description="Use a smaller taskbar and icon size"
              >
                <Toggle
                  label="Compact taskbar"
                  checked={desktop.settings.taskbarCompact}
                  onChange={(value) => void desktop.updateSettings({ taskbarCompact: value })}
                />
              </SettingsRow>
              <SettingsRow
                title="Reduce motion"
                description="Minimize animation and transition effects"
              >
                <Toggle
                  label="Reduce motion"
                  checked={desktop.settings.reduceMotion}
                  onChange={(value) => void desktop.updateSettings({ reduceMotion: value })}
                />
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case 'appearance':
        return (
          <>
            <SettingsHero
              icon={<Palette size={30} />}
              title="Appearance"
              subtitle="Choose how NexOS looks and feels"
            />
            <SettingsGroup title="Colour mode">
              <div className="theme-options">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={desktop.settings.theme === theme ? 'is-selected' : ''}
                    onClick={() => void desktop.updateSettings({ theme })}
                  >
                    <span className={`theme-preview theme-preview--${theme}`}>
                      <i />
                      <i />
                      <i />
                    </span>
                    <strong>
                      {theme[0]?.toUpperCase()}
                      {theme.slice(1)}
                    </strong>
                    {desktop.settings.theme === theme ? <Check size={15} /> : null}
                  </button>
                ))}
              </div>
            </SettingsGroup>
            <SettingsGroup title="Accent colour">
              <div className="accent-options">
                {['#7c5cff', '#29b6f6', '#19c37d', '#f45b8b', '#f59e0b', '#ef4444'].map(
                  (accent) => (
                    <button
                      key={accent}
                      type="button"
                      style={{ background: accent }}
                      className={desktop.settings.accent === accent ? 'is-selected' : ''}
                      aria-label={`Accent ${accent}`}
                      onClick={() => void desktop.updateSettings({ accent })}
                    >
                      {desktop.settings.accent === accent ? <Check size={15} /> : null}
                    </button>
                  ),
                )}
              </div>
            </SettingsGroup>
          </>
        );
      case 'personalization':
        return (
          <>
            <SettingsHero
              icon={<Brush size={30} />}
              title="Personalization"
              subtitle="Wallpaper and taskbar placement"
            />
            <SettingsGroup title="Wallpaper">
              <div className="wallpaper-options">
                {['aurora', 'midnight', 'dune', 'mesh'].map((wallpaper) => (
                  <button
                    key={wallpaper}
                    type="button"
                    data-wallpaper={wallpaper}
                    className={desktop.settings.wallpaper === wallpaper ? 'is-selected' : ''}
                    onClick={() => void desktop.updateSettings({ wallpaper })}
                  >
                    <span />
                    <strong>
                      {wallpaper[0]?.toUpperCase()}
                      {wallpaper.slice(1)}
                    </strong>
                  </button>
                ))}
              </div>
            </SettingsGroup>
            <SettingsGroup title="Taskbar">
              <SettingsRow title="Position" description="Place the taskbar at the top or bottom">
                <Select
                  value={desktop.settings.taskbarPosition}
                  onChange={(event) =>
                    void desktop.updateSettings({
                      taskbarPosition: event.target.value as 'top' | 'bottom',
                    })
                  }
                >
                  <option value="bottom">Bottom</option>
                  <option value="top">Top</option>
                </Select>
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case 'applications':
        return (
          <>
            <SettingsHero
              icon={<AppWindow size={30} />}
              title="Applications"
              subtitle={`${applications.length} applications installed`}
            />
            <SettingsGroup title="Installed applications">
              <div className="settings-app-list">
                {applications
                  .filter((app) => app.manifest.id !== 'com.nexos.shell')
                  .map((app) => (
                    <div key={app.manifest.id}>
                      <span className="app-icon app-icon--sm">
                        <AppIcon name={app.manifest.icon} size={17} />
                      </span>
                      <span>
                        <strong>{app.manifest.name}</strong>
                        <small>
                          {app.manifest.version} · {app.builtin ? 'Built in' : 'Local package'}
                        </small>
                      </span>
                      {app.builtin ? (
                        <em>System</em>
                      ) : (
                        <Button variant="ghost" onClick={() => void uninstall(app)}>
                          Uninstall
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </SettingsGroup>
            <SettingsGroup title="Package registry">
              <SettingsRow
                title="Online registry"
                description="Allow NexOS to query and install signed packages from the configured HTTPS registry"
              >
                <Toggle
                  label="Online registry"
                  checked={desktop.settings.registryEnabled}
                  onChange={(value) => void desktop.updateSettings({ registryEnabled: value })}
                />
              </SettingsRow>
              <label className="settings-select-label">
                Registry URL
                <Input
                  value={registryUrl}
                  spellCheck={false}
                  inputMode="url"
                  onChange={(event) => setRegistryUrl(event.target.value)}
                  onBlur={() => void saveRegistryUrl()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
              </label>
              {registryError ? <p className="settings-error-copy">{registryError}</p> : null}
              <p className="settings-empty-copy">
                Online access is opt-in. Remote packages must have a valid Ed25519 publisher
                signature before installation.
              </p>
            </SettingsGroup>
          </>
        );
      case 'accounts':
        return (
          <>
            <SettingsHero
              icon={<CircleUserRound size={30} />}
              title="Accounts"
              subtitle="Local NexOS users"
            />
            <SettingsGroup title="Users">
              {users.map((user) => (
                <SettingsRow
                  key={user.id}
                  title={user.displayName}
                  description={`@${user.username} · Created ${new Date(user.createdAt).toLocaleDateString()}`}
                >
                  <span className="status-chip">
                    {user.id === desktop.user.id ? 'Current' : 'Local'}
                  </span>
                </SettingsRow>
              ))}
            </SettingsGroup>
            <Card className="settings-note">
              <Shield size={20} />
              <div>
                <strong>Local-first accounts</strong>
                <p>
                  Account credentials and preferences stay in the local encrypted application
                  boundary. Passwords are never stored as plaintext.
                </p>
              </div>
            </Card>
          </>
        );
      case 'privacy':
        return (
          <>
            <SettingsHero
              icon={<LockKeyhole size={30} />}
              title="Privacy"
              subtitle="Control local histories and sensitive data"
            />
            <SettingsGroup title="Clipboard">
              <SettingsRow
                title="Clipboard history"
                description={`${clipboardCount ?? 0} saved text entr${clipboardCount === 1 ? 'y' : 'ies'}`}
              >
                <Toggle
                  label="Clipboard history"
                  checked={desktop.settings.clipboardHistory}
                  onChange={(value) => void desktop.updateSettings({ clipboardHistory: value })}
                />
              </SettingsRow>
              <SettingsRow
                title="Clear clipboard history"
                description="Remove all saved clipboard entries"
              >
                <Button
                  variant="secondary"
                  onClick={() =>
                    void nexos.clipboard.clearHistory().then(() => setClipboardCount(0))
                  }
                >
                  Clear
                </Button>
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case 'security':
        return (
          <>
            <SettingsHero
              icon={<Shield size={30} />}
              title="Security"
              subtitle="Review application capabilities"
            />
            <SettingsGroup title="Application permissions">
              <label className="settings-select-label">
                Application
                <Select
                  value={securityApp}
                  onChange={(event) => setSecurityApp(event.target.value)}
                >
                  {applications
                    .filter((app) => app.manifest.id !== 'com.nexos.shell')
                    .map((app) => (
                      <option key={app.manifest.id} value={app.manifest.id}>
                        {app.manifest.name}
                      </option>
                    ))}
                </Select>
              </label>
              {selectedSecurityApp?.manifest.permissions.length ? (
                selectedSecurityApp.manifest.permissions.map((permission) => {
                  const grant = grants.find((item) => item.permission === permission);
                  const enabled = grant?.granted ?? selectedSecurityApp.manifest.system;
                  return (
                    <SettingsRow
                      key={permission}
                      title={permission}
                      description={permissionDescription(permission)}
                    >
                      <Toggle
                        label={permission}
                        checked={enabled}
                        onChange={(value) => void setPermission(permission, value)}
                      />
                    </SettingsRow>
                  );
                })
              ) : (
                <p className="settings-empty-copy">This app requests no permissions.</p>
              )}
            </SettingsGroup>
            <Card className="settings-note">
              <Shield size={20} />
              <div>
                <strong>Renderer sandbox active</strong>
                <p>
                  Applications cannot access Node.js, native modules, SQLite, or the host filesystem
                  directly.
                </p>
              </div>
            </Card>
          </>
        );
      case 'storage':
        return (
          <>
            <SettingsHero
              icon={<HardDrive size={30} />}
              title="Storage"
              subtitle="Virtual filesystem usage"
            />
            <div className="storage-summary">
              <Database size={27} />
              <div>
                <strong>{storage ? formatBytes(storage.contentBytes) : '—'}</strong>
                <span>Virtual file content</span>
              </div>
            </div>
            <SettingsGroup title="Breakdown">
              <SettingsRow title="Files" description={`${storage?.files ?? 0} virtual files`} />
              <SettingsRow
                title="Directories"
                description={`${storage?.directories ?? 0} folders`}
              />
              <SettingsRow
                title="System database"
                description={storage ? formatBytes(storage.databaseBytes) : 'Loading…'}
              />
              <SettingsRow
                title="Recycle bin"
                description={`${storage?.recycleBinItems ?? 0} items`}
              >
                <Button
                  variant="secondary"
                  disabled={!storage?.recycleBinItems}
                  onClick={() => void nexos.files.emptyTrash().then(refresh)}
                >
                  Empty
                </Button>
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case 'notifications':
        return (
          <>
            <SettingsHero
              icon={<Bell size={30} />}
              title="Notifications"
              subtitle="Choose how apps alert you"
            />
            <SettingsGroup title="Notification centre">
              <SettingsRow
                title="Application notifications"
                description="Allow apps to place alerts in notification history"
              >
                <Toggle
                  label="Application notifications"
                  checked={desktop.settings.notificationsEnabled}
                  onChange={(value) => void desktop.updateSettings({ notificationsEnabled: value })}
                />
              </SettingsRow>
            </SettingsGroup>
          </>
        );
      case 'keyboard':
        return (
          <>
            <SettingsHero
              icon={<Keyboard size={30} />}
              title="Keyboard"
              subtitle="Desktop and window shortcuts"
            />
            <SettingsGroup title="System shortcuts">
              {(
                [
                  ['Alt + Tab', 'Switch windows'],
                  ['Alt + F4', 'Close active window'],
                  ['Super + E', 'Open Files'],
                  ['Super + R', 'Open Search'],
                  ['Super + D', 'Show desktop'],
                  ['Super + L', 'Lock NexOS'],
                  ['Ctrl + S', 'Save in editors'],
                ] as const
              ).map(([shortcut, description]) => (
                <SettingsRow key={shortcut} title={description} description="">
                  <kbd>{shortcut}</kbd>
                </SettingsRow>
              ))}
            </SettingsGroup>
          </>
        );
      case 'about':
        return (
          <>
            <div className="about-nexos">
              <div className="nexos-orb">
                <span>N</span>
              </div>
              <h1>NexOS</h1>
              <p>Version {system?.nexosVersion ?? '0.2.0'}</p>
              <span>TypeScript desktop operating environment</span>
            </div>
            <SettingsGroup title="Runtime">
              <SettingsRow title="Electron" description={system?.electronVersion ?? 'Loading…'} />
              <SettingsRow title="Node.js" description={system?.nodeVersion ?? 'Loading…'} />
              <SettingsRow title="Chromium" description={system?.chromeVersion ?? 'Loading…'} />
              <SettingsRow title="Architecture" description={system?.architecture ?? 'Loading…'} />
            </SettingsGroup>
            <Card className="settings-note">
              <Info size={20} />
              <div>
                <strong>Honest architecture</strong>
                <p>
                  NexOS v0.2 is an Electron desktop environment, not a hardware-level kernel. Its
                  service contracts are designed for a future Rust system-call boundary.
                </p>
              </div>
            </Card>
          </>
        );
    }
  })();

  return (
    <div className="settings-app">
      <Sidebar className="settings-sidebar">
        <div className="settings-user">
          <CircleUserRound size={29} />
          <span>
            <strong>{desktop.user.displayName}</strong>
            <small>Local account</small>
          </span>
        </div>
        <nav>
          {sections.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className={section === id ? 'is-active' : ''}
              onClick={() => setSection(id)}
            >
              <Icon size={17} />
              <span>{label}</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
      </Sidebar>
      <section className="settings-content" aria-label={currentSection?.[1]}>
        {content}
      </section>
    </div>
  );
}

function SettingsHero({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="settings-hero">
      <span>{icon}</span>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function SettingsGroup({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <section className="settings-group">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function SettingsRow({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description: string }>) {
  return (
    <div className="settings-row">
      <span>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {children}
    </div>
  );
}

function permissionDescription(permission: Permission): string {
  const descriptions: Record<Permission, string> = {
    'filesystem.read': 'Read files from the NexOS virtual filesystem',
    'filesystem.write': 'Create and change virtual files',
    camera: 'Request camera access',
    microphone: 'Request microphone access',
    notifications: 'Show notifications',
    network: 'Connect to network services',
    'system.settings': 'Change NexOS settings',
    'process.read': 'View running processes',
    'process.kill': 'Terminate running processes',
    clipboard: 'Read and write text clipboard data',
  };
  return descriptions[permission];
}
