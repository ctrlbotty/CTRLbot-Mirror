import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { ControlCommand } from '@shared/types.js';
import { api } from './api.js';
import { AndroidKey, androidKeyFor, isPrintable, metaStateFor } from './keymap.js';
import { mirror } from './video.js';

/** `android.view.MotionEvent` button bits, as scrcpy expects them. */
const BUTTON_PRIMARY = 1;

export interface Ripple {
  id: number;
  /** Position as a fraction of the surface, so the overlay scales with it. */
  x: number;
  y: number;
}

interface Options {
  enabled: boolean;
  onRipple?(ripple: Ripple): void;
}

let rippleId = 0;

/**
 * Turns mouse, touch and keyboard input on the mirrored surface into scrcpy
 * control messages.
 *
 * Pointer moves are coalesced onto animation frames: a mouse can fire several
 * hundred `pointermove` events a second and forwarding each one floods the
 * control socket without making the drag any smoother.
 */
export function useDeviceInput({ enabled, onRipple }: Options) {
  const activePointers = useRef(new Set<number>());
  const pendingMove = useRef<ControlCommand | null>(null);
  const frame = useRef<number | null>(null);

  const send = useCallback((command: ControlCommand) => {
    void api.mirror.control(command).catch(() => {
      /* the session may have ended between events */
    });
  }, []);

  const flush = useCallback(() => {
    frame.current = null;
    const command = pendingMove.current;
    pendingMove.current = null;
    if (command) send(command);
  }, [send]);

  const queueMove = useCallback(
    (command: ControlCommand) => {
      pendingMove.current = command;
      frame.current ??= requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  /** Client coordinates → device pixels. Returns null when there is no video. */
  const locate = useCallback((event: { clientX: number; clientY: number }, target: Element) => {
    const { width, height } = mirror.size;
    if (!width || !height) return null;

    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;

    return {
      x: Math.max(0, Math.min(width - 1, Math.round(fx * width))),
      y: Math.max(0, Math.min(height - 1, Math.round(fy * height))),
      fx,
      fy,
      videoWidth: width,
      videoHeight: height,
    };
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const target = event.currentTarget;
      target.focus();

      // scrcpy's own convention: right button goes Back, middle goes Home.
      if (event.button === 2) {
        send({ type: 'backOrScreenOn', action: 'down' });
        send({ type: 'backOrScreenOn', action: 'up' });
        return;
      }
      if (event.button === 1) {
        send({ type: 'key', action: 'down', keyCode: AndroidKey.Home, repeat: 0, metaState: 0 });
        send({ type: 'key', action: 'up', keyCode: AndroidKey.Home, repeat: 0, metaState: 0 });
        return;
      }
      if (event.button !== 0) return;

      const point = locate(event, target);
      if (!point) return;

      target.setPointerCapture(event.pointerId);
      activePointers.current.add(event.pointerId);

      const pointerIndex = activePointers.current.size === 1 ? 0 : event.pointerId;
      send({
        type: 'touch',
        action: 'down',
        pointerId: pointerIndex,
        x: point.x,
        y: point.y,
        videoWidth: point.videoWidth,
        videoHeight: point.videoHeight,
        pressure: event.pressure > 0 ? event.pressure : 1,
        buttons: BUTTON_PRIMARY,
      });

      onRipple?.({ id: ++rippleId, x: point.fx, y: point.fy });
    },
    [enabled, locate, onRipple, send],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !activePointers.current.has(event.pointerId)) return;

      const point = locate(event, event.currentTarget);
      if (!point) return;

      const [first] = activePointers.current;
      queueMove({
        type: 'touch',
        action: 'move',
        pointerId: event.pointerId === first ? 0 : event.pointerId,
        x: point.x,
        y: point.y,
        videoWidth: point.videoWidth,
        videoHeight: point.videoHeight,
        pressure: event.pressure > 0 ? event.pressure : 1,
        buttons: BUTTON_PRIMARY,
      });
    },
    [enabled, locate, queueMove],
  );

  const endPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !activePointers.current.has(event.pointerId)) return;

      const point = locate(event, event.currentTarget);
      const [first] = activePointers.current;
      const pointerIndex = event.pointerId === first ? 0 : event.pointerId;
      activePointers.current.delete(event.pointerId);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!point) return;

      // Flush any queued move so the release lands at the final position.
      if (pendingMove.current) {
        send(pendingMove.current);
        pendingMove.current = null;
      }

      send({
        type: 'touch',
        action: 'up',
        pointerId: pointerIndex,
        x: point.x,
        y: point.y,
        videoWidth: point.videoWidth,
        videoHeight: point.videoHeight,
        pressure: 0,
        buttons: 0,
      });
    },
    [enabled, locate, send],
  );

  const onWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      if (!enabled) return;
      const point = locate(event, event.currentTarget);
      if (!point) return;

      // scrcpy takes scroll as a -1..1 float; deltas arrive in pixels or lines.
      const unit = event.deltaMode === 0 ? 120 : 1;
      send({
        type: 'scroll',
        x: point.x,
        y: point.y,
        videoWidth: point.videoWidth,
        videoHeight: point.videoHeight,
        scrollX: Math.max(-1, Math.min(1, -event.deltaX / unit)),
        scrollY: Math.max(-1, Math.min(1, -event.deltaY / unit)),
        buttons: 0,
      });
    },
    [enabled, locate, send],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      const native = event.nativeEvent;

      // Ctrl+V pastes the host clipboard into the device.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void navigator.clipboard
          .readText()
          .then((text) => text && send({ type: 'setClipboard', text, paste: true }))
          .catch(() => undefined);
        return;
      }

      const keyCode = androidKeyFor(event.code);
      if (keyCode !== null) {
        event.preventDefault();
        send({
          type: 'key',
          action: 'down',
          keyCode,
          repeat: event.repeat ? 1 : 0,
          metaState: metaStateFor(native),
        });
        return;
      }

      if (isPrintable(native)) {
        event.preventDefault();
        send({ type: 'text', text: event.key });
      }
    },
    [enabled, send],
  );

  const onKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      const keyCode = androidKeyFor(event.code);
      if (keyCode === null) return;

      event.preventDefault();
      send({
        type: 'key',
        action: 'up',
        keyCode,
        repeat: 0,
        metaState: metaStateFor(event.nativeEvent),
      });
    },
    [enabled, send],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onWheel,
    onKeyDown,
    onKeyUp,
    onContextMenu: useCallback((event: React.MouseEvent) => event.preventDefault(), []),
  };
}
