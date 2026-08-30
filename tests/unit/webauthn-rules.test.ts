import { describe, expect, it } from 'vitest';
import {
  hostOfOrigin,
  parseAssertion,
  parseCreation,
  rpIdAllowed,
  WebAuthnError,
} from '../../src/main/lib/webauthn-rules';

const challenge = 'Y2hhbGxlbmdl'; // "challenge"
const create = (over: Record<string, unknown> = {}) => ({
  rp: { id: 'microsoft.com', name: 'Microsoft' },
  user: { id: 'dXNlci0x', name: 'quyen@example.com', displayName: 'Quyen' },
  challenge,
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  ...over,
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof WebAuthnError ? e.code : `not a WebAuthnError: ${String(e)}`;
  }
  return 'no throw';
};

describe('rpIdAllowed', () => {
  it.each([
    ['teams.microsoft.com', 'teams.microsoft.com', true],
    ['teams.microsoft.com', 'microsoft.com', true],
    ['login.microsoftonline.com', 'microsoftonline.com', true],
    ['teams.microsoft.com', 'com', false], // single label
    ['teams.microsoft.com', 'evilmicrosoft.com', false], // suffix, not a label boundary
    ['teams.microsoft.com', 'google.com', false],
    ['microsoft.com', 'teams.microsoft.com', false], // rpId may not be a subdomain
    ['teams.microsoft.com', '', false],
    ['Teams.Microsoft.com', 'microsoft.COM', true], // hosts are case-insensitive
  ])('%s claiming %s → %s', (host, rpId, ok) => {
    expect(rpIdAllowed(host, rpId)).toBe(ok);
  });
});

describe('hostOfOrigin', () => {
  it('returns the lower-cased host of an https origin', () => {
    expect(hostOfOrigin('https://Teams.Microsoft.com')).toBe('teams.microsoft.com');
  });
  it('refuses anything but https as SecurityError', () => {
    expect(code(() => hostOfOrigin('http://teams.microsoft.com'))).toBe('SecurityError');
    expect(code(() => hostOfOrigin('about:blank'))).toBe('SecurityError');
    expect(code(() => hostOfOrigin('not a url'))).toBe('SecurityError');
  });
});

describe('parseCreation', () => {
  it('reads the request and defaults rpId to the host', () => {
    const req = parseCreation(create({ rp: { name: 'x' } }), 'teams.microsoft.com');
    expect(req.rpId).toBe('teams.microsoft.com');
    expect(req.challenge).toBe(challenge);
    expect(req.userHandle).toBe('dXNlci0x');
    expect(req.userName).toBe('quyen@example.com');
    expect(req.displayName).toBe('Quyen');
    expect(req.excludeIds).toEqual([]);
    expect(req.wantsCredProps).toBe(false);
  });

  it('accepts a registrable-suffix rpId and rejects others as SecurityError', () => {
    expect(parseCreation(create(), 'teams.microsoft.com').rpId).toBe('microsoft.com');
    expect(code(() => parseCreation(create(), 'accounts.google.com'))).toBe('SecurityError');
  });

  it('requires ES256 unless the list is empty (spec: empty means any)', () => {
    expect(
      code(() =>
        parseCreation(
          create({ pubKeyCredParams: [{ type: 'public-key', alg: -257 }] }),
          'teams.microsoft.com',
        ),
      ),
    ).toBe('NotSupportedError');
    expect(parseCreation(create({ pubKeyCredParams: [] }), 'teams.microsoft.com').rpId).toBe(
      'microsoft.com',
    );
  });

  it('refuses a roaming-authenticator request — this is a platform authenticator', () => {
    expect(
      code(() =>
        parseCreation(
          create({ authenticatorSelection: { authenticatorAttachment: 'cross-platform' } }),
          'teams.microsoft.com',
        ),
      ),
    ).toBe('NotAllowedError');
  });

  it('keeps only well-formed excludeCredentials and reads credProps', () => {
    const req = parseCreation(
      create({
        excludeCredentials: [
          { type: 'public-key', id: 'YWJj' },
          { type: 'other', id: 'ZGVm' },
          { type: 'public-key', id: 'no+pe' },
        ],
        extensions: { credProps: true },
      }),
      'teams.microsoft.com',
    );
    expect(req.excludeIds).toEqual(['YWJj']);
    expect(req.wantsCredProps).toBe(true);
  });

  it('rejects a malformed challenge or user id as NotAllowedError', () => {
    expect(code(() => parseCreation(create({ challenge: 'a+b' }), 'teams.microsoft.com'))).toBe(
      'NotAllowedError',
    );
    expect(code(() => parseCreation(create({ challenge: '' }), 'teams.microsoft.com'))).toBe(
      'NotAllowedError',
    );
    expect(
      code(() =>
        parseCreation(
          create({ user: { id: 7, name: 'x', displayName: 'x' } }),
          'teams.microsoft.com',
        ),
      ),
    ).toBe('NotAllowedError');
  });

  it('clamps account text to one row', () => {
    const req = parseCreation(
      create({ user: { id: 'dXNlci0x', name: 'a'.repeat(300), displayName: '  b \n c ' } }),
      'teams.microsoft.com',
    );
    expect(req.userName).toHaveLength(120);
    expect(req.displayName).toBe('b c');
  });
});

describe('parseAssertion', () => {
  it('reads rpId, challenge and the allow list', () => {
    const req = parseAssertion(
      {
        rpId: 'microsoft.com',
        challenge,
        allowCredentials: [{ type: 'public-key', id: 'YWJj' }],
      },
      'teams.microsoft.com',
    );
    expect(req).toEqual({ rpId: 'microsoft.com', challenge, allowIds: ['YWJj'] });
  });
  it('defaults rpId to the host and the allow list to empty (discoverable)', () => {
    expect(parseAssertion({ challenge }, 'teams.microsoft.com')).toEqual({
      rpId: 'teams.microsoft.com',
      challenge,
      allowIds: [],
    });
  });
  it('rejects a foreign rpId as SecurityError', () => {
    expect(
      code(() => parseAssertion({ rpId: 'google.com', challenge }, 'teams.microsoft.com')),
    ).toBe('SecurityError');
  });
});
