import type {
  AppEntry,
  AppSettings,
  AvdEntry,
  CommandResult,
  ControlCommand,
  DeviceDetails,
  DeviceSummary,
  DownloadProgress,
  EnvironmentStatus,
  LogLine,
  MirrorOptions,
  MirrorSessionInfo,
  PairingRequest,
  RecordingContainer,
  RemoteFile,
  SaveResult,
  TransferResult,
  VideoChannelMessage,
} from './types.js';

/** Request/response channels. Grouped by domain, `domain:verb`. */
export const Channel = {
  envStatus: 'env:status',
  envEnsureAdb: 'env:ensure-adb',
  envRestartServer: 'env:restart-server',
  envKillServer: 'env:kill-server',
  envOpenLogFolder: 'env:open-log-folder',
  envLocateAdb: 'env:locate-adb',

  devicesList: 'devices:list',
  devicesDetails: 'devices:details',
  devicesConnect: 'devices:connect',
  devicesDisconnect: 'devices:disconnect',
  devicesPair: 'devices:pair',
  devicesEnableTcpip: 'devices:enable-tcpip',
  devicesReconnect: 'devices:reconnect',

  mirrorStart: 'mirror:start',
  mirrorStop: 'mirror:stop',
  mirrorControl: 'mirror:control',
  mirrorListDisplays: 'mirror:list-displays',
  mirrorListEncoders: 'mirror:list-encoders',
  mirrorAttachVideoPort: 'mirror:attach-video-port',

  appsList: 'apps:list',
  appsLaunch: 'apps:launch',
  appsUninstall: 'apps:uninstall',
  appsClearData: 'apps:clear-data',
  appsForceStop: 'apps:force-stop',
  appsInstall: 'apps:install',

  filesList: 'files:list',
  filesPush: 'files:push',
  filesPull: 'files:pull',
  filesDelete: 'files:delete',
  filesMkdir: 'files:mkdir',

  shellRun: 'shell:run',

  logcatStart: 'logcat:start',
  logcatStop: 'logcat:stop',
  logcatClear: 'logcat:clear',

  avdList: 'avd:list',
  avdStart: 'avd:start',
  avdStop: 'avd:stop',

  captureSaveImage: 'capture:save-image',
  captureSaveVideo: 'capture:save-video',
  captureScreenshotViaAdb: 'capture:screenshot-adb',
  captureRevealFolder: 'capture:reveal-folder',
  captureChooseFolder: 'capture:choose-folder',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsReset: 'settings:reset',

  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',

  appVersion: 'app:version',
  appOpenExternal: 'app:open-external',
} as const;

/** Push channels (main → renderer). */
export const Event = {
  devicesChanged: 'evt:devices-changed',
  envChanged: 'evt:env-changed',
  downloadProgress: 'evt:download-progress',
  mirrorEnded: 'evt:mirror-ended',
  mirrorLog: 'evt:mirror-log',
  logcatLines: 'evt:logcat-lines',
  windowState: 'evt:window-state',
  notify: 'evt:notify',
} as const;

export interface Notification {
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

/** The surface exposed on `window.ctrlbot` by the preload bridge. */
export interface CtrlbotApi {
  env: {
    status(): Promise<EnvironmentStatus>;
    ensureAdb(): Promise<EnvironmentStatus>;
    restartServer(): Promise<EnvironmentStatus>;
    killServer(): Promise<void>;
    openLogFolder(): Promise<void>;
    locateAdb(): Promise<EnvironmentStatus>;
  };
  devices: {
    list(): Promise<DeviceSummary[]>;
    details(serial: string): Promise<DeviceDetails | null>;
    connect(address: string): Promise<CommandResult>;
    disconnect(address: string): Promise<CommandResult>;
    pair(request: PairingRequest): Promise<CommandResult>;
    enableTcpip(serial: string, port?: number): Promise<CommandResult>;
    reconnect(serial: string): Promise<CommandResult>;
  };
  mirror: {
    start(serial: string, options: MirrorOptions): Promise<MirrorSessionInfo>;
    stop(): Promise<void>;
    control(command: ControlCommand): Promise<void>;
    listDisplays(serial: string): Promise<number[]>;
    listEncoders(serial: string): Promise<string[]>;
    /**
     * Opens the dedicated video channel. The preload script owns both ends of
     * the MessageChannel — `contextBridge` cannot hand a live `MessagePort` to
     * the renderer world — and republishes packets through `on.video`.
     */
    attachVideoPort(): void;
  };
  apps: {
    list(serial: string, includeSystem: boolean): Promise<AppEntry[]>;
    launch(serial: string, packageName: string): Promise<CommandResult>;
    uninstall(serial: string, packageName: string): Promise<CommandResult>;
    clearData(serial: string, packageName: string): Promise<CommandResult>;
    forceStop(serial: string, packageName: string): Promise<CommandResult>;
    install(serial: string, apkPaths: string[]): Promise<CommandResult>;
  };
  files: {
    list(serial: string, path: string): Promise<RemoteFile[]>;
    push(serial: string, localPaths: string[], remoteDir: string): Promise<TransferResult[]>;
    pull(serial: string, remotePath: string): Promise<TransferResult>;
    remove(serial: string, remotePath: string): Promise<CommandResult>;
    mkdir(serial: string, remotePath: string): Promise<CommandResult>;
    /**
     * Real filesystem path for a dropped `File`. Electron removed `File.path`,
     * and `webUtils.getPathForFile` only works from the preload world.
     */
    pathFor(file: File): string;
  };
  shell: {
    run(serial: string, command: string): Promise<CommandResult>;
  };
  logcat: {
    start(serial: string): Promise<CommandResult>;
    stop(): Promise<void>;
    clear(serial: string): Promise<CommandResult>;
  };
  avd: {
    list(): Promise<AvdEntry[]>;
    start(name: string): Promise<CommandResult>;
    stop(serial: string): Promise<CommandResult>;
  };
  capture: {
    saveImage(data: Uint8Array, suggestedName: string): Promise<SaveResult>;
    saveVideo(
      data: Uint8Array,
      suggestedName: string,
      container: RecordingContainer,
    ): Promise<SaveResult>;
    screenshotViaAdb(serial: string): Promise<SaveResult>;
    revealFolder(): Promise<void>;
    chooseFolder(): Promise<string | null>;
  };
  settings: {
    get(): Promise<AppSettings>;
    set(patch: Partial<AppSettings>): Promise<AppSettings>;
    reset(): Promise<AppSettings>;
  };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
  };
  app: {
    version(): Promise<string>;
    openExternal(url: string): Promise<void>;
  };
  on: {
    devicesChanged(handler: (devices: DeviceSummary[]) => void): () => void;
    envChanged(handler: (status: EnvironmentStatus) => void): () => void;
    downloadProgress(handler: (progress: DownloadProgress) => void): () => void;
    mirrorEnded(handler: (reason: string) => void): () => void;
    mirrorLog(handler: (line: string) => void): () => void;
    logcatLines(handler: (lines: LogLine[]) => void): () => void;
    windowState(handler: (maximized: boolean) => void): () => void;
    notify(handler: (notification: Notification) => void): () => void;
    video(handler: (message: VideoChannelMessage) => void): () => void;
  };
}
