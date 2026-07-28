import { dialog, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SaveResult } from '@shared/types.js';
import { deviceManager } from './device-manager.js';
import { describeError, scoped } from './logger.js';
import { settings } from './settings.js';

const log = scoped('capture');

/** `2026-07-28_14-32-07` — sorts chronologically in Explorer. */
function stamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  );
}

function safeName(name: string): string {
  // Collapse anything Explorer would object to into single hyphens.
  return (
    name
      .replace(/[^A-Za-z0-9.]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'capture'
  );
}

/**
 * Writes a capture straight into the user's capture folder.
 *
 * No save dialog by design — when you are recording a training video you want
 * to fire off a dozen screenshots without a modal in the way. The UI surfaces
 * the path and a "Show in Explorer" action instead.
 */
async function saveToCaptureFolder(
  data: Uint8Array,
  suggestedName: string,
  extension: string,
): Promise<SaveResult> {
  try {
    const dir = settings.captureDirectory();
    const filename = `${safeName(suggestedName)}_${stamp()}.${extension}`;
    const target = join(dir, filename);
    await writeFile(target, data);
    log.info('saved capture', target);
    return { ok: true, path: target };
  } catch (error) {
    const message = describeError(error);
    log.error('saving capture failed —', message);
    return { ok: false, message };
  }
}

export function saveImage(data: Uint8Array, suggestedName: string): Promise<SaveResult> {
  return saveToCaptureFolder(data, suggestedName, 'png');
}

export function saveVideo(data: Uint8Array, suggestedName: string): Promise<SaveResult> {
  const extension = settings.get().studio.recordingFormat;
  return saveToCaptureFolder(data, suggestedName, extension);
}

/**
 * Full-resolution screenshot taken by the device itself.
 *
 * The Studio canvas capture is limited to the mirrored resolution (which is
 * usually downscaled by `maxSize`); this path always gets native pixels, and it
 * works even when nothing is being mirrored.
 */
export async function screenshotViaAdb(serial: string): Promise<SaveResult> {
  try {
    const adb = await deviceManager.connection(serial);
    const png = await adb.subprocess.noneProtocol.spawnWait('screencap -p');

    // PNG magic: 89 50 4E 47.
    const isPng =
      png.length > 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
    if (!isPng) {
      return {
        ok: false,
        message:
          'The device returned something that is not a PNG. Some older ROMs mangle binary output — mirror the device and use the Studio screenshot instead.',
      };
    }

    const details = await deviceManager.details(serial);
    return await saveToCaptureFolder(png, details?.model ?? serial, 'png');
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

export async function revealCaptureFolder(): Promise<void> {
  await shell.openPath(settings.captureDirectory());
}

export async function chooseCaptureFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose where captures are saved',
    defaultPath: settings.captureDirectory(),
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths[0]) return null;
  settings.set({ captureDirectory: result.filePaths[0] });
  return result.filePaths[0];
}
