import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Stage } from './components/Stage.js';
import { TitleBar } from './components/TitleBar.js';
import { Toasts } from './components/Toasts.js';
import { AppsPanel } from './components/panels/AppsPanel.js';
import { DevicesPanel } from './components/panels/DevicesPanel.js';
import { FilesPanel } from './components/panels/FilesPanel.js';
import { LogcatPanel } from './components/panels/LogcatPanel.js';
import { SettingsPanel } from './components/panels/SettingsPanel.js';
import { SetupPanel } from './components/panels/SetupPanel.js';
import { ShellPanel } from './components/panels/ShellPanel.js';
import { StudioPanel } from './components/panels/StudioPanel.js';
import { VirtualPanel } from './components/panels/VirtualPanel.js';
import { Spinner } from './components/ui.js';
import { useStore, type PanelId } from './state/store.js';

// Device-scoped panels render nothing when no device is selected, so the value
// type has to allow null.
const PANELS: Record<PanelId, React.ComponentType> = {
  setup: SetupPanel,
  devices: DevicesPanel,
  studio: StudioPanel,
  apps: AppsPanel,
  files: FilesPanel,
  shell: ShellPanel,
  logcat: LogcatPanel,
  virtual: VirtualPanel,
  settings: SettingsPanel,
};

export default function App() {
  const ready = useStore((state) => state.ready);
  const panel = useStore((state) => state.panel);
  const cleanMode = useStore((state) => state.settings?.studio.cleanMode ?? false);
  const patchStudio = useStore((state) => state.patchStudio);

  // Escape is the way out of clean mode — the chrome that would normally offer
  // an exit button is exactly what clean mode hides.
  useEffect(() => {
    if (!cleanMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void patchStudio({ cleanMode: false });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cleanMode, patchStudio]);

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-ink-900">
        <Spinner className="size-6 text-beam-400" />
        <p className="text-xs text-mist-400">Starting CTRLbot Mirror…</p>
      </div>
    );
  }

  const Panel = PANELS[panel];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-900">
      {!cleanMode && <TitleBar />}

      <div className="flex min-h-0 flex-1">
        {!cleanMode && (
          <>
            <Sidebar />
            <aside className="flex w-[340px] shrink-0 flex-col border-r border-ink-800 bg-ink-900">
              <Panel />
            </aside>
          </>
        )}
        <Stage />
      </div>

      <Toasts />
    </div>
  );
}
