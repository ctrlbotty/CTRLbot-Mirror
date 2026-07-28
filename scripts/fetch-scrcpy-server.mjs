#!/usr/bin/env node
/**
 * Downloads the scrcpy server binary into `resources/scrcpy-server.jar`.
 *
 * The jar is *not* committed to this repo — it is a third-party Apache-2.0
 * artifact fetched from the official Genymobile/scrcpy release. It is pushed to
 * the connected Android device at runtime and executed there; nothing runs it on
 * Windows.
 *
 * The pinned version must match `SCRCPY_SERVER_VERSION` in
 * `src/shared/constants.ts` — the client sends its version string to the server
 * during handshake and the server refuses to start on a mismatch.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = resolve(ROOT, 'resources/scrcpy-server.jar');

/**
 * Pinned to the newest release that `@yume-chan/adb-scrcpy` implements options
 * for (`AdbScrcpyOptions3_3_3`). scrcpy itself ships newer versions, but the
 * client library must know the exact command-line contract, so do not bump this
 * without bumping the library and `SCRCPY_SERVER_VERSION` together.
 */
const VERSION = '3.3.3';
const SHA256 = '7e70323ba7f259649dd4acce97ac4fefbae8102b2c6d91e2e7be613fd5354be0';
const URL_ = `https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}/scrcpy-server-v${VERSION}`;

const force = process.argv.includes('--force');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function alreadyValid() {
  if (force || !existsSync(TARGET)) return false;
  try {
    return sha256(await readFile(TARGET)) === SHA256;
  } catch {
    return false;
  }
}

async function main() {
  if (await alreadyValid()) {
    console.log(`[scrcpy] server v${VERSION} already present and verified.`);
    return;
  }

  console.log(`[scrcpy] downloading server v${VERSION} …`);
  const response = await fetch(URL_, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = sha256(buffer);
  if (actual !== SHA256) {
    throw new Error(`Checksum mismatch for scrcpy-server v${VERSION}.\n  expected ${SHA256}\n  actual   ${actual}`);
  }

  await mkdir(dirname(TARGET), { recursive: true });
  await writeFile(TARGET, buffer);
  console.log(`[scrcpy] wrote ${TARGET} (${buffer.length} bytes, sha256 verified).`);
}

main().catch((error) => {
  console.error('[scrcpy] failed to fetch the server binary.');
  console.error(error instanceof Error ? error.message : error);
  console.error(
    '\nCTRLbot Mirror cannot mirror devices without it. Retry with `npm run fetch:scrcpy`,\n' +
      `or download ${URL_} manually and save it as resources/scrcpy-server.jar.`,
  );
  process.exitCode = 1;
});
