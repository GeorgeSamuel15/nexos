import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import { TerminalSession } from '@nexos/core';
import { nexos } from '@nexos/sdk';

import { useDesktop } from '../desktop-context';
import type { ApplicationProperties } from './registry';

interface TerminalLine {
  id: number;
  kind: 'command' | 'output' | 'error';
  text: string;
  prompt?: string;
}

export default function TerminalApp(_properties: ApplicationProperties) {
  const desktop = useDesktop();
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: 1, kind: 'output', text: 'NexOS Terminal 1.0\nType “help” to see available commands.' },
  ]);
  const [input, setInput] = useState('');
  const [directory, setDirectory] = useState('/home');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const inputReference = useRef<HTMLInputElement>(null);
  const sequence = useRef(2);

  const session = useMemo(
    () =>
      new TerminalSession({
        files: nexos.files,
        listApplications: async () =>
          (await nexos.apps.list()).map((application) => application.manifest),
        listProcesses: () => nexos.processes.list(),
        stopProcess: async (pid) => desktop.terminateProcess(pid),
        systemInformation: () => nexos.system.information(),
        currentUser: async () => desktop.user,
        openApplication: (applicationId, payload) =>
          payload ? desktop.launchApp(applicationId, payload) : desktop.launchApp(applicationId),
        power: (action) => nexos.system.power(action === 'reboot' ? 'restart' : 'shutdown'),
        packageCommand: async (arguments_) => {
          const output = await nexos.apps.packageCommand([...arguments_]);
          if (arguments_[0] === 'install' || arguments_[0] === 'remove') {
            await desktop.refreshApplications();
          }
          return output;
        },
      }),
    [desktop],
  );

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [lines]);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    const command = input.trim();
    if (!command || running) return;
    setInput('');
    setHistoryIndex(-1);
    setRunning(true);
    const id = sequence.current++;
    setLines((current) => [
      ...current,
      {
        id,
        kind: 'command',
        text: command,
        prompt: `${desktop.user.username}@nexos:${directory}$`,
      },
    ]);
    try {
      const result = await session.execute(command);
      setDirectory(session.currentDirectory);
      if (result.clear) setLines([]);
      else if (result.output)
        setLines((current) => [
          ...current,
          { id: sequence.current++, kind: 'output', text: result.output },
        ]);
    } catch (reason) {
      setLines((current) => [
        ...current,
        {
          id: sequence.current++,
          kind: 'error',
          text: reason instanceof Error ? reason.message : 'Command failed.',
        },
      ]);
    } finally {
      setRunning(false);
      requestAnimationFrame(() => inputReference.current?.focus());
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      setLines([]);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.min(session.history.length - 1, historyIndex + 1);
      setHistoryIndex(next);
      setInput(session.history[session.history.length - 1 - next] ?? '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setInput(next < 0 ? '' : (session.history[session.history.length - 1 - next] ?? ''));
    }
  };

  return (
    <div className="terminal-app" onClick={() => inputReference.current?.focus()}>
      <div ref={scroll} className="terminal-output" aria-live="polite">
        {lines.map((line) => (
          <div key={line.id} className={`terminal-line terminal-line--${line.kind}`}>
            {line.prompt ? <span className="terminal-prompt">{line.prompt} </span> : null}
            <span>{line.text}</span>
          </div>
        ))}
        <form onSubmit={(event) => void run(event)} className="terminal-input-line">
          <span className="terminal-prompt">
            {desktop.user.username}@nexos:<strong>{directory}</strong>$
          </span>
          <input
            ref={inputReference}
            autoFocus
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={keyDown}
            disabled={running}
            aria-label="Terminal command"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </form>
      </div>
    </div>
  );
}
