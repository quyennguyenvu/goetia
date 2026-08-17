// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import messenger from '../../src/preload/recipes/messenger';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

describe('messenger synthesized notification', () => {
  it('extracts sender and preview from the first unread row', () => {
    expect(messenger.synthNotification?.(load('messenger'))).toEqual({
      title: 'Alice',
      body: 'sent a photo',
      href: '/messages/e2ee/t/111',
    });
  });

  it('keeps the emoji facebook renders as an image in a reaction preview', () => {
    expect(messenger.synthNotification?.(load('messenger-reaction'))).toEqual({
      title: 'Hồ Nguyễn Tiến Hưng',
      body: 'Reacted 😆 to your message',
      href: '/messages/e2ee/t/777',
    });
  });

  it('returns null when nothing is unread', () => {
    expect(messenger.synthNotification?.(load('blank'))).toBeNull();
  });
});
