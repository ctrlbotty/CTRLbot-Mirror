import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Camera,
  ChevronLeft,
  CircleStop,
  Circle,
  Expand,
  Home,
  Lock,
  Mic,
  RotateCw,
  Square,
  Volume1,
  Volume2,
} from 'lucide-react';
import type { ControlCommand } from '@shared/types.js';
import { api, errorText } from '../lib/api.js';
import { composeToBlob } from '../lib/compose.js';
import { AndroidKey } from '../lib/keymap.js';
import { StageRecorder } from '../lib/recorder.js';
import { mirror } from '../lib/video.js';
import { useStore } from '../state/store.js';
import { Badge, IconButton } from './ui.js';

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function StageToolbar({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const recorder = useRef(new StageRecorder());
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ fps: 0, framesRendered: 0, framesSkipped: 0 });

  const status = useStore((state) => state.mirrorStatus);
  const session = useStore((state) => state.session);
  const settings = useStore((state) => state.settings);
  const details = useStore((state) => state.details);
  const stopMirror = useStore((state) => state.stopMirror);
  const pushToast = useStore((state) => state.pushToast);
  const patchStudio = useStore((state) => state.patchStudio);

  const live = status === 'live';
  const studio = settings?.studio;
  const controlEnabled = live && Boolean(settings?.mirror.control);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setStats(mirror.stats()), 500);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(recorder.current.elapsedMs), 250);
    return () => clearInterval(timer);
  }, [recording]);

  const send = useCallback((command: ControlCommand) => {
    void api.mirror.control(command).catch(() => undefined);
  }, []);

  const tapKey = useCallback(
    (keyCode: number) => {
      send({ type: 'key', action: 'down', keyCode, repeat: 0, metaState: 0 });
      send({ type: 'key', action: 'up', keyCode, repeat: 0, metaState: 0 });
    },
    [send],
  );

  const screenshot = useCallback(async () => {
    const canvas = canvasRef.current;
    const size = mirror.size;
    if (!canvas || !studio || size.width === 0) return;

    setBusy(true);
    try {
      const blob = studio.includeFrameInCapture
        ? await composeToBlob(canvas, size.width, size.height, studio, studio.screenshotScale)
        : await mirror.snapshot();

      if (!blob) throw new Error('The frame could not be read from the canvas.');

      const data = new Uint8Array(await blob.arrayBuffer());
      const result = await api.capture.saveImage(
        data,
        details?.model ?? session?.serial ?? 'device',
      );

      if (result.ok) {
        pushToast({ level: 'success', title: 'Screenshot saved', detail: result.path });
      } else {
        pushToast({ level: 'error', title: 'Screenshot failed', detail: result.message });
      }
    } catch (error) {
      pushToast({ level: 'error', title: 'Screenshot failed', detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }, [canvasRef, details?.model, pushToast, session?.serial, studio]);

  const finishRecording = useCallback(
    async (mirrorEnded = false) => {
      setBusy(true);
      try {
        const result = await recorder.current.stop();
        if (!result) return;

        const data = new Uint8Array(await result.blob.arrayBuffer());
        const container = result.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        const saved = await api.capture.saveVideo(
          data,
          details?.model ?? session?.serial ?? 'device',
          container,
        );

        if (saved.ok) {
          pushToast({
            level: 'success',
            title: `${mirrorEnded ? 'Mirroring ended — recording saved' : 'Recording saved'} (${formatDuration(result.durationMs)})`,
            detail: saved.path,
          });
        } else {
          pushToast({ level: 'error', title: 'Recording failed to save', detail: saved.message });
        }
      } catch (error) {
        pushToast({ level: 'error', title: 'Recording failed', detail: errorText(error) });
      } finally {
        setRecording(false);
        setElapsed(0);
        setBusy(false);
      }
    },
    [details?.model, pushToast, session?.serial],
  );

  const toggleRecording = useCallback(async () => {
    if (recording) {
      await finishRecording();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !studio) return;

    setBusy(true);
    try {
      await recorder.current.start(
        canvas,
        () => mirror.size,
        () => useStore.getState().settings?.studio ?? studio,
        Math.min(60, settings?.mirror.maxFps || 60),
      );
      setRecording(true);
      pushToast({ level: 'info', title: 'Recording started with PC microphone' });
    } catch (error) {
      pushToast({ level: 'error', title: 'Could not start recording', detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }, [canvasRef, finishRecording, pushToast, recording, settings?.mirror.maxFps, studio]);

  useEffect(() => {
    if (recording && !live && !busy) void finishRecording(true);
  }, [busy, finishRecording, live, recording]);

  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-t border-ink-800 bg-ink-950/70 px-3">
      <div className="flex items-center gap-0.5">
        <IconButton
          label="Back"
          disabled={!controlEnabled}
          onClick={() => {
            send({ type: 'backOrScreenOn', action: 'down' });
            send({ type: 'backOrScreenOn', action: 'up' });
          }}
        >
          <ChevronLeft size={18} />
        </IconButton>
        <IconButton label="Home" disabled={!controlEnabled} onClick={() => tapKey(AndroidKey.Home)}>
          <Home size={17} />
        </IconButton>
        <IconButton
          label="Recent apps"
          disabled={!controlEnabled}
          onClick={() => tapKey(AndroidKey.AppSwitch)}
        >
          <Square size={14} />
        </IconButton>

        <span className="mx-1.5 h-5 w-px bg-ink-700" />

        <IconButton
          label="Notification shade"
          disabled={!controlEnabled}
          onClick={() => send({ type: 'expandNotificationPanel' })}
        >
          <Bell size={16} />
        </IconButton>
        <IconButton
          label="Rotate"
          disabled={!controlEnabled}
          onClick={() => send({ type: 'rotateDevice' })}
        >
          <RotateCw size={16} />
        </IconButton>
        <IconButton
          label="Volume down"
          disabled={!controlEnabled}
          onClick={() => tapKey(AndroidKey.VolumeDown)}
        >
          <Volume1 size={16} />
        </IconButton>
        <IconButton
          label="Volume up"
          disabled={!controlEnabled}
          onClick={() => tapKey(AndroidKey.VolumeUp)}
        >
          <Volume2 size={16} />
        </IconButton>
        <IconButton
          label="Power / lock"
          disabled={!controlEnabled}
          onClick={() => tapKey(AndroidKey.Power)}
        >
          <Lock size={15} />
        </IconButton>
      </div>

      <div className="flex flex-1 items-center justify-center gap-2 text-[11px] text-mist-400">
        {live && session ? (
          <>
            <span className="font-mono">
              {mirror.size.width}×{mirror.size.height}
            </span>
            <span className="text-ink-600">·</span>
            <span className="uppercase">{session.metadata.codecName}</span>
            <span className="text-ink-600">·</span>
            <span className="font-mono tabular-nums">{stats.fps} fps</span>
            {stats.framesSkipped > 0 && (
              <>
                <span className="text-ink-600">·</span>
                <span className="text-warn-400">{stats.framesSkipped} dropped</span>
              </>
            )}
            {!controlEnabled && <Badge tone="warn">View only</Badge>}
          </>
        ) : (
          <span>Not mirroring</span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {recording && (
          <span className="mr-1 flex items-center gap-1.5 rounded-lg bg-alert-500/15 px-2 py-1 text-[11px] font-semibold text-alert-400">
            <span className="size-1.5 animate-pulse rounded-full bg-alert-500" />
            <Mic size={11} />
            <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>
          </span>
        )}

        <IconButton label="Screenshot" disabled={!live || busy} onClick={() => void screenshot()}>
          <Camera size={17} />
        </IconButton>
        <IconButton
          label={recording ? 'Stop recording' : 'Record with PC microphone'}
          tone={recording ? 'danger' : 'default'}
          disabled={(!live && !recording) || busy}
          onClick={() => void toggleRecording()}
        >
          {recording ? <CircleStop size={18} /> : <Circle size={16} />}
        </IconButton>
        <IconButton
          label="Clean mode (hide app chrome)"
          active={studio?.cleanMode}
          disabled={!live}
          onClick={() => void patchStudio({ cleanMode: !studio?.cleanMode })}
        >
          <Expand size={16} />
        </IconButton>

        <span className="mx-1.5 h-5 w-px bg-ink-700" />

        <IconButton
          label="Stop mirroring"
          tone="danger"
          disabled={!live}
          onClick={() => void stopMirror()}
        >
          <CircleStop size={18} />
        </IconButton>
      </div>
    </div>
  );
}
