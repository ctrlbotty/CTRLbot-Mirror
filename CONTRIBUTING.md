# Contributing

## Setup

```bash
npm install
npm run dev
```

Node **22.12+** (see `.nvmrc`). `npm install` fetches the scrcpy server jar with a pinned SHA-256; if
that step fails, mirroring will not work — run `npm run fetch:scrcpy` to retry.

## Scripts

|                        |                                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm run dev`          | Electron + Vite with HMR on the renderer                               |
| `npm run build`        | Typecheck, then bundle main / preload / renderer into `out/`           |
| `npm run dist`         | Build, then produce an NSIS installer and a portable exe in `release/` |
| `npm run typecheck`    | Both tsconfigs — node and web                                          |
| `npm run lint`         | ESLint, zero warnings allowed                                          |
| `npm run format`       | Prettier                                                               |
| `npm run fetch:scrcpy` | Re-download the scrcpy server jar                                      |

Run `npm run typecheck && npm run lint` before pushing; CI runs both.

## Layout

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first — it explains the process split and why
video has its own channel.

- `src/shared/` — the IPC contract. Both processes import it, so a change here fails the build on
  both sides rather than at runtime.
- `src/main/services/` — one file per capability. Services own their state and expose plain
  functions or a singleton.
- `src/main/ipc/index.ts` — the only place that knows about `ipcMain`.
- `src/preload/index.ts` — the only place that knows about `contextBridge`.
- `src/renderer/src/lib/` — no React. Video, input, compositing, recording.
- `src/renderer/src/components/panels/` — one panel per nav item.

## Conventions

**Import specifiers end in `.js`**, including from `.tsx` files. Vite maps them back to the
TypeScript source. This keeps the ESM main-process output correct without running two conventions
side by side.

**Services return `CommandResult` for expected failures.** A package that will not uninstall, a
folder that will not open, a device that will not reconnect — those are results, not exceptions.
Reserve `throw` for genuine faults; `handle()` in `ipc/index.ts` turns those into rejected IPC
promises carrying a readable message.

**Nothing crosses IPC that structured clone cannot carry.** No class instances, no functions. 64-bit
transport IDs become strings.

**Comments explain why, not what.** If a line needs a comment to say what it does, rename something
instead.

## Adding a feature

1. Add the types to `src/shared/types.ts`.
2. Add the channel to `Channel` and the method to `CtrlbotApi` in `src/shared/ipc.ts`.
3. Implement the service in `src/main/services/`.
4. Register the handler in `src/main/ipc/index.ts`.
5. Forward it in `src/preload/index.ts`.
6. Use it from a panel.

Steps 2 and 5 are what stop the two processes drifting — the compiler will not let you skip either.

## Bumping scrcpy

The scrcpy server version is pinned in two places and they must move together:

- `scripts/fetch-scrcpy-server.mjs` — `VERSION` and `SHA256`
- `src/shared/constants.ts` — `SCRCPY_SERVER_VERSION`

Only bump to a version `@yume-chan/adb-scrcpy` has an options class for (`AdbScrcpyOptions<x_y_z>`).
The server verifies the client's version string during handshake and refuses to start on a mismatch.

## Testing on a device

There is no automated device test — it needs real hardware. Before a release, check by hand:

- USB connect, authorise, mirror, control (tap, swipe, type, back/home/recents)
- Rotate the device mid-session; the stage should reflow
- Screenshot at 1×/2×/3×, with and without the frame
- Record 30 seconds, confirm the file plays
- Wireless: Go wireless, unplug, keep mirroring
- Unplug mid-session; the app should recover cleanly, not hang
