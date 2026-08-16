import { describe, expect, it } from 'vitest';
import {
  CALL_ORIGINS,
  CALL_POPUPS,
  isBlankCallPopup,
  isCallPopup,
} from '../../src/main/lib/call-policy';
import { SERVICES } from '../../src/shared/services';

describe('isCallPopup', () => {
  it('accepts the seeded messenger call popups', () => {
    expect(isCallPopup('messenger', 'https://www.messenger.com/videocall/?id=1')).toBe(true);
    expect(isCallPopup('messenger', 'https://www.messenger.com/groupcall/room/x')).toBe(true);
    expect(isCallPopup('messenger', 'https://www.facebook.com/groupcall/room/x')).toBe(true);
  });

  it('requires https', () => {
    expect(isCallPopup('messenger', 'http://www.messenger.com/videocall/')).toBe(false);
    expect(isCallPopup('messenger', 'file:///videocall')).toBe(false);
  });

  it('matches by exact host and path prefix only', () => {
    expect(isCallPopup('messenger', 'https://evil.messenger.com/videocall/')).toBe(false);
    expect(isCallPopup('messenger', 'https://www.messenger.com/marketplace')).toBe(false);
  });

  it('rejects junk without throwing', () => {
    expect(isCallPopup('messenger', 'not a url')).toBe(false);
    expect(isCallPopup('messenger', '')).toBe(false);
  });

  it('returns false for everything on services with no call popups', () => {
    expect(isCallPopup('whatsapp', 'https://web.whatsapp.com/call')).toBe(false);
    expect(isCallPopup('shopee', 'https://shopee.vn/anything')).toBe(false);
  });

  it('declares both maps for every service in the catalog', () => {
    for (const { id } of SERVICES) {
      expect(Array.isArray(CALL_POPUPS[id])).toBe(true);
      expect(Array.isArray(CALL_ORIGINS[id])).toBe(true);
    }
  });
});

describe('isBlankCallPopup', () => {
  it('allows a blank popup only for services that declare call popups', () => {
    expect(isBlankCallPopup('messenger', 'about:blank')).toBe(true);
    expect(isBlankCallPopup('messenger', '')).toBe(true);
    expect(isBlankCallPopup('whatsapp', 'about:blank')).toBe(false);
    expect(isBlankCallPopup('shopee', 'about:blank')).toBe(false);
  });

  it('never admits a real URL — that is isCallPopup territory', () => {
    expect(isBlankCallPopup('messenger', 'https://www.messenger.com/videocall/')).toBe(false);
    expect(isBlankCallPopup('messenger', 'about:blank#frag')).toBe(false);
  });
});
