import { describe, expect, it } from 'vitest';
import { purgeAllCopy, purgeLoginCopy } from '../../src/shared/purge-copy';

describe('purgeLoginCopy', () => {
  it('names the service and labels the confirm', () => {
    const c = purgeLoginCopy('Telegram');
    expect(c.title).toBe('Purge the Telegram login?');
    expect(c.confirmLabel).toBe('Purge');
  });

  // the caveat is the whole reason for the rename — it must not be droppable
  it('states the device-only scope and the ended call', () => {
    const c = purgeLoginCopy('Telegram');
    expect(c.detail).toContain('this device');
    expect(c.detail).toContain('call');
    expect(c.detail).toContain('stays active');
  });

  // purge wipes the session, not the credential — the dialog has to say so
  it('says passkeys are kept and where to forget them', () => {
    expect(purgeLoginCopy('Telegram').detail).toContain('passkeys are kept');
    expect(purgeLoginCopy('Telegram').detail).toContain('Settings → Passkeys');
  });

  it('carries no checkbox — one service is not the heavy action', () => {
    expect(purgeLoginCopy('Telegram').checkboxLabel).toBeUndefined();
  });
});

describe('purgeAllCopy', () => {
  it('counts the services and gates on the acknowledgement checkbox', () => {
    const c = purgeAllCopy(10);
    expect(c.title).toBe('Purge all 10 logins?');
    expect(c.checkboxLabel).toBe('Yes, wipe every service');
    expect(c.confirmLabel).toBe('Purge All');
  });

  it('pluralizes on the count', () => {
    expect(purgeAllCopy(1).title).toBe('Purge all 1 login?');
    expect(purgeAllCopy(2).title).toBe('Purge all 2 logins?');
  });

  // the sweep is the ONLY path to an unbound service's credentials, so the
  // dialog has to say it reaches them
  it('names summoned and unbound, and keeps the account caveat', () => {
    const c = purgeAllCopy(10);
    expect(c.detail).toContain('summoned and unbound');
    expect(c.detail).toContain('this device');
    expect(c.detail).toContain('stay active');
  });

  it('says passkeys are kept', () => {
    expect(purgeAllCopy(10).detail).toContain('passkeys are kept');
  });
});
