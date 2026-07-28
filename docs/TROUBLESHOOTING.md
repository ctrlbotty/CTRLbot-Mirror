# Troubleshooting

Roughly in order of how often each one actually happens.

## The phone does not appear at all

**Try a different USB cable first.** Charge-only cables are the single most common cause. A cable
that charges perfectly well may have no data lines at all.

Then, in order:

1. **Is USB debugging on?** Settings → About phone → tap *Build number* ×7 → System → Developer
   options → *USB debugging*.
2. **Is the USB mode right?** Pull down the notification shade, tap the USB notification, and choose
   *File transfer (MTP)* or *PTP*. Some OEMs refuse ADB in "charging only" mode.
3. **Try a different port.** Prefer a port directly on the machine over a hub or a monitor.
4. **Setup → Restart ADB.**
5. **OEM driver.** Some manufacturers (notably older Samsung, Xiaomi, Oppo) need their own Windows
   driver. Install it, replug, restart ADB.

## It says "Not authorised"

The phone is connected but has not trusted this PC.

1. **Unlock the screen.** The dialog will not appear on a locked device.
2. Look for *Allow USB debugging?* — tick **Always allow from this computer**, tap **Allow**.
3. No dialog? Unplug and replug.
4. Still nothing? Developer options → **Revoke USB debugging authorisations**, then replug. The
   prompt comes back.

## It says "Offline"

Usually a half-open connection after a sleep or a cable wobble.

1. Press the reconnect button on the device row.
2. **Setup → Restart ADB.**
3. Replug the cable.

## "Mirroring failed" / the scrcpy server will not start

- **Check the version pin.** The app ships scrcpy server 3.3.3 and tells the server so during
  handshake. A mismatch aborts the session. If you swapped `resources/scrcpy-server.jar` by hand,
  put the pinned one back (`npm run fetch:scrcpy`).
- **Android 5.0 (API 21) is the floor.** Older devices cannot run the server.
- **Some corporate/MDM profiles block `app_process`.** There is no workaround from this side.
- Open **Setup → Open logs** and look at the tail — the scrcpy server's own stderr is logged there.

## Mirroring works but the picture is black

- Some DRM-protected surfaces (Netflix, banking apps, password managers) blank the capture by
  design. That is Android's `FLAG_SECURE`, and it is not something this app can or should bypass.
- If *everything* is black, try switching the codec to **H.264** in Studio → Stream quality. A few
  devices advertise H.265 or AV1 encoders that do not actually work.

## Choppy video, or "dropped" climbing in the toolbar

In Studio → Stream quality:

- Lower **Resolution cap** to 1280 or 1080.
- Lower **Frame rate** to 30.
- Lower **Bitrate** to 4–6 Mbps.

Wireless ADB is much more sensitive to this than USB. For recording, USB is worth the cable.

## Recording produces a huge or unplayable file

- WebM (VP9) is the safest default. MP4 is only offered when this Chromium build can write it.
- Very long recordings at 40 Mbps get large fast — the bitrate slider is in Studio → Capture.
- If a player will not open the WebM, VLC will.

## Screenshots come out blank

The GPU path needs a readable drawing buffer. If it fails:

- Turn **Frame in captures** off in Studio — that path uses the decoder's own snapshot and does not
  depend on the canvas being readable.
- Or use the device-side screenshot, which is always native resolution and never blank.

## Port 5037 is already in use

Another tool owns the ADB server — Android Studio, Unity, Flutter, an OEM suite. That is normally
*fine*: we connect to whichever server is running rather than starting our own.

It only breaks when the other tool's adb is much older than ours, in which case one kills the other
in a loop. Fix it by pointing this app at the same adb: **Settings → ADB → Choose adb.exe**, and
select the one inside that tool's SDK.

## Wireless pairing does not work

- Pairing codes need **Android 11 or newer**. On older devices use USB first, then *Go wireless*.
- The PC and phone must be on the **same network**, and that network must not have client isolation
  turned on (common on guest Wi-Fi).
- The pairing port is **not** 5555. Use the address and port shown on the phone's *Pair device with
  pairing code* screen — it changes every time.

## Antivirus quarantined adb.exe

Some AV products flag `adb.exe` because remote-access tooling abuses it. It is downloaded straight
from `dl.google.com`. Restore it from quarantine and add an exclusion for the app's user-data folder
(`%APPDATA%\ctrlbot-mirror\platform-tools`), or point the app at an adb you already trust via
**Settings → ADB → Choose adb.exe**.

## Where are the logs?

**Setup → Open logs**, or `%APPDATA%\ctrlbot-mirror\logs\main.log`. Session output from the scrcpy
server itself is written there too.
