import { createContext, useContext, type PropsWithChildren } from 'react';

import type { InstalledApplication, ManagedWindow, NexOSSettings, UserProfile } from '@nexos/types';

export interface DesktopRuntime {
  user: UserProfile;
  settings: NexOSSettings;
  applications: InstalledApplication[];
  launchApp(applicationId: string, payload?: Record<string, string>): Promise<void>;
  openFile(path: string): Promise<void>;
  closeWindow(window: ManagedWindow): Promise<void>;
  terminateProcess(pid: number): Promise<void>;
  updateSettings(update: Partial<NexOSSettings>): Promise<void>;
  notify(title: string, message: string, applicationId?: string): Promise<void>;
  refreshApplications(): Promise<void>;
  lock(): Promise<void>;
  logout(): Promise<void>;
}

const DesktopContext = createContext<DesktopRuntime | null>(null);

export function DesktopProvider({
  runtime,
  children,
}: PropsWithChildren<{ runtime: DesktopRuntime }>) {
  return <DesktopContext.Provider value={runtime}>{children}</DesktopContext.Provider>;
}

export function useDesktop(): DesktopRuntime {
  const context = useContext(DesktopContext);
  if (!context) throw new Error('Desktop runtime is unavailable.');
  return context;
}
