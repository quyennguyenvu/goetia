import { describe, expect, it } from 'vitest';
import { learnedUrl, OPEN_REPLY_TIMEOUT_MS, parseOpenReply } from '../../src/main/lib/open-reply';

// the reply crosses from an unisolated page: shape and values are
// page-controlled until re-checked here
describe('parseOpenReply', () => {
  it('accepts a known lane and a string url', () => {
    expect(parseOpenReply({ lane: 'replay', url: 'https://discord.com/channels/1/2' })).toEqual({
      lane: 'replay',
      url: 'https://discord.com/channels/1/2',
    });
    expect(parseOpenReply({ lane: 'url', url: 'https://app.slack.com/client/T1/C1' })).toEqual({
      lane: 'url',
      url: 'https://app.slack.com/client/T1/C1',
    });
  });

  it('rejects an unknown lane, a non-string url, and non-objects', () => {
    expect(parseOpenReply({ lane: 'teleport', url: 'https://x/' })).toBeNull();
    expect(parseOpenReply({ lane: 'replay', url: 7 })).toBeNull();
    expect(parseOpenReply({ lane: 'replay' })).toBeNull();
    expect(parseOpenReply(null)).toBeNull();
    expect(parseOpenReply('replay')).toBeNull();
  });

  it('bounds how long main waits for a page that never answers', () => {
    expect(OPEN_REPLY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(OPEN_REPLY_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});

// what a landed replay teaches the recents row: where the document went, or
// a recipe-minted URL the page reports for a thread the address bar never
// shows (Slack) — validated like any href, since the report is page-controlled
describe('learnedUrl', () => {
  const slack = { serviceUrl: 'https://app.slack.com/client' };
  const fb = { serviceUrl: 'https://www.facebook.com/messages/', chatPaths: ['/messages'] };

  it('learns the URL the document moved to', () => {
    const after = 'https://discord.com/channels/1/2';
    expect(
      learnedUrl({
        before: 'https://discord.com/channels/@me',
        after,
        reported: after,
        serviceUrl: 'https://discord.com/channels/@me',
      }),
    ).toBe(after);
  });

  it('learns a validated recipe URL although the document stayed put', () => {
    const here = 'https://app.slack.com/client/T1/C1';
    const thread = 'https://app.slack.com/client/T1/C1/thread/C1-1.2';
    expect(learnedUrl({ before: here, after: here, reported: thread, ...slack })).toBe(thread);
  });

  it('learns nothing when the report is where the document already was', () => {
    const here = 'https://app.slack.com/client/T1/C1';
    expect(learnedUrl({ before: here, after: here, reported: here, ...slack })).toBeNull();
  });

  it('refuses a cross-origin or off-chat report', () => {
    const here = 'https://www.facebook.com/messages/t/1';
    expect(
      learnedUrl({ before: here, after: here, reported: 'https://evil.example/x', ...fb }),
    ).toBeNull();
    expect(
      learnedUrl({
        before: here,
        after: here,
        reported: 'https://www.facebook.com/share/p/9',
        ...fb,
      }),
    ).toBeNull();
    expect(
      learnedUrl({
        before: here,
        after: here,
        reported: 'https://www.facebook.com/messages/t/2',
        ...fb,
      }),
    ).toBe('https://www.facebook.com/messages/t/2');
  });
});
