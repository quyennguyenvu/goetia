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
  it.each(['tiktok', 'tiktok-empty'])('hides the side nav rail on %s', (fixture) => {
    const doc = load(fixture);
    expect(display(doc, RAIL)).toBe('none');
    expect(display(doc, NAV)).toBe('none');
    // the drawer hosts the conversation list — never hidden
    expect(display(doc, DRAWER)).not.toBe('none');
  });

  it('leaves the nav alone when no messages surface is mounted (login page)', () => {
    const doc = load('tiktok-empty');
    doc.querySelector(DRAWER)?.remove();
    expect(display(doc, RAIL)).not.toBe('none');
    expect(display(doc, NAV)).not.toBe('none');
  });

  it('is ready once the messages drawer mounts, even with no conversations', () => {
    expect(tiktok.ready?.(load('tiktok-empty'))).toBe(true);
  });

  it('counts zero on the empty state', async () => {
    expect(await tiktok.count(load('tiktok-empty'))).toEqual({ direct: 0, indirect: 0 });
  });
});
