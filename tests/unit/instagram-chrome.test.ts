// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import instagram from '../../src/preload/recipes/instagram';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

describe('instagram chrome hiding', () => {
  it('finds the nav rail: the sibling branch of main holding the DM nav link', () => {
    const doc = load('instagram');
    expect(instagram.hideChrome?.(doc)).toEqual([doc.querySelector('#rail')]);
  });

  it('reclaims the rail-sized left offset the fixed rail leaves behind', () => {
    const doc = load('instagram');
    instagram.hideChrome?.(doc);
    const content = doc.querySelector('#content') as HTMLElement;
    const main = doc.querySelector('main') as HTMLElement;
    expect(doc.defaultView?.getComputedStyle(content).marginLeft).toBe('0px');
    // pane-internal padding is not rail-sized and must survive
    expect(doc.defaultView?.getComputedStyle(main).paddingLeft).toBe('16px');
  });

  it('reclaims a rail-sized padding on the single-child wrapper spine inside main', () => {
    const doc = load('instagram');
    instagram.hideChrome?.(doc);
    const inner = doc.querySelector('#inner') as HTMLElement;
    expect(doc.defaultView?.getComputedStyle(inner).paddingLeft).toBe('0px');
  });

  it('reclaims a rail-sized padding on the layout root itself', () => {
    const doc = load('instagram');
    const root = (doc.querySelector('#rail') as HTMLElement).parentElement as HTMLElement;
    root.style.paddingLeft = '72px';
    instagram.hideChrome?.(doc);
    expect(doc.defaultView?.getComputedStyle(root).paddingLeft).toBe('0px');
  });

  it('stretches a content column that under-fills its parent by rail width', () => {
    const doc = load('instagram');
    const content = doc.querySelector('#content') as HTMLElement;
    const root = content.parentElement as HTMLElement;
    // width: calc(100% - 72px) leftovers — happy-dom has no layout, so stub
    Object.defineProperty(content, 'offsetWidth', { value: 501 });
    Object.defineProperty(root, 'clientWidth', { value: 573 });
    instagram.hideChrome?.(doc);
    expect(content.style.getPropertyValue('width')).toBe('100%');
    expect(content.style.getPropertyPriority('width')).toBe('important');
  });

  it('leaves widths alone when the column already fills its parent', () => {
    const doc = load('instagram');
    const content = doc.querySelector('#content') as HTMLElement;
    Object.defineProperty(content, 'offsetWidth', { value: 573 });
    Object.defineProperty(content.parentElement as HTMLElement, 'clientWidth', { value: 573 });
    instagram.hideChrome?.(doc);
    expect(content.style.getPropertyValue('width')).toBe('');
  });

  it('returns nothing on a page without main (login)', () => {
    expect(instagram.hideChrome?.(load('blank'))).toEqual([]);
  });

  it('never targets the chat surface when the only direct links are threads inside main', () => {
    const doc = load('instagram');
    doc.querySelector('#rail')?.remove();
    expect(instagram.hideChrome?.(doc)).toEqual([]);
  });
});
