import type { StudioSettings } from '@shared/types.js';
import { composeFrame } from './compose.js';

const CANDIDATE_TYPES: Record<'webm' | 'mp4', string[]> = {
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'],
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
 * `captureStream()` provides video while `getUserMedia()` adds the PC
 * microphone. Device audio is intentionally never part of the recording.
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

  async start(
    source: HTMLCanvasElement,
    getSize: () => { width: number; height: number },
    getStudio: () => StudioSettings,
    fps = 60,
  ): Promise<void> {
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

    const microphone = await requestMicrophone();
    const video = this.#canvas.captureStream(fps);
    const stream = new MediaStream([...video.getVideoTracks(), ...microphone.getAudioTracks()]);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: studio.recordingBitrate,
        audioBitsPerSecond: 128_000,
      });
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      throw error;
    }

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

    // Timeslice keeps chunks flowing so a crash does not lose everything.
    try {
      recorder.start(1_000);
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      throw error;
    }
    this.#frame = requestAnimationFrame(draw);
    this.#startedAt = performance.now();
    this.#recorder = recorder;
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

    let blob: Blob;
    try {
      blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(this.#chunks, { type: this.#mimeType }));
        recorder.stop();
      });
    } finally {
      for (const track of recorder.stream.getTracks()) track.stop();
    }
    this.#chunks = [];

    return { blob, mimeType: this.#mimeType, durationMs };
  }
}

async function requestMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone recording is unavailable in this build of Windows or Chromium.');
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new Error(
        'Microphone access was denied. Allow CTRLbot Mirror to use the microphone in Windows privacy settings, then try again.',
        { cause: error },
      );
    }
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      throw new Error(
        'No PC microphone was found. Connect or enable a microphone, then try again.',
        {
          cause: error,
        },
      );
    }
    throw error;
  }
}
