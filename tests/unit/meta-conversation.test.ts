// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import messenger from '../../src/preload/recipes/messenger';

const FIXTURE = readFileSync(join(__dirname, '../fixtures/messenger.html'), 'utf8');

function setURL(url: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
}

// facebook.com/messages titles itself only "Messenger", so the open thread's
// name comes from its own row in the thread list — the row whose link is the
// document URL, read with the same span rule the banner synth uses
describe('messenger.conversation', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = FIXTURE;
  });

  it('names the thread whose link matches the document URL', () => {
    setURL('https://www.facebook.com/messages/t/222');
    expect(messenger.conversation?.(document)).toBe('Bob');
  });

  it('skips presence labels and tolerates a trailing slash', () => {
    setURL('https://www.facebook.com/messages/e2ee/t/111/');
    expect(messenger.conversation?.(document)).toBe('Alice');
  });

  it('is null on the inbox with no thread open', () => {
    setURL('https://www.facebook.com/messages/');
    expect(messenger.conversation?.(document)).toBeNull();
  });

  it('is null when the open thread has scrolled out of the list', () => {
    setURL('https://www.facebook.com/messages/t/999');
    expect(messenger.conversation?.(document)).toBeNull();
  });
});
