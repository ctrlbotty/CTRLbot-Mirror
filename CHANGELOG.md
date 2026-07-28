# Changelog

All notable changes are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-07-28

First working build.

### Added

**Mirroring**

- Live mirror of a physical or virtual Android device over ADB, using the official scrcpy 3.3.3
  server and a TypeScript client
- Hardware-accelerated H.264 / H.265 / AV1 decode via WebCodecs, rendered to a WebGL canvas
- Full control: tap, drag, multi-touch, scroll, text injection, Android key events, clipboard paste
- Device buttons in the toolbar: back, home, recents, rotate, volume, power, notification shade
- Dedicated `MessagePort` for video so the stream never queues behind UI requests

**Studio**

- Drawn device frames — none, flat, rounded, Pixel, Galaxy — with punch-hole and side-button detail
- Backdrops: gradient, dark, light, transparent (exports real alpha) or a custom colour
- Padding and drop-shadow controls
- Touch ripple overlay
- Screenshots at 1× / 2× / 3×, with or without the frame, saved without a dialog
- Screen recording of the composed stage to WebM or MP4 via `MediaRecorder`
- Clean mode — hides all app chrome, `Esc` to leave
- Stream quality controls: resolution cap, bitrate, frame rate, codec, stay-awake, blank-screen,
  view-only

**Setup and devices**

- Guided setup checklist that detects what is missing and fixes what it can
- Automatic platform-tools download from Google when the machine has no adb
- Live device tracking with authorised / unauthorised / offline states
- Wireless ADB: switch a USB device over with one click, or pair with an Android 11+ pairing code
- Device details: model, Android version, screen, battery, build, IP

**Toolbox**

- App manager — list, launch, force-stop, clear data, uninstall, install APKs (including splits)
- File browser — navigate, drag-and-drop upload, download, delete, mkdir
- Shell with command history
- Logcat with priority and text filters, follow-tail, and device-side buffer clear
- Virtual device launcher for Android Studio AVDs

### Notes

- The scrcpy server is pinned to 3.3.3, the newest version `@yume-chan/adb-scrcpy` implements
  options for. See [`docs/RESEARCH.md`](docs/RESEARCH.md).
- Audio is streamed by the server and drained, but not yet played or recorded.

[Unreleased]: https://github.com/ctrlbotty/CTRLbot-Mirror/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ctrlbotty/CTRLbot-Mirror/releases/tag/v0.1.0
