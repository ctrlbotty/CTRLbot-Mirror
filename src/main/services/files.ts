import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { LinuxFileType } from '@yume-chan/adb';
import { ReadableStream } from '@yume-chan/stream-extra';
import type { CommandResult, RemoteFile, TransferResult } from '@shared/types.js';
import { deviceManager } from './device-manager.js';
import { describeError, scoped } from './logger.js';

const log = scoped('files');

/** Joins device paths without letting Windows separators leak in. */
function remoteJoin(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`;
}

/** Wraps a Node readable as the web stream the sync service expects. */
function nodeToWebStream(path: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(path, { highWaterMark: 256 * 1024 });
  const iterator = nodeStream[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(value as Buffer));
    },
    cancel(reason) {
      nodeStream.destroy(reason instanceof Error ? reason : undefined);
    },
  });
}

export async function listFiles(serial: string, path: string): Promise<RemoteFile[]> {
  const adb = await deviceManager.connection(serial);
  const sync = await adb.sync();
  try {
    const entries = await sync.readdir(path);
    return entries
      .filter((entry) => entry.name !== '.' && entry.name !== '..')
      .map((entry) => ({
        name: entry.name,
        path: remoteJoin(path, entry.name),
        size: Number(entry.size),
        // adb reports mtime in seconds since the epoch.
        mtime: Number(entry.mtime) * 1000,
        isDirectory: entry.type === LinuxFileType.Directory,
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } finally {
    await sync.dispose();
  }
}

export async function pushFiles(
  serial: string,
  localPaths: string[],
  remoteDir: string,
): Promise<TransferResult[]> {
  const adb = await deviceManager.connection(serial);
  const sync = await adb.sync();
  const results: TransferResult[] = [];

  try {
    for (const localPath of localPaths) {
      const name = basename(localPath);
      const target = remoteJoin(remoteDir, name);
      try {
        const info = await stat(localPath);
        if (info.isDirectory()) {
          results.push({
            ok: false,
            path: localPath,
            bytes: 0,
            message: 'Folders are not supported yet — drop individual files.',
          });
          continue;
        }

        await sync.write({
          filename: target,
          file: nodeToWebStream(localPath),
          permission: 0o644,
          mtime: Math.floor(info.mtimeMs / 1000),
        });
        log.info(`pushed ${name} → ${target}`);
        results.push({ ok: true, path: target, bytes: info.size });
      } catch (error) {
        results.push({ ok: false, path: localPath, bytes: 0, message: describeError(error) });
      }
    }
  } finally {
    await sync.dispose();
  }

  return results;
}

export async function pullFile(
  serial: string,
  remotePath: string,
  localDir: string,
): Promise<TransferResult> {
  const adb = await deviceManager.connection(serial);
  const sync = await adb.sync();
  const name = remotePath.split('/').filter(Boolean).pop() ?? 'pulled-file';
  const target = join(localDir, name);

  try {
    let bytes = 0;
    const reader = sync.read(remotePath).getReader();

    await pipeline(
      (async function* () {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          yield Buffer.from(value);
        }
      })(),
      createWriteStream(target),
    );

    log.info(`pulled ${remotePath} → ${target} (${bytes} bytes)`);
    return { ok: true, path: target, bytes };
  } catch (error) {
    return { ok: false, path: remotePath, bytes: 0, message: describeError(error) };
  } finally {
    await sync.dispose();
  }
}

export async function removeRemote(serial: string, remotePath: string): Promise<CommandResult> {
  try {
    const adb = await deviceManager.connection(serial);
    const output = await adb.rm(remotePath, { recursive: true, force: true });
    return { ok: true, output: output.trim() || `Deleted ${remotePath}` };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}

export async function makeRemoteDir(serial: string, remotePath: string): Promise<CommandResult> {
  try {
    const adb = await deviceManager.connection(serial);
    const output = await adb.subprocess.noneProtocol.spawnWaitText(`mkdir -p '${remotePath}'`);
    return { ok: true, output: output.trim() || `Created ${remotePath}` };
  } catch (error) {
    return { ok: false, output: '', error: describeError(error) };
  }
}
