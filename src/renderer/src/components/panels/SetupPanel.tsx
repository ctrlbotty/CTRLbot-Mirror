import { useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  Circle,
  Download,
  FileText,
  FolderSearch,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { api, errorText } from '../../lib/api.js';
import { useStore } from '../../state/store.js';
import { Button, Card, Panel, SectionLabel, Spinner } from '../ui.js';

function bytes(value: number): string {
  if (value <= 0) return '—';
  const mb = value / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

type StepState = 'done' | 'active' | 'todo' | 'warn';

function Step({
  index,
  state,
  title,
  children,
}: {
  index: number;
  state: StepState;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={clsx(
            'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
            state === 'done' && 'bg-signal-500/20 text-signal-400',
            state === 'active' && 'bg-beam-500 text-ink-950',
            state === 'warn' && 'bg-warn-400/20 text-warn-400',
            state === 'todo' && 'bg-ink-700 text-mist-400',
          )}
        >
          {state === 'done' ? (
            <Check size={13} />
          ) : state === 'warn' ? (
            <TriangleAlert size={12} />
          ) : (
            index
          )}
        </span>
        <span className="mt-1 w-px flex-1 bg-ink-700 last:hidden" />
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <p
          className={clsx(
            'text-xs font-semibold',
            state === 'done' ? 'text-mist-300' : 'text-mist-100',
          )}
        >
          {title}
        </p>
        {children && <div className="mt-1.5 space-y-2">{children}</div>}
      </div>
    </li>
  );
}

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] leading-relaxed text-mist-400">{children}</p>
);

export function SetupPanel() {
  const env = useStore((state) => state.env);
  const download = useStore((state) => state.download);
  const devices = useStore((state) => state.devices);
  const pushToast = useStore((state) => state.pushToast);
  const setPanel = useStore((state) => state.setPanel);
  const [busy, setBusy] = useState(false);

  const adbReady = Boolean(env?.adb.available);
  const serverReady = Boolean(env?.adb.serverRunning);
  const scrcpyReady = Boolean(env?.scrcpyServer.available);
  const anyDevice = devices.length > 0;
  const authorised = devices.some((device) => device.state === 'device');
  const unauthorised = devices.some((device) => device.state === 'unauthorized');

  const run = async (action: () => Promise<unknown>, title: string) => {
    setBusy(true);
    try {
      await action();
      pushToast({ level: 'success', title });
    } catch (error) {
      pushToast({ level: 'error', title: `${title} failed`, detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Setup" subtitle="Get a device talking to this PC">
      <ol className="mt-1">
        <Step
          index={1}
          state={adbReady ? 'done' : 'active'}
          title={adbReady ? 'Android platform-tools installed' : 'Install Android platform-tools'}
        >
          {adbReady ? (
            <>
              <Hint>
                {env?.adb.version} —{' '}
                {env?.adb.source === 'managed' ? 'installed by this app' : 'found on this PC'}
              </Hint>
              <p className="selectable font-mono text-[10px] break-all text-mist-400">
                {env?.adb.path}
              </p>
            </>
          ) : (
            <>
              <Hint>
                CTRLbot Mirror needs Google&apos;s <code>adb.exe</code>. It downloads the official
                bundle from dl.google.com into this app&apos;s own folder — nothing is installed
                system-wide and nothing else on your PC is touched.
              </Hint>

              {download ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-mist-300">
                    <Spinner className="size-3.5 text-beam-400" />
                    {download.message}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                    <div
                      className="h-full rounded-full bg-beam-500 transition-[width]"
                      style={{
                        width: download.totalBytes
                          ? `${(download.receivedBytes / download.totalBytes) * 100}%`
                          : '35%',
                      }}
                    />
                  </div>
                  <p className="font-mono text-[10px] text-mist-400">
                    {bytes(download.receivedBytes)} / {bytes(download.totalBytes)}
                  </p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Download size={14} />}
                    disabled={busy}
                    onClick={() => void run(() => api.env.ensureAdb(), 'platform-tools installed')}
                  >
                    Install now
                  </Button>
                  <Button
                    size="sm"
                    icon={<FolderSearch size={14} />}
                    disabled={busy}
                    onClick={() => void run(() => api.env.locateAdb(), 'adb located')}
                  >
                    I have adb
                  </Button>
                </div>
              )}
            </>
          )}
        </Step>

        <Step
          index={2}
          state={!adbReady ? 'todo' : serverReady ? 'done' : 'warn'}
          title={serverReady ? 'ADB server running' : 'Start the ADB server'}
        >
          {serverReady ? (
            <Hint>Protocol version {env?.adb.serverVersion}. Devices appear automatically.</Hint>
          ) : (
            <>
              <Hint>
                The server is the background process adb uses to talk to devices. If it will not
                start, another tool (Android Studio, an OEM suite) may already own port 5037.
              </Hint>
              <Button
                size="sm"
                icon={<RefreshCw size={14} />}
                disabled={!adbReady || busy}
                onClick={() => void run(() => api.env.restartServer(), 'ADB server restarted')}
              >
                Start server
              </Button>
            </>
          )}
        </Step>

        <Step
          index={3}
          state={anyDevice ? 'done' : serverReady ? 'active' : 'todo'}
          title="Turn on USB debugging"
        >
          <Hint>On the phone:</Hint>
          <ol className="ml-3.5 list-decimal space-y-1 text-[11px] leading-relaxed text-mist-400 marker:text-mist-400">
            <li>
              Settings → About phone → tap <strong className="text-mist-200">Build number</strong>{' '}
              seven times.
            </li>
            <li>
              Go back → System → <strong className="text-mist-200">Developer options</strong>.
            </li>
            <li>
              Turn on <strong className="text-mist-200">USB debugging</strong>.
            </li>
            <li>Plug the phone into this PC with a data-capable USB cable.</li>
          </ol>
          <Hint>
            Charge-only cables are the single most common reason a phone never shows up. If nothing
            appears, try a different cable first.
          </Hint>
        </Step>

        <Step
          index={4}
          state={authorised ? 'done' : unauthorised ? 'warn' : 'todo'}
          title="Authorise this computer"
        >
          {authorised ? (
            <Hint>Authorised. You are ready to mirror.</Hint>
          ) : (
            <Hint>
              The phone shows an “Allow USB debugging?” dialog the first time. Unlock the screen,
              tick
              <strong className="text-mist-200"> Always allow from this computer</strong> and tap
              Allow. If you never see it, unplug and replug the cable.
            </Hint>
          )}
        </Step>

        <Step index={5} state={authorised ? 'active' : 'todo'} title="Start mirroring">
          <Hint>Pick the device in the Devices panel and press Start mirroring.</Hint>
          <Button size="sm" disabled={!authorised} onClick={() => setPanel('devices')}>
            Go to Devices
          </Button>
        </Step>
      </ol>

      <div className="mt-1">
        <SectionLabel>Diagnostics</SectionLabel>
        <Card className="space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-mist-400">scrcpy server</span>
            <span className={scrcpyReady ? 'text-signal-400' : 'text-alert-400'}>
              {scrcpyReady ? `v${env?.scrcpyServer.version} bundled` : 'missing'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-mist-400">Android SDK</span>
            <span className="text-mist-300">{env?.androidSdkRoot ? 'found' : 'not found'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-mist-400">Emulator</span>
            <span className="text-mist-300">
              {env?.emulatorPath ? 'available' : 'not installed'}
            </span>
          </div>

          {!scrcpyReady && (
            <p className="rounded-lg bg-alert-500/10 p-2 text-[11px] leading-relaxed text-alert-400">
              scrcpy-server.jar was not found. Run <code>npm run fetch:scrcpy</code> in the repo, or
              reinstall the app — mirroring cannot start without it.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={13} />}
              disabled={busy}
              onClick={() => void run(() => api.env.restartServer(), 'ADB server restarted')}
            >
              Restart ADB
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<FileText size={13} />}
              onClick={() => void api.env.openLogFolder()}
            >
              Open logs
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Circle size={13} />}
              disabled={busy}
              onClick={() => void run(() => api.env.status(), 'Environment re-checked')}
            >
              Re-check
            </Button>
          </div>
        </Card>
      </div>
    </Panel>
  );
}
