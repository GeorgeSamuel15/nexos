import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Cloud, Download, FileArchive, Package, ShieldCheck, Trash2, Upload } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type {
  InstalledApplication,
  PackageInspection,
  RegistryPackageSummary,
  RegistryStatus,
} from '@nexos/types';
import { Button, Card, Dialog, EmptyState } from '@nexos/ui';

import { AppIcon } from '../app-icons';
import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

export default function AppManagerApp(_properties: ApplicationProperties) {
  const desktop = useDesktop();
  const [applications, setApplications] = useState<InstalledApplication[]>([]);
  const [pending, setPending] = useState<{
    bytes: Uint8Array;
    inspection: PackageInspection;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<RegistryPackageSummary[]>([]);
  const [registryStatus, setRegistryStatus] = useState<RegistryStatus | null>(null);
  const [registryLoading, setRegistryLoading] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setError(null);
    const [installed, status] = await Promise.all([nexos.apps.list(), nexos.apps.registryStatus()]);
    setApplications(installed);
    setRegistryStatus(status);
    setRegistryLoading(true);
    try {
      setRegistry(await nexos.apps.registrySearch(''));
    } catch (reason) {
      setRegistry([]);
      setError(reason instanceof Error ? reason.message : 'Unable to load the package registry.');
    } finally {
      setRegistryLoading(false);
    }
  };
  useEffect(() => {
    void refresh().catch((reason: unknown) => {
      setRegistryLoading(false);
      setError(reason instanceof Error ? reason.message : 'Unable to load installed applications.');
    });
  }, []);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setPending({ bytes, inspection: await nexos.apps.packageInfo(bytes) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid .nxapp package.');
    } finally {
      event.target.value = '';
    }
  };

  const finishInstall = async (installed: InstalledApplication) => {
    setPending(null);
    await Promise.all([refresh(), desktop.refreshApplications()]);
    await desktop.notify(
      'Application installed',
      `${installed.manifest.name} is ready to launch.`,
      'com.nexos.app-manager',
    );
  };

  const install = async (bytes: Uint8Array) => {
    setError(null);
    try {
      await finishInstall(await nexos.apps.installPackage(bytes));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Application installation failed.');
    }
  };

  const installFromRegistry = async (packageName: string) => {
    setError(null);
    try {
      await finishInstall(await nexos.apps.installFromRegistry(packageName));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Registry installation failed.');
    }
  };

  const uninstall = async (application: InstalledApplication) => {
    await nexos.apps.uninstall(application.manifest.id);
    await Promise.all([refresh(), desktop.refreshApplications()]);
  };

  return (
    <div className="app-manager-app">
      <header>
        <div>
          <Package size={23} />
          <span>
            <h1>App Manager</h1>
            <p>Install validated local and registry packages</p>
          </span>
        </div>
        <Button onClick={() => input.current?.click()}>
          <Upload size={16} /> Install .nxapp
        </Button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".nxapp,application/json"
          onChange={(event) => void choose(event)}
        />
      </header>
      {error ? <div className="app-manager-error">{error}</div> : null}
      <section className="local-registry-card">
        <div>
          {registryStatus?.mode === 'online' ? <Cloud size={23} /> : <Download size={23} />}
          <span>
            <strong>
              {registryStatus?.mode === 'online' ? 'Online package registry' : 'Local registry'}
            </strong>
            <p>
              {registryStatus?.mode === 'online'
                ? registryStatus.url
                : 'Online access is off. Showing version-pinned offline packages.'}
            </p>
          </span>
        </div>
        {registryLoading ? <p>Loading packages…</p> : null}
        {!registryLoading && registry.length === 0 ? <p>No registry packages found.</p> : null}
        {registry.map((entry) => {
          const installed = applications.some(
            (application) => application.manifest.id === entry.manifest.id,
          );
          return (
            <div key={entry.name}>
              <span className="app-icon app-icon--lg">
                <AppIcon name={entry.manifest.icon} size={24} />
              </span>
              <span>
                <strong>{entry.manifest.name}</strong>
                <small>
                  {entry.manifest.version} · {entry.signed ? 'signed' : 'unsigned'} ·{' '}
                  {entry.manifest.permissions.join(', ') || 'no permissions'}
                </small>
              </span>
              {installed ? (
                <Button variant="secondary" disabled>
                  Installed
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void installFromRegistry(entry.name)}>
                  Install
                </Button>
              )}
            </div>
          );
        })}
      </section>
      <section className="installed-apps-section">
        <div className="section-heading">
          <div>
            <h2>Installed applications</h2>
            <p>{applications.length} packages</p>
          </div>
          <ShieldCheck size={22} />
        </div>
        {applications.length === 0 ? (
          <EmptyState
            icon={<Package size={30} />}
            title="No applications"
            description="Install a local .nxapp package."
          />
        ) : (
          <div className="installed-app-grid">
            {applications
              .filter((application) => application.manifest.id !== 'com.nexos.shell')
              .map((application) => (
                <Card key={application.manifest.id}>
                  <span className="app-icon app-icon--lg">
                    <AppIcon name={application.manifest.icon} size={24} />
                  </span>
                  <div>
                    <strong>{application.manifest.name}</strong>
                    <small>{application.manifest.id}</small>
                    <p>{application.manifest.description}</p>
                    <span>
                      {application.manifest.version} ·{' '}
                      {application.builtin ? 'Built in' : 'Declarative package'}
                    </span>
                    <span className={`trust-badge trust-badge--${application.provenance.trust}`}>
                      {application.provenance.trust}
                    </span>
                  </div>
                  {application.builtin ? (
                    <em>Protected</em>
                  ) : (
                    <Button variant="ghost" onClick={() => void uninstall(application)}>
                      <Trash2 size={15} /> Remove
                    </Button>
                  )}
                </Card>
              ))}
          </div>
        )}
      </section>
      <footer>
        <FileArchive size={17} />
        <span>
          .nxapp v1 packages are validated JSON bundles. Native executables and arbitrary Node.js
          code are rejected.
        </span>
      </footer>
      <Dialog
        open={pending !== null}
        title={`Install ${pending?.inspection.manifest.name ?? 'application'}?`}
        description={pending?.inspection.manifest.description}
        onClose={() => setPending(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={() => pending && void install(pending.bytes)}>
              Install application
            </Button>
          </>
        }
      >
        <div className="package-review">
          <span className="app-icon app-icon--lg">
            <AppIcon name={pending?.inspection.manifest.icon ?? 'package'} size={25} />
          </span>
          <div>
            <strong>{pending?.inspection.manifest.id}</strong>
            <p>Version {pending?.inspection.manifest.version}</p>
            <p>
              Publisher: {pending?.inspection.provenance.publisher?.name ?? 'Not declared'} · Trust:{' '}
              {pending?.inspection.provenance.trust ?? 'unsigned'}
            </p>
          </div>
        </div>
        <h3>Requested permissions</h3>
        <ul>
          {pending?.inspection.manifest.permissions.length ? (
            pending.inspection.manifest.permissions.map((permission) => (
              <li key={permission}>{permission}</li>
            ))
          ) : (
            <li>No permissions requested</li>
          )}
        </ul>
      </Dialog>
    </div>
  );
}
