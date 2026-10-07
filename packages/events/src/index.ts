import type { SystemEventMap } from '@nexos/types';

type EventName = keyof SystemEventMap;
type EventListener<K extends EventName> = (payload: SystemEventMap[K]) => void;

export class TypedEventBus {
  readonly #listeners = new Map<EventName, Set<(payload: never) => void>>();

  on<K extends EventName>(event: K, listener: EventListener<K>): () => void {
    const listeners = this.#listeners.get(event) ?? new Set<(payload: never) => void>();
    listeners.add(listener as (payload: never) => void);
    this.#listeners.set(event, listeners);
    return () => this.off(event, listener);
  }

  once<K extends EventName>(event: K, listener: EventListener<K>): () => void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      listener(payload);
    });
    return unsubscribe;
  }

  off<K extends EventName>(event: K, listener: EventListener<K>): void {
    const listeners = this.#listeners.get(event);
    listeners?.delete(listener as (payload: never) => void);
    if (listeners?.size === 0) this.#listeners.delete(event);
  }

  emit<K extends EventName>(event: K, payload: SystemEventMap[K]): void {
    const listeners = this.#listeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload as never);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  clear(): void {
    this.#listeners.clear();
  }
}
