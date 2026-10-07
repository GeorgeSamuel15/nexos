# Build your first NexOS app

NexOS v0.2 has two application tiers:

- built-in TypeScript/React apps compiled with NexOS;
- installable declarative `.nxapp` packages that cannot execute arbitrary code.

Use a declarative package for a safe installable information app. Use a built-in module while developing an app that needs interactive React UI or broader SDK access.

## Create a safe `.nxapp`

Create `hello-nexos.nxapp` as UTF-8 JSON:

```json
{
  "format": "nexos-app-v1",
  "manifest": {
    "id": "dev.example.hello",
    "name": "Hello NexOS",
    "description": "My first installable NexOS app.",
    "version": "1.0.0",
    "icon": "file",
    "entry": "application.json",
    "runtime": "declarative",
    "permissions": [],
    "singleInstance": true,
    "system": false,
    "defaultWidth": 640,
    "defaultHeight": 480,
    "fileExtensions": []
  },
  "application": {
    "kind": "document-viewer",
    "title": "Hello NexOS",
    "body": "Hello from a validated, non-executable NexOS package."
  },
  "assets": {}
}
```

Open App Manager, choose the package, inspect the manifest and provenance, and install it. NexOS validates the entire payload before writing it to the registry. The package ID must contain at least two dot-separated segments and must not use the reserved `com.nexos.*` namespace. The installed document is shown in its own sandboxed `WebContentsView`; JavaScript and native execution remain disabled.

## Add an interactive built-in app

For an interactive app during v0.2 development:

1. Add a manifest to `apps/system-service/src/manifests.ts`.
2. Declare only the permissions the app needs.
3. Add a lazy React module in `apps/desktop/src/renderer/applications/`.
4. Register that lazy module in `applications/registry.tsx`.
5. Use `@nexos/sdk` or the injected desktop context for system calls.
6. Add focused tests and a launcher/file-association workflow when relevant.

Example manifest:

```ts
import type { AppManifest } from '@nexos/types';

export const readerManifest: AppManifest = {
  id: 'com.nexos.reader',
  name: 'Reader',
  description: 'Read text documents.',
  version: '1.0.0',
  icon: 'file',
  entry: 'reader',
  runtime: 'builtin',
  permissions: ['filesystem.read', 'notifications'],
  singleInstance: false,
  system: true,
  defaultWidth: 820,
  defaultHeight: 620,
  fileExtensions: ['.txt', '.md'],
};
```

Example component logic:

```tsx
import { useEffect, useState } from 'react';
import { nexos } from '@nexos/sdk';

export default function ReaderApp(): React.JSX.Element {
  const [text, setText] = useState('Loading…');

  useEffect(() => {
    void nexos.files
      .readFile('/home/Documents/Welcome to NexOS.md')
      .then(setText)
      .catch((error: unknown) => {
        setText(error instanceof Error ? error.message : 'Could not open the document.');
      });
  }, []);

  return <article className="app-surface whitespace-pre-wrap">{text}</article>;
}
```

## Manifest fields

| Field                            | Meaning                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `id`                             | Stable reverse-domain identifier                           |
| `name`, `description`, `version` | User-facing metadata and semantic version                  |
| `icon`                           | NexOS icon token                                           |
| `entry`                          | Logical app entry; package paths cannot escape the package |
| `runtime`                        | `builtin` or `declarative`                                 |
| `permissions`                    | Capabilities the app may request                           |
| `singleInstance`                 | Reuse one running instance when true                       |
| `system`                         | Reserved trusted-system marker                             |
| `defaultWidth`, `defaultHeight`  | Initial window size                                        |
| `fileExtensions`                 | Associations such as `.txt` or `.md`                       |

## Development checklist

- Never import `electron`, `node:*`, or a storage repository from application UI.
- Validate untrusted document content before interpreting it.
- Handle loading, empty, and error states.
- Request a sensitive permission at the moment it is needed and explain why.
- Keep file paths inside the NexOS virtual filesystem.
- Do not assume a window is the only instance of the app.
- Add `aria-label` text to icon-only actions.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository root.

The next app-runtime milestone is a capability-scoped SDK bridge for isolated third-party TypeScript apps. The current host intentionally renders only declarative content.
