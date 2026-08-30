import { PASSKEY_TEXT_MAX } from '../../shared/passkeys';
import type { PasskeyView, ServiceId } from '../../shared/types';
import { fromBase64Url } from '../../shared/webauthn';
import { clampText } from './pin-rules';

/** One discoverable credential. Every base64url field stays a string so the
 *  record round-trips through JSON untouched. */
export interface Passkey {
  id: string;
  rpId: string;
  userHandle: string;
  userName: string;
  displayName: string;
  /** safeStorage ciphertext (base64) of the PKCS#8 PEM */
  privateKey: string;
  publicKeyCose: string;
  createdIn: ServiceId;
  createdAt: number;
  lastUsedAt: number;
}

export function accountLabel(p: Pick<Passkey, 'userName' | 'displayName'>): string {
  return p.displayName || p.userName || '(unnamed account)';
}

/** Tolerant loader for passkeys.json: anything not a well-formed record is
 *  dropped, as is one for a service no longer in the catalog. Ids stay unique. */
export function parsePasskeys(raw: unknown, known: ReadonlySet<string>): Passkey[] {
  if (!Array.isArray(raw)) return [];
  const out: Passkey[] = [];
  const ids = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (!isB64(r.id) || ids.has(r.id) || !isB64(r.userHandle) || !isB64(r.publicKeyCose)) continue;
    if (typeof r.rpId !== 'string' || r.rpId === '') continue;
    if (typeof r.privateKey !== 'string' || r.privateKey === '') continue;
    if (typeof r.createdIn !== 'string' || !known.has(r.createdIn)) continue;
    ids.add(r.id);
    out.push({
      id: r.id,
      rpId: r.rpId,
      userHandle: r.userHandle,
      userName: typeof r.userName === 'string' ? clampText(r.userName, PASSKEY_TEXT_MAX) : '',
      displayName:
        typeof r.displayName === 'string' ? clampText(r.displayName, PASSKEY_TEXT_MAX) : '',
      privateKey: r.privateKey,
      publicKeyCose: r.publicKeyCose,
      createdIn: r.createdIn as ServiceId,
      createdAt: clock(r.createdAt),
      lastUsedAt: clock(r.lastUsedAt),
    });
  }
  return out;
}

function isB64(v: unknown): v is string {
  return typeof v === 'string' && v !== '' && fromBase64Url(v) !== null;
}

function clock(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Renderer rows: display fields and the opaque id — never the key. */
export function passkeyViews(list: readonly Passkey[]): PasskeyView[] {
  return list.map((p) => ({
    id: p.id,
    rpId: p.rpId,
    account: accountLabel(p),
    createdIn: p.createdIn,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
  }));
}
