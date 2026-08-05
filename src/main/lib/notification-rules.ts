export function shouldNotify(opts: { serviceMuted: boolean; globalMuted: boolean }): boolean {
  return !opts.serviceMuted && !opts.globalMuted;
}
