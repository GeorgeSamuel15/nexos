import { useEffect, useMemo, useState } from 'react';
import { Activity, Cpu, MemoryStick, OctagonX } from 'lucide-react';

import { nexos } from '@nexos/sdk';
import type { ProcessInfo, SystemInformation } from '@nexos/types';
import { Button, Card, Tabs, Tab } from '@nexos/ui';

import { AppIcon } from '../app-icons';
import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

function uptime(process: ProcessInfo): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(process.startedAt).getTime()) / 1_000),
  );
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function TaskManagerApp(_properties: ApplicationProperties) {
  const desktop = useDesktop();
  const [tab, setTab] = useState('processes');
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [system, setSystem] = useState<SystemInformation | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [nextProcesses, nextSystem] = await Promise.all([
        nexos.processes.list(),
        nexos.system.information(),
      ]);
      if (!active) return;
      setProcesses(nextProcesses);
      setSystem(nextSystem);
      setHistory((current) => [
        ...current.slice(-39),
        Number(((nextSystem.totalMemory - nextSystem.freeMemory) / nextSystem.totalMemory) * 100),
      ]);
    };
    void load();
    const timer = globalThis.window.setInterval(() => void load(), 1_500);
    return () => {
      active = false;
      globalThis.window.clearInterval(timer);
    };
  }, []);

  const totals = useMemo(
    () => ({
      cpu: processes.reduce((sum, process) => sum + process.cpuPercent, 0),
      memory: processes.reduce((sum, process) => sum + process.memoryBytes, 0),
    }),
    [processes],
  );

  const terminate = async (pid: number) => {
    await desktop.terminateProcess(pid);
    setProcesses((current) => current.filter((process) => process.pid !== pid));
    setSelected(null);
  };

  const points = history
    .map(
      (value, index) =>
        `${history.length <= 1 ? 0 : (index / (history.length - 1)) * 100},${100 - value}`,
    )
    .join(' ');

  return (
    <div className="task-manager-app">
      <header>
        <div>
          <Activity size={20} />
          <h1>Task Manager</h1>
        </div>
        <Tabs value={tab} onChange={setTab}>
          <Tab value="processes">Processes</Tab>
          <Tab value="performance">Performance</Tab>
        </Tabs>
      </header>
      {tab === 'processes' ? (
        <>
          <div className="process-summary">
            <span>{processes.length} processes</span>
            <span>
              <Cpu size={14} /> {totals.cpu.toFixed(1)}% CPU
            </span>
            <span>
              <MemoryStick size={14} /> {(totals.memory / 1_048_576).toFixed(0)} MB
            </span>
          </div>
          <div className="process-table">
            <div className="process-table__head">
              <span>Application</span>
              <span>PID</span>
              <span>Status</span>
              <span>CPU</span>
              <span>Memory</span>
              <span>Uptime</span>
            </div>
            {processes.map((process) => (
              <button
                key={process.pid}
                type="button"
                className={selected === process.pid ? 'is-selected' : ''}
                onClick={() => setSelected(process.pid)}
              >
                <span>
                  <i className="app-icon app-icon--sm">
                    <AppIcon
                      name={
                        desktop.applications.find(
                          (app) => app.manifest.id === process.applicationId,
                        )?.manifest.icon ?? 'app'
                      }
                      size={15}
                    />
                  </i>
                  <strong>{process.applicationName}</strong>
                </span>
                <span>{process.pid}</span>
                <span>
                  <em className="status-dot" />
                  {process.state}
                </span>
                <span>{process.cpuPercent.toFixed(1)}%</span>
                <span>{(process.memoryBytes / 1_048_576).toFixed(0)} MB</span>
                <span>{uptime(process)}</span>
              </button>
            ))}
          </div>
          <footer>
            <span>Select a process to manage it.</span>
            <Button
              variant="danger"
              disabled={selected === null}
              onClick={() => selected !== null && void terminate(selected)}
            >
              <OctagonX size={15} /> End task
            </Button>
          </footer>
        </>
      ) : (
        <div className="performance-view">
          <div className="performance-cards">
            <Card>
              <Cpu size={21} />
              <span>
                <strong>{totals.cpu.toFixed(1)}%</strong>Simulated app CPU
              </span>
            </Card>
            <Card>
              <MemoryStick size={21} />
              <span>
                <strong>
                  {system
                    ? `${Math.round(((system.totalMemory - system.freeMemory) / system.totalMemory) * 100)}%`
                    : '—'}
                </strong>
                Host memory
              </span>
            </Card>
          </div>
          <Card className="performance-chart">
            <header>
              <span>Memory usage</span>
              <strong>
                {system
                  ? `${(system.totalMemory / 1_073_741_824).toFixed(1)} GB total`
                  : 'Loading…'}
              </strong>
            </header>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Memory usage history">
              <defs>
                <linearGradient id="memory-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity=".45" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline
                points={points}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <polygon points={`0,100 ${points} 100,100`} fill="url(#memory-fill)" />
            </svg>
          </Card>
          <div className="performance-details">
            <span>
              Platform<strong>{system?.platform ?? '—'}</strong>
            </span>
            <span>
              CPU<strong>{system?.cpuCount ?? '—'} logical cores</strong>
            </span>
            <span>
              System uptime
              <strong>{system ? `${Math.floor(system.uptime / 3600)} hours` : '—'}</strong>
            </span>
            <span>
              Architecture<strong>{system?.architecture ?? '—'}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
