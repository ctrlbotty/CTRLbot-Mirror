import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronRight,
  Download,
  File,
  Folder,
  FolderPlus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import type { RemoteFile } from '@shared/types.js';
import { api, errorText } from '../../lib/api.js';
import { useStore } from '../../state/store.js';
import { Button, EmptyState, IconButton, Panel, Spinner } from '../ui.js';

const START_PATH = '/sdcard';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function FilesPanel() {
  const serial = useStore((state) => state.selectedSerial);
  const pushToast = useStore((state) => state.pushToast);

  const [path, setPath] = useState(START_PATH);
  const [entries, setEntries] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(
    async (target: string) => {
      if (!serial) return;
      setLoading(true);
      try {
        setEntries(await api.files.list(serial, target));
        setPath(target);
      } catch (error) {
        pushToast({ level: 'error', title: `Cannot open ${target}`, detail: errorText(error) });
      } finally {
        setLoading(false);
      }
    },
    [pushToast, serial],
  );

  useEffect(() => {
    void load(START_PATH);
  }, [load]);

  const segments = path.split('/').filter(Boolean);

  const push = useCallback(
    async (localPaths: string[]) => {
      if (!serial || localPaths.length === 0) return;
      const results = await api.files.push(serial, localPaths, path);
      const failed = results.filter((result) => !result.ok);

      pushToast({
        level: failed.length === 0 ? 'success' : 'warning',
        title:
          failed.length === 0
            ? `Pushed ${results.length} file${results.length === 1 ? '' : 's'}`
            : `${results.length - failed.length} of ${results.length} pushed`,
        detail: failed[0]?.message,
      });
      await load(path);
    },
    [load, path, pushToast, serial],
  );

  if (!serial) return null;

  return (
    <Panel
      title="Files"
      subtitle={path}
      actions={
        <>
          <IconButton
            label="New folder"
            onClick={async () => {
              const name = window.prompt('Folder name');
              if (!name) return;
              const result = await api.files.mkdir(serial, `${path}/${name}`);
              pushToast({
                level: result.ok ? 'success' : 'error',
                title: result.ok ? 'Folder created' : 'Could not create folder',
                detail: result.output || result.error,
              });
              if (result.ok) await load(path);
            }}
          >
            <FolderPlus size={15} />
          </IconButton>
          <IconButton label="Refresh" disabled={loading} onClick={() => void load(path)}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />
          </IconButton>
        </>
      }
    >
      <nav className="mb-2 flex flex-wrap items-center gap-0.5 text-[11px]">
        <button
          className="rounded px-1 py-0.5 text-mist-400 hover:bg-ink-800 hover:text-mist-100"
          onClick={() => void load('/')}
        >
          /
        </button>
        {segments.map((segment, index) => {
          const target = `/${segments.slice(0, index + 1).join('/')}`;
          const last = index === segments.length - 1;
          return (
            <span key={target} className="flex items-center">
              <ChevronRight size={11} className="text-ink-600" />
              <button
                className={clsx(
                  'rounded px-1 py-0.5 hover:bg-ink-800',
                  last ? 'text-mist-100' : 'text-mist-400 hover:text-mist-100',
                )}
                onClick={() => void load(target)}
              >
                {segment}
              </button>
            </span>
          );
        })}
      </nav>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const paths = Array.from(event.dataTransfer.files)
            .map((file) => api.files.pathFor(file))
            .filter(Boolean);
          if (paths.length === 0) {
            pushToast({
              level: 'warning',
              title: 'Could not read the dropped files',
              detail: 'Use the Upload button instead.',
            });
            return;
          }
          void push(paths);
        }}
        className={clsx(
          'rounded-xl border border-dashed p-3 text-center text-[11px] transition-colors',
          dragging
            ? 'border-beam-500 bg-beam-500/10 text-beam-300'
            : 'border-ink-700 text-mist-400',
        )}
      >
        <Upload size={14} className="mx-auto mb-1" />
        Drop files here to copy them to <span className="font-mono">{path}</span>
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-xs text-mist-400">
          <Spinner className="size-4" /> Reading folder…
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={<Folder size={26} />} title="Empty folder" />
      ) : (
        <ul className="mt-2 space-y-0.5">
          {entries.map((entry) => (
            <li
              key={entry.path}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-850"
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => entry.isDirectory && void load(entry.path)}
              >
                {entry.isDirectory ? (
                  <Folder size={14} className="shrink-0 text-beam-400" />
                ) : (
                  <File size={14} className="shrink-0 text-mist-400" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-mist-200">{entry.name}</span>
                  {!entry.isDirectory && (
                    <span className="block font-mono text-[10px] text-mist-400">
                      {formatSize(entry.size)}
                    </span>
                  )}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {!entry.isDirectory && (
                  <IconButton
                    label="Save to PC"
                    onClick={async () => {
                      const result = await api.files.pull(serial, entry.path);
                      pushToast({
                        level: result.ok ? 'success' : 'error',
                        title: result.ok ? 'Saved to your capture folder' : 'Download failed',
                        detail: result.ok ? result.path : result.message,
                      });
                    }}
                  >
                    <Download size={13} />
                  </IconButton>
                )}
                <IconButton
                  label="Delete"
                  tone="danger"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${entry.name} from the device?`)) return;
                    const result = await api.files.remove(serial, entry.path);
                    pushToast({
                      level: result.ok ? 'success' : 'error',
                      title: result.ok ? 'Deleted' : 'Delete failed',
                      detail: result.output || result.error,
                    });
                    if (result.ok) await load(path);
                  }}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="mt-3 w-full"
        onClick={() => void load('/sdcard/Download')}
      >
        Jump to Downloads
      </Button>
    </Panel>
  );
}
