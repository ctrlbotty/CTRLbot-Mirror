# CTRLbot Mirror

CTRLbot Mirror is a Windows desktop app for showing an Android phone on your PC, controlling it
with your mouse and keyboard, and capturing polished screenshots or recordings.

It is useful for product demos, training videos, app walkthroughs, support sessions, and everyday
device setup. It works with a physical Android device over USB or Wi-Fi and with Android Studio
virtual devices.

## Quick start

With [Node.js 22.12 or newer](https://nodejs.org/) installed, open a terminal in this folder and run:

```powershell
npm run setup:windows
```

That one command installs the app's dependencies, builds the Windows app, and creates a
**CTRLbot Mirror** shortcut on your desktop. Double-click the shortcut whenever you want to open the
app.

To open the source version immediately without creating a packaged app, run this single line from
Command Prompt or PowerShell:

```powershell
cmd /c "npm install && npm run dev"
```

Once built, the app itself does not require Node.js to be running.

## Connect your first device

1. Open CTRLbot Mirror. If Android platform-tools are missing, open **Setup** and select
   **Install now**.
2. On the phone, open **Settings → About phone** and tap **Build number** seven times.
3. Open **Developer options** and turn on **USB debugging**.
4. Connect the phone with a data-capable USB cable.
5. Unlock the phone and accept **Allow USB debugging?** Select **Always allow from this computer**
   if this is your PC.
6. In CTRLbot Mirror, open **Devices**, select the phone, and choose **Start mirroring**.

If the phone does not appear, try another cable first; many USB cables provide power but do not
carry data. See [Troubleshooting](docs/TROUBLESHOOTING.md) for connection and driver help.

## What you can do

- Mirror a phone or tablet at up to its native resolution and 60 fps.
- Tap, swipe, scroll, type, paste, and use Android navigation from your PC.
- Add a clean phone or tablet frame, backdrop, padding, shadow, and visible touch ripples.
- Save instant screenshots at 1×, 2×, or 3× scale.
- Record the composed stage—including its frame, backdrop, and your PC microphone—to WebM or MP4.
- Hide the app chrome with Clean mode for distraction-free capture.
- Switch a connected phone from USB to wireless ADB.
- Install and manage apps, browse files, run shell commands, and view logcat.
- Start Android Studio virtual devices and use the same mirror and capture tools with them.

Screenshots and recordings go to **Pictures\CTRLbot Mirror** by default. Change or open that folder
from **Studio → Capture**.

## Controls

| Input                              | Action                                      |
| ---------------------------------- | ------------------------------------------- |
| Left click or drag                 | Tap or swipe                                |
| Right click                        | Back                                        |
| Middle click                       | Home                                        |
| Scroll wheel                       | Scroll                                      |
| Keyboard typing                    | Type on the Android device                  |
| Arrows, Enter, Backspace, Esc, Tab | Send the matching Android key               |
| `Ctrl` + `V`                       | Paste the Windows clipboard into the device |
| `Esc` in Clean mode                | Show the app controls again                 |

The toolbar below the mirrored screen also provides Back, Home, Recents, notifications, rotation,
volume, power, screenshot, record, Clean mode, and stop controls.

The first time you record, Windows may ask for microphone access. Recording uses your current
default PC microphone for narration; audio from the Android device is never captured.

## Open it from a desktop shortcut

`npm run setup:windows` creates the shortcut as part of the initial setup. To recreate it later, run
`npm run shortcut`.

The Windows installer will also create desktop and Start Menu shortcuts when packaged releases are
published. For a standalone portable `.exe`, first keep it in a permanent folder, then either:

- Right-click the `.exe`, select **Show more options → Send to → Desktop (create shortcut)**, or
- From this repository, run `npm run shortcut` after building the portable app.

The shortcut command looks for an installed copy first, then the newest unpacked or portable build
under `release`. You can also choose an exact executable:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-shortcut.ps1 -TargetPath "C:\Apps\CTRLbot Mirror.exe"
```

## Wireless devices

For a phone already connected over USB, select **Go wireless** on its device card. Once CTRLbot
Mirror confirms the Wi-Fi address, you can unplug the cable.

On Android 11 or newer, you can also open **Developer options → Wireless debugging → Pair device
with pairing code** and enter the displayed address and code in the **Devices** panel. The PC and
phone must be on the same local network.

## Virtual devices

If Android Studio's emulator is installed, the **Virtual devices** panel lists your Android Virtual
Devices (AVDs). Start one there, wait for it to finish booting, and then select it in **Devices**.
CTRLbot Mirror does not require Android Studio when you use a physical device.

## Privacy and downloads

CTRLbot Mirror has no account requirement and sends no telemetry. Device traffic stays on USB or
your local network. Microphone audio is written only into the recording you save on your PC.

If `adb.exe` is not already available, the app downloads Google's Android platform-tools from
`dl.google.com` only after you select **Install now**. A source install also downloads the small
scrcpy server component used on the Android device.

## Help and reference

- [User guide](docs/USER_GUIDE.md) — detailed instructions for every feature
- [Troubleshooting](docs/TROUBLESHOOTING.md) — device, driver, ADB, and capture problems
- [Roadmap](docs/ROADMAP.md) — planned improvements

For development setup and project internals, see [Contributing](CONTRIBUTING.md) and
[Architecture](docs/ARCHITECTURE.md).

CTRLbot Mirror is licensed under the [Apache License 2.0](LICENSE). Third-party notices are in
[NOTICE](NOTICE).
