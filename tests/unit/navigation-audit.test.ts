import { describe, expect, it } from 'vitest';
import { AUDIT_CAP, NavigationAudit } from '../../src/main/lib/navigation-audit';

describe('NavigationAudit', () => {
  // B1a: isNavigationAllowed is written and tested but attached nowhere. Before
  // it can enforce, ALLOWED_HOSTS needs the real auth-redirect hosts — this
  // records them from evidence instead of guesswork, blocking nothing.
  it('reports a would-be block once per service and origin', () => {
    const audit = new NavigationAudit();
    expect(audit.note('slack', 'https://auth.example.com/sso?a=1')).toBe('slack auth.example.com');
    expect(audit.note('slack', 'https://auth.example.com/sso?a=2')).toBeNull();
    expect(audit.note('slack', 'https://other.example.com/x')).toBe('slack other.example.com');
    expect(audit.note('teams', 'https://auth.example.com/sso')).toBe('teams auth.example.com');
  });

  it('stops recording once capped, so a redirect loop cannot grow it forever', () => {
    const audit = new NavigationAudit();
    for (let i = 0; i < AUDIT_CAP; i++) {
      expect(audit.note('slack', `https://h${i}.example.com/`)).not.toBeNull();
    }
    expect(audit.note('slack', 'https://overflow.example.com/')).toBeNull();
  });

  it('records an unparseable url without throwing', () => {
    const audit = new NavigationAudit();
    expect(audit.note('zalo', 'not a url')).toBe('zalo not a url');
    expect(audit.note('zalo', 'not a url')).toBeNull();
  });
});
