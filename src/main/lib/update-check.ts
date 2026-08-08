/** The repo that publishes Goetia releases. Hardcoded on purpose: the
 *  download URL must never be derived from an API payload. */
export const REPO = 'quyennguyenvu/goetia';

export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function parts(v: string): { nums: number[]; pre: string | null } | null {
  if (!VERSION_RE.test(v)) return null;
  const dash = v.indexOf('-');
  const core = dash === -1 ? v : v.slice(0, dash);
  return { nums: core.split('.').map(Number), pre: dash === -1 ? null : v.slice(dash + 1) };
}

/** `tag_name` → bare version, or null when it is not a plain semver tag. */
export function parseLatestRelease(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const tag = (json as { tag_name?: unknown }).tag_name;
  if (typeof tag !== 'string') return null;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  return VERSION_RE.test(version) ? version : null;
}

/** -1 / 0 / 1. A prerelease sorts below the release it precedes; an
 *  unparsable input yields 0 so callers never act on a bogus ordering. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

export function isNewer(current: string, latest: string): boolean {
  return compareVersions(latest, current) > 0;
}

/** Built from an already-validated version, never from the payload. */
export function releaseUrl(version: string): string {
  return `https://github.com/${REPO}/releases/tag/v${version}`;
}
