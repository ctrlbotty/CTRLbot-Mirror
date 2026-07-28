import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, MonitorSmartphone, Play, RefreshCw } from 'lucide-react';
import type { AvdEntry } from '@shared/types.js';
import { api, errorText } from '../../lib/api.js';
import { useStore } from '../../state/store.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Panel,
  SectionLabel,
  Spinner,
} from '../ui.js';

const STUDIO_URL = 'https://developer.android.com/studio';

export function VirtualPanel() {
  const env = useStore((state) => state.env);
  const pushToast = useStore((state) => state.pushToast);
  const [avds, setAvds] = useState<AvdEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAvds(await api.avd.list());
    } catch (error) {
      pushToast({ level: 'error', title: 'Could not list AVDs', detail: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasEmulator = Boolean(env?.emulatorPath);

  return (
    <Panel
      title="Virtual devices"
      subtitle="Android emulator (AVD)"
      actions={
        <IconButton label="Refresh" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
        </IconButton>
      }
    >
      <Card className="mb-4 border-beam-500/25 bg-beam-500/5">
        <p className="text-[11px] leading-relaxed text-mist-300">
          A virtual device is useful when you need a specific Android version, a screen size you do
          not own, or a clean profile for a demo. Once it boots it behaves exactly like a physical
          phone here — same mirroring, same control, same capture tools.
        </p>
      </Card>

      {!hasEmulator ? (
        <EmptyState
          icon={<MonitorSmartphone size={28} />}
          title="No Android emulator found"
          detail="The emulator ships with Android Studio. Install it, add a virtual device in Device Manager, then come back — CTRLbot Mirror will pick it up automatically."
          action={
            <Button
              size="sm"
              icon={<ExternalLink size={13} />}
              onClick={() => void api.app.openExternal(STUDIO_URL)}
            >
              Get Android Studio
            </Button>
          }
        />
      ) : loading && avds.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-xs text-mist-400">
          <Spinner className="size-4" /> Looking for virtual devices…
        </div>
      ) : avds.length === 0 ? (
        <EmptyState
          icon={<MonitorSmartphone size={28} />}
          title="No virtual devices defined"
          detail="Create one in Android Studio → Device Manager, then refresh this list."
        />
      ) : (
        <ul className="space-y-2">
          {avds.map((avd) => (
            <li key={avd.name}>
              <Card className="flex items-center gap-3">
                <MonitorSmartphone size={17} className="shrink-0 text-beam-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-mist-100">
                    {avd.name.replace(/_/g, ' ')}
                  </p>
                  {avd.running && (
                    <span className="mt-1 inline-block">
                      <Badge tone="good">running</Badge>
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  icon={<Play size={13} />}
                  onClick={async () => {
                    const result = await api.avd.start(avd.name);
                    pushToast({
                      level: result.ok ? 'info' : 'error',
                      title: result.ok ? 'Booting virtual device' : 'Could not start',
                      detail: result.ok
                        ? 'It appears in Devices once it has booted — usually 20–60 seconds.'
                        : result.error,
                    });
                  }}
                >
                  Start
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <SectionLabel>Where the SDK was found</SectionLabel>
        <Card>
          <p className="selectable font-mono text-[10px] break-all text-mist-400">
            {env?.androidSdkRoot ?? 'No Android SDK on this machine'}
          </p>
        </Card>
      </div>
    </Panel>
  );
}
