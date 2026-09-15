import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ReadableStream } from 'node:stream/web';
import { downloadFile } from '../src/main/services/download-file.ts';

const { Response } = globalThis;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mirror-download-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, destination: join(root, 'bundle.zip') };
}

test('an immediately flowing body is saved byte-for-byte, including its ZIP header', async (t) => {
  const { destination } = await fixture(t);
  const bytes = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(1024 * 1024, 42)]);
  const reports = [];
  await downloadFile('https://example.test/bundle.zip', destination, {
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 8192) {
              controller.enqueue(bytes.subarray(offset, offset + 8192));
            }
            controller.close();
          },
        }),
        { headers: { 'content-length': String(bytes.length) } },
      ),
    onProgress: (received, total) => reports.push([received, total]),
  });
  assert.deepEqual(await readFile(destination), bytes);
  assert.deepEqual(reports.at(-1), [bytes.length, bytes.length]);
});

test('an interrupted stream retries from zero without keeping partial bytes', async (t) => {
  const { destination } = await fixture(t);
  let calls = 0;
  const retries = [];
  await downloadFile('https://example.test/bundle.zip', destination, {
    fetch: async () => {
      calls++;
      if (calls > 1) return new Response('complete');
      let sent = false;
      return new Response(
        new ReadableStream({
          pull(controller) {
            if (sent) controller.error(new Error('connection reset'));
            else {
              controller.enqueue(Buffer.from('partial'));
              sent = true;
            }
          },
        }),
      );
    },
    onProgress() {},
    onRetry: (attempt) => retries.push(attempt),
    retryDelayMs: 0,
  });
  assert.equal(await readFile(destination, 'utf8'), 'complete');
  assert.deepEqual(retries, [2]);
});

test('a truncated body exhausts bounded retries and removes the partial ZIP', async (t) => {
  const { root, destination } = await fixture(t);
  let calls = 0;
  await assert.rejects(
    downloadFile('https://example.test/bundle.zip', destination, {
      fetch: async () => {
        calls++;
        return new Response('short', { headers: { 'content-length': '99' } });
      },
      onProgress() {},
      retryDelayMs: 0,
    }),
    /Incomplete download/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(await readdir(root), []);
});

test('a stalled transfer times out and leaves no ZIP', async (t) => {
  const { root, destination } = await fixture(t);
  await assert.rejects(
    downloadFile('https://example.test/bundle.zip', destination, {
      fetch: async () => new Response(new ReadableStream({ start() {} })),
      onProgress() {},
      attempts: 1,
      timeoutMs: 30,
    }),
    { name: 'AbortError' },
  );
  assert.deepEqual(await readdir(root), []);
});

test('HTTP failures are surfaced and do not leave a ZIP', async (t) => {
  const { root, destination } = await fixture(t);
  await assert.rejects(
    downloadFile('https://example.test/bundle.zip', destination, {
      fetch: async () => new Response('unavailable', { status: 503 }),
      onProgress() {},
      attempts: 1,
    }),
    /HTTP 503/,
  );
  assert.deepEqual(await readdir(root), []);
});
