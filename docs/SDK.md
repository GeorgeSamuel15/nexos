# NexOS SDK and system APIs

`@nexos/sdk` gives applications a typed view of the safe preload bridge. It does not expose Electron or Node.js.

```ts
import { nexos } from '@nexos/sdk';

const document = await nexos.files.readFile('/home/Documents/example.txt');
await nexos.notifications.show({
  applicationId: 'com.example.reader',
  title: 'Opened',
  message: `${document.length} characters loaded`,
});
```

The runtime configures the bridge automatically inside NexOS. Tests can call `configureNexOSBridge()` with a typed test double.

## Filesystem API

All paths are absolute NexOS paths, not host paths.

```ts
await nexos.files.mkdir('/home/Documents/Projects');
await nexos.files.writeFile('/home/Documents/Projects/readme.md', '# Project', {
  create: true,
  overwrite: false,
  mimeType: 'text/markdown',
});

const children = await nexos.files.readdir('/home/Documents/Projects');
const content = await nexos.files.readFile(children[0]!.path);
await nexos.files.setFavorite(children[0]!.path, true);
```

Methods: `readFile`, `writeFile`, `mkdir`, `readdir`, `rename`, `remove`, `restore`, `copy`, `move`, `stat`, `search`, `recent`, `favorites`, `setFavorite`, and `emptyTrash`.

`remove(path)` moves a writable node to the recycle bin. `remove(path, true)` permanently deletes it. Writes default to create and overwrite; set the options explicitly when a collision should be an error.

## Application API

```ts
const applications = await nexos.apps.list();
const launch = await nexos.apps.launch('com.nexos.files');
await nexos.apps.close(launch.process.pid);
```

Methods: `list`, `get`, `launch`, `close`, `installPackage`, `uninstall`, `packageInfo`, `registryStatus`, `registrySearch`, `installFromRegistry`, and `packageCommand`. Install and inspection accept a `Uint8Array` containing a v1 `.nxapp` document. Registry methods are trusted-shell operations: online access is opt-in and remote packages must be signed.

## Process API

```ts
const processes = await nexos.processes.list();
const process = await nexos.processes.get(processes[0]!.pid);
await nexos.processes.stop(process.pid);
```

Processes are NexOS application processes rather than arbitrary host PIDs. The process API never spawns or signals native programs.

## Settings API

```ts
const current = await nexos.settings.get();
const next = await nexos.settings.update({
  theme: current.theme === 'dark' ? 'light' : 'dark',
  accent: '#34d399',
});
```

Supported preferences are theme, accent, wallpaper, taskbar position/compactness, reduced motion, clipboard history, notifications, and online package-registry configuration. Registry URLs are restricted again in the trusted service, not merely accepted because the renderer sent them.

## Notifications API

```ts
const unsubscribe = nexos.notifications.onCreated((notification) => {
  console.info(notification.title);
});

await nexos.notifications.show({
  applicationId: 'com.example.app',
  title: 'Saved',
  message: 'Your file was saved.',
});

unsubscribe();
```

Methods: `list`, `show`, `markRead`, `dismiss`, `dismissAll`, and `onCreated`.

## Permission API

```ts
const granted = await nexos.permissions.request({
  applicationId: 'com.example.app',
  applicationName: 'Example',
  permission: 'clipboard',
  reason: 'Paste text into the current document.',
});
```

An application can request only permissions declared in its manifest. `list` reports persisted grants; `set` is a trusted settings operation.

## Clipboard API

The clipboard bridge is text-only.

```ts
await nexos.clipboard.writeText('NexOS');
const value = await nexos.clipboard.readText();
const history = await nexos.clipboard.history();
```

Clipboard history can be disabled and cleared in Settings.

## Users and system APIs

`nexos.users` supports state, account creation, login, logout, lock, unlock, and listing. `nexos.system` supports initialization, safe host information, storage summary, power actions, and boot progress subscriptions.

Power actions are the closed union `lock | logout | restart | shutdown`; arbitrary commands are not accepted.

## Search and NexAI APIs

`nexos.search.query(text)` returns typed application, file, setting, and command results. `nexos.ai.chat(text)` returns an assistant message and possibly a validated tool proposal. Pass that proposal to `nexos.ai.execute(action, confirmed)` only after presenting it to the user; destructive actions require `confirmed: true` in the system service.

## Windows API

Window lifecycle remains a trusted shell concern implemented by `@nexos/window-manager`. The preload exposes narrow `mountDeclarativeHost`, `updateDeclarativeHost`, `unmountDeclarativeHost`, and `focusDeclarativeHost` methods so the shell can place isolated `WebContentsView` content over a managed window. Those methods validate IDs, bounds, theme, accent, and visibility; installed declarative content does not receive this bridge. A future interactive app runtime requires a separate caller-scoped window API rather than access to the global store.

## Error handling

Bridge calls reject with an `Error` carrying a stable `code` and safe `details` object. Catch errors at the application boundary and show a useful message; do not treat all failures as missing files.

```ts
try {
  await nexos.files.readFile('/home/Documents/missing.txt');
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown NexOS error';
  await nexos.notifications.show({
    applicationId: 'com.example.app',
    title: 'Could not open file',
    message,
  });
}
```
