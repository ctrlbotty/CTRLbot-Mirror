import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { Channel, Event, type CtrlbotApi, type Notification } from '@shared/ipc.js';
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
  RemoteFile,
  SaveResult,
  TransferResult,
  VideoChannelMessage,
} from '@shared/types.js';

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

/** Subscribes to a push channel and returns an unsubscribe function. */
function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

/* ------------------------------------------------------------ video channel */

/**
 * The preload script owns the MessageChannel.
 *
 * `contextBridge` refuses to marshal a live `MessagePort` into the renderer
 * world, so the port lives here and packets are republished to renderer-world
 * callbacks. Keeping video off `ipcRenderer` matters: a 60 fps stream would
 * otherwise share a queue with every UI request.
 */
const videoHandlers = new Set<(message: VideoChannelMessage) => void>();
let videoPort: MessagePort | null = null;

function attachVideoPort(): void {
  videoPort?.close();

  const channel = new MessageChannel();
  videoPort = channel.port1;
  videoPort.onmessage = (event: MessageEvent<VideoChannelMessage>) => {
    for (const handler of videoHandlers) handler(event.data);
  };
  videoPort.start();

  ipcRenderer.postMessage(Channel.mirrorAttachVideoPort, null, [channel.port2]);
}

const api: CtrlbotApi = {
  env: {
    status: () => invoke<EnvironmentStatus>(Channel.envStatus),
    ensureAdb: () => invoke<EnvironmentStatus>(Channel.envEnsureAdb),
    restartServer: () => invoke<EnvironmentStatus>(Channel.envRestartServer),
    killServer: () => invoke<void>(Channel.envKillServer),
    openLogFolder: () => invoke<void>(Channel.envOpenLogFolder),
    locateAdb: () => invoke<EnvironmentStatus>(Channel.envLocateAdb),
  },
  devices: {
    list: () => invoke<DeviceSummary[]>(Channel.devicesList),
    details: (serial) => invoke<DeviceDetails | null>(Channel.devicesDetails, serial),
    connect: (address) => invoke<CommandResult>(Channel.devicesConnect, address),
    disconnect: (address) => invoke<CommandResult>(Channel.devicesDisconnect, address),
    pair: (request: PairingRequest) => invoke<CommandResult>(Channel.devicesPair, request),
    enableTcpip: (serial, port) => invoke<CommandResult>(Channel.devicesEnableTcpip, serial, port),
    reconnect: (serial) => invoke<CommandResult>(Channel.devicesReconnect, serial),
  },
  mirror: {
    start: (serial, options: MirrorOptions) =>
      invoke<MirrorSessionInfo>(Channel.mirrorStart, serial, options),
    stop: () => invoke<void>(Channel.mirrorStop),
    control: (command: ControlCommand) => invoke<void>(Channel.mirrorControl, command),
    listDisplays: (serial) => invoke<number[]>(Channel.mirrorListDisplays, serial),
    listEncoders: (serial) => invoke<string[]>(Channel.mirrorListEncoders, serial),
    attachVideoPort,
  },
  apps: {
    list: (serial, includeSystem) => invoke<AppEntry[]>(Channel.appsList, serial, includeSystem),
    launch: (serial, pkg) => invoke<CommandResult>(Channel.appsLaunch, serial, pkg),
    uninstall: (serial, pkg) => invoke<CommandResult>(Channel.appsUninstall, serial, pkg),
    clearData: (serial, pkg) => invoke<CommandResult>(Channel.appsClearData, serial, pkg),
    forceStop: (serial, pkg) => invoke<CommandResult>(Channel.appsForceStop, serial, pkg),
    install: (serial, apkPaths) => invoke<CommandResult>(Channel.appsInstall, serial, apkPaths),
  },
  files: {
    list: (serial, path) => invoke<RemoteFile[]>(Channel.filesList, serial, path),
    push: (serial, localPaths, remoteDir) =>
      invoke<TransferResult[]>(Channel.filesPush, serial, localPaths, remoteDir),
    pull: (serial, remotePath) => invoke<TransferResult>(Channel.filesPull, serial, remotePath),
    remove: (serial, remotePath) => invoke<CommandResult>(Channel.filesDelete, serial, remotePath),
    mkdir: (serial, remotePath) => invoke<CommandResult>(Channel.filesMkdir, serial, remotePath),
    pathFor: (file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    },
  },
  shell: {
    run: (serial, command) => invoke<CommandResult>(Channel.shellRun, serial, command),
  },
  logcat: {
    start: (serial) => invoke<CommandResult>(Channel.logcatStart, serial),
    stop: () => invoke<void>(Channel.logcatStop),
    clear: (serial) => invoke<CommandResult>(Channel.logcatClear, serial),
  },
  avd: {
    list: () => invoke<AvdEntry[]>(Channel.avdList),
    start: (name) => invoke<CommandResult>(Channel.avdStart, name),
    stop: (serial) => invoke<CommandResult>(Channel.avdStop, serial),
  },
  capture: {
    saveImage: (data, name) => invoke<SaveResult>(Channel.captureSaveImage, data, name),
    saveVideo: (data, name, container) =>
      invoke<SaveResult>(Channel.captureSaveVideo, data, name, container),
    screenshotViaAdb: (serial) => invoke<SaveResult>(Channel.captureScreenshotViaAdb, serial),
    revealFolder: () => invoke<void>(Channel.captureRevealFolder),
    chooseFolder: () => invoke<string | null>(Channel.captureChooseFolder),
  },
  settings: {
    get: () => invoke<AppSettings>(Channel.settingsGet),
    set: (patch) => invoke<AppSettings>(Channel.settingsSet, patch),
    reset: () => invoke<AppSettings>(Channel.settingsReset),
  },
  window: {
    minimize: () => ipcRenderer.send(Channel.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(Channel.windowMaximize),
    close: () => ipcRenderer.send(Channel.windowClose),
    isMaximized: () => invoke<boolean>(Channel.windowIsMaximized),
  },
  app: {
    version: () => invoke<string>(Channel.appVersion),
    openExternal: (url) => invoke<void>(Channel.appOpenExternal, url),
  },
  on: {
    devicesChanged: (handler) => subscribe<DeviceSummary[]>(Event.devicesChanged, handler),
    envChanged: (handler) => subscribe<EnvironmentStatus>(Event.envChanged, handler),
    downloadProgress: (handler) => subscribe<DownloadProgress>(Event.downloadProgress, handler),
    mirrorEnded: (handler) => subscribe<string>(Event.mirrorEnded, handler),
    mirrorLog: (handler) => subscribe<string>(Event.mirrorLog, handler),
    logcatLines: (handler) => subscribe<LogLine[]>(Event.logcatLines, handler),
    windowState: (handler) => subscribe<boolean>(Event.windowState, handler),
    notify: (handler) => subscribe<Notification>(Event.notify, handler),
    video: (handler) => {
      videoHandlers.add(handler);
      return () => videoHandlers.delete(handler);
    },
  },
};

contextBridge.exposeInMainWorld('ctrlbot', api);
