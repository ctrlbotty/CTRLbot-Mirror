import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, PackagePlus, Play, RefreshCw, Trash2 } from 'lucide-react';
import type { AppEntry } from '@shared/types.js';
import { api, errorText } from '../../lib/api.js';
import { useStore } from '../../state/store.js';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Panel,
  Row,
  Spinner,
  TextInput,
  Toggle,
} from '../ui.js';

export function AppsPanel() {
  const serial = useStore((state) => state.selectedSerial);
  const pushToast = useStore((state) => state.pushToast);

  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeSystem, setIncludeSystem] = useState(false);
  const [query, setQuery] = useState('');
  const [busyPackage, setBusyPackage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!serial) return;
    setLoading(true);
    try {
      setApps(await api.apps.list(serial, includeSystem));
    } catch (error) {
      pushToast({ level: 'error', title: 'Could not list apps', detail: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [includeSystem, pushToast, serial]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter(
      (app) =>
        app.packageName.toLowerCase().includes(needle) || app.label.toLowerCase().includes(needle),
    );
  }, [apps, query]);

  const act = async (
    packageName: string,
    action: () => Promise<{ ok: boolean; output: string; error?: string }>,
    title: string,
    reload = false,
  ) => {
    setBusyPackage(packageName);
    try {
      const result = await action();
      pushToast({
        level: result.ok ? 'success' : 'error',
        title: result.ok ? title : `${title} failed`,
        detail: result.output || result.error,
      });
      if (result.ok && reload) await load();
    } catch (error) {
      pushToast({ level: 'error', title: `${title} failed`, detail: errorText(error) });
    } finally {
      setBusyPackage(null);
    }
  };

  if (!serial) return null;

  return (
    <Panel
      title="Apps"
      subtitle={`${filtered.length} package${filtered.length === 1 ? '' : 's'}`}
      actions={
        <>
          <IconButton
            label="Install APK"
            onClick={() => void act('', () => api.apps.install(serial, []), 'APK installed', true)}
          >
            <PackagePlus size={15} />
          </IconButton>
          <IconButton label="Refresh" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
          </IconButton>
        </>
      }
    >
      <TextInput
        placeholder="Filter packages…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <Row label="Include system apps">
        <Toggle checked={includeSystem} onChange={setIncludeSystem} />
      </Row>

      {loading && apps.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-xs text-mist-400">
          <Spinner className="size-4" /> Reading the package list…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid size={26} />}
          title={query ? 'Nothing matches' : 'No user apps found'}
          detail={
            query ? 'Try a shorter search.' : 'Turn on “Include system apps” to see the rest.'
          }
        />
      ) : (
        <ul className="mt-1 space-y-1">
          {filtered.map((app) => (
            <li
              key={app.packageName}
              className="group rounded-lg border border-transparent px-2 py-2 hover:border-ink-700 hover:bg-ink-850"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-xs font-medium text-mist-100">
                    {app.label}
                    {app.system && <Badge>sys</Badge>}
                  </p>
                  <p className="selectable truncate font-mono text-[10px] text-mist-400">
                    {app.packageName}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton
                    label="Launch"
                    disabled={busyPackage === app.packageName}
                    onClick={() =>
                      void act(
                        app.packageName,
                        () => api.apps.launch(serial, app.packageName),
                        `Launched ${app.label}`,
                      )
                    }
                  >
                    <Play size={14} />
                  </IconButton>
                  <IconButton
                    label="Force stop"
                    disabled={busyPackage === app.packageName}
                    onClick={() =>
                      void act(
                        app.packageName,
                        () => api.apps.forceStop(serial, app.packageName),
                        `Stopped ${app.label}`,
                      )
                    }
                  >
                    <span className="text-[10px] font-bold">■</span>
                  </IconButton>
                  <IconButton
                    label="Clear data"
                    disabled={busyPackage === app.packageName}
                    onClick={() =>
                      void act(
                        app.packageName,
                        () => api.apps.clearData(serial, app.packageName),
                        `Cleared ${app.label}`,
                      )
                    }
                  >
                    <span className="text-[10px] font-bold">⌫</span>
                  </IconButton>
                  <IconButton
                    label="Uninstall"
                    tone="danger"
                    disabled={busyPackage === app.packageName}
                    onClick={() =>
                      void act(
                        app.packageName,
                        () => api.apps.uninstall(serial, app.packageName),
                        `Uninstalled ${app.label}`,
                        true,
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        size="sm"
        className="mt-4 w-full"
        icon={<PackagePlus size={14} />}
        onClick={() => void act('', () => api.apps.install(serial, []), 'APK installed', true)}
      >
        Install APK…
      </Button>
    </Panel>
  );
}
