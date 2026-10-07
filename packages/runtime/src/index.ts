import { arch, cpus, freemem, hostname, platform, release, totalmem, uptime } from 'node:os';

import { z } from 'zod';

export const runtimeProtocolVersion = 1;
export const runtimeFrameHeaderLength = 16;
export const runtimeMaximumPayloadBytes = 1024 * 1024;

const magic = new Uint8Array([0x4e, 0x58, 0x4f, 0x53]);

export type RuntimeFrameKind = 'request' | 'response';

export interface RuntimeFrame {
  kind: RuntimeFrameKind;
  requestId: number;
  payload: Uint8Array;
}

export interface HostSystemSnapshot {
  platform: string;
  release: string;
  architecture: string;
  hostname: string;
  cpuModel: string;
  cpuCount: number;
  totalMemory: number;
  freeMemory: number;
  uptime: number;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
}

export interface RuntimeHostAdapter {
  systemInformation(): HostSystemSnapshot;
}

export class NodeRuntimeHostAdapter implements RuntimeHostAdapter {
  systemInformation(): HostSystemSnapshot {
    const cpu = cpus()[0];
    return {
      platform: platform(),
      release: release(),
      architecture: arch(),
      hostname: hostname(),
      cpuModel: cpu?.model ?? 'Unknown CPU',
      cpuCount: cpus().length,
      totalMemory: totalmem(),
      freeMemory: freemem(),
      uptime: uptime(),
      electronVersion: process.versions['electron'] ?? 'not-running-in-electron',
      nodeVersion: process.versions.node,
      chromeVersion: process.versions['chrome'] ?? 'not-running-in-electron',
    };
  }
}

export function encodeRuntimeFrame(frame: RuntimeFrame): Uint8Array {
  if (!Number.isInteger(frame.requestId) || frame.requestId < 0 || frame.requestId > 0xffffffff) {
    throw new Error('Runtime request ID must be an unsigned 32-bit integer.');
  }
  if (frame.payload.byteLength > runtimeMaximumPayloadBytes) {
    throw new Error('Runtime frame payload exceeds the 1 MiB limit.');
  }
  const encoded = new Uint8Array(runtimeFrameHeaderLength + frame.payload.byteLength);
  encoded.set(magic, 0);
  const view = new DataView(encoded.buffer);
  view.setUint16(4, runtimeProtocolVersion, false);
  view.setUint8(6, frame.kind === 'request' ? 1 : 2);
  view.setUint8(7, 0);
  view.setUint32(8, frame.requestId, false);
  view.setUint32(12, frame.payload.byteLength, false);
  encoded.set(frame.payload, runtimeFrameHeaderLength);
  return encoded;
}

export function decodeRuntimeFrame(encoded: Uint8Array): RuntimeFrame {
  if (encoded.byteLength < runtimeFrameHeaderLength) throw new Error('Runtime frame is truncated.');
  if (!magic.every((value, index) => encoded[index] === value)) {
    throw new Error('Runtime frame magic is invalid.');
  }
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const version = view.getUint16(4, false);
  if (version !== runtimeProtocolVersion) {
    throw new Error(`Unsupported runtime protocol version: ${version}`);
  }
  const kindValue = view.getUint8(6);
  if (kindValue !== 1 && kindValue !== 2) throw new Error('Runtime frame kind is invalid.');
  const payloadLength = view.getUint32(12, false);
  if (payloadLength > runtimeMaximumPayloadBytes) throw new Error('Runtime payload is too large.');
  if (encoded.byteLength !== runtimeFrameHeaderLength + payloadLength) {
    throw new Error('Runtime frame length does not match its header.');
  }
  return {
    kind: kindValue === 1 ? 'request' : 'response',
    requestId: view.getUint32(8, false),
    payload: encoded.slice(runtimeFrameHeaderLength),
  };
}

const hostSystemSnapshotSchema = z.object({
  platform: z.string(),
  release: z.string(),
  architecture: z.string(),
  hostname: z.string(),
  cpuModel: z.string(),
  cpuCount: z.number().int().nonnegative(),
  totalMemory: z.number().nonnegative(),
  freeMemory: z.number().nonnegative(),
  uptime: z.number().nonnegative(),
  electronVersion: z.string(),
  nodeVersion: z.string(),
  chromeVersion: z.string(),
});

const requestPayloadSchema = z.object({
  method: z.literal('system.information'),
  parameters: z.object({}).strict(),
});

const responsePayloadSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: hostSystemSnapshotSchema }),
  z.object({ ok: z.literal(false), error: z.string().min(1).max(500) }),
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export interface RuntimeTransport {
  exchange(frame: Uint8Array): Promise<Uint8Array>;
}

export class RuntimeProtocolServer implements RuntimeTransport {
  constructor(private readonly host: RuntimeHostAdapter) {}

  async exchange(encoded: Uint8Array): Promise<Uint8Array> {
    const frame = decodeRuntimeFrame(encoded);
    if (frame.kind !== 'request') throw new Error('Runtime server expected a request frame.');
    let response: z.infer<typeof responsePayloadSchema>;
    try {
      const request = requestPayloadSchema.parse(
        JSON.parse(decoder.decode(frame.payload)) as unknown,
      );
      response =
        request.method === 'system.information'
          ? { ok: true, value: this.host.systemInformation() }
          : { ok: false, error: 'Unsupported runtime method.' };
    } catch (error) {
      response = {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 500) : 'Invalid runtime request.',
      };
    }
    return encodeRuntimeFrame({
      kind: 'response',
      requestId: frame.requestId,
      payload: encoder.encode(JSON.stringify(response)),
    });
  }
}

export class RuntimeProtocolClient {
  #nextRequestId = 1;

  constructor(private readonly transport: RuntimeTransport) {}

  async systemInformation(): Promise<HostSystemSnapshot> {
    const requestId = this.#nextRequestId++;
    const request = encodeRuntimeFrame({
      kind: 'request',
      requestId,
      payload: encoder.encode(JSON.stringify({ method: 'system.information', parameters: {} })),
    });
    const responseFrame = decodeRuntimeFrame(await this.transport.exchange(request));
    if (responseFrame.kind !== 'response' || responseFrame.requestId !== requestId) {
      throw new Error('Runtime response did not match the request.');
    }
    const response = responsePayloadSchema.parse(
      JSON.parse(decoder.decode(responseFrame.payload)) as unknown,
    );
    if (!response.ok) throw new Error(response.error);
    return response.value;
  }
}
