# TikTok Chat Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TikTok personal DMs as a Goetia service — tile, unread badge
from a cheap nav-badge recipe, synthesized notification banners.

**Architecture:** One vertical slice through the existing "add a service"
seams: register `'tiktok'` in the shared catalog, add a recipe preload that
reads the Messages nav badge (title fallback), allowlist its hosts, and
generate notification icons from a logo SVG. No new IPC, permissions, or
main-process logic.

**Tech Stack:** Electron + TypeScript, vitest (happy-dom fixtures), biome,
`@resvg/resvg-js` icon build script.

**Spec:** `docs/superpowers/specs/2026-08-07-tiktok-chat-service-design.md`

## Global Constraints

- Never commit directly. At each commit gate, STOP and ask the user to run
  `/grimoire-core:commit` — do not run `git commit` yourself.
- `Record<ServiceId, …>` types force registration, recipe, and nav-policy
  changes to land together — Task 2 is atomic; do not split it across
  commits with a red `corepack pnpm typecheck` in between.
- `count(doc)` cost rules (CLAUDE.md): scoped selectors only, no
  `getComputedStyle`/`getBoundingClientRect` sweeps, must settle
  synchronously, never throw on `blank.html`.
- TikTok selectors are UNCALIBRATED — best-effort `data-e2e` hooks until a
  live login pass. Keep the `UNCALIBRATED (2026-08-07)` comment in the
  recipe verbatim; do not silently "fix" selectors you cannot verify.
- Everywhere ordered lists of services appear, `tiktok` goes immediately
  BEFORE `shopee` (user decision).
- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`,
  `corepack pnpm test` all green, plus
  `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` (VS Code shells export
  `ELECTRON_RUN_AS_NODE`, which breaks Electron e2e).

---

### Task 1: Fixture and failing tests

**Files:**

- Create: `tests/fixtures/tiktok.html`
- Create: `tests/unit/tiktok-synth.test.ts`
- Modify: `tests/unit/recipes.test.ts`
- Modify: `tests/unit/services.test.ts`
- Modify: `tests/unit/settings.test.ts`
- Modify: `tests/unit/navigation-policy.test.ts`

**Interfaces:**

- Consumes: existing test helpers (`load()` pattern already inside each test
  file — copy it, don't import it).
- Produces: the fixture DOM contract Task 2's recipe must satisfy —
  `[data-e2e="message-badge"]` (total unread), `[data-e2e="chat-list"]`
  (ready signal), `[data-e2e="chat-list-item"]` rows containing
  `chat-item-nickname` / `chat-item-message` / `chat-item-badge`.

- [x] **Step 1: Write the fixture**

Create `tests/fixtures/tiktok.html` (nav badge total 3; first row unread
with badge 2, second row read — Vietnamese strings exercise the emoji/text
path the same way the zalo/shopee fixtures do):

```html
<title>Tin nhắn | TikTok</title>
<div id="app">
  <div data-e2e="top-dm-icon"><sup data-e2e="message-badge">3</sup></div>
  <div data-e2e="chat-list">
    <div data-e2e="chat-list-item">
      <span data-e2e="chat-item-nickname">Ngọc Anh</span>
      <p data-e2e="chat-item-message">Chị ơi, vé còn không?</p>
      <span data-e2e="chat-item-badge">2</span>
    </div>
    <div data-e2e="chat-list-item">
      <span data-e2e="chat-item-nickname">Minh</span>
      <p data-e2e="chat-item-message">ok cảm ơn</p>
    </div>
  </div>
</div>
```

- [x] **Step 2: Add the recipes.test.ts rows**

In `tests/unit/recipes.test.ts`, add to the `cases` array (after the
`zalo` row, before `shopee` to match rail order):

```ts
  ['tiktok', 'tiktok', 3, 0], // nav Messages badge total
```

And add to the `describe('ready()')` block:

```ts
  it('tiktok is ready once the chat list mounts', () => {
    expect(recipes.tiktok.ready?.(load('tiktok'))).toBe(true);
    expect(recipes.tiktok.ready?.(load('blank'))).toBe(false);
  });
```

- [x] **Step 3: Write the synth-notification test**

Create `tests/unit/tiktok-synth.test.ts` (same shape as
`messenger-synth.test.ts`):

```ts
// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import tiktok from '../../src/preload/recipes/tiktok';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

describe('tiktok synthesized notification', () => {
  it('extracts nickname and preview from the first unread row', () => {
    expect(tiktok.synthNotification?.(load('tiktok'))).toEqual({
      title: 'Ngọc Anh',
      body: 'Chị ơi, vé còn không?',
    });
  });

  it('returns null when nothing is unread', () => {
    expect(tiktok.synthNotification?.(load('blank'))).toBeNull();
  });
});
```

- [x] **Step 4: Update the service-catalog test**

In `tests/unit/services.test.ts`, replace the first `it` block's
expectation (list gains `'tiktok'` before `'shopee'`, size becomes 7,
label says seven):

```ts
  it('has exactly the seven spec services, unique, https', () => {
    expect(SERVICES.map((s) => s.id)).toEqual([
      'messenger',
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
      'tiktok',
      'shopee',
    ]);
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(7);
    for (const s of SERVICES) expect(s.url).toMatch(/^https:\/\//);
  });
```

The `'defaults: only messenger and zalo enabled'` test stays as-is —
tiktok ships disabled.

- [x] **Step 5: Update the settings-migration tests**

In `tests/unit/settings.test.ts`:

In `'surfaces services added after settings.json was written'`, the
migration appends missing ids in catalog order, so the expectation
becomes:

```ts
    expect(s.order).toEqual([
      'messenger',
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
      'tiktok',
      'shopee',
    ]);
    expect(s.muted.tiktok).toBe(false);
    expect(s.disabled.tiktok).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.tiktok).toBe(true);
```

(keep the existing `shopee` and `messenger` assertions below it).

In `'drops unknown service ids from a persisted order'`:

```ts
    expect(s.order).toEqual([
      'messenger',
      'zalo',
      'telegram',
      'whatsapp',
      'discord',
      'tiktok',
      'shopee',
    ]);
```

- [x] **Step 6: Update the navigation-policy test**

In `tests/unit/navigation-policy.test.ts`, add to the allowed/blocked
`it` blocks (match the surrounding style):

```ts
    expect(isNavigationAllowed('tiktok', 'https://www.tiktok.com/messages')).toBe(true);
    expect(isNavigationAllowed('tiktok', 'https://evil.example/')).toBe(false);
```

- [x] **Step 7: Run the touched suites and verify they fail for the right
  reasons**

Run:

```bash
corepack pnpm vitest run \
  tests/unit/recipes.test.ts tests/unit/tiktok-synth.test.ts \
  tests/unit/services.test.ts tests/unit/settings.test.ts \
  tests/unit/navigation-policy.test.ts
```

Expected failures — anything else means a test is wrong:

- `tiktok-synth.test.ts`: cannot resolve `src/preload/recipes/tiktok`.
- `recipes.test.ts`: `recipes.tiktok` is undefined (count/ready rows), and
  `waitForReady flag` still passes (no catalog entry yet).
- `services.test.ts`: catalog still has six ids.
- `settings.test.ts`: order arrays missing `tiktok`.
- `navigation-policy.test.ts`: `isNavigationAllowed('tiktok', …)` returns
  false for the allowed URL (no `ALLOWED_HOSTS` entry → lookup throws →
  caught → false).

- [ ] **Step 8: Commit gate**

STOP. Ask the user to run `/grimoire-core:commit` for the failing tests +
fixture (suggested subject:
`test(tiktok): add fixture and failing service tests`). Do not commit
yourself. If the user prefers to commit Tasks 1–2 together, continue to
Task 2 and gate there.

---

### Task 2: Registration, recipe, nav hosts, icons (goes green)

**Files:**

- Modify: `src/shared/types.ts:1` (ServiceId) and `:38-70`
  (DEFAULT_SETTINGS)
- Modify: `src/shared/services.ts:44-48` (insert before shopee entry)
- Create: `src/preload/recipes/tiktok.ts`
- Modify: `src/preload/recipes/index.ts`
- Modify: `src/main/lib/navigation-policy.ts:7-14`
- Create: `src/renderer/src/assets/logos/tiktok.svg`
- Create (generated): `resources/notification-icons/tiktok.png`,
  `resources/notification-icons/tiktok-mac.png`

**Interfaces:**

- Consumes: `Recipe` (`src/preload/recipes/types.ts`), `Counts`
  (`src/shared/types.ts`), `unreadFromTitle(title: string): number`
  (`src/preload/recipes/title.ts`), `textWithEmoji(el: Element): string`
  (`src/preload/recipes/emoji-text.ts`), the Task 1 fixture DOM contract.
- Produces: `recipes.tiktok: Recipe`; `'tiktok'` member of `ServiceId`;
  catalog entry `serviceById('tiktok')` → name `'TikTok'`, url
  `'https://www.tiktok.com/messages'`, color `'#FE2C55'`,
  `waitForReady: true`; renderer tiles/switcher pick up the logo
  automatically via `import.meta.glob('../assets/logos/*.svg')`.

- [x] **Step 1: Add `'tiktok'` to `ServiceId` and `DEFAULT_SETTINGS`**

In `src/shared/types.ts`, replace line 1 with (multi-line — the single
line would exceed the formatter width):

```ts
export type ServiceId =
  | 'whatsapp'
  | 'messenger'
  | 'telegram'
  | 'discord'
  | 'zalo'
  | 'tiktok'
  | 'shopee';
```

In `DEFAULT_SETTINGS`: replace `order` with

```ts
  order: ['messenger', 'telegram', 'zalo', 'whatsapp', 'discord', 'tiktok', 'shopee'],
```

and insert one line before the `shopee:` line in each record:
`tiktok: false,` in `muted`; `tiktok: true,` in `disabled`;
`tiktok: true,` in `neverHibernate`.

- [x] **Step 2: Add the catalog entry**

In `src/shared/services.ts`, insert before the `shopee` entry:

```ts
  // DMs only — land on /messages, not the feed (messenger-style). The
  // recipe's data-e2e hooks are uncalibrated until a live login pass.
  {
    id: 'tiktok',
    name: 'TikTok',
    url: 'https://www.tiktok.com/messages',
    color: '#FE2C55',
    waitForReady: true,
  },
```

- [x] **Step 3: Write the recipe**

Create `src/preload/recipes/tiktok.ts`:

```ts
import type { Counts } from '../../shared/types';
import { textWithEmoji } from './emoji-text';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** TikTok web DMs (www.tiktok.com/messages). Class names are build-hashed;
 *  TikTok's own data-e2e test hooks are the only durable selector surface.
 *  UNCALIBRATED (2026-08-07): hooks are best-effort — verify against a live
 *  login, fix up, and replace this line with a dated "calibrated" note
 *  (see shopee.ts). */

/** Total-unread badge on the Messages nav entry (top nav on the feed,
 *  sidebar rail on /messages). */
const BADGE = '[data-e2e="message-badge"], [data-e2e="top-dm-icon"] sup';

const tiktok: Recipe = {
  id: 'tiktok',
  intervalMs: 2000,
  // DM conversation list mounted — a logged-out /messages bounces to a
  // login page, which must keep the waking cover up
  ready(doc) {
    return doc.querySelector('[data-e2e="chat-list"]') !== null;
  },
  count(doc): Counts {
    const m = doc.querySelector(BADGE)?.textContent?.match(/\d+/); // "99+" → 99
    if (!m) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    return { direct: Number.parseInt(m[0], 10), indirect: 0 };
  },
  // TikTok web delegates to browser push, which Electron lacks (no FCM) —
  // synthesize from the first chat-list row carrying an unread badge.
  synthNotification(doc) {
    for (const row of doc.querySelectorAll('[data-e2e="chat-list-item"]')) {
      const badge = row.querySelector('[data-e2e="chat-item-badge"]');
      if (!/\d/.test(badge?.textContent ?? '')) continue;
      const nickname = row.querySelector('[data-e2e="chat-item-nickname"]');
      if (!nickname) continue;
      const message = row.querySelector('[data-e2e="chat-item-message"]');
      return {
        title: textWithEmoji(nickname),
        body: message ? textWithEmoji(message) : '',
      };
    }
    return null;
  },
};

export default tiktok;
```

- [x] **Step 4: Register the recipe**

In `src/preload/recipes/index.ts`, add `import tiktok from './tiktok';`
(imports stay alphabetical — biome enforces order: after `telegram`,
before `./types`) and add `tiktok,` before `shopee,` in the `recipes`
record.

- [x] **Step 5: Allowlist the hosts**

In `src/main/lib/navigation-policy.ts`, insert before the `shopee:` line:

```ts
  tiktok: ['www.tiktok.com', 'tiktok.com'],
```

(OAuth-redirect hosts get added during the live login pass, per the file's
VERIFY LIVE banner.)

- [x] **Step 6: Add the logo and generate icons**

Create `src/renderer/src/assets/logos/tiktok.svg` — Simple Icons TikTok
glyph (CC0), white fill, 24-unit viewBox, one line like the other logos
(the path is a single unbreakable line — copy it verbatim):

<!-- markdownlint-disable MD013 -->

```html
<svg fill="#ffffff" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>TikTok</title><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
```

<!-- markdownlint-enable MD013 -->

Then run:

```bash
corepack pnpm icons
```

Expected output includes `tiktok: full-bleed + macOS inset`. Open
`resources/notification-icons/tiktok.png` (Read tool / Quick Look) and
confirm it renders the white TikTok note glyph on a `#FE2C55` tile — a
wrong path renders as visible garbage, not an error.

- [x] **Step 7: Run the full unit suite**

```bash
corepack pnpm test
```

Expected: PASS, including all Task 1 tests, `waitForReady flag` pairing,
and `notification icon assets` (which iterates `SERVICES` and now checks
the tiktok PNGs).

- [x] **Step 8: Lint and typecheck**

```bash
corepack pnpm lint && corepack pnpm typecheck
```

Expected: both green. If biome flags formatting, apply
`corepack pnpm exec biome check --write .` and re-run.

- [ ] **Step 9: Commit gate**

STOP. Ask the user to run `/grimoire-core:commit` (suggested subject:
`feat(services): add TikTok DM service`). Do not commit yourself.

---

### Task 3: README, e2e, final verification

**Files:**

- Modify: `README.md:3-4` (service list), `README.md:76` (shortcut range)

**Interfaces:**

- Consumes: the finished service from Task 2.
- Produces: nothing new — documentation + the definition-of-done evidence.

- [x] **Step 1: Update the README service list**

Replace lines 3–4 (verbatim README content — the second line runs long by
design, matching the existing file):

<!-- markdownlint-disable MD013 -->

```markdown
Personal multi-service chat client — WhatsApp, Messenger, Telegram, Discord, Zalo,
TikTok, Shopee in one window, with native notifications and unread badges. macOS + Windows.
```

<!-- markdownlint-enable MD013 -->

- [x] **Step 2: Update the shortcut range**

On line 76, change `⌘/Ctrl+1…6` to `⌘/Ctrl+1…7` (the menu derives
accelerators from `order`, so code needs no change).

- [x] **Step 3: Lint the README**

```bash
npx markdownlint-cli2 README.md
```

Expected: `Summary: 0 issues`. (If the file has pre-existing violations
unrelated to these two lines, leave them; fix only what these edits
introduce.)

- [x] **Step 4: Run e2e**

```bash
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: PASS. (`ELECTRON_RUN_AS_NODE` leaks from VS Code shells and
breaks Electron startup.) TikTok ships disabled, so e2e never touches the
live site.

- [x] **Step 5: Full gate re-run**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

Expected: all green.

- [ ] **Step 6: Commit gate**

STOP. Ask the user to run `/grimoire-core:commit` (suggested subject:
`docs(readme): list TikTok service`). Do not commit yourself.

---

## Follow-up (out of scope, tracked here so it isn't lost)

- **Live calibration pass:** log into TikTok in a packaged/dev build,
  verify the `data-e2e` hooks (`message-badge`, `top-dm-icon`,
  `chat-list`, `chat-list-item`, `chat-item-*`), fix them up, update the
  fixture to mirror the real DOM, and replace the recipe's `UNCALIBRATED`
  line with a dated `Calibrated` note.
- **Auth-redirect hosts:** during that login, record every host the login
  flow bounces through and add them to `ALLOWED_HOSTS.tiktok` (per the
  navigation-policy VERIFY LIVE banner).
- **Existing installs:** persisted `order` arrays get `tiktok` appended
  after `shopee` (migration appends new ids; it never reorders a user's
  rail). Drag the tile once to put it before Shopee — the default order
  only shapes fresh installs.
