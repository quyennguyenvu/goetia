import { hostMatches } from './host-match';

export interface IdentityProvider {
  /** exact host, or `.suffix` as in navigation-policy */
  host: string;
  /** path prefixes a popup may OPEN on; once open it roams the whole host */
  entryPaths: string[];
}

/** Identity providers a service page may open a sign-in popup on. Global,
 *  not per service (user decision, 2026-08-31): the popup is hardened
 *  regardless of who opened it, so a per-recipe declaration would buy no
 *  safety. Entry paths gate only the opening URL — the popup has to begin as
 *  an auth dialog. `[nav] popup denied:` lines are the evidence for growing
 *  this; VERIFY LIVE before trusting an entry. */
export const IDENTITY_PROVIDERS: IdentityProvider[] = [
  { host: 'accounts.google.com', entryPaths: ['/o/oauth2/', '/gsi/', '/signin/'] },
  { host: 'www.facebook.com', entryPaths: ['/dialog/oauth', '/login'] },
  { host: 'm.facebook.com', entryPaths: ['/dialog/oauth', '/login'] },
  { host: 'appleid.apple.com', entryPaths: ['/auth/'] },
  { host: 'login.microsoftonline.com', entryPaths: ['/'] },
  { host: 'login.live.com', entryPaths: ['/'] },
  { host: 'x.com', entryPaths: ['/i/oauth2/', '/oauth/'] },
  { host: 'twitter.com', entryPaths: ['/i/oauth2/', '/oauth/'] },
  { host: 'api.twitter.com', entryPaths: ['/oauth/'] },
  { host: 'access.line.me', entryPaths: ['/oauth2/'] },
  { host: 'kauth.kakao.com', entryPaths: ['/oauth/'] },
  { host: 'accounts.kakao.com', entryPaths: ['/login'] },
];

/** Hosts a flow reaches mid-popup that are never an entry point. Evidence:
 *  the FB JS SDK's dialog redirect_uri is the xd_arbiter on
 *  staticxx.facebook.com (TikTok live pass, 2026-08-31) — blocking that hop
 *  kills the login after the user has signed in. */
export const ROAMING_HOSTS: string[] = ['.facebook.com'];

/** Facebook versions its dialog path (`/v19.0/dialog/oauth`); the version
 *  segment is dropped so the table names the dialog once. */
const GRAPH_VERSION = /^\/v\d+(\.\d+)?(?=\/)/;

function parseHttps(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** May a service view open this URL as an identity popup? */
export function isIdentityPopup(url: string): boolean {
  const u = parseHttps(url);
  if (!u) return false;
  const path = u.pathname.replace(GRAPH_VERSION, '');
  return IDENTITY_PROVIDERS.some(
    (p) => hostMatches(u.host, p.host) && p.entryPaths.some((prefix) => path.startsWith(prefix)),
  );
}

/** webRequest match patterns for the hosts UA client hints are restored on.
 *  Registering onBeforeSendHeaders without a filter forces Chromium to hand
 *  EVERY request in the session to main's JS thread — this keeps the other
 *  99.9% off it. A `.suffix` host expands to the wildcard plus the bare host,
 *  matching hostMatches. */
export function identityUrlPatterns(): string[] {
  return [...IDENTITY_PROVIDERS.map((p) => p.host), ...ROAMING_HOSTS].flatMap((h) =>
    h.startsWith('.') ? [`https://*${h}/*`, `https://${h.slice(1)}/*`] : [`https://${h}/*`],
  );
}

/** May an open identity popup navigate here? Any path on a provider host —
 *  the IdP roams its own pages (account picker, consent, 2FA). */
export function isIdentityHost(url: string): boolean {
  const u = parseHttps(url);
  if (!u) return false;
  return (
    IDENTITY_PROVIDERS.some((p) => hostMatches(u.host, p.host)) ||
    ROAMING_HOSTS.some((h) => hostMatches(u.host, h))
  );
}
