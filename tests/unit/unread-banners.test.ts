import { describe, expect, it } from 'vitest';
import { SEEN_ROWS_MAX, UnreadRows } from '../../src/preload/recipes/unread-banners';

const row = (title: string, body: string, href?: string) => ({ title, body, href });

describe('UnreadRows', () => {
  it('announces nothing for rows it sees for the first time without a rise', () => {
    // the first count of a document, or rows rendering after a title-only count
    const rows = new UnreadRows();
    expect(rows.next([row('An', 'hi', '/t/1'), row('Binh', 'yo', '/t/2')], false, true)).toEqual(
      [],
    );
  });

  it('announces the new conversation when the count rises', () => {
    const rows = new UnreadRows();
    rows.next([row('An', 'hi', '/t/1')], false, true);
    const binh = row('Binh', 'yo', '/t/2');
    expect(rows.next([binh, row('An', 'hi', '/t/1')], true, true)).toEqual([binh]);
  });

  // the 2026-11-13 report: a second message in a chat that is already unread
  it('announces a changed preview on a row that was already unread', () => {
    const rows = new UnreadRows();
    rows.next([row('An', 'hi', '/t/1')], false, true);
    const second = row('An', 'are you there?', '/t/1');
    expect(rows.next([second], false, true)).toEqual([second]);
    expect(rows.next([second], false, true)).toEqual([]); // announced once
  });

  it('names the row that changed, not the one on top', () => {
    // a pinned unread chat stays first whatever arrives below it
    const rows = new UnreadRows();
    const pinned = row('Pinned', 'old news', '/t/9');
    rows.next([pinned, row('An', 'hi', '/t/1')], false, true);
    const second = row('An', 'hello?', '/t/1');
    expect(rows.next([pinned, second], false, true)).toEqual([second]);
    const binh = row('Binh', 'yo', '/t/2');
    expect(rows.next([pinned, binh, second], true, true)).toEqual([binh]);
  });

  // one banner a count lost the other chat's for good
  it('returns every row that is news, in list order', () => {
    const rows = new UnreadRows();
    rows.next([row('An', 'hi', '/t/1'), row('Binh', 'yo', '/t/2')], false, true);
    const chi = row('Chi', 'new here', '/t/3');
    const an = row('An', 'hello?', '/t/1');
    const binh = row('Binh', 'you there?', '/t/2');
    expect(rows.next([chi, an, binh], true, true)).toEqual([chi, an, binh]);
    expect(rows.next([chi, an, binh], false, true)).toEqual([]);
  });

  it('a clock ticking in the preview is not a message', () => {
    const rows = new UnreadRows();
    rows.next([row('An', 'hi · 1m', '/t/1'), row('Binh', 'yo · 5 phút', '/t/2')], false, true);
    expect(
      rows.next([row('An', 'hi · 2m', '/t/1'), row('Binh', 'yo · 6 phút', '/t/2')], false, true),
    ).toEqual([]);
  });

  it('falls back to the first row when the count rose and no row reads as new', () => {
    // the same words again after the chat was read: its preview never changed
    const rows = new UnreadRows();
    const ok = row('An', 'ok', '/t/1');
    rows.next([ok], false, true);
    rows.next([], false, true);
    expect(rows.next([ok], true, true)).toEqual([ok]);
  });

  // a cold load shows some encrypted threads a placeholder and fills the real
  // preview in afterwards (useGetSnippetFromLS, live bundle 2026-11-13)
  it('announces no changed preview before the page has settled', () => {
    const rows = new UnreadRows();
    rows.next([row('An', 'Messages are end-to-end encrypted', '/t/1')], false, false);
    expect(rows.next([row('An', 'hi', '/t/1')], false, false)).toEqual([]);
    expect(rows.next([row('An', 'hi', '/t/1')], false, true)).toEqual([]); // and not later either
    const binh = row('Binh', 'yo', '/t/2');
    // a rise is still a rise
    expect(rows.next([binh, row('An', 'hi', '/t/1')], true, false)).toEqual([binh]);
  });

  // a list that renders after the first count reads as a rise for every row
  // in it; that was one banner for an old message and must not become many
  it('announces one row at most before the page has settled', () => {
    const rows = new UnreadRows();
    const an = row('An', 'hi', '/t/1');
    expect(
      rows.next([an, row('Binh', 'yo', '/t/2'), row('Chi', 'hey', '/t/3')], true, false),
    ).toEqual([an]);
  });

  it('remembers a row across a count that did not render it', () => {
    // a virtualized list drops a row scrolled out of view; its return is not news
    const rows = new UnreadRows();
    const an = row('An', 'hi', '/t/1');
    rows.next([an, row('Binh', 'yo', '/t/2')], false, true);
    rows.next([row('Binh', 'yo', '/t/2')], false, true);
    expect(rows.next([an, row('Binh', 'yo', '/t/2')], false, true)).toEqual([]);
  });

  it('keys a row by its name where the site gives it no link', () => {
    const rows = new UnreadRows();
    rows.next([row('An', 'hi')], false, true);
    expect(rows.next([row('An', 'hello?')], false, true)).toEqual([row('An', 'hello?')]);
  });

  it('forgets the oldest rows past its cap', () => {
    const rows = new UnreadRows();
    rows.next([row('First', 'hi', '/t/first')], false, true);
    for (let i = 0; i < SEEN_ROWS_MAX; i++) rows.next([row(`n${i}`, 'x', `/t/${i}`)], false, true);
    // forgotten, so its changed preview no longer reads as a change
    expect(rows.next([row('First', 'hello?', '/t/first')], false, true)).toEqual([]);
  });
});
