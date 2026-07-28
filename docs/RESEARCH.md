# Research: how to build this

Written before any code, kept as the record of *why* the app is shaped the way it is. Findings are
current as of July 2026.

---

## 1. The question behind the question

The repo started life as "CTRLbot Emulate", and the brief said "emulate Android devices … probably
ADB". Those two things pull in opposite directions, so the first job was to work out which one the
actual goals need.

The goals were:

- **A.** Produce really good video and screenshots for training material.
- **B.** Give users of the CTRLbot app a free utility to connect and set up *their own* phone from a
  Windows PC.

Both goals are about a **real device the user is holding**. Goal B is meaningless against a virtual
device — you cannot set up someone's actual phone by emulating a different one. And for goal A,
recording a real phone is more convincing than recording an emulator, because the UI, fonts, gesture
bar and OEM skin all match what viewers will see.

**So the product is a mirroring and control tool, not an emulator.** Virtual devices are supported as
a secondary path (see §5) because they cost almost nothing once the mirroring pipeline exists.

The project was renamed to **CTRLbot Mirror** off the back of this. "Emulate" is not just imprecise —
it sets the wrong expectation for the audience in goal B, who would reasonably read
"Android emulator for Windows" as "runs Android without a phone" and be disappointed to find it wants
a USB cable.

---

## 2. Mirroring vs emulation

| | Mirroring (scrcpy over ADB) | Emulation (AVD / Waydroid / BlueStacks) |
| --- | --- | --- |
| Shows the user's real phone | ✅ | ❌ |
| Latency | 35–70 ms | Higher, and variable under load |
| Startup | < 1 s after first push | 20–60 s cold boot |
| Resource cost | Negligible | GBs of RAM, needs CPU virtualisation |
| Real OEM skin, fonts, gestures | ✅ | ❌ generic AOSP |
| Arbitrary Android version / screen size | ❌ | ✅ |
| Works on a locked-down corporate laptop | ✅ | Often blocked (Hyper-V/HAXM) |

For both stated goals, mirroring wins on every row that matters. The one thing emulation gives you —
any Android version on demand — is a nice-to-have, so it became an optional panel rather than the
core.

**Decision: mirror real devices over ADB. Offer AVDs as an extra.**

---

## 3. Which mirroring engine

[scrcpy](https://github.com/Genymobile/scrcpy) (Genymobile, Apache-2.0) is the clear winner and has
no real competition. It needs no app installed on the device, no root and no account — just USB
debugging. It hits 1920×1080+ at 30–60 fps with sub-100 ms latency, and it is the engine behind most
commercial "mirror your Android" products.

The real question was **how** to use it. Three options:

### 3a. Shell out to `scrcpy.exe` and let it open its own window ❌

Simplest to build, and what most GUI wrappers (guiscrcpy et al.) do. Rejected because it defeats
goal A entirely: the video lives in a separate SDL window we do not control, so there is no way to
draw a device frame around it, composite a backdrop, overlay touch indicators, or capture the result
as a single clean image. It would also mean bundling `scrcpy.exe` and its DLLs (~40 MB).

### 3b. Reimplement the scrcpy protocol ❌

Full control, enormous cost, and it would drift out of sync with upstream scrcpy on every release.

### 3c. Use the official scrcpy **server** with a TypeScript client ✅

scrcpy is two halves: a small Java server (`scrcpy-server.jar`, ~90 KB) that runs on the device via
`app_process`, and a client that reads its video stream. The jar is the interesting half, and it is a
stable, documented, versioned interface.

[Tango ADB](https://github.com/yume-chan/ya-webadb) (`@yume-chan/*`, MIT) implements both the ADB
protocol and the scrcpy client protocol in TypeScript, for Node and browsers. That means:

- We push the **official, unmodified** scrcpy server jar, so device compatibility is upstream's.
- We receive a raw H.264/H.265/AV1 Annex-B stream and decode it ourselves.
- Decoding into a `<canvas>` unlocks every Studio feature: device frames, backdrops, ripple
  overlays, full-resolution screenshots and `captureStream()` recording all read from that canvas.

**Decision: `@yume-chan/adb` + `@yume-chan/adb-scrcpy` + the official scrcpy server jar.**

Verified package versions at time of writing:

| Package | Version |
| --- | --- |
| `@yume-chan/adb` | 2.6.2 |
| `@yume-chan/adb-scrcpy` | 2.3.2 |
| `@yume-chan/scrcpy` | 2.3.0 |
| `@yume-chan/scrcpy-decoder-webcodecs` | 2.5.3 |
| `@yume-chan/adb-server-node-tcp` | 2.5.2 |

**Version pin, and it matters:** scrcpy's latest release is v4.1, but `@yume-chan/adb-scrcpy` 2.3.2
only implements option sets up to `AdbScrcpyOptions3_3_3`. The scrcpy server verifies the client's
version string during handshake and refuses to start on a mismatch, so we pin the jar to **3.3.3** —
the newest version the client library actually speaks. That pin lives in exactly two places
(`scripts/fetch-scrcpy-server.mjs` and `src/shared/constants.ts`) and both are commented; bump them
together when Tango adds 4.x.

---

## 4. Talking to ADB: server, or raw USB?

Tango can drive USB directly (WebUSB / `node-usb`), skipping `adb.exe` entirely. Tempting — one less
dependency — but rejected:

- **Windows drivers are the whole problem.** OEM USB drivers, WinUSB claims and "device shows up in
  Device Manager but not in adb" are the top support issues, and `adb.exe` already contains years of
  workarounds.
- **Exclusive access.** A device can only be claimed by one USB client. Driving USB ourselves would
  break Android Studio, Flutter, Unity or a plain `adb` terminal running alongside us — unacceptable
  for goal B, where the user is mid-setup and may have other tools open.
- **Authorisation keys.** The RSA key exchange that produces the "Allow USB debugging?" prompt is
  handled by the ADB server, and its keys are shared with every other tool. Doing our own would make
  users authorise twice.
- **Wireless pairing.** Android 11+ pairing-code flow is implemented in the server.

**Decision: connect to the local ADB server over TCP (127.0.0.1:5037) via
`AdbServerNodeTcpConnector`.** We cooperate with the rest of the user's toolchain instead of fighting
it.

### Where does `adb.exe` come from?

The adb *source* is Apache-2.0, but Google's *binaries* ship under the Android SDK Terms, which do
not grant redistribution rights. Bundling `adb.exe` in an installer is legally murky (scrcpy's own
Windows release does it, but that is not a defence we want to rely on for a utility handed to
end users).

**Decision: download platform-tools from `dl.google.com` on first run**, into the app's own
user-data folder. This is unambiguously fine, keeps users on a current adb that understands new
devices, and costs one button press. If the machine already has an adb — via `ANDROID_SDK_ROOT`,
`ANDROID_HOME`, `%LOCALAPPDATA%\Android\Sdk`, or `PATH` — we use that instead and download nothing.

The scrcpy jar is different: Apache-2.0, freely redistributable. It is fetched at `npm install` time
with a pinned SHA-256 and shipped inside the installer, so the app works offline after install.

---

## 5. Virtual devices

Because a booted AVD appears to ADB as an ordinary device (`emulator-5554`), the *entire* mirroring
and capture pipeline works on it with no extra code. The only work needed was locating the SDK and
shelling out to `emulator -avd <name>`. That is why the feature exists: it was nearly free.

We deliberately do **not** bundle or install the emulator. It is multi-gigabyte, needs CPU
virtualisation, and most users of goal B will never want it.

---

## 6. Desktop shell

| Option | Verdict |
| --- | --- |
| **Electron** | ✅ Chosen |
| Tauri v2 | Smaller binaries, but the Node-side ADB work would need an IPC bridge to Rust, and WebView2's WebCodecs/`MediaRecorder` support is less predictable than bundled Chromium |
| WPF / WinUI 3 | Native and small, but no WebCodecs — we would be writing an H.264 decoder and a compositor by hand |
| Avalonia | Same decoder problem |

Electron wins because the two hardest parts of this app are both already solved inside it:

1. **WebCodecs `VideoDecoder`** — hardware-accelerated H.264/H.265/AV1 decoding, no native code.
2. **`canvas.captureStream()` + `MediaRecorder`** — screen recording of a composited canvas, also no
   native code.

Doing either from scratch in a native shell would dwarf the ~120 MB installer we pay for. The Node
side is a bonus: Tango, `child_process` for adb, and the npm ecosystem all work directly.

**Stack:** Electron 43 · electron-vite 5 · Vite 7 · React 19 · TypeScript 5.9 · Tailwind 4 ·
Zustand 5.

### Security posture

`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a strict CSP with no remote
origins, and a preload that exposes a fixed, typed API surface. No `remote`, no arbitrary IPC.

---

## 7. Where video is decoded

Video could be decoded in main (via a native decoder) and pushed as bitmaps, or passed raw to the
renderer. We pass it raw, over a **dedicated `MessagePort`** rather than the normal IPC bus.

Reasoning:

- A 60 fps stream is ~60 messages/second. On the main `ipcRenderer` channel it would queue behind —
  and delay — every UI request.
- Decoded frames need to be on a canvas anyway for the Studio features. Decoding in the renderer puts
  them there for free.
- WebCodecs uses the GPU. A main-process decoder would be software, or a native dependency.

One wrinkle: `contextBridge` refuses to marshal a live `MessagePort` into the renderer world, so the
**preload script owns both ends** of the channel and republishes packets to renderer callbacks. And
Electron's `MessagePortMain` cannot transfer `ArrayBuffer`s, so each packet is copied once — about
1 MB/s at default bitrate, which is nothing.

---

## 8. What was considered and dropped

- **Bundling `scrcpy.exe`** — 40 MB, and the separate window kills the Studio features (§3a).
- **`adb exec-out screenrecord`** for recording — device-side, native resolution, but capped at
  3 minutes, no device frame, no backdrop, and it fights the mirror session for the encoder.
  Rejected. (`screencap -p` *is* used as a full-resolution screenshot fallback, which has none of
  those problems.)
- **Real app labels in the app manager** — requires parsing `dumpsys package`, which is slow and
  format-unstable. Package names with a prettified label were the honest trade.
- **WebUSB device access** — see §4.
- **Light theme** — the stage is a dark surface by design; a light chrome is on the roadmap but was
  not worth splitting the design system for v0.1.
