import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useStore } from '../state/store.js';

const TONES = {
  info: { icon: Info, ring: 'border-beam-500/40', tint: 'text-beam-300' },
  success: { icon: CheckCircle2, ring: 'border-signal-500/40', tint: 'text-signal-400' },
  warning: { icon: AlertTriangle, ring: 'border-warn-400/40', tint: 'text-warn-400' },
  error: { icon: XCircle, ring: 'border-alert-500/40', tint: 'text-alert-400' },
} as const;

export function Toasts() {
  const toasts = useStore((state) => state.toasts);
  const dismiss = useStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const tone = TONES[toast.level];
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            role="status"
            className={clsx(
              'animate-rise pointer-events-auto flex gap-3 rounded-xl border bg-ink-850/95 p-3',
              'shadow-lg shadow-black/40 backdrop-blur',
              tone.ring,
            )}
          >
            <Icon size={16} className={clsx('mt-0.5 shrink-0', tone.tint)} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-mist-100">{toast.title}</p>
              {toast.detail && (
                <p className="selectable mt-1 text-[11px] leading-snug break-words text-mist-400">
                  {toast.detail}
                </p>
              )}
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="h-fit shrink-0 rounded p-0.5 text-mist-400 hover:text-mist-100"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
