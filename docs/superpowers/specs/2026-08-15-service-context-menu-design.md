# Service-view context menu

Date: 2026-08-15. Status: accepted. Right-click inside a service view gets a native context menu: spelling fixes, clipboard editing, and hand-offs for links and images. First slice of the v0.8 daily-driver phase; the "essentials + hand-offs" scope was chosen over a clipboard-only menu and a full browser-style menu (Look Up, Search with Google) on 2026-08-15.

## Problem

Service views ship with `spellcheck: true` and per-session languages (`en-US` + `vi` where available, `configureSession` in `views.ts`), so misspelled words get the red squiggle — but no `context-menu` listener exists anywhere in main, and Electron shows no menu without one. Right-click does nothing in any chat: a suggestion can never be accepted, a word can never be added to the dictionary, and mouse-driven copy/paste in composers doesn't exist (the app menu's Edit roles cover only the keyboard). Images in chats can't be copied or saved. A link has exactly one affordance — a left-click — which for same-tab links walks the view off its chat URL and leans on snapback or reload to recover.

The shell renderer is not part of the problem: it is Goetia's own React UI and already attaches `onContextMenu` where it wants one (tile mute on the rail).

## Decision

One native menu, built in main from Electron's `context-menu` event params, service views only. Contents by context:

| Context under the cursor | Items |
| --- | --- |
| Misspelled word in an editable field | Chromium's suggestions, or a disabled "No Guesses Found"; "Add to Dictionary" |
| Editable field | Cut / Copy / Paste / Select All, enabled per `editFlags` |
| Text selection (not editable) | Copy |
| Link | Copy Link Address; Open Link in Browser (only when `isSafeExternalUrl`) |
| Image | Copy Image; Save Image As… |
| None of the above | No menu at all |

Excluded on purpose: Look Up, Search with Google, and emoji/substitution submenus — each adds a non-chat surface or hand-off Goetia doesn't otherwise have — and any item for the empty context, because a menu with nothing actionable teaches users the menu is noise.

Two properties the table doesn't show:

- **The page's own menu always wins.** Electron emits `context-menu` only when the page didn't `preventDefault` the DOM event, so services with their own right-click menus (message actions in WhatsApp, Discord) keep them untouched; ours fills the places they left empty.
- **Open Link in Browser is the same hand-off as `window.open`.** The window-open handler already sends `target=_blank` links to the OS browser through `isSafeExternalUrl`; the menu item gives same-tab links the identical exit, instead of a left-click that leaves chat and triggers the containment machinery.

## Pure logic

`src/main/lib/context-menu.ts` holds the decision matrix, per the repo rule that decision logic lives in a `lib/` helper while `views.ts` stays wiring. It imports `isSafeExternalUrl` from the neighboring `external-url.ts` (pure), so the link gate sits inside the tested unit.

```ts
export interface ContextMenuInfo {
  misspelledWord: string;
  dictionarySuggestions: string[];
  isEditable: boolean;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
  selectionText: string;
  linkURL: string;
  /** srcURL when the cursor is on an image (params.mediaType === 'image'), else '' */
  imageURL: string;
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
  | { kind: 'separator' };

export function buildContextMenuTemplate(info: ContextMenuInfo): ContextMenuItem[];
```

Assembly rules: sections in the table's order, separated by `separator` items, never leading, trailing, or doubled. Spelling items appear only in an editable context with a non-empty `misspelledWord`; `no-guesses` replaces an empty suggestion list. The four edit items appear together in editable fields; a bare selection emits only Copy. `copy-link` appears for any non-empty `linkURL` — copying an address is inert — while `open-link` additionally requires `isSafeExternalUrl(linkURL)`. Image items require a non-empty `imageURL`. An empty result means the wiring must not pop a menu.

## Wiring

`create(id)` in `views.ts` gains one listener, next to the window-open handler it mirrors:

```ts
wc.on('context-menu', (_e, params) => {
  const items = buildContextMenuTemplate(projectParams(params));
  if (items.length === 0) return;
  Menu.buildFromTemplate(items.map((it) => toMenuItem(it, wc, params))).popup({ window: this.win });
});
```

| Descriptor | Electron action |
| --- | --- |
| `suggestion` | `wc.replaceMisspelling(word)` |
| `add-to-dictionary` | `wc.session.addWordToSpellCheckerDictionary(word)` |
| `edit` | `wc.cut()` / `wc.copy()` / `wc.paste()` / `wc.selectAll()` — explicit calls, not menu roles, so the target is the right-clicked view regardless of window focus |
| `copy-link` | `clipboard.writeText(url)` |
| `open-link` | `shell.openExternal(url)` — the builder only ever emits it for safe URLs |
| `copy-image` | `wc.copyImageAt(params.x, params.y)` |
| `save-image` | `wc.downloadURL(url)` |

`copy-image` needs the event coordinates, so the mapping closes over `params`; everything decision-shaped stays in the builder.

Save Image As… relies on Electron's default download behavior: Goetia registers no `will-download` handler, so the OS save dialog prompts for a location and that dialog is the entire downloads story — user-initiated, one file, one prompt. This menu item is deliberately the only path that triggers it.

The listener lives on the view's own `webContents`, so it is destroyed with the view (bounded-listeners rule) and `destroy()` needs no change. No new IPC channel exists anywhere in the feature — the menu is main-process end to end, so there is no new sender-validation surface.

### Add to Dictionary is per service

Custom dictionary words live in the `persist:<id>` session like cookies do, so a word added in WhatsApp still squiggles in Telegram. That matches the isolation story — no two logins see each other — and is not worth cross-session plumbing.

## Security notes

`linkURL`, `imageURL`, and `selectionText` are page-controlled, so every action they feed is user-initiated and gated: `open-link` passes `isSafeExternalUrl` (the same invariant the window-open handler enforces, per the external-links rule in `CLAUDE.md`); `save-image` downloads inside the service's own session and writes only where the OS dialog confirms; clipboard writes happen only on an explicit click. `replaceMisspelling` acts on the misspelling under the cursor only. The menu grants the page nothing it can trigger itself.

## Testing

`tests/unit/context-menu.test.ts` pins the matrix: misspelled word with suggestions (suggestions + Add to Dictionary, no `no-guesses`); misspelled word without suggestions (`no-guesses` disabled item + Add to Dictionary); editable field honoring each `editFlags` bit; bare selection emitting Copy alone; `https:` link emitting both link items; `javascript:` and `file:` links emitting only `copy-link`; image emitting both image items; empty context emitting `[]`; and no leading, trailing, or doubled separators across mixed contexts.

Native menus can't be driven from Playwright, so no e2e. Wiring gets a manual pass in `pnpm dev` — accept a suggestion, add a word, paste into a composer, copy and save an image, copy a link, open one in the browser — plus the standard definition of done (`lint`, `typecheck`, `test`, `e2e` for the untouched surroundings).

## Documentation

README "Handy to know" gains one bullet: right-click in any chat for spelling fixes, copy/paste, copying or saving images, and opening links in your browser. `CLAUDE.md` needs no new invariant — the external-links rule already governs the only sensitive item — but its security section's phrase "every new service, IPC channel, or view" is satisfied vacuously: this feature adds none of the three.
