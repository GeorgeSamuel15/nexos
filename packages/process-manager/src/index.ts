import { NexOSError } from '@nexos/core';
import type { TypedEventBus } from '@nexos/events';
import type { ProcessInfo } from '@nexos/types';

export interface ProcessManagerOptions {
  now?: () => Date;
  random?: () => number;
}

export class ProcessManager {
  readonly #processes = new Map<number, ProcessInfo>();
  #nextPid = 100;
  readonly #now: () => Date;
  readonly #random: () => number;

  constructor(
    private readonly events: TypedEventBus,
    options: ProcessManagerOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date());
    this.#random = options.random ?? Math.random;
  }

  start(applicationId: string, applicationName: string): ProcessInfo {
    const existing = [...this.#processes.values()].find(
      (process) => process.applicationId === applicationId && process.state === 'running',
    );
    if (existing) {
      const updated = { ...existing, windowCount: existing.windowCount + 1 };
      this.#processes.set(existing.pid, updated);
      return updated;
    }
    const process: ProcessInfo = {
      pid: this.#nextPid++,
      applicationId,
      applicationName,
      startedAt: this.#now().toISOString(),
      state: 'running',
      cpuPercent: Number((0.2 + this.#random() * 3.8).toFixed(1)),
      memoryBytes: Math.round((18 + this.#random() * 64) * 1_048_576),
      windowCount: 1,
    };
    this.#processes.set(process.pid, process);
    this.events.emit('process:started', { process });
    this.events.emit('app:opened', { applicationId, pid: process.pid });
    return process;
  }

  windowClosed(pid: number): void {
    const process = this.get(pid);
    if (process.windowCount <= 1) {
      this.stop(pid);
      return;
    }
    this.#processes.set(pid, { ...process, windowCount: process.windowCount - 1 });
  }

  stop(pid: number): void {
    const process = this.get(pid);
    const stopped: ProcessInfo = {
      ...process,
      state: 'stopped',
      cpuPercent: 0,
      windowCount: 0,
    };
    this.#processes.delete(pid);
    this.events.emit('process:stopped', { process: stopped });
    this.events.emit('app:closed', { applicationId: process.applicationId, pid });
  }

  crash(pid: number): void {
    const process = this.get(pid);
    const crashed: ProcessInfo = { ...process, state: 'crashed', cpuPercent: 0 };
    this.#processes.delete(pid);
    this.events.emit('process:stopped', { process: crashed });
  }

  get(pid: number): ProcessInfo {
    const process = this.#processes.get(pid);
    if (!process) throw new NexOSError('PROCESS_NOT_FOUND', `Process ${pid} was not found.`);
    return { ...process };
  }

  list(): ProcessInfo[] {
    return [...this.#processes.values()].map((process) => {
      const drift = (this.#random() - 0.5) * 0.8;
      const current = {
        ...process,
        cpuPercent: Number(Math.max(0, process.cpuPercent + drift).toFixed(1)),
      };
      this.#processes.set(process.pid, current);
      return current;
    });
  }

  clear(): void {
    for (const pid of [...this.#processes.keys()]) this.stop(pid);
  }
}
