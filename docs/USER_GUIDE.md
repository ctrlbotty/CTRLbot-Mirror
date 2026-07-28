# User guide

## The layout

```
┌──────────────────────────────────────────────────────────┐
│ title bar                                                │
├────┬──────────────┬──────────────────────────────────────┤
│    │              │                                      │
│nav │   panel      │            stage                     │
│rail│              │      (the mirrored device)           │
│    │              │                                      │
├────┴──────────────┴──────────────────────────────────────┤
│ device controls          status          capture controls │
└──────────────────────────────────────────────────────────┘
```

The nav rail switches panels. Panels marked with a device icon need a device selected first.

---

## Setup

The first panel you will see if ADB is not ready. It is a live checklist — each step turns green on
its own as it is satisfied, so you can leave it open on a second monitor while walking someone
through the process.

- **Install now** downloads Google's platform-tools into this app's own folder. Nothing is installed
  system-wide.
- **I have adb** lets you point at an existing `adb.exe` (for example the one inside Android Studio's
  SDK) instead.
- **Diagnostics** at the bottom shows what was found and offers Restart ADB / Open logs / Re-check.

---

## Devices

Every connected device, with its state:

| Badge | Means |
| --- | --- |
| **Ready** | Authorised — you can mirror |
| **Not authorised** | Connected, but the phone has not trusted this PC yet |
| **Offline** | Half-open connection; press the reconnect button |

Select a device to see its details: model, Android version, screen size, battery, build. Then
**Start mirroring**.

### Going wireless

With a device on USB, **Go wireless** switches it to wireless ADB and connects, so you can unplug
the cable. Useful when you want the phone in your hand on camera.

For a device that has never been plugged in, use **Pair over Wi-Fi**. On the phone: Developer
options → Wireless debugging → *Pair device with pairing code*. Copy the address and code shown
there. (The pairing port is not 5555 and changes every time.) Pairing needs Android 11 or newer.

---

## Studio

Everything about how captures look.

### Device frame

Five options — **None**, **Flat**, **Rounded**, **Pixel**, **Galaxy**. They are drawn, not
photographed, so they stay sharp at any capture scale and adapt to whatever aspect ratio the device
reports after a rotation. Pixel and Galaxy add a punch-hole camera; Rounded, Pixel and Galaxy add
side buttons.

### Backdrop

Gradient, dark, light, checkerboard (which exports as **real transparency** in the PNG), or a custom
colour. Plus a padding slider and a drop-shadow toggle.

### Touch ripples

A circle expands wherever you tap. On by default because it is the single thing that makes a
walkthrough video readable — viewers can see what you pressed.

There is also **Show touches on device** under Stream quality, which turns on Android's *own* tap
indicator. That one is baked into the video stream, so it also appears in device-side screenshots.
Ripples are drawn by this app and only appear in Studio captures.

### Capture settings

- **Screenshot scale** — 1× is the mirrored size, 2× is right for slides, 3× for print or heavy
  zoom-ins.
- **Frame in captures** — off exports the raw screen at native resolution with no decoration.
- **Recording format** — WebM (VP9) always works; MP4 is offered when this Chromium build can write
  it.
- **Recording bitrate** — 12 Mbps is a good default; raise it for fast-moving content.
- **Open folder / Change** — where captures land. Default is
  `Pictures\CTRLbot Mirror`.

### Stream quality

These apply the next time you start mirroring.

| Setting | Guidance |
| --- | --- |
| Resolution cap | 1600 is a good balance. 0 = native, which is heavier over Wi-Fi. |
| Bitrate | 8 Mbps default; 16+ for recording detailed UI |
| Frame rate | 60 for demos, 30 to save bandwidth |
| Video codec | H.264 unless you know the device does H.265/AV1 well |
| Keep device awake | Stops the screen sleeping mid-recording |
| Blank device screen | Mirrors normally while the phone itself looks off |
| Allow control | Off gives a look-but-do-not-touch session |

---

## Capturing

The toolbar under the stage:

- **Camera** — screenshot, saved immediately (no dialog) with a toast showing the path.
- **Circle** — start recording; it turns red with a timer. Press again to stop and save.
- **Expand** — clean mode: hides the title bar, nav rail and panel, leaving just the stage. `Esc`
  exits.

Recording captures the **composed** stage — device frame, backdrop, ripples and all — so what you
record is exactly what you saw.

### A workflow that works well

1. Set the frame and backdrop once. They persist.
2. Turn on **Blank device screen** so the phone in shot looks off.
3. Clean mode, then record your window with OBS cropped to the stage — or just use the built-in
   recorder and skip OBS entirely.
4. Fire screenshots as you go; they all land in one folder, timestamped and in order.

---

## Apps

Lists user packages (system ones behind a toggle), with launch, force-stop, clear-data and
uninstall on hover. **Install APK** accepts one file or several at once — multiple files are
installed as a split APK.

Labels are derived from the package name rather than the real app label; reading actual labels means
parsing `dumpsys package`, which is slow and format-unstable.

---

## Files

Browse the device filesystem starting at `/sdcard`. Drag files from Explorer onto the drop zone to
copy them across. Download pulls a file into your capture folder. Delete asks first.

Folders cannot be uploaded yet — drop individual files.

---

## Shell

One command at a time, with the combined output. Up and down arrows walk the history. Commands run
as the shell user, not root, and interactive programs are not supported.

---

## Logcat

Play to start streaming, pause to stop. Filter by text and by minimum priority. **Follow tail**
auto-scrolls; scrolling manually turns it off. Only the last 800 matching lines are rendered — a
chatty device produces far more than the DOM can hold.

**Clear the device's log buffer** runs `logcat -c` on the phone itself, not just here.

---

## Virtual devices

Lists Android emulator AVDs if you have Android Studio installed, and boots them. A booted emulator
shows up in Devices like any phone, and every feature above works on it unchanged.

Nothing else in the app requires the SDK — this panel just stays empty without it.

---

## Settings

- **Auto-select a single device** — skips a click when exactly one phone is plugged in.
- **Capture folder** — where screenshots and recordings go.
- **ADB** — which `adb.exe` is in use, and how to override it.
- **About** — versions of the app, the scrcpy server and adb.
- **Reset all settings** — back to defaults.
