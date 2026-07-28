import { app } from 'electron';
import { execFile } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import extract from 'extract-zip';
import { PLATFORM_TOOLS_URL } from '@shared/constants.js';
import type { AdbSource, DownloadProgress } from '@shared/types.js';
import { describeError, scoped } from './logger.js';
import { settings } from './settings.js';

const execFileAsync = promisify(execFile);
const log = scoped('platform-tools');

export interface ResolvedAdb {
  path: string;
  source: AdbSource;
  version: string | null;
}

/** Where we keep our own copy when the machine has no usable adb. */
function managedDir(): string {
  return join(app.getPath('userData'), 'platform-tools');
}

function managedAdb(): string {
  return join(managedDir(), 'adb.exe');
}

function candidatePaths(): Array<{ path: string; source: AdbSource }> {
  const candidates: Array<{ path: string; source: AdbSource }> = [];

  const override = settings.get().adbPathOverride;
  if (override) candidates.push({ path: override, source: 'system' });

  candidates.push({ path: managedAdb(), source: 'managed' });

  const sdkRoots = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Android', 'android-sdk') : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const root of sdkRoots) {
    candidates.push({ path: join(root, 'platform-tools', 'adb.exe'), source: 'system' });
  }

  return candidates;
}

async function readVersion(adbPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(adbPath, ['version'], { timeout: 10_000 });
    // "Android Debug Bridge version 1.0.41"
    return stdout.split(/\r?\n/)[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Falls back to whatever `adb` the user already has on PATH. */
async function adbOnPath(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('where', ['adb'], { timeout: 10_000, shell: false });
    const first = stdout.split(/\r?\n/).find((line) => line.trim().length > 0);
    return first?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Finds a working adb without downloading anything.
 * Returns `null` when the machine has none.
 */
export async function resolveAdb(): Promise<ResolvedAdb | null> {
  for (const candidate of candidatePaths()) {
    if (!existsSync(candidate.path)) continue;
    const version = await readVersion(candidate.path);
    if (version) return { path: candidate.path, source: candidate.source, version };
  }

  const fromPath = await adbOnPath();
  if (fromPath) {
    const version = await readVersion(fromPath);
    if (version) return { path: fromPath, source: 'system', version };
  }

  return null;
}

/**
 * Downloads Google's platform-tools bundle into the app's user-data folder.
 *
 * We deliberately download rather than vendor adb.exe: the Android SDK licence
 * does not grant redistribution rights, and fetching from Google keeps users on
 * a current build that understands newer devices.
 */
export async function downloadPlatformTools(
  onProgress: (progress: DownloadProgress) => void,
): Promise<ResolvedAdb> {
  const targetDir = managedDir();
  const tempZip = join(app.getPath('temp'), `ctrlbot-platform-tools-${Date.now()}.zip`);

  onProgress({
    phase: 'downloading',
    receivedBytes: 0,
    totalBytes: 0,
    message: 'Contacting dl.google.com…',
  });

  log.info('downloading platform-tools from', PLATFORM_TOOLS_URL);
  const response = await fetch(PLATFORM_TOOLS_URL, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`platform-tools download failed: HTTP ${response.status}`);
  }

  const totalBytes = Number(response.headers.get('content-length') ?? 0);
  let receivedBytes = 0;
  let lastReport = 0;

  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length;
    // Throttle so we do not flood the renderer with progress events.
    const now = Date.now();
    if (now - lastReport > 120) {
      lastReport = now;
      onProgress({
        phase: 'downloading',
        receivedBytes,
        totalBytes,
        message: 'Downloading Android platform-tools…',
      });
    }
  });

  await mkdir(app.getPath('temp'), { recursive: true });
  await pipeline(source, createWriteStream(tempZip));

  onProgress({
    phase: 'extracting',
    receivedBytes,
    totalBytes,
    message: 'Extracting platform-tools…',
  });

  // The archive already contains a top-level `platform-tools/` folder, so
  // extract into userData and it lands exactly where managedAdb() expects.
  await rm(targetDir, { recursive: true, force: true });
  await extract(tempZip, { dir: app.getPath('userData') });
  await rm(tempZip, { force: true });

  const adbPath = managedAdb();
  const version = await readVersion(adbPath);
  if (!version) {
    throw new Error('platform-tools were extracted but adb.exe did not run. Antivirus quarantine?');
  }

  onProgress({
    phase: 'done',
    receivedBytes,
    totalBytes,
    message: `Installed ${version}`,
  });
  log.info('platform-tools ready at', adbPath);

  return { path: adbPath, source: 'managed', version };
}

/** Resolves adb, downloading Google's bundle when nothing usable is found. */
export async function ensureAdb(
  onProgress: (progress: DownloadProgress) => void,
): Promise<ResolvedAdb> {
  const existing = await resolveAdb();
  if (existing) return existing;

  try {
    return await downloadPlatformTools(onProgress);
  } catch (error) {
    const message = describeError(error);
    onProgress({ phase: 'error', receivedBytes: 0, totalBytes: 0, message });
    throw new Error(`Could not install Android platform-tools: ${message}`, { cause: error });
  }
}

/** Runs an adb command directly. Used for the few things the protocol client
 * does not cover (server lifecycle, pairing on old servers, emulator launch). */
export async function runAdb(
  adbPath: string,
  args: string[],
  timeout = 30_000,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(adbPath, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(err.stderr?.trim() || err.stdout?.trim() || err.message || 'adb failed', {
      cause: error,
    });
  }
}
