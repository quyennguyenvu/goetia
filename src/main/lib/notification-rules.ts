export function shouldNotify(opts: { serviceMuted: boolean; globalMuted: boolean }): boolean {
  return !opts.serviceMuted && !opts.globalMuted;
}

/** The title carries the sender alone now, so a recipe reporting an empty one
 *  would otherwise raise a headless banner. */
export function notificationTitle(raw: string, fallback: string): string {
  return raw.trim() || fallback;
}
