// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import shopee from '../../src/preload/recipes/shopee';

function setURL(url: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
}

const LOGIN_URL = 'https://shopee.vn/buyer/login?next=https%3A%2F%2Fshopee.vn%2F';

// logged out, shopee.vn dead-ends on /verify/traffic/error?…&is_logged_in=false
// — a "Login Required" gate, no form (live probe 2026-08-31) — so land on the
// buyer login page (user decision 2026-08-31)
describe('shopee.loginUrl', () => {
  it('sends the logged-out verify/error gate to the login page', () => {
    setURL(
      'https://shopee.vn/verify/traffic/error?home_url=https%3A%2F%2Fshopee.vn&is_logged_in=false&next=https%3A%2F%2Fshopee.vn%2F',
    );
    expect(shopee.loginUrl?.(document)).toBe(LOGIN_URL);
  });

  it('is null on the login page itself (never loops)', () => {
    setURL('https://shopee.vn/buyer/login?next=https%3A%2F%2Fshopee.vn%2F');
    expect(shopee.loginUrl?.(document)).toBeNull();
  });

  it('is null on the home page (a session is present or being established)', () => {
    setURL('https://shopee.vn/');
    expect(shopee.loginUrl?.(document)).toBeNull();
  });

  it('is null on a verify gate that is not logged-out', () => {
    setURL('https://shopee.vn/verify/traffic/error?is_logged_in=true');
    expect(shopee.loginUrl?.(document)).toBeNull();
  });
});
