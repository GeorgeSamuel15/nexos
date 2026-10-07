import { useCallback, useEffect, useRef, useState } from 'react';

import { nexos } from '@nexos/sdk';
import type { WindowBounds } from '@nexos/types';
import { Spinner } from '@nexos/ui';

import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

function elementBounds(element: HTMLElement): WindowBounds {
  const rectangle = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.round(rectangle.x)),
    y: Math.max(0, Math.round(rectangle.y)),
    width: Math.max(1, Math.round(rectangle.width)),
    height: Math.max(1, Math.round(rectangle.height)),
  };
}

export function DeclarativeHostSurface({
  window: managedWindow,
  hostVisible = true,
}: ApplicationProperties): React.JSX.Element {
  const desktop = useDesktop();
  const surface = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const theme =
    desktop.settings.theme === 'light' || desktop.settings.theme === 'dark'
      ? desktop.settings.theme
      : document.documentElement.dataset['theme'] === 'light'
        ? 'light'
        : 'dark';
  const visible = hostVisible && managedWindow.state !== 'minimized';
  const initialHostConfig = useRef({ theme, accent: desktop.settings.accent, visible });

  const sync = useCallback(() => {
    const element = surface.current;
    if (!element || !mounted.current) return;
    void nexos.windows
      .updateDeclarativeHost({
        windowId: managedWindow.id,
        bounds: elementBounds(element),
        theme,
        accent: desktop.settings.accent,
        visible,
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unable to update isolated app host.');
      });
  }, [desktop.settings.accent, managedWindow.id, theme, visible]);
  const syncReference = useRef(sync);
  syncReference.current = sync;

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    let disposed = false;
    const initial = initialHostConfig.current;
    const synchronize = () => syncReference.current();
    const observer = new ResizeObserver(synchronize);
    observer.observe(element);
    window.addEventListener('resize', synchronize);
    void nexos.windows
      .mountDeclarativeHost({
        windowId: managedWindow.id,
        applicationId: managedWindow.applicationId,
        bounds: elementBounds(element),
        theme: initial.theme,
        accent: initial.accent,
        visible: initial.visible,
      })
      .then(() => {
        if (disposed) {
          return nexos.windows.unmountDeclarativeHost(managedWindow.id);
        }
        mounted.current = true;
        setLoading(false);
        return undefined;
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unable to start isolated app host.');
        setLoading(false);
      });
    return () => {
      disposed = true;
      mounted.current = false;
      observer.disconnect();
      window.removeEventListener('resize', synchronize);
      void nexos.windows.unmountDeclarativeHost(managedWindow.id);
    };
  }, [managedWindow.applicationId, managedWindow.id]);

  useEffect(sync, [sync, managedWindow.bounds, managedWindow.state]);

  useEffect(() => {
    if (visible && mounted.current) void nexos.windows.focusDeclarativeHost(managedWindow.id);
  }, [managedWindow.id, visible]);

  return (
    <div ref={surface} className="declarative-host-surface">
      {loading ? <Spinner label="Starting isolated application" /> : null}
      {error ? <div className="app-error-state">{error}</div> : null}
    </div>
  );
}
