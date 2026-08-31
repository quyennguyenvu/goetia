// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recipes } from '../../src/preload/recipes';
import tiktok from '../../src/preload/recipes/tiktok';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

const LOGIN_URL =
  'https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Fmessages';

// logged out, /messages is the feed nav plus an empty DM drawer — no sign-in
// form anywhere (captured 2026-08-29) — so the shell is sent to /login
describe('tiktok.loginUrl', () => {
  it('sends the logged-out shell to the login page, returning to messages after', () => {
    expect(tiktok.loginUrl?.(load('tiktok-logged-out'))).toBe(LOGIN_URL);
  });

  it('is null under a session', () => {
    expect(tiktok.loginUrl?.(load('tiktok'))).toBeNull();
  });

  it('is null on a page that is neither (blank, captcha, the login page itself)', () => {
    expect(tiktok.loginUrl?.(load('blank'))).toBeNull();
  });
});

// the rule is narrow by decision (2026-08-30): a logged-out shell with no
// sign-in form. Every other service starts on `url` and stays there.
describe('loginUrl declarers', () => {
  it('is tiktok and shopee', () => {
    const declarers = Object.values(recipes)
      .filter((r) => typeof r.loginUrl === 'function')
      .map((r) => r.id);
    expect(declarers).toEqual(['tiktok', 'shopee']);
  });
});
