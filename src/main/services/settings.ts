import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DEFAULT_MIRROR_OPTIONS,
  DEFAULT_STUDIO_SETTINGS,
  type AppSettings,
  type FrameStyle,
  type StudioSettings,
} from '@shared/types.js';
import { describeError, logger } from './logger.js';

function defaults(): AppSettings {
  return {
    mirror: { ...DEFAULT_MIRROR_OPTIONS },
    studio: { ...DEFAULT_STUDIO_SETTINGS },
    captureDirectory: null,
    adbPathOverride: null,
    theme: 'dark',
    autoConnectLastDevice: true,
    hasCompletedOnboarding: false,
  };
}

function migrateFrame(frame: unknown): FrameStyle | undefined {
  if (frame === 'pixel') return 'tablet1';
  if (frame === 'galaxy') return 'tablet2';
  if (
    frame === 'none' ||
    frame === 'flat' ||
    frame === 'rounded' ||
    frame === 'tablet1' ||
    frame === 'tablet2'
  ) {
    return frame;
  }
  return undefined;
}

class SettingsStore {
  #path = join(app.getPath('userData'), 'settings.json');
  #cache: AppSettings | null = null;

  get(): AppSettings {
    if (this.#cache) return this.#cache;

    const base = defaults();
    try {
      if (existsSync(this.#path)) {
        const parsed = JSON.parse(readFileSync(this.#path, 'utf8')) as Partial<AppSettings>;
        const storedStudio = (parsed.studio ?? {}) as Partial<StudioSettings> & { frame?: unknown };
        // Merge one level deep so new option keys pick up their defaults
        // instead of coming back undefined after an upgrade.
        this.#cache = {
          ...base,
          ...parsed,
          mirror: { ...base.mirror, ...(parsed.mirror ?? {}) },
          studio: {
            ...base.studio,
            ...storedStudio,
            frame: migrateFrame(storedStudio.frame) ?? base.studio.frame,
          },
        };
        return this.#cache;
      }
    } catch (error) {
      logger.warn('settings: could not read store, using defaults —', describeError(error));
    }

    this.#cache = base;
    return this.#cache;
  }

  set(patch: Partial<AppSettings>): AppSettings {
    const current = this.get();
    const next: AppSettings = {
      ...current,
      ...patch,
      mirror: { ...current.mirror, ...(patch.mirror ?? {}) },
      studio: { ...current.studio, ...(patch.studio ?? {}) },
    };
    this.#cache = next;
    this.#persist(next);
    return next;
  }

  reset(): AppSettings {
    const next = defaults();
    this.#cache = next;
    this.#persist(next);
    return next;
  }

  captureDirectory(): string {
    const configured = this.get().captureDirectory;
    const dir = configured ?? join(app.getPath('pictures'), 'CTRLbot Mirror');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  #persist(value: AppSettings): void {
    try {
      mkdirSync(dirname(this.#path), { recursive: true });
      writeFileSync(this.#path, JSON.stringify(value, null, 2), 'utf8');
    } catch (error) {
      logger.error('settings: write failed —', describeError(error));
    }
  }
}

export const settings = new SettingsStore();
