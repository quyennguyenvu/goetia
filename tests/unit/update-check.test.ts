import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl } from '../../src/main/lib/external-url';
import {
  compareVersions,
  isNewer,
  parseLatestRelease,
  releaseUrl,
} from '../../src/main/lib/update-check';

describe('parseLatestRelease', () => {
  it('accepts a v-prefixed semver tag', () => {
    expect(parseLatestRelease({ tag_name: 'v0.3.0' })).toBe('0.3.0');
  });

  it('accepts a bare semver tag', () => {
    expect(parseLatestRelease({ tag_name: '1.2.3' })).toBe('1.2.3');
  });

  it('accepts a prerelease tag', () => {
    expect(parseLatestRelease({ tag_name: 'v0.3.0-rc.1' })).toBe('0.3.0-rc.1');
  });

  // the payload is attacker-shaped input: anything that is not a plain
  // version must be refused, because a version string becomes a URL
  it.each([
    ['missing tag_name', {}],
    ['non-string tag', { tag_name: 42 }],
    ['null tag', { tag_name: null }],
    ['non-object payload', 'v0.3.0'],
    ['null payload', null],
    ['array payload', []],
    ['a word', { tag_name: 'latest' }],
    ['two-part version', { tag_name: 'v1.2' }],
    ['path traversal', { tag_name: 'v1.0.0/../../evil' }],
    ['embedded url', { tag_name: 'v1.0.0 https://evil.test' }],
    ['newline injection', { tag_name: 'v1.0.0\nv9.9.9' }],
  ])('rejects %s', (_label, payload) => {
    expect(parseLatestRelease(payload)).toBeNull();
  });
});

describe('compareVersions', () => {
  it.each([
    ['0.3.0', '0.2.0', 1],
    ['0.2.0', '0.3.0', -1],
    ['0.2.0', '0.2.0', 0],
    ['1.0.0', '0.99.99', 1],
    ['0.10.0', '0.9.0', 1], // numeric, not lexical
    ['0.3.0', '0.3.0-rc.1', 1], // a release beats its prerelease
    ['0.3.0-rc.1', '0.3.0', -1],
    ['0.3.0-rc.2', '0.3.0-rc.1', 1],
  ])('compare(%s, %s) === %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('refuses to order an unparsable version', () => {
    expect(compareVersions('99.0.0', 'not-a-version')).toBe(0);
  });
});

describe('isNewer', () => {
  it('is true only when latest is ahead', () => {
    expect(isNewer('0.2.0', '0.3.0')).toBe(true);
    expect(isNewer('0.3.0', '0.3.0')).toBe(false);
    expect(isNewer('0.3.0', '0.2.0')).toBe(false);
  });

  // a garbled running version must not manufacture a permanent update banner
  it('never reports an update when the running version is unparsable', () => {
    expect(isNewer('not-a-version', '99.0.0')).toBe(false);
  });
});

describe('releaseUrl', () => {
  it('points at the tag page and is safe to hand to the OS', () => {
    const url = releaseUrl('0.3.0');
    expect(url).toBe('https://github.com/quyennguyenvu/goetia/releases/tag/v0.3.0');
    expect(isSafeExternalUrl(url)).toBe(true);
  });
});
