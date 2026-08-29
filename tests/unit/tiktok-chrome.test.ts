// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import tiktok from '../../src/preload/recipes/tiktok';

/** Fixture body under the recipe's injected stylesheet, so assertions read the
 *  cascaded `display` rather than the selector text. */
function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.head.innerHTML = `<style>${tiktok.css ?? ''}</style>`;
  document.body.innerHTML = html;
  return document;
}

function display(doc: Document, selector: string): string | undefined {
  const el = doc.querySelector(selector);
  if (!el) throw new Error(`fixture lacks ${selector}`);
  return doc.defaultView?.getComputedStyle(el).display;
}

const RAIL = '[class*="DivSideNavContainer"] > [class*="DivFixedContentContainer"]';
const NAV = '[class*="DivSideNavContainer"] > [class*="DivScrollingContentContainer"]';
const DRAWER = '[class*="DivSideNavContainer"] > [class*="DivDrawerContainer"]';

describe('tiktok chrome hiding', () => {
  it('hides the side nav rail once the messages surface is up', () => {
    const doc = load('tiktok');
    expect(display(doc, RAIL)).toBe('none');
    expect(display(doc, NAV)).toBe('none');
    // the drawer hosts the conversation list — never hidden
    expect(display(doc, DRAWER)).not.toBe('none');
  });

  // the logged-out page mounts the (empty) messages drawer too, so the drawer
  // alone cannot gate the chrome: the Log in button lives in the scrolling nav
  it('leaves the nav — and its Log in button — alone when logged out', () => {
    const doc = load('tiktok-logged-out');
    expect(display(doc, RAIL)).not.toBe('none');
    expect(display(doc, NAV)).not.toBe('none');
    expect(display(doc, '#header-login-button')).not.toBe('none');
  });

  it('is not ready on the logged-out page', () => {
    expect(tiktok.ready?.(load('tiktok-logged-out'))).toBe(false);
  });

  it('counts zero when logged out', async () => {
    expect(await tiktok.count(load('tiktok-logged-out'))).toEqual({ direct: 0, indirect: 0 });
  });
});
