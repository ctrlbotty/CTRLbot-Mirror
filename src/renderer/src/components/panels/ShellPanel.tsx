import { useCallback, useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Eraser } from 'lucide-react';
import { api, errorText } from '../../lib/api.js';
import { useStore } from '../../state/store.js';
import { IconButton, Panel, TextInput } from '../ui.js';

interface Entry {
  id: number;
  command: string;
  output: string;
  ok: boolean;
}

const SUGGESTIONS = [
  'getprop ro.build.version.release',
  'dumpsys battery',
  'pm list packages -3',
  'settings get system screen_off_timeout',
  'wm size',
];

let entryId = 0;

export function ShellPanel() {
  const serial = useStore((state) => state.selectedSerial);
  const [command, setCommand] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [entries]);

  const run = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!serial || !trimmed || running) return;

      setRunning(true);
      setCommand('');
      setHistory((current) =>
        [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 50),
      );
      setHistoryIndex(-1);

      try {
        const result = await api.shell.run(serial, trimmed);
        setEntries((current) => [
          ...current,
          {
            id: ++entryId,
            command: trimmed,
            output: result.output.trimEnd() || result.error || '(no output)',
            ok: result.ok,
          },
        ]);
      } catch (error) {
        setEntries((current) => [
          ...current,
          { id: ++entryId, command: trimmed, output: errorText(error), ok: false },
        ]);
      } finally {
        setRunning(false);
      }
    },
    [running, serial],
  );

  if (!serial) return null;

  return (
    <Panel
      title="Shell"
      subtitle={`adb -s ${serial} shell`}
      actions={
        <IconButton label="Clear output" onClick={() => setEntries([])}>
          <Eraser size={15} />
        </IconButton>
      }
    >
      <div
        ref={outputRef}
        className="mb-3 max-h-[46vh] min-h-32 overflow-y-auto rounded-xl border border-ink-700 bg-ink-950 p-3 font-mono text-[11px] leading-relaxed"
      >
        {entries.length === 0 ? (
          <div className="space-y-1.5 text-mist-400">
            <p>Runs a single command on the device and prints the combined output.</p>
            <p className="pt-1 text-[10px] tracking-wide uppercase">Try one of these</p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                className="block text-left text-beam-300 hover:underline"
                onClick={() => void run(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="mb-3 last:mb-0">
              <p className="text-beam-300">
                <span className="text-mist-400">$ </span>
                {entry.command}
              </p>
              <pre
                className={`selectable mt-1 whitespace-pre-wrap ${entry.ok ? 'text-mist-300' : 'text-alert-400'}`}
              >
                {entry.output}
              </pre>
            </div>
          ))
        )}
      </div>

      <div className="relative">
        <TextInput
          value={command}
          disabled={running}
          placeholder={running ? 'Running…' : 'Type a shell command'}
          className="pr-9 font-mono"
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void run(command);
              return;
            }
            // Up/down walks the command history, like a real terminal.
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              const next = Math.min(historyIndex + 1, history.length - 1);
              if (next >= 0 && history[next]) {
                setHistoryIndex(next);
                setCommand(history[next]);
              }
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const next = historyIndex - 1;
              setHistoryIndex(next);
              setCommand(next >= 0 ? (history[next] ?? '') : '');
            }
          }}
        />
        <CornerDownLeft
          size={13}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-mist-400"
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-mist-400">
        Commands run as the shell user, not root. Interactive programs are not supported — this
        sends one command and waits for it to finish.
      </p>
    </Panel>
  );
}
