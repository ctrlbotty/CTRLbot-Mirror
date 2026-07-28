import { readFile } from 'node:fs/promises';
import type { MessagePortMain } from 'electron';
import { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy';
import {
  AndroidKeyEventAction,
  AndroidMotionEventAction,
  AndroidMotionEventButton,
  AndroidScreenPowerMode,
  ScrcpyPointerId,
  ScrcpyVideoCodecNameMap,
  type AndroidKeyCode,
  type AndroidKeyEventMeta,
  type ScrcpyMediaStreamPacket,
} from '@yume-chan/scrcpy';
import { ReadableStream, WritableStream } from '@yume-chan/stream-extra';
import { SCRCPY_DEVICE_PATH, SCRCPY_SERVER_VERSION } from '@shared/constants.js';
import type {
  ControlCommand,
  MirrorOptions,
  MirrorSessionInfo,
  VideoMetadata,
} from '@shared/types.js';
import { describeError, scoped } from './logger.js';
import { deviceManager } from './device-manager.js';
import { scrcpyServerPath } from './scrcpy-server-bin.js';

const log = scoped('scrcpy');

type Client = AdbScrcpyClient<AdbScrcpyOptionsLatest<true>>;

const TOUCH_ACTIONS = {
  down: AndroidMotionEventAction.Down,
  up: AndroidMotionEventAction.Up,
  move: AndroidMotionEventAction.Move,
} as const;

const KEY_ACTIONS = {
  down: AndroidKeyEventAction.Down,
  up: AndroidKeyEventAction.Up,
} as const;

export interface SessionCallbacks {
  onServerLog(line: string): void;
  onEnded(reason: string): void;
}

/**
 * Runs one scrcpy session at a time and pumps its video down a MessagePort.
 *
 * Video never travels over the regular IPC bus: a dedicated port keeps ~60
 * messages/second off the channel the UI uses for everything else, and it lets
 * the renderer own decoding via WebCodecs (hardware accelerated, and the decoded
 * frames land straight on a canvas we can screenshot and record).
 */
class ScrcpySessionService {
  #client: Client | null = null;
  #port: MessagePortMain | null = null;
  #serial: string | null = null;
  #clipboardSequence = 0n;
  #stopping = false;

  get activeSerial(): string | null {
    return this.#serial;
  }

  /** Called by the IPC layer when the renderer hands over its MessagePort. */
  attachPort(port: MessagePortMain): void {
    this.#port?.close();
    this.#port = port;
    port.start();
  }

  async start(
    serial: string,
    options: MirrorOptions,
    callbacks: SessionCallbacks,
  ): Promise<MirrorSessionInfo> {
    await this.stop();

    const jarPath = scrcpyServerPath();
    if (!jarPath) {
      throw new Error(
        'scrcpy-server.jar is missing. Run `npm run fetch:scrcpy`, or reinstall CTRLbot Mirror.',
      );
    }
    if (!this.#port) {
      throw new Error('The video channel is not connected yet. Reload the window and try again.');
    }

    const adb = await deviceManager.connection(serial);

    log.info(`pushing scrcpy server ${SCRCPY_SERVER_VERSION} to ${serial}`);
    const jar = await readFile(jarPath);
    await AdbScrcpyClient.pushServer(adb, singleChunkStream(new Uint8Array(jar)));

    const scrcpyOptions = new AdbScrcpyOptionsLatest(
      {
        video: true,
        audio: options.audio,
        videoCodec: options.videoCodec,
        videoBitRate: options.videoBitRate,
        maxFps: options.maxFps,
        maxSize: options.maxSize,
        audioCodec: options.audioCodec,
        control: options.control,
        stayAwake: options.stayAwake,
        showTouches: options.showTouches,
        powerOffOnClose: options.powerOffOnClose,
        displayId: options.displayId,
        clipboardAutosync: true,
        logLevel: 'info',
      },
      { version: SCRCPY_SERVER_VERSION },
    );

    const client = (await AdbScrcpyClient.start(
      adb,
      SCRCPY_DEVICE_PATH,
      scrcpyOptions,
    )) as unknown as Client;
    this.#client = client;
    this.#serial = serial;
    this.#stopping = false;

    this.#pumpServerLog(client, callbacks);

    const video = await client.videoStream;
    if (!video) {
      await this.stop();
      throw new Error('The scrcpy server started but produced no video stream.');
    }

    const metadata: VideoMetadata = {
      codecId: video.metadata.codec,
      codecName: ScrcpyVideoCodecNameMap.get(video.metadata.codec) ?? options.videoCodec,
      width: video.metadata.width ?? video.width ?? 0,
      height: video.metadata.height ?? video.height ?? 0,
      deviceName: video.metadata.deviceName ?? null,
    };

    this.#port.postMessage({ kind: 'metadata', metadata });
    this.#pumpVideo(video.stream, callbacks);

    // The audio stream must be drained even when we do not play it, otherwise
    // the server blocks waiting for a reader.
    void this.#drainAudio(client);

    if (options.turnScreenOffOnStart && client.controller) {
      await client.controller.setScreenPowerMode(AndroidScreenPowerMode.Off);
    }

    log.info(
      `mirroring ${serial} — ${metadata.codecName} ${metadata.width}x${metadata.height}` +
        `${options.control ? '' : ' (view only)'}`,
    );

    return {
      serial,
      metadata,
      controlEnabled: Boolean(client.controller),
      audioEnabled: options.audio,
    };
  }

  async stop(): Promise<void> {
    const client = this.#client;
    if (!client) return;

    this.#stopping = true;
    this.#client = null;
    this.#serial = null;

    try {
      await client.close();
    } catch (error) {
      log.warn('closing scrcpy session failed —', describeError(error));
    }
  }

  async control(command: ControlCommand): Promise<void> {
    const controller = this.#client?.controller;
    if (!controller) {
      // View-only sessions and races against `stop()` are normal; do not throw
      // at the UI for every stray mouse move.
      return;
    }

    switch (command.type) {
      case 'touch':
        await controller.injectTouch({
          action: TOUCH_ACTIONS[command.action],
          pointerId: command.pointerId === 0 ? ScrcpyPointerId.Finger : BigInt(command.pointerId),
          pointerX: command.x,
          pointerY: command.y,
          videoWidth: command.videoWidth,
          videoHeight: command.videoHeight,
          pressure: command.pressure,
          // `actionButton` is the button whose state just changed; it is only
          // set on press and release, never while dragging.
          actionButton:
            command.action === 'move'
              ? AndroidMotionEventButton.None
              : AndroidMotionEventButton.Primary,
          buttons: command.buttons,
        });
        return;

      case 'scroll':
        await controller.injectScroll({
          pointerX: command.x,
          pointerY: command.y,
          videoWidth: command.videoWidth,
          videoHeight: command.videoHeight,
          scrollX: command.scrollX,
          scrollY: command.scrollY,
          buttons: command.buttons,
        });
        return;

      case 'key':
        // The renderer sends plain `android.view.KeyEvent` numbers; the branded
        // types here are compile-time only.
        await controller.injectKeyCode({
          action: KEY_ACTIONS[command.action],
          keyCode: command.keyCode as AndroidKeyCode,
          repeat: command.repeat,
          metaState: command.metaState as AndroidKeyEventMeta,
        });
        return;

      case 'text':
        await controller.injectText(command.text);
        return;

      case 'backOrScreenOn':
        await controller.backOrScreenOn(KEY_ACTIONS[command.action]);
        return;

      case 'expandNotificationPanel':
        await controller.expandNotificationPanel();
        return;

      case 'expandSettingPanel':
        await controller.expandSettingPanel();
        return;

      case 'collapseNotificationPanel':
        await controller.collapseNotificationPanel();
        return;

      case 'rotateDevice':
        await controller.rotateDevice();
        return;

      case 'setClipboard':
        this.#clipboardSequence += 1n;
        await controller.setClipboard({
          sequence: this.#clipboardSequence,
          content: command.text,
          paste: command.paste,
        });
        return;

      case 'screenPowerMode':
        await controller.setScreenPowerMode(
          command.mode === 'off' ? AndroidScreenPowerMode.Off : AndroidScreenPowerMode.Normal,
        );
        return;

      case 'startApp':
        await controller.startApp(command.name, { forceStop: command.forceStop });
        return;

      case 'resetVideo':
        await controller.resetVideo();
        return;
    }
  }

  async listDisplays(serial: string): Promise<number[]> {
    const jarPath = scrcpyServerPath();
    if (!jarPath) return [0];

    const adb = await deviceManager.connection(serial);
    const options = new AdbScrcpyOptionsLatest({ video: true }, { version: SCRCPY_SERVER_VERSION });
    const displays = await AdbScrcpyClient.getDisplays(adb, SCRCPY_DEVICE_PATH, options);
    return displays.map((display) => display.id);
  }

  async listEncoders(serial: string): Promise<string[]> {
    const jarPath = scrcpyServerPath();
    if (!jarPath) return [];

    const adb = await deviceManager.connection(serial);
    const options = new AdbScrcpyOptionsLatest({ video: true }, { version: SCRCPY_SERVER_VERSION });
    const encoders = await AdbScrcpyClient.getEncoders(adb, SCRCPY_DEVICE_PATH, options);
    return encoders.map((encoder) => `${encoder.type}: ${encoder.name} (${encoder.codec})`);
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.#port?.close();
    this.#port = null;
  }

  #pumpVideo(stream: ReadableStream<ScrcpyMediaStreamPacket>, callbacks: SessionCallbacks): void {
    const port = this.#port;
    if (!port) return;

    const sink = new WritableStream<ScrcpyMediaStreamPacket>({
      write: (packet) => {
        // Electron's MessagePortMain cannot transfer ArrayBuffers, so copy the
        // view into a standalone buffer for the structured clone.
        if (packet.type === 'configuration') {
          port.postMessage({ kind: 'configuration', data: packet.data.slice() });
        } else {
          port.postMessage({
            kind: 'frame',
            data: packet.data.slice(),
            keyframe: packet.keyframe ?? false,
            pts: packet.pts,
          });
        }
      },
    });

    void stream
      .pipeTo(sink)
      .then(() => this.#finish('The device closed the video stream.', callbacks))
      .catch((error: unknown) => this.#finish(describeError(error), callbacks));
  }

  async #drainAudio(client: Client): Promise<void> {
    try {
      const audio = await client.audioStream;
      if (!audio || audio.type !== 'success') return;
      await audio.stream.pipeTo(new WritableStream({ write: () => undefined }));
    } catch (error) {
      log.debug('audio stream ended —', describeError(error));
    }
  }

  #pumpServerLog(client: Client, callbacks: SessionCallbacks): void {
    void client.output
      .pipeTo(
        new WritableStream<string>({
          write: (line) => {
            if (line.trim()) callbacks.onServerLog(line.trimEnd());
          },
        }),
      )
      .catch(() => undefined);

    void client.exited
      .then(() => this.#finish('The scrcpy server exited.', callbacks))
      .catch((error: unknown) => this.#finish(describeError(error), callbacks));
  }

  #finish(reason: string, callbacks: SessionCallbacks): void {
    if (this.#stopping) return;
    this.#stopping = true;
    this.#client = null;
    this.#serial = null;
    this.#port?.postMessage({ kind: 'ended', reason });
    callbacks.onEnded(reason);
    log.info('session ended —', reason);
  }
}

/** Wraps a buffer as a one-chunk web stream, which is what `pushServer` wants. */
function singleChunkStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

export const scrcpySession = new ScrcpySessionService();
