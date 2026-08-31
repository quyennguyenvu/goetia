/** Whether `host` matches an allowlist entry. An entry starting with `.` is
 *  a suffix: `.slack.com` matches `slack.com` and any subdomain of it — the
 *  only way to express per-workspace hosts — and never a lookalike, which a
 *  bare endsWith would admit (`evilslack.com`). */
export function hostMatches(host: string, entry: string): boolean {
  if (!entry.startsWith('.')) return host === entry;
  return host === entry.slice(1) || host.endsWith(entry);
}
