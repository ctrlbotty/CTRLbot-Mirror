import type { CtrlbotApi } from '@shared/ipc.js';

declare global {
  interface Window {
    ctrlbot: CtrlbotApi;
  }
}

/** The preload bridge. Present on every window this app creates. */
export const api: CtrlbotApi = window.ctrlbot;

/** Normalises the `Error` that `ipcRenderer.invoke` rejects with. */
export function errorText(error: unknown): string {
  if (error instanceof Error) {
    // Electron prefixes IPC rejections with "Error invoking remote method '…':".
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/, '');
  }
  return String(error);
}
