/**
 * Browser keyboard events → Android key codes.
 *
 * Values are the platform constants from `android.view.KeyEvent`; they have
 * been stable since API 1 and are safer to inline than to derive.
 */
export const AndroidKey = {
  Home: 3,
  Back: 4,
  Call: 5,
  EndCall: 6,
  VolumeUp: 24,
  VolumeDown: 25,
  Power: 26,
  Camera: 27,
  Clear: 28,
  DpadUp: 19,
  DpadDown: 20,
  DpadLeft: 21,
  DpadRight: 22,
  DpadCenter: 23,
  Tab: 61,
  Space: 62,
  Enter: 66,
  Del: 67,
  Menu: 82,
  Notification: 83,
  Search: 84,
  MediaPlayPause: 85,
  Escape: 111,
  ForwardDel: 112,
  MoveHome: 122,
  MoveEnd: 123,
  PageUp: 92,
  PageDown: 93,
  Insert: 124,
  AppSwitch: 187,
  Sleep: 223,
  WakeUp: 224,
  Cut: 277,
  Copy: 278,
  Paste: 279,
} as const;

/** `android.view.KeyEvent` meta-state bits. */
export const AndroidMeta = {
  None: 0,
  Shift: 1,
  Alt: 2,
  Ctrl: 4096,
  Meta: 65536,
} as const;

/**
 * Keys we forward as key events. Printable characters are *not* here — they go
 * through scrcpy's text injection instead, which handles IMEs, accents and
 * emoji correctly where synthetic key codes do not.
 */
const KEY_BY_CODE: Record<string, number> = {
  Backspace: AndroidKey.Del,
  Delete: AndroidKey.ForwardDel,
  Enter: AndroidKey.Enter,
  NumpadEnter: AndroidKey.Enter,
  Escape: AndroidKey.Escape,
  Tab: AndroidKey.Tab,
  ArrowUp: AndroidKey.DpadUp,
  ArrowDown: AndroidKey.DpadDown,
  ArrowLeft: AndroidKey.DpadLeft,
  ArrowRight: AndroidKey.DpadRight,
  Home: AndroidKey.MoveHome,
  End: AndroidKey.MoveEnd,
  PageUp: AndroidKey.PageUp,
  PageDown: AndroidKey.PageDown,
  Insert: AndroidKey.Insert,
};

export function androidKeyFor(code: string): number | null {
  return KEY_BY_CODE[code] ?? null;
}

export function metaStateFor(event: KeyboardEvent): number {
  let state = AndroidMeta.None;
  if (event.shiftKey) state |= AndroidMeta.Shift;
  if (event.altKey) state |= AndroidMeta.Alt;
  if (event.ctrlKey) state |= AndroidMeta.Ctrl;
  if (event.metaKey) state |= AndroidMeta.Meta;
  return state;
}

/** True when the key produces a character we should send as text. */
export function isPrintable(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}
