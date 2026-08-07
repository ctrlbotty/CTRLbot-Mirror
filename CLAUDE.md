# CTRLbot Mirror — notes for Claude

Windows Electron app that mirrors, controls and captures Android devices over ADB. Built for making
training videos and for helping end users set up their own phone.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing anything structural**, and
[`docs/RESEARCH.md`](docs/RESEARCH.md) before questioning a technology choice — the trade-offs are
already written down there.

## Non-obvious constraints

- **The scrcpy server version is pinned to 3.3.3** and lives in two files that must move together:
  `scripts/fetch-scrcpy-server.mjs` (`VERSION` + `SHA256`) and `src/shared/constants.ts`
  (`SCRCPY_SERVER_VERSION`). The server verifies the client's version string during handshake and
  refuses to start on a mismatch. Only bump to a version `@yume-chan/adb-scrcpy` has an
  `AdbScrcpyOptions<x_y_z>` class for — upstream scrcpy is well ahead of the client library.

- **`adb.exe` is never committed or redistributed.** Google's SDK terms do not permit it. It is
  downloaded from `dl.google.com` at runtime, or reused from the user's existing SDK. Do not "fix"
  this by vendoring it.

- **Video does not travel on the normal IPC bus.** It goes over a `MessagePort`. Two Electron quirks
  shape the implementation: `contextBridge` cannot marshal a live `MessagePort` into the renderer
  world (so the _preload_ owns both ends), and `MessagePortMain` cannot transfer `ArrayBuffer`s (so
  each packet is copied with `.slice()`).

- **Import specifiers end in `.js`, even from `.tsx`.** Vite maps them back to the TypeScript
  source. Changing this breaks the ESM main-process build.

- **One scrcpy session at a time.** Enforced in `scrcpy-session.ts` and by a single-instance lock.
  Two sessions fight over the device socket.

- **`sandbox: true` on the renderer**, so the preload is built as CJS (`index.cjs`) while main is
  ESM (`index.mjs`). See `electron.vite.config.ts`.

## Commands

```bash
npm run dev             # Electron + Vite, HMR on the renderer
npm run build           # typecheck + bundle
npm run typecheck       # both tsconfigs
npm run lint            # zero warnings allowed
npm run dist            # NSIS installer + portable exe
npm run dist:installer  # NSIS setup wizard only
npm run dist:portable   # Single-file portable exe only
```

Node 22.12+ required (Vite 7). This machine has it under nvm; `nvm use 22.20.0` if `node -v` says
20.x.

## Where things live

`src/shared/` is the contract between processes — change it and both sides fail to compile, which is
the point. `src/main/services/` is one file per capability. `src/main/ipc/index.ts` is the only file
that touches `ipcMain`. `src/renderer/src/lib/` is the React-free half of the renderer: video
decode, input mapping, canvas compositing, recording.

## Style

Services return `CommandResult` for expected failures (a package that will not uninstall) and throw
only for genuine faults. Comments explain why, not what.
