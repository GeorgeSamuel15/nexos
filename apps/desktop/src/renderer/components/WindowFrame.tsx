import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Maximize2, Minus, Square, X } from 'lucide-react';
import { useStore } from 'zustand';

import type { ManagedWindow, WindowBounds } from '@nexos/types';
import { IconButton } from '@nexos/ui';
import { windowManagerStore } from '@nexos/window-manager';

import { AppIcon } from '../app-icons';
import { useDesktop } from '../desktop-context';
import { ApplicationView } from '../applications/registry';
import { ErrorBoundary } from './ErrorBoundary';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export function WindowFrame({
  window,
  workArea,
  shellOverlayOpen,
}: {
  window: ManagedWindow;
  workArea: WindowBounds;
  shellOverlayOpen: boolean;
}) {
  const desktop = useDesktop();
  const focusWindow = useStore(windowManagerStore, (state) => state.focusWindow);
  const minimizeWindow = useStore(windowManagerStore, (state) => state.minimizeWindow);
  const toggleMaximize = useStore(windowManagerStore, (state) => state.toggleMaximize);
  const updateBounds = useStore(windowManagerStore, (state) => state.updateBounds);
  const snapWindow = useStore(windowManagerStore, (state) => state.snapWindow);
  const frame = useRef<HTMLDivElement>(null);
  const operation = useRef<{
    mode: 'drag' | 'resize';
    direction?: ResizeDirection;
    startX: number;
    startY: number;
    bounds: WindowBounds;
  } | null>(null);
  const nextBounds = useRef<Partial<WindowBounds> | null>(null);
  const animationFrame = useRef<number | null>(null);

  const flushBounds = useCallback(() => {
    animationFrame.current = null;
    if (nextBounds.current) updateBounds(window.id, nextBounds.current);
  }, [updateBounds, window.id]);

  const scheduleBounds = useCallback(
    (bounds: Partial<WindowBounds>) => {
      nextBounds.current = bounds;
      if (animationFrame.current === null)
        animationFrame.current = requestAnimationFrame(flushBounds);
    },
    [flushBounds],
  );

  useEffect(
    () => () => {
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    },
    [],
  );

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || window.state !== 'normal') return;
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    focusWindow(window.id);
    operation.current = {
      mode: 'drag',
      startX: event.clientX,
      startY: event.clientY,
      bounds: window.bounds,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startResize = (direction: ResizeDirection, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0 || window.state !== 'normal') return;
    focusWindow(window.id);
    operation.current = {
      mode: 'resize',
      direction,
      startX: event.clientX,
      startY: event.clientY,
      bounds: window.bounds,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const active = operation.current;
    if (!active) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (active.mode === 'drag') {
      scheduleBounds({
        x: Math.min(
          Math.max(active.bounds.x + dx, -active.bounds.width + 120),
          workArea.width - 120,
        ),
        y: Math.min(Math.max(active.bounds.y + dy, 0), workArea.height - 50),
      });
      return;
    }
    const direction = active.direction ?? 'se';
    const left = direction.includes('w');
    const right = direction.includes('e');
    const top = direction.includes('n');
    const bottom = direction.includes('s');
    const width = Math.max(320, active.bounds.width + (right ? dx : left ? -dx : 0));
    const height = Math.max(220, active.bounds.height + (bottom ? dy : top ? -dy : 0));
    scheduleBounds({
      x: left ? active.bounds.x + active.bounds.width - width : active.bounds.x,
      y: top ? active.bounds.y + active.bounds.height - height : active.bounds.y,
      width,
      height,
    });
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const active = operation.current;
    operation.current = null;
    if (!active || active.mode !== 'drag') return;
    if (event.clientY <= 8) snapWindow(window.id, 'top', workArea);
    else if (event.clientX <= 8) snapWindow(window.id, 'left', workArea);
    else if (event.clientX >= workArea.width - 8) snapWindow(window.id, 'right', workArea);
  };

  const style = useMemo(
    () => ({
      transform: `translate3d(${window.bounds.x}px, ${window.bounds.y}px, 0)`,
      width: window.bounds.width,
      height: window.bounds.height,
      zIndex: window.zIndex,
    }),
    [window.bounds, window.zIndex],
  );

  if (window.state === 'minimized') return null;
  return (
    <div
      ref={frame}
      className={`window-frame ${window.focused ? 'is-focused' : ''} ${window.state === 'maximized' ? 'is-maximized' : ''}`}
      style={style}
      role="dialog"
      aria-label={`${window.title} application window`}
      onPointerDown={() => focusWindow(window.id)}
    >
      <header
        className="window-titlebar"
        onDoubleClick={() => toggleMaximize(window.id, workArea)}
        onPointerDown={startDrag}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div className="window-titlebar__identity">
          <span className="app-icon app-icon--sm">
            <AppIcon name={window.icon} size={16} />
          </span>
          <span>{window.title}</span>
        </div>
        <div className="window-controls">
          <IconButton label={`Minimize ${window.title}`} onClick={() => minimizeWindow(window.id)}>
            <Minus size={15} />
          </IconButton>
          <IconButton
            label={`${window.state === 'maximized' ? 'Restore' : 'Maximize'} ${window.title}`}
            onClick={() => toggleMaximize(window.id, workArea)}
          >
            {window.state === 'maximized' ? <Square size={13} /> : <Maximize2 size={14} />}
          </IconButton>
          <IconButton
            className="window-close"
            label={`Close ${window.title}`}
            onClick={() => void desktop.closeWindow(window)}
          >
            <X size={16} />
          </IconButton>
        </div>
      </header>
      <main className="window-content">
        <ErrorBoundary name={window.title}>
          <ApplicationView window={window} hostVisible={window.focused && !shellOverlayOpen} />
        </ErrorBoundary>
      </main>
      {window.state === 'normal'
        ? (['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const).map((direction) => (
            <span
              key={direction}
              className={`resize-handle resize-handle--${direction}`}
              onPointerDown={(event) => startResize(direction, event)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          ))
        : null}
    </div>
  );
}
