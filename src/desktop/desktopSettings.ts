import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_AUTO_FETCH_MINUTES, isAutoFetchChoice } from './gitPolicy';
import type { Rect } from './windowBounds';

export interface WindowState extends Rect {
  maximized: boolean;
}

/** What the desktop app remembers, in `settings.json` under userData. */
export interface DesktopSettings {
  docsPath: string | null;
  /** Most recent first, the current folder included. */
  recentFolders: string[];
  window: WindowState | null;
  /** Reused so the page keeps its origin, and so its local storage. */
  port: number | null;
  /** Background fetch interval in minutes; 0 turns it off. */
  autoFetchMinutes: number;
}

export const MAX_RECENT_FOLDERS = 5;

export const DEFAULT_SETTINGS: DesktopSettings = {
  docsPath: null,
  recentFolders: [],
  window: null,
  port: null,
  autoFetchMinutes: DEFAULT_AUTO_FETCH_MINUTES,
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPath = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && !value.includes('\0');

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function parseWindow(value: unknown): WindowState | null {
  if (!isObject(value)) return null;
  const { x, y, width, height, maximized } = value;
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) {
    return null;
  }
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    maximized: maximized === true,
  };
}

/** Settings from the file's text; anything missing or malformed is a default. */
export function parseSettings(text: string | null): DesktopSettings {
  if (text === null) return DEFAULT_SETTINGS;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!isObject(raw)) return DEFAULT_SETTINGS;
  const recent = Array.isArray(raw.recentFolders)
    ? raw.recentFolders.filter(isPath)
    : [];
  const port = raw.port;
  return {
    docsPath: isPath(raw.docsPath) ? raw.docsPath : null,
    recentFolders: [...new Set(recent)].slice(0, MAX_RECENT_FOLDERS),
    window: parseWindow(raw.window),
    port:
      typeof port === 'number' &&
      Number.isInteger(port) &&
      port >= 1024 &&
      port <= 65535
        ? port
        : null,
    autoFetchMinutes: isAutoFetchChoice(raw.autoFetchMinutes)
      ? raw.autoFetchMinutes
      : DEFAULT_AUTO_FETCH_MINUTES,
  };
}

/**
 * `folder` first, without duplicates, at most MAX_RECENT_FOLDERS. Windows
 * and macOS paths are compared ignoring case, as their file systems do.
 */
export function pushRecentFolder(
  list: readonly string[],
  folder: string,
  ignoreCase: boolean,
): string[] {
  const key = (value: string) => (ignoreCase ? value.toLowerCase() : value);
  return [folder, ...list.filter((item) => key(item) !== key(folder))].slice(
    0,
    MAX_RECENT_FOLDERS,
  );
}

export function readSettingsFile(file: string): DesktopSettings {
  try {
    return parseSettings(fs.readFileSync(file, 'utf8'));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Writes beside the file, then renames over it, so a crash leaves one whole. */
export function writeSettingsFile(
  file: string,
  settings: DesktopSettings,
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}
