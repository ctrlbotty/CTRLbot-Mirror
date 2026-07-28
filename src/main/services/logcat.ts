import type { AdbNoneProtocolProcess } from '@yume-chan/adb';
import { SplitStringStream, TextDecoderStream, WritableStream } from '@yume-chan/stream-extra';
import type { CommandResult, LogLine, LogPriority } from '@shared/types.js';
import { deviceManager } from './device-manager.js';
import { describeError, scoped } from './logger.js';

const log = scoped('logcat');

const PRIORITIES = new Set<LogPriority>(['V', 'D', 'I', 'W', 'E', 'F']);

/**
 * `threadtime` format:
 * `06-12 09:41:22.914  1234  1250 I ActivityManager: Start proc …`
 */
const THREADTIME =
  /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+\d+\s+([VDIWEF])\s+([^:]*):\s?(.*)$/;

function parseLine(raw: string, id: number): LogLine {
  const match = THREADTIME.exec(raw);
  if (match) {
    const priority = match[3] as LogPriority;
    return {
      id,
      raw,
      timestamp: match[1] ?? '',
      pid: match[2] ?? '',
      priority: PRIORITIES.has(priority) ? priority : 'I',
      tag: (match[4] ?? '').trim(),
      message: match[5] ?? '',
    };
  }

  return { id, raw, timestamp: '', pid: '', priority: 'I', tag: '', message: raw };
}

/**
 * Streams logcat from one device at a time.
 *
 * Lines are batched on a short timer — a chatty device emits thousands per
 * second and sending each one across IPC would stall the UI thread.
 */
class LogcatService {
  #process: AdbNoneProtocolProcess | null = null;
  #serial: string | null = null;
  #nextId = 0;
  #buffer: LogLine[] = [];
  #timer: NodeJS.Timeout | null = null;
  #emit: ((lines: LogLine[]) => void) | null = null;

  get activeSerial(): string | null {
    return this.#serial;
  }

  async start(serial: string, emit: (lines: LogLine[]) => void): Promise<CommandResult> {
    await this.stop();
    this.#emit = emit;

    try {
      const adb = await deviceManager.connection(serial);
      const process = await adb.subprocess.noneProtocol.spawn('logcat -v threadtime');
      this.#process = process;
      this.#serial = serial;

      void process.output
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new SplitStringStream('\n'))
        .pipeTo(
          new WritableStream<string>({
            write: (line) => {
              const raw = line.replace(/\r$/, '');
              if (raw.trim()) this.#queue(parseLine(raw, this.#nextId++));
            },
          }),
        )
        .catch((error: unknown) => log.debug('logcat stream ended —', describeError(error)));

      log.info('logcat started for', serial);
      return { ok: true, output: `Streaming logcat from ${serial}` };
    } catch (error) {
      return { ok: false, output: '', error: describeError(error) };
    }
  }

  async stop(): Promise<void> {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#buffer = [];

    const process = this.#process;
    this.#process = null;
    this.#serial = null;
    if (!process) return;

    try {
      await process.kill();
    } catch (error) {
      log.debug('killing logcat failed —', describeError(error));
    }
  }

  async clear(serial: string): Promise<CommandResult> {
    try {
      const adb = await deviceManager.connection(serial);
      await adb.subprocess.noneProtocol.spawnWaitText('logcat -c');
      this.#nextId = 0;
      return { ok: true, output: 'Log buffer cleared.' };
    } catch (error) {
      return { ok: false, output: '', error: describeError(error) };
    }
  }

  #queue(line: LogLine): void {
    this.#buffer.push(line);
    if (this.#timer) return;

    this.#timer = setTimeout(() => {
      this.#timer = null;
      const batch = this.#buffer;
      this.#buffer = [];
      if (batch.length > 0) this.#emit?.(batch);
    }, 120);
  }
}

export const logcat = new LogcatService();
