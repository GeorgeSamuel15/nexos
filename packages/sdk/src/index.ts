import type { NexOSBridge } from '@nexos/types';

let configuredBridge: NexOSBridge | null = null;

export function configureNexOSBridge(bridge: NexOSBridge): void {
  configuredBridge = bridge;
}

export function getNexOS(): NexOSBridge {
  if (configuredBridge) return configuredBridge;
  if (typeof window !== 'undefined' && window.nexos) return window.nexos;
  throw new Error('NexOS SDK is unavailable outside the NexOS application runtime.');
}

export const nexos = new Proxy({} as NexOSBridge, {
  get(_target, property: keyof NexOSBridge) {
    return getNexOS()[property];
  },
});

export type { NexOSBridge } from '@nexos/types';
