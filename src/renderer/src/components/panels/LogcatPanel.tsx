import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Eraser, Pause, Play } from 'lucide-react';
import type { LogPriority } from '@shared/types.js';
import { api, errorText } from '../../lib/api.js';
import { useStore } from '../../state/store.js';
import { Button, IconButton, Panel, Row, Select, TextInput, Toggle } from '../ui.js';

const PRIORITY_ORDER: LogPriority[] = ['V', 'D', 'I', 'W', 'E', 'F'];

const PRIORITY_STYLE: Record<LogPriority, string> = {
  V: 'text-mist-400',
  D: 'text-beam-300',
  I: 'text-mist-200',
  W: 'text-warn-400',
  E: 'text-alert-400',
  F: 'text-alert-400 font-semibold',
};

/** Only the tail is rendered — logcat produces far more than the DOM can hold. */
const RENDER_LIMIT = 800;

export function LogcatPanel() {
  const serial = useStore((state) => state.selectedSerial);
  const lines = useStore((state) => state.logLines);
  const streaming = useStore((state) => state.logStreaming);
  const setStreaming = useStore((state) => state.setLogStreaming);
  const clearLines = useStore((state) => state.clearLogLines);
  const pushToast = useStore((state) => state.pushToast);

  const [minPriority, setMinPriority] = useState<LogPriority>('I');
  const [filter, setFilter] = useState('');
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const threshold = PRIORITY_ORDER.indexOf(minPriority);
    const needle = filter.trim().toLowerCase();

    const matched = lines.filter((line) => {
      if (PRIORITY_ORDER.indexOf(line.priority) < threshold) return false;
      if (!needle) return true;
      return line.tag.toLowerCase().includes(needle) || line.message.toLowerCase().includes(needle);
    });

    return matched.length > RENDER_LIMIT ? matched.slice(matched.length - RENDER_LIMIT) : matched;
  }, [filter, lines, minPriority]);

  useEffect(() => {
    if (follow) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [follow, visible]);

  // Stop the stream when the panel unmounts or the device changes.
  useEffect(() => {
    return () => {
      void api.logcat.stop();
      setStreaming(false);
    };
  }, [serial, setStreaming]);

  if (!serial) return null;

  const toggle = async () => {
    try {
      if (streaming) {
        await api.logcat.stop();
        setStreaming(false);
        return;
      }
      const result = await api.logcat.start(serial);
      if (result.ok) setStreaming(true);
      else pushToast({ level: 'error', title: 'Logcat failed', detail: result.error });
    } catch (error) {
      pushToast({ level: 'error', title: 'Logcat failed', detail: errorText(error) });
    }
  };

  return (
    <Panel
      title="Logcat"
      subtitle={streaming ? `${lines.length} lines buffered` : 'Stopped'}
      actions={
        <>
          <IconButton
            label={streaming ? 'Pause' : 'Start'}
            active={streaming}
            onClick={() => void toggle()}
          >
            {streaming ? <Pause size={15} /> : <Play size={15} />}
          </IconButton>
          <IconButton label="Clear" onClick={() => clearLines()}>
            <Eraser size={15} />
          </IconButton>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <TextInput
          placeholder="Filter by tag or message…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <Select
          className="w-28"
          value={minPriority}
          onChange={(event) => setMinPriority(event.target.value as LogPriority)}
        >
          <option value="V">Verbose+</option>
          <option value="D">Debug+</option>
          <option value="I">Info+</option>
          <option value="W">Warn+</option>
          <option value="E">Error+</option>
        </Select>
      </div>

      <Row label="Follow tail">
        <Toggle checked={follow} onChange={setFollow} />
      </Row>

      <div
        ref={scrollRef}
        onWheel={() => setFollow(false)}
        className="max-h-[52vh] min-h-40 overflow-y-auto rounded-xl border border-ink-700 bg-ink-950 p-2 font-mono text-[10.5px] leading-[1.5]"
      >
        {visible.length === 0 ? (
          <p className="p-3 text-center text-mist-400">
            {streaming ? 'Waiting for output…' : 'Press play to start streaming logcat.'}
          </p>
        ) : (
          visible.map((line) => (
            <div key={line.id} className="selectable flex gap-1.5 hover:bg-ink-850">
              <span className={clsx('w-3 shrink-0 text-center', PRIORITY_STYLE[line.priority])}>
                {line.priority}
              </span>
              <span className="w-28 shrink-0 truncate text-flare-400" title={line.tag}>
                {line.tag}
              </span>
              <span className={clsx('min-w-0 flex-1 break-words', PRIORITY_STYLE[line.priority])}>
                {line.message}
              </span>
            </div>
          ))
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="mt-3 w-full"
        onClick={async () => {
          const result = await api.logcat.clear(serial);
          clearLines();
          pushToast({
            level: result.ok ? 'success' : 'error',
            title: result.ok ? 'Device log buffer cleared' : 'Could not clear the buffer',
            detail: result.output || result.error,
          });
        }}
      >
        Clear the device&apos;s log buffer
      </Button>
    </Panel>
  );
}
