// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import teams, { openTeamsConversation, teamsConversation } from '../../src/preload/recipes/teams';

// the fixture mirrors the live teams.live.com/v2 DOM (2026-09-06 dump): the
// open chat is the group "Anh Em Công Nhân", whose latest preview happens to
// name another chat's member — the row match must read titles, not previews
const PAGE = readFileSync(join(__dirname, '../fixtures/teams-chat.html'), 'utf8');

beforeEach(() => {
  document.documentElement.innerHTML = PAGE;
});

describe('teamsConversation', () => {
  it('reads the open chat from the pane header', () => {
    expect(teamsConversation(document)).toBe('Anh Em Công Nhân');
  });

  it('is null with no chat open', () => {
    document.querySelector('[data-tid="chat-title"]')?.remove();
    expect(teamsConversation(document)).toBeNull();
  });
});

describe('openTeamsConversation', () => {
  const clicksOn = (rowId: string) => {
    const row = document.getElementById(rowId);
    if (!row) throw new Error(`no row ${rowId}`);
    const spy = vi.fn();
    row.addEventListener('click', spy);
    return spy;
  };

  it('clicks the chat-list row whose title carries the name', () => {
    const nhat = clicksOn('menur1c');
    const others = ['menur64', 'menurs', 'menur1a', 'menur1e', 'menur1g'].map(clicksOn);
    expect(openTeamsConversation(document, 'Nhật Nguyễn')).toBe(true);
    expect(nhat).toHaveBeenCalledTimes(1);
    for (const spy of others) expect(spy).not.toHaveBeenCalled();
  });

  it('opens a group chat by its title', () => {
    const group = clicksOn('menur1a');
    expect(openTeamsConversation(document, 'Nhóm iOS, Web, Flutter, .NET')).toBe(true);
    expect(group).toHaveBeenCalledTimes(1);
  });

  it('matches a label the pin clamped with an ellipsis', () => {
    const group = clicksOn('menur1a');
    expect(openTeamsConversation(document, 'Nhóm iOS, Web…')).toBe(true);
    expect(group).toHaveBeenCalledTimes(1);
  });

  it('misses when no row carries the name, leaving the page where it is', () => {
    const spies = ['menur64', 'menurs', 'menur1a', 'menur1c', 'menur1e', 'menur1g'].map(clicksOn);
    expect(openTeamsConversation(document, 'Nobody Here')).toBe(false);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('never matches on a message preview that names another chat', () => {
    // "Anh Em Công Nhân"'s preview mentions "Nhật Nguyễn"; only Nhật's own row may open
    const group = clicksOn('menur1e');
    expect(openTeamsConversation(document, 'Nhật Nguyễn')).toBe(true);
    expect(group).not.toHaveBeenCalled();
  });
});

describe('teams recipe hooks', () => {
  it('declares the conversation pair, since the URL never names a chat', () => {
    expect(teams.conversation).toBe(teamsConversation);
    expect(teams.openConversation).toBe(openTeamsConversation);
  });

  it('is ready once the chat tree mounts', () => {
    expect(teams.ready?.(document)).toBe(true);
    document.querySelector('[data-tid="simple-collab-dnd-rail"]')?.remove();
    expect(teams.ready?.(document)).toBe(false);
  });

  it('counts the rows Teams describes as unread', async () => {
    expect(await teams.count(document)).toEqual({ direct: 0, indirect: 2 });
  });
});
