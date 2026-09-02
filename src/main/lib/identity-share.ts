import type { Cookie, CookiesSetDetails } from 'electron';
import { SERVICES } from '../../shared/services';
import type { ServiceId } from '../../shared/types';
import { hostMatches } from './host-match';
import { isIdentityPopup } from './identity-policy';

/** Suffix entry, as in navigation-policy: matches facebook.com and any
 *  subdomain, never a lookalike. */
export const FACEBOOK_COOKIE_DOMAIN = '.facebook.com';

/** Facebook app id per service, captured from a live sign-in under
 *  GOETIA_DEBUG_CALLS=1 (spec §Live pass, step 1). A service with no entry is
 *  never seeded — this table is what stops a malicious or XSS'd service page
 *  from opening its OWN dialog against a signed-in jar and collecting a token
 *  on one click. Never fill an entry in from memory or a search. */
export const FB_APP_IDS: Partial<Record<ServiceId, string>> = {
  // captured 2026-09-02 from a live "Continue with Facebook" on each service
  // (GOETIA_DEBUG_CALLS=1, `window.open from <id>:` lines)
  shopee: '421039428061656',
  tiktok: '1862952583919182',
};

/** The service whose own URL is a facebook host: its partition holds a real
 *  www.facebook.com session by construction, which is what makes it the
 *  source rather than a lucky coincidence. Null degrades the feature to off
 *  rather than failing the boot. */
export const IDENTITY_SOURCE: ServiceId | null =
  SERVICES.find((s) => {
    try {
      return hostMatches(new URL(s.url).host, FACEBOOK_COOKIE_DOMAIN);
    } catch {
      return false;
    }
  })?.id ?? null;

/** Chromium reports a domain cookie as `.facebook.com` and a host-only one as
 *  `www.facebook.com`; hostMatches wants the bare host either way. */
export function isFacebookCookieDomain(domain: string): boolean {
  if (!domain) return false;
  return hostMatches(domain.replace(/^\./, ''), FACEBOOK_COOKIE_DOMAIN);
}

/** A Facebook sign-in dialog specifically — isIdentityPopup already owns the
 *  https check, the version-segment strip and the entry-path prefixes, so
 *  this narrows its verdict to the one provider that is shared. */
export function isFacebookDialog(url: string): boolean {
  if (!isIdentityPopup(url)) return false;
  try {
    return hostMatches(new URL(url).host, FACEBOOK_COOKIE_DOMAIN);
  } catch {
    return false;
  }
}

export function facebookAppId(url: string): string | null {
  try {
    const q = new URL(url).searchParams;
    return q.get('client_id') ?? q.get('app_id');
  } catch {
    return null;
  }
}

/** c_user is Facebook's signed-in user id; datr and sb are set for anyone. */
export function hasFacebookSession(cookies: Cookie[]): boolean {
  return cookies.some((c) => c.name === 'c_user' && isFacebookCookieDomain(c.domain ?? ''));
}

/** Electron's `Cookie` → the `CookiesSetDetails` that reproduces it.
 *  A host-only cookie must NOT carry `domain`, or set() widens it to the whole
 *  registrable domain; a domain cookie must, or set() narrows it to one host.
 *  Either mistake drops the session without an error. */
export function cookieSetDetails(cookie: Cookie): CookiesSetDetails {
  const domain = cookie.domain ?? '';
  const path = cookie.path ?? '/';
  const host = domain.replace(/^\./, '');
  return {
    url: `${cookie.secure ? 'https' : 'http'}://${host}${path}`,
    name: cookie.name,
    value: cookie.value,
    ...(domain.startsWith('.') ? { domain } : {}),
    path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expirationDate: cookie.expirationDate,
    sameSite: cookie.sameSite,
  };
}

export interface SeedSyncInput {
  enabled: boolean;
  target: ServiceId;
  popupUrl: string;
  /** injected so the truth table is testable without mutating FB_APP_IDS */
  appIds?: Partial<Record<ServiceId, string>>;
}

export interface SeedJarInput {
  sourceHasSession: boolean;
  targetHasSession: boolean;
}

/** Rules 1-4: everything decidable without reading a cookie jar. This is what
 *  decides whether the popup's load is interrupted at all, so it has to answer
 *  before the first await (see views.ts seedIdentityPopup). */
export function maySeed({
  enabled,
  target,
  popupUrl,
  appIds = FB_APP_IDS,
}: SeedSyncInput): boolean {
  if (!enabled) return false;
  if (!isFacebookDialog(popupUrl)) return false;
  const wanted = appIds[target];
  if (!wanted || facebookAppId(popupUrl) !== wanted) return false;
  return IDENTITY_SOURCE !== null && target !== IDENTITY_SOURCE;
}

/** All six rules. Rule 6 leaves Instagram's own Log-in-with-Facebook cookies
 *  alone and makes a deliberate second-account login permanently sticky. */
export function shouldSeed(input: SeedSyncInput & SeedJarInput): boolean {
  return maySeed(input) && input.sourceHasSession && !input.targetHasSession;
}
