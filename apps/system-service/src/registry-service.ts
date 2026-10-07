import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

import { NexOSError } from '@nexos/core';
import {
  nxAppPackageSchema,
  registrySearchResponseSchema,
  type InstalledApplication,
  type NexOSSettings,
  type NxAppPackage,
  type RegistryPackageSummary,
  type RegistryStatus,
} from '@nexos/types';

import type { ApplicationService } from './application-service.js';

const searchResponseLimit = 512 * 1024;
const packageResponseLimit = 5 * 1024 * 1024;
const requestTimeoutMs = 10_000;
const packageNamePattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

function compareVersions(left: string, right: string): number {
  const [leftCore = '', leftPre] = left.split('-', 2);
  const [rightCore = '', rightPre] = right.split('-', 2);
  const leftParts = leftCore.split('.').map(Number);
  const rightParts = rightCore.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (leftPre === undefined && rightPre !== undefined) return 1;
  if (leftPre !== undefined && rightPre === undefined) return -1;
  return (leftPre ?? '').localeCompare(rightPre ?? '', undefined, { numeric: true });
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return false;
  const [first = 0, second = 0, third = 0] = parts;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && (third === 0 || third === 2)) return false;
  if (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
    return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase().split('%')[0] ?? '';
  if (normalized.startsWith('::ffff:')) {
    return isPublicIpv4(normalized.slice('::ffff:'.length));
  }
  const firstGroup = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return firstGroup >= 0x2000 && firstGroup <= 0x3fff && !normalized.startsWith('2001:db8:');
}

export function validateRegistryUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    throw new NexOSError(
      'INVALID_INPUT',
      'The package registry URL is invalid.',
      {},
      { cause: error },
    );
  }
  if (url.protocol !== 'https:')
    throw new NexOSError('INVALID_INPUT', 'Package registries must use HTTPS.');
  if (url.username || url.password)
    throw new NexOSError('INVALID_INPUT', 'Package registry URLs cannot include credentials.');
  if (url.search || url.hash)
    throw new NexOSError('INVALID_INPUT', 'Package registry URLs cannot include a query or hash.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const addressHostname =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    (isIP(addressHostname) !== 0 && !isPublicIp(addressHostname))
  ) {
    throw new NexOSError('INVALID_INPUT', 'The package registry must use a public network host.');
  }
  return url;
}

export interface RegistryTransport {
  request(url: URL, maximumBytes: number): Promise<Uint8Array>;
}

export interface RegistrySettingsSource {
  get(): Pick<NexOSSettings, 'registryEnabled' | 'registryUrl'>;
}

function validateRegistryRequestUrl(input: URL): URL {
  const base = new URL(input);
  const search = base.search;
  base.search = '';
  const validated = validateRegistryUrl(base.toString());
  validated.search = search;
  return validated;
}

export class NodeHttpsRegistryTransport implements RegistryTransport {
  async request(url: URL, maximumBytes: number): Promise<Uint8Array> {
    const safeUrl = validateRegistryRequestUrl(url);
    let addresses: Awaited<ReturnType<typeof lookup>>[];
    try {
      const hostname = safeUrl.hostname.replace(/^\[|\]$/g, '');
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw new NexOSError(
        'NETWORK_ERROR',
        'The package registry host could not be resolved.',
        {},
        { cause: error },
      );
    }
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
      throw new NexOSError(
        'NETWORK_ERROR',
        'The package registry resolved to a blocked network address.',
      );
    }
    const pinned = addresses[0];
    if (!pinned)
      throw new NexOSError('NETWORK_ERROR', 'The package registry did not resolve to an address.');

    return await new Promise<Uint8Array>((resolve, reject) => {
      const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
        callback(null, pinned.address, pinned.family);
      };
      const request = httpsRequest(
        safeUrl,
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'user-agent': 'NexOS-Package-Client/0.2',
          },
          lookup: pinnedLookup,
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(
              new NexOSError(
                'NETWORK_ERROR',
                `The package registry returned HTTP ${response.statusCode ?? 'unknown'}.`,
              ),
            );
            return;
          }
          const contentType = response.headers['content-type'] ?? '';
          if (!contentType.toLowerCase().includes('json')) {
            response.resume();
            reject(
              new NexOSError('NETWORK_ERROR', 'The package registry returned a non-JSON response.'),
            );
            return;
          }
          const declaredLength = Number(response.headers['content-length'] ?? 0);
          if (declaredLength > maximumBytes) {
            response.destroy();
            reject(new NexOSError('NETWORK_ERROR', 'The package registry response is too large.'));
            return;
          }
          const chunks: Buffer[] = [];
          let length = 0;
          response.on('data', (chunk: Buffer) => {
            length += chunk.byteLength;
            if (length > maximumBytes) {
              response.destroy(
                new NexOSError('NETWORK_ERROR', 'The package registry response is too large.'),
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        },
      );
      request.setTimeout(requestTimeoutMs, () => {
        request.destroy(new NexOSError('NETWORK_ERROR', 'The package registry request timed out.'));
      });
      request.on('error', (error) => {
        reject(
          error instanceof NexOSError
            ? error
            : new NexOSError(
                'NETWORK_ERROR',
                'The package registry request failed.',
                {},
                { cause: error },
              ),
        );
      });
      request.end();
    });
  }
}

function parseJson(bytes: Uint8Array, context: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new NexOSError(
      'NETWORK_ERROR',
      `The package registry returned invalid ${context} JSON.`,
      {},
      { cause: error },
    );
  }
}

export class OnlineRegistryClient {
  constructor(private readonly transport: RegistryTransport = new NodeHttpsRegistryTransport()) {}

  async search(baseUrl: string, query: string): Promise<RegistryPackageSummary[]> {
    const url = this.endpoint(baseUrl, 'v1/packages');
    if (query.trim()) url.searchParams.set('q', query.trim());
    const bytes = await this.transport.request(url, searchResponseLimit);
    const parsed = registrySearchResponseSchema.safeParse(parseJson(bytes, 'search response'));
    if (!parsed.success) {
      throw new NexOSError('NETWORK_ERROR', 'The package registry search response is invalid.', {
        validation: parsed.error.issues.map((issue) => issue.message).join('; '),
      });
    }
    return parsed.data.packages;
  }

  async download(
    baseUrl: string,
    packageName: string,
  ): Promise<{
    package_: NxAppPackage;
    bytes: Uint8Array;
  }> {
    if (!packageNamePattern.test(packageName))
      throw new NexOSError('INVALID_INPUT', 'The package name is invalid.');
    const url = this.endpoint(baseUrl, `v1/packages/${encodeURIComponent(packageName)}`);
    const bytes = await this.transport.request(url, packageResponseLimit);
    const parsed = nxAppPackageSchema.safeParse(parseJson(bytes, 'package'));
    if (!parsed.success) {
      throw new NexOSError('APP_INVALID', 'The registry package failed validation.', {
        validation: parsed.error.issues.map((issue) => issue.message).join('; '),
      });
    }
    return { package_: parsed.data, bytes };
  }

  private endpoint(baseUrl: string, relativePath: string): URL {
    const base = validateRegistryUrl(baseUrl);
    const normalizedPath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
    base.pathname = `${normalizedPath}${relativePath}`.replace(/\/+/g, '/');
    return base;
  }
}

export class PackageRegistryService {
  constructor(
    private readonly applications: ApplicationService,
    private readonly settings: RegistrySettingsSource,
    private readonly online = new OnlineRegistryClient(),
  ) {}

  status(): RegistryStatus {
    const settings = this.settings.get();
    return {
      enabled: settings.registryEnabled,
      url: settings.registryUrl,
      mode: settings.registryEnabled ? 'online' : 'local',
    };
  }

  async search(query: string): Promise<RegistryPackageSummary[]> {
    const normalized = query.trim().slice(0, 300);
    const local = this.applications.searchLocalRegistry(normalized);
    const status = this.status();
    if (!status.enabled) return local;
    const remote = await this.online.search(status.url, normalized);
    const results = new Map(local.map((entry) => [entry.name, entry]));
    for (const entry of remote) results.set(entry.name, entry);
    return [...results.values()];
  }

  async install(packageName: string): Promise<InstalledApplication> {
    if (!packageNamePattern.test(packageName))
      throw new NexOSError('INVALID_INPUT', 'The package name is invalid.');
    const local = this.applications.getLocalRegistryPackage(packageName);
    if (local) {
      return this.applications.installPackage(new TextEncoder().encode(JSON.stringify(local)));
    }
    const status = this.status();
    if (!status.enabled) {
      throw new NexOSError(
        'PERMISSION_DENIED',
        'Online package access is disabled. Enable it in Settings before installing this package.',
      );
    }
    const downloaded = await this.online.download(status.url, packageName);
    const inspection = this.applications.packageInfo(downloaded.bytes);
    if (!downloaded.package_.signature || !inspection.provenance.signatureVerified) {
      throw new NexOSError(
        'APP_INVALID',
        'Packages installed from an online registry must have a valid publisher signature.',
      );
    }
    return this.applications.installPackage(downloaded.bytes);
  }

  async updateAll(): Promise<string[]> {
    const available = await this.search('');
    const installed = this.applications.list().filter((application) => !application.builtin);
    const updates = available.filter((entry) => {
      const current = installed.find(
        (application) => application.manifest.id === entry.manifest.id,
      );
      return (
        current !== undefined &&
        compareVersions(entry.manifest.version, current.manifest.version) > 0
      );
    });
    const updated: string[] = [];
    for (const entry of updates) {
      const local = this.applications.getLocalRegistryPackage(entry.name);
      if (local) {
        const bytes = new TextEncoder().encode(JSON.stringify(local));
        this.applications.updatePackage(bytes);
      } else {
        const status = this.status();
        if (!status.enabled) continue;
        const downloaded = await this.online.download(status.url, entry.name);
        const inspection = this.applications.packageInfo(downloaded.bytes);
        if (!downloaded.package_.signature || !inspection.provenance.signatureVerified) {
          throw new NexOSError(
            'APP_INVALID',
            `Update ${entry.name} does not have a valid publisher signature.`,
          );
        }
        this.applications.updatePackage(downloaded.bytes);
      }
      updated.push(`${entry.manifest.name} ${entry.manifest.version}`);
    }
    return updated;
  }

  async command(arguments_: readonly string[]): Promise<string> {
    const [command, packageName] = arguments_;
    switch (command) {
      case 'list':
        return this.applications
          .list()
          .map(
            (application) =>
              `${application.manifest.name} ${application.manifest.version} [${application.provenance.trust}]`,
          )
          .join('\n');
      case 'search': {
        const results = await this.search(packageName ?? '');
        return results.length
          ? results.map((entry) => `${entry.name}  ${entry.manifest.description}`).join('\n')
          : 'No packages found.';
      }
      case 'info': {
        if (!packageName) throw new NexOSError('INVALID_INPUT', 'Usage: nx info <package>');
        const entry = (await this.search(packageName)).find((item) => item.name === packageName);
        if (!entry) throw new NexOSError('APP_NOT_FOUND', `Package not found: ${packageName}`);
        return `${entry.manifest.name} ${entry.manifest.version}\n${entry.manifest.description}\nPublisher: ${entry.publisherName ?? 'Not declared'}\nSigned: ${entry.signed ? 'yes' : 'no'}\nPermissions: ${entry.manifest.permissions.join(', ') || 'none'}`;
      }
      case 'install': {
        if (!packageName) throw new NexOSError('INVALID_INPUT', 'Usage: nx install <package>');
        const installed = await this.install(packageName);
        return `Installed ${installed.manifest.name} ${installed.manifest.version}.`;
      }
      case 'remove': {
        if (!packageName) throw new NexOSError('INVALID_INPUT', 'Usage: nx remove <package-id>');
        const application = this.applications
          .list()
          .find(
            (item) =>
              item.manifest.id === packageName ||
              item.manifest.name.toLowerCase() === packageName.toLowerCase(),
          );
        if (!application)
          throw new NexOSError('APP_NOT_FOUND', `Application not found: ${packageName}`);
        this.applications.uninstall(application.manifest.id);
        return `Removed ${application.manifest.name}.`;
      }
      case 'update': {
        const updated = await this.updateAll();
        return updated.length
          ? `Updated ${updated.join(', ')}.`
          : `No updates are available from the ${this.status().mode} registry.`;
      }
      default:
        return 'Usage: nx install|remove|list|search|info|update';
    }
  }
}
