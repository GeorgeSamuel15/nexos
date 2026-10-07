# NexOS implementation progress

Last updated: 2026-10-04

## Implemented in v0.2

| Area                        | Status                           | Notes                                                                                                                                                       |
| --------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package provenance          | Complete                         | Ed25519 verification, canonical payloads, SHA-256 hashes, publisher metadata, and system/verified/community/unsigned trust levels                           |
| Per-user content protection | Complete for new `/home` content | AES-256-GCM file content, password-derived wrapped content keys, owner isolation, and key clearing on lock/logout                                           |
| Third-party app isolation   | Complete for declarative apps    | Dedicated sandboxed `WebContentsView`, JavaScript disabled, ephemeral sessions, denied navigation/popups/web permissions, strict CSP                        |
| Package registry client     | Complete client architecture     | Offline registry always available; HTTPS online registry is opt-in, DNS/IP constrained, bounded, timed out, schema-validated, and requires signed downloads |
| Package updates             | Complete for registry packages   | `nx update` compares semantic versions, downloads eligible updates, verifies online signatures, stops running instances, and persists updates               |
| Runtime boundary            | Prototype complete               | TypeScript binary protocol/client/server, injected Node host adapter, and matching dependency-free `no_std` Rust frame crate                                |
| Persistence migrations      | Complete                         | Application provenance, user-wrapped keys, and encrypted-file metadata added through append-only migrations                                                 |
| Tests and documentation     | Complete                         | Package trust, encryption/isolation policy, registry validation, protocol framing, IPC schemas, and architectural documents covered                         |

## Implemented in v0.1

| Area                             | Status                                 | Notes                                                                                                                          |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Monorepo foundation              | Complete                               | pnpm workspaces, strict TypeScript, Vite, React, Electron, Tailwind, lint, format, tests, root scripts                         |
| Desktop shell                    | Complete                               | Wallpaper, icons, taskbar, launcher, search, tray, clock, notifications, quick settings, power menu, context menu              |
| Window manager                   | Complete                               | Open, close, minimize, maximize, restore, focus, z-order, drag, resize, snap, multiple windows, shortcuts                      |
| Virtual filesystem               | Complete                               | SQLite persistence, nested nodes, metadata, read/write/mkdir/list/rename/remove/move/copy/stat/search/recents/favourites/trash |
| Files app                        | Complete                               | Sidebar, breadcrumbs, grid/list, search, create, rename, delete, copy/cut/paste, recycle bin, details                          |
| Terminal                         | Complete                               | Real parser and service-backed commands, history navigation, extensible command environment, `nx` commands                     |
| Processes and Task Manager       | Complete                               | PID lifecycle, process list, termination, simulated app metrics, safe host metrics                                             |
| Settings                         | Complete                               | All requested sections with working appearance, privacy, security, storage, notification, and app controls                     |
| Users                            | Complete                               | First-run setup, account creation, scrypt hashes, login/logout/lock/unlock, profiles                                           |
| Security                         | Complete for trusted-shell v1          | Sandbox, isolation, disabled Node integration, preload allowlist, Zod IPC, navigation restrictions, CSP, package validation    |
| App platform and SDK             | Complete for built-in/declarative apps | Registry, lifecycle, manifests, SDK bridge, safe declarative install/uninstall                                                 |
| Built-in apps                    | Complete                               | Files, Terminal, Settings, Notes, Calculator, Text Editor, Image Viewer, Task Manager, App Manager, System Info, NexAI         |
| Notifications, search, clipboard | Complete                               | Persistent notifications, global search, safe clipboard bridge and optional history                                            |
| Package manager                  | Complete local architecture            | `nx install/remove/list/search/info/update` with local version-pinned registry                                                 |
| NexAI                            | Complete mock-provider architecture    | Tool proposals, action validation, confirmation gate for destructive actions                                                   |
| Boot/auth experience             | Complete                               | Real boot stages, setup/login/lock screens, shutdown/restart actions                                                           |
| Database and event bus           | Complete                               | Versioned migration, repositories, strongly typed events                                                                       |
| Testing and CI                   | Complete                               | Unit/component/service tests plus Electron workflow; GitHub Actions verify and E2E jobs                                        |
| Distribution                     | Configured                             | Electron Builder targets and icon; signing/notarization intentionally external                                                 |

## Release gates that require external input

- Windows Authenticode certificate
- Apple Developer ID certificate and notarization credentials
- Final registered product/company metadata
- External NexAI provider credentials and provider-specific data policy

## Next engineering increment

1. Add a capability-scoped SDK bridge for interactive isolated apps without granting ambient shell authority.
2. Add publisher trust-store administration, key rotation, revocation, and transparency metadata.
3. Add password changes, content-key rewrapping, recovery codes, login throttling, and OS credential-vault integration.
4. Deploy a signed registry service with cache, rollback, permission-delta review, and compatibility metadata.
5. Carry the runtime protocol over an authenticated Rust companion daemon and run adapter conformance tests.
6. Extend encrypted storage coverage and provide an explicit legacy-content migration workflow.
