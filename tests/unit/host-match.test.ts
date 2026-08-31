import { describe, expect, it } from 'vitest';
import { hostMatches } from '../../src/main/lib/host-match';

describe('hostMatches', () => {
  it('matches an exact entry only exactly', () => {
    expect(hostMatches('accounts.google.com', 'accounts.google.com')).toBe(true);
    expect(hostMatches('www.accounts.google.com', 'accounts.google.com')).toBe(false);
    expect(hostMatches('google.com', 'accounts.google.com')).toBe(false);
  });

  it('matches a suffix entry against the bare domain and any subdomain', () => {
    expect(hostMatches('slack.com', '.slack.com')).toBe(true);
    expect(hostMatches('acme.slack.com', '.slack.com')).toBe(true);
    expect(hostMatches('a.b.slack.com', '.slack.com')).toBe(true);
  });

  it('never lets a suffix match a lookalike', () => {
    expect(hostMatches('evilslack.com', '.slack.com')).toBe(false);
    expect(hostMatches('slack.com.evil.example', '.slack.com')).toBe(false);
    expect(hostMatches('notslack.com', '.slack.com')).toBe(false);
  });
});
