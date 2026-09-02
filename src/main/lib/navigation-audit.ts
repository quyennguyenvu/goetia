import type { ServiceId } from '../../shared/types';

/** Bound on distinct records. A site that redirect-loops through generated
 *  hostnames must not be able to grow this without limit. */
export const AUDIT_CAP = 100;

/** Report-only companion to `isNavigationAllowed`.
 *
 *  The policy is written and unit-tested but attached nowhere, because
 *  enforcing it before every service's real auth-redirect hosts are in
 *  ALLOWED_HOSTS would break logins. This records the origins a service
 *  actually tried to reach and the policy would refuse, so that list can be
 *  completed from evidence instead of guesswork — one line per service and
 *  origin, and it blocks nothing. */
export class NavigationAudit {
  private seen = new Set<string>();
  private capped = false;

  /** The record for a would-be block, or null when it is already known (or the
   *  cap is reached) and so not worth reporting again. */
  note(serviceId: ServiceId | string, url: string): string | null {
    let origin: string;
    try {
      origin = new URL(url).host;
    } catch {
      origin = url; // unparseable: report it verbatim, it is still evidence
    }
    const key = `${serviceId} ${origin}`;
    if (this.seen.has(key)) return null;
    if (this.seen.size >= AUDIT_CAP) {
      // log once when the cap is first hit, so a redirect-looping site going
      // "deaf" is visible rather than silently dropping every later refusal
      if (!this.capped) {
        this.capped = true;
        return `${key} (audit cap reached; further refusals unlogged)`;
      }
      return null;
    }
    this.seen.add(key);
    return key;
  }
}
