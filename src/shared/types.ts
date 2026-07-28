/** Types crossing the main ↔ renderer boundary. Everything here must survive
 * the structured clone algorithm (no class instances, no functions). */

/* ------------------------------------------------------------------ devices */

export type DeviceState = 'device' | 'unauthorized' | 'offline';
export type DeviceTransportKind = 'usb' | 'tcp' | 'emulator';

export interface DeviceSummary {
  serial: string;
  state: DeviceState;
  transport: DeviceTransportKind;
  /** ADB transport id. Serialised as a string because it is a 64-bit value. */
  transportId: string;
  product?: string;
  model?: string;
  device?: string;
}

export interface DeviceScreen {
  width: number;
  height: number;
  density: number;
}

export interface DeviceBattery {
  level: number;
  charging: boolean;
}

export interface DeviceDetails {
  serial: string;
  model: string;
  manufacturer: string;
  brand: string;
  name: string;
  androidRelease: string;
  sdkInt: number;
  abi: string;
  buildId: string;
  screen: DeviceScreen | null;
  battery: DeviceBattery | null;
  /** WLAN address, used to offer a one-click switch to wireless mirroring. */
  ipAddress: string | null;
}

/* -------------------------------------------------------------- environment */

export type AdbSource = 'system' | 'managed';

export interface AdbStatus {
  available: boolean;
  path: string | null;
  version: string | null;
  source: AdbSource | null;
  serverRunning: boolean;
  serverVersion: number | null;
}

export interface ScrcpyServerStatus {
  available: boolean;
  path: string | null;
  version: string;
}

export interface EnvironmentStatus {
  adb: AdbStatus;
  scrcpyServer: ScrcpyServerStatus;
  androidSdkRoot: string | null;
  emulatorPath: string | null;
}

export interface DownloadProgress {
  phase: 'downloading' | 'extracting' | 'done' | 'error';
  receivedBytes: number;
  totalBytes: number;
  message: string;
}

/* ------------------------------------------------------------------- mirror */

export type VideoCodec = 'h264' | 'h265' | 'av1';
export type AudioCodec = 'opus' | 'aac' | 'flac' | 'raw';

export interface MirrorOptions {
  /** Longest edge in pixels; 0 keeps the native resolution. */
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
  videoCodec: VideoCodec;
  audio: boolean;
  audioCodec: AudioCodec;
  control: boolean;
  stayAwake: boolean;
  showTouches: boolean;
  powerOffOnClose: boolean;
  /** Blanks the physical screen while mirroring — handy when recording. */
  turnScreenOffOnStart: boolean;
  displayId: number;
}

export const DEFAULT_MIRROR_OPTIONS: MirrorOptions = {
  maxSize: 1600,
  videoBitRate: 8_000_000,
  maxFps: 60,
  videoCodec: 'h264',
  audio: false,
  audioCodec: 'opus',
  control: true,
  stayAwake: true,
  showTouches: false,
  powerOffOnClose: false,
  turnScreenOffOnStart: false,
  displayId: 0,
};

export interface VideoMetadata {
  /** scrcpy's numeric `ScrcpyVideoCodecId`; the decoder needs this exact value. */
  codecId: number;
  /** Human-readable name for the UI ("h264", "h265", "av1"). */
  codecName: string;
  width: number;
  height: number;
  deviceName: string | null;
}

export interface MirrorSessionInfo {
  serial: string;
  metadata: VideoMetadata;
  controlEnabled: boolean;
  audioEnabled: boolean;
}

/** Frames pushed down the dedicated MessagePort, not the normal IPC bus. */
export type VideoChannelMessage =
  | { kind: 'metadata'; metadata: VideoMetadata }
  | { kind: 'configuration'; data: Uint8Array }
  | { kind: 'frame'; data: Uint8Array; keyframe?: boolean; pts?: bigint }
  | { kind: 'ended'; reason: string };

/* ------------------------------------------------------------------ control */

export type TouchAction = 'down' | 'up' | 'move';
export type KeyAction = 'down' | 'up';

export type ControlCommand =
  | {
      type: 'touch';
      action: TouchAction;
      pointerId: number;
      x: number;
      y: number;
      videoWidth: number;
      videoHeight: number;
      pressure: number;
      buttons: number;
    }
  | {
      type: 'scroll';
      x: number;
      y: number;
      videoWidth: number;
      videoHeight: number;
      scrollX: number;
      scrollY: number;
      buttons: number;
    }
  | { type: 'key'; action: KeyAction; keyCode: number; repeat: number; metaState: number }
  | { type: 'text'; text: string }
  | { type: 'backOrScreenOn'; action: KeyAction }
  | { type: 'expandNotificationPanel' }
  | { type: 'expandSettingPanel' }
  | { type: 'collapseNotificationPanel' }
  | { type: 'rotateDevice' }
  | { type: 'setClipboard'; text: string; paste: boolean }
  | { type: 'screenPowerMode'; mode: 'on' | 'off' }
  | { type: 'startApp'; name: string; forceStop: boolean }
  | { type: 'resetVideo' };

/* --------------------------------------------------------------------- apps */

export interface AppEntry {
  packageName: string;
  label: string;
  system: boolean;
}

/* -------------------------------------------------------------------- files */

export interface RemoteFile {
  name: string;
  path: string;
  size: number;
  mtime: number;
  isDirectory: boolean;
}

export interface TransferResult {
  ok: boolean;
  path: string;
  bytes: number;
  message?: string;
}

/* ------------------------------------------------------------------- logcat */

export type LogPriority = 'V' | 'D' | 'I' | 'W' | 'E' | 'F';

export interface LogLine {
  id: number;
  raw: string;
  priority: LogPriority;
  tag: string;
  message: string;
  pid: string;
  timestamp: string;
}

/* --------------------------------------------------- virtual devices (AVDs) */

export interface AvdEntry {
  name: string;
  path: string | null;
  target: string | null;
  running: boolean;
}

/* ------------------------------------------------------------------- studio */

export type FrameStyle = 'none' | 'pixel' | 'galaxy' | 'flat' | 'rounded';
export type StageBackground = 'transparent' | 'dark' | 'light' | 'gradient' | 'custom';

export interface StudioSettings {
  frame: FrameStyle;
  background: StageBackground;
  customBackground: string;
  shadow: boolean;
  padding: number;
  showTouchIndicators: boolean;
  showKeystrokes: boolean;
  cleanMode: boolean;
  screenshotScale: 1 | 2 | 3;
  includeFrameInCapture: boolean;
  recordingFormat: 'webm' | 'mp4';
  recordingBitrate: number;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  frame: 'rounded',
  background: 'gradient',
  customBackground: '#0b1220',
  shadow: true,
  padding: 48,
  showTouchIndicators: true,
  showKeystrokes: false,
  cleanMode: false,
  screenshotScale: 2,
  includeFrameInCapture: true,
  recordingFormat: 'webm',
  recordingBitrate: 12_000_000,
};

/* ----------------------------------------------------------------- settings */

export interface AppSettings {
  mirror: MirrorOptions;
  studio: StudioSettings;
  captureDirectory: string | null;
  adbPathOverride: string | null;
  theme: 'dark' | 'light' | 'system';
  autoConnectLastDevice: boolean;
  hasCompletedOnboarding: boolean;
}

/* -------------------------------------------------------------------- misc */

export interface CommandResult {
  ok: boolean;
  output: string;
  error?: string;
}

export interface SaveResult {
  ok: boolean;
  path?: string;
  canceled?: boolean;
  message?: string;
}

export interface PairingRequest {
  address: string;
  code: string;
}
