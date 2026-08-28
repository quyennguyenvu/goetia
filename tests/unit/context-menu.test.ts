import { describe, expect, it } from 'vitest';
import { buildContextMenuTemplate, type ContextMenuInfo } from '../../src/main/lib/context-menu';

const noEdit = { canCut: false, canCopy: false, canPaste: false, canSelectAll: false };
const allEdit = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };

const base: ContextMenuInfo = {
  misspelledWord: '',
  dictionarySuggestions: [],
  isEditable: false,
  editFlags: noEdit,
  selectionText: '',
  linkURL: '',
  imageURL: '',
  pageTitle: '',
  serviceOrigin: 'https://chat.zalo.me',
  pinsFull: false,
};

const info = (over: Partial<ContextMenuInfo> = {}): ContextMenuInfo => ({ ...base, ...over });

describe('buildContextMenuTemplate', () => {
  it('returns no items for an empty context — the wiring must not pop a menu', () => {
    expect(buildContextMenuTemplate(info())).toEqual([]);
  });

  it('offers all four edit actions in an editable field, enablement per editFlags', () => {
    expect(
      buildContextMenuTemplate(
        info({ isEditable: true, editFlags: { ...allEdit, canCut: false } }),
      ),
    ).toEqual([
      { kind: 'edit', action: 'cut', enabled: false },
      { kind: 'edit', action: 'copy', enabled: true },
      { kind: 'edit', action: 'paste', enabled: true },
      { kind: 'edit', action: 'selectAll', enabled: true },
    ]);
  });

  it('offers Copy and Pin Message for a bare selection outside an editable field', () => {
    expect(
      buildContextMenuTemplate(
        info({ selectionText: 'hello', editFlags: { ...noEdit, canCopy: true } }),
      ),
    ).toEqual([
      { kind: 'edit', action: 'copy', enabled: true },
      { kind: 'separator' },
      { kind: 'pin-message', text: 'hello', href: null, enabled: true },
    ]);
  });

  it('treats a whitespace-only selection as no selection', () => {
    expect(
      buildContextMenuTemplate(
        info({ selectionText: '  \n', editFlags: { ...noEdit, canCopy: true } }),
      ),
    ).toEqual([]);
  });

  it('puts suggestions and Add to Dictionary ahead of the edit section', () => {
    expect(
      buildContextMenuTemplate(
        info({
          isEditable: true,
          editFlags: allEdit,
          misspelledWord: 'goetya',
          dictionarySuggestions: ['goetia', 'goethe'],
        }),
      ),
    ).toEqual([
      { kind: 'suggestion', word: 'goetia' },
      { kind: 'suggestion', word: 'goethe' },
      { kind: 'add-to-dictionary', word: 'goetya' },
      { kind: 'separator' },
      { kind: 'edit', action: 'cut', enabled: true },
      { kind: 'edit', action: 'copy', enabled: true },
      { kind: 'edit', action: 'paste', enabled: true },
      { kind: 'edit', action: 'selectAll', enabled: true },
    ]);
  });

  it('replaces an empty suggestion list with a disabled No Guesses item', () => {
    const items = buildContextMenuTemplate(
      info({ isEditable: true, editFlags: allEdit, misspelledWord: 'zzzzq' }),
    );
    expect(items.slice(0, 2)).toEqual([
      { kind: 'no-guesses' },
      { kind: 'add-to-dictionary', word: 'zzzzq' },
    ]);
  });

  it('never offers spelling items outside an editable field', () => {
    // a selection over a misspelled word in a message bubble is copy-only
    expect(
      buildContextMenuTemplate(
        info({
          misspelledWord: 'goetya',
          dictionarySuggestions: ['goetia'],
          selectionText: 'goetya',
          editFlags: { ...noEdit, canCopy: true },
        }),
      ),
    ).toEqual([
      { kind: 'edit', action: 'copy', enabled: true },
      { kind: 'separator' },
      { kind: 'pin-message', text: 'goetya', href: null, enabled: true },
    ]);
  });

  it('offers copy and open for a web link', () => {
    expect(buildContextMenuTemplate(info({ linkURL: 'https://example.com/x' }))).toEqual([
      { kind: 'copy-link', url: 'https://example.com/x' },
      { kind: 'open-link', url: 'https://example.com/x' },
    ]);
  });

  it('offers only copy for a non-web link — open must stay behind isSafeExternalUrl', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)']) {
      expect(buildContextMenuTemplate(info({ linkURL: url }))).toEqual([
        { kind: 'copy-link', url },
      ]);
    }
  });

  it('offers copy and save for an image', () => {
    expect(buildContextMenuTemplate(info({ imageURL: 'https://cdn.example.com/a.png' }))).toEqual([
      { kind: 'copy-image' },
      { kind: 'save-image', url: 'https://cdn.example.com/a.png' },
    ]);
  });

  it('pins the trimmed selection, sitting between the edit and link sections', () => {
    const items = buildContextMenuTemplate(
      info({
        isEditable: true,
        editFlags: allEdit,
        selectionText: '  quoted text ',
        linkURL: 'https://example.com/x',
      }),
    );
    expect(items.map((i) => i.kind)).toEqual([
      'edit',
      'edit',
      'edit',
      'edit',
      'separator',
      'pin-message',
      'separator',
      'copy-link',
      'open-link',
    ]);
    expect(items[5]).toEqual({
      kind: 'pin-message',
      text: 'quoted text',
      href: null,
      enabled: true,
    });
  });

  it('without a selection, pins a same-origin link titled by the page', () => {
    expect(
      buildContextMenuTemplate(
        info({ linkURL: 'https://chat.zalo.me/#/thread/9', pageTitle: 'Zalo — Mẹ' }),
      ),
    ).toEqual([
      {
        kind: 'pin-message',
        text: 'Zalo — Mẹ',
        href: 'https://chat.zalo.me/#/thread/9',
        enabled: true,
      },
      { kind: 'separator' },
      { kind: 'copy-link', url: 'https://chat.zalo.me/#/thread/9' },
      { kind: 'open-link', url: 'https://chat.zalo.me/#/thread/9' },
    ]);
  });

  it('never pins a cross-origin link, a bad link, or a link on an untitled page', () => {
    for (const over of [
      { linkURL: 'https://example.com/x', pageTitle: 'Zalo' },
      { linkURL: 'not a url', pageTitle: 'Zalo' },
      { linkURL: 'https://chat.zalo.me/x', pageTitle: '   ' },
    ]) {
      expect(buildContextMenuTemplate(info(over)).some((i) => i.kind === 'pin-message')).toBe(
        false,
      );
    }
  });

  it('shows the item disabled at the cap — the cap is visible, not silent', () => {
    expect(buildContextMenuTemplate(info({ selectionText: 'x', pinsFull: true }))).toEqual([
      { kind: 'edit', action: 'copy', enabled: false },
      { kind: 'separator' },
      { kind: 'pin-message', text: 'x', href: null, enabled: false },
    ]);
  });

  it('separates sections with single separators, never leading, trailing, or doubled', () => {
    const items = buildContextMenuTemplate(
      info({
        isEditable: true,
        editFlags: allEdit,
        linkURL: 'https://example.com',
        imageURL: 'https://cdn.example.com/a.png',
      }),
    );
    expect(items.map((i) => i.kind)).toEqual([
      'edit',
      'edit',
      'edit',
      'edit',
      'separator',
      'copy-link',
      'open-link',
      'separator',
      'copy-image',
      'save-image',
    ]);
  });
});
