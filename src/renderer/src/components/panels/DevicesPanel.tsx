import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  BatteryCharging,
  Cable,
  MonitorSmartphone,
  Play,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { DeviceSummary } from '@shared/types.js';
import { api, errorText } from '../../lib/api.js';
import { useStore } from '../../state/store.js';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Panel,
  SectionLabel,
  Spinner,
  TextInput,
} from '../ui.js';

const TRANSPORT_ICON = {
  usb: Cable,
  tcp: Wifi,
  emulator: MonitorSmartphone,
} as const;

function DeviceRow({ device }: { device: DeviceSummary }) {
  const selectedSerial = useStore((state) => state.selectedSerial);
  const selectDevice = useStore((state) => state.selectDevice);
  const pushToast = useStore((state) => state.pushToast);

  const selected = selectedSerial === device.serial;
  const Icon = TRANSPORT_ICON[device.transport];
  const usable = device.state === 'device';

  return (
    <button
      onClick={() => void selectDevice(device.serial)}
      className={clsx(
        'w-full rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-beam-500/60 bg-beam-500/10'
          : 'border-ink-700 bg-ink-850/60 hover:border-ink-600 hover:bg-ink-800',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
            usable ? 'bg-signal-500/15 text-signal-400' : 'bg-warn-400/15 text-warn-400',
          )}
        >
          <Icon size={16} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-mist-100">
            {device.model ?? device.serial}
          </p>
          <p className="selectable mt-0.5 truncate font-mono text-[11px] text-mist-400">
            {device.serial}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {device.state === 'device' && <Badge tone="good">Ready</Badge>}
            {device.state === 'unauthorized' && <Badge tone="warn">Not authorised</Badge>}
            {device.state === 'offline' && <Badge tone="bad">Offline</Badge>}
            <Badge>{device.transport}</Badge>
          </div>
        </div>

        {device.state === 'offline' && (
          <IconButton
            label="Reconnect"
            onClick={(event) => {
              event.stopPropagation();
              void api.devices.reconnect(device.serial).then((result) => {
                pushToast({
                  level: result.ok ? 'info' : 'error',
                  title: result.ok ? 'Reconnecting' : 'Reconnect failed',
                  detail: result.output || result.error,
                });
              });
            }}
          >
            <RefreshCw size={14} />
          </IconButton>
        )}
      </div>
    </button>
  );
}

function SelectedDeviceCard() {
  const details = useStore((state) => state.details);
  const selectedSerial = useStore((state) => state.selectedSerial);
  const mirrorStatus = useStore((state) => state.mirrorStatus);
  const startMirror = useStore((state) => state.startMirror);
  const stopMirror = useStore((state) => state.stopMirror);
  const refreshDetails = useStore((state) => state.refreshDetails);
  const pushToast = useStore((state) => state.pushToast);
  const [switching, setSwitching] = useState(false);

  if (!selectedSerial) return null;

  const live = mirrorStatus === 'live';

  return (
    <Card className="mt-3">
      {details ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-mist-100">{details.name}</p>
              <p className="mt-0.5 text-[11px] text-mist-400">
                Android {details.androidRelease} · API {details.sdkInt} · {details.abi}
              </p>
            </div>
            <IconButton label="Refresh device info" onClick={() => void refreshDetails()}>
              <RefreshCw size={14} />
            </IconButton>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            {details.screen && (
              <div>
                <dt className="text-mist-400">Screen</dt>
                <dd className="font-mono text-mist-200">
                  {details.screen.width}×{details.screen.height}
                  {details.screen.density ? ` @ ${details.screen.density}dpi` : ''}
                </dd>
              </div>
            )}
            {details.battery && (
              <div>
                <dt className="text-mist-400">Battery</dt>
                <dd className="flex items-center gap-1 font-mono text-mist-200">
                  {details.battery.level}%
                  {details.battery.charging && (
                    <BatteryCharging size={11} className="text-signal-400" />
                  )}
                </dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-mist-400">Build</dt>
              <dd className="selectable truncate font-mono text-mist-200">{details.buildId}</dd>
            </div>
          </dl>

          <div className="mt-4 flex gap-2">
            {live ? (
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={() => void stopMirror()}
              >
                Stop mirroring
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                icon={<Play size={14} />}
                disabled={mirrorStatus === 'starting'}
                onClick={() => void startMirror()}
              >
                {mirrorStatus === 'starting' ? 'Starting…' : 'Start mirroring'}
              </Button>
            )}

            {details.ipAddress && (
              <Button
                size="sm"
                icon={<Wifi size={14} />}
                disabled={switching}
                title={`Switch to wireless ADB via ${details.ipAddress}`}
                onClick={async () => {
                  setSwitching(true);
                  try {
                    const result = await api.devices.enableTcpip(selectedSerial);
                    pushToast({
                      level: result.ok ? 'success' : 'error',
                      title: result.ok ? 'Wireless ADB' : 'Could not switch to wireless',
                      detail: result.output || result.error,
                    });
                  } catch (error) {
                    pushToast({
                      level: 'error',
                      title: 'Could not switch to wireless',
                      detail: errorText(error),
                    });
                  } finally {
                    setSwitching(false);
                  }
                }}
              >
                Go wireless
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs text-mist-400">
          <Spinner className="size-4" /> Reading device information…
        </div>
      )}
    </Card>
  );
}

function WirelessConnect() {
  const pushToast = useStore((state) => state.pushToast);
  const [address, setAddress] = useState('');
  const [pairAddress, setPairAddress] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (
    action: () => Promise<{ ok: boolean; output: string; error?: string }>,
    title: string,
  ) => {
    setBusy(true);
    try {
      const result = await action();
      pushToast({
        level: result.ok ? 'success' : 'error',
        title: result.ok ? title : `${title} failed`,
        detail: result.output || result.error,
      });
    } catch (error) {
      pushToast({ level: 'error', title: `${title} failed`, detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div>
        <SectionLabel>Pair over Wi-Fi</SectionLabel>
        <p className="mb-2 text-[11px] leading-relaxed text-mist-400">
          On the device: Developer options → Wireless debugging → Pair device with pairing code.
          Copy the address and code shown there.
        </p>
        <div className="space-y-2">
          <Field label="Pairing address">
            <TextInput
              placeholder="192.168.1.42:37021"
              value={pairAddress}
              onChange={(event) => setPairAddress(event.target.value)}
            />
          </Field>
          <Field label="Pairing code">
            <TextInput
              placeholder="123456"
              inputMode="numeric"
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value)}
            />
          </Field>
          <Button
            size="sm"
            className="w-full"
            disabled={busy || !pairAddress || !pairCode}
            onClick={() =>
              void run(
                () => api.devices.pair({ address: pairAddress.trim(), code: pairCode.trim() }),
                'Paired',
              )
            }
          >
            Pair
          </Button>
        </div>
      </div>

      <div>
        <SectionLabel>Connect</SectionLabel>
        <div className="flex gap-2">
          <TextInput
            placeholder="192.168.1.42:5555"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && address) {
                void run(() => api.devices.connect(address.trim()), 'Connected');
              }
            }}
          />
          <Button
            size="sm"
            disabled={busy || !address}
            onClick={() => void run(() => api.devices.connect(address.trim()), 'Connected')}
          >
            Connect
          </Button>
        </div>
        {address && (
          <button
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-mist-400 hover:text-mist-200"
            onClick={() => void run(() => api.devices.disconnect(address.trim()), 'Disconnected')}
          >
            <WifiOff size={11} /> Disconnect {address}
          </button>
        )}
      </div>
    </div>
  );
}

export function DevicesPanel() {
  const devices = useStore((state) => state.devices);
  const setPanel = useStore((state) => state.setPanel);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void api.devices
      .list()
      .then((devices) => useStore.setState({ devices }))
      .catch(() => undefined);
  }, []);

  const unauthorised = devices.filter((device) => device.state === 'unauthorized');

  return (
    <Panel
      title="Devices"
      subtitle={`${devices.length} connected`}
      actions={
        <IconButton
          label="Refresh"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              const devices = await api.devices.list();
              useStore.setState({ devices });
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : undefined} />
        </IconButton>
      }
    >
      {devices.length === 0 ? (
        <EmptyState
          icon={<Smartphone size={28} />}
          title="Nothing plugged in"
          detail="Connect a phone over USB with USB debugging enabled, or pair one over Wi-Fi below."
          action={
            <Button size="sm" onClick={() => setPanel('setup')}>
              Open the setup guide
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <DeviceRow key={device.serial} device={device} />
          ))}
        </div>
      )}

      {unauthorised.length > 0 && (
        <Card className="mt-3 border-warn-400/30 bg-warn-400/5">
          <div className="flex gap-2.5">
            <ShieldAlert size={15} className="mt-0.5 shrink-0 text-warn-400" />
            <p className="text-[11px] leading-relaxed text-mist-300">
              Unlock the device and tap <strong className="text-mist-100">Allow</strong> on the
              “Allow USB debugging?” prompt. Tick “Always allow from this computer” so it does not
              ask again.
            </p>
          </div>
        </Card>
      )}

      <SelectedDeviceCard />
      <WirelessConnect />
    </Panel>
  );
}
