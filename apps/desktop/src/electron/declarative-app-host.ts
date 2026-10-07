import { WebContentsView, type BrowserWindow } from 'electron';

import { NexOSError } from '@nexos/core';
import type { ApplicationService } from '@nexos/system-service';
import type {
  DeclarativeAppHostInput,
  DeclarativeAppHostUpdate,
  InstalledApplication,
  WindowBounds,
} from '@nexos/types';

interface HostedApplication {
  view: WebContentsView;
  application: InstalledApplication;
  theme: 'light' | 'dark';
  accent: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderApplication(
  application: InstalledApplication,
  theme: 'light' | 'dark',
  accent: string,
): string {
  const title = escapeHtml(application.declarativeContent?.title ?? application.manifest.name);
  const description = escapeHtml(application.manifest.description);
  const body = escapeHtml(
    application.declarativeContent?.body ?? 'This declarative application has no content.',
  );
  const publisher = escapeHtml(application.provenance.publisher?.name ?? 'Unsigned publisher');
  const trust = escapeHtml(application.provenance.trust);
  const dark = theme === 'dark';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <style>
      :root { color-scheme: ${dark ? 'dark' : 'light'}; --accent: ${accent}; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; padding: 28px; font: 14px/1.55 system-ui, sans-serif; color: ${dark ? '#f3f5ff' : '#15213b'}; background: ${dark ? '#111522' : '#f5f7fc'}; }
      header { display: flex; align-items: center; gap: 15px; margin-bottom: 24px; }
      .mark { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 15px; color: white; font-weight: 800; font-size: 20px; background: linear-gradient(145deg, var(--accent), #22b8cf); box-shadow: 0 12px 30px color-mix(in srgb, var(--accent) 32%, transparent); }
      h1 { margin: 0; font-size: 22px; letter-spacing: -.02em; }
      header p { margin: 3px 0 0; color: ${dark ? '#aab2ca' : '#60708f'}; }
      article { white-space: pre-wrap; padding: 22px; border: 1px solid ${dark ? '#2b3246' : '#dfe5f1'}; border-radius: 17px; background: ${dark ? '#191e2d' : '#fff'}; box-shadow: 0 18px 50px ${dark ? '#0005' : '#29406412'}; }
      footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 18px; color: ${dark ? '#8f99b5' : '#71809c'}; font-size: 12px; }
      .trust { color: var(--accent); font-weight: 700; text-transform: capitalize; }
    </style>
  </head>
  <body>
    <header><div class="mark">N</div><div><h1>${title}</h1><p>${description}</p></div></header>
    <article>${body}</article>
    <footer><span>${publisher}</span><span class="trust">${trust} package · isolated host</span></footer>
  </body>
</html>`;
}

function dataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export class DeclarativeAppHostManager {
  readonly #hosts = new Map<string, HostedApplication>();

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly applications: ApplicationService,
  ) {}

  async mount(input: DeclarativeAppHostInput): Promise<void> {
    this.destroy(input.windowId);
    const window = this.requireWindow();
    const application = this.applications.get(input.applicationId);
    if (application.builtin || application.manifest.runtime !== 'declarative') {
      throw new NexOSError(
        'APP_INVALID',
        'Only installed declarative packages can use an isolated app host.',
      );
    }
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        javascript: false,
        spellcheck: false,
        partition: `nexos-declarative-${application.manifest.id}`,
      },
    });
    view.setBackgroundColor(input.theme === 'dark' ? '#111522' : '#f5f7fc');
    view.setBorderRadius(0);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('will-navigate', (event) => event.preventDefault());
    view.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    view.webContents.session.setPermissionCheckHandler(() => false);
    window.contentView.addChildView(view);
    view.setBounds(this.clampBounds(input.bounds));
    view.setVisible(false);
    this.#hosts.set(input.windowId, {
      view,
      application,
      theme: input.theme,
      accent: input.accent,
    });
    await view.webContents.loadURL(
      dataUrl(renderApplication(application, input.theme, input.accent)),
    );
    view.setVisible(input.visible);
  }

  async update(input: DeclarativeAppHostUpdate): Promise<void> {
    const host = this.requireHost(input.windowId);
    host.view.setBounds(this.clampBounds(input.bounds));
    host.view.setVisible(input.visible);
    if (host.theme !== input.theme || host.accent !== input.accent) {
      host.theme = input.theme;
      host.accent = input.accent;
      host.view.setBackgroundColor(input.theme === 'dark' ? '#111522' : '#f5f7fc');
      await host.view.webContents.loadURL(
        dataUrl(renderApplication(host.application, input.theme, input.accent)),
      );
    }
  }

  focus(windowId: string): void {
    const host = this.requireHost(windowId);
    const window = this.requireWindow();
    window.contentView.addChildView(host.view);
    if (host.view.getVisible()) host.view.webContents.focus();
  }

  destroy(windowId: string): void {
    const host = this.#hosts.get(windowId);
    if (!host) return;
    this.getWindow()?.contentView.removeChildView(host.view);
    if (!host.view.webContents.isDestroyed()) host.view.webContents.close();
    this.#hosts.delete(windowId);
  }

  destroyAll(): void {
    for (const windowId of [...this.#hosts.keys()]) this.destroy(windowId);
  }

  private requireHost(windowId: string): HostedApplication {
    const host = this.#hosts.get(windowId);
    if (!host) throw new NexOSError('NOT_FOUND', `Application host not found: ${windowId}`);
    return host;
  }

  private requireWindow(): BrowserWindow {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      throw new NexOSError('INTERNAL_ERROR', 'The NexOS desktop window is unavailable.');
    }
    return window;
  }

  private clampBounds(bounds: WindowBounds): WindowBounds {
    const size = this.requireWindow().getContentSize();
    const contentWidth = size[0] ?? 1;
    const contentHeight = size[1] ?? 1;
    const x = Math.min(Math.max(0, bounds.x), Math.max(0, contentWidth - 1));
    const y = Math.min(Math.max(0, bounds.y), Math.max(0, contentHeight - 1));
    return {
      x,
      y,
      width: Math.max(1, Math.min(bounds.width, contentWidth - x)),
      height: Math.max(1, Math.min(bounds.height, contentHeight - y)),
    };
  }
}
