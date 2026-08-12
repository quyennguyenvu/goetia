# Slack Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Slack as Goetia's ninth service — catalog entry, unread-count recipe, fixture-backed tests, navigation hosts, notification icons, and copy updates — per `docs/superpowers/specs/2026-08-12-slack-service-design.md`.

**Architecture:** Slack follows the Discord shape: the whole client under `app.slack.com/client` is chat, so there is no `chatPaths` containment — a small recipe `css` block is the entire chat-only treatment. `count()` reads the channel sidebar: numeric mention badges sum to `direct` (title `(n)` fallback), badge-less unread channels count as `indirect`. Slack fires its own in-page HTML5 notifications, so there is no `synthNotification`.

**Tech Stack:** Electron + TypeScript, vitest (happy-dom fixtures), Playwright e2e, resvg icon pipeline, Biome.

## Global Constraints

- Definition of done (CLAUDE.md): `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green, plus `corepack pnpm e2e` (run as `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` — VS Code shells export that variable and it breaks Electron).
- **Never run `git commit`.** The user's global rules require every commit to go through `/grimoire-core:commit` after they confirm the message. This plan has a single commit checkpoint at the end (Task 4); when you reach it, stop and ask the user to run `/commit`. Tasks 1–3 are one atomic change — the `Record<ServiceId, …>` types and the `waitForReady`/`SERVICES` iteration tests couple them, so intermediate states don't typecheck or pass the full suite and must not be committed separately.
- Catalog values (spec, verbatim): id `slack`, name `Slack`, url `https://app.slack.com/client`, color `#4A154B`, `waitForReady: true`. Name-ordered position: between `shopee` and `telegram` in `SERVICES` and in `DEFAULT_SETTINGS.order`.
- Recipe cost rules (CLAUDE.md): `count()` runs every ~2s forever, also while hidden — scoped `querySelectorAll` only, no `getComputedStyle`/`getBoundingClientRect` sweeps, no IndexedDB, must settle synchronously, `{ direct: 0, indirect: 0 }` on `blank.html`, never throw.
- Selectors are **uncalibrated until a live login pass** (tiktok/instagram precedent) — say so in a recipe comment, do not silently trust them.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- Markdown edits must pass `npx markdownlint-cli2 <file>`; this repo disables MD013 — never hard-wrap prose.

---

### Task 1: Catalog entry, recipe, fixture, navigation hosts

**Files:**

- Modify: `src/shared/types.ts` (ServiceId union ~line 1-9, DEFAULT_SETTINGS ~line 67-111)
- Modify: `src/shared/services.ts` (SERVICES array, between shopee and telegram)
- Modify: `src/preload/recipes/index.ts`
- Modify: `src/main/lib/navigation-policy.ts` (ALLOWED_HOSTS)
- Create: `src/preload/recipes/slack.ts`
- Create: `tests/fixtures/slack.html`
- Test: `tests/unit/recipes.test.ts`, `tests/unit/services.test.ts`, `tests/unit/settings.test.ts`, `tests/unit/welcome.test.ts`, `tests/unit/navigation-policy.test.ts`, `tests/e2e/welcome.spec.ts`

**Interfaces:**

- Consumes: `Recipe` from `src/preload/recipes/types.ts`; `visiblyPresent(doc, el)` from `./ready`; `unreadFromTitle(title)` from `./title`.
- Produces: `recipes.slack` (a `Recipe` with `ready()` and `count()`), `serviceById('slack')`, `'slack'` as a valid `ServiceId` — Tasks 2–3 and the icon pipeline (`SERVICES` loop in `scripts/build-notification-icons.mjs`) rely on these.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/recipes.test.ts`, add a row to `cases` after the `shopee` row:

```ts
  ['slack', 'slack', 3, 2], // mention badges sum direct; badge-less unread channels indirect; muted skipped
```

In the same file's `describe('ready()')` block, add after the tiktok case:

```ts
  it('slack is ready once the channel sidebar mounts', () => {
    expect(recipes.slack.ready?.(load('slack'))).toBe(true);
    expect(recipes.slack.ready?.(load('blank'))).toBe(false);
  });
```

In `tests/unit/services.test.ts`, replace the first test (`'has exactly the eight spec services, unique, https'`) with:

```ts
  it('has exactly the nine spec services, unique, https', () => {
    expect(SERVICES.map((s) => s.id)).toEqual([
      'discord',
      'instagram',
      'messenger',
      'shopee',
      'slack',
      'telegram',
      'tiktok',
      'whatsapp',
      'zalo',
    ]);
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(9);
    for (const s of SERVICES) expect(s.url).toMatch(/^https:\/\//);
  });
```

In `tests/unit/settings.test.ts`, test `'surfaces services added after settings.json was written'`: replace the `expect(s.order).toEqual([...])` literal with (slack slots after shopee, its catalog predecessor — `normalize()` inserts missing ids in catalog order, so already-slotted shopee anchors slack):

```ts
    expect(s.order).toEqual([
      'messenger',
      'shopee',
      'slack',
      'telegram',
      'tiktok',
      'zalo',
      'whatsapp',
      'discord',
      'instagram',
    ]);
```

and add, next to the existing per-service assertions in that test:

```ts
    expect(s.muted.slack).toBe(false);
    expect(s.disabled.slack).toBe(true); // new service arrives disabled
    expect(s.neverHibernate.slack).toBe(true);
```

Same file, test `'drops unknown service ids from a persisted order'` — the expected order becomes the nine-service default:

```ts
    expect(s.order).toEqual([
      'discord',
      'instagram',
      'messenger',
      'shopee',
      'slack',
      'telegram',
      'tiktok',
      'whatsapp',
      'zalo',
    ]);
```

Same file, test `'keeps a user reordering when a new service arrives'` — both unseen ids (instagram, slack) slot in; replace the two expectations:

```ts
    expect(s.order).toEqual([
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
      'instagram',
      'tiktok',
      'shopee',
      'slack',
      'messenger',
    ]);
    // the property the user can actually see: their arrangement is intact
    expect(s.order.filter((id) => id !== 'instagram' && id !== 'slack')).toEqual([
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
      'tiktok',
      'shopee',
      'messenger',
    ]);
```

In `tests/unit/welcome.test.ts`, two hardcoded literals gain `'slack'` (the rest of the file derives from `DEFAULT_SETTINGS.order`). In `describe('summonOrder')`, test `'appends a newly summoned service to the end'`:

```ts
    expect(summonOrder(order, set('zalo'), set('zalo', 'discord'), named)).toEqual([
      'instagram',
      'messenger',
      'shopee',
      'slack',
      'telegram',
      'tiktok',
      'whatsapp',
      'zalo',
      'discord',
    ]);
```

In `describe('welcomeSections')`, test `'splits a mixed set'`:

```ts
    expect(welcomeSections(order, set('messenger', 'zalo'), named)).toEqual({
      summoned: ['messenger', 'zalo'],
      unbound: ['discord', 'instagram', 'shopee', 'slack', 'telegram', 'tiktok', 'whatsapp'],
    });
```

In `tests/unit/navigation-policy.test.ts`, extend the first two tests:

```ts
    expect(isNavigationAllowed('slack', 'https://app.slack.com/client')).toBe(true);
    expect(isNavigationAllowed('slack', 'https://slack.com/signin')).toBe(true);
```

```ts
    expect(isNavigationAllowed('slack', 'https://evil.example/')).toBe(false);
```

In `tests/e2e/welcome.spec.ts` (~line 28-32), the fresh-install expectation:

```ts
  // nothing is summoned yet: the intro carries the screen and all nine wait below
```

```ts
  await expect(unbound.locator('[data-testid="pick-tile"]')).toHaveCount(9);
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run: `corepack pnpm test tests/unit/recipes.test.ts tests/unit/services.test.ts tests/unit/settings.test.ts tests/unit/welcome.test.ts tests/unit/navigation-policy.test.ts`

Expected: FAIL — recipes.test throws `TypeError` (`recipes.slack` is undefined), services/settings/welcome fail on the array equalities, navigation-policy fails because `ALLOWED_HOSTS.slack` is undefined (`.includes` on undefined).

- [ ] **Step 3: Add slack to the shared catalog**

`src/shared/types.ts` — extend the union (append after `'shopee'`):

```ts
export type ServiceId =
  | 'whatsapp'
  | 'messenger'
  | 'instagram'
  | 'telegram'
  | 'discord'
  | 'zalo'
  | 'tiktok'
  | 'shopee'
  | 'slack';
```

`DEFAULT_SETTINGS.order` gains `'slack'` between `'shopee'` and `'telegram'`:

```ts
  order: [
    'discord',
    'instagram',
    'messenger',
    'shopee',
    'slack',
    'telegram',
    'tiktok',
    'whatsapp',
    'zalo',
  ],
```

Each of `muted`, `disabled`, `neverHibernate` gains a `slack` key after its `shopee` line — `slack: false` in `muted`, `slack: true` in `disabled` (all disabled ⇒ fresh installs open on welcome), `slack: true` in `neverHibernate`.

`src/shared/services.ts` — insert between the shopee and telegram entries (keep name order, per the file's header comment):

```ts
  // the whole client under app.slack.com/client is chat (discord precedent);
  // /client lands on the last-active workspace, the built-in switcher rail
  // covers the rest
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://app.slack.com/client',
    color: '#4A154B',
    waitForReady: true,
  },
```

- [ ] **Step 4: Write the recipe and register it**

Create `src/preload/recipes/slack.ts`:

```ts
import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

// Chat only, discord-shaped: everything under app.slack.com/client is chat,
// so there is no chatPaths containment and the css below is cosmetic.
// Selectors follow Slack's long-stable BEM classes and data-qa hooks but are
// UNCALIBRATED until a live login pass (tiktok precedent). Slack notifies
// in-page via HTML5 Notification, so no synthNotification.
const slack: Recipe = {
  id: 'slack',
  intervalMs: 2000,
  // upsell banners + non-chat tab-rail destinations. The rail items carry no
  // stable class, only (locale-sensitive) aria-labels — a no-op in other
  // locales is acceptable for cosmetics. None of these exist on login pages.
  css: `
    .p-channel_sidebar__banner--upgrade,
    [data-qa="upgrade_banner"],
    [data-qa*="upsell"],
    .p-tab_rail [aria-label="Canvases"],
    .p-tab_rail [aria-label="Files"],
    .p-tab_rail [aria-label="Automations"],
    .p-tab_rail [aria-label="Templates"] {
      display: none !important;
    }
  `,
  // Slack's "loading your workspace" splash covers the client while it boots
  ready(doc) {
    return visiblyPresent(
      doc,
      doc.querySelector('.p-channel_sidebar, [data-qa="workspace_sidebar"]'),
    );
  },
  count(doc) {
    const sidebar = doc.querySelector('.p-channel_sidebar') ?? doc;
    const badges = [...sidebar.querySelectorAll('.c-mention_badge')]
      .map((el) => Number.parseInt(el.textContent ?? '', 10))
      .filter((n) => Number.isFinite(n));
    const direct =
      badges.length > 0 ? badges.reduce((a, b) => a + b, 0) : unreadFromTitle(doc.title);
    // unread channels without a mention badge; badge rows already counted above
    const indirect = [
      ...sidebar.querySelectorAll(
        '.p-channel_sidebar__channel--unread:not(.p-channel_sidebar__channel--muted)',
      ),
    ].filter((el) => !el.querySelector('.c-mention_badge')).length;
    return { direct, indirect };
  },
};
export default slack;
```

`src/preload/recipes/index.ts` — add the import between `shopee` and `telegram` (Biome keeps imports sorted) and the record entry after `shopee`:

```ts
import slack from './slack';
```

```ts
export const recipes: Record<ServiceId, Recipe> = {
  whatsapp,
  messenger,
  instagram,
  telegram,
  discord,
  zalo,
  tiktok,
  shopee,
  slack,
};
```

- [ ] **Step 5: Create the fixture**

Create `tests/fixtures/slack.html` (the count oracle: 2 + 1 mention badges → direct 3; two badge-less unread channels → indirect 2; one muted unread and one read channel count nothing):

```html
<title>Slack - Goetia HQ</title>
<div class="p-channel_sidebar" data-qa="workspace_sidebar">
  <div class="p-channel_sidebar__channel p-channel_sidebar__channel--unread">
    <span>alice</span><span class="c-mention_badge">2</span>
  </div>
  <div class="p-channel_sidebar__channel p-channel_sidebar__channel--unread">
    <span>bob</span><span class="c-mention_badge">1</span>
  </div>
  <div class="p-channel_sidebar__channel p-channel_sidebar__channel--unread"><span>general</span></div>
  <div class="p-channel_sidebar__channel p-channel_sidebar__channel--unread"><span>launch</span></div>
  <div class="p-channel_sidebar__channel p-channel_sidebar__channel--unread p-channel_sidebar__channel--muted"><span>noise</span></div>
  <div class="p-channel_sidebar__channel"><span>archive</span></div>
</div>
```

- [ ] **Step 6: Add the navigation hosts**

`src/main/lib/navigation-policy.ts` — add to `ALLOWED_HOSTS` after the `shopee` line:

```ts
  // per-user workspace hosts ({team}.slack.com) and the SSO bounce hosts
  // (Google/Apple) can't be listed statically — needs suffix matching plus a
  // live login pass before the guard can be wired for slack
  slack: ['app.slack.com', 'slack.com', 'www.slack.com'],
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `corepack pnpm test tests/unit/recipes.test.ts tests/unit/services.test.ts tests/unit/settings.test.ts tests/unit/welcome.test.ts tests/unit/navigation-policy.test.ts`

Expected: PASS (all files). The `waitForReady` loop in recipes.test.ts now sees both the flag and `recipes.slack.ready` — no extra test needed.

Run: `corepack pnpm typecheck`

Expected: clean — every `Record<ServiceId, …>` literal now carries the `slack` key.

Run: `corepack pnpm test`

Expected: one remaining failure, `tests/unit/notification-icons.test.ts` (`slack has both variants at 128px` — the PNGs don't exist yet). That failure is Task 2's failing test; everything else green. Do NOT commit here — the suite is red by design until Task 2.

### Task 2: Logo and notification icons

**Files:**

- Create: `src/renderer/src/assets/logos/slack.svg`
- Create (generated): `resources/notification-icons/slack.png`, `resources/notification-icons/slack-mac.png`
- Test: `tests/unit/notification-icons.test.ts` (no edits — it iterates `SERVICES`)

**Interfaces:**

- Consumes: `SERVICES` (Task 1) via `scripts/build-notification-icons.mjs`, which nests `logos/<id>.svg` whole onto a `color`-filled tile — the SVG must carry its own `viewBox` and a white fill.
- Produces: `resources/notification-icons/slack{,-mac}.png` consumed by `NotificationRouter` at runtime.

- [ ] **Step 1: Confirm the failing test**

Run: `corepack pnpm test tests/unit/notification-icons.test.ts`

Expected: FAIL — `slack has both variants at 128px` cannot read `resources/notification-icons/slack.png`.

- [ ] **Step 2: Add the logo SVG**

Fetch the simple-icons Slack glyph (matching every existing logo in `src/renderer/src/assets/logos/`):

```bash
curl -fsSL https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/slack.svg -o src/renderer/src/assets/logos/slack.svg
```

Then edit the file to add the white fill, exactly like `discord.svg`: change `<svg role="img"` to `<svg fill="#ffffff" role="img"`.

If offline, write the file directly with the simple-icons Slack path (verify the rendered PNG in Step 3 looks like the Slack logo — four pills around a pinwheel):

```html
<svg fill="#ffffff" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Slack</title><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
```

- [ ] **Step 3: Generate the icons**

Run: `corepack pnpm icons`

Expected output: one `<id>: full-bleed + macOS inset` line per service, including `slack: full-bleed + macOS inset`. Open `resources/notification-icons/slack.png` and confirm it is the Slack pinwheel on an aubergine (`#4A154B`) rounded tile.

- [ ] **Step 4: Run the full unit suite to verify it passes**

Run: `corepack pnpm test`

Expected: PASS — all files green, including notification-icons.test.ts.

### Task 3: Copy updates (shortcut range, README)

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx:389`
- Modify: `README.md:14` and `README.md:166`

**Interfaces:**

- Consumes: nothing from other tasks (menu accelerators in `src/main/menu.ts` map `CmdOrCtrl+${i + 1}` over the whole rail order already — nine services bind 1…9 with no code change).
- Produces: user-facing copy only; nothing downstream consumes it.

- [ ] **Step 1: Bump the Shortcuts pane range**

In `src/renderer/src/components/SettingsView.tsx`, change:

```tsx
                  <p className="py-1">⌘/Ctrl + 1…8 — jump to service</p>
```

to:

```tsx
                  <p className="py-1">⌘/Ctrl + 1…9 — jump to service</p>
```

- [ ] **Step 2: Update the README**

Line 14: change the service list `…Zalo, TikTok, and Shopee in one window…` to `…Zalo, TikTok, Shopee, and Slack in one window…` (rest of the sentence unchanged).

Line 166: change `⌘/Ctrl+1…7 jump to a service` to `⌘/Ctrl+1…9 jump to a service` (the range was already stale at eight services).

Lines 18/24/28 stay: Slack has no `chatPaths` pinning and no synthetic notifications, so neither selling-point list gains it.

- [ ] **Step 3: Verify**

Run: `grep -n "1…" src/renderer/src/components/SettingsView.tsx README.md`

Expected: only `1…9` occurrences.

Run: `npx markdownlint-cli2 README.md`

Expected: `Summary: 0 issues in 0 files` (repo config already disables MD013 — do not re-wrap lines).

### Task 4: Full gates and commit checkpoint

**Files:**

- None (verification only).

**Interfaces:**

- Consumes: everything from Tasks 1–3.
- Produces: a verified working tree, ready for the user's `/commit`.

- [ ] **Step 1: Run every gate**

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all green. If Biome reformats anything during `lint`, re-run until clean. The e2e welcome spec now asserts nine pick-tiles.

- [ ] **Step 2: Verify the CLAUDE.md add-a-service checklist**

Confirm each item: (1) ServiceId + SERVICES + all DEFAULT_SETTINGS records ✓ Task 1; (2) recipe honoring cost rules, `waitForReady` in sync ✓ Task 1; (3) fixture + recipes.test.ts row, blank-page zeros ✓ Task 1; (4) ALLOWED_HOSTS entry (live-login verification stays a documented follow-up) ✓ Task 1; (5) notification icons ✓ Task 2; (6) no new permissions, no new IPC channels ✓ (nothing added).

- [ ] **Step 3: Commit checkpoint — hand to the user**

Do NOT run `git commit`. Tell the user all gates are green and ask them to run `/commit` (suggested subject: `feat(slack): add Slack service`). The changed set: `src/shared/types.ts`, `src/shared/services.ts`, `src/preload/recipes/slack.ts`, `src/preload/recipes/index.ts`, `src/main/lib/navigation-policy.ts`, `src/renderer/src/assets/logos/slack.svg`, `resources/notification-icons/slack{,-mac}.png`, `src/renderer/src/components/SettingsView.tsx`, `README.md`, `tests/fixtures/slack.html`, five test files, plus the spec and this plan.

## Out of scope (from the spec)

- Live-login calibration: sidebar/badge selectors, the `css` hiding block, and `ALLOWED_HOSTS` (workspace `{team}.slack.com` + SSO hosts) all need a real logged-in session.
- Wiring `will-navigate` enforcement (tracked in CLAUDE.md).
- Multi-workspace handling beyond Slack's built-in switcher.
