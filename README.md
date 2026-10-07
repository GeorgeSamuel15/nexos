# NexOS

NexOS is a secure, modular desktop operating environment built with TypeScript, React, Electron, Node.js, and SQLite. It behaves like an operating system from the user's perspective—accounts, a desktop shell, managed windows, a virtual filesystem, processes, applications, permissions, notifications, search, a terminal, and a local package model—while remaining honest about its current runtime.

NexOS v0.2 is an Electron application. It is not a hardware-level kernel. The service boundaries are deliberately designed so the TypeScript desktop can later communicate with a Rust kernel/runtime instead of Electron IPC.

## What works

- Boot progress based on actual service initialization
- First-run account setup, scrypt password hashing, login, logout, lock, unlock, and per-user encrypted `/home` file content
- Polished desktop shell with four wallpapers, dark/light/system modes, accent colours, and taskbar preferences
- Draggable, resizable, minimizable, maximizable, focusable, and snappable windows
- Multiple windows, process IDs, taskbar representation, show-desktop, and keyboard shortcuts
- SQLite-backed virtual filesystem with nested directories, metadata, search, recents, favourites, copies, moves, and a recycle bin
- Functional Files, Terminal, Settings, Notes, Calculator, Text Editor, Image Viewer, Task Manager, App Manager, System Information, and NexAI apps
- Safe text clipboard bridge and optional clipboard history
- Typed notification centre with history, unread state, dismiss, and dismiss-all
- Global search across apps, files, settings, and commands
- Ed25519 package provenance, isolated declarative app hosts, and a local/opt-in-online `nx` package workflow
- A versioned, bounded binary runtime protocol with matching TypeScript and `no_std` Rust framing prototypes
- Typed event bus and strict, Zod-validated Electron IPC
- Lazy-loaded built-in applications and isolated application error boundaries
- Unit, service, component, IPC validation, and Electron end-to-end tests
- Electron Builder configuration for Windows, Linux, and macOS targets

## Requirements

- Node.js 22.16 or newer
- pnpm 10 or newer (the repository pins pnpm 11.25.0)
- Windows 10/11, a modern Linux desktop, or macOS

## Run NexOS

```bash
corepack enable
pnpm install
pnpm dev
```

The root command builds reusable packages, starts Vite, compiles the Electron main/preload bundles, and launches NexOS.

On first launch, create a local account. Passwords must contain at least 10 characters.

## Verification commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run the Electron workflow test on a desktop session:

```bash
pnpm test:e2e
```

On headless Linux, use a virtual display:

```bash
xvfb-run --auto-servernum pnpm test:e2e
```

## Build distributables

```bash
pnpm package
```

Artifacts are written to `apps/desktop/release`. Code signing and notarization require platform-specific certificates and are intentionally not configured in the repository.

## Workspace

```text
nexos/
├── apps/
│   ├── desktop/             Electron main/preload and React desktop shell
│   └── system-service/      Accounts, apps, settings, search, AI and service composition
├── packages/
│   ├── config/              Environment validation
│   ├── core/                Errors, calculator and terminal engine
│   ├── events/              Typed internal event bus
│   ├── filesystem/          Virtual filesystem domain service
│   ├── permissions/         Permission policy
│   ├── process-manager/     Internal process lifecycle
│   ├── runtime/             Versioned host/runtime protocol and Node adapter
│   ├── sdk/                 Renderer-facing NexOS SDK
│   ├── storage/             SQLite migrations and repositories
│   ├── types/               Shared contracts and Zod schemas
│   ├── ui/                  Reusable NexOS design-system components
│   └── window-manager/      Framework-independent Zustand window store
├── docs/
├── native/runtime-protocol/ Matching no_std Rust protocol framing prototype
├── tests/e2e/
└── .github/workflows/
```

See [Architecture](docs/ARCHITECTURE.md), [Security model](docs/SECURITY.md), [SDK and APIs](docs/SDK.md), and [Build your first NexOS app](docs/FIRST_APP.md).

## Keyboard shortcuts

| Shortcut    | Action                        |
| ----------- | ----------------------------- |
| `Alt + Tab` | Cycle focused windows         |
| `Alt + F4`  | Close the active window       |
| `Super + E` | Open Files                    |
| `Super + R` | Open global search/run        |
| `Super + D` | Show or restore the desktop   |
| `Super + L` | Lock NexOS                    |
| `Ctrl + S`  | Save in Notes and Text Editor |

## Honest v0.2 boundaries

- Installed third-party apps use dedicated sandboxed `WebContentsView` hosts with JavaScript disabled. The current declarative format does not execute package JavaScript, WebAssembly, or native binaries.
- New `/home` file content is encrypted with a per-user AES-256-GCM key. Settings, metadata, system content, and legacy plaintext rows are not whole-database encrypted.
- The online registry client is disabled by default. NexOS ships a local demonstrator package, not a hosted public registry service.
- NexAI uses a deterministic mock provider until an external provider is configured. Destructive tool calls require explicit confirmation.
- Process CPU and application memory figures are simulated; host memory, CPU identity, platform, architecture, and uptime come from Electron's main process.
- Camera, microphone, and general renderer/app-host web permissions are denied by default.
- Platform signing credentials and external AI credentials are not included.

See [PROGRESS.md](PROGRESS.md) and [CHANGELOG.md](CHANGELOG.md) for phase status and release history.
