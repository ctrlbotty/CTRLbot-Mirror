import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SCRCPY_SERVER_VERSION } from '@shared/constants.js';
import type { ScrcpyServerStatus } from '@shared/types.js';

/**
 * Finds the scrcpy server jar we ship alongside the app.
 *
 * In development it lives in `resources/` at the repo root; once packaged,
 * electron-builder copies it next to the app under `process.resourcesPath`.
 * The jar is never executed on Windows — it is pushed to the device and run
 * there by `app_process`.
 */
export function scrcpyServerPath(): string | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'scrcpy-server.jar')]
    : [
        join(app.getAppPath(), 'resources', 'scrcpy-server.jar'),
        join(process.cwd(), 'resources', 'scrcpy-server.jar'),
      ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function locateScrcpyServer(): ScrcpyServerStatus {
  const path = scrcpyServerPath();
  return { available: Boolean(path), path, version: SCRCPY_SERVER_VERSION };
}
