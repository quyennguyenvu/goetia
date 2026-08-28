import { describe, expect, it } from 'vitest';
import {
  capTrimMessage,
  pinRemovedMessage,
  purgeToastMessage,
  shouldToast,
  TOAST_MS,
} from '../../src/renderer/src/components/toast-rules';

describe('pinRemovedMessage', () => {
  it('tells Done and unpin apart — same effect, different intent', () => {
    expect(pinRemovedMessage('done')).toBe('Done — nice.');
    expect(pinRemovedMessage('unpin')).toBe('Unpinned.');
  });
});

describe('shouldToast', () => {
  it('announces a version the shell has not shown yet', () => {
    expect(shouldToast('0.3.0', null)).toBe(true);
    expect(shouldToast('0.3.1', '0.3.0')).toBe(true);
  });

  // shell:state is re-broadcast on every unrelated change; a repeat of the
  // same announce value must not re-toast
  it('ignores a repeat of the version it already showed', () => {
    expect(shouldToast('0.3.0', '0.3.0')).toBe(false);
  });

  it('never toasts when nothing is announced', () => {
    expect(shouldToast(null, null)).toBe(false);
    expect(shouldToast(null, '0.3.0')).toBe(false);
  });
});

describe('TOAST_MS', () => {
  it('is the eight seconds the design specifies', () => {
    expect(TOAST_MS).toBe(8000);
  });
});

describe('capTrimMessage', () => {
  it('is silent when nothing was trimmed', () => {
    expect(capTrimMessage([])).toBeNull();
  });

  it('names a single banished service', () => {
    expect(capTrimMessage(['Zalo'])).toBe(
      'Zalo was banished — nine services is the maximum. Summon it back any time from Home.',
    );
  });

  it('lists several with a plural verb', () => {
    expect(capTrimMessage(['Zalo', 'Shopee'])).toBe(
      'Zalo and Shopee were banished — nine services is the maximum. Summon them back any time from Home.',
    );
  });
});

describe('purgeToastMessage', () => {
  it('pluralizes the count', () => {
    expect(purgeToastMessage(1)).toBe('Purged 1 login.');
    expect(purgeToastMessage(10)).toBe('Purged 10 logins.');
  });

  // a cancelled sweep returns { purged: 0 } — the same shape a rejected
  // sender gets — and must show nothing at all
  it('says nothing when the sweep was cancelled', () => {
    expect(purgeToastMessage(0)).toBeNull();
  });
});
