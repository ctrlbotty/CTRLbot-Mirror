import type { AppEntry, CommandResult } from '@shared/types.js';
import { adbServer } from './adb-server.js';
import { deviceManager } from './device-manager.js';
import { describeError, scoped } from './logger.js';
import { runAdb } from './platform-tools.js';

const log = scoped('apps');

/** `com.google.android.youtube` → `Youtube`. Package managers do not hand out
 * display labels cheaply, so derive something readable from the id. */
function prettyLabel(packageName: string): string {
  const last = packageName.split('.').filter(Boolean).pop() ?? packageName;
  return last
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parsePackages(output: string, system: boolean): AppEntry[] {
  const entries: AppEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('package:')) continue;
    // `pm list packages -f` would add a path prefix; we do not request it.
    const packageName = trimmed.slice('package:'.length).trim();
    if (!packageName) continue;
    entries.push({ packageName, label: prettyLabel(packageName), system });
  }
  return entries;
}

export async function listApps(serial: string, includeSystem: boolean): Promise<AppEntry[]> {
  const adb = await deviceManager.connection(serial);
  const shell = adb.subprocess.noneProtocol;

  const userOutput = await shell.spawnWaitText('pm list packages -3');
  const entries = parsePackages(userOutput, false);

  if (includeSystem) {
    const systemOutput = await shell.spawnWaitText('pm list packages -s');
    entries.push(...parsePackages(systemOutput, true));
  }

  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

export async function launchApp(serial: string, packageName: string): Promise<CommandResult> {
  try {
    const adb = await deviceManager.connection(serial);
    const shell = adb.subprocess.noneProtocol;

    // `monkey` picks the launcher activity for us and works on every Android
    // version we care about, including devices with no resolvable MAIN intent
    // under the newer `cmd package` syntax.
    const output = await shell.spawnWaitText(
      `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`,
    );

    if (/No activities found|Error/i.test(output)) {
      return { ok: false, output, error: `${packageName} has no launchable activity.` };
    }
    return { ok: true, output: `Launched ${packageName}` };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}

export async function forceStopApp(serial: string, packageName: string): Promise<CommandResult> {
  try {
    const adb = await deviceManager.connection(serial);
    const output = await adb.subprocess.noneProtocol.spawnWaitText(`am force-stop ${packageName}`);
    return { ok: true, output: output.trim() || `Stopped ${packageName}` };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}

export async function clearAppData(serial: string, packageName: string): Promise<CommandResult> {
  try {
    const adb = await deviceManager.connection(serial);
    const output = await adb.subprocess.noneProtocol.spawnWaitText(`pm clear ${packageName}`);
    const ok = output.includes('Success');
    return ok
      ? { ok: true, output: `Cleared data for ${packageName}` }
      : { ok: false, output, error: output.trim() || 'pm clear failed' };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}

export async function uninstallApp(serial: string, packageName: string): Promise<CommandResult> {
  try {
    const adb = await deviceManager.connection(serial);
    const output = await adb.subprocess.noneProtocol.spawnWaitText(`pm uninstall ${packageName}`);
    const ok = output.includes('Success');
    return ok
      ? { ok: true, output: `Uninstalled ${packageName}` }
      : {
          ok: false,
          output,
          error:
            output.trim() ||
            'Uninstall failed. System apps and device-admin apps cannot be removed this way.',
        };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}

/**
 * Installs one or more APKs.
 *
 * Delegates to `adb install` rather than the sync protocol: split APKs
 * (`install-multiple`) and the session bookkeeping around them are fiddly, and
 * adb already gets it right.
 */
export async function installApks(serial: string, apkPaths: string[]): Promise<CommandResult> {
  if (apkPaths.length === 0) return { ok: false, output: '', error: 'No APK selected.' };

  const adbPath = adbServer.requireAdbPath();
  const verb = apkPaths.length > 1 ? 'install-multiple' : 'install';
  const args = ['-s', serial, verb, '-r', '-g', ...apkPaths];

  try {
    log.info(`installing ${apkPaths.length} apk(s) on ${serial}`);
    const { stdout, stderr } = await runAdb(adbPath, args, 15 * 60_000);
    const output = `${stdout}${stderr}`.trim();
    const ok = /Success/i.test(output);
    return ok
      ? { ok: true, output: output || 'Installed.' }
      : { ok: false, output, error: output || 'Install failed.' };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}
