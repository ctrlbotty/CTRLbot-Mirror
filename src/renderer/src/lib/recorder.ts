import type { StudioSettings } from '@shared/types.js';
import { composeFrame } from './compose.js';

const CANDIDATE_TYPES: Record<'webm' | 'mp4', string[]> = {
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.42E01E', 'video/mp4'],
};

/** Picks the best container this Chromium build can actually write. */
export function pickMimeType(preferred: 'webm' | 'mp4'): string | null {
  const order =
    preferred === 'mp4'
      ? [...CANDIDATE_TYPES.mp4, ...CANDIDATE_TYPES.webm]
      : [...CANDIDATE_TYPES.webm, ...CANDIDATE_TYPES.mp4];
  return order.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export interface RecorderResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/**
 * Records the composed stage — background, device frame and all — rather than
 * the bare video canvas, so what you record is what you saw.
 *
 * A compositing canvas is redrawn on every animation frame and its
 * `captureStream()` feeds a `MediaRecorder`.
 */
export class StageRecorder {
  #canvas = document.createElement('canvas');
  #recorder: MediaRecorder | null = null;
  #chunks: Blob[] = [];
  #frame: number | null = null;
  #startedAt = 0;
  #mimeType = '';

  get recording(): boolean {
    return this.#recorder !== null;
  }

  get elapsedMs(): number {
    return this.#startedAt === 0 ? 0 : performance.now() - this.#startedAt;
  }

  start(
    source: HTMLCanvasElement,
    getSize: () => { width: number; height: number },
    getStudio: () => StudioSettings,
    fps = 60,
  ): void {
    if (this.#recorder) return;

    const studio = getStudio();
    const mimeType = pickMimeType(studio.recordingFormat);
    if (!mimeType) {
      throw new Error(
        'This build of Chromium cannot record video (no supported MediaRecorder container).',
      );
    }

    // Prime the canvas so `captureStream` starts with real dimensions.
    const initial = getSize();
    composeFrame(this.#canvas, source, initial.width, initial.height, studio, 1);

    const stream = this.#canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: studio.recordingBitrate,
    });

    this.#chunks = [];
    this.#mimeType = mimeType;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.#chunks.push(event.data);
    };

    const draw = () => {
      const size = getSize();
      if (size.width > 0 && size.height > 0) {
        composeFrame(this.#canvas, source, size.width, size.height, getStudio(), 1);
      }
      this.#frame = requestAnimationFrame(draw);
    };

    this.#frame = requestAnimationFrame(draw);
    this.#startedAt = performance.now();
    this.#recorder = recorder;
    // Timeslice keeps chunks flowing so a crash does not lose everything.
    recorder.start(1_000);
  }

  async stop(): Promise<RecorderResult | null> {
    const recorder = this.#recorder;
    if (!recorder) return null;

    const durationMs = this.elapsedMs;
    this.#recorder = null;
    this.#startedAt = 0;

    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.#chunks, { type: this.#mimeType }));
      recorder.stop();
    });

    for (const track of recorder.stream.getTracks()) track.stop();
    this.#chunks = [];

    return { blob, mimeType: this.#mimeType, durationMs };
  }
}
