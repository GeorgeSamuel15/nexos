import type { CreateWindowInput, ManagedWindow, WindowBounds, WindowState } from '@nexos/types';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type SnapPosition = 'left' | 'right' | 'top';

export interface WindowManagerState {
  windows: ManagedWindow[];
  activeWindowId: string | null;
  desktopRestoreIds: string[];
  createWindow(input: CreateWindowInput): string;
  closeWindow(id: string): void;
  closeProcessWindows(pid: number): void;
  focusWindow(id: string): void;
  minimizeWindow(id: string): void;
  maximizeWindow(id: string, workArea: WindowBounds): void;
  restoreWindow(id: string): void;
  toggleMaximize(id: string, workArea: WindowBounds): void;
  updateBounds(id: string, bounds: Partial<WindowBounds>): void;
  updatePayload(id: string, payload: Record<string, string>): void;
  snapWindow(id: string, position: SnapPosition, workArea: WindowBounds): void;
  cycleFocus(direction?: 1 | -1): void;
  showDesktop(): void;
  reset(): void;
}

const defaultBounds: WindowBounds = { x: 120, y: 72, width: 900, height: 640 };

function focus(windows: ManagedWindow[], id: string): ManagedWindow[] {
  const top = Math.max(0, ...windows.map((window) => window.zIndex)) + 1;
  return windows.map((window) => ({
    ...window,
    focused: window.id === id,
    zIndex: window.id === id ? top : window.zIndex,
    state: window.id === id && window.state === 'minimized' ? 'normal' : window.state,
  }));
}

function nextFocusable(windows: ManagedWindow[]): ManagedWindow | null {
  return (
    windows
      .filter((window) => window.state !== 'minimized')
      .sort((left, right) => right.zIndex - left.zIndex)[0] ?? null
  );
}

export function createWindowManagerStore(): StoreApi<WindowManagerState> {
  let cascade = 0;
  return createStore<WindowManagerState>()((set, get) => ({
    windows: [],
    activeWindowId: null,
    desktopRestoreIds: [],

    createWindow(input) {
      const id = globalThis.crypto.randomUUID();
      cascade = (cascade + 1) % 9;
      const existingTop = Math.max(0, ...get().windows.map((window) => window.zIndex));
      const bounds: WindowBounds = {
        x: input.bounds?.x ?? defaultBounds.x + cascade * 24,
        y: input.bounds?.y ?? defaultBounds.y + cascade * 24,
        width: input.bounds?.width ?? defaultBounds.width,
        height: input.bounds?.height ?? defaultBounds.height,
      };
      const window: ManagedWindow = {
        id,
        applicationId: input.applicationId,
        processId: input.processId,
        title: input.title,
        icon: input.icon,
        bounds,
        restoreBounds: null,
        state: 'normal',
        focused: true,
        zIndex: existingTop + 1,
        payload: input.payload ?? {},
      };
      set((state) => ({
        windows: [...state.windows.map((item) => ({ ...item, focused: false })), window],
        activeWindowId: id,
        desktopRestoreIds: [],
      }));
      return id;
    },

    closeWindow(id) {
      set((state) => {
        const windows = state.windows.filter((window) => window.id !== id);
        const next = nextFocusable(windows);
        return {
          windows: next ? focus(windows, next.id) : windows,
          activeWindowId: next?.id ?? null,
          desktopRestoreIds: state.desktopRestoreIds.filter((windowId) => windowId !== id),
        };
      });
    },

    closeProcessWindows(pid) {
      set((state) => {
        const windows = state.windows.filter((window) => window.processId !== pid);
        const next = nextFocusable(windows);
        return {
          windows: next ? focus(windows, next.id) : windows,
          activeWindowId: next?.id ?? null,
          desktopRestoreIds: state.desktopRestoreIds.filter((id) =>
            windows.some((window) => window.id === id),
          ),
        };
      });
    },

    focusWindow(id) {
      if (!get().windows.some((window) => window.id === id)) return;
      set((state) => ({ windows: focus(state.windows, id), activeWindowId: id }));
    },

    minimizeWindow(id) {
      set((state) => {
        const windows = state.windows.map((window) =>
          window.id === id
            ? { ...window, state: 'minimized' as WindowState, focused: false }
            : window,
        );
        const next = nextFocusable(windows);
        return {
          windows: next ? focus(windows, next.id) : windows,
          activeWindowId: next?.id ?? null,
        };
      });
    },

    maximizeWindow(id, workArea) {
      set((state) => ({
        windows: focus(
          state.windows.map((window) =>
            window.id === id
              ? {
                  ...window,
                  restoreBounds: window.state === 'normal' ? window.bounds : window.restoreBounds,
                  bounds: workArea,
                  state: 'maximized' as WindowState,
                }
              : window,
          ),
          id,
        ),
        activeWindowId: id,
      }));
    },

    restoreWindow(id) {
      set((state) => ({
        windows: focus(
          state.windows.map((window) =>
            window.id === id
              ? {
                  ...window,
                  bounds: window.restoreBounds ?? window.bounds,
                  restoreBounds: null,
                  state: 'normal' as WindowState,
                }
              : window,
          ),
          id,
        ),
        activeWindowId: id,
      }));
    },

    toggleMaximize(id, workArea) {
      const window = get().windows.find((item) => item.id === id);
      if (!window) return;
      if (window.state === 'maximized') get().restoreWindow(id);
      else get().maximizeWindow(id, workArea);
    },

    updateBounds(id, bounds) {
      set((state) => ({
        windows: state.windows.map((window) =>
          window.id === id && window.state === 'normal'
            ? {
                ...window,
                bounds: {
                  x: bounds.x ?? window.bounds.x,
                  y: bounds.y ?? window.bounds.y,
                  width: Math.max(320, bounds.width ?? window.bounds.width),
                  height: Math.max(220, bounds.height ?? window.bounds.height),
                },
              }
            : window,
        ),
      }));
    },

    updatePayload(id, payload) {
      set((state) => ({
        windows: state.windows.map((window) =>
          window.id === id ? { ...window, payload: { ...window.payload, ...payload } } : window,
        ),
      }));
    },

    snapWindow(id, position, workArea) {
      if (position === 'top') {
        get().maximizeWindow(id, workArea);
        return;
      }
      const window = get().windows.find((item) => item.id === id);
      if (!window) return;
      const half = Math.floor(workArea.width / 2);
      const bounds: WindowBounds = {
        x: position === 'left' ? workArea.x : workArea.x + half,
        y: workArea.y,
        width: position === 'left' ? half : workArea.width - half,
        height: workArea.height,
      };
      set((state) => ({
        windows: focus(
          state.windows.map((item) =>
            item.id === id
              ? {
                  ...item,
                  restoreBounds: item.state === 'normal' ? item.bounds : item.restoreBounds,
                  bounds,
                  state: 'normal' as WindowState,
                }
              : item,
          ),
          id,
        ),
        activeWindowId: id,
      }));
    },

    cycleFocus(direction = 1) {
      const candidates = get()
        .windows.filter((window) => window.state !== 'minimized')
        .sort((left, right) => right.zIndex - left.zIndex);
      if (candidates.length === 0) return;
      const currentIndex = candidates.findIndex((window) => window.id === get().activeWindowId);
      const nextIndex = (currentIndex + direction + candidates.length) % candidates.length;
      const next = candidates[nextIndex];
      if (next) get().focusWindow(next.id);
    },

    showDesktop() {
      const state = get();
      if (state.desktopRestoreIds.length > 0) {
        const restore = new Set(state.desktopRestoreIds);
        const windows = state.windows.map((window) =>
          restore.has(window.id) ? { ...window, state: 'normal' as WindowState } : window,
        );
        const next = nextFocusable(windows);
        set({
          windows: next ? focus(windows, next.id) : windows,
          activeWindowId: next?.id ?? null,
          desktopRestoreIds: [],
        });
        return;
      }
      const visible = state.windows
        .filter((window) => window.state !== 'minimized')
        .map((window) => window.id);
      set({
        windows: state.windows.map((window) => ({
          ...window,
          state: visible.includes(window.id) ? 'minimized' : window.state,
          focused: false,
        })),
        activeWindowId: null,
        desktopRestoreIds: visible,
      });
    },

    reset() {
      set({ windows: [], activeWindowId: null, desktopRestoreIds: [] });
    },
  }));
}

export const windowManagerStore = createWindowManagerStore();
