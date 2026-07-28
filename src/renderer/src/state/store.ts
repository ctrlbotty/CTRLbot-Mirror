import { create } from 'zustand';
import type { Notification } from '@shared/ipc.js';
import type {
  AppSettings,
  DeviceDetails,
  DeviceSummary,
  DownloadProgress,
  EnvironmentStatus,
  LogLine,
  MirrorOptions,
  MirrorSessionInfo,
  StudioSettings,
} from '@shared/types.js';
import { api, errorText } from '../lib/api.js';
import { mirror } from '../lib/video.js';

export type PanelId =
  'setup' | 'devices' | 'studio' | 'apps' | 'files' | 'shell' | 'logcat' | 'virtual' | 'settings';

export type MirrorStatus = 'idle' | 'starting' | 'live' | 'error';

export interface Toast extends Notification {
  id: number;
}

const LOG_LIMIT = 5_000;
const SERVER_LOG_LIMIT = 300;

interface State {
  ready: boolean;
  env: EnvironmentStatus | null;
  download: DownloadProgress | null;

  devices: DeviceSummary[];
  selectedSerial: string | null;
  details: DeviceDetails | null;

  session: MirrorSessionInfo | null;
  mirrorStatus: MirrorStatus;
  mirrorError: string | null;
  serverLog: string[];

  settings: AppSettings | null;
  panel: PanelId;
  panelCollapsed: boolean;
  toasts: Toast[];

  logLines: LogLine[];
  logStreaming: boolean;

  bootstrap(): Promise<void>;
  setPanel(panel: PanelId): void;
  togglePanelCollapsed(): void;

  selectDevice(serial: string | null): Promise<void>;
  refreshDetails(): Promise<void>;

  startMirror(): Promise<void>;
  stopMirror(): Promise<void>;

  patchSettings(patch: Partial<AppSettings>): Promise<void>;
  patchMirrorOptions(patch: Partial<MirrorOptions>): Promise<void>;
  patchStudio(patch: Partial<StudioSettings>): Promise<void>;

  pushToast(toast: Notification): void;
  dismissToast(id: number): void;

  appendLogLines(lines: LogLine[]): void;
  clearLogLines(): void;
  setLogStreaming(streaming: boolean): void;
}

let toastId = 0;

export const useStore = create<State>((set, get) => ({
  ready: false,
  env: null,
  download: null,

  devices: [],
  selectedSerial: null,
  details: null,

  session: null,
  mirrorStatus: 'idle',
  mirrorError: null,
  serverLog: [],

  settings: null,
  panel: 'devices',
  panelCollapsed: false,
  toasts: [],

  logLines: [],
  logStreaming: false,

  async bootstrap() {
    const [settings, env] = await Promise.all([api.settings.get(), api.env.status()]);

    // Only ask for devices once ADB is actually up; otherwise the request is a
    // guaranteed failure and just adds noise to the log.
    const devices = env.adb.serverRunning
      ? await api.devices.list().catch(() => [] as DeviceSummary[])
      : [];

    const panel: PanelId = env.adb.available && env.adb.serverRunning ? 'devices' : 'setup';
    set({ settings, env, devices, panel, ready: true });

    // Auto-select when exactly one device is already authorised — the common
    // case, and it saves a click before every recording.
    const authorised = devices.filter((device) => device.state === 'device');
    if (settings.autoConnectLastDevice && authorised.length === 1 && authorised[0]) {
      await get().selectDevice(authorised[0].serial);
    }
  },

  setPanel(panel) {
    set({ panel, panelCollapsed: false });
  },

  togglePanelCollapsed() {
    set((state) => ({ panelCollapsed: !state.panelCollapsed }));
  },

  async selectDevice(serial) {
    const previous = get().selectedSerial;
    if (previous === serial) return;

    if (get().mirrorStatus !== 'idle') await get().stopMirror();

    set({ selectedSerial: serial, details: null });
    if (!serial) return;

    const details = await api.devices.details(serial);
    // Guard against a slower lookup landing after the user moved on.
    if (get().selectedSerial === serial) set({ details });
  },

  async refreshDetails() {
    const serial = get().selectedSerial;
    if (!serial) return;
    const details = await api.devices.details(serial);
    if (get().selectedSerial === serial) set({ details });
  },

  async startMirror() {
    const { selectedSerial, settings, mirrorStatus } = get();
    if (!selectedSerial || !settings || mirrorStatus === 'starting') return;

    set({ mirrorStatus: 'starting', mirrorError: null, serverLog: [] });
    try {
      const session = await api.mirror.start(selectedSerial, settings.mirror);
      set({ session, mirrorStatus: 'live' });
    } catch (error) {
      const message = errorText(error);
      set({ mirrorStatus: 'error', mirrorError: message, session: null });
      get().pushToast({ level: 'error', title: 'Could not start mirroring', detail: message });
    }
  },

  async stopMirror() {
    mirror.stop();
    try {
      await api.mirror.stop();
    } catch {
      /* the session may already be gone */
    }
    set({ session: null, mirrorStatus: 'idle', mirrorError: null });
  },

  async patchSettings(patch) {
    const settings = await api.settings.set(patch);
    set({ settings });
  },

  async patchMirrorOptions(patch) {
    const current = get().settings;
    if (!current) return;
    const settings = await api.settings.set({ mirror: { ...current.mirror, ...patch } });
    set({ settings });
  },

  async patchStudio(patch) {
    const current = get().settings;
    if (!current) return;
    const settings = await api.settings.set({ studio: { ...current.studio, ...patch } });
    set({ settings });
  },

  pushToast(toast) {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    const ttl = toast.level === 'error' ? 9_000 : 4_500;
    setTimeout(() => get().dismissToast(id), ttl);
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },

  appendLogLines(lines) {
    set((state) => {
      const next = state.logLines.concat(lines);
      // Keep the tail; an hour of logcat would otherwise eat all the memory.
      return { logLines: next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next };
    });
  },

  clearLogLines() {
    set({ logLines: [] });
  },

  setLogStreaming(logStreaming) {
    set({ logStreaming });
  },
}));

/** Wires main-process events into the store. Called once from `main.tsx`. */
export function subscribeToMain(): () => void {
  const { getState } = useStore;

  const unsubscribers = [
    api.on.envChanged((env) => useStore.setState({ env })),

    api.on.downloadProgress((download) => {
      useStore.setState({ download: download.phase === 'done' ? null : download });
    }),

    api.on.devicesChanged((devices) => {
      useStore.setState({ devices });

      const { selectedSerial, mirrorStatus } = getState();
      if (!selectedSerial) return;

      const still = devices.find((device) => device.serial === selectedSerial);
      if (!still || still.state !== 'device') {
        if (mirrorStatus !== 'idle') void getState().stopMirror();
        useStore.setState({ selectedSerial: null, details: null });
        getState().pushToast({
          level: 'warning',
          title: 'Device disconnected',
          detail: selectedSerial,
        });
      }
    }),

    api.on.mirrorEnded((reason) => {
      mirror.stop();
      const wasLive = getState().mirrorStatus === 'live';
      useStore.setState({ session: null, mirrorStatus: 'idle' });
      if (wasLive) {
        getState().pushToast({ level: 'info', title: 'Mirroring stopped', detail: reason });
      }
    }),

    api.on.mirrorLog((line) => {
      useStore.setState((state) => {
        const next = state.serverLog.concat(line);
        return {
          serverLog:
            next.length > SERVER_LOG_LIMIT ? next.slice(next.length - SERVER_LOG_LIMIT) : next,
        };
      });
    }),

    api.on.logcatLines((lines) => getState().appendLogLines(lines)),

    api.on.notify((notification) => getState().pushToast(notification)),

    mirror.onError((message) => {
      useStore.setState({ mirrorStatus: 'error', mirrorError: message });
      getState().pushToast({ level: 'error', title: 'Video decoding failed', detail: message });
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
