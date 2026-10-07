import type {
  AppManifest,
  FilesApi,
  ProcessInfo,
  SystemInformation,
  UserProfile,
} from '@nexos/types';

import { NexOSError } from './errors.js';

export interface TerminalEnvironment {
  files: FilesApi;
  listApplications(): Promise<AppManifest[]>;
  listProcesses(): Promise<ProcessInfo[]>;
  stopProcess(pid: number): Promise<void>;
  systemInformation(): Promise<SystemInformation>;
  currentUser(): Promise<UserProfile | null>;
  openApplication(applicationId: string, payload?: Record<string, string>): Promise<void>;
  power(action: 'reboot' | 'shutdown'): Promise<void>;
  packageCommand?(arguments_: readonly string[]): Promise<string>;
}

export interface TerminalResult {
  output: string;
  clear: boolean;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const character of input.trim()) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (token) tokens.push(token);
      token = '';
      continue;
    }
    token += character;
  }
  if (escaped || quote) throw new NexOSError('INVALID_INPUT', 'Unterminated escape or quote.');
  if (token) tokens.push(token);
  return tokens;
}

function resolvePath(currentDirectory: string, requested = '.'): string {
  const parts = (requested.startsWith('/') ? requested : `${currentDirectory}/${requested}`).split(
    '/',
  );
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return `/${resolved.join('/')}`;
}

const helpText = `NexOS Terminal commands
help, clear, pwd, ls, cd, mkdir, touch, cat, echo, rm, cp, mv
whoami, date, history, apps, open, ps, kill, sysinfo, neofetch
nx install|remove|list|search|info|update, reboot, shutdown`;

export class TerminalSession {
  #currentDirectory = '/home';
  readonly #history: string[] = [];

  constructor(private readonly environment: TerminalEnvironment) {}

  get currentDirectory(): string {
    return this.#currentDirectory;
  }

  get history(): readonly string[] {
    return this.#history;
  }

  async execute(input: string): Promise<TerminalResult> {
    const trimmed = input.trim();
    if (!trimmed) return { output: '', clear: false };
    this.#history.push(trimmed);
    const [command, ...arguments_] = tokenize(trimmed);
    if (!command) return { output: '', clear: false };

    switch (command.toLowerCase()) {
      case 'help':
        return { output: helpText, clear: false };
      case 'clear':
        return { output: '', clear: true };
      case 'pwd':
        return { output: this.#currentDirectory, clear: false };
      case 'ls': {
        const target = resolvePath(this.#currentDirectory, arguments_[0]);
        const nodes = await this.environment.files.readdir(target);
        return {
          output: nodes
            .map(
              (node) =>
                `${node.kind === 'directory' ? 'd' : '-'}  ${node.name}${node.kind === 'directory' ? '/' : ''}`,
            )
            .join('\n'),
          clear: false,
        };
      }
      case 'cd': {
        const target = resolvePath(this.#currentDirectory, arguments_[0] ?? '/home');
        const stat = await this.environment.files.stat(target);
        if (stat.kind !== 'directory')
          throw new NexOSError('INVALID_INPUT', `${target} is not a directory.`);
        this.#currentDirectory = target;
        return { output: '', clear: false };
      }
      case 'mkdir': {
        const name = arguments_[0];
        if (!name) throw new NexOSError('INVALID_INPUT', 'Usage: mkdir <directory>');
        await this.environment.files.mkdir(resolvePath(this.#currentDirectory, name));
        return { output: '', clear: false };
      }
      case 'touch': {
        const name = arguments_[0];
        if (!name) throw new NexOSError('INVALID_INPUT', 'Usage: touch <file>');
        await this.environment.files.writeFile(resolvePath(this.#currentDirectory, name), '', {
          create: true,
          overwrite: false,
        });
        return { output: '', clear: false };
      }
      case 'cat': {
        const name = arguments_[0];
        if (!name) throw new NexOSError('INVALID_INPUT', 'Usage: cat <file>');
        return {
          output: await this.environment.files.readFile(resolvePath(this.#currentDirectory, name)),
          clear: false,
        };
      }
      case 'echo': {
        const redirectIndex = arguments_.findIndex(
          (argument) => argument === '>' || argument === '>>',
        );
        if (redirectIndex >= 0) {
          const operator = arguments_[redirectIndex];
          const target = arguments_[redirectIndex + 1];
          if (!target) throw new NexOSError('INVALID_INPUT', 'Missing redirection target.');
          const path = resolvePath(this.#currentDirectory, target);
          const next = arguments_.slice(0, redirectIndex).join(' ');
          const previous =
            operator === '>>' ? await this.environment.files.readFile(path).catch(() => '') : '';
          await this.environment.files.writeFile(
            path,
            `${previous}${next}${operator === '>>' ? '\n' : ''}`,
            { create: true, overwrite: true },
          );
          return { output: '', clear: false };
        }
        return { output: arguments_.join(' '), clear: false };
      }
      case 'rm': {
        const target = arguments_.find((argument) => !argument.startsWith('-'));
        if (!target) throw new NexOSError('INVALID_INPUT', 'Usage: rm [-f] <path>');
        await this.environment.files.remove(
          resolvePath(this.#currentDirectory, target),
          arguments_.includes('-f'),
        );
        return { output: '', clear: false };
      }
      case 'cp':
      case 'mv': {
        const [source, destination] = arguments_;
        if (!source || !destination)
          throw new NexOSError('INVALID_INPUT', `Usage: ${command} <source> <destination>`);
        if (command === 'cp') {
          await this.environment.files.copy(
            resolvePath(this.#currentDirectory, source),
            resolvePath(this.#currentDirectory, destination),
          );
        } else {
          await this.environment.files.move(
            resolvePath(this.#currentDirectory, source),
            resolvePath(this.#currentDirectory, destination),
          );
        }
        return { output: '', clear: false };
      }
      case 'whoami': {
        const user = await this.environment.currentUser();
        return { output: user?.username ?? 'guest', clear: false };
      }
      case 'date':
        return { output: new Date().toString(), clear: false };
      case 'history':
        return {
          output: this.#history.map((entry, index) => `${index + 1}  ${entry}`).join('\n'),
          clear: false,
        };
      case 'apps': {
        const apps = await this.environment.listApplications();
        return {
          output: apps.map((app) => `${app.id.padEnd(28)} ${app.name}`).join('\n'),
          clear: false,
        };
      }
      case 'open': {
        const target = arguments_[0];
        if (!target) throw new NexOSError('INVALID_INPUT', 'Usage: open <application-id|path>');
        const apps = await this.environment.listApplications();
        const extension =
          target.startsWith('/') && target.includes('.')
            ? `.${target.split('.').at(-1) ?? ''}`
            : '';
        const app = apps.find(
          (item) =>
            item.id === target ||
            item.name.toLowerCase() === target.toLowerCase() ||
            (extension !== '' && item.fileExtensions.includes(extension)),
        );
        if (!app) throw new NexOSError('APP_NOT_FOUND', `No application can open ${target}.`);
        const payload = target.startsWith('/') ? { path: target } : undefined;
        if (payload) await this.environment.openApplication(app.id, payload);
        else await this.environment.openApplication(app.id);
        return { output: `Opened ${target}`, clear: false };
      }
      case 'ps': {
        const processes = await this.environment.listProcesses();
        return {
          output: [
            'PID   CPU    MEMORY     APP',
            ...processes.map(
              (process) =>
                `${String(process.pid).padEnd(5)} ${process.cpuPercent.toFixed(1).padStart(5)}% ${Math.round(
                  process.memoryBytes / 1_048_576,
                )
                  .toString()
                  .padStart(6)} MB  ${process.applicationName}`,
            ),
          ].join('\n'),
          clear: false,
        };
      }
      case 'kill': {
        const pid = Number(arguments_[0]);
        if (!Number.isInteger(pid)) throw new NexOSError('INVALID_INPUT', 'Usage: kill <pid>');
        await this.environment.stopProcess(pid);
        return { output: `Stopped process ${pid}.`, clear: false };
      }
      case 'sysinfo':
      case 'neofetch': {
        const info = await this.environment.systemInformation();
        return {
          output: `NEXOS ${info.nexosVersion}\n${info.platform} ${info.release} (${info.architecture})\n${info.cpuModel} × ${info.cpuCount}\nMemory ${Math.round((info.totalMemory - info.freeMemory) / 1_073_741_824)} / ${Math.round(info.totalMemory / 1_073_741_824)} GB\nElectron ${info.electronVersion} · Node ${info.nodeVersion}`,
          clear: false,
        };
      }
      case 'nx': {
        if (!this.environment.packageCommand)
          throw new NexOSError('INVALID_INPUT', 'The nx package manager is unavailable.');
        return { output: await this.environment.packageCommand(arguments_), clear: false };
      }
      case 'reboot':
        await this.environment.power('reboot');
        return { output: 'Restarting NexOS…', clear: false };
      case 'shutdown':
        await this.environment.power('shutdown');
        return { output: 'Shutting down NexOS…', clear: false };
      default:
        throw new NexOSError(
          'INVALID_INPUT',
          `${command}: command not found. Run “help” to list commands.`,
        );
    }
  }
}
