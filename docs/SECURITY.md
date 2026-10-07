# NexOS security model

## Scope and trust assumptions

NexOS v0.2 is a local Electron desktop application. The Electron main process and bundled system-service are trusted. The React renderer is treated as less trusted and receives only an allowlisted bridge. Built-in apps currently share the trusted desktop renderer. Declarative third-party packages are untrusted data and are never executed as JavaScript or native code.

This model protects the host boundary and prevents installed packages from becoming arbitrary code execution. It is not yet a multi-process isolation boundary between every built-in app.

## Electron controls

- `contextIsolation: true`
- `nodeIntegration: false`
- Chromium sandbox enabled
- web security enabled and insecure mixed content disabled
- no raw `ipcRenderer`, filesystem, process, shell, or Electron object exposed
- one typed `window.nexos` API created by `contextBridge`
- explicit IPC channel allowlist
- Zod validation for every inbound IPC payload
- source-frame validation for packaged files and the exact local Vite development origin
- new windows denied
- cross-origin navigation denied
- browser permission requests denied by default
- restrictive Content Security Policy in `index.html`
- renderer crash recovery without deleting user data

Installed declarative apps are placed in dedicated sandboxed `WebContentsView` instances. Those views have Node integration and JavaScript disabled, use an ephemeral partition, carry a `default-src 'none'` CSP, deny permission checks/requests and popups, and cannot navigate away from their generated data document. The host HTML-escapes package content before rendering it.

Return values use a serializable success/error envelope. Internal errors are normalized before crossing the bridge; errors are not silently swallowed.

## Authentication

Passwords are never stored in plaintext. Each account receives a random 16-byte salt and a 64-byte key derived with Node's `scrypt` implementation using `N=16384`, `r=8`, and `p=1`. Verification uses `timingSafeEqual`. The database stores the algorithm and parameters with the salt and derived key so the format can be migrated later.

The current session lives only in process memory. Files, settings, notification history, and permissions require an active, unlocked user. A lock invalidates privileged service calls until successful password verification.

Each user also receives a random 256-bit content key. A second scrypt derivation (`N=32768`, `r=8`, `p=1`) produces a wrapping key from the password; AES-256-GCM wraps the content key with the user ID as authenticated data. New file content under `/home` is encrypted with that content key using a fresh 96-bit IV and authenticated owner context. The unwrapped key is cleared on lock, logout, session replacement, and service shutdown. Other users cannot list or open another owner’s encrypted rows.

This is content encryption, not whole-database encryption. Paths, filenames, sizes, timestamps, settings, notification history, system/default files, and legacy plaintext file rows remain visible to someone who can read the database. OS account protection and filesystem permissions therefore remain part of the trust model. Password change, recovery, and legacy-content migration are not yet implemented.

## Permissions

Applications declare permissions in their manifest:

| Permission         | Protected capability                                       |
| ------------------ | ---------------------------------------------------------- |
| `filesystem.read`  | Read, list, search, stat, recent and favourite files       |
| `filesystem.write` | Create, update, move, copy, trash and restore files        |
| `camera`           | Reserved; browser camera access remains denied in v0.2     |
| `microphone`       | Reserved; browser microphone access remains denied in v0.2 |
| `notifications`    | Create application notifications                           |
| `network`          | Reserved for a future brokered network client              |
| `system.settings`  | Change settings and install/uninstall packages             |
| `process.read`     | Inspect NexOS processes                                    |
| `process.kill`     | Terminate NexOS processes                                  |
| `clipboard`        | Use the safe text-only clipboard bridge and history        |

A permission may be granted only if the manifest declares it. Grants are per user and per application. Sensitive permission requests use a main-process confirmation dialog. The trusted shell manifest has the capabilities needed to operate the desktop; third-party app hosting will pass the caller's identity rather than the shell identity.

## Virtual filesystem controls

- paths must be absolute, normalized POSIX paths of at most 1024 characters
- null bytes and unsafe names are rejected
- protected roots cannot be renamed or deleted
- applications never receive the database path or repository access
- deleting normally moves content into `/home/.Trash`; permanent deletion is explicit
- transactional operations prevent partially moved/copied directory trees
- file and IPC payload sizes are bounded

The virtual filesystem is a database-backed namespace and is not a gateway to arbitrary host files.

## Application package controls

`.nxapp` v1 packages are UTF-8 JSON no larger than 5 MiB. Zod validates the complete shape, manifest ID, semantic version, permissions, entry, and declarative content. Reserved `com.nexos.*` IDs, absolute/traversing entry paths, and unsafe asset paths are rejected. Built-in applications cannot be uninstalled.

The v1 package format supports only a `document-viewer` declarative application. It does not execute scripts, WebAssembly, native binaries, package-manager hooks, or shell commands.

Packages may include publisher metadata and an Ed25519 signature over a deterministic canonical JSON payload that excludes the signature itself. NexOS verifies the signature, records the exact package blob SHA-256 hash, and assigns one of four trust levels: `system`, `verified`, `community`, or `unsigned`. A valid self-declared key is `community`; only a key configured in the trusted-publisher set becomes `verified`. A signature is integrity and publisher-key proof, not by itself an identity certificate.

Online registry access is disabled by default. When enabled, the trusted main-process client:

- accepts only HTTPS base URLs without embedded credentials, query strings, or fragments;
- rejects localhost, private, link-local, documentation, multicast, and other blocked IP ranges;
- resolves every address, rejects a host if any answer is blocked, and pins the selected public address for the TLS request;
- does not follow redirects and applies a 10-second timeout;
- requires JSON content types and bounds indexes to 512 KiB and packages to 5 MiB;
- validates response schemas and requires a valid package signature for remote install/update.

## NexAI controls

NexAI uses a deterministic local mock provider. Tool proposals have a closed schema and a small allowlist. The system service revalidates every proposed action. Actions marked destructive cannot execute without an explicit confirmation flag; callers cannot bypass this server-side check.

An external provider must never receive filesystem content by default. A provider adapter should use scoped user consent, redact secrets, limit tool results, and treat model output as untrusted input.

## Secrets and distribution

No credentials, signing certificates, or API keys belong in source control or renderer environment variables. Platform signing should run in a protected release pipeline. External provider secrets must be read by the trusted host and exposed only through narrow brokered operations.

## Known v0.2 boundaries

- Built-in apps are isolated from Node but not from each other because they share one renderer.
- Only new user-owned `/home` file content is encrypted; metadata and the rest of the database are not.
- The shipped trust store has no public certificate authority, revocation, transparency log, or key-rotation UI.
- Declarative third-party hosts do not yet receive an interactive, caller-scoped SDK bridge.
- No hosted online registry is bundled; the client must be pointed at a compatible service.
- Brute-force login throttling and OS credential-vault integration are not implemented.
- Host process metrics are safe read-only summaries; per-app CPU and memory are simulated.

These are explicit release boundaries, not claims that Electron is a kernel or a complete mandatory-access-control system.
