import { BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { Event } from '@shared/ipc.js';
import { APP_NAME } from '@shared/constants.js';

const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
const indexPath = fileURLToPath(new URL('../renderer/index.html', import.meta.url));

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0f19',
    // Custom title bar: the stage should read as one continuous surface when
    // it ends up in a screen recording.
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // WebCodecs + WebGL do the decoding and compositing.
      backgroundThrottling: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  const publishState = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(Event.windowState, window.isMaximized());
    }
  };
  window.on('maximize', publishState);
  window.on('unmaximize', publishState);

  // External links open in the user's browser, never inside the app shell.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(indexPath);
  }

  return window;
}
