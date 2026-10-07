import { lazy, Suspense, type ComponentType } from 'react';

import type { ManagedWindow } from '@nexos/types';
import { Spinner } from '@nexos/ui';

import { DeclarativeHostSurface } from './DeclarativeHostSurface';

export interface ApplicationProperties {
  window: ManagedWindow;
  hostVisible?: boolean;
}

const applications: Readonly<
  Record<string, React.LazyExoticComponent<ComponentType<ApplicationProperties>>>
> = {
  'com.nexos.files': lazy(() => import('./FilesApp')),
  'com.nexos.terminal': lazy(() => import('./TerminalApp')),
  'com.nexos.settings': lazy(() => import('./SettingsApp')),
  'com.nexos.notes': lazy(() => import('./NotesApp')),
  'com.nexos.calculator': lazy(() => import('./CalculatorApp')),
  'com.nexos.text-editor': lazy(() => import('./TextEditorApp')),
  'com.nexos.image-viewer': lazy(() => import('./ImageViewerApp')),
  'com.nexos.task-manager': lazy(() => import('./TaskManagerApp')),
  'com.nexos.app-manager': lazy(() => import('./AppManagerApp')),
  'com.nexos.system-info': lazy(() => import('./SystemInfoApp')),
  'com.nexos.nexai': lazy(() => import('./NexAIApp')),
};

export function ApplicationView({ window, hostVisible }: ApplicationProperties) {
  const Application = applications[window.applicationId];
  return (
    <Suspense
      fallback={
        <div className="app-loading">
          <Spinner label={`Loading ${window.title}`} />
        </div>
      }
    >
      {Application ? (
        <Application window={window} />
      ) : (
        <DeclarativeHostSurface window={window} hostVisible={hostVisible ?? true} />
      )}
    </Suspense>
  );
}
