# Roadmap

## v0.1 — shipped

Mirroring, control, the Studio capture set, guided setup, wireless pairing, apps/files/shell/logcat,
AVD launcher.

## Next

**Audio.** The scrcpy server already streams Opus and the session drains it; it is thrown away. It
needs an `AudioDecoder` + `AudioContext` in the renderer, and mixing into the `MediaRecorder` stream
so recordings have sound. This is the biggest gap for training videos.

**Keystroke overlay.** `StudioSettings.showKeystrokes` exists and is wired to a toggle, but nothing
draws it yet. Should render the last few keys pressed as chips over the stage.

**Multi-display.** `mirror.listDisplays()` works and `displayId` is plumbed through, but there is no
picker. Foldables and desktop-mode devices need it.

**Camera as a source.** scrcpy 2.2+ can stream the device camera instead of the screen. Useful for
demos that need to show the physical device and its screen at once.

## Later

- **Light theme.** The stage stays dark; the chrome could follow the system.
- **Folder upload** in the file browser, and a progress bar for large pushes.
- **Real app labels**, if a fast enough path exists (`--list-apps` on the scrcpy server is one).
- **Session presets** — named bundles of Studio + stream settings for different video series.
- **Annotation tools** — arrows and callouts drawn over the stage, exported with the capture.
- **Auto-update** via `electron-updater` (the dependency is already there; releases are not wired).
- **Screen-off recording with device audio** for hands-free capture.

## Known limitations

- **One session at a time.** A second scrcpy session fights the first over the device socket. Two
  devices side by side would need per-session state throughout `scrcpy-session.ts`.
- **`FLAG_SECURE` surfaces are black.** Netflix, banking apps and password managers blank the
  capture by design. Not something to work around.
- **The scrcpy version is pinned to 3.3.3** — the newest that `@yume-chan/adb-scrcpy` implements.
  See [`RESEARCH.md` §3](RESEARCH.md).
- **Windows only.** Nothing here is deeply Windows-specific except `adb.exe` discovery and the
  platform-tools download URL, but it is neither built nor tested elsewhere.
