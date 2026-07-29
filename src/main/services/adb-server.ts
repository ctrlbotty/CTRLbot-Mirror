import { AdbServerClient } from '@yume-chan/adb';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import { setTimeout as delay } from 'node:timers/promises';
import { ADB_SERVER_HOST, ADB_SERVER_PORT } from '@shared/constants.js';
import type { DownloadProgress, EnvironmentStatus } from '@shared/types.js';
import { describeError, scoped } from './logger.js';
import { ensureAdb, resolveAdb, runAdb, type ResolvedAdb } from './platform-tools.js';
import { locateScrcpyServer } from './scrcpy-server-bin.js';
import { locateAndroidSdk } from './avd.js';

const log = scoped('adb-server');
const SERVER_START_TIMEOUT_MS = 15_000;
const SERVER_PROBE_INTERVAL_MS = 250;

/**
 * Owns the connection to the local ADB server.
 *
 * We talk to `adb.exe`'s server over TCP rather than driving USB ourselves.
 * The server already solves the hard Windows problems — OEM driver quirks,
 * device authorisation keys, wireless pairing — and it stays compatible with
 * every other tool the user might have open (Android Studio, Unity, Flutter).
 */
class AdbServerService {
  #adb: ResolvedAdb | null = null;
  #client: AdbServerClient | null = null;
  #serverVersion: number | null = null;

  get adbPath(): string | null {
    return this.#adb?.path ?? null;
  }

  /** Throws with an actionable message when adb has not been set up yet. */
  requireClient(): AdbServerClient {
    if (!this.#client) {
      throw new Error('ADB is not ready yet. Open Setup and finish the connection checklist.');
    }
    return this.#client;
  }

  requireAdbPath(): string {
    if (!this.#adb) {
      throw new Error('adb.exe has not been located yet.');
    }
    return this.#adb.path;
  }

  /** Locates adb (downloading it if needed) and starts the ADB server. */
  async initialise(onProgress: (progress: DownloadProgress) => void): Promise<EnvironmentStatus> {
    this.#adb = await ensureAdb(onProgress);
    await this.startServer();
    return this.status();
  }

  /** Starts ADB when it is already installed, without triggering a download. */
  async initialiseInstalled(): Promise<EnvironmentStatus> {
    this.#adb = await resolveAdb();
    if (!this.#adb) {
      this.#client = null;
      this.#serverVersion = null;
      return this.status();
    }

    await this.startServer();
    return this.status();
  }

  /** Re-checks the environment without downloading anything. */
  async refresh(): Promise<EnvironmentStatus> {
    this.#adb = await resolveAdb();
    if (this.#adb) {
      this.#ensureClient();
      this.#serverVersion = await this.#probeServer();
    } else {
      this.#client = null;
      this.#serverVersion = null;
    }
    return this.status();
  }

  async startServer(): Promise<void> {
    const adbPath = this.requireAdbPath();
    let startError: string | null = null;
    try {
      // `start-server` is a no-op when one is already listening.
      await runAdb(adbPath, ['start-server'], 60_000);
    } catch (error) {
      startError = describeError(error);
      log.warn('start-server reported an error —', startError);
    }

    this.#ensureClient();
    this.#serverVersion = await this.#waitForServer();
    if (this.#serverVersion === null) {
      const suffix = startError ? ` Last adb error: ${startError}` : '';
      throw new Error(
        `ADB server did not become reachable at ${ADB_SERVER_HOST}:${ADB_SERVER_PORT}.${suffix}`,
      );
    }
    log.info('adb server ready, protocol version', this.#serverVersion);
  }

  async restartServer(): Promise<EnvironmentStatus> {
    const adbPath = this.requireAdbPath();
    try {
      await runAdb(adbPath, ['kill-server'], 30_000);
    } catch (error) {
      log.warn('kill-server failed —', describeError(error));
    }
    this.#client = null;
    this.#serverVersion = null;
    await this.startServer();
    return this.status();
  }

  async killServer(): Promise<void> {
    if (!this.#adb) return;
    try {
      await runAdb(this.#adb.path, ['kill-server'], 15_000);
    } catch (error) {
      log.warn('kill-server failed —', describeError(error));
    }
    this.#client = null;
    this.#serverVersion = null;
  }

  async status(): Promise<EnvironmentStatus> {
    const scrcpyServer = locateScrcpyServer();
    const sdk = locateAndroidSdk();

    return {
      adb: {
        available: Boolean(this.#adb),
        path: this.#adb?.path ?? null,
        version: this.#adb?.version ?? null,
        source: this.#adb?.source ?? null,
        serverRunning: this.#serverVersion !== null,
        serverVersion: this.#serverVersion,
      },
      scrcpyServer,
      androidSdkRoot: sdk.root,
      emulatorPath: sdk.emulator,
    };
  }

  #ensureClient(): void {
    if (this.#client) return;
    const connector = new AdbServerNodeTcpConnector({
      host: ADB_SERVER_HOST,
      port: ADB_SERVER_PORT,
    });
    this.#client = new AdbServerClient(connector);
  }

  async #waitForServer(timeout = SERVER_START_TIMEOUT_MS): Promise<number | null> {
    const deadline = Date.now() + timeout;
    do {
      const version = await this.#probeServer(false);
      if (version !== null) return version;
      await delay(SERVER_PROBE_INTERVAL_MS);
    } while (Date.now() < deadline);

    return null;
  }

  async #probeServer(logFailure = true): Promise<number | null> {
    if (!this.#client) return null;
    try {
      return await this.#client.getVersion();
    } catch (error) {
      if (logFailure) log.warn('adb server not reachable —', describeError(error));
      return null;
    }
  }
}

export const adbServer = new AdbServerService();
