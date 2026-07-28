import clsx from 'clsx';
import {
  Camera,
  FolderTree,
  LayoutGrid,
  MonitorSmartphone,
  ScrollText,
  Settings,
  Smartphone,
  TerminalSquare,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore, type PanelId } from '../state/store.js';

interface NavItem {
  id: PanelId;
  label: string;
  icon: LucideIcon;
  /** Panels that only make sense with a device selected. */
  needsDevice?: boolean;
}

const PRIMARY: NavItem[] = [
  { id: 'devices', label: 'Devices', icon: Smartphone },
  { id: 'studio', label: 'Studio', icon: Camera, needsDevice: true },
  { id: 'apps', label: 'Apps', icon: LayoutGrid, needsDevice: true },
  { id: 'files', label: 'Files', icon: FolderTree, needsDevice: true },
  { id: 'shell', label: 'Shell', icon: TerminalSquare, needsDevice: true },
  { id: 'logcat', label: 'Logcat', icon: ScrollText, needsDevice: true },
  { id: 'virtual', label: 'Virtual devices', icon: MonitorSmartphone },
];

const SECONDARY: NavItem[] = [
  { id: 'setup', label: 'Setup', icon: Wrench },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function NavButton({ item }: { item: NavItem }) {
  const panel = useStore((state) => state.panel);
  const setPanel = useStore((state) => state.setPanel);
  const hasDevice = useStore((state) => state.selectedSerial !== null);
  const envReady = useStore((state) => Boolean(state.env?.adb.serverRunning));

  const disabled = (item.needsDevice && !hasDevice) || (item.id !== 'setup' && !envReady);
  const active = panel === item.id;
  const Icon = item.icon;

  return (
    <button
      title={
        disabled && item.needsDevice && !hasDevice
          ? `${item.label} — select a device first`
          : item.label
      }
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={() => setPanel(item.id)}
      className={clsx(
        'relative flex size-11 items-center justify-center rounded-xl transition-colors',
        active
          ? 'bg-beam-500/15 text-beam-300'
          : disabled
            ? 'text-ink-600'
            : 'text-mist-400 hover:bg-ink-800 hover:text-mist-100',
      )}
    >
      {active && (
        <span className="absolute top-1/2 -left-2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-beam-400" />
      )}
      <Icon size={19} strokeWidth={1.75} />
    </button>
  );
}

export function Sidebar() {
  const env = useStore((state) => state.env);
  const adbReady = Boolean(env?.adb.serverRunning);

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-ink-800 bg-ink-950/60 py-3">
      {PRIMARY.map((item) => (
        <NavButton key={item.id} item={item} />
      ))}

      <div className="flex-1" />

      <div className="mb-1 flex flex-col items-center gap-1">
        <span
          title={adbReady ? 'ADB server running' : 'ADB server not running'}
          className={clsx(
            'size-1.5 rounded-full',
            adbReady ? 'bg-signal-500' : 'bg-warn-400 animate-pulse',
          )}
        />
      </div>

      {SECONDARY.map((item) => (
        <NavButton key={item.id} item={item} />
      ))}
    </nav>
  );
}
