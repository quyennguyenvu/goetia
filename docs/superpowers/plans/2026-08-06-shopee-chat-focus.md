# Shopee Chat-Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the embedded Shopee service render the buyer mini-chat full-window (no shopping chrome, no header), with real unread counts, auto-open of the collapsed widget, and Shopee disabled by default.

**Architecture:** All page reshaping happens in the shopee recipe's `css` (injected by the preload on every `DOMContentLoaded`), keyed only on the stable ids `#main` and `#shopee-mini-chat-embedded`. `count()` parses the widget's badge; `keepAlive()` reuses the trusted-click runner to open the collapsed pill. Entry URL moves to the homepage to avoid Shopee's anti-bot gate on `/webchat`.

**Tech Stack:** Electron, TypeScript, vitest (happy-dom fixtures), Playwright e2e.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-shopee-chat-focus-design.md`
- Never reference Shopee's build-hashed class names (e.g. `UvGSSkd1qQ`) — ids and structural selectors only.
- `count()` must never throw and must return `{ direct: 0, indirect: 0 }` on `tests/fixtures/blank.html`.
- **No `git commit` anywhere** — the repo owner commits via `/commit`.
- Verify with: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e` (unset `ELECTRON_RUN_AS_NODE` for e2e).

---

### Task 1: Shopee disabled by default

**Files:**

- Modify: `src/shared/types.ts` (DEFAULT_SETTINGS.disabled)
- Modify: `tests/unit/services.test.ts:33-36`
- Modify: `tests/unit/settings.test.ts` (migration test)
- Modify: `tests/e2e/smoke.spec.ts:19-20`

**Interfaces:**

- Consumes: `DEFAULT_SETTINGS` from `src/shared/types.ts`.
- Produces: `DEFAULT_SETTINGS.disabled.shopee === true`; rail shows 2 enabled services by default (messenger, zalo).

- [ ] **Step 1: Update the tests to the new expectations**

In `tests/unit/services.test.ts` replace the enabled-defaults test:

```ts
it('defaults: only messenger and zalo enabled', () => {
  const enabled = SERVICES.map((s) => s.id).filter(
    (id) => !DEFAULT_SETTINGS.disabled[id],
  );
  expect(enabled).toEqual(['messenger', 'zalo']);
});
```

In `tests/unit/settings.test.ts`, in `'surfaces services added after settings.json was written'`, change:

```ts
expect(s.disabled.shopee).toBe(true); // new service arrives disabled
```

In `tests/e2e/smoke.spec.ts`:

```ts
// only messenger and zalo are enabled by default
await expect(
  win.locator('[data-testid="rail"] button[aria-label]'),
).toHaveCount(2);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/services.test.ts tests/unit/settings.test.ts` Expected: 2 failures (enabled list contains `'shopee'`; `disabled.shopee` is `false`).

- [ ] **Step 3: Flip the default**

In `src/shared/types.ts` `DEFAULT_SETTINGS.disabled`, change `shopee: false` to `shopee: true`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/services.test.ts tests/unit/settings.test.ts` Expected: PASS.

---

### Task 2: Entry URL moves off the anti-bot gate

**Files:**

- Modify: `src/shared/services.ts` (shopee entry)

**Interfaces:**

- Produces: `serviceById('shopee').url === 'https://shopee.vn/'`.

- [ ] **Step 1: Change the catalog entry**

```ts
// buyer chat lives in the mini-chat widget on the shopping site; the
// recipe css reshapes it to fill the view. Never target /webchat —
// it hits Shopee's anti-bot wall (verify/captcha, scene=crawler_item)
{ id: 'shopee', name: 'Shopee', url: 'https://shopee.vn/', color: '#EE4D2D' },
```

- [ ] **Step 2: Verify**

Run: `pnpm vitest run tests/unit/services.test.ts && pnpm typecheck` Expected: PASS (no test pins the URL beyond the `https://` regex).

---

### Task 3: Fixtures + `count()` reads the widget badge

**Files:**

- Rewrite: `tests/fixtures/shopee.html` (expanded panel)
- Create: `tests/fixtures/shopee-collapsed.html` (collapsed pill)
- Modify: `tests/unit/recipes.test.ts` (cases row + collapsed case)
- Modify: `src/preload/recipes/shopee.ts` (count)

**Interfaces:**

- Consumes: `Recipe` from `src/preload/recipes/types.ts`, `unreadFromTitle` from `src/preload/recipes/title.ts`.
- Produces: `shopee.count(doc): Counts`; helper `chatHeader(doc): Element | null` (module-local, exported for reuse by `keepAlive` in Task 4 via module scope — not exported publicly).

- [ ] **Step 1: Rewrite the expanded fixture**

`tests/fixtures/shopee.html` — mirrors the probed structure (2026-08-06): host > wrapper > header (badge + controls) + body (list + thread). Class names are neutral because selectors are structural:

```html
<title>Shopee Việt Nam | Mua Sắm Online</title>
<div id="main">
  <div class="shop-feed">Flash Sale 9.9</div>
</div>
<div id="shopee-mini-chat-embedded">
  <div class="wrapper">
    <div class="header">
      <div class="left"><i class="logo"></i><div class="badge">31</div></div>
      <div class="controls"><div class="expand"></div><div class="fold"></div></div>
    </div>
    <div class="body">
      <div class="list">Thiên Long Official</div>
      <div class="thread">Welcome to Shopee Chat</div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Create the collapsed fixture**

`tests/fixtures/shopee-collapsed.html`:

```html
<title>Shopee Việt Nam | Mua Sắm Online</title>
<div id="main"></div>
<div id="shopee-mini-chat-embedded">
  <div class="wrapper">
    <div class="pill"><i class="logo"></i>5</div>
  </div>
</div>
```

- [ ] **Step 3: Update the recipe tests**

In `tests/unit/recipes.test.ts`, update the shopee row in `cases`:

```ts
['shopee', 'shopee', 31, 0], // mini-chat header badge
```

Below the `'zalo 5+ tab badge'` describe, add:

```ts
describe('shopee collapsed pill', () => {
  it('counts from the pill badge while collapsed', async () => {
    expect(await recipes.shopee.count(load('shopee-collapsed'))).toEqual({
      direct: 5,
      indirect: 0,
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/recipes.test.ts` Expected: FAIL — shopee fixture row expects 31, stub returns 0 (title has no "(n)").

- [ ] **Step 5: Implement count()**

Replace the body of `src/preload/recipes/shopee.ts` (keep the file's doc-comment style; css and keepAlive arrive in Tasks 4-5):

```ts
import type { Counts } from '../../shared/types';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** The mini-chat widget on shopee.vn (buyer chat). Stable ids:
 *  #main (shopping site), #shopee-mini-chat-embedded (chat host).
 *  Everything below them is build-hashed — structural selectors only.
 *  Expanded: host > wrapper > [header, body]. Collapsed: 100x48 pill
 *  (wrapper has a single child). Calibrated 2026-08-06. */

/** Header row when expanded, whole wrapper when collapsed —
 *  the one place the unread badge text lives. */
function chatHeader(doc: Document): Element | null {
  const wrapper = doc.querySelector(
    '#shopee-mini-chat-embedded',
  )?.firstElementChild;
  if (!wrapper) return null;
  return wrapper.children.length >= 2 ? wrapper.children[0] : wrapper;
}

const shopee: Recipe = {
  id: 'shopee',
  intervalMs: 2000,
  count(doc): Counts {
    const header = chatHeader(doc);
    if (!header) {
      return { direct: unreadFromTitle(doc.title), indirect: 0 };
    }
    const m = (header.textContent ?? '').match(/\d+/);
    return { direct: m ? Number.parseInt(m[0], 10) : 0, indirect: 0 };
  },
};

export default shopee;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/recipes.test.ts` Expected: PASS, including the blank-page zero case (no host → title fallback → `Login` has no digits in "(n)" form → 0).

---

### Task 4: `keepAlive()` opens the collapsed pill

**Files:**

- Create: `tests/unit/shopee-keepalive.test.ts`
- Modify: `src/preload/recipes/shopee.ts` (add keepAlive)

**Interfaces:**

- Consumes: `chatHeader(doc)` and the fixtures from Task 3; the runner contract in `src/preload/recipes/runner.ts` (rate-limits keepAlive clicks to one per 30 s and swallows throws).
- Produces: `shopee.keepAlive(doc): { x: number; y: number } | null`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/shopee-keepalive.test.ts` — mirror the structure of `tests/unit/zalo-keepalive.test.ts` (read it first; reuse its fixture loader shape). Cases:

```ts
// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import shopee from '../../src/preload/recipes/shopee';

function load(name: string): Document {
  const html = readFileSync(
    join(__dirname, '../fixtures', `${name}.html`),
    'utf8',
  );
  document.documentElement.innerHTML = html;
  return document;
}

describe('shopee keepAlive', () => {
  it('targets the collapsed pill (zero rects pass through)', () => {
    // happy-dom has no layout: rects are all zeros, which must still
    // produce a click target (same contract as zalo-keepalive)
    expect(shopee.keepAlive?.(load('shopee-collapsed'))).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('returns null when the panel is already expanded', () => {
    expect(shopee.keepAlive?.(load('shopee'))).toBeNull();
  });

  it('returns null when the widget is absent', () => {
    expect(shopee.keepAlive?.(load('blank'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/shopee-keepalive.test.ts` Expected: FAIL — `keepAlive` is `undefined`.

- [ ] **Step 3: Implement keepAlive**

Add to the `shopee` recipe object in `src/preload/recipes/shopee.ts`:

```ts
  // Collapsed pill needs a trusted click to open the chat panel —
  // page-JS synthetic clicks are untrusted (same machinery as zalo's
  // activation modal; runner rate-limits to one click per 30s).
  keepAlive(doc) {
    const host = doc.querySelector('#shopee-mini-chat-embedded');
    const wrapper = host?.firstElementChild;
    if (!host || !wrapper) return null;
    if (wrapper.children.length >= 2) return null; // expanded: healthy
    const r = host.getBoundingClientRect();
    // laid-out-but-tiny rect: view not really laid out, don't click
    if (r.width > 0 && r.width < 20) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/shopee-keepalive.test.ts` Expected: PASS.

---

### Task 5: Chat-focus CSS

**Files:**

- Modify: `src/preload/recipes/shopee.ts` (add css)

**Interfaces:**

- Consumes: preload css injection on `DOMContentLoaded` (`src/preload/service.ts:26-31`) — nothing to wire, declarative.
- Produces: the `css` string below, verified live in Task 6.

- [ ] **Step 1: Add the css block to the recipe**

Add to the `shopee` recipe object (validated live against the logged-in DOM on 2026-08-06 — full-window chat, screenshot-verified):

```ts
  // chat only: once the mini-chat panel is EXPANDED it becomes the app —
  // hide the shopping site and fill the view. Every rule is gated on the
  // expanded state (:has body child): while collapsed the page must stay
  // untouched so login/captcha pages work and the pill keeps its real
  // rect for keepAlive. Hiding keeps textContent readable for count().
  css: `
    body:has(#shopee-mini-chat-embedded > div > div:nth-child(2))
      #main { display: none !important; }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2)) {
      position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important;
      max-width: none !important; max-height: none !important;
    }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2)) > div {
      width: 100% !important; height: 100% !important;
      max-width: none !important; max-height: none !important;
    }
    #shopee-mini-chat-embedded > div:has(> div:nth-child(2))
      > div:first-child { display: none !important; }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2))
      > div > div:last-child {
      height: 100% !important; max-height: none !important;
    }
  `,
```

(Amended during live verification: ungated rules stretched the collapsed pill into a blank view and would hide a captcha — every rule is now gated on the expanded state. `keepAlive` likewise targets the pill element, not the host.)

- [ ] **Step 2: Static verification**

Run: `pnpm lint && pnpm typecheck && pnpm test` Expected: all PASS (css is declarative; live check is Task 6).

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Unit + e2e suites**

Run:

```bash
pnpm lint && pnpm typecheck && pnpm test
env -u ELECTRON_RUN_AS_NODE pnpm e2e
```

Expected: all PASS (e2e rail count is 2 again).

- [ ] **Step 2: Manual in-app verification (with the repo owner)**

1. Quit any running Goetia instances (installed app and probes).
2. `pnpm build`, then `env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron out/main/index.js` (or `pnpm dev`).
3. Settings → enable Shopee → tile appears last on the rail.
4. Open the Shopee tile: within ~30 s the collapsed pill auto-opens (keepAlive), the shopping site is hidden, chat fills the view, no header row.
5. Rail badge shows the real unread count.
6. ⌘/Ctrl+R reload: chat-focus treatment re-applies (css re-injected on DOMContentLoaded), no `/verify/` URL, no broken layout.
7. Restart the app: session persists, chat loads without re-login.

- [ ] **Step 3: Hand back for commit**

Report results to the repo owner; they commit via `/commit`.

---

## Self-Review

- Spec coverage: entry URL (Task 2), css reshape + header removal (Task 5), auto-open (Task 4), unread count (Task 3), disabled by default (Task 1), no network filtering (no task — deliberate), reload robustness (Task 6 step 2.6). Covered.
- No placeholders; all code inline.
- Types: `chatHeader` defined in Task 3, used in Task 3 only (`keepAlive` re-queries the host directly — no cross-task drift). `Counts`/`Recipe` imports match `src/preload/recipes/types.ts`.
