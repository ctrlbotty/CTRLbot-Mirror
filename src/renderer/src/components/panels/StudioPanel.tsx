import clsx from 'clsx';
import { FolderOpen, ImageDown } from 'lucide-react';
import type { FrameStyle, StageBackground } from '@shared/types.js';
import { api } from '../../lib/api.js';
import { pickMimeType } from '../../lib/recorder.js';
import { useStore } from '../../state/store.js';
import {
  Button,
  Card,
  Field,
  Panel,
  Row,
  SectionLabel,
  Select,
  Slider,
  TextInput,
  Toggle,
} from '../ui.js';

const FRAMES: Array<{ id: FrameStyle; label: string; radius: string; border: string }> = [
  { id: 'none', label: 'None', radius: 'rounded-sm', border: 'border-dashed' },
  { id: 'flat', label: 'Flat', radius: 'rounded-md', border: 'border-solid' },
  { id: 'rounded', label: 'Rounded', radius: 'rounded-xl', border: 'border-solid border-2' },
  { id: 'pixel', label: 'Pixel', radius: 'rounded-2xl', border: 'border-solid border-2' },
  { id: 'galaxy', label: 'Galaxy', radius: 'rounded-[14px]', border: 'border-solid' },
];

const BACKGROUNDS: Array<{ id: StageBackground; label: string; swatch: string }> = [
  { id: 'gradient', label: 'Gradient', swatch: 'linear-gradient(135deg,#131c33,#0a0f1c)' },
  { id: 'dark', label: 'Dark', swatch: '#0b0f19' },
  { id: 'light', label: 'Light', swatch: '#eef2f8' },
  {
    id: 'transparent',
    label: 'Checker',
    swatch: 'repeating-conic-gradient(#141a28 0% 25%,#0e131e 0% 50%)',
  },
  {
    id: 'custom',
    label: 'Custom',
    swatch: 'conic-gradient(#f87171,#fbbf24,#4ade80,#38bdf8,#a78bfa,#f87171)',
  },
];

export function StudioPanel() {
  const settings = useStore((state) => state.settings);
  const patchStudio = useStore((state) => state.patchStudio);
  const patchMirror = useStore((state) => state.patchMirrorOptions);
  const patchSettings = useStore((state) => state.patchSettings);
  const pushToast = useStore((state) => state.pushToast);
  const live = useStore((state) => state.mirrorStatus === 'live');

  if (!settings) return null;
  const { studio, mirror } = settings;

  const mp4Supported = pickMimeType('mp4')?.startsWith('video/mp4') ?? false;

  return (
    <Panel title="Studio" subtitle="How captures look">
      <SectionLabel>Device frame</SectionLabel>
      <div className="grid grid-cols-5 gap-1.5">
        {FRAMES.map((frame) => (
          <button
            key={frame.id}
            onClick={() => void patchStudio({ frame: frame.id })}
            className={clsx(
              'flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors',
              studio.frame === frame.id
                ? 'border-beam-500/60 bg-beam-500/10'
                : 'border-ink-700 hover:border-ink-600 hover:bg-ink-800',
            )}
          >
            <span
              className={clsx('h-7 w-4 border-ink-500 bg-ink-700', frame.radius, frame.border)}
            />
            <span className="text-[9px] text-mist-400">{frame.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <SectionLabel>Backdrop</SectionLabel>
        <div className="grid grid-cols-5 gap-1.5">
          {BACKGROUNDS.map((background) => (
            <button
              key={background.id}
              onClick={() => void patchStudio({ background: background.id })}
              className={clsx(
                'flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors',
                studio.background === background.id
                  ? 'border-beam-500/60 bg-beam-500/10'
                  : 'border-ink-700 hover:border-ink-600 hover:bg-ink-800',
              )}
            >
              <span
                className="size-6 rounded-md border border-ink-600"
                style={{ background: background.swatch, backgroundSize: '10px 10px' }}
              />
              <span className="text-[9px] text-mist-400">{background.label}</span>
            </button>
          ))}
        </div>

        {studio.background === 'custom' && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={studio.customBackground}
              onChange={(event) => void patchStudio({ customBackground: event.target.value })}
              className="h-9 w-12 cursor-pointer rounded-lg border border-ink-700 bg-ink-900 p-1"
            />
            <TextInput
              value={studio.customBackground}
              onChange={(event) => void patchStudio({ customBackground: event.target.value })}
            />
          </div>
        )}
      </div>

      <Card className="mt-4">
        <Row label="Drop shadow">
          <Toggle checked={studio.shadow} onChange={(shadow) => void patchStudio({ shadow })} />
        </Row>
        <Row label="Touch ripples" hint="Shows where you tapped — useful in walkthroughs">
          <Toggle
            checked={studio.showTouchIndicators}
            onChange={(showTouchIndicators) => void patchStudio({ showTouchIndicators })}
          />
        </Row>
        <Row label="Frame in captures" hint="Off exports the raw screen at native resolution">
          <Toggle
            checked={studio.includeFrameInCapture}
            onChange={(includeFrameInCapture) => void patchStudio({ includeFrameInCapture })}
          />
        </Row>
        <div className="pt-2">
          <Field label={`Padding — ${studio.padding}px`}>
            <Slider
              value={studio.padding}
              min={0}
              max={160}
              step={4}
              onChange={(padding) => void patchStudio({ padding })}
              format={(value) => `${value}px`}
            />
          </Field>
        </div>
      </Card>

      <div className="mt-4">
        <SectionLabel>Capture</SectionLabel>
        <Card className="space-y-3">
          <Field label="Screenshot scale">
            <Select
              value={studio.screenshotScale}
              onChange={(event) =>
                void patchStudio({ screenshotScale: Number(event.target.value) as 1 | 2 | 3 })
              }
            >
              <option value={1}>1× — mirrored size</option>
              <option value={2}>2× — crisp for slides</option>
              <option value={3}>3× — print / zoomed detail</option>
            </Select>
          </Field>

          <Field
            label="Recording format"
            hint={mp4Supported ? undefined : 'MP4 is unavailable in this build; WebM will be used.'}
          >
            <Select
              value={studio.recordingFormat}
              onChange={(event) =>
                void patchStudio({ recordingFormat: event.target.value as 'webm' | 'mp4' })
              }
            >
              <option value="webm">WebM (VP9)</option>
              <option value="mp4" disabled={!mp4Supported}>
                MP4 (H.264)
              </option>
            </Select>
          </Field>

          <Field
            label={`Recording bitrate — ${Math.round(studio.recordingBitrate / 1_000_000)} Mbps`}
          >
            <Slider
              value={studio.recordingBitrate}
              min={2_000_000}
              max={40_000_000}
              step={1_000_000}
              onChange={(recordingBitrate) => void patchStudio({ recordingBitrate })}
              format={(value) => `${Math.round(value / 1_000_000)}M`}
            />
          </Field>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              icon={<FolderOpen size={13} />}
              onClick={() => void api.capture.revealFolder()}
            >
              Open folder
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              icon={<ImageDown size={13} />}
              onClick={async () => {
                const folder = await api.capture.chooseFolder();
                if (folder) {
                  await patchSettings({ captureDirectory: folder });
                  pushToast({ level: 'success', title: 'Capture folder updated', detail: folder });
                }
              }}
            >
              Change
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <SectionLabel>Stream quality</SectionLabel>
        <p className="mb-2 text-[11px] leading-relaxed text-mist-400">
          {live
            ? 'Changes apply the next time you start mirroring.'
            : 'Applies when you start mirroring.'}
        </p>
        <Card className="space-y-3">
          <Field
            label={
              mirror.maxSize === 0 ? 'Resolution — native' : `Resolution cap — ${mirror.maxSize}px`
            }
          >
            <Slider
              value={mirror.maxSize}
              min={0}
              max={2560}
              step={160}
              onChange={(maxSize) => void patchMirror({ maxSize })}
              format={(value) => (value === 0 ? 'native' : `${value}`)}
            />
          </Field>

          <Field label={`Bitrate — ${Math.round(mirror.videoBitRate / 1_000_000)} Mbps`}>
            <Slider
              value={mirror.videoBitRate}
              min={1_000_000}
              max={32_000_000}
              step={1_000_000}
              onChange={(videoBitRate) => void patchMirror({ videoBitRate })}
              format={(value) => `${Math.round(value / 1_000_000)}M`}
            />
          </Field>

          <Field label={`Frame rate — ${mirror.maxFps || 60} fps`}>
            <Slider
              value={mirror.maxFps || 60}
              min={15}
              max={120}
              step={5}
              onChange={(maxFps) => void patchMirror({ maxFps })}
            />
          </Field>

          <Field label="Video codec" hint="H.265 and AV1 need device and GPU support on both ends.">
            <Select
              value={mirror.videoCodec}
              onChange={(event) =>
                void patchMirror({ videoCodec: event.target.value as typeof mirror.videoCodec })
              }
            >
              <option value="h264">H.264 — most compatible</option>
              <option value="h265">H.265 — better quality per bit</option>
              <option value="av1">AV1 — newest devices only</option>
            </Select>
          </Field>

          <Row label="Show touches on device" hint="Android's own tap dots, baked into the stream">
            <Toggle
              checked={mirror.showTouches}
              onChange={(showTouches) => void patchMirror({ showTouches })}
            />
          </Row>
          <Row label="Keep device awake">
            <Toggle
              checked={mirror.stayAwake}
              onChange={(stayAwake) => void patchMirror({ stayAwake })}
            />
          </Row>
          <Row label="Blank device screen" hint="Mirrors normally while the phone looks off">
            <Toggle
              checked={mirror.turnScreenOffOnStart}
              onChange={(turnScreenOffOnStart) => void patchMirror({ turnScreenOffOnStart })}
            />
          </Row>
          <Row label="Allow control" hint="Off gives a look-but-do-not-touch session">
            <Toggle
              checked={mirror.control}
              onChange={(control) => void patchMirror({ control })}
            />
          </Row>
        </Card>
      </div>
    </Panel>
  );
}
