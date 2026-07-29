import { app, dialog, ipcMain, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { Channel, Event, type Notification } from '@shared/ipc.js';
import type {
  AppSettings,
  ControlCommand,
  DownloadProgress,
  LogLine,
  MirrorOptions,
  PairingRequest,
  RecordingContainer,
} from '@shared/types.js';
import { adbServer } from '../services/adb-server.js';
import {
  clearAppData,
  forceStopApp,
  installApks,
  launchApp,
  listApps,
  uninstallApp,
} from '../services/apps.js';
import { listAvds, startAvd } from '../services/avd.js';
import {
  chooseCaptureFolder,
  revealCaptureFolder,
  saveImage,
  saveVideo,
  screenshotViaAdb,
} from '../services/capture.js';
import { deviceManager } from '../services/device-manager.js';
import { listFiles, makeRemoteDir, pullFile, pushFiles, removeRemote } from '../services/files.js';
import { logcat } from '../services/logcat.js';
import { describeError, logFilePath, logger } from '../services/logger.js';
import { runShell } from '../services/shell.js';
import { scrcpySession } from '../services/scrcpy-session.js';
import { settings } from '../services/settings.js';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

function send(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

export function notify(notification: Notification): void {
  send(Event.notify, notification);
}

function onProgress(progress: DownloadProgress): void {
  send(Event.downloadProgress, progress);
}

/** Boots ADB and starts the device tracker. Safe to call more than once. */
export async function bootstrapEnvironment(download: boolean): Promise<void> {
  try {
    const status = download
      ? await adbServer.initialise(onProgress)
      : await adbServer.initialiseInstalled();

    if (status.adb.serverRunning) {
      await deviceManager.startTracking();
    }
    send(Event.envChanged, status);
  } catch (error) {
    const message = describeError(error);
    logger.error('environment bootstrap failed —', message);
    notify({ level: 'error', title: 'ADB could not start', detail: message });
    send(Event.envChanged, await adbServer.status());
  }
}

/** Wraps a handler so a thrown error reaches the renderer as a rejected promise
 * with a readable message rather than an Electron stack trace. */
function handle<A extends unknown[], R>(
  channel: string,
  handler: (...args: A) => Promise<R> | R,
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...(args as A));
    } catch (error) {
      const message = describeError(error);
      logger.error(`${channel} failed —`, message);
      throw new Error(message, { cause: error });
    }
  });
}

export function registerIpc(): void {
  deviceManager.onChange((devices) => send(Event.devicesChanged, devices));

  /* ------------------------------------------------------------ environment */

  handle(Channel.envStatus, () => adbServer.status());

  handle(Channel.envEnsureAdb, async () => {
    const status = await adbServer.initialise(onProgress);
    if (status.adb.serverRunning) await deviceManager.startTracking();
    send(Event.envChanged, status);
    return status;
  });

  handle(Channel.envRestartServer, async () => {
    await deviceManager.stopTracking();
    const status = await adbServer.restartServer();
    if (status.adb.serverRunning) await deviceManager.startTracking();
    send(Event.envChanged, status);
    return status;
  });

  handle(Channel.envKillServer, async () => {
    await scrcpySession.stop();
    await deviceManager.dispose();
    await adbServer.killServer();
    send(Event.envChanged, await adbServer.status());
  });

  handle(Channel.envOpenLogFolder, async () => {
    shell.showItemInFolder(logFilePath());
  });

  handle(Channel.envLocateAdb, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Locate adb.exe',
      properties: ['openFile'],
      filters: [{ name: 'adb', extensions: ['exe'] }],
    });

    if (!result.canceled && result.filePaths[0]) {
      settings.set({ adbPathOverride: result.filePaths[0] });
    }

    const status = await adbServer.initialiseInstalled();
    if (status.adb.serverRunning) await deviceManager.startTracking();
    send(Event.envChanged, status);
    return status;
  });

  /* ---------------------------------------------------------------- devices */

  handle(Channel.devicesList, () => deviceManager.list());
  handle(Channel.devicesDetails, (serial: string) => deviceManager.details(serial));
  handle(Channel.devicesConnect, (address: string) => deviceManager.connectWireless(address));
  handle(Channel.devicesDisconnect, (address: string) => deviceManager.disconnectWireless(address));
  handle(Channel.devicesPair, (request: PairingRequest) => deviceManager.pair(request));
  handle(Channel.devicesEnableTcpip, (serial: string, port?: number) =>
    deviceManager.enableTcpip(serial, port),
  );
  handle(Channel.devicesReconnect, (serial: string) => deviceManager.reconnect(serial));

  /* ----------------------------------------------------------------- mirror */

  // The renderer transfers one half of a MessageChannel; video packets travel
  // over it instead of the main IPC bus.
  ipcMain.on(Channel.mirrorAttachVideoPort, (event) => {
    const port = event.ports[0];
    if (port) scrcpySession.attachPort(port);
  });

  handle(Channel.mirrorStart, (serial: string, options: MirrorOptions) =>
    scrcpySession.start(serial, options, {
      onServerLog: (line) => send(Event.mirrorLog, line),
      onEnded: (reason) => send(Event.mirrorEnded, reason),
    }),
  );
  handle(Channel.mirrorStop, () => scrcpySession.stop());
  handle(Channel.mirrorControl, (command: ControlCommand) => scrcpySession.control(command));
  handle(Channel.mirrorListDisplays, (serial: string) => scrcpySession.listDisplays(serial));
  handle(Channel.mirrorListEncoders, (serial: string) => scrcpySession.listEncoders(serial));

  /* ------------------------------------------------------------------- apps */

  handle(Channel.appsList, (serial: string, includeSystem: boolean) =>
    listApps(serial, includeSystem),
  );
  handle(Channel.appsLaunch, (serial: string, pkg: string) => launchApp(serial, pkg));
  handle(Channel.appsUninstall, (serial: string, pkg: string) => uninstallApp(serial, pkg));
  handle(Channel.appsClearData, (serial: string, pkg: string) => clearAppData(serial, pkg));
  handle(Channel.appsForceStop, (serial: string, pkg: string) => forceStopApp(serial, pkg));
  handle(Channel.appsInstall, async (serial: string, apkPaths: string[]) => {
    let paths = apkPaths;
    if (paths.length === 0) {
      const result = await dialog.showOpenDialog({
        title: 'Select APK files',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Android packages', extensions: ['apk', 'apks', 'apkm'] }],
      });
      if (result.canceled) return { ok: false, output: '', error: 'Cancelled.' };
      paths = result.filePaths;
    }
    return installApks(serial, paths);
  });

  /* ------------------------------------------------------------------ files */

  handle(Channel.filesList, (serial: string, path: string) => listFiles(serial, path));
  handle(Channel.filesPush, (serial: string, localPaths: string[], remoteDir: string) =>
    pushFiles(serial, localPaths, remoteDir),
  );
  handle(Channel.filesPull, (serial: string, remotePath: string) =>
    pullFile(serial, remotePath, settings.captureDirectory()),
  );
  handle(Channel.filesDelete, (serial: string, remotePath: string) =>
    removeRemote(serial, remotePath),
  );
  handle(Channel.filesMkdir, (serial: string, remotePath: string) =>
    makeRemoteDir(serial, remotePath),
  );

  /* ------------------------------------------------------------------ shell */

  handle(Channel.shellRun, (serial: string, command: string) => runShell(serial, command));

  /* ----------------------------------------------------------------- logcat */

  handle(Channel.logcatStart, (serial: string) =>
    logcat.start(serial, (lines: LogLine[]) => send(Event.logcatLines, lines)),
  );
  handle(Channel.logcatStop, () => logcat.stop());
  handle(Channel.logcatClear, (serial: string) => logcat.clear(serial));

  /* -------------------------------------------------------------------- avd */

  handle(Channel.avdList, () => listAvds(deviceManager.current.map((device) => device.serial)));
  handle(Channel.avdStart, (name: string) => startAvd(name));
  handle(Channel.avdStop, (serial: string) => deviceManager.disconnectWireless(serial));

  /* ---------------------------------------------------------------- capture */

  handle(Channel.captureSaveImage, (data: Uint8Array, name: string) => saveImage(data, name));
  handle(
    Channel.captureSaveVideo,
    (data: Uint8Array, name: string, container: RecordingContainer) =>
      saveVideo(data, name, container),
  );
  handle(Channel.captureScreenshotViaAdb, (serial: string) => screenshotViaAdb(serial));
  handle(Channel.captureRevealFolder, () => revealCaptureFolder());
  handle(Channel.captureChooseFolder, () => chooseCaptureFolder());

  /* --------------------------------------------------------------- settings */

  handle(Channel.settingsGet, () => settings.get());
  handle(Channel.settingsSet, (patch: Partial<AppSettings>) => settings.set(patch));
  handle(Channel.settingsReset, () => settings.reset());

  /* ----------------------------------------------------------------- window */

  ipcMain.on(Channel.windowMinimize, () => mainWindow?.minimize());
  ipcMain.on(Channel.windowMaximize, () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on(Channel.windowClose, () => mainWindow?.close());
  handle(Channel.windowIsMaximized, () => mainWindow?.isMaximized() ?? false);

  /* -------------------------------------------------------------------- app */

  handle(Channel.appVersion, () => app.getVersion());
  handle(Channel.appOpenExternal, async (url: string) => {
    // Only ever hand the OS an http(s) URL — never a file or custom scheme.
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`Refusing to open ${parsed.protocol} links.`);
    }
    await shell.openExternal(parsed.toString());
  });
}

export async function disposeServices(): Promise<void> {
  await logcat.stop();
  await scrcpySession.dispose();
  await deviceManager.dispose();
}
