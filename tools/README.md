# NexOS tools

Repository-wide commands are intentionally exposed through the root `package.json` so local development and CI use the same entry points.

- `pnpm dev` builds shared packages and starts Vite plus Electron.
- `pnpm verify` runs lint, strict type checking, tests, and production builds.
- `pnpm test:e2e` builds NexOS and runs the Electron workflow.
- `pnpm package` creates platform artifacts with Electron Builder.

Future code-generation and release utilities belong in this directory. They must validate inputs, avoid embedding credentials, and remain callable from a root script.
