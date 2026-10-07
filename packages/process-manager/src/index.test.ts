import { describe, expect, it } from 'vitest';

import { TypedEventBus } from '@nexos/events';

import { ProcessManager } from './index.js';

describe('ProcessManager', () => {
  it('starts, lists and stops processes', () => {
    const manager = new ProcessManager(new TypedEventBus(), { random: () => 0.5 });
    const process = manager.start('com.nexos.notes', 'Notes');
    expect(process.pid).toBe(100);
    expect(manager.list()).toHaveLength(1);
    manager.stop(process.pid);
    expect(manager.list()).toHaveLength(0);
  });

  it('reuses a process for a second window', () => {
    const manager = new ProcessManager(new TypedEventBus());
    const first = manager.start('com.nexos.text-editor', 'Text Editor');
    const second = manager.start('com.nexos.text-editor', 'Text Editor');
    expect(second.pid).toBe(first.pid);
    expect(second.windowCount).toBe(2);
  });
});
