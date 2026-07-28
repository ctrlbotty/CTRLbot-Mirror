import log from 'electron-log/main';
import { app } from 'electron';

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = app.isPackaged ? 'warn' : 'debug';
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

export const logger = log.scope('main');

export function scoped(name: string) {
  return log.scope(name);
}

export function logFilePath(): string {
  return log.transports.file.getFile().path;
}

/** Turns anything thrown into a readable one-liner for the UI. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
