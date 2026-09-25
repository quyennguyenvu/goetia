import { describe, expect, it } from 'vitest';
import {
  acceptReport,
  conversationKey,
  RECENT_LABEL_MAX,
  RECENTS_CAP,
  type RecentEntry,
  recentLabel,
  recentRows,
  restoreRecents,
  sanitizeReport,
  upsertRecent,
} from '../../src/main/lib/recents-rules';

const entry = (n: number, over: Partial<RecentEntry> = {}): RecentEntry => ({
  id: n,
  serviceId: 'whatsapp',
  label: `chat ${n}`,
  url: 'https://web.whatsapp.com/',
  at: n,
  ...over,
});

describe('sanitizeReport', () => {
  it('type-checks, strips control characters, collapses whitespace and clips', () => {
    expect(
      sanitizeReport({
        conversation: ' Minh\u0000 Anh ',
        url: 'https://web.whatsapp.com/',
        title: 'x\ny',
      }),
    ).toEqual({ conversation: 'Minh Anh', url: 'https://web.whatsapp.com/', title: 'x y' });
    expect(sanitizeReport({ conversation: 42, url: 'https://a.b/', title: null })).toEqual({
      conversation: null,
      url: 'https://a.b/',
      title: '',
    });
    const long = 'a'.repeat(200);
    expect(
      sanitizeReport({ conversation: long, url: 'https://a.b/', title: '' })?.conversation,
    ).toHaveLength(RECENT_LABEL_MAX);
  });

  it('is null without a URL that parses', () => {
    expect(sanitizeReport({ conversation: 'x', url: 'nope', title: 'x' })).toBeNull();
    expect(sanitizeReport({ conversation: 'x', url: 7, title: 'x' })).toBeNull();
  });
});

describe('acceptReport', () => {
  const ok = {
    serviceId: 'whatsapp' as const,
    activeId: 'whatsapp' as const,
    overlayOpen: false,
    windowFocused: true,
    disabled: false,
  };
  it('accepts only the active, enabled service with no overlay and a focused window', () => {
    expect(acceptReport(ok)).toBe(true);
    expect(acceptReport({ ...ok, activeId: 'discord' })).toBe(false);
    expect(acceptReport({ ...ok, overlayOpen: true })).toBe(false);
    expect(acceptReport({ ...ok, windowFocused: false })).toBe(false);
    expect(acceptReport({ ...ok, disabled: true })).toBe(false);
  });
});

describe('recentLabel', () => {
  it('prefers the recipe hook name and keeps it as the name lane', () => {
    expect(
      recentLabel({
        conversation: 'Minh Anh',
        title: 'WhatsApp',
        url: 'https://web.whatsapp.com/',
        serviceUrl: 'https://web.whatsapp.com/',
        serviceName: 'WhatsApp',
      }),
    ).toEqual({ label: 'Minh Anh', conversation: 'Minh Anh' });
  });

  it('falls back to the title with the brand peeled, and no name lane', () => {
    const r = recentLabel({
      conversation: null,
      title: '(2) Discord | #release | Ticketbox',
      url: 'https://discord.com/channels/1/2',
      serviceUrl: 'https://discord.com/channels/@me',
      serviceName: 'Discord',
    });
    expect(r).toEqual({ label: '#release | Ticketbox' });
    expect(r && 'conversation' in r).toBe(false);
  });

  it("is null on the service's landing URL without a hook name, whatever the title", () => {
    expect(
      recentLabel({
        conversation: null,
        title: 'Discord | Friends',
        url: 'https://discord.com/channels/@me',
        serviceUrl: 'https://discord.com/channels/@me',
        serviceName: 'Discord',
      }),
    ).toBeNull();
    // trailing slash and query do not make the landing page a conversation
    expect(
      recentLabel({
        conversation: null,
        title: 'Something',
        url: 'https://web.whatsapp.com?x=1',
        serviceUrl: 'https://web.whatsapp.com/',
        serviceName: 'WhatsApp',
      }),
    ).toBeNull();
  });

  it('is null when the title names nothing beyond the brand', () => {
    expect(
      recentLabel({
        conversation: null,
        title: 'WhatsApp',
        url: 'https://web.whatsapp.com/x',
        serviceUrl: 'https://web.whatsapp.com/',
        serviceName: 'WhatsApp',
      }),
    ).toBeNull();
  });
});

describe('upsertRecent', () => {
  const sighting = (label: string, at: number, url = 'https://web.whatsapp.com/') => ({
    serviceId: 'whatsapp' as const,
    label,
    url,
    at,
  });

  it('puts a new sighting on top with a fresh id', () => {
    let n = 10;
    const rows = upsertRecent([entry(1), entry(2)], sighting('new', 9), () => n++);
    expect(rows.map((r) => r.label)).toEqual(['new', 'chat 1', 'chat 2']);
    expect(rows[0].id).toBe(10);
  });

  it('moves a known conversation to the top, keeps its id, refreshes url and at', () => {
    const rows = upsertRecent(
      [entry(1), entry(2, { url: 'https://discord.com/channels/1/2', serviceId: 'discord' })],
      { serviceId: 'discord', label: 'chat 2', url: 'https://discord.com/channels/1/2/3', at: 99 },
      () => 77,
    );
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
    expect(rows[0].url).toBe('https://discord.com/channels/1/2/3');
    expect(rows[0].at).toBe(99);
  });

  it('keys on service plus label: one label on two services is two rows', () => {
    const rows = upsertRecent(
      [entry(1, { label: 'Mẹ' })],
      { ...sighting('Mẹ', 5), serviceId: 'zalo' },
      () => 2,
    );
    expect(rows).toHaveLength(2);
  });

  it('drops the oldest past RECENTS_CAP', () => {
    let rows: RecentEntry[] = [];
    let n = 1;
    for (let i = 1; i <= RECENTS_CAP + 3; i++) {
      rows = upsertRecent(rows, sighting(`c${i}`, i), () => n++);
    }
    expect(rows).toHaveLength(RECENTS_CAP);
    expect(rows[0].label).toBe(`c${RECENTS_CAP + 3}`);
    expect(rows.at(-1)?.label).toBe('c4');
  });
});

describe('restoreRecents', () => {
  const known = new Set(['whatsapp', 'discord']);

  it('keeps well-formed rows newest first and drops the rest', () => {
    const rows = restoreRecents(
      [
        entry(1, { at: 5 }),
        entry(2, { serviceId: 'nope' as never }),
        { ...entry(3), label: '' },
        { ...entry(4), id: 'x' },
        entry(1, { at: 6 }), // repeated id
        entry(5, { at: 9, conversation: 'chat 5' }),
        'junk',
      ],
      known,
    );
    expect(rows.map((r) => r.id)).toEqual([5, 1]);
    expect(rows[0].conversation).toBe('chat 5');
    expect('conversation' in rows[1]).toBe(false);
  });

  it('is empty for anything but an array', () => {
    expect(restoreRecents(undefined, known)).toEqual([]);
    expect(restoreRecents({ id: 1 }, known)).toEqual([]);
  });

  it('caps at RECENTS_CAP newest', () => {
    const raw = Array.from({ length: RECENTS_CAP + 5 }, (_, i) => entry(i + 1, { at: i + 1 }));
    const rows = restoreRecents(raw, known);
    expect(rows).toHaveLength(RECENTS_CAP);
    expect(rows[0].id).toBe(RECENTS_CAP + 5);
  });
});

describe('recentRows', () => {
  it('is hrefless, keeps order, and leaves the on-screen conversation out', () => {
    const rows = [entry(3, { at: 3 }), entry(2, { at: 2 }), entry(1, { at: 1 })];
    const view = recentRows(rows, conversationKey(rows[0]));
    expect(view.map((r) => r.id)).toEqual([2, 1]);
    expect(view[0]).toEqual({ id: 2, serviceId: 'whatsapp', title: 'chat 2', at: 2 });
    expect('url' in view[0]).toBe(false);
    expect(recentRows(rows, null)).toHaveLength(3);
  });
});
