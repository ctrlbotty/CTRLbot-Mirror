/** Values shared by the main process, the preload bridge and the renderer. */

/**
 * Must match the version downloaded by `scripts/fetch-scrcpy-server.mjs`.
 * scrcpy's server verifies the client-supplied version string during handshake
 * and aborts on a mismatch.
 */
export const SCRCPY_SERVER_VERSION = '3.3.3';

/** Where the server jar is pushed on the device. Matches scrcpy's own default. */
export const SCRCPY_DEVICE_PATH = '/data/local/tmp/scrcpy-server.jar';

/** Default local ADB server endpoint (`adb start-server` listens here). */
export const ADB_SERVER_HOST = '127.0.0.1';
export const ADB_SERVER_PORT = 5037;

/** Google's official platform-tools bundle. Downloaded on first run. */
export const PLATFORM_TOOLS_URL =
  'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';

export const APP_NAME = 'CTRLbot Mirror';
