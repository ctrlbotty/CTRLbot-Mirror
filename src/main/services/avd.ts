import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { AvdEntry, CommandResult } from '@shared/types.js';
import { describeError, scoped } from './logger.js';

const execFileAsync = promisify(execFile);
const log = scoped('avd');

export interface AndroidSdkPaths {
  root: string | null;
  emulator: string | null;
  avdHome: string;
}

/**
 * Locates a local Android SDK.
 *
 * Virtual devices are optional — CTRLbot Mirror mirrors physical phones
 * without any SDK beyond platform-tools — so everything here degrades to
 * "no SDK found" rather than throwing.
 */
export function locateAndroidSdk(): AndroidSdkPaths {
  const roots = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined,
    join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  ].filter((value): value is string => Boolean(value));

  const root = roots.find((candidate) => existsSync(join(candidate, 'platform-tools'))) ?? null;
  const emulator = root ? join(root, 'emulator', 'emulator.exe') : null;

  return {
    root,
    emulator: emulator && existsSync(emulator) ? emulator : null,
    avdHome: process.env.ANDROID_AVD_HOME ?? join(homedir(), '.android', 'avd'),
  };
}

/** Reads AVD names from the emulator CLI, falling back to the .android folder. */
export async function listAvds(runningSerials: readonly string[]): Promise<AvdEntry[]> {
  const sdk = locateAndroidSdk();
  const names = new Set<string>();

  if (sdk.emulator) {
    try {
      const { stdout } = await execFileAsync(sdk.emulator, ['-list-avds'], { timeout: 20_000 });
      for (const line of stdout.split(/\r?\n/)) {
        const name = line.trim();
        // The CLI prefixes warnings with "INFO" / "WARNING"; skip anything odd.
        if (name && !name.includes(' ')) names.add(name);
      }
    } catch (error) {
      log.warn('emulator -list-avds failed —', describeError(error));
    }
  }

  if (names.size === 0 && existsSync(sdk.avdHome)) {
    for (const entry of readdirSync(sdk.avdHome)) {
      if (entry.endsWith('.ini')) names.add(entry.replace(/\.ini$/, ''));
    }
  }

  // An emulator's serial is `emulator-<port>`, which tells us nothing about
  // which AVD it is, so treat any running emulator as "an AVD is up" only when
  // exactly one AVD exists. Otherwise report per-name state as unknown/false.
  const runningCount = runningSerials.filter((serial) => serial.startsWith('emulator-')).length;
  const list = [...names].sort((a, b) => a.localeCompare(b));

  return list.map((name) => ({
    name,
    path: existsSync(join(sdk.avdHome, `${name}.avd`)) ? join(sdk.avdHome, `${name}.avd`) : null,
    target: null,
    running: list.length === 1 && runningCount > 0,
  }));
}

export async function startAvd(name: string): Promise<CommandResult> {
  const sdk = locateAndroidSdk();
  if (!sdk.emulator) {
    return {
      ok: false,
      output: '',
      error:
        'No Android emulator found. Install it via Android Studio → SDK Manager → SDK Tools → Android Emulator.',
    };
  }

  try {
    // Detached: the emulator outlives this call and shows up as a normal ADB
    // device a few seconds later.
    const child = spawn(sdk.emulator, ['-avd', name], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    log.info('launched AVD', name);
    return { ok: true, output: `Starting ${name}…` };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}
