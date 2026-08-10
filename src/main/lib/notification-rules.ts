export function shouldNotify(opts: { serviceMuted: boolean; globalMuted: boolean }): boolean {
  return !opts.serviceMuted && !opts.globalMuted;
}

/** Muted means silent, so the page's own ding goes too — suppressing the
 *  banner alone left every service still audible. Defined as the inverse of
 *  shouldNotify so the two can't drift: whatever wouldn't raise a banner
 *  doesn't get to make a noise either. Badges are untouched by both. */
export function audioMuted(opts: { serviceMuted: boolean; globalMuted: boolean }): boolean {
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
