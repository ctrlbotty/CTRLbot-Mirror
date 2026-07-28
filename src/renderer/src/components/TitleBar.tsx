import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../lib/api.js';
import { useStore } from '../state/store.js';
import { Badge } from './ui.js';

function WindowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick(): void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        'no-drag inline-flex h-8 w-11 items-center justify-center text-mist-300 transition-colors',
        danger ? 'hover:bg-alert-500 hover:text-white' : 'hover:bg-ink-700 hover:text-mist-100',
      )}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const devices = useStore((state) => state.devices);
  const session = useStore((state) => state.session);
  const details = useStore((state) => state.details);

  useEffect(() => {
    void api.window.isMaximized().then(setMaximized);
    return api.on.windowState(setMaximized);
  }, []);

  const authorised = devices.filter((device) => device.state === 'device').length;

  return (
    <header className="drag-region flex h-8 shrink-0 items-center justify-between border-b border-ink-800 bg-ink-950/80 pl-3">
      <div className="flex items-center gap-2.5 text-[11px]">
        <span className="font-semibold tracking-wide text-mist-200">CTRLbot Mirror</span>
        <span className="text-ink-600">|</span>
        {session ? (
          <span className="flex items-center gap-1.5 text-mist-400">
            <span className="size-1.5 rounded-full bg-signal-500" />
            Mirroring {details?.name ?? session.serial}
          </span>
        ) : (
          <span className="text-mist-400">
            {authorised === 0
              ? 'No device connected'
              : `${authorised} device${authorised === 1 ? '' : 's'} ready`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 pr-0.5">
        {session && (
          <span className="no-drag mr-1">
            <Badge tone="good">Live</Badge>
          </span>
        )}
        <div className="flex">
          <WindowButton label="Minimize" onClick={() => api.window.minimize()}>
            <Minus size={13} />
          </WindowButton>
          <WindowButton label="Maximize" onClick={() => api.window.toggleMaximize()}>
            {maximized ? <Copy size={11} /> : <Square size={11} />}
          </WindowButton>
          <WindowButton label="Close" danger onClick={() => api.window.close()}>
            <X size={14} />
          </WindowButton>
        </div>
      </div>
    </header>
  );
}
