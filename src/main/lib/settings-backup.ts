import type { RailPosition, Settings, ThemePref } from '../../shared/types';

export const BACKUP_FORMAT = 'goetia-settings';
export const BACKUP_VERSION = 1;
/** a preferences file is a few KB; anything near this is not one */
export const BACKUP_MAX_BYTES = 1_000_000;

/** What travels — an allowlist, so a key added to Settings later stays home
 *  until someone decides it should not. Left behind on purpose: moments
 *  (`lastUsedAt`, `mutedUntil`, `globalMutedUntil`, `quietOverrideWindowStart`),
 *  this session's state (`lastActiveId`, `lastHomeOpen`, `lastNotifiedVersion`)
 *  and `appLock`, whose passcode lives in lock.json and stays. */
export const BACKUP_KEYS = [
  'order',
  'muted',
  'disabled',
  'globalMuted',
  'notificationSound',
  'neverHibernate',
  'zoom',
  'hibernationMinutes',
  'autoBanish',
  'lightSleep',
  'peekSaver',
  'shareFacebookLogin',
  'downloads',
  'quietHours',
  'summonHotkey',
  'closeToTray',
  'launchAtLogin',
  'theme',
  'railPosition',
  'checkForUpdates',
] as const;
export type BackupKey = (typeof BACKUP_KEYS)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** the Goetia version that wrote it */
  app: string;
  exportedAt: string;
  settings: Pick<Settings, BackupKey>;
}

export function buildBackup(s: Settings, app: string, now: Date): BackupFile {
  const settings = {} as Pick<Settings, BackupKey>;
  for (const k of BACKUP_KEYS) (settings as Record<string, unknown>)[k] = s[k];
  // the download folder is this machine's; the mode is a preference
  settings.downloads = { ask: s.downloads.ask, dir: null };
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app,
    exportedAt: now.toISOString(),
    settings,
  };
}

export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `goetia-settings-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export type ParseFailure = 'not-json' | 'not-goetia' | 'too-large' | 'empty';

const THEMES: ThemePref[] = ['system', 'light', 'dark'];
const RAILS: RailPosition[] = ['top', 'left', 'right'];
const BOOLEANS: BackupKey[] = [
  'globalMuted',
  'notificationSound',
  'lightSleep',
  'peekSaver',
  'shareFacebookLogin',
  'closeToTray',
  'launchAtLogin',
  'checkForUpdates',
];

/** A scalar the file got wrong is dropped, not defaulted: a restore must
 *  never move a preference to a value the file did not name. Records are
 *  passed through for the store's own normalize, which coerces them field by
 *  field exactly as it does for a hand-mangled settings.json. */
function accept(key: BackupKey, v: unknown): unknown {
  if (BOOLEANS.includes(key)) return typeof v === 'boolean' ? v : undefined;
  switch (key) {
    case 'theme':
      return THEMES.includes(v as ThemePref) ? v : undefined;
    case 'railPosition':
      return RAILS.includes(v as RailPosition) ? v : undefined;
    case 'hibernationMinutes':
      return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
    case 'downloads': {
      if (!v || typeof v !== 'object') return undefined;
      const ask = (v as { ask?: unknown }).ask;
      return typeof ask === 'boolean' ? { ask, dir: null } : undefined;
    }
    default:
      return v && typeof v === 'object' ? v : undefined;
  }
}

/** The file is data: allowlisted keys only, scalars type-checked, the rest
 *  ignored. Sized before parsing so a huge file costs nothing. */
export function parseBackup(
  text: string,
): { ok: true; patch: Partial<Settings> } | { ok: false; reason: ParseFailure } {
  if (text.length > BACKUP_MAX_BYTES) return { ok: false, reason: 'too-large' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not-goetia' };
  }
  const file = raw as { format?: unknown; settings?: unknown };
  if (file.format !== BACKUP_FORMAT || !file.settings || typeof file.settings !== 'object') {
    return { ok: false, reason: 'not-goetia' };
  }
  const source = file.settings as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const k of BACKUP_KEYS) {
    if (!(k in source)) continue;
    const v = accept(k, source[k]);
    if (v !== undefined) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, patch: patch as Partial<Settings> };
}
