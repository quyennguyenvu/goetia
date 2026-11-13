import { createHash } from 'node:crypto';
import { nameKey } from '../../shared/name-key';

export function shouldNotify(opts: {
  serviceMuted: boolean;
  globalMuted: boolean;
  quietNow: boolean;
}): boolean {
  return !opts.serviceMuted && !opts.globalMuted && !opts.quietNow;
}

/** Muted means silent, so the page's own ding goes too — suppressing the
 *  banner alone left every service still audible. Defined as the inverse of
 *  shouldNotify so the two can't drift: whatever wouldn't raise a banner
 *  doesn't get to make a noise either. Badges are untouched by both, and
 *  quiet hours count as mute here, nowhere else. */
export function audioMuted(opts: {
  serviceMuted: boolean;
  globalMuted: boolean;
  quietNow: boolean;
}): boolean {
  return !shouldNotify(opts);
}

/** One sound per message. A banner the page raised itself already arrived with
 *  the page's own ding (Discord, WhatsApp, …), so only synthetic banners —
 *  recipes standing in for the push Electron can't receive — are Goetia's to
 *  sound. Both fields are set because the platforms disagree: macOS stays quiet
 *  unless a sound is named, Windows/Linux ring unless `silent` is. */
export function soundOptions(opts: { enabled: boolean; synthetic: boolean }): {
  silent: boolean;
  sound?: string;
} {
  return opts.enabled && opts.synthetic ? { silent: false, sound: 'default' } : { silent: true };
}

/** The title carries the sender alone now, so a recipe reporting an empty one
 *  would otherwise raise a headless banner. */
export function notificationTitle(raw: string, fallback: string): string {
  return raw.trim() || fallback;
}

/** A banner the page raised with nothing to say: it shows as the service's
 *  name and a blank line, which is worth one Diagnostics line when it happens. */
export function isWordless(title: string, body: string): boolean {
  return title.trim() === '' && body.trim() === '';
}

/** The stack a banner joins in Notification Center: one per conversation, so
 *  a noisy channel collapses into its own pile instead of burying every other
 *  chat. Hashed — an identifier is no place for a chat's name — and per
 *  service only while locked: a redacted banner must not be sorted by the
 *  conversation it hides. */
export function bannerGroupId(opts: {
  serviceId: string;
  conversation: string;
  locked: boolean;
}): string {
  const name = nameKey(opts.conversation).trim();
  if (opts.locked || name === '') return opts.serviceId;
  return `${opts.serviceId}:${createHash('sha256').update(name).digest('hex').slice(0, 16)}`;
}

export const BANNER_TITLE_MAX = 200;
export const BANNER_BODY_MAX = 500;

const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Banner text is page-controlled and typed only by convention — the shim can
 *  be bypassed by the page itself, so main re-coerces and clamps before any
 *  use. Newlines are kept: bodies render multiline. */
export function sanitizeBanner(title: unknown, body: unknown): { title: string; body: string } {
  return {
    title: typeof title === 'string' ? clip(title, BANNER_TITLE_MAX) : '',
    body: typeof body === 'string' ? clip(body, BANNER_BODY_MAX) : '',
  };
}
