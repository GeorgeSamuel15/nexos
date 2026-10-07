import { generateKeyPairSync, sign } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultSettings, type NxAppPackage } from '@nexos/types';

import { NexOSSystemService } from './index.js';
import { canonicalPackagePayload } from './package-trust.js';
import {
  OnlineRegistryClient,
  PackageRegistryService,
  type RegistryTransport,
  validateRegistryUrl,
} from './registry-service.js';

const textEncoder = new TextEncoder();

class QueueTransport implements RegistryTransport {
  readonly requests: URL[] = [];

  constructor(private readonly responses: Uint8Array[]) {}

  async request(url: URL): Promise<Uint8Array> {
    this.requests.push(new URL(url));
    const response = this.responses.shift();
    if (!response) throw new Error('No queued registry response.');
    return response;
  }
}

const remotePackage: NxAppPackage = {
  format: 'nexos-app-v1',
  manifest: {
    id: 'community.example.reader',
    name: 'Example Reader',
    description: 'A registry test package.',
    version: '1.0.0',
    icon: 'file',
    entry: 'application.json',
    runtime: 'declarative',
    permissions: [],
    singleInstance: true,
    system: false,
    defaultWidth: 600,
    defaultHeight: 480,
    fileExtensions: [],
  },
  application: {
    kind: 'document-viewer',
    title: 'Example Reader',
    body: 'Remote package content.',
  },
  assets: {},
};

describe('registry URL policy', () => {
  it('allows public HTTPS registry URLs', () => {
    expect(validateRegistryUrl('https://registry.example.com/nexos').hostname).toBe(
      'registry.example.com',
    );
  });

  it.each([
    'http://registry.example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.0.4',
    'https://[::1]',
    'https://[fc00::1]',
    'https://user:password@registry.example.com',
  ])('rejects unsafe registry URL %s', (url) => {
    expect(() => validateRegistryUrl(url)).toThrow();
  });
});

describe('online registry client', () => {
  it('validates bounded search responses and encodes the query', async () => {
    const transport = new QueueTransport([
      textEncoder.encode(
        JSON.stringify({
          packages: [
            {
              name: 'example-reader',
              manifest: remotePackage.manifest,
              publisherName: 'Example Community',
              signed: true,
            },
          ],
        }),
      ),
    ]);
    const client = new OnlineRegistryClient(transport);

    await expect(client.search('https://registry.example.com', 'reader app')).resolves.toHaveLength(
      1,
    );
    expect(transport.requests[0]?.pathname).toBe('/v1/packages');
    expect(transport.requests[0]?.searchParams.get('q')).toBe('reader app');
  });
});

describe('package registry service', () => {
  let system: NexOSSystemService;

  beforeEach(async () => {
    system = new NexOSSystemService({ dataDirectory: '.', databasePath: ':memory:' });
    system.initialize();
    await system.users.create({
      username: 'registry-user',
      displayName: 'Registry User',
      password: 'a-strong-password',
    });
  });

  afterEach(() => system.close());

  it('does not contact the network while online registry access is disabled', async () => {
    const transport = new QueueTransport([]);
    const registry = new PackageRegistryService(
      system.applications,
      {
        get: () => defaultSettings,
      },
      new OnlineRegistryClient(transport),
    );

    await expect(registry.search('focus')).resolves.toMatchObject([
      { name: 'focus-timer', signed: false },
    ]);
    expect(transport.requests).toHaveLength(0);
  });

  it('rejects unsigned packages delivered by an online registry', async () => {
    const transport = new QueueTransport([textEncoder.encode(JSON.stringify(remotePackage))]);
    const registry = new PackageRegistryService(
      system.applications,
      {
        get: () => ({
          registryEnabled: true,
          registryUrl: 'https://registry.example.com',
        }),
      },
      new OnlineRegistryClient(transport),
    );

    await expect(registry.install('example-reader')).rejects.toThrow(/signature/i);
    expect(
      system.applications.list().some((app) => app.manifest.id === remotePackage.manifest.id),
    ).toBe(false);
  });

  it('downloads, verifies, and applies a newer signed registry package', async () => {
    system.applications.installPackage(textEncoder.encode(JSON.stringify(remotePackage)));
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publisher = {
      id: 'dev.example.publisher',
      name: 'Example Publisher',
      keyId: 'example-key-1',
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    };
    const unsignedUpdate: NxAppPackage = {
      ...remotePackage,
      manifest: { ...remotePackage.manifest, version: '1.1.0' },
      publisher,
    };
    const update: NxAppPackage = {
      ...unsignedUpdate,
      signature: {
        algorithm: 'ed25519',
        keyId: publisher.keyId,
        value: sign(
          null,
          Buffer.from(canonicalPackagePayload(unsignedUpdate), 'utf8'),
          privateKey,
        ).toString('base64'),
        signedAt: '2026-10-04T00:00:00.000Z',
      },
    };
    const transport = new QueueTransport([
      textEncoder.encode(
        JSON.stringify({
          packages: [
            {
              name: 'example-reader',
              manifest: update.manifest,
              publisherName: publisher.name,
              signed: true,
            },
          ],
        }),
      ),
      textEncoder.encode(JSON.stringify(update)),
    ]);
    const registry = new PackageRegistryService(
      system.applications,
      {
        get: () => ({
          registryEnabled: true,
          registryUrl: 'https://registry.example.com',
        }),
      },
      new OnlineRegistryClient(transport),
    );

    await expect(registry.command(['update'])).resolves.toBe('Updated Example Reader 1.1.0.');
    expect(system.applications.get(remotePackage.manifest.id)).toMatchObject({
      manifest: { version: '1.1.0' },
      provenance: { trust: 'community', signatureVerified: true },
    });
  });
});
