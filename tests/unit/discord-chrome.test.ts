// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import discord from '../../src/preload/recipes/discord';

/** Fixture body under the recipe's injected stylesheet, so assertions read the
 *  cascaded `display` rather than the selector text. */
function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.head.innerHTML = `<style>${discord.css ?? ''}</style>`;
  document.body.innerHTML = html;
  return document;
}

function display(doc: Document, selector: string): string | undefined {
  const el = doc.querySelector(selector);
  if (!el) throw new Error(`fixture lacks ${selector}`);
  return doc.defaultView?.getComputedStyle(el).display;
}

const NITRO_ROW = 'li:has([data-list-item-id$="___nitro"])';
const DM_ROW = 'li:has([data-list-item-id$="___1234567890"])';
const ORPHAN_POPOUT = '#popout_191';
const ANCHORED_POPOUT = '#popout_192';

describe('discord chrome hiding', () => {
  it('hides the Nitro tab and keeps the DM rows', () => {
    const doc = load('discord-nitro-popover');
    expect(display(doc, NITRO_ROW)).toBe('none');
    expect(display(doc, DM_ROW)).not.toBe('none');
  });

  // Discord's Nitro-tab coach mark (YOUTUBE_NITRO_TAB_POPOVER, live
  // 2026-10-05) is a popover anchored to the row hidden above: positioned off
  // the row's zero rect, it lands at the page origin plus its 14px spacing and
  // floats over the guild rail and the DM list. Store chrome, like the row.
  it('hides the coach mark the hidden Nitro tab leaves floating at the origin', () => {
    const doc = load('discord-nitro-popover');
    expect(display(doc, ORPHAN_POPOUT)).toBe('none');
  });

  it('leaves a popout with a real anchor alone', () => {
    const doc = load('discord-nitro-popover');
    expect(display(doc, ANCHORED_POPOUT)).not.toBe('none');
  });

  it('still counts the rail on the fixture', () => {
    expect(discord.count(load('discord-nitro-popover'))).toEqual({ direct: 1, indirect: 1 });
  });
});
