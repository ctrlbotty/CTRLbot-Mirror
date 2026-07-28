import type { CtrlbotApi } from '@shared/ipc.js';

declare global {
  interface Window {
    ctrlbot: CtrlbotApi;
  }
}

export {};
