import { randomUUID } from 'node:crypto';

import { NexOSError } from '@nexos/core';
import type { ProcessManager } from '@nexos/process-manager';
import type { ApplicationRepository, StoredApplication } from '@nexos/storage';
import {
  appPublisherSchema,
  appManifestSchema,
  nxAppPackageSchema,
  type AppLaunchResult,
  type AppManifest,
  type InstalledApplication,
  type NxAppPackage,
  type PackageInspection,
  type RegistryPackageSummary,
} from '@nexos/types';

import { builtInManifests } from './manifests.js';
import { PackageTrustService } from './package-trust.js';

const maxPackageSize = 5 * 1024 * 1024;

const mockRegistry: Readonly<Record<string, NxAppPackage>> = {
  'focus-timer': {
    format: 'nexos-app-v1',
    manifest: {
      id: 'community.nexos.focus-timer',
      name: 'Focus Timer',
      description: 'A minimal focus-session companion.',
      version: '1.0.0',
      icon: 'timer',
      entry: 'application.json',
      runtime: 'declarative',
      permissions: ['notifications'],
      singleInstance: true,
      system: false,
      defaultWidth: 500,
      defaultHeight: 480,
      fileExtensions: [],
    },
    application: {
      kind: 'document-viewer',
      title: 'Focus Timer',
      body: 'Focus Timer is installed from the local NexOS registry and rendered inside an isolated declarative application host.',
    },
    assets: {},
  },
};

function toInstalled(application: StoredApplication): InstalledApplication {
  let declarativeContent: InstalledApplication['declarativeContent'] = null;
  if (application.packageJson) {
    const parsed = nxAppPackageSchema.safeParse(JSON.parse(application.packageJson) as unknown);
    if (parsed.success) {
      declarativeContent = {
        title: parsed.data.application.title,
        body: parsed.data.application.body,
      };
    }
  }
  let publisher: InstalledApplication['provenance']['publisher'] = null;
  if (application.publisherJson) {
    const parsed = appPublisherSchema.safeParse(JSON.parse(application.publisherJson) as unknown);
    if (parsed.success) {
      publisher = {
        id: parsed.data.id,
        name: parsed.data.name,
        keyId: parsed.data.keyId,
      };
    }
  }
  return {
    manifest: application.manifest,
    installedAt: application.installedAt,
    builtin: application.builtin,
    declarativeContent,
    provenance: {
      publisher,
      trust: application.trustLevel,
      packageHash: application.packageHash,
      signatureVerified: application.signatureVerified,
    },
  };
}

export class ApplicationService {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly processes: ProcessManager,
    private readonly packageTrust = new PackageTrustService(),
  ) {}

  initialize(): void {
    const installedAt = new Date().toISOString();
    for (const manifest of builtInManifests) {
      this.repository.upsert({
        manifest,
        packageJson: null,
        builtin: true,
        installedAt,
        publisherJson: null,
        trustLevel: 'system',
        packageHash: null,
        signatureVerified: true,
      });
    }
  }

  list(): InstalledApplication[] {
    return this.repository.list().map(toInstalled);
  }

  manifests(): AppManifest[] {
    return this.repository.list().map((application) => application.manifest);
  }

  get(applicationId: string): InstalledApplication {
    const application = this.repository.get(applicationId);
    if (!application)
      throw new NexOSError('APP_NOT_FOUND', `Application not found: ${applicationId}`);
    return toInstalled(application);
  }

  getManifest(applicationId: string): AppManifest | null {
    return this.repository.get(applicationId)?.manifest ?? null;
  }

  launch(applicationId: string): AppLaunchResult {
    const application = this.get(applicationId);
    const process = this.processes.start(applicationId, application.manifest.name);
    return { manifest: application.manifest, process };
  }

  close(pid: number): void {
    this.processes.windowClosed(pid);
  }

  packageInfo(bytes: Uint8Array): PackageInspection {
    return this.parsePackage(bytes).inspection;
  }

  installPackage(bytes: Uint8Array): InstalledApplication {
    const { package_, inspection } = this.parsePackage(bytes);
    if (package_.manifest.id.startsWith('com.nexos.')) {
      throw new NexOSError(
        'APP_INVALID',
        'Third-party packages cannot use the reserved com.nexos namespace.',
      );
    }
    if (this.repository.get(package_.manifest.id)) {
      throw new NexOSError('ALREADY_EXISTS', `${package_.manifest.name} is already installed.`);
    }
    const application: StoredApplication = {
      manifest: package_.manifest,
      packageJson: JSON.stringify(package_),
      builtin: false,
      installedAt: new Date().toISOString(),
      publisherJson: package_.publisher ? JSON.stringify(package_.publisher) : null,
      trustLevel: inspection.provenance.trust,
      packageHash: inspection.provenance.packageHash,
      signatureVerified: inspection.provenance.signatureVerified,
    };
    this.repository.upsert(application);
    return toInstalled(application);
  }

  updatePackage(bytes: Uint8Array): InstalledApplication {
    const { package_, inspection } = this.parsePackage(bytes);
    const existing = this.repository.get(package_.manifest.id);
    if (!existing)
      throw new NexOSError('APP_NOT_FOUND', `Application not found: ${package_.manifest.id}`);
    if (existing.builtin)
      throw new NexOSError('PROTECTED_RESOURCE', 'Built-in NexOS applications cannot be updated.');
    const running = this.processes
      .list()
      .filter((process) => process.applicationId === package_.manifest.id);
    for (const process of running) this.processes.stop(process.pid);
    const application: StoredApplication = {
      manifest: package_.manifest,
      packageJson: JSON.stringify(package_),
      builtin: false,
      installedAt: existing.installedAt,
      publisherJson: package_.publisher ? JSON.stringify(package_.publisher) : null,
      trustLevel: inspection.provenance.trust,
      packageHash: inspection.provenance.packageHash,
      signatureVerified: inspection.provenance.signatureVerified,
    };
    this.repository.upsert(application);
    return toInstalled(application);
  }

  uninstall(applicationId: string): void {
    const application = this.repository.get(applicationId);
    if (!application)
      throw new NexOSError('APP_NOT_FOUND', `Application not found: ${applicationId}`);
    if (application.builtin)
      throw new NexOSError('PROTECTED_RESOURCE', 'Built-in NexOS applications cannot be removed.');
    const running = this.processes
      .list()
      .filter((process) => process.applicationId === applicationId);
    for (const process of running) this.processes.stop(process.pid);
    this.repository.remove(applicationId);
  }

  searchLocalRegistry(query: string): RegistryPackageSummary[] {
    const normalized = query.trim().toLowerCase();
    return Object.entries(mockRegistry)
      .filter(
        ([name, package_]) =>
          !normalized ||
          name.includes(normalized) ||
          `${package_.manifest.name} ${package_.manifest.description}`
            .toLowerCase()
            .includes(normalized),
      )
      .map(([name, package_]) => ({
        name,
        manifest: package_.manifest,
        publisherName: package_.publisher?.name ?? null,
        signed: package_.signature !== undefined,
      }));
  }

  getLocalRegistryPackage(packageName: string): NxAppPackage | null {
    return mockRegistry[packageName] ?? null;
  }

  private parsePackage(bytes: Uint8Array): {
    package_: NxAppPackage;
    inspection: PackageInspection;
  } {
    if (bytes.byteLength === 0 || bytes.byteLength > maxPackageSize) {
      throw new NexOSError('APP_INVALID', 'The .nxapp package is empty or exceeds 5 MiB.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      throw new NexOSError(
        'APP_INVALID',
        'The .nxapp package is not valid UTF-8 JSON.',
        {},
        {
          cause: error,
        },
      );
    }
    const result = nxAppPackageSchema.safeParse(parsed);
    if (!result.success) {
      throw new NexOSError('APP_INVALID', 'The .nxapp package failed manifest validation.', {
        validation: result.error.issues.map((issue) => issue.message).join('; '),
        trace: randomUUID(),
      });
    }
    const manifest = appManifestSchema.parse(result.data.manifest);
    if (manifest.entry.includes('..') || manifest.entry.startsWith('/')) {
      throw new NexOSError(
        'APP_INVALID',
        'Application entry paths must remain inside the package.',
      );
    }
    for (const assetPath of Object.keys(result.data.assets)) {
      if (assetPath.includes('..') || assetPath.startsWith('/') || assetPath.includes('\\')) {
        throw new NexOSError('APP_INVALID', `Unsafe asset path: ${assetPath}`);
      }
    }
    return {
      package_: result.data,
      inspection: this.packageTrust.inspect(result.data, bytes),
    };
  }
}
