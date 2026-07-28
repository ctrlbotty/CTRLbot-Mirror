# CTRLbot Mirror

A Windows app for mirroring, controlling and **capturing** Android devices — built for making
training videos that look good, and for helping people get their phone talking to their PC.

<!-- Screenshots go here once the first build is cut. -->

---

## What it actually does

Despite the name, this does **not** run a virtual Android on your PC by default. It mirrors a _real_
device over ADB — which is both faster and more honest for training material, because what you
record is what your users will actually see on their own phone. (Virtual devices are supported too,
if you have the Android emulator installed; see [Virtual devices](#virtual-devices).)

See [`docs/RESEARCH.md`](docs/RESEARCH.md) for why mirroring beat emulation for this use case.

### Two audiences, one app

**For recording training material**

- Live mirror at up to native resolution, 60 fps, ~35–70 ms latency
- Device frames drawn around the screen (Pixel / Galaxy / flat / plain), on a backdrop you choose
- One-key screenshots at 1×, 2× or 3× — saved straight to a folder, no save dialog in your way
- Screen recording of the **composed** stage (frame, backdrop and all) to WebM or MP4
- Touch ripples so viewers can see where you tapped
- Clean mode (hide every bit of app chrome) for a borderless capture
- "Blank the device screen" so the phone in your hand looks off while you record

**For helping someone connect their device**

- Guided setup that detects what is missing and fixes what it can
- Downloads Google's official platform-tools automatically — no manual SDK install
- Plain-English steps for Developer options, USB debugging and the authorisation prompt
- One-click switch from USB to wireless ADB, plus Android 11+ pairing-code support
- App manager, file browser, shell and logcat for the fiddly parts of setup

---

## Install

Grab the installer or the portable build from
[Releases](https://github.com/ctrlbotty/CTRLbot-Mirror/releases), or build it yourself:

```bash
npm install
npm run dev
```

Requires **Node 22.12+**. `npm install` downloads the scrcpy server jar (~90 KB, checksum-pinned);
`adb.exe` is fetched on first run from Google if your machine does not already have it.

To produce an installer:

```bash
npm run dist
```

---

## Quick start

1. Open the app. If ADB is missing, **Setup → Install now** fetches it.
2. On the phone: Settings → About phone → tap **Build number** seven times → Developer options →
   turn on **USB debugging**.
3. Plug the phone in with a **data** cable (charge-only cables are the usual culprit when nothing
   shows up).
4. Tap **Allow** on the "Allow USB debugging?" prompt, ticking _Always allow from this computer_.
5. **Devices → Start mirroring.**

### Controls

| Input                              | Does                                                |
| ---------------------------------- | --------------------------------------------------- |
| Left click / drag                  | Tap, swipe                                          |
| Right click                        | Back                                                |
| Middle click                       | Home                                                |
| Scroll wheel                       | Scroll                                              |
| Typing                             | Injected as text (IMEs, accents and emoji all work) |
| Arrows, Enter, Backspace, Esc, Tab | Sent as Android key events                          |
| `Ctrl` + `V`                       | Paste the PC clipboard into the device              |
| `Esc`                              | Leave clean mode                                    |

The toolbar under the stage has Back / Home / Recents, rotate, volume, power, the notification
shade, screenshot, record and clean mode.

---

## Virtual devices

If you have Android Studio's emulator installed, **Virtual devices** lists your AVDs and boots them.
A running emulator shows up as an ordinary device, so mirroring, control and every capture feature
work on it unchanged. Nothing here requires the SDK — the panel simply stays empty without it.

---

## How it is put together

```
Android device ──scrcpy server (on device)──┐
                                            │  H.264/H.265/AV1 over an ADB socket
                                            ▼
  Electron main ── @yume-chan/adb ── ADB server (adb.exe, port 5037)
        │
        │  MessagePort (video only, off the main IPC bus)
        ▼
  Renderer ── WebCodecs decode ── WebGL canvas ── screenshots / MediaRecorder
```

The short version: the main process speaks the ADB and scrcpy protocols in TypeScript, and the
renderer decodes video with the GPU decoder Chromium already ships. Frames landing on a real canvas
is what makes the Studio features possible at all.

Full detail — including why video gets its own MessagePort and why we download adb instead of
bundling it — is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Docs

|                                                      |                                                       |
| ---------------------------------------------------- | ----------------------------------------------------- |
| [`docs/RESEARCH.md`](docs/RESEARCH.md)               | Why mirroring over emulation, and which libraries won |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)       | Process model, data flow, module map                  |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md)           | Every feature, in order                               |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | When a device will not show up                        |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)                 | What is next                                          |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                 | Dev setup and conventions                             |

---

## Third-party components

| Component                                                            | Licence           | How it is used                                             |
| -------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| [scrcpy](https://github.com/Genymobile/scrcpy) server                | Apache-2.0        | Fetched at install time, pushed to the device, run there   |
| [Tango ADB](https://github.com/yume-chan/ya-webadb) (`@yume-chan/*`) | MIT               | TypeScript ADB + scrcpy protocol client                    |
| Android SDK platform-tools (`adb.exe`)                               | Android SDK Terms | **Downloaded from Google at runtime, never redistributed** |
| [Electron](https://electronjs.org), React, Tailwind                  | MIT               | App shell and UI                                           |

CTRLbot Mirror itself is Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

---

## Privacy

No telemetry, no accounts, no network calls except two, both to first-party hosts and both visible
in the UI:

- `dl.google.com` — the platform-tools download, only when you press Install
- `github.com` — the scrcpy server jar, at `npm install` time only

Everything else is local: USB, or your own LAN for wireless ADB.
