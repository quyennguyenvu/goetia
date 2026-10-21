# Off-chat links stay live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Messenger's and Instagram's off-chat links (View profile, the info panel's Profile, the thread-header avatar, shared posts) open in the OS browser instead of being dead clicks.

**Architecture:** The 2026-09-04 interceptor (`src/preload/lib/off-chat-link.ts`, wired in `src/preload/service.ts`) already diverts off-chat anchors to the OS browser, but it finds the anchor through `e.target.closest('a[href]')`, and the two recipes' `pointer-events: none` rule makes the click land on the anchor's parent. Removing that rule is the whole fix; a `recipes.test.ts` case keeps any recipe from reintroducing it. The interceptor, main's `service:openExternal` handler and every other recipe stay as they are.

**Tech Stack:** TypeScript, Electron preload recipes (CSS strings), vitest + happy-dom, biome.

**Spec:** `docs/superpowers/specs/2026-10-21-off-chat-links-live-design.md`

## Global Constraints

- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green.
- Run heavy toolchain commands one at a time from the main thread, never in parallel subagents.
- No `git commit` from the plan: at each commit step, stop and ask the user to run `/grimoire-core:commit`.
- Comments explain why, concisely, matching the recipe files' density.
- Any edited Markdown passes `npx markdownlint-cli2 <file>`; never hard-wrap prose (MD013 is off in this repo).
- Buttons that route off chat (Teams' app bar) are unchanged — user decision 2026-10-21.

---

### Task 1: Remove the inert rule and pin its absence

**Files:**

- Test: `tests/unit/recipes.test.ts` (new `describe` after the `chatPaths mirror` block, ~line 180)
- Modify: `src/preload/recipes/messenger.ts:29-41`
- Modify: `src/preload/recipes/instagram.ts:101-116`
- Modify: `CLAUDE.md:11` (product-principle bullet)
- Modify: `docs/superpowers/specs/2026-10-21-off-chat-links-live-design.md:3` (status line)

**Interfaces:**

- Consumes: `recipes` from `src/preload/recipes` (a `Record<ServiceId, Recipe>`; `Recipe.css?: string`).
- Produces: nothing new for other code.

- [ ] **Step 1: Write the failing test**

In `tests/unit/recipes.test.ts`, insert directly after the closing `});` of `describe('chatPaths mirror', …)`:

```ts
describe('recipe css', () => {
  // an inert link leaves the preload's off-chat interceptor no anchor to find,
  // so the click goes nowhere (Messenger's View profile, 2026-10-21)
  it('never sets pointer-events: none', () => {
    for (const [id, recipe] of Object.entries(recipes)) {
      expect(recipe.css ?? '', id).not.toMatch(/pointer-events\s*:\s*none/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/recipes.test.ts -t "recipe css"`
Expected: FAIL, message naming `instagram` or `messenger`: `expected '…' not to match /pointer-events\s*:\s*none/`.

- [ ] **Step 3: Remove Messenger's inert rule**

In `src/preload/recipes/messenger.ts`, replace this comment block:

```ts
  // Off-chat in-page links (thread-header avatar/name → profile, shared
  // posts, marketplace panels) get pointer-events:none instead of a jarring
  // navigate-then-snapback; gated on the chat surface so login pages keep
  // every link live. chatPaths stays the containment for anything that
  // still routes (e.g. absolute-URL or role=button navigations).
```

with:

```ts
  // Off-chat links (thread-header avatar → profile, View profile, shared
  // posts) stay live: the preload sends them to the OS browser, which an
  // inert link would leave nothing to send. chatPaths contains anything that
  // routes without a link.
```

and replace the `css` template:

```ts
  css: `
    [role="banner"] { display: none !important; }
    * { --header-height: 0px !important; }
    html:has(a[href*='/t/']), body:has(a[href*='/t/']) { overflow: hidden !important; }
    body:has(a[href*='/t/'])
      a[href^='/']:not([href^='/messages']):not([href^='/messenger_media']) {
      pointer-events: none !important;
    }
  `,
```

with:

```ts
  css: `
    [role="banner"] { display: none !important; }
    * { --header-height: 0px !important; }
    html:has(a[href*='/t/']), body:has(a[href*='/t/']) { overflow: hidden !important; }
  `,
```

- [ ] **Step 4: Remove Instagram's inert rule**

In `src/preload/recipes/instagram.ts`, replace this comment block:

```ts
  // chat only: off-chat in-page links (thread-header avatar/username →
  // profile, @mentions, shared posts) get pointer-events:none instead of
  // a jarring navigate-then-snapback; chatPaths stays the containment for
  // anything that still routes. Gated on the DM surface (the nav's own
  // /direct/ link counts, so an empty inbox is covered) so login and
  // challenge pages keep every link live. The nav rail itself is hidden
  // by hideChrome below — it has no stable selector.
```

with:

```ts
  // chat only: off-chat links (thread-header avatar/username → profile,
  // @mentions, shared posts) stay live — the preload sends them to the OS
  // browser — and chatPaths contains anything that routes without a link.
  // The rules below are gated on the DM surface (the nav's own /direct/
  // link counts, so an empty inbox is covered) so login and challenge pages
  // are untouched. The nav rail itself is hidden by hideChrome below — it
  // has no stable selector.
```

Leave the following `.x132t2bv` comment lines as they are. In the `css` template, delete exactly these three lines (the first rule):

```css
    body:has(a[href^='/direct/']) a[href^='/']:not([href^='/direct']) {
      pointer-events: none !important;
    }
```

The overflow rule and the `.x132t2bv` padding rule stay.

- [ ] **Step 5: Run the recipe tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/recipes.test.ts`
Expected: PASS, every case in the file (the unread counts are untouched by CSS — `count()` never reads `css`).

- [ ] **Step 6: Update CLAUDE.md**

In `CLAUDE.md` line 11 (the "Recipes hide the host site's chrome" bullet), replace exactly:

```text
Off-chat in-page links (profile/avatar CTAs, shared posts) may additionally be inerted with `pointer-events: none` (messenger, instagram), and chrome with no stable selector
```

with:

```text
Off-chat in-page links (profile/avatar CTAs, shared posts) are **never** inerted (2026-10-21, user decision; spec `docs/superpowers/specs/2026-10-21-off-chat-links-live-design.md`): the preload diverts them to the OS browser (below), and `pointer-events: none` leaves that click no anchor to divert — Messenger's View profile and the info panel's Profile were dead clicks until then, and `recipes.test.ts` refuses the property. Chrome with no stable selector
```

The rest of the sentence (`(hash-classed rails, role=button icons) is hidden per-tick via the recipe's hideChrome hook …`) stays.

- [ ] **Step 7: Mark the spec approved**

In `docs/superpowers/specs/2026-10-21-off-chat-links-live-design.md`, replace `Status: draft (brainstorming complete, awaiting spec review).` with `Status: approved 2026-10-21 (user decision).`

- [ ] **Step 8: Lint the edited Markdown**

Run: `npx markdownlint-cli2 CLAUDE.md docs/superpowers/specs/2026-10-21-off-chat-links-live-design.md docs/superpowers/plans/2026-10-21-off-chat-links-live.md`
Expected: `Summary: 0 issues in 0 files`.

- [ ] **Step 9: Commit checkpoint**

Stop and ask the user to run `/grimoire-core:commit` for: `tests/unit/recipes.test.ts`, `src/preload/recipes/messenger.ts`, `src/preload/recipes/instagram.ts`, `CLAUDE.md`, the spec and this plan. Suggested message: `fix(recipes): let off-chat links reach the browser instead of inerting them`.

---

### Task 2: Verify

**Files:** none changed.

- [ ] **Step 1: Lint**

Run: `corepack pnpm lint`
Expected: exits 0, no diagnostics.

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm typecheck`
Expected: exits 0.

- [ ] **Step 3: Full unit suite**

Run: `corepack pnpm test`
Expected: every test passes.

- [ ] **Step 4: Live check (user, signed-in packaged build)**

The dev Electron cannot read the packaged app's encrypted cookies, so this needs `corepack pnpm package:mac` (run alone), the app installed from the DMG, and the user's own signed-in sessions. Ask the user to check, and report what they see:

1. Messenger: "View profile" from a conversation's menu, "Profile" in the thread's info panel, the thread-header avatar, and a shared post each open the OS browser once; the view stays on its thread.
2. Messenger: a `/messages/t/…` link and a photo (`/messenger_media`) still open in place.
3. Messenger: whether the conversation menu stays open after "View profile" (the spec's known side effect — acceptable if the next click or Escape closes it).
4. Instagram: a profile link and a shared post open the OS browser; `/direct/requests/` still opens in place.
