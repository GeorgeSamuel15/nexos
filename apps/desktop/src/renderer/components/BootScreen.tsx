import type { BootProgress } from '@nexos/types';

export function BootScreen({ progress }: { progress: BootProgress }) {
  return (
    <main className="boot-screen" aria-live="polite">
      <div className="boot-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h1>NEXOS</h1>
      <p>{progress.label}</p>
      <div
        className="boot-progress"
        role="progressbar"
        aria-valuenow={progress.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${progress.progress}%` }} />
      </div>
    </main>
  );
}
