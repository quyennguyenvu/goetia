import { isSafeExternalUrl } from './external-url';

export interface ContextMenuInfo {
  misspelledWord: string;
  dictionarySuggestions: string[];
  isEditable: boolean;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
  selectionText: string;
  linkURL: string;
  /** srcURL when the cursor is on an image (params.mediaType === 'image'), else '' */
  imageURL: string;
  /** document.title at right-click time — the pin text for a link pin */
  pageTitle: string;
  /** the service's origin; a link pin must stay on it */
  serviceOrigin: string;
  /** the pinboard is at capacity: the item still shows, disabled */
  pinsFull: boolean;
}

export type ContextMenuItem =
  | { kind: 'suggestion'; word: string }
  | { kind: 'no-guesses' }
  | { kind: 'add-to-dictionary'; word: string }
  | { kind: 'edit'; action: 'cut' | 'copy' | 'paste' | 'selectAll'; enabled: boolean }
  | { kind: 'copy-link'; url: string }
  | { kind: 'open-link'; url: string }
  | { kind: 'copy-image' }
  | { kind: 'save-image'; url: string }
  | { kind: 'pin-message'; text: string; href: string | null; enabled: boolean }
  | { kind: 'separator' };

/** Decide the whole menu from one right-click's params. Empty result means
 *  "don't pop a menu". `open-link` is only ever emitted for URLs passing
 *  isSafeExternalUrl — the wiring may hand it to the OS unchecked. */
export function buildContextMenuTemplate(info: ContextMenuInfo): ContextMenuItem[] {
  const sections = [spelling(info), edit(info), pin(info), link(info), image(info)].filter(
    (s) => s.length > 0,
  );
  return sections.flatMap((s, i) => (i === 0 ? s : [{ kind: 'separator' } as const, ...s]));
}

function spelling(info: ContextMenuInfo): ContextMenuItem[] {
  if (!info.isEditable || info.misspelledWord === '') return [];
  const suggestions: ContextMenuItem[] =
    info.dictionarySuggestions.length > 0
      ? info.dictionarySuggestions.map((word) => ({ kind: 'suggestion', word }))
      : [{ kind: 'no-guesses' }];
  return [...suggestions, { kind: 'add-to-dictionary', word: info.misspelledWord }];
}

function edit(info: ContextMenuInfo): ContextMenuItem[] {
  if (info.isEditable) {
    return [
      { kind: 'edit', action: 'cut', enabled: info.editFlags.canCut },
      { kind: 'edit', action: 'copy', enabled: info.editFlags.canCopy },
      { kind: 'edit', action: 'paste', enabled: info.editFlags.canPaste },
      { kind: 'edit', action: 'selectAll', enabled: info.editFlags.canSelectAll },
    ];
  }
  if (info.selectionText.trim() === '') return [];
  return [{ kind: 'edit', action: 'copy', enabled: info.editFlags.canCopy }];
}

/** A selection is the message. Without one, a link that stays on the
 *  service's origin pins the conversation it points at, titled by the page.
 *  `href: null` means "the document URL" — the wiring supplies it. */
function pin(info: ContextMenuInfo): ContextMenuItem[] {
  const enabled = !info.pinsFull;
  const selection = info.selectionText.trim();
  if (selection !== '') return [{ kind: 'pin-message', text: selection, href: null, enabled }];
  const title = info.pageTitle.trim();
  if (title !== '' && info.linkURL !== '' && sameOrigin(info.linkURL, info.serviceOrigin)) {
    return [{ kind: 'pin-message', text: title, href: info.linkURL, enabled }];
  }
  return [];
}

function sameOrigin(url: string, origin: string): boolean {
  if (origin === '') return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function link(info: ContextMenuInfo): ContextMenuItem[] {
  if (info.linkURL === '') return [];
  const items: ContextMenuItem[] = [{ kind: 'copy-link', url: info.linkURL }];
  if (isSafeExternalUrl(info.linkURL)) items.push({ kind: 'open-link', url: info.linkURL });
  return items;
}

function image(info: ContextMenuInfo): ContextMenuItem[] {
  if (info.imageURL === '') return [];
  return [{ kind: 'copy-image' }, { kind: 'save-image', url: info.imageURL }];
}
