import { describe, expect, it } from 'vitest';

import { createWindowManagerStore } from './index.js';

describe('window manager', () => {
  it('creates, focuses, minimizes and closes windows', () => {
    const store = createWindowManagerStore();
    const first = store.getState().createWindow({
      applicationId: 'com.nexos.files',
      processId: 100,
      title: 'Files',
      icon: 'folder',
    });
    const second = store.getState().createWindow({
      applicationId: 'com.nexos.notes',
      processId: 101,
      title: 'Notes',
      icon: 'notebook',
    });
    expect(store.getState().activeWindowId).toBe(second);
    store.getState().focusWindow(first);
    expect(store.getState().activeWindowId).toBe(first);
    store.getState().minimizeWindow(first);
    expect(store.getState().activeWindowId).toBe(second);
    store.getState().closeWindow(second);
    expect(store.getState().windows).toHaveLength(1);
  });

  it('snaps a window to half the work area', () => {
    const store = createWindowManagerStore();
    const id = store.getState().createWindow({
      applicationId: 'com.nexos.files',
      processId: 100,
      title: 'Files',
      icon: 'folder',
    });
    store.getState().snapWindow(id, 'left', { x: 0, y: 0, width: 1200, height: 800 });
    expect(store.getState().windows[0]?.bounds).toEqual({ x: 0, y: 0, width: 600, height: 800 });
  });
});
