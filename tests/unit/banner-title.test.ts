import { describe, expect, it } from 'vitest';
import { splitBannerTitle } from '../../src/main/lib/banner-title';

describe('splitBannerTitle', () => {
  it('splits a Discord guild banner into channel and author', () => {
    expect(
      splitBannerTitle('discord', 'Github Action (#tkb-deployment-prod-🎯, Ticketbox)'),
    ).toEqual({ conversation: '#tkb-deployment-prod-🎯', author: 'Github Action' });
  });

  // Discord names the third field the server on one banner and the category on
  // the next for the very same channel, so it is dropped: the channel alone is
  // what makes two banners one row (2026-09-03)
  it('drops Discord’s trailing field so one channel is one conversation', () => {
    const a = splitBannerTitle('discord', 'bangnk (#technical-chat-💡, Text Channels)');
    const b = splitBannerTitle('discord', 'Trưởng thôn Tờ (#technical-chat-💡, ticketbox)');
    expect(a.conversation).toBe('#technical-chat-💡');
    expect(b.conversation).toBe(a.conversation);
    expect(a.author).toBe('bangnk');
  });

  // the reported bug: Discord hands over a placeholder where a display name
  // belongs, and it was the only thing the row led with
  it('keeps a placeholder author out of the conversation', () => {
    expect(
      splitBannerTitle('discord', 'Username (#tkb-prod-alert-critical, Service Ticketbox)'),
    ).toEqual({ conversation: '#tkb-prod-alert-critical', author: 'Username' });
  });

  it('a Discord DM titles itself with the sender alone', () => {
    expect(splitBannerTitle('discord', 'Nguyên Diêu')).toEqual({ conversation: 'Nguyên Diêu' });
  });

  // a group DM carries no #channel — nothing to split, so nothing is guessed
  it('leaves a parenthesised title with no channel alone', () => {
    expect(splitBannerTitle('discord', 'bangnk (Nhóm Sale)')).toEqual({
      conversation: 'bangnk (Nhóm Sale)',
    });
  });

  it('every other service already titles its banners with the conversation', () => {
    expect(splitBannerTitle('whatsapp', 'Nguyên Diêu')).toEqual({ conversation: 'Nguyên Diêu' });
    expect(splitBannerTitle('slack', 'Phuc Nguyen (#general)')).toEqual({
      conversation: 'Phuc Nguyen (#general)',
    });
  });

  it('never returns an empty conversation for a non-empty title', () => {
    expect(splitBannerTitle('discord', ' (#chan, Srv)').conversation).toBe('#chan');
    expect(splitBannerTitle('discord', '   ').conversation).toBe('');
  });
});
