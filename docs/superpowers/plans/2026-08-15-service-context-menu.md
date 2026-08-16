# Service-View Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click inside a service view pops a native menu: spelling fixes, clipboard editing, and gated hand-offs for links and images.

**Architecture:** A pure template builder in `src/main/lib/context-menu.ts` turns a narrow projection of Electron's `context-menu` params into plain-data descriptors (unit-tested matrix, link gate included). `views.ts` stays wiring: one listener per service view maps descriptors to native `Menu` items. Spec: `docs/superpowers/specs/2026-08-15-service-context-menu-design.md`.

**Tech Stack:** Electron (`Menu`, `clipboard`, `shell`, `WebContents`), TypeScript, vitest.

## Global Constraints

- **Never run `git commit`.** Commits happen only when the user runs `/grimoire-core:commit` themselves; every task ends by stopping and asking them to.
- All scripts run through corepack: `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm e2e`.
- Electron-launching commands need `ELECTRON_RUN_AS_NODE` unset in VS Code shells: prefix with `env -u ELECTRON_RUN_AS_NODE`.
- `open-link` descriptors may only ever be emitted for URLs passing `isSafeExternalUrl` (CLAUDE.md external-links invariant); the gate lives inside the builder, not the wiring.
- No new IPC channel, no change to `destroy()` — the listener rides the view's own `webContents` lifetime.
- Service views only; the shell renderer keeps its own React `onContextMenu` handlers.
- Markdown edits must pass `npx markdownlint-cli2 <file>`; prose is never hard-wrapped.

---

### Task 1: Pure template builder

**Files:**

- Create: `src/main/lib/context-menu.ts`
- Test: `tests/unit/context-menu.test.ts`

**Interfaces:**

- Consumes: `isSafeExternalUrl(url: string): boolean` from `src/main/lib/external-url.ts` (exists).
- Produces: `ContextMenuInfo`, `ContextMenuItem`, and `buildContextMenuTemplate(info: ContextMenuInfo): ContextMenuItem[]` — Task 2 imports all three names from `./lib/context-menu`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/context-menu.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildContextMenuTemplate,
  type ContextMenuInfo,
} from '../../src/main/lib/context-menu';

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

  it('offers Copy alone for a bare selection outside an editable field', () => {
    expect(
      buildContextMenuTemplate(
        info({ selectionText: 'hello', editFlags: { ...noEdit, canCopy: true } }),
      ),
    ).toEqual([{ kind: 'edit', action: 'copy', enabled: true }]);
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
    ).toEqual([{ kind: 'edit', action: 'copy', enabled: true }]);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm test tests/unit/context-menu.test.ts`

Expected: FAIL — `Cannot find module '../../src/main/lib/context-menu'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/main/lib/context-menu.ts`:

```ts
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

/** Decide the whole menu from one right-click's params. Empty result means
 *  "don't pop a menu". `open-link` is only ever emitted for URLs passing
 *  isSafeExternalUrl — the wiring may hand it to the OS unchecked. */
export function buildContextMenuTemplate(info: ContextMenuInfo): ContextMenuItem[] {
  const sections = [spelling(info), edit(info), link(info), image(info)].filter(
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
```

- [ ] **Step 4: Run the test to verify it passes, then the full gates**

Run: `corepack pnpm test tests/unit/context-menu.test.ts` — expected: 11 passed.

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint` — expected: all green.

- [ ] **Step 5: Stop for the user's commit**

Do not run `git commit`. Tell the user Task 1 is done and verified, and ask them to run `/grimoire-core:commit`. Suggested message: `feat(context-menu): add pure template builder for service-view menus`.

---

### Task 2: Wire the menu into service views

**Files:**

- Modify: `src/main/views.ts` (imports at top; listener inside `create(id)` after the `setWindowOpenHandler` block ending at line 114; new private method after `create`)

**Interfaces:**

- Consumes: `buildContextMenuTemplate`, `ContextMenuItem` from Task 1; existing `this.win: BrowserWindow`.
- Produces: nothing new for later tasks — this task completes the runtime feature.

- [ ] **Step 1: Extend the electron import and add the lib import**

In `src/main/views.ts`, replace the import lines:

```ts
import { type BrowserWindow, session, shell, WebContentsView } from 'electron';
```

with:

```ts
import {
  type BrowserWindow,
  clipboard,
  type ContextMenuParams,
  Menu,
  type MenuItemConstructorOptions,
  session,
  shell,
  type WebContents,
  WebContentsView,
} from 'electron';
```

and directly **above** the existing `import { isSafeExternalUrl } from './lib/external-url';` add (biome sorts this group alphabetically, and `./lib/context-menu` precedes `./lib/external-url`):

```ts
import { buildContextMenuTemplate, type ContextMenuItem } from './lib/context-menu';
```

- [ ] **Step 2: Add the listener in `create(id)`**

Directly after the `wc.setWindowOpenHandler({...})` call (it ends with `return { action: 'deny' };` and a closing `});`, currently line 114) and before the `before-input-event` listener, insert:

```ts
    wc.on('context-menu', (_e, params) => {
      const items = buildContextMenuTemplate({
        misspelledWord: params.misspelledWord,
        dictionarySuggestions: params.dictionarySuggestions,
        isEditable: params.isEditable,
        editFlags: {
          canCut: params.editFlags.canCut,
          canCopy: params.editFlags.canCopy,
          canPaste: params.editFlags.canPaste,
          canSelectAll: params.editFlags.canSelectAll,
        },
        selectionText: params.selectionText,
        linkURL: params.linkURL,
        imageURL: params.mediaType === 'image' ? params.srcURL : '',
      });
      if (items.length === 0) return;
      const template = items.map((item) => this.menuItemFor(item, wc, params));
      Menu.buildFromTemplate(template).popup({ window: this.win });
    });
```

- [ ] **Step 3: Add the descriptor→native mapping**

Add a module-level constant near the top of the file (below the imports):

```ts
const EDIT_LABELS = { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All' } as const;
```

Add this private method to `ServiceViewManager`, directly after `create()`:

```ts
  /** Map a template descriptor to a native item. Only `open-link` reaches the
   *  outside world, and the builder emits it solely for isSafeExternalUrl
   *  URLs — the same gate as the window-open handler above. */
  private menuItemFor(
    item: ContextMenuItem,
    wc: WebContents,
    params: ContextMenuParams,
  ): MenuItemConstructorOptions {
    switch (item.kind) {
      case 'suggestion':
        return { label: item.word, click: () => wc.replaceMisspelling(item.word) };
      case 'no-guesses':
        return { label: 'No Guesses Found', enabled: false };
      case 'add-to-dictionary':
        return {
          label: 'Add to Dictionary',
          click: () => wc.session.addWordToSpellCheckerDictionary(item.word),
        };
      case 'edit':
        return {
          label: EDIT_LABELS[item.action],
          enabled: item.enabled,
          click: () => wc[item.action](),
        };
      case 'copy-link':
        return { label: 'Copy Link Address', click: () => clipboard.writeText(item.url) };
      case 'open-link':
        return { label: 'Open Link in Browser', click: () => shell.openExternal(item.url) };
      case 'copy-image':
        return { label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) };
      case 'save-image':
        return { label: 'Save Image As…', click: () => wc.downloadURL(item.url) };
      case 'separator':
        return { type: 'separator' };
    }
  }
```

- [ ] **Step 4: Run the gates**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` — expected: all green (no unit test targets the wiring; existing suites must stay green).

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` — expected: all existing e2e specs pass (the menu adds no shell surface, so nothing changes for them).

- [ ] **Step 5: Manual verification in the real app**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev`, open a logged-in service, and check each row of the spec's matrix:

- Type a misspelled word in a composer → right-click it → suggestions appear, clicking one replaces the word; Add to Dictionary stops the squiggle for that service.
- Right-click in the composer → Cut/Copy/Paste/Select All work; Paste inserts clipboard text.
- Select message text → right-click → Copy only.
- Right-click a link in a message → Copy Link Address fills the clipboard; Open Link in Browser opens the OS browser and the view does not navigate.
- Right-click a photo → Copy Image pastes elsewhere; Save Image As… shows the OS save dialog.
- Right-click a message bubble in WhatsApp or Discord → the site's own menu appears, not Goetia's.
- Right-click dead space (no text, link, image, or selection) → nothing pops.

- [ ] **Step 6: Stop for the user's commit**

Do not run `git commit`. Report the manual-pass results, then ask the user to run `/grimoire-core:commit`. Suggested message: `feat(context-menu): wire native right-click menu into service views`.

---

### Task 3: README bullet

**Files:**

- Modify: `README.md` ("Handy to know" list, after the **Shortcuts** bullet)

**Interfaces:**

- Consumes: the shipped behavior from Task 2 (the bullet must not promise more than the menu does).
- Produces: nothing — documentation only.

- [ ] **Step 1: Add the bullet**

In `README.md`, directly after the `- **Shortcuts**: …` bullet, insert this line (one line, never wrapped):

```markdown
- **Right-click in a chat** to fix a misspelled word (English and Vietnamese), copy and paste, copy or save a photo, or copy a link and open it in your browser. Where a service shows its own right-click menu, that one still wins.
```

- [ ] **Step 2: Lint the README**

Run: `npx markdownlint-cli2 README.md` — expected: `Summary: 0 issues`.

- [ ] **Step 3: Stop for the user's commit**

Do not run `git commit`. Ask the user to run `/grimoire-core:commit`. Suggested message: `docs(readme): document the right-click menu`.
