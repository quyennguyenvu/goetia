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

  // Zalo titles a group banner "Nhóm: <name>" (community "Cộng đồng: <name>",
  // "Group:" / "Community:" in English) and puts "Khẩn cấp - " / "Quan trọng - "
  // ("Urgent - " / "Important - ") in front of any banner; the chat-list row
  // keeps the bare name, so a group row could never be opened by name and an
  // urgent banner made a second ⌘K row for the same chat (2026-09-22)
  it('strips Zalo’s group and community labels down to the row name', () => {
    expect(splitBannerTitle('zalo', 'Nhóm: Design team')).toEqual({ conversation: 'Design team' });
    expect(splitBannerTitle('zalo', 'Group: Design team')).toEqual({ conversation: 'Design team' });
    expect(splitBannerTitle('zalo', 'Cộng đồng: 🏘 Khu phố 17 - Cư dân chính thức')).toEqual({
      conversation: '🏘 Khu phố 17 - Cư dân chính thức',
    });
    expect(splitBannerTitle('zalo', 'Community: Khu phố 17')).toEqual({
      conversation: 'Khu phố 17',
    });
  });

  it('strips Zalo’s urgency mark from a group or a DM banner', () => {
    expect(splitBannerTitle('zalo', 'Khẩn cấp - Nhóm: Design team')).toEqual({
      conversation: 'Design team',
    });
    expect(splitBannerTitle('zalo', 'Quan trọng - Alice Nguyen')).toEqual({
      conversation: 'Alice Nguyen',
    });
    expect(splitBannerTitle('zalo', 'Urgent - Group: Design team')).toEqual({
      conversation: 'Design team',
    });
    expect(splitBannerTitle('zalo', 'Important - Alice Nguyen')).toEqual({
      conversation: 'Alice Nguyen',
    });
  });

  it('leaves a Zalo DM banner, and a name that merely contains a label, alone', () => {
    expect(splitBannerTitle('zalo', 'Alice Nguyen')).toEqual({ conversation: 'Alice Nguyen' });
    expect(splitBannerTitle('zalo', 'Alice - Nhóm: cũ')).toEqual({
      conversation: 'Alice - Nhóm: cũ',
    });
    expect(splitBannerTitle('zalo', 'Nhóm:')).toEqual({ conversation: 'Nhóm:' });
    // another service's chat may be called that
    expect(splitBannerTitle('whatsapp', 'Nhóm: Design team')).toEqual({
      conversation: 'Nhóm: Design team',
    });
  });

  // Telegram (web.telegram.org/k, read from buildNotification in the live
  // bundle 2026-09-22) titles a group banner "Sender @ Group"; a DM and a
  // channel post carry the chat title alone; a forum topic reads
  // "Topic (Forum)"; a second signed-in account appends " ➜ Me"
  it('leads a Telegram group banner with the group, sender trailing', () => {
    expect(splitBannerTitle('telegram', 'Alice Nguyen @ Design team')).toEqual({
      conversation: 'Design team',
      author: 'Alice Nguyen',
    });
    expect(splitBannerTitle('telegram', 'Alice Nguyen')).toEqual({ conversation: 'Alice Nguyen' });
    expect(splitBannerTitle('telegram', 'Release notes')).toEqual({
      conversation: 'Release notes',
    });
    expect(splitBannerTitle('telegram', 'Bugs (Engineering forum)')).toEqual({
      conversation: 'Bugs (Engineering forum)',
    });
  });

  it('drops Telegram’s other-account suffix', () => {
    expect(splitBannerTitle('telegram', 'Alice Nguyen @ Design team ➜ Quyền')).toEqual({
      conversation: 'Design team',
      author: 'Alice Nguyen',
    });
    expect(splitBannerTitle('telegram', 'Alice Nguyen ➜ Quyền')).toEqual({
      conversation: 'Alice Nguyen',
    });
  });

  // Slack's browser banners (getNotificationTitle, live bundle 2026-09-22)
  // are boilerplate around the conversation: "New message in #general",
  // "New thread message in #general", "New message from An Nguyen",
  // "An Nguyen is trying to reach you"; multi-workspace desktop builds
  // put the workspace first: "[ticketbox] in #general" / "[ticketbox] from An"
  it('strips Slack’s boilerplate down to the conversation', () => {
    expect(splitBannerTitle('slack', 'New message in #general')).toEqual({
      conversation: '#general',
    });
    expect(splitBannerTitle('slack', 'New thread message in #general')).toEqual({
      conversation: '#general',
    });
    expect(splitBannerTitle('slack', 'New message from An Nguyen')).toEqual({
      conversation: 'An Nguyen',
    });
    expect(splitBannerTitle('slack', 'An Nguyen is trying to reach you')).toEqual({
      conversation: 'An Nguyen',
    });
    expect(splitBannerTitle('slack', '[ticketbox] in #general')).toEqual({
      conversation: '#general',
    });
    expect(splitBannerTitle('slack', '[ticketbox] from An Nguyen')).toEqual({
      conversation: 'An Nguyen',
    });
  });

  it('leaves a Slack title it does not recognise alone', () => {
    expect(splitBannerTitle('slack', 'Reminder due')).toEqual({ conversation: 'Reminder due' });
    expect(splitBannerTitle('slack', 'Couldn’t send to #general')).toEqual({
      conversation: 'Couldn’t send to #general',
    });
    expect(splitBannerTitle('slack', 'New message in')).toEqual({ conversation: 'New message in' });
  });

  it('every other service already titles its banners with the conversation', () => {
    expect(splitBannerTitle('whatsapp', 'Nguyên Diêu')).toEqual({ conversation: 'Nguyên Diêu' });
    expect(splitBannerTitle('teams', 'Anh Em Công Nhân')).toEqual({
      conversation: 'Anh Em Công Nhân',
    });
  });

  it('never returns an empty conversation for a non-empty title', () => {
    expect(splitBannerTitle('discord', ' (#chan, Srv)').conversation).toBe('#chan');
    expect(splitBannerTitle('discord', '   ').conversation).toBe('');
  });
});
