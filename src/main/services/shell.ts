import type { CommandResult } from '@shared/types.js';
import { deviceManager } from './device-manager.js';
import { describeError } from './logger.js';

/**
 * Runs a shell command on the device and returns its combined output.
 *
 * The "none" subprocess protocol merges stdout and stderr, which is what a
 * terminal-style panel wants anyway.
 */
export async function runShell(serial: string, command: string): Promise<CommandResult> {
  const trimmed = command.trim();
  if (!trimmed) return { ok: true, output: '' };

  try {
    const adb = await deviceManager.connection(serial);
    const output = await adb.subprocess.noneProtocol.spawnWaitText(trimmed);
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}
