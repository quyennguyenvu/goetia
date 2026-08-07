const GRANTED = new Set(['notifications', 'media']);

/** Grant only the permissions a chat service needs, and only to its own
 *  origin — a page navigated/redirected elsewhere gets nothing. */
export function permissionAllowed(opts: {
  permission: string;
  requestingUrl: string;
  serviceUrl: string;
}): boolean {
  if (!GRANTED.has(opts.permission)) return false;
  try {
    return new URL(opts.requestingUrl).origin === new URL(opts.serviceUrl).origin;
  } catch {
    return false;
  }
}
