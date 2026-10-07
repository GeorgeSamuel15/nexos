import { describe, expect, it } from 'vitest';

import {
  decodeRuntimeFrame,
  encodeRuntimeFrame,
  RuntimeProtocolClient,
  RuntimeProtocolServer,
  type HostSystemSnapshot,
  type RuntimeHostAdapter,
} from './index.js';

const snapshot: HostSystemSnapshot = {
  platform: 'nexos-test',
  release: '1.0',
  architecture: 'x64',
  hostname: 'test-host',
  cpuModel: 'Test CPU',
  cpuCount: 4,
  totalMemory: 8_000,
  freeMemory: 4_000,
  uptime: 60,
  electronVersion: '38.8.6',
  nodeVersion: '22.0.0',
  chromeVersion: '140.0.0',
};

describe('runtime protocol', () => {
  it('round-trips host information over the versioned binary frame', async () => {
    const host: RuntimeHostAdapter = { systemInformation: () => snapshot };
    const client = new RuntimeProtocolClient(new RuntimeProtocolServer(host));
    await expect(client.systemInformation()).resolves.toEqual(snapshot);
  });

  it('rejects truncated and mismatched frames', () => {
    expect(() => decodeRuntimeFrame(new Uint8Array([1, 2, 3]))).toThrow(/truncated/i);
    const encoded = encodeRuntimeFrame({
      kind: 'request',
      requestId: 7,
      payload: new TextEncoder().encode('{}'),
    });
    encoded[15] = 20;
    expect(() => decodeRuntimeFrame(encoded)).toThrow(/length/i);
  });
});
