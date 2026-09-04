import { describe, expect, it } from 'vitest';
import { OPEN_REPLY_TIMEOUT_MS, parseOpenReply } from '../../src/main/lib/open-reply';

// the reply crosses from an unisolated page: shape and values are
// page-controlled until re-checked here
describe('parseOpenReply', () => {
  it('accepts a known lane and a string url', () => {
    expect(parseOpenReply({ lane: 'replay', url: 'https://discord.com/channels/1/2' })).toEqual({
      lane: 'replay',
      url: 'https://discord.com/channels/1/2',
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
