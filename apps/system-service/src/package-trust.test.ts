import { generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { nxAppPackageSchema, type NxAppPackage } from '@nexos/types';

import { canonicalPackagePayload, PackageTrustService } from './package-trust.js';

function signedPackage(): { package_: NxAppPackage; publicKey: string } {
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const unsigned = nxAppPackageSchema.parse({
    format: 'nexos-app-v1',
    manifest: {
      id: 'dev.example.reader',
      name: 'Example Reader',
      description: 'A signed test package.',
      version: '1.0.0',
      icon: 'file',
      entry: 'application.json',
      runtime: 'declarative',
      permissions: ['filesystem.read'],
      singleInstance: true,
      system: false,
      defaultWidth: 640,
      defaultHeight: 480,
      fileExtensions: ['.txt'],
    },
    application: {
      kind: 'document-viewer',
      title: 'Signed package',
      body: 'Verified content',
    },
    assets: {},
    publisher: {
      id: 'dev.example',
      name: 'Example Publisher',
      keyId: 'release-2026',
      publicKey,
    },
  });
  const signature = sign(
    null,
    Buffer.from(canonicalPackagePayload(unsigned), 'utf8'),
    keys.privateKey,
  ).toString('base64');
  return {
    package_: nxAppPackageSchema.parse({
      ...unsigned,
      signature: {
        algorithm: 'ed25519',
        keyId: 'release-2026',
        value: signature,
        signedAt: '2026-10-04T20:00:00.000Z',
      },
    }),
    publicKey,
  };
}

function bytes(package_: NxAppPackage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(package_));
}

describe('PackageTrustService', () => {
  it('verifies self-signed community packages', () => {
    const { package_ } = signedPackage();
    const inspection = new PackageTrustService().inspect(package_, bytes(package_));
    expect(inspection.provenance).toMatchObject({
      trust: 'community',
      signatureVerified: true,
      publisher: { id: 'dev.example', keyId: 'release-2026' },
    });
    expect(inspection.provenance.packageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('promotes publisher keys present in the trusted store', () => {
    const { package_, publicKey } = signedPackage();
    const inspection = new PackageTrustService([
      {
        publisherId: 'dev.example',
        keyId: 'release-2026',
        publicKey,
        trust: 'verified',
      },
    ]).inspect(package_, bytes(package_));
    expect(inspection.provenance.trust).toBe('verified');
  });

  it('rejects content changed after signing', () => {
    const { package_ } = signedPackage();
    const tampered = nxAppPackageSchema.parse({
      ...package_,
      application: { ...package_.application, body: 'Tampered content' },
    });
    expect(() => new PackageTrustService().inspect(tampered, bytes(tampered))).toThrow(
      /signature is invalid/i,
    );
  });

  it('marks packages without signatures as unsigned', () => {
    const { signature: _signature, publisher: _publisher, ...package_ } = signedPackage().package_;
    void _signature;
    void _publisher;
    const unsigned = nxAppPackageSchema.parse(package_);
    expect(new PackageTrustService().inspect(unsigned, bytes(unsigned)).provenance.trust).toBe(
      'unsigned',
    );
  });
});
