import { createHash, createPublicKey, verify } from 'node:crypto';

import { NexOSError } from '@nexos/core';
import type {
  AppPublisher,
  NxAppPackage,
  PackageInspection,
  PackageProvenance,
  PublisherTrust,
} from '@nexos/types';

export interface TrustedPublisher {
  publisherId: string;
  keyId: string;
  publicKey: string;
  trust: Exclude<PublisherTrust, 'system' | 'community' | 'unsigned'>;
}

function canonicalValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new NexOSError('APP_INVALID', 'Package contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalValue(child)}`)
      .join(',')}}`;
  }
  throw new NexOSError('APP_INVALID', 'Package contains an unsupported value.');
}

export function canonicalPackagePayload(package_: NxAppPackage): string {
  const { signature: _signature, ...unsignedPackage } = package_;
  void _signature;
  return canonicalValue(unsignedPackage);
}

function publicPublisher(publisher: AppPublisher): NonNullable<PackageProvenance['publisher']> {
  return { id: publisher.id, name: publisher.name, keyId: publisher.keyId };
}

export class PackageTrustService {
  readonly #trustedPublishers: ReadonlyMap<string, TrustedPublisher>;

  constructor(trustedPublishers: readonly TrustedPublisher[] = []) {
    this.#trustedPublishers = new Map(
      trustedPublishers.map((publisher) => [
        `${publisher.publisherId}:${publisher.keyId}`,
        publisher,
      ]),
    );
  }

  inspect(package_: NxAppPackage, bytes: Uint8Array): PackageInspection {
    const packageHash = createHash('sha256').update(bytes).digest('hex');
    const signature = package_.signature;
    const publisher = package_.publisher;
    if (!signature) {
      return {
        manifest: package_.manifest,
        provenance: {
          publisher: publisher ? publicPublisher(publisher) : null,
          trust: 'unsigned',
          packageHash,
          signatureVerified: false,
        },
      };
    }
    if (!publisher) {
      throw new NexOSError('APP_INVALID', 'Signed packages must include publisher metadata.');
    }
    if (signature.keyId !== publisher.keyId) {
      throw new NexOSError('APP_INVALID', 'Publisher and signature key identifiers do not match.');
    }

    const trusted = this.#trustedPublishers.get(`${publisher.id}:${publisher.keyId}`);
    if (trusted && trusted.publicKey.trim() !== publisher.publicKey.trim()) {
      throw new NexOSError(
        'APP_INVALID',
        'The package publisher key does not match the trusted key.',
      );
    }
    let valid = false;
    try {
      valid = verify(
        null,
        Buffer.from(canonicalPackagePayload(package_), 'utf8'),
        createPublicKey(trusted?.publicKey ?? publisher.publicKey),
        Buffer.from(signature.value, 'base64'),
      );
    } catch (error) {
      throw new NexOSError(
        'APP_INVALID',
        'The package signature could not be verified.',
        {},
        { cause: error },
      );
    }
    if (!valid) throw new NexOSError('APP_INVALID', 'The package signature is invalid.');

    return {
      manifest: package_.manifest,
      provenance: {
        publisher: publicPublisher(publisher),
        trust: trusted?.trust ?? 'community',
        packageHash,
        signatureVerified: true,
      },
    };
  }
}
