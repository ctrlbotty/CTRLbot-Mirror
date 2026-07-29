import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { MonitorSmartphone, Play, ShieldAlert, Usb } from 'lucide-react';
import type { StudioSettings } from '@shared/types.js';
import { frameSpec, measure } from '../lib/compose.js';
import { useDeviceInput, type Ripple } from '../lib/input.js';
import { mirror, type VideoSize } from '../lib/video.js';
import { useStore } from '../state/store.js';
import { StageToolbar } from './StageToolbar.js';
import { Button, EmptyState, Spinner } from './ui.js';

const STAGE_MARGIN = 28;

const BACKGROUNDS: Record<StudioSettings['background'], string> = {
  transparent: 'bg-[repeating-conic-gradient(#141a28_0%_25%,#0e131e_0%_50%)] bg-[length:24px_24px]',
  dark: 'bg-ink-900',
  light: 'bg-mist-100',
  gradient: 'bg-[linear-gradient(135deg,#131c33_0%,#0d1424_55%,#0a0f1c_100%)]',
  custom: '',
};

function useVideoSize(): VideoSize {
  const [size, setSize] = useState<VideoSize>(mirror.size);
  useEffect(() => mirror.onSize(setSize), []);
  return size;
}

function useContainerSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

export function Stage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const settings = useStore((state) => state.settings);
  const status = useStore((state) => state.mirrorStatus);
  const error = useStore((state) => state.mirrorError);
  const selectedSerial = useStore((state) => state.selectedSerial);
  const details = useStore((state) => state.details);
  const devices = useStore((state) => state.devices);
  const startMirror = useStore((state) => state.startMirror);
  const setPanel = useStore((state) => state.setPanel);

  const videoSize = useVideoSize();
  const containerSize = useContainerSize(containerRef);
  const studio = settings?.studio;

  useEffect(() => {
    mirror.attachCanvas(canvasRef.current);
    return () => mirror.attachCanvas(null);
  }, [status]);

  const addRipple = useCallback((ripple: Ripple) => {
    setRipples((current) => [...current, ripple]);
    setTimeout(() => {
      setRipples((current) => current.filter((item) => item.id !== ripple.id));
    }, 620);
  }, []);

  const controlEnabled = status === 'live' && Boolean(settings?.mirror.control);
  const input = useDeviceInput({
    enabled: controlEnabled,
    onRipple: studio?.showTouchIndicators ? addRipple : undefined,
  });

  /** Fits the composed frame into the available space, at capture-identical
   * proportions so the preview never lies about the exported image. */
  const layout = useMemo(() => {
    if (!studio || videoSize.width === 0 || videoSize.height === 0) return null;

    const geometry = measure(videoSize.width, videoSize.height, { ...studio, padding: 0 }, 1);
    const availableWidth = Math.max(120, containerSize.width - STAGE_MARGIN * 2);
    const availableHeight = Math.max(120, containerSize.height - STAGE_MARGIN * 2);
    const scale = Math.min(
      availableWidth / geometry.outerWidth,
      availableHeight / geometry.outerHeight,
    );

    return { geometry, scale };
  }, [containerSize.height, containerSize.width, studio, videoSize.height, videoSize.width]);

  const spec = studio ? frameSpec(studio.frame) : null;
  const selectedDevice = devices.find((device) => device.serial === selectedSerial);

  // The canvas must exist in the DOM *before* the first packet arrives: the
  // decoder binds to it, and the layout below cannot be computed until the
  // decoder has reported a size. So it is mounted as soon as a session starts
  // and only becomes visible once there is a real size to lay it out with.
  const sessionActive = status === 'starting' || status === 'live';
  const composed = status === 'live' && layout !== null && studio !== undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-ink-900">
      <div
        ref={containerRef}
        className={clsx(
          'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden',
          studio ? BACKGROUNDS[studio.background] : BACKGROUNDS.gradient,
        )}
        style={
          studio?.background === 'custom' ? { background: studio.customBackground } : undefined
        }
      >
        {sessionActive && (
          <div
            className={clsx(
              'relative',
              !composed && 'pointer-events-none absolute size-px opacity-0',
            )}
            style={
              composed && layout
                ? {
                    width: layout.geometry.outerWidth * layout.scale,
                    height: layout.geometry.outerHeight * layout.scale,
                  }
                : undefined
            }
          >
            {/* Bezel */}
            {composed && layout && spec && studio && (
              <div
                className="absolute inset-0"
                style={{
                  background: spec.body,
                  border: `${Math.max(
                    1,
                    Math.min(2, layout.geometry.bezelThickness * 0.16) * layout.scale,
                  )}px solid ${spec.rim}`,
                  borderRadius: layout.geometry.bezelRadius * layout.scale,
                  boxShadow: studio.shadow
                    ? `0 ${Math.min(layout.geometry.bezelThickness, 8) * layout.scale * 2}px ${Math.min(layout.geometry.bezelThickness, 8) * layout.scale * 6}px rgba(0,0,0,0.55)`
                    : undefined,
                }}
              />
            )}

            {/* Mirrored surface + input target */}
            <div
              tabIndex={0}
              role="application"
              aria-label="Mirrored device screen"
              className={clsx(
                'absolute overflow-hidden outline-none',
                controlEnabled ? 'cursor-default' : 'cursor-not-allowed',
              )}
              style={
                composed && layout
                  ? {
                      left: layout.geometry.screenX * layout.scale,
                      top: layout.geometry.screenY * layout.scale,
                      width: layout.geometry.screenWidth * layout.scale,
                      height: layout.geometry.screenHeight * layout.scale,
                      borderRadius: layout.geometry.screenRadius * layout.scale,
                      boxShadow:
                        layout.geometry.innerBorderThickness > 0
                          ? `0 0 0 ${layout.geometry.innerBorderThickness * layout.scale}px #000`
                          : undefined,
                    }
                  : { inset: 0 }
              }
              {...input}
            >
              <canvas ref={canvasRef} className="pixel-exact block size-full" />

              {ripples.map((ripple) => (
                <span
                  key={ripple.id}
                  className="animate-ripple pointer-events-none absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-beam-300 bg-beam-400/25"
                  style={{ left: `${ripple.x * 100}%`, top: `${ripple.y * 100}%` }}
                />
              ))}

              {composed && layout && spec && spec.punchHole !== 'none' && (
                <span
                  className="pointer-events-none absolute rounded-full bg-[#05070c]"
                  style={{
                    width: Math.max(4, layout.geometry.screenWidth * layout.scale * 0.028),
                    height: Math.max(4, layout.geometry.screenWidth * layout.scale * 0.028),
                    top: Math.max(4, layout.geometry.screenWidth * layout.scale * 0.028) * 1.7,
                    left:
                      spec.punchHole === 'center'
                        ? '50%'
                        : Math.max(4, layout.geometry.screenWidth * layout.scale * 0.028) * 1.7,
                    transform: spec.punchHole === 'center' ? 'translateX(-50%)' : undefined,
                  }}
                />
              )}
            </div>
          </div>
        )}

        {!composed && (
          <StagePlaceholder
            status={status}
            error={error}
            hasDevice={Boolean(selectedSerial)}
            deviceState={selectedDevice?.state}
            deviceName={details?.name ?? selectedSerial}
            onStart={() => void startMirror()}
            onOpenDevices={() => setPanel('devices')}
          />
        )}
      </div>

      <StageToolbar canvasRef={canvasRef} />
    </div>
  );
}

function StagePlaceholder({
  status,
  error,
  hasDevice,
  deviceState,
  deviceName,
  onStart,
  onOpenDevices,
}: {
  status: string;
  error: string | null;
  hasDevice: boolean;
  deviceState?: string;
  deviceName?: string | null;
  onStart(): void;
  onOpenDevices(): void;
}) {
  if (status === 'starting') {
    return (
      <div className="flex flex-col items-center gap-3 text-mist-300">
        <Spinner className="size-6 text-beam-400" />
        <p className="text-sm">Starting the scrcpy server on {deviceName ?? 'the device'}…</p>
        <p className="max-w-sm text-center text-xs text-mist-400">
          The first start pushes a small server to the device. Later starts take under a second.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        icon={<ShieldAlert size={30} />}
        title="Mirroring failed"
        detail={error ?? 'Something went wrong starting the session.'}
        action={
          <Button variant="primary" size="sm" icon={<Play size={14} />} onClick={onStart}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!hasDevice) {
    return (
      <EmptyState
        icon={<Usb size={30} />}
        title="No device selected"
        detail="Plug a phone in over USB with USB debugging turned on, then pick it from the Devices panel."
        action={
          <Button variant="secondary" size="sm" onClick={onOpenDevices}>
            Open Devices
          </Button>
        }
      />
    );
  }

  if (deviceState === 'unauthorized') {
    return (
      <EmptyState
        icon={<ShieldAlert size={30} />}
        title="Waiting for authorisation"
        detail="Unlock the device and tap “Allow” on the “Allow USB debugging?” prompt. Tick “Always allow” so it does not ask again."
      />
    );
  }

  return (
    <EmptyState
      icon={<MonitorSmartphone size={30} />}
      title={deviceName ? `${deviceName} is ready` : 'Device ready'}
      detail="Start mirroring to see the screen here, control it with your mouse and keyboard, and capture stills or video."
      action={
        <Button variant="primary" icon={<Play size={15} />} onClick={onStart}>
          Start mirroring
        </Button>
      }
    />
  );
}
