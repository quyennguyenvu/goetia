# Logged-out Login Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When TikTok's `/messages` renders its logged-out shell (nav rail, empty DM drawer, no sign-in form), the service view lands on `https://www.tiktok.com/login?redirect_url=…/messages` instead, so the user sees the login form.

**Architecture:** A new optional `Recipe.loginUrl(doc)` hook (declared only by TikTok) tells the recipe runner the document is a logged-out shell; the runner navigates through the same page-initiated `location.assign` callback it already uses for `chatPaths` snap-back, once per document and never inside the snap-back floor. No IPC, no main-process change, no persisted state. Spec: `docs/superpowers/specs/2026-08-30-logged-out-login-landing-design.md`.

**Tech Stack:** TypeScript, Electron preload (`src/preload/**`), Vitest with `happy-dom` for fixture tests and a fake-interval harness for runner tests.

## Global Constraints

- **Commits are made only through `/commit`, after the user confirms the drafted message.** Every "Commit" step below means: stop, report the files changed, and ask the user to run `/commit`. Never run `git commit` yourself. Never add a Claude co-author trailer.
- Definition of done (CLAUDE.md): `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green; `corepack pnpm e2e` green because `src/preload/service.ts` (preload wiring) changes. e2e must run with `ELECTRON_RUN_AS_NODE` unset: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`.
- `src/shared/**` stays process-agnostic; nothing here touches it.
- No new IPC channel. The navigation is page-initiated (`window.location.assign`), so `will-navigate` containment still sees it; `www.tiktok.com` is an allowed host.
- Recipe hooks run every ~2 s forever: `loginUrl` must be synchronous and cost at most two `querySelector` calls.
- Markdown edits must pass `npx --yes markdownlint-cli2 <file>` (repo config has MD013 off; never hard-wrap prose).
- The login URL, verbatim: `https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Fmessages`.
- Comments explain *why*, briefly; match the surrounding density.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/preload/recipes/types.ts` | `Recipe` contract — add the `loginUrl?` hook with its doc comment (Task 1). |
| `src/preload/recipes/tiktok.ts` | The only declarer: `LOGGED_OUT` marker, `LOGIN_URL`, `loginUrl(doc)` (Task 1). |
| `tests/unit/tiktok-login.test.ts` | Fixture oracle for `loginUrl`: logged-out shell → URL; signed in → null; blank → null (Task 1). |
| `src/preload/recipes/runner.ts` | Tick loop: call `loginUrl` after the `chatPaths` block, navigate once per document via the widened `navigate` callback (Task 2). |
| `tests/unit/runner-login.test.ts` | Fake-interval harness proving once-per-document, null → no-op, throw → counting continues, no hook → no-op (Task 2). |
| `src/preload/service.ts` | Wire the widened callback: `(url) => window.location.assign(url ?? serviceById(serviceId).url)` (Task 3). |
| `CLAUDE.md`, `docs/FEATURES.md` | Record the rule and the TikTok behaviour (Task 3). |

---

### Task 1: `Recipe.loginUrl` contract and TikTok's implementation

**Files:**

- Modify: `src/preload/recipes/types.ts` (append a hook after `openConversation`)
- Modify: `src/preload/recipes/tiktok.ts` (constants near line 20; hook after `ready`)
- Create: `tests/unit/tiktok-login.test.ts`

**Interfaces:**

- Produces: `Recipe.loginUrl?(doc: Document): string | null` — Task 2's runner calls exactly this.
- Consumes: existing `LOGGED_IN = '[data-e2e="top-dm-icon"]'` in `tiktok.ts`; fixtures `tests/fixtures/tiktok.html` (signed in), `tests/fixtures/tiktok-logged-out.html` (logged-out shell with `data-e2e="top-login-button"`), `tests/fixtures/blank.html`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/tiktok-login.test.ts`:

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

const LOGIN_URL = 'https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Fmessages';

// logged out, /messages is the feed nav plus an empty DM drawer — no sign-in
// form anywhere (captured 2026-08-29) — so the shell is sent to /login
describe('tiktok.loginUrl', () => {
  it('sends the logged-out shell to the login page, returning to messages after', () => {
    expect(tiktok.loginUrl?.(load('tiktok-logged-out'))).toBe(LOGIN_URL);
  });

  it('is null under a session', () => {
    expect(tiktok.loginUrl?.(load('tiktok'))).toBeNull();
  });

  it('is null on a page that is neither (blank, captcha, the login page itself)', () => {
    expect(tiktok.loginUrl?.(load('blank'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/tiktok-login.test.ts`

Expected: 3 failed — `expected undefined to be 'https://www.tiktok.com/login?…'` and `expected undefined to be null` (the hook does not exist yet; `toBeNull` on `undefined` fails).

- [ ] **Step 3: Add the hook to the `Recipe` contract**

In `src/preload/recipes/types.ts`, after the `openConversation?` member (the last one in the interface), add:

```ts
  /** The page to load when this document is the site's logged-OUT shell — a
   *  surface with no sign-in form in sight (TikTok's /messages logged out is
   *  the feed nav plus an empty DM drawer). Return the login URL only for that
   *  shell; null while signed in, on the login page itself, and on captcha or
   *  checkpoint pages, or the runner would fight the site's own flow. Sites
   *  whose logged-out page already is a form (Slack) declare nothing — every
   *  service otherwise starts on `url` (2026-08-13 decision). The runner
   *  navigates once per document; the site's own redirect brings the user back. */
  loginUrl?(doc: Document): string | null;
```

- [ ] **Step 4: Implement TikTok's hook**

In `src/preload/recipes/tiktok.ts`, directly after the `LOGGED_IN` constant (`const LOGGED_IN = '[data-e2e="top-dm-icon"]';`), add:

```ts
/** The logged-out header carries a Log in button where the signed-in one
 *  carries top-dm-icon; both absent means a page that is neither (/login
 *  itself, captcha) and must be left alone. */
const LOGGED_OUT = '[data-e2e="top-login-button"]';
/** TikTok's own login entry; redirect_url is the parameter its Log in button
 *  builds, and brings the session back to the DM surface. */
const LOGIN_URL = 'https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Fmessages';
```

Then in the `tiktok` recipe object, directly after the `ready(doc) { … },` member, add:

```ts
  // logged out, /messages shows no sign-in form — land on the login page
  loginUrl(doc) {
    if (doc.querySelector(LOGGED_IN) || !doc.querySelector(LOGGED_OUT)) return null;
    return LOGIN_URL;
  },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/tiktok-login.test.ts tests/unit/tiktok-chrome.test.ts tests/unit/tiktok-unread.test.ts tests/unit/recipes.test.ts`

Expected: all passed (3 new + the existing TikTok and recipe suites unchanged).

- [ ] **Step 6: Commit**

Stop and ask the user to run `/commit`. Suggested message: `feat(tiktok): declare the login page for the logged-out shell`. Files: `src/preload/recipes/types.ts`, `src/preload/recipes/tiktok.ts`, `tests/unit/tiktok-login.test.ts`.

---

### Task 2: Runner navigates a logged-out shell once per document

**Files:**

- Modify: `src/preload/recipes/runner.ts` (the `startRecipe` signature at lines 23-34 and the tick body right after the `chatPaths` block, around lines 81-96)
- Create: `tests/unit/runner-login.test.ts`

**Interfaces:**

- Consumes: `Recipe.loginUrl?(doc: Document): string | null` (Task 1).
- Produces: `startRecipe`'s 7th parameter becomes `navigate?: (url?: string) => void` — called with **no argument** for a `chatPaths` snap-back (the service URL) and with **the login URL** for a logged-out shell. Task 3 wires it. Existing callers that pass a `() => void` still type-check (a zero-arg function is assignable).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/runner-login.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

const LOGIN_URL = 'https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Fmessages';

// the runner reads only location and title from the document here
function fakeDoc(): Document {
  return { location: { pathname: '/messages', hash: '' }, title: '' } as unknown as Document;
}

function harness(recipe: Recipe) {
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  const report = vi.fn();
  const navigate = vi.fn();
  startRecipe(
    recipe,
    fakeDoc(),
    report,
    vi.fn(),
    undefined,
    undefined,
    navigate,
    fakeSetInterval,
    () => 100_000,
  );
  if (!tick) throw new Error('interval not started');
  return { tick: tick as () => Promise<void>, report, navigate };
}

const base: Recipe = {
  id: 'tiktok',
  intervalMs: 1000,
  count: () => ({ direct: 0, indirect: 0 }),
};

describe('runner login landing', () => {
  it('navigates to the login URL once, however many ticks the shell stays up', async () => {
    const h = harness({ ...base, loginUrl: () => LOGIN_URL });
    await h.tick();
    await h.tick();
    await h.tick();
    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith(LOGIN_URL);
  });

  it('stays put while the hook returns null (signed in, login page, captcha)', async () => {
    const h = harness({ ...base, loginUrl: () => null });
    await h.tick();
    await h.tick();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('keeps counting when the hook throws', async () => {
    const h = harness({
      ...base,
      loginUrl: () => {
        throw new Error('selector rot');
      },
    });
    await h.tick();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.report).toHaveBeenCalledWith({ direct: 0, indirect: 0 });
  });

  it('does nothing for a recipe without the hook', async () => {
    const h = harness(base);
    await h.tick();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/runner-login.test.ts`

Expected: 1 failed — `navigates to the login URL once…` with `expected "spy" to be called 1 times, but got 0 times`. The other three pass already (nothing calls `navigate` yet); that is fine — they pin the behaviour the implementation must not break.

- [ ] **Step 3: Widen the callback and call the hook**

In `src/preload/recipes/runner.ts`, change the `startRecipe` parameter

```ts
  snapBack?: () => void,
```

to

```ts
  navigate?: (url?: string) => void,
```

Change the state declaration `let lastSnapBack = Number.NEGATIVE_INFINITY;` to add, on the next line:

```ts
  let sentToLogin = false;
```

Replace the `chatPaths` block

```ts
    if (snapBack && recipe.chatPaths) {
      // hash included: teams routes every surface off one pathname (/v2/#/chat
      // vs /v2/#/calendar). Pathname-only prefixes are unaffected — an empty
      // hash appends nothing.
      const path = (doc.location?.pathname ?? '') + (doc.location?.hash ?? '');
      if (recipe.chatPaths.some((p) => path.startsWith(p))) {
        wasInChat = true;
      } else if (wasInChat && nowFn() - lastSnapBack >= SNAPBACK_MIN_INTERVAL_MS) {
        lastSnapBack = nowFn();
        wasInChat = false;
        snapBack();
      }
    }
```

with

```ts
    if (navigate && recipe.chatPaths) {
      // hash included: teams routes every surface off one pathname (/v2/#/chat
      // vs /v2/#/calendar). Pathname-only prefixes are unaffected — an empty
      // hash appends nothing.
      const path = (doc.location?.pathname ?? '') + (doc.location?.hash ?? '');
      if (recipe.chatPaths.some((p) => path.startsWith(p))) {
        wasInChat = true;
      } else if (wasInChat && nowFn() - lastSnapBack >= SNAPBACK_MIN_INTERVAL_MS) {
        lastSnapBack = nowFn();
        wasInChat = false;
        navigate();
      }
    }
    // logged-out shell with no sign-in form: land on the login page instead.
    // Once per document — the navigation replaces this document anyway — and
    // never inside the snap-back floor, so a /login → logged-out bounce
    // (captcha, expired cookie) can loop no faster than containment does.
    if (
      navigate &&
      recipe.loginUrl &&
      !sentToLogin &&
      nowFn() - lastSnapBack >= SNAPBACK_MIN_INTERVAL_MS
    ) {
      let target: string | null = null;
      try {
        target = recipe.loginUrl(doc);
      } catch {
        target = null; // a throwing hook must never stop the counting below
      }
      if (target) {
        sentToLogin = true;
        lastSnapBack = nowFn();
        navigate(target);
      }
    }
```

Also update the `chatPaths` doc comment in `src/preload/recipes/types.ts` — no change needed; `snapBack` is not named there. Search `runner.ts` for any remaining `snapBack` identifier: there must be none.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/runner-login.test.ts tests/unit/runner-containment.test.ts tests/unit/runner-keepalive.test.ts tests/unit/runner-synth.test.ts tests/unit/runner-watch.test.ts tests/unit/runner-stale.test.ts`

Expected: all passed. `runner-containment.test.ts` still names its mock `snapBack` and asserts call counts only, so the widened signature does not disturb it.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm typecheck`

Expected: clean. `src/preload/service.ts` still passes `() => window.location.assign(serviceById(serviceId).url)`, which is assignable to `(url?: string) => void` — it compiles, but ignores the URL; Task 3 fixes that.

- [ ] **Step 6: Commit**

Stop and ask the user to run `/commit`. Suggested message: `feat(runner): land a logged-out shell on the recipe's login page`. Files: `src/preload/recipes/runner.ts`, `tests/unit/runner-login.test.ts`.

---

### Task 3: Wire the preload, record the rule, run every gate

**Files:**

- Modify: `src/preload/service.ts:80-81` (the `startRecipe` call's 7th argument)
- Modify: `CLAUDE.md` (Product principle bullet on `chatPaths`; the paragraph beginning "Sites that are more than chat")
- Modify: `docs/FEATURES.md` (the `**TikTok**` line under "Per-service recipes")

**Interfaces:**

- Consumes: `startRecipe`'s `navigate?: (url?: string) => void` (Task 2).

- [ ] **Step 1: Wire the callback**

In `src/preload/service.ts`, replace

```ts
      // chat only: page-initiated navigation, no IPC surface needed
      () => window.location.assign(serviceById(serviceId).url),
```

with

```ts
      // chat only: page-initiated navigation, no IPC surface needed. No url =
      // snap back to the service URL; a url = the recipe's login page for a
      // logged-out shell (see Recipe.loginUrl).
      (url?: string) => window.location.assign(url ?? serviceById(serviceId).url),
```

- [ ] **Step 2: Record the rule in CLAUDE.md**

In `CLAUDE.md`, under "Product principle: chat ONLY", the bullet that begins `- Sites that are more than chat (facebook, tiktok) declare \`chatPaths\`` ends with `CSS hiding is cosmetic; \`chatPaths\` is the containment.` Append to that same bullet, after that sentence:

```markdown
 A logged-**out** shell with no sign-in form in sight may declare `loginUrl` (2026-08-30, user decision; spec `docs/superpowers/specs/2026-08-30-logged-out-login-landing-design.md`): the runner lands there once per document and the site's own `redirect_url` brings the session back to `url`. TikTok is the only declarer — its logged-out `/messages` is the feed nav plus an empty DM drawer. Sites whose logged-out page already is a form (Slack) declare nothing, and every service still starts on `url` — the 2026-08-13 `firstRunUrl` teardown stands; nothing about first-run state is persisted.
```

- [ ] **Step 3: Record the behaviour in FEATURES.md**

In `docs/FEATURES.md`, the `**TikTok**` line under "Per-service recipes" ends with `Calibrated live 2026-08-29 (\`tiktok.html\`, \`tiktok-logged-out.html\`).` Append to that line:

```markdown
 Logged out, `/messages` is sent to `/login?redirect_url=…/messages` via `Recipe.loginUrl` (runner, once per document). Verified: `tiktok-login.test.ts`, `runner-login.test.ts`.
```

- [ ] **Step 4: Lint the Markdown**

Run: `npx --yes markdownlint-cli2 CLAUDE.md docs/FEATURES.md docs/superpowers/plans/2026-08-30-logged-out-login-landing.md`

Expected: `Summary: 0 issues in 0 files`.

- [ ] **Step 5: Run every gate**

Run, in order:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: Biome `No fixes applied`; `tsc` silent; Vitest all files passed (82 files: the 80 existing plus `tiktok-login` and `runner-login`); Playwright `39 passed`.

- [ ] **Step 6: Live check (manual, the one claim fixtures cannot prove)**

Build and launch: `corepack pnpm package:mac`, open the DMG's app. Purge TikTok's login (Settings → Services → `Purge login…`) or use a fresh profile, summon TikTok, and confirm: (a) the view lands on `https://www.tiktok.com/login?redirect_url=…` with the form visible and TikTok's chrome intact; (b) after signing in, TikTok returns to `/messages`, the chrome hides, and no further navigation happens. If (b) lands on the feed instead, stop and record it — the spec names the follow-up (a signed-in, never-in-chat document snapping to `url`), which is a new decision, not a fix to make here.

- [ ] **Step 7: Commit**

Stop and ask the user to run `/commit`. Suggested message: `feat(preload): route logged-out shells to the recipe's login page`. Files: `src/preload/service.ts`, `CLAUDE.md`, `docs/FEATURES.md`, `docs/superpowers/plans/2026-08-30-logged-out-login-landing.md`, and the spec `docs/superpowers/specs/2026-08-30-logged-out-login-landing-design.md` if it is still uncommitted.
