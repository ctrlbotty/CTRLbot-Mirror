# Sprint: virtual devices without Android Studio

**Goal.** Create, boot, reset and drive Android emulators from CTRLbot Mirror, with ready-made
devices that match the screens CTRLbot IoT ships on, so testing an app build never needs Android
Studio open or a real tablet wiped.

**Why.** The CTRLbot IoT work on 2026-11-14 ran entirely on two emulators (a phone and a 10" tablet)
driven over `adb`. It worked well, but it took Android Studio to make them and hand-written scripts
to drive them. Mirror already owns ADB, device tracking, APK install and capture, so it is the
natural home.

## What already exists (v0.1)

- **Virtual devices panel** (`src/main/services/avd.ts`, `VirtualPanel.tsx`): lists AVDs with
  `emulator -list-avds` and boots one detached. A booted emulator then works like any phone:
  mirror, control, capture, apps, files, shell, logcat.
- **APK install** (`apps:install`).
- **Runtime download of `adb.exe`** from `dl.google.com`, never redistributed. The same rule
  applies to everything below.

## Gaps found while reading the code

1. **Stop does not stop.** `avd:stop` calls `deviceManager.disconnectWireless(serial)`, which
   disconnects a Wi-Fi device. An emulator stays running. It should send `adb -s emulator-N emu kill`.
2. **Running state is a guess.** `listAvds` marks an AVD running only when exactly one AVD exists.
   `adb -s emulator-N emu avd name` returns the AVD name for each running emulator, so the panel
   and the Devices list can show which is which.
3. **Creating an AVD needs Android Studio.** There is no create, no system image install and no
   emulator install.

## Tasks

| # | Task | Notes |
| --- | --- | --- |
| V1 | Make Stop kill the emulator, and map each `emulator-N` serial to its AVD name for running state and the Devices label | fixes gaps 1 and 2; small |
| V2 | Boot options per AVD: normal, cold boot (`-no-snapshot-load`), wipe data (`-wipe-data`), and no window (`-no-window`) for background test runs | wipe data is the clean-first-run test |
| V3 | Download Android command-line tools from `dl.google.com` at runtime, the same way `adb.exe` is fetched, then install the emulator package through `sdkmanager` | the user reads and accepts Google's SDK license in the app; never accept it on their behalf |
| V4 | Check the PC can run emulators: Windows Hypervisor Platform on, enough disk (a system image is about 1.5 GB), and say plainly how to fix each | before anything downloads |
| V5 | New virtual device from a preset: pick a preset and an Android version, install that system image, create the AVD with `avdmanager` | presets below |
| V6 | Delete a virtual device and, separately, a system image nobody uses, to get disk back | asks first; deletes are permanent |
| V7 | Install and open an APK on a chosen virtual device in one step, with a note that a debug build can wipe the app's saved data | drag and drop an APK onto the device |

### Presets

Matched to the device classes in CTRLbot IoT's `CLAUDE.md` (Device Resource Buckets):

| Preset | Screen | Density | Matches |
| --- | --- | --- | --- |
| Phone | 1080 x 2400 | 420 | portrait phones, `layout-port/` |
| 7" panel | 601 x 1007 dp, so landscape reports `sw601dp-h529dp` like the real panel | pick pixels and density together on first run | SM-T227U, `values-sw600dp-land` |
| 10" tablet | 1920 x 1200 | 240 | SM-X210, `values-sw720dp-land` |

Each preset uses the Google Play system image for the chosen API level, the same images used on
2026-11-14 (`android-36.1`, `google_apis_playstore`, x86_64).

## Later, not in this sprint

- **An automation API** so a script or Claude can tap by text or view id, type, press keys and take
  screenshots through Mirror instead of raw `adb` (what the throwaway `ui.py` scripts did). Needs a
  decision on how it is exposed (a local CLI or a localhost port) and how it is kept to this PC.
- **Two devices side by side**, phone and tablet at once. Blocked on the one-session limit in
  `scrcpy-session.ts` (see ROADMAP Known limitations).
- **Snapshots**: save and restore a named emulator state, for example "app set up with demo
  devices", so a video can start from the same place every time.

## Decisions for Nathan

- How the SDK license is shown and accepted (V3). Recommended: show Google's text in a dialog with
  Accept and Cancel, and remember the acceptance per license version.
- Where SDK files go when no SDK exists. Recommended: the standard
  `%LOCALAPPDATA%\Android\Sdk`, so Android Studio finds them later.

## Done when

On a PC with no Android Studio, Mirror installs what it needs after the user accepts the license,
creates the Phone and 10" tablet presets, boots both (one at a time), installs a CTRLbot IoT debug
APK, and stops them, and Stop leaves no emulator process running.
