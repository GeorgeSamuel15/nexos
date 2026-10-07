import { useEffect, useState } from 'react';
import { Box, Cpu, Database, HardDrive, MemoryStick, Monitor, Timer } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type { StorageInformation, SystemInformation } from '@nexos/types';
import { Card, Spinner } from '@nexos/ui';

import type { ApplicationProperties } from './registry';

function bytes(value: number): string {
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`;
  return `${(value / 1_073_741_824).toFixed(1)} GB`;
}

export default function SystemInfoApp(_properties: ApplicationProperties) {
  const [system, setSystem] = useState<SystemInformation | null>(null);
  const [storage, setStorage] = useState<StorageInformation | null>(null);
  useEffect(() => {
    void Promise.all([nexos.system.information(), nexos.system.storage()]).then(([info, disk]) => {
      setSystem(info);
      setStorage(disk);
    });
  }, []);
  if (!system || !storage)
    return (
      <div className="app-loading">
        <Spinner label="Loading system information" />
      </div>
    );
  return (
    <div className="system-info-app">
      <header>
        <div className="nexos-orb">
          <span>N</span>
        </div>
        <div>
          <p>NEXOS SYSTEM</p>
          <h1>NexOS {system.nexosVersion}</h1>
          <span>{system.hostname}</span>
        </div>
      </header>
      <div className="system-info-grid">
        <InfoCard
          icon={<Monitor />}
          label="Platform"
          value={`${system.platform} ${system.release}`}
          detail={system.architecture}
        />
        <InfoCard
          icon={<Cpu />}
          label="Processor"
          value={system.cpuModel}
          detail={`${system.cpuCount} logical cores`}
        />
        <InfoCard
          icon={<MemoryStick />}
          label="Memory"
          value={`${bytes(system.totalMemory - system.freeMemory)} used`}
          detail={`${bytes(system.totalMemory)} total`}
        />
        <InfoCard
          icon={<Timer />}
          label="Uptime"
          value={`${Math.floor(system.uptime / 3600)}h ${Math.floor((system.uptime % 3600) / 60)}m`}
          detail="Host system uptime"
        />
        <InfoCard
          icon={<Database />}
          label="NexOS content"
          value={bytes(storage.contentBytes)}
          detail={`${storage.files} files · ${storage.directories} folders`}
        />
        <InfoCard
          icon={<HardDrive />}
          label="Database"
          value={bytes(storage.databaseBytes)}
          detail={`${storage.recycleBinItems} recycle-bin items`}
        />
      </div>
      <Card className="runtime-card">
        <Box size={21} />
        <div>
          <h2>Runtime</h2>
          <dl>
            <div>
              <dt>Electron</dt>
              <dd>{system.electronVersion}</dd>
            </div>
            <div>
              <dt>Node.js</dt>
              <dd>{system.nodeVersion}</dd>
            </div>
            <div>
              <dt>Chromium</dt>
              <dd>{system.chromeVersion}</dd>
            </div>
          </dl>
        </div>
      </Card>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </Card>
  );
}
