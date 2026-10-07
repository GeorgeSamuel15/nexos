# Changelog

## 0.2.3 — 2026-10-07

### Fixed

- Synchronized the returning-login account selection when profiles finish loading, preventing an empty `@` username after startup.
- Replaced the raw empty-username validation output with a clear recovery message if no local profile is available.

## 0.2.2 — 2026-10-07

### Fixed

- Allowed the login screen to retrieve public local-account profiles before authentication, preventing the empty `@` account and validation deadlock.

## 0.2.1 — 2026-10-07

### Fixed

- Made the root shared-package build filter portable across Windows Command Prompt, PowerShell, Linux, and macOS.
- Made renderer asset URLs relative so packaged Electron builds load the desktop correctly from `file://`.

## 0.2.0 — 2026-10-04

### Added

- Ed25519 `.nxapp` signatures, canonical package payloads, SHA-256 provenance, publisher metadata, and trust levels.
- Per-user AES-256-GCM encryption for new `/home` file content with scrypt-wrapped content keys.
- Dedicated sandboxed `WebContentsView` hosts for installed declarative applications.
- An opt-in HTTPS registry client, App Manager integration, settings controls, and service-backed `nx` commands.
- A bounded, versioned runtime framing protocol in TypeScript and a matching dependency-free `no_std` Rust prototype.
- Storage migrations for application provenance, user secrets, and encrypted file metadata.
- Focused tests for signatures, encrypted content isolation, registries, runtime framing, and new IPC contracts.

### Security

- Remote registry downloads must have a valid publisher signature before installation or update.
- Registry transport rejects credentials, insecure schemes, local/private targets, redirects, oversized responses, invalid content types, and malformed schemas.
- Declarative hosts deny navigation, popups, Chromium permissions, JavaScript, Node integration, and persistent session storage.
- Content keys are removed from service memory on lock and logout.

## 0.1.0 — 2026-10-04

### Added

- Initial NexOS pnpm monorepo and strict TypeScript toolchain.
- Electron desktop with isolated preload bridge and validated IPC.
- SQLite migrations and repository-backed system services.
- User accounts with scrypt password hashing and lock/login flows.
- Virtual filesystem, process manager, permissions, app registry, event bus, settings, notifications, clipboard history, search, and NexAI services.
- Complete desktop/window/taskbar/launcher/search/tray experience.
- Eleven functional built-in applications.
- Safe declarative `.nxapp` format and local `nx` package workflow.
- Unit, component, service, IPC validation, and Electron workflow tests.
- GitHub Actions and Electron Builder configuration.

### Security

- `contextIsolation` and renderer sandbox enabled.
- Node integration disabled.
- Renderer navigation, popup, and native web permissions restricted.
- All IPC inputs validated with Zod.
- Arbitrary package JavaScript and native execution rejected.
