# Architecture

## Processes

```
┌─────────────────────────── Electron main (Node, ESM) ────────────────────────────┐
│  platform-tools  →  locates or downloads adb.exe                                 │
│  adb-server      →  owns AdbServerClient on 127.0.0.1:5037                       │
│  device-manager  →  live device tracker, per-serial Adb transports               │
│  scrcpy-session  →  pushes the server jar, starts it, pumps video                │
│  apps / files / shell / logcat / avd / capture / settings                        │
└───────────┬──────────────────────────────────────────────┬───────────────────────┘
            │ ipcMain.handle (requests)                    │ MessagePortMain
            │ webContents.send (events)                    │ (video packets only)
┌───────────▼──────────────────────────────────────────────▼───────────────────────┐
│  preload (CJS, sandboxed) — contextBridge → window.ctrlbot                        │
│  owns both ends of the video MessageChannel and republishes packets               │
└───────────┬──────────────────────────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────────────────────────┐
│  renderer (React 19)                                                             │
│    lib/video.ts     WebCodecs VideoDecoder → WebGL canvas                        │
│    lib/input.ts     pointer/keyboard → ControlCommand                            │
│    lib/compose.ts   canvas compositor: backdrop + bezel + screen                 │
│    lib/recorder.ts  captureStream() → MediaRecorder                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Everything crossing a process boundary is defined in `src/shared/` — `types.ts` for the data,
`ipc.ts` for the channels and the API surface. Both sides import the same file, so a rename breaks
the build rather than the app.

## Starting a mirror session

1. Renderer calls `api.mirror.start(serial, options)`.
2. Main reads `resources/scrcpy-server.jar` and pushes it to `/data/local/tmp/scrcpy-server.jar`.
3. `AdbScrcpyClient.start()` launches it through `app_process`, sets up the reverse tunnel and
   connects the video, audio and control sockets.
4. Main posts `{kind:'metadata'}` down the MessagePort, then one message per packet.
5. Preload republishes to `lib/video.ts`, which builds a `WebCodecsVideoDecoder` bound to the stage
   canvas and writes packets into it.
6. `decoder.sizeChanged` drives the stage layout, so a device rotation reflows the frame.

Teardown runs from either end: `mirror.stop()`, the server exiting, the device unplugging, or the
video stream erroring all converge on the same cleanup.

### Why video has its own channel

A 60 fps stream is ~60 messages a second. On the shared `ipcRenderer` bus it would queue behind — and
delay — every UI request. A dedicated `MessageChannel` keeps them independent.

Two Electron constraints shape the implementation:

- `contextBridge` cannot marshal a live `MessagePort` into the renderer world, so the **preload**
  owns both ends and republishes to renderer-world callbacks.
- `MessagePortMain.postMessage` cannot transfer `ArrayBuffer`s (only ports), so each packet is copied
  once via `.slice()`. At 8 Mbps that is ~1 MB/s of memcpy — immaterial.

## Input

`lib/input.ts` maps browser events to scrcpy control messages:

- Pointer coordinates are converted to **device pixels** using the canvas's bounding rect and the
  current decoded video size. The renderer is the authority on that size because it changes on
  rotation, and the decoder reports it first.
- `pointermove` is coalesced onto `requestAnimationFrame`. A mouse fires hundreds of moves a second;
  forwarding each one floods the control socket without making the drag smoother.
- Printable characters go through `injectText`, not synthetic key codes — that is what makes IMEs,
  accents and emoji work. Navigation and editing keys go through `injectKeyCode`.
- Right click is Back, middle click is Home, matching scrcpy's own convention.

## The Studio compositor

`lib/compose.ts` is the single source of truth for what a capture looks like. It computes a
`FrameGeometry` (outer size, bezel rect, screen rect, radii) from the video size plus the Studio
settings, then draws backdrop → bezel → clipped video → punch-hole with canvas primitives.

The live stage in `Stage.tsx` reads the **same** geometry and the same `frameSpec()` colours, but
renders the bezel in CSS for cheapness. That is deliberate: the preview and the exported file are
computed from one measurement, so they cannot drift.

- **Screenshot**: `composeToBlob()` renders one frame at 1×/2×/3× and returns a PNG. With
  "frame in captures" off, it uses `decoder.snapshot()` instead — the raw frame at native
  resolution.
- **Recording**: `StageRecorder` runs `composeFrame()` on every animation frame into an offscreen
  canvas, and feeds `canvas.captureStream()` to a `MediaRecorder`. What you record is what you saw,
  frame and backdrop included.

## Module map

| Path | Responsibility |
| --- | --- |
| `src/main/index.ts` | App lifecycle, single-instance lock, shutdown |
| `src/main/window.ts` | Frameless BrowserWindow, security flags |
| `src/main/ipc/index.ts` | Every handler, plus environment bootstrap |
| `src/main/services/platform-tools.ts` | Find or download adb; `runAdb()` |
| `src/main/services/adb-server.ts` | ADB server lifecycle, `AdbServerClient` |
| `src/main/services/device-manager.ts` | Tracker, transport cache, device details, wireless |
| `src/main/services/scrcpy-session.ts` | The one active session; control message dispatch |
| `src/main/services/{apps,files,shell,logcat,avd,capture}.ts` | Feature services |
| `src/preload/index.ts` | `window.ctrlbot`, video channel ownership |
| `src/shared/{types,ipc,constants}.ts` | The contract |
| `src/renderer/src/lib/*` | Video, input, compositor, recorder |
| `src/renderer/src/state/store.ts` | Zustand store + main-event subscriptions |
| `src/renderer/src/components/*` | Chrome, stage, panels |

## Conventions

- **One session at a time.** A second scrcpy session would fight the first over the device socket.
  `scrcpy-session.ts` enforces it, and a single-instance lock stops a second window doing the same.
- **Services return `CommandResult`, they do not throw** for expected failures (a package that will
  not uninstall, a folder that will not open). Handlers convert genuine exceptions into rejected IPC
  promises with a readable message.
- **`.js` import specifiers everywhere**, including from `.tsx` files. Vite maps them back to the
  TypeScript source; it keeps the main-process ESM output correct without two conventions.
- **bigint never crosses IPC as bigint** except inside video packet `pts`, where structured clone
  handles it. Transport IDs become strings.
