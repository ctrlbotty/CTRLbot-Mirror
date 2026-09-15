import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';

interface DownloadOptions {
  fetch: typeof globalThis.fetch;
  onProgress(receivedBytes: number, totalBytes: number): void;
  onRetry?(attempt: number, error: unknown): void;
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

/** Keep progress counting inside the pipeline so no bytes flow before the writer is ready. */
export async function downloadFile(url: string, destination: string, options: DownloadOptions) {
  const attempts = options.attempts ?? 3;
  await mkdir(dirname(destination), { recursive: true });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
    try {
      options.onProgress(0, 0);
      const response = await options.fetch(url, {
        redirect: 'follow',
        headers: { 'Accept-Encoding': 'identity' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(`Download failed: HTTP ${response.status}`);
      }

      // Content-Length describes the wire size, so only compare unencoded bodies.
      const encoding = response.headers.get('content-encoding');
      const length = Number(response.headers.get('content-length') ?? 0);
      const totalBytes =
        (!encoding || encoding === 'identity') && Number.isFinite(length) ? Math.max(0, length) : 0;
      let receivedBytes = 0;
      let lastReport = 0;
      const progress = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          receivedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReport > 120) {
            lastReport = now;
            options.onProgress(receivedBytes, totalBytes);
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        progress,
        createWriteStream(destination),
        { signal: controller.signal },
      );
      if (receivedBytes === 0 || (totalBytes > 0 && receivedBytes !== totalBytes)) {
        throw new Error(`Incomplete download: received ${receivedBytes} of ${totalBytes} bytes`);
      }
      options.onProgress(receivedBytes, totalBytes);
      return { receivedBytes, totalBytes };
    } catch (error) {
      controller.abort();
      await rm(destination, { force: true });
      if (attempt === attempts) throw error;
      options.onRetry?.(attempt + 1, error);
    } finally {
      clearTimeout(timeout);
    }
    await delay((options.retryDelayMs ?? 1000) * attempt);
  }
  throw new Error('No download attempts configured');
}
