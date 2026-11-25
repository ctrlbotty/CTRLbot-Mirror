import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const extract = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.IO.Compression.FileSystem',
  '[System.IO.Compression.ZipFile]::ExtractToDirectory($env:CTRLBOT_PLATFORM_TOOLS_ZIP, $env:CTRLBOT_PLATFORM_TOOLS_DESTINATION)',
].join('; ');

export async function extractPlatformTools(archive: string, destination: string): Promise<void> {
  const powershell = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-Command', extract], {
    env: {
      ...process.env,
      CTRLBOT_PLATFORM_TOOLS_ZIP: archive,
      CTRLBOT_PLATFORM_TOOLS_DESTINATION: destination,
    },
    timeout: 60_000,
    windowsHide: true,
  });
}
