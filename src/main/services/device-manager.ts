import type { Adb, AdbServerClient } from '@yume-chan/adb';
import type {
  CommandResult,
  DeviceDetails,
  DeviceSummary,
  DeviceTransportKind,
  PairingRequest,
} from '@shared/types.js';
import { adbServer } from './adb-server.js';
import { describeError, scoped } from './logger.js';
import { runAdb } from './platform-tools.js';

const log = scoped('devices');

function classify(serial: string): DeviceTransportKind {
  if (serial.startsWith('emulator-')) return 'emulator';
  // Wireless serials are `host:port`; USB serials never contain a colon.
  if (/:\d+$/.test(serial)) return 'tcp';
  return 'usb';
}

function toSummary(device: AdbServerClient.Device): DeviceSummary {
  return {
    serial: device.serial,
    state: device.state,
    transport: classify(device.serial),
    transportId: device.transportId.toString(),
    product: device.product,
    model: device.model,
    device: device.device,
  };
}

function parseGetProp(dump: string): Map<string, string> {
  const map = new Map<string, string>();
  // getprop prints `[key]: [value]`, one per line.
  const pattern = /^\[([^\]]+)\]:\s*\[([^\]]*)\]$/;
  for (const line of dump.split(/\r?\n/)) {
    const match = pattern.exec(line.trim());
    if (match?.[1]) map.set(match[1], match[2] ?? '');
  }
  return map;
}

class DeviceManager {
  #observer: AdbServerClient.DeviceObserver | null = null;
  #connections = new Map<string, Promise<Adb>>();
  #listeners = new Set<(devices: DeviceSummary[]) => void>();
  #current: DeviceSummary[] = [];

  get current(): DeviceSummary[] {
    return this.#current;
  }

  onChange(listener: (devices: DeviceSummary[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Starts (or restarts) the live device tracker. */
  async startTracking(): Promise<void> {
    await this.stopTracking();

    const client = adbServer.requireClient();
    const observer = await client.trackDevices({
      includeStates: ['device', 'unauthorized', 'offline'],
    });

    observer.onListChange((devices) => this.#publish(devices));
    observer.onDeviceRemove((devices) => {
      for (const device of devices) this.#dropConnection(device.serial);
    });
    observer.onError((error) => {
      log.warn('device tracker error —', describeError(error));
    });

    this.#observer = observer;
    this.#publish(observer.current);
    log.info('device tracker started');
  }

  async stopTracking(): Promise<void> {
    if (!this.#observer) return;
    try {
      await this.#observer.stop();
    } catch (error) {
      log.warn('stopping tracker failed —', describeError(error));
    }
    this.#observer = null;
  }

  async list(): Promise<DeviceSummary[]> {
    const client = adbServer.requireClient();
    const devices = await client.getDevices(['device', 'unauthorized', 'offline']);
    this.#current = devices.map(toSummary);
    return this.#current;
  }

  /**
   * Returns a connected `Adb` for the serial, reusing the existing transport.
   * Callers must not close it — `dispose()` and device removal handle that.
   */
  async connection(serial: string): Promise<Adb> {
    const existing = this.#connections.get(serial);
    if (existing) {
      try {
        return await existing;
      } catch {
        this.#connections.delete(serial);
      }
    }

    const client = adbServer.requireClient();
    const pending = client.createAdb({ serial }).then((adb) => {
      // Drop the cache entry as soon as the device goes away so the next call
      // creates a fresh transport instead of reusing a dead one.
      void adb.disconnected.then(() => {
        if (this.#connections.get(serial) === pending) this.#connections.delete(serial);
      });
      return adb;
    });

    this.#connections.set(serial, pending);
    try {
      return await pending;
    } catch (error) {
      this.#connections.delete(serial);
      throw new Error(`Could not open a session with ${serial}: ${describeError(error)}`, {
        cause: error,
      });
    }
  }

  async details(serial: string): Promise<DeviceDetails | null> {
    try {
      const adb = await this.connection(serial);
      const shell = adb.subprocess.noneProtocol;

      const [propDump, sizeOut, densityOut, batteryOut, ipOut] = await Promise.all([
        shell.spawnWaitText('getprop'),
        shell.spawnWaitText('wm size').catch(() => ''),
        shell.spawnWaitText('wm density').catch(() => ''),
        shell.spawnWaitText('dumpsys battery').catch(() => ''),
        shell.spawnWaitText('ip -f inet addr show wlan0').catch(() => ''),
      ]);

      const props = parseGetProp(propDump);
      const get = (key: string) => props.get(key) ?? '';

      const sizeMatch = /Physical size:\s*(\d+)x(\d+)/.exec(sizeOut);
      const overrideSize = /Override size:\s*(\d+)x(\d+)/.exec(sizeOut);
      const chosenSize = overrideSize ?? sizeMatch;
      const densityMatch =
        /Override density:\s*(\d+)/.exec(densityOut) ??
        /Physical density:\s*(\d+)/.exec(densityOut);

      const levelMatch = /level:\s*(\d+)/.exec(batteryOut);
      const statusMatch = /status:\s*(\d+)/.exec(batteryOut);
      const ipMatch = /inet\s+(\d+\.\d+\.\d+\.\d+)/.exec(ipOut);

      const model = get('ro.product.model') || serial;
      const manufacturer = get('ro.product.manufacturer');

      return {
        serial,
        model,
        manufacturer,
        brand: get('ro.product.brand'),
        name: [manufacturer, model].filter(Boolean).join(' ') || serial,
        androidRelease: get('ro.build.version.release'),
        sdkInt: Number.parseInt(get('ro.build.version.sdk'), 10) || 0,
        abi: get('ro.product.cpu.abi'),
        buildId: get('ro.build.display.id') || get('ro.build.id'),
        screen:
          chosenSize?.[1] && chosenSize[2]
            ? {
                width: Number(chosenSize[1]),
                height: Number(chosenSize[2]),
                density: densityMatch?.[1] ? Number(densityMatch[1]) : 0,
              }
            : null,
        battery: levelMatch?.[1]
          ? {
              level: Number(levelMatch[1]),
              // BatteryManager: 2 = charging, 5 = full.
              charging: statusMatch?.[1] === '2' || statusMatch?.[1] === '5',
            }
          : null,
        ipAddress: ipMatch?.[1] ?? null,
      };
    } catch (error) {
      log.warn(`details for ${serial} failed —`, describeError(error));
      return null;
    }
  }

  async connectWireless(address: string): Promise<CommandResult> {
    const client = adbServer.requireClient();
    try {
      await client.wireless.connect(address);
      return { ok: true, output: `Connected to ${address}` };
    } catch (error) {
      return { ok: false, output: '', error: describeError(error) };
    }
  }

  async disconnectWireless(address: string): Promise<CommandResult> {
    const client = adbServer.requireClient();
    try {
      await client.wireless.disconnect(address);
      this.#dropConnection(address);
      return { ok: true, output: `Disconnected ${address}` };
    } catch (error) {
      return { ok: false, output: '', error: describeError(error) };
    }
  }

  async pair(request: PairingRequest): Promise<CommandResult> {
    const client = adbServer.requireClient();
    try {
      await client.wireless.pair(request.address, request.code);
      return { ok: true, output: `Paired with ${request.address}` };
    } catch (error) {
      return { ok: false, output: '', error: describeError(error) };
    }
  }

  /**
   * Switches a USB-connected device to wireless ADB and connects to it, so the
   * user can unplug the cable and keep mirroring.
   */
  async enableTcpip(serial: string, port = 5555): Promise<CommandResult> {
    try {
      const adb = await this.connection(serial);
      const response = await adb.tcpip.setPort(port);
      log.info(`${serial} switched to tcpip on port ${port} — ${response.trim()}`);

      const details = await this.details(serial);
      if (!details?.ipAddress) {
        return {
          ok: true,
          output: `Wireless ADB is on (port ${port}), but the device's Wi-Fi address could not be read. Connect manually once you know its IP.`,
        };
      }

      const target = `${details.ipAddress}:${port}`;
      const connected = await this.connectWireless(target);
      return connected.ok
        ? { ok: true, output: `Wireless ADB ready at ${target}. You can unplug the cable.` }
        : { ok: false, output: '', error: connected.error };
    } catch (error) {
      return { ok: false, output: '', error: describeError(error) };
    }
  }

  /** `adb reconnect` — the usual cure for a device stuck in `offline`. */
  async reconnect(serial: string): Promise<CommandResult> {
    try {
      this.#dropConnection(serial);
      const { stdout, stderr } = await runAdb(adbServer.requireAdbPath(), [
        '-s',
        serial,
        'reconnect',
      ]);
      return { ok: true, output: (stdout || stderr).trim() || 'Reconnecting…' };
    } catch (error) {
      return { ok: false, output: '', error: describeError(error) };
    }
  }

  async dispose(): Promise<void> {
    await this.stopTracking();
    for (const serial of [...this.#connections.keys()]) this.#dropConnection(serial);
  }

  #dropConnection(serial: string): void {
    const pending = this.#connections.get(serial);
    if (!pending) return;
    this.#connections.delete(serial);
    void pending.then((adb) => adb.close()).catch(() => undefined);
  }

  #publish(devices: readonly AdbServerClient.Device[]): void {
    this.#current = devices.map(toSummary);
    for (const listener of this.#listeners) listener(this.#current);
  }
}

export const deviceManager = new DeviceManager();
