import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import type { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import type { VideoChannelMessage, VideoMetadata } from '@shared/types.js';
import { api } from './api.js';

export interface VideoSize {
  width: number;
  height: number;
}

export interface VideoStats {
  framesRendered: number;
  framesSkipped: number;
  fps: number;
}

type SizeListener = (size: VideoSize) => void;
type ErrorListener = (message: string) => void;

/**
 * Decodes the mirrored stream and paints it onto a canvas the app owns.
 *
 * Decoding happens here rather than in the main process on purpose: WebCodecs
 * gives us the GPU decoder Chromium already ships, and having the frames land
 * on a real canvas is what makes the Studio features possible — screenshots,
 * `captureStream()` recording and device-frame compositing all read from it.
 */
class MirrorController {
  #canvas: HTMLCanvasElement | null = null;
  #decoder: WebCodecsVideoDecoder | null = null;
  #writer: WritableStreamDefaultWriter<ScrcpyMediaStreamPacket> | null = null;
  #chain: Promise<unknown> = Promise.resolve();
  #pendingMetadata: VideoMetadata | null = null;
  #size: VideoSize = { width: 0, height: 0 };

  #sizeListeners = new Set<SizeListener>();
  #errorListeners = new Set<ErrorListener>();

  #lastSampleTime = 0;
  #lastSampleFrames = 0;
  #fps = 0;

  get canvas(): HTMLCanvasElement | null {
    return this.#canvas;
  }

  get size(): VideoSize {
    return this.#size;
  }

  get running(): boolean {
    return this.#decoder !== null;
  }

  /** Starts listening for packets. Call once, at app start-up. */
  connect(): () => void {
    api.mirror.attachVideoPort();
    return api.on.video((message) => this.#handle(message));
  }

  /** Binds the <canvas> the stage renders into. */
  attachCanvas(canvas: HTMLCanvasElement | null): void {
    if (this.#canvas === canvas) return;
    this.#canvas = canvas;

    // Metadata can arrive before React has mounted the stage; replay it.
    if (canvas && this.#pendingMetadata) {
      const metadata = this.#pendingMetadata;
      this.#pendingMetadata = null;
      this.#startDecoder(metadata);
    }
  }

  onSize(listener: SizeListener): () => void {
    this.#sizeListeners.add(listener);
    return () => this.#sizeListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.#errorListeners.add(listener);
    return () => this.#errorListeners.delete(listener);
  }

  stats(): VideoStats {
    const decoder = this.#decoder;
    if (!decoder) return { framesRendered: 0, framesSkipped: 0, fps: 0 };

    const now = performance.now();
    const rendered = decoder.framesRendered;
    if (this.#lastSampleTime === 0) {
      this.#lastSampleTime = now;
      this.#lastSampleFrames = rendered;
    } else if (now - this.#lastSampleTime >= 500) {
      this.#fps = ((rendered - this.#lastSampleFrames) * 1000) / (now - this.#lastSampleTime);
      this.#lastSampleTime = now;
      this.#lastSampleFrames = rendered;
    }

    return {
      framesRendered: rendered,
      framesSkipped: decoder.framesSkipped,
      fps: Math.round(this.#fps),
    };
  }

  /** Full-resolution PNG of the current frame, without any Studio decoration. */
  async snapshot(): Promise<Blob | null> {
    const blob = await this.#decoder?.snapshot();
    return blob ?? null;
  }

  stop(): void {
    this.#pendingMetadata = null;
    this.#teardown();
  }

  #handle(message: VideoChannelMessage): void {
    switch (message.kind) {
      case 'metadata':
        this.#teardown();
        if (this.#canvas) this.#startDecoder(message.metadata);
        else this.#pendingMetadata = message.metadata;
        return;

      case 'configuration':
        this.#write({ type: 'configuration', data: message.data });
        return;

      case 'frame':
        this.#write({
          type: 'data',
          data: message.data,
          keyframe: message.keyframe,
          pts: message.pts,
        });
        return;

      case 'ended':
        this.#teardown();
        return;
    }
  }

  #startDecoder(metadata: VideoMetadata): void {
    const canvas = this.#canvas;
    if (!canvas) return;

    try {
      if (!WebCodecsVideoDecoder.isSupported) {
        throw new Error('This build of Chromium has no WebCodecs video decoder.');
      }

      // `enableCapture` keeps the drawing buffer readable so screenshots and
      // recordings are not blank. It costs a little throughput; capture is the
      // point of this app, so it is the right trade.
      const renderer = WebGLVideoFrameRenderer.isSupported
        ? new WebGLVideoFrameRenderer(canvas, true)
        : new BitmapVideoFrameRenderer(canvas);

      // `codecId` arrives over IPC as a plain number; the branded type is
      // compile-time only and the value came from scrcpy in the first place.
      const decoder = new WebCodecsVideoDecoder({
        codec: metadata.codecId as ScrcpyVideoCodecId,
        renderer,
      });
      decoder.sizeChanged(({ width, height }) => {
        this.#size = { width, height };
        for (const listener of this.#sizeListeners) listener(this.#size);
      });

      this.#decoder = decoder;
      this.#writer = decoder.writable.getWriter();
      this.#chain = Promise.resolve();
      this.#lastSampleTime = 0;
      this.#lastSampleFrames = 0;
      this.#fps = 0;

      if (metadata.width && metadata.height) {
        this.#size = { width: metadata.width, height: metadata.height };
        for (const listener of this.#sizeListeners) listener(this.#size);
      }
    } catch (error) {
      this.#fail(error);
    }
  }

  #write(packet: ScrcpyMediaStreamPacket): void {
    const writer = this.#writer;
    if (!writer) return;

    // Serialise writes so backpressure from the decoder is respected instead of
    // queueing thousands of overlapping promises.
    this.#chain = this.#chain
      .then(() => writer.write(packet))
      .catch((error: unknown) => this.#fail(error));
  }

  #fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    for (const listener of this.#errorListeners) listener(message);
    this.#teardown();
  }

  #teardown(): void {
    const writer = this.#writer;
    this.#writer = null;
    if (writer) {
      // Releasing an errored writer throws; the stream is going away regardless.
      try {
        writer.releaseLock();
      } catch {
        /* ignore */
      }
    }

    this.#decoder?.dispose();
    this.#decoder = null;
    this.#size = { width: 0, height: 0 };
    for (const listener of this.#sizeListeners) listener(this.#size);
  }
}

export const mirror = new MirrorController();
