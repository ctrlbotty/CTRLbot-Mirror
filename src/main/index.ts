import { app, BrowserWindow } from 'electron';
import { APP_NAME } from '@shared/constants.js';
import { bootstrapEnvironment, disposeServices, registerIpc, setMainWindow } from './ipc/index.js';
import { describeError, logger } from './services/logger.js';
import { createMainWindow } from './window.js';

// One window, one ADB session. A second instance would fight the first over the
// scrcpy server socket, so hand focus back instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

async function main(): Promise<void> {
  app.setName(APP_NAME);
  app.setAppUserModelId('com.ctrlbot.mirror');

  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  await app.whenReady();

  registerIpc();

  const window = createMainWindow();
  setMainWindow(window);
  window.on('closed', () => setMainWindow(null));

  // Look for an existing adb without downloading anything — the Setup screen
  // drives the download once the user asks for it.
  window.webContents.once('did-finish-load', () => {
    void bootstrapEnvironment(false);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const next = createMainWindow();
      setMainWindow(next);
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', async (event) => {
    if (shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();

    // Logged so a clean exit is distinguishable from a crash — without this the
    // log just stops, and there is no way to tell the two apart afterwards.
    logger.info('shutting down');
    try {
      await disposeServices();
    } catch (error) {
      logger.warn('shutdown cleanup failed —', describeError(error));
    }
    logger.info('shutdown complete');
    app.exit(0);
  });

  logger.info(`${APP_NAME} ${app.getVersion()} started`);
}

let shuttingDown = false;

process.on('uncaughtException', (error) => {
  logger.error('uncaught exception —', describeError(error));
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection —', describeError(reason));
});
