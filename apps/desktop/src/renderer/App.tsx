import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type { AuthState, BootProgress, BootResult, UserProfile } from '@nexos/types';
import { Button } from '@nexos/ui';

import { FirstRunScreen, LockScreen, LoginScreen } from './components/AuthScreens';
import { BootScreen } from './components/BootScreen';
import { Desktop } from './components/Desktop';
import { ErrorBoundary } from './components/ErrorBoundary';

const initialProgress: BootProgress = {
  stage: 'database',
  label: 'Starting system…',
  progress: 4,
};

export function App() {
  const [boot, setBoot] = useState<BootResult | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [progress, setProgress] = useState(initialProgress);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const initialize = async () => {
    setError(null);
    setBoot(null);
    setProgress(initialProgress);
    try {
      const result = await nexos.system.initialize();
      setBoot(result);
      setAuth(result.auth);
      if (result.auth.hasUsers) setUsers(await nexos.users.list().catch(() => []));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'NexOS failed to start.');
    }
  };

  useEffect(() => {
    const unsubscribe = nexos.system.onBootProgress(setProgress);
    void initialize();
    return unsubscribe;
  }, []);

  const activate = async (user: UserProfile) => {
    const state = await nexos.users.state();
    const settings = await awaitSettings(boot?.settings ?? initialSettingsFallback);
    setAuth({ ...state, currentUser: user, locked: false });
    setUsers(await nexos.users.list());
    setBoot((current) => (current ? { ...current, auth: state, settings } : current));
  };

  const refreshAuth = async () => setAuth(await nexos.users.state());

  if (error) {
    return (
      <main className="fatal-screen">
        <AlertTriangle size={44} />
        <h1>NexOS could not start</h1>
        <p>{error}</p>
        <Button onClick={() => void initialize()}>
          <RotateCcw size={16} /> Try again
        </Button>
      </main>
    );
  }
  if (!boot || !auth) return <BootScreen progress={progress} />;
  if (!auth.hasUsers) return <FirstRunScreen onComplete={(user) => void activate(user)} />;
  if (!auth.currentUser)
    return <LoginScreen users={users} onLogin={(user) => void activate(user)} />;
  if (auth.locked)
    return <LockScreen user={auth.currentUser} onUnlock={(user) => void activate(user)} />;

  return (
    <ErrorBoundary name="NexOS desktop">
      <Desktop
        user={auth.currentUser}
        initialSettings={boot.settings}
        initialApplications={boot.applications}
        onSessionChanged={() => void refreshAuth()}
      />
    </ErrorBoundary>
  );
}

async function awaitSettings(fallback: BootResult['settings']): Promise<BootResult['settings']> {
  try {
    return await nexos.settings.get();
  } catch {
    return fallback;
  }
}

const initialSettingsFallback: BootResult['settings'] = {
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
