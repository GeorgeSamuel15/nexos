import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  CircleUserRound,
  LockKeyhole,
  LogOut,
  Moon,
  Power,
  Search,
  Settings,
  Sun,
  Trash2,
  Wifi,
} from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type {
  InstalledApplication,
  NexOSSettings,
  NotificationRecord,
  SearchResult,
  UserProfile,
} from '@nexos/types';
import { IconButton, Input, Toggle } from '@nexos/ui';

import { AppIcon } from '../app-icons';

export function LauncherPanel({
  applications,
  user,
  onLaunch,
  onClose,
  onOpenSettings,
}: {
  applications: InstalledApplication[];
  user: UserProfile;
  onLaunch(applicationId: string): void;
  onClose(): void;
  onOpenSettings(): void;
}) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const shown = useMemo(
    () =>
      applications
        .filter((application) => application.manifest.id !== 'com.nexos.shell')
        .filter((application) =>
          `${application.manifest.name} ${application.manifest.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name)),
    [applications, query],
  );
  return (
    <section className="shell-panel launcher-panel" aria-label="Application launcher">
      <div className="panel-search">
        <Search size={17} />
        <Input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search applications"
        />
      </div>
      <div className="launcher-heading">
        <span>Applications</span>
        <small>{shown.length} installed</small>
      </div>
      <div className="launcher-grid">
        {shown.map((application) => (
          <button
            key={application.manifest.id}
            type="button"
            onClick={() => {
              onLaunch(application.manifest.id);
              onClose();
            }}
          >
            <span className="app-icon app-icon--lg">
              <AppIcon name={application.manifest.icon} size={25} />
            </span>
            <span>{application.manifest.name}</span>
          </button>
        ))}
      </div>
      <footer className="launcher-footer">
        <div className="launcher-user">
          <CircleUserRound size={23} />
          <div>
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
          </div>
        </div>
        <IconButton label="Open Settings" onClick={onOpenSettings}>
          <Settings size={18} />
        </IconButton>
      </footer>
    </section>
  );
}

export function SearchPanel({
  onAction,
  onClose,
}: {
  onAction(result: SearchResult): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void nexos.search
        .query(query)
        .then((value) => {
          setResults(value);
          setSelected(0);
        })
        .finally(() => setLoading(false));
    }, 100);
    return () => window.clearTimeout(timer);
  }, [query]);

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((value) => Math.min(results.length - 1, value + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter' && results[selected]) {
      onAction(results[selected]);
      onClose();
    } else if (event.key === 'Escape') onClose();
  };

  return (
    <section className="shell-panel global-search-panel" aria-label="NexOS Search">
      <div className="global-search-input">
        <Search size={21} />
        <Input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={keyDown}
          placeholder="Search apps, files, settings, and commands"
        />
        <kbd>Esc</kbd>
      </div>
      <div className="search-results" role="listbox">
        {!query ? (
          <div className="search-hint">
            <span>Try “terminal”, “documents”, “appearance”, or “lock”</span>
          </div>
        ) : null}
        {query && !loading && results.length === 0 ? (
          <div className="search-hint">No results for “{query}”</div>
        ) : null}
        {results.map((result, index) => (
          <button
            key={`${result.type}-${result.id}`}
            className={index === selected ? 'is-selected' : ''}
            type="button"
            role="option"
            aria-selected={index === selected}
            onMouseEnter={() => setSelected(index)}
            onClick={() => {
              onAction(result);
              onClose();
            }}
          >
            <span className="app-icon app-icon--sm">
              <AppIcon name={result.icon} size={17} />
            </span>
            <span>
              <strong>{result.title}</strong>
              <small>{result.subtitle}</small>
            </span>
            <em>{result.type}</em>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function NotificationCenter({
  notifications,
  onRefresh,
}: {
  notifications: NotificationRecord[];
  onRefresh(): void;
}) {
  const visible = notifications.filter((notification) => !notification.dismissed);
  const dismiss = async (id: string) => {
    await nexos.notifications.dismiss(id);
    onRefresh();
  };
  const dismissAll = async () => {
    await nexos.notifications.dismissAll();
    onRefresh();
  };
  return (
    <section className="shell-panel notification-panel" aria-label="Notifications">
      <header>
        <div>
          <Bell size={19} />
          <h2>Notifications</h2>
        </div>
        {visible.length ? (
          <button type="button" onClick={() => void dismissAll()}>
            Clear all
          </button>
        ) : null}
      </header>
      <div className="notification-list">
        {visible.length === 0 ? (
          <div className="empty-panel">
            <Check size={27} />
            <strong>You're all caught up</strong>
            <span>New notifications will appear here.</span>
          </div>
        ) : (
          visible.map((notification) => (
            <article key={notification.id} className={notification.read ? '' : 'is-unread'}>
              <div className="notification-app-dot" />
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.message}</p>
                <time>
                  {new Date(notification.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <IconButton
                label="Dismiss notification"
                onClick={() => void dismiss(notification.id)}
              >
                <Trash2 size={14} />
              </IconButton>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function QuickSettings({
  settings,
  onUpdate,
}: {
  settings: NexOSSettings;
  onUpdate(update: Partial<NexOSSettings>): void;
}) {
  return (
    <section className="shell-panel quick-settings-panel" aria-label="Quick settings">
      <div className="quick-toggles">
        <button type="button" className="is-active">
          <Wifi size={19} />
          <span>
            Wi-Fi<small>Connected</small>
          </span>
        </button>
        <button
          type="button"
          className={settings.theme === 'dark' ? 'is-active' : ''}
          onClick={() => onUpdate({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {settings.theme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}
          <span>
            {settings.theme === 'dark' ? 'Dark' : 'Light'}
            <small>Theme</small>
          </span>
        </button>
      </div>
      <div className="quick-setting-row">
        <span>Notifications</span>
        <Toggle
          label="Notifications"
          checked={settings.notificationsEnabled}
          onChange={(value) => onUpdate({ notificationsEnabled: value })}
        />
      </div>
      <div className="quick-setting-row">
        <span>Clipboard history</span>
        <Toggle
          label="Clipboard history"
          checked={settings.clipboardHistory}
          onChange={(value) => onUpdate({ clipboardHistory: value })}
        />
      </div>
      <div className="quick-accent">
        <span>Accent</span>
        <div>
          {['#7c5cff', '#29b6f6', '#19c37d', '#f45b8b', '#f59e0b'].map((accent) => (
            <button
              key={accent}
              type="button"
              aria-label={`Use accent ${accent}`}
              className={settings.accent === accent ? 'is-selected' : ''}
              style={{ background: accent }}
              onClick={() => onUpdate({ accent })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function PowerMenu({ onLock, onLogout }: { onLock(): void; onLogout(): void }) {
  return (
    <section className="shell-panel power-panel" aria-label="Power menu">
      <button type="button" onClick={onLock}>
        <LockKeyhole size={18} />
        <span>Lock</span>
        <kbd>Super L</kbd>
      </button>
      <button type="button" onClick={onLogout}>
        <LogOut size={18} />
        <span>Log out</span>
      </button>
      <button type="button" onClick={() => void nexos.system.power('restart')}>
        <Power size={18} />
        <span>Restart NexOS</span>
      </button>
      <button type="button" className="danger" onClick={() => void nexos.system.power('shutdown')}>
        <Power size={18} />
        <span>Shut down</span>
      </button>
    </section>
  );
}

export function ToastStack({ notifications }: { notifications: NotificationRecord[] }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {notifications.map((notification) => (
        <article key={notification.id} className="notification-toast">
          <span className="app-icon app-icon--sm">
            <Bell size={16} />
          </span>
          <div>
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
