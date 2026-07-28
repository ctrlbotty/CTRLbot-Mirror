import { useEffect, useState } from 'react';
import { ExternalLink, FileText, FolderOpen, RotateCcw } from 'lucide-react';
import { SCRCPY_SERVER_VERSION } from '@shared/constants.js';
import { api, errorText } from '../../lib/api.js';
import { useStore } from '../../state/store.js';
import { Button, Card, Field, Panel, Row, SectionLabel, Select, Toggle } from '../ui.js';

const REPO_URL = 'https://github.com/ctrlbotty/CTRLbot-Mirror';
const SCRCPY_URL = 'https://github.com/Genymobile/scrcpy';

export function SettingsPanel() {
  const settings = useStore((state) => state.settings);
  const env = useStore((state) => state.env);
  const patchSettings = useStore((state) => state.patchSettings);
  const pushToast = useStore((state) => state.pushToast);
  const [version, setVersion] = useState('');

  useEffect(() => {
    void api.app.version().then(setVersion);
  }, []);

  if (!settings) return null;

  return (
    <Panel title="Settings">
      <SectionLabel>General</SectionLabel>
      <Card className="mb-4">
        <Row
          label="Auto-select a single device"
          hint="Skips a click when exactly one phone is plugged in"
        >
          <Toggle
            checked={settings.autoConnectLastDevice}
            onChange={(autoConnectLastDevice) => void patchSettings({ autoConnectLastDevice })}
          />
        </Row>
        <div className="pt-2">
          <Field label="Capture folder">
            <p className="selectable rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[10px] break-all text-mist-300">
              {settings.captureDirectory ?? 'Pictures\\CTRLbot Mirror (default)'}
            </p>
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              icon={<FolderOpen size={13} />}
              onClick={() => void api.capture.revealFolder()}
            >
              Open
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              onClick={async () => {
                const folder = await api.capture.chooseFolder();
                if (folder) await patchSettings({ captureDirectory: folder });
              }}
            >
              Change
            </Button>
          </div>
        </div>
      </Card>

      <SectionLabel>ADB</SectionLabel>
      <Card className="mb-4 space-y-3">
        <Field label="adb.exe in use">
          <p className="selectable rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[10px] break-all text-mist-300">
            {env?.adb.path ?? 'Not found'}
          </p>
        </Field>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1"
            onClick={async () => {
              try {
                await api.env.locateAdb();
                pushToast({ level: 'success', title: 'adb path updated' });
              } catch (error) {
                pushToast({ level: 'error', title: 'Could not set adb', detail: errorText(error) });
              }
            }}
          >
            Choose adb.exe
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1"
            disabled={!settings.adbPathOverride}
            onClick={async () => {
              await patchSettings({ adbPathOverride: null });
              await api.env.restartServer();
              pushToast({ level: 'success', title: 'Back to the automatic adb' });
            }}
          >
            Use automatic
          </Button>
        </div>

        <Field label="Theme" hint="Light mode is on the roadmap; the stage stays dark for now.">
          <Select
            value={settings.theme}
            disabled
            onChange={(event) =>
              void patchSettings({ theme: event.target.value as typeof settings.theme })
            }
          >
            <option value="dark">Dark</option>
          </Select>
        </Field>
      </Card>

      <SectionLabel>About</SectionLabel>
      <Card className="space-y-2 text-[11px]">
        <div className="flex justify-between">
          <span className="text-mist-400">CTRLbot Mirror</span>
          <span className="font-mono text-mist-200">{version || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-mist-400">scrcpy server</span>
          <span className="font-mono text-mist-200">{SCRCPY_SERVER_VERSION}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-mist-400">adb</span>
          <span className="truncate pl-2 font-mono text-mist-200">
            {env?.adb.version?.replace('Android Debug Bridge version ', '') ?? '—'}
          </span>
        </div>

        <p className="pt-2 leading-relaxed text-mist-400">
          Mirroring is powered by{' '}
          <button
            className="text-beam-300 hover:underline"
            onClick={() => void api.app.openExternal(SCRCPY_URL)}
          >
            scrcpy
          </button>{' '}
          (Apache-2.0) from Genymobile.
        </p>

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1"
            icon={<FileText size={13} />}
            onClick={() => void api.env.openLogFolder()}
          >
            Logs
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1"
            icon={<ExternalLink size={13} />}
            onClick={() => void api.app.openExternal(REPO_URL)}
          >
            Source
          </Button>
        </div>
      </Card>

      <Button
        size="sm"
        variant="danger"
        className="mt-4 w-full"
        icon={<RotateCcw size={13} />}
        onClick={async () => {
          if (!window.confirm('Reset every setting back to its default?')) return;
          const next = await api.settings.reset();
          useStore.setState({ settings: next });
          pushToast({ level: 'success', title: 'Settings reset' });
        }}
      >
        Reset all settings
      </Button>
    </Panel>
  );
}
