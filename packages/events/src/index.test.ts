import { describe, expect, it, vi } from 'vitest';

import { TypedEventBus } from './index.js';

describe('TypedEventBus', () => {
  it('delivers typed events and supports unsubscription', () => {
    const bus = new TypedEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.on('file:created', listener);

    bus.emit('file:created', { path: '/home/hello.txt', kind: 'file' });
    unsubscribe();
    bus.emit('file:created', { path: '/home/ignored.txt', kind: 'file' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ path: '/home/hello.txt', kind: 'file' });
  });
});
