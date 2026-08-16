const GRANTED = new Set(['notifications', 'media', 'display-capture']);
/** Device/screen access may also come from a service's declared call
 *  surface (call-policy CALL_ORIGINS). Notifications never do. */
const CALL_SURFACE_OK = new Set(['media', 'display-capture']);

/** Grant only the permissions a chat service needs, and only to its own
 *  origin — plus, for calls, the service's declared call origins. A page
 *  navigated/redirected elsewhere gets nothing. */
export function permissionAllowed(opts: {
  permission: string;
  requestingUrl: string;
  serviceUrl: string;
  callOrigins?: readonly string[];
}): boolean {
  if (!GRANTED.has(opts.permission)) return false;
  try {
    const origin = new URL(opts.requestingUrl).origin;
    if (origin === new URL(opts.serviceUrl).origin) return true;
    return CALL_SURFACE_OK.has(opts.permission) && (opts.callOrigins ?? []).includes(origin);
  } catch {
    return false;
  }
}
