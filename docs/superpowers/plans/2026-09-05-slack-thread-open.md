# Slack Thread Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Slack pin captured inside a thread, and a recents row for a thread reply, open that thread in the flexpane instead of landing on its channel.

**Architecture:** Slack never puts the thread in the address bar, so the recipe mints a canonical thread URL (`https://app.slack.com/client/<T>/<C>/thread/<C>-<ts>`) from the flexpane's root message at pin time, and opens one in-page at open time by clicking the channel row and the root message's View thread control. Two optional recipe hooks (`conversationUrl`, `openUrl`) carry this; `openConversationInPage` gains a `url` lane between `same` and `anchor`; main's learn rule for recents accepts a validated recipe URL so the row survives a reload. Spec: `docs/superpowers/specs/2026-09-05-slack-thread-open-design.md`.

**Tech Stack:** Electron main (TypeScript), unisolated service preload, vitest with happy-dom for recipe tests, Biome lint.

## Global Constraints

- Canonical thread URL form, verbatim: `https://app.slack.com/client/<T>/<C>/thread/<C>-<ts>` where `<T>` is the team id from the document path, `<C>` the root's `data-msg-channel-id`, `<ts>` its `data-msg-ts`. Workspace-host `archives` permalinks are never minted or accepted.
- Flexpane rule: a non-empty selection whose anchor node is outside `[data-qa="threads_flexpane"]` makes `conversationUrl` return null.
- Lane order after this change: replay → name → same → **url** → anchor → load. The `url` lane runs only when the request carries a validated `url`.
- Every wait in the Slack opener is bounded (`SLACK_SETTLE_MS`, `SLACK_MAX_WAITS`); `count()` and `conversationUrl` stay synchronous.
- Main never learns per-service DOM; it receives URLs and validates them at open time.
- `src/shared/**` stays process-agnostic.
- Pin storage (`pins.json`), `pin-rules.ts`, `ServiceMeta` and the origin rule in `resolveBannerClick` do not change.
- **Commits:** this repo forbids agents committing. Where a step says "Commit", stop and ask the user to run `/grimoire-core:commit`; never run `git commit` yourself.
- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green; `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` green after Task 4 (main and preload wiring changed).

---

### Task 1: Recipe hook types, the Slack thread fixture, and `slackThreadUrl`

**Files:**

- Modify: `src/preload/recipes/types.ts` (after `openConversation`, before `loginUrl`)
- Modify: `src/preload/recipes/slack.ts`
- Create: `tests/fixtures/slack-thread.html`
- Test: `tests/unit/recipes.test.ts`

**Interfaces:**

- Produces: `Recipe.conversationUrl?(doc: Document): string | null` and `Recipe.openUrl?(doc: Document, url: string): boolean | Promise<boolean>` on the `Recipe` interface.
- Produces: `export function parseSlackThreadUrl(url: string): { team: string; channel: string; ts: string } | null` and `export function slackThreadUrl(doc: Document, anchor?: Node | null): string | null` in `src/preload/recipes/slack.ts`. Task 2 consumes both.

- [x] **Step 1: Add the two hooks to the `Recipe` interface**

In `src/preload/recipes/types.ts`, insert after the `openConversation` declaration (before the `loginUrl` doc comment):

```ts
  /** The open thread as its canonical in-service URL, for sites whose address
   *  bar never names the thread (Slack keeps a thread in the flexpane while
   *  the URL stays on the channel). A pin captured here carries this instead
   *  of the document URL; a landed replay teaches a recents row this instead
   *  of location.href. Cheap and synchronous; null when no thread is open, and
   *  null when the live selection sits outside the thread surface — that
   *  selection belongs to the channel, not the thread. Declared together with
   *  `openUrl` (recipes.test.ts enforces the pair). */
  conversationUrl?(doc: Document): string | null;
  /** Open a `conversationUrl`-shaped URL in-page. `true`: the thread is on
   *  screen. `false`: a miss (unknown URL shape, the channel row is gone, the
   *  root message is outside the virtualized pane) and the caller moves to the
   *  next lane. May be async; keep every wait bounded. */
  openUrl?(doc: Document, url: string): boolean | Promise<boolean>;
```

- [x] **Step 2: Create the fixture**

Create `tests/fixtures/slack-thread.html`, trimmed from the 2026-09-05 live snapshot: two sidebar rows, the channel pane with the root message (with its reply bar) and one other message, and the flexpane showing the root. Only structure and hooks survive.

```html
<title>career-talk - We Build VN - Slack</title>
<div class="p-channel_sidebar" data-qa="workspace_sidebar">
  <div class="p-channel_sidebar__channel" data-qa="channel-sidebar-channel"
    data-qa-channel-sidebar-channel-id="C0P5CRESE" data-qa-channel-sidebar-channel-is-selected="false"
    data-qa-channel-sidebar-channel-type="channel"><span data-qa="channel_sidebar_name_general">general</span></div>
  <div class="p-channel_sidebar__channel p-channel_sidebar__channel--selected" data-qa="channel-sidebar-channel"
    data-qa-channel-sidebar-channel-id="C1755B8LV" data-qa-channel-sidebar-channel-is-selected="true"
    data-qa-channel-sidebar-channel-type="channel"><span data-qa="channel_sidebar_name_career-talk">career-talk</span></div>
</div>
<div class="p-workspace__primary_view_body">
  <div class="p-message_pane">
    <div data-qa="virtual-list-item" data-item-key="1788402068.626589">
      <div role="presentation" class="c-message_kit__background p-message_pane_message__message c-message_kit__message"
        data-qa="message_container" data-msg-ts="1788402068.626589" data-msg-channel-id="C1755B8LV">
        <div class="c-message_kit__blocks">first message, no replies</div>
      </div>
    </div>
    <div data-qa="virtual-list-item" data-item-key="1788402687.118899">
      <div role="presentation" class="c-message_kit__background p-message_pane_message__message c-message_kit__message"
        data-qa="message_container" data-msg-ts="1788402687.118899" data-msg-channel-id="C1755B8LV">
        <div class="c-message_kit__blocks">root message with replies</div>
        <div class="c-message__reply_bar c-message_kit__thread_replies">
          <span class="c-message__reply_bar_last_reply" data-qa="reply_bar_last_reply" data-ts="1788607113.179169">Last reply today at 6:18 PM</span>
          <span class="c-message__reply_bar_view_thread" data-qa="reply_bar_view_thread">View thread</span>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="p-view_contents p-view_contents--secondary" aria-label="Thread in channel career-talk" role="dialog">
  <div data-qa="threads_flexpane" class="p-flexpane">
    <div class="p-flexpane_header">
      <div class="p-flexpane__title_container" data-qa="flexpane-title-container">Thread</div>
    </div>
    <div class="p-threads_flexpane__content">
      <div data-qa="virtual-list-item" data-item-key="1788402687.118899">
        <div role="presentation" class="c-message_kit__background c-message_kit__message c-message_kit__thread_message c-message_kit__thread_message--root"
          data-qa="message_container" data-msg-ts="1788402687.118899" data-msg-channel-id="C1755B8LV">
          <div class="c-message_kit__blocks">root message with replies</div>
        </div>
      </div>
      <div data-qa="virtual-list-item" data-item-key="1788403624.508949">
        <div role="presentation" class="c-message_kit__background c-message_kit__message c-message_kit__thread_message"
          data-qa="message_container" data-msg-ts="1788403624.508949" data-msg-channel-id="C1755B8LV">
          <div class="c-message_kit__blocks">a reply</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [x] **Step 3: Write the failing tests for `slackThreadUrl` and `parseSlackThreadUrl`**

Append to `tests/unit/recipes.test.ts`. Add to the imports at the top:

```ts
import { parseSlackThreadUrl, slackThreadUrl } from '../../src/preload/recipes/slack';
```

Add this helper beside `load()`:

```ts
function setURL(url: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
}
```

Append the suite:

```ts
describe('slack thread URL', () => {
  const THREAD = 'https://app.slack.com/client/T0GCQ370X/C1755B8LV/thread/C1755B8LV-1788402687.118899';

  it('mints the canonical thread URL from the flexpane root and the team in the path', () => {
    setURL('https://app.slack.com/client/T0GCQ370X/C1755B8LV');
    expect(slackThreadUrl(load('slack-thread'))).toBe(THREAD);
  });

  it('is null when no thread is open, and on blank and login-shaped pages', () => {
    setURL('https://app.slack.com/client/T0GCQ370X/C1755B8LV');
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    expect(slackThreadUrl(doc)).toBeNull();
    expect(slackThreadUrl(load('slack'))).toBeNull();
    expect(slackThreadUrl(load('blank'))).toBeNull();
  });

  it('is null when the document path carries no team segment', () => {
    setURL('https://app.slack.com/client');
    expect(slackThreadUrl(load('slack-thread'))).toBeNull();
  });

  // the flexpane rule: a selection in the channel pane pins the channel
  it('yields the thread for a selection inside the flexpane and null for one outside', () => {
    setURL('https://app.slack.com/client/T0GCQ370X/C1755B8LV');
    const doc = load('slack-thread');
    const inside = doc.querySelector('[data-qa="threads_flexpane"] .c-message_kit__blocks')?.firstChild;
    const outside = doc.querySelector('.p-message_pane .c-message_kit__blocks')?.firstChild;
    expect(slackThreadUrl(doc, inside)).toBe(THREAD);
    expect(slackThreadUrl(doc, outside)).toBeNull();
    expect(slackThreadUrl(doc, null)).toBe(THREAD);
  });

  it('parses only the canonical thread form', () => {
    expect(parseSlackThreadUrl(THREAD)).toEqual({
      team: 'T0GCQ370X',
      channel: 'C1755B8LV',
      ts: '1788402687.118899',
    });
    expect(parseSlackThreadUrl('https://app.slack.com/client/T0GCQ370X/C1755B8LV')).toBeNull();
    expect(
      parseSlackThreadUrl('https://we-build-vn.slack.com/archives/C1755B8LV/p1788402687118899'),
    ).toBeNull();
    expect(
      parseSlackThreadUrl(
        'https://app.slack.com/client/T0GCQ370X/C1755B8LV/thread/C0P5CRESE-1788402687.118899',
      ),
    ).toBeNull(); // the thread's channel must be the route's channel
    expect(parseSlackThreadUrl('not a url')).toBeNull();
  });
});
```

- [x] **Step 4: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/recipes.test.ts`
Expected: FAIL — `slackThreadUrl` and `parseSlackThreadUrl` are not exported from `slack.ts`.

- [x] **Step 5: Implement `parseSlackThreadUrl` and `slackThreadUrl`**

In `src/preload/recipes/slack.ts`, add above `const slack: Recipe = {`:

```ts
const FLEXPANE = '[data-qa="threads_flexpane"]';
const THREAD_ROOT = `${FLEXPANE} .c-message_kit__thread_message--root[data-msg-ts][data-msg-channel-id]`;
const THREAD_ROUTE = /^\/client\/([A-Z0-9]+)\/([A-Z0-9]+)\/thread\/([A-Z0-9]+)-(\d+\.\d+)\/?$/;

/** The canonical thread form and nothing else: `/client/<T>/<C>/thread/<C>-<ts>`
 *  on app.slack.com, the thread's channel equal to the route's. Workspace-host
 *  permalinks are not a pin form (spec, 2026-09-05). */
export function parseSlackThreadUrl(
  url: string,
): { team: string; channel: string; ts: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== 'https://app.slack.com') return null;
  const m = THREAD_ROUTE.exec(u.pathname);
  if (!m || m[2] !== m[3]) return null;
  return { team: m[1], channel: m[2], ts: m[4] };
}

/** The open thread as its canonical URL, read from the flexpane's root
 *  message; the team id comes from the document path (`/client/<T>/…`), which
 *  Slack does keep in the address bar. `anchor` is the live selection's anchor
 *  node (defaults to the document's selection): a selection outside the
 *  flexpane belongs to the channel pane, so the pin is the channel's. */
export function slackThreadUrl(
  doc: Document,
  anchor: Node | null | undefined = doc.getSelection?.()?.anchorNode,
): string | null {
  const root = doc.querySelector(THREAD_ROOT);
  if (!root) return null;
  const team = /^\/client\/([A-Z0-9]+)(?:\/|$)/.exec(doc.location?.pathname ?? '')?.[1];
  if (!team) return null;
  if (anchor && !doc.querySelector(FLEXPANE)?.contains(anchor)) return null;
  const channel = root.getAttribute('data-msg-channel-id') ?? '';
  const ts = root.getAttribute('data-msg-ts') ?? '';
  if (!/^[A-Z0-9]+$/.test(channel) || !/^\d+\.\d+$/.test(ts)) return null;
  return `https://app.slack.com/client/${team}/${channel}/thread/${channel}-${ts}`;
}
```

Note: happy-dom's `Document` exposes `getSelection` and `location`; the optional calls keep the helper safe on a document without them (the `blank.html` case under a bare `document.documentElement.innerHTML` replacement still has both).

- [x] **Step 6: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/recipes.test.ts`
Expected: PASS, including the five new tests. The `slack recipe` count rows are unaffected.

- [ ] **Step 7: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(slack): mint a canonical thread URL from the flexpane root`.

---

### Task 2: `openSlackThread` and the recipe wiring, with the hook-pair invariant

**Files:**

- Modify: `src/preload/recipes/slack.ts`
- Test: `tests/unit/recipes.test.ts`

**Interfaces:**

- Consumes: `parseSlackThreadUrl`, `slackThreadUrl` (Task 1).
- Produces: `export async function openSlackThread(doc: Document, url: string, opts?: { settle?: () => Promise<void>; maxWaits?: number }): Promise<boolean>`; `export const SLACK_SETTLE_MS`, `export const SLACK_MAX_WAITS`. The recipe object gains `conversationUrl: (doc) => slackThreadUrl(doc)` and `openUrl: openSlackThread`.

- [x] **Step 1: Write the failing tests**

Add to the imports in `tests/unit/recipes.test.ts`:

```ts
import { openSlackThread } from '../../src/preload/recipes/slack';
```

(Merge with the Task 1 import line: `import { openSlackThread, parseSlackThreadUrl, slackThreadUrl } from '../../src/preload/recipes/slack';`.)

Append:

```ts
describe('openSlackThread', () => {
  const THREAD = 'https://app.slack.com/client/T0GCQ370X/C1755B8LV/thread/C1755B8LV-1788402687.118899';
  const settle = () => Promise.resolve();

  function arm(doc: Document) {
    const row = vi.fn();
    const view = vi.fn();
    doc
      .querySelector('[data-qa-channel-sidebar-channel-id="C1755B8LV"]')
      ?.addEventListener('click', row);
    doc.querySelector('[data-qa="reply_bar_view_thread"]')?.addEventListener('click', view);
    return { row, view };
  }

  it('is done at once when the flexpane already shows the root', async () => {
    const doc = load('slack-thread');
    const { row, view } = arm(doc);
    expect(await openSlackThread(doc, THREAD, { settle })).toBe(true);
    expect(row).not.toHaveBeenCalled();
    expect(view).not.toHaveBeenCalled();
  });

  it('clicks View thread on the root when the channel is already selected', async () => {
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    const { row, view } = arm(doc);
    expect(await openSlackThread(doc, THREAD, { settle })).toBe(true);
    expect(row).not.toHaveBeenCalled();
    expect(view).toHaveBeenCalledTimes(1);
  });

  // the root message renders only after the pane switches channel
  it('clicks the channel row first and waits for the root to render', async () => {
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    const row = doc.querySelector('[data-qa-channel-sidebar-channel-id="C1755B8LV"]') as HTMLElement;
    row.setAttribute('data-qa-channel-sidebar-channel-is-selected', 'false');
    const pane = doc.querySelector('.p-message_pane') as HTMLElement;
    const messages = pane.innerHTML;
    pane.innerHTML = '';
    const rowClicks = vi.fn(() => {
      row.setAttribute('data-qa-channel-sidebar-channel-is-selected', 'true');
      pane.innerHTML = messages; // the pane fills in on the next tick
    });
    row.addEventListener('click', rowClicks);
    let settles = 0;
    const result = await openSlackThread(doc, THREAD, {
      settle: () => {
        settles++;
        return Promise.resolve();
      },
    });
    expect(result).toBe(true);
    expect(rowClicks).toHaveBeenCalledTimes(1);
    expect(settles).toBe(1);
  });

  it('misses on a non-thread URL, a missing row, and a root outside the pane', async () => {
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    expect(
      await openSlackThread(doc, 'https://app.slack.com/client/T0GCQ370X/C1755B8LV', { settle }),
    ).toBe(false);
    expect(
      await openSlackThread(
        doc,
        'https://app.slack.com/client/T0GCQ370X/C0NOPE000/thread/C0NOPE000-1.2',
        { settle, maxWaits: 2 },
      ),
    ).toBe(false);
    expect(
      await openSlackThread(
        doc,
        'https://app.slack.com/client/T0GCQ370X/C1755B8LV/thread/C1755B8LV-1700000000.000001',
        { settle, maxWaits: 2 },
      ),
    ).toBe(false);
  });

  it('misses when the root has no reply bar to click', async () => {
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    doc.querySelector('.p-message_pane .c-message__reply_bar')?.remove();
    expect(await openSlackThread(doc, THREAD, { settle, maxWaits: 2 })).toBe(false);
  });
});

describe('conversationUrl / openUrl hook pair', () => {
  it('a recipe declaring one declares the other', () => {
    for (const s of SERVICES) {
      const r = recipes[s.id];
      expect(r.conversationUrl !== undefined, s.id).toBe(r.openUrl !== undefined);
    }
    expect(recipes.slack.conversationUrl).toBeDefined();
  });
});
```

Add `vi` to the vitest import at the top of the file: `import { describe, expect, it, vi } from 'vitest';`.

- [x] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/recipes.test.ts`
Expected: FAIL — `openSlackThread` is not exported; the pair test fails because `recipes.slack.conversationUrl` is undefined.

- [x] **Step 3: Implement `openSlackThread` and wire the recipe**

In `src/preload/recipes/slack.ts`, add below `slackThreadUrl`:

```ts
/** A channel switch renders the pane over a few frames; each wait is one
 *  settle, and the cap keeps a root that lives outside the virtualized pane
 *  from stalling the lane chain. */
export const SLACK_SETTLE_MS = 250;
export const SLACK_MAX_WAITS = 8;

const rootInPane = (doc: Document, channel: string, ts: string) =>
  doc.querySelector(
    `.p-message_pane_message__message[data-qa="message_container"][data-msg-channel-id="${channel}"][data-msg-ts="${ts}"]`,
  );

const flexpaneShows = (doc: Document, channel: string, ts: string) =>
  doc.querySelector(
    `${FLEXPANE} .c-message_kit__thread_message--root[data-msg-channel-id="${channel}"][data-msg-ts="${ts}"]`,
  ) !== null;

/** Open a canonical thread URL in-page: nothing to do if the flexpane already
 *  shows the root; otherwise click the channel row (unless selected), wait
 *  bounded for the root message to render in the channel pane, and click its
 *  View thread control. False on any other URL shape, a missing row, a root
 *  outside the virtualized pane, or a root with no reply bar — the caller's
 *  next lane is a full load that lands in the channel, today's behaviour. */
export async function openSlackThread(
  doc: Document,
  url: string,
  opts: { settle?: () => Promise<void>; maxWaits?: number } = {},
): Promise<boolean> {
  const t = parseSlackThreadUrl(url);
  if (!t) return false;
  if (flexpaneShows(doc, t.channel, t.ts)) return true;
  const row = doc.querySelector(
    `.p-channel_sidebar__channel[data-qa-channel-sidebar-channel-id="${t.channel}"]`,
  ) as HTMLElement | null;
  if (!row) return false;
  const selected = row.getAttribute('data-qa-channel-sidebar-channel-is-selected') === 'true';
  if (!selected) row.click();
  const settle = opts.settle ?? (() => new Promise<void>((r) => setTimeout(r, SLACK_SETTLE_MS)));
  const maxWaits = opts.maxWaits ?? SLACK_MAX_WAITS;
  let root = rootInPane(doc, t.channel, t.ts);
  for (let i = 0; !root && i < maxWaits; i++) {
    await settle();
    root = rootInPane(doc, t.channel, t.ts);
  }
  const view = root?.querySelector('[data-qa="reply_bar_view_thread"]') as HTMLElement | null;
  if (!view) return false;
  view.click();
  return true;
}
```

Then on the recipe object, add the two hooks after `intervalMs: 2000,`:

```ts
  conversationUrl: (doc) => slackThreadUrl(doc),
  openUrl: openSlackThread,
```

Update the header comment's third sentence to record what is and is not calibrated:

```ts
// Selectors follow Slack's long-stable BEM classes and data-qa hooks. The
// unread selectors are UNCALIBRATED until a live login pass; the thread
// hooks (flexpane root, sidebar row, reply bar) come from a 2026-09-05 live
// snapshot, and the click mechanism awaits the same pass. Slack notifies
// in-page via HTML5 Notification, so no synthNotification.
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/recipes.test.ts`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(slack): open a canonical thread URL in-page via the channel row and View thread`.

---

### Task 3: The `url` lane in `openConversationInPage`, `OpenLane`, and the reply parser

**Files:**

- Modify: `src/shared/ipc.ts:76-93` (the `OpenRequest` doc comment and `OpenLane`)
- Modify: `src/preload/lib/conversation-open.ts`
- Modify: `src/main/lib/open-reply.ts:9-16` (the `LANES` set)
- Test: `tests/unit/conversation-open.test.ts`, `tests/unit/open-reply.test.ts`

**Interfaces:**

- Produces: `OpenLane` gains `'url'`; `OpenOptions.byUrl?: (doc: Document, url: string) => MaybePromise<boolean>`. Task 4 wires `byUrl` in the preload.

- [x] **Step 1: Write the failing tests**

Append to `tests/unit/conversation-open.test.ts` inside the `describe('openConversationInPage', …)` block:

```ts
  // Slack: the URL names the thread but the document never moves onto it, so
  // a recipe opens it by clicking — after the same-URL check, before anchors
  it('lets a recipe open a URL in-page after same and before anchor', async () => {
    setURL('https://app.slack.com/client/T1/C1');
    document.documentElement.innerHTML = '<body><a href="/client/T1/C1/thread/C1-1.2">x</a></body>';
    const clicked = vi.fn();
    document.querySelector('a')?.addEventListener('click', clicked);
    const byUrl = vi.fn(async () => true);
    const assign = vi.fn();
    const url = 'https://app.slack.com/client/T1/C1/thread/C1-1.2';
    const lane = await openConversationInPage(document, { href: url, url }, { byUrl, assign });
    expect(lane).toBe('url');
    expect(byUrl).toHaveBeenCalledWith(document, url);
    expect(clicked).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('skips the url lane without a url and when already on the URL', async () => {
    setURL('https://app.slack.com/client/T1/C1');
    document.documentElement.innerHTML = '<body></body>';
    const byUrl = vi.fn(() => true);
    expect(await openConversationInPage(document, {}, { byUrl })).toBe('miss');
    const here = 'https://app.slack.com/client/T1/C1';
    expect(
      await openConversationInPage(document, { href: here, url: here }, { byUrl, assign: vi.fn() }),
    ).toBe('same');
    expect(byUrl).not.toHaveBeenCalled();
  });

  it('falls through to anchor and load when the url lane misses or throws', async () => {
    setURL('https://app.slack.com/client/T1/C1');
    document.documentElement.innerHTML = '<body><a href="/client/T1/C2">c2</a></body>';
    const clicked = vi.fn((e: Event) => e.preventDefault());
    document.querySelector('a')?.addEventListener('click', clicked);
    const assign = vi.fn();
    const c2 = 'https://app.slack.com/client/T1/C2';
    expect(
      await openConversationInPage(document, { href: c2, url: c2 }, { byUrl: () => false, assign }),
    ).toBe('anchor');
    expect(clicked).toHaveBeenCalledTimes(1);
    const c3 = 'https://app.slack.com/client/T1/C3';
    expect(
      await openConversationInPage(
        document,
        { href: c3, url: c3 },
        {
          byUrl: () => {
            throw new Error('DOM changed');
          },
          assign,
        },
      ),
    ).toBe('load');
    expect(assign).toHaveBeenCalledWith(c3);
  });
```

In `tests/unit/open-reply.test.ts`, change the first test's body to also accept the new lane:

```ts
  it('accepts a known lane and a string url', () => {
    expect(parseOpenReply({ lane: 'replay', url: 'https://discord.com/channels/1/2' })).toEqual({
      lane: 'replay',
      url: 'https://discord.com/channels/1/2',
    });
    expect(parseOpenReply({ lane: 'url', url: 'https://app.slack.com/client/T1/C1' })).toEqual({
      lane: 'url',
      url: 'https://app.slack.com/client/T1/C1',
    });
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/conversation-open.test.ts tests/unit/open-reply.test.ts`
Expected: FAIL — the first new test gets `'anchor'` (no `byUrl` option exists, so the anchor matches), the fall-through test fails on the throwing opener (a thrown error rejects instead of moving on), and `parseOpenReply({ lane: 'url', … })` returns null. Typecheck also fails on `byUrl`.

- [x] **Step 3: Implement the lane**

In `src/shared/ipc.ts`, update the `OpenRequest` doc comment's last sentence and the `OpenLane` type:

```ts
/** Everything main knows about how to reach a conversation on a live view, in
 *  one lane, tried in the preload in the order replay → name → same → url →
 *  anchor → load (see openConversationInPage). */
```

```ts
/** Which lane landed. `same`: already on the thread. `url`: the recipe opened
 *  the URL in-page (Slack's thread, which the document URL never shows).
 *  `miss`: every lane the request carried reported a miss and the page was
 *  left where it was. */
export type OpenLane = 'replay' | 'name' | 'same' | 'url' | 'anchor' | 'load' | 'miss';
```

In `src/main/lib/open-reply.ts`, add `'url',` to the `LANES` set after `'same',`.

In `src/preload/lib/conversation-open.ts`, add to `OpenOptions` after `byName`:

```ts
  /** the recipe's URL opener, for a site whose document URL never names the
   *  thread (Slack): true when the thread is on screen, false for a miss */
  byUrl?: (doc: Document, url: string) => MaybePromise<boolean>;
```

Update the function's doc comment list to insert the lane and renumber:

```ts
 *  3. same: already on the URL, nothing to do.
 *  4. url: the recipe opens the URL in-page — Slack's thread lives in a
 *     flexpane the address bar never shows, so only a recipe click reaches
 *     it; a throw is a miss, not a failure of the chain.
 *  5. anchor: click the anchor that leads there — the newest-unread row a
 *     recipe extracted, or the sidebar link to a pinned thread — comparing
 *     origin + path + hash, trailing slash and query ignored, so "/t/1/"
 *     meets "/t/1?x".
 *  6. load: a full navigation, only when a URL exists. With none (a recents
 *     row on whatsapp/zalo) a miss stays put: reloading the chat list would
 *     be a strictly worse answer than doing nothing. */
```

Insert the lane after the `same` check (`if (target !== null && target === urlKey(here, here)) return 'same';`):

```ts
  if (opts.byUrl) {
    let opened = false;
    try {
      opened = await opts.byUrl(doc, req.url);
    } catch {
      opened = false; // a recipe opener that throws on a changed DOM is a miss
    }
    if (opened) return 'url';
  }
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/conversation-open.test.ts tests/unit/open-reply.test.ts && corepack pnpm typecheck`
Expected: PASS for both files; typecheck green (nothing else names the lanes exhaustively — verify with `corepack pnpm typecheck`; if a `switch` on `OpenLane` somewhere is exhaustive, add the `'url'` case there and note it).

- [ ] **Step 5: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(open): add a url lane so a recipe can open a thread the address bar never shows`.

---

### Task 4: Preload and main wiring — capture, `byUrl`, the reply URL, and the learn rule

**Files:**

- Modify: `src/preload/service.ts:53-69` (the `notification:openConversation` handler) and `:98-108` (the `__goetia` object)
- Modify: `src/main/lib/notification-click.ts:56-61` (export the validator under a distinct name)
- Modify: `src/main/lib/open-reply.ts` (add `learnedUrl`)
- Modify: `src/main/views.ts:647-671` (`capturePin`) and `:959-982` (`openInPage`)
- Test: `tests/unit/open-reply.test.ts`

**Interfaces:**

- Consumes: `OpenLane 'url'`, `OpenOptions.byUrl` (Task 3); `Recipe.conversationUrl`, `Recipe.openUrl` (Task 1).
- Produces: `export function validatedConversationUrl(href: string, serviceUrl: string, chatPaths: string[] | undefined): string | null` in `notification-click.ts`; `export function learnedUrl(input: { before: string; after: string; reported: string; serviceUrl: string; chatPaths?: string[] }): string | null` in `open-reply.ts`; `window.__goetia.conversationUrl(): string | null` in the service preload.

- [x] **Step 1: Write the failing test for the learn rule**

Append to `tests/unit/open-reply.test.ts`:

```ts
import { learnedUrl } from '../../src/main/lib/open-reply';

// what a landed replay teaches the recents row: where the document went, or
// a recipe-minted URL the page reports for a thread the address bar never
// shows (Slack) — validated like any href, since the report is page-controlled
describe('learnedUrl', () => {
  const slack = { serviceUrl: 'https://app.slack.com/client' };
  const fb = { serviceUrl: 'https://www.facebook.com/messages/', chatPaths: ['/messages'] };

  it('learns the URL the document moved to', () => {
    const after = 'https://discord.com/channels/1/2';
    expect(
      learnedUrl({
        before: 'https://discord.com/channels/@me',
        after,
        reported: after,
        serviceUrl: 'https://discord.com/channels/@me',
      }),
    ).toBe(after);
  });

  it('learns a validated recipe URL although the document stayed put', () => {
    const here = 'https://app.slack.com/client/T1/C1';
    const thread = 'https://app.slack.com/client/T1/C1/thread/C1-1.2';
    expect(learnedUrl({ before: here, after: here, reported: thread, ...slack })).toBe(thread);
  });

  it('learns nothing when the report is where the document already was', () => {
    const here = 'https://app.slack.com/client/T1/C1';
    expect(learnedUrl({ before: here, after: here, reported: here, ...slack })).toBeNull();
  });

  it('refuses a cross-origin or off-chat report', () => {
    const here = 'https://www.facebook.com/messages/t/1';
    expect(
      learnedUrl({ before: here, after: here, reported: 'https://evil.example/x', ...fb }),
    ).toBeNull();
    expect(
      learnedUrl({ before: here, after: here, reported: 'https://www.facebook.com/share/p/9', ...fb }),
    ).toBeNull();
    expect(
      learnedUrl({ before: here, after: here, reported: 'https://www.facebook.com/messages/t/2', ...fb }),
    ).toBe('https://www.facebook.com/messages/t/2');
  });
});
```

Merge the new import with the existing one: `import { learnedUrl, OPEN_REPLY_TIMEOUT_MS, parseOpenReply } from '../../src/main/lib/open-reply';`.

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/open-reply.test.ts`
Expected: FAIL — `learnedUrl` is not exported.

- [x] **Step 3: Export the validator and implement `learnedUrl`**

In `src/main/lib/notification-click.ts`, rename the private `conversationUrl` function to an export with a name distinct from the recipe hook, and update its two call sites in `resolveBannerClick`:

```ts
/** The href resolved against the service URL, or null unless it stays on the
 *  service's origin and inside its chat surface: the chatPaths prefixes,
 *  matched against pathname + hash like the runner's containment. A site with
 *  no chatPaths is chat-only, so same origin is the whole check — the service
 *  URL's own path was never a boundary (Discord's is /channels/@me while a
 *  server channel lives at /channels/<guild>/<channel>). Also the gate on a
 *  URL a page reports after an open (learnedUrl). */
export function validatedConversationUrl(
  href: string,
  serviceUrl: string,
  chatPaths: string[] | undefined,
): string | null {
```

(The body is unchanged.) In `resolveBannerClick`, replace `conversationUrl(input.href, input.serviceUrl, input.chatPaths)` with `validatedConversationUrl(input.href, input.serviceUrl, input.chatPaths)`.

In `src/main/lib/open-reply.ts`, add the import and the helper:

```ts
import { validatedConversationUrl } from './notification-click';
```

```ts
/** What a landed replay teaches the row. Either the document moved and the
 *  page reports exactly where main sees it, or the page reports a URL the
 *  recipe minted for a thread the address bar never shows (Slack) — accepted
 *  only if it validates like a click-time href, and only if it is not where
 *  the document already was. Accepting the second grants nothing: a learned
 *  URL is re-validated on every open, and a page that wanted to steer its own
 *  rows onto a same-origin chat URL could already navigate there. */
export function learnedUrl(input: {
  before: string;
  after: string;
  reported: string;
  serviceUrl: string;
  chatPaths?: string[];
}): string | null {
  if (input.reported === input.before) return null;
  if (input.reported === input.after) return input.after;
  return validatedConversationUrl(input.reported, input.serviceUrl, input.chatPaths);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/open-reply.test.ts tests/unit/notification-click.test.ts`
Expected: PASS.

- [x] **Step 5: Wire main — `openInPage` learns through `learnedUrl`, `capturePin` reads the recipe URL**

In `src/main/views.ts`, add to the imports: `learnedUrl` from `'./lib/open-reply'` (alongside the existing `OPEN_REPLY_TIMEOUT_MS`, `parseOpenReply` import) and make sure `serviceById` from `'../shared/services'` is imported (it already is if `views.ts` uses it; check with `grep -n serviceById src/main/views.ts`).

Replace the tail of `openInPage` (the two lines after `if (!r) return null;`):

```ts
    const after = wc.isDestroyed() ? before : wc.getURL();
    const meta = serviceById(id);
    const learned = learnedUrl({
      before,
      after,
      reported: r.url,
      serviceUrl: meta.url,
      chatPaths: meta.chatPaths,
    });
    return learned ? { lane: r.lane, url: learned } : { lane: r.lane };
```

Update the method's doc comment sentence beginning "`url` is set only when…" to:

```ts
   *  `url` is set when the document moved and the page reports the same URL
   *  main sees, or when the page reports a recipe-minted URL that validates
   *  like a click-time href (Slack's thread: the document never moves) — the
   *  lesson a shim-only row keeps. Null when the view is gone or never
   *  answered. */
```

In `capturePin`, read the recipe URL beside the name. Replace the body from `let conversation: unknown = null;` through the `hooks.onPinMessage(...)` call with:

```ts
    let conversation: unknown = null;
    let threadHref: unknown = null;
    try {
      [conversation, threadHref] = (await wc.executeJavaScript(
        '[globalThis.__goetia?.conversation?.() ?? null, globalThis.__goetia?.conversationUrl?.() ?? null]',
        true,
      )) as unknown[];
    } catch {
      // page mid-navigation: the title alone will have to do
    }
    if (wc.isDestroyed()) return;
    // a recipe that names the thread by URL (Slack) beats the document URL,
    // which on such a site is the channel; validated at open time like any href
    const pinHref = typeof threadHref === 'string' && threadHref !== '' ? threadHref : href;
    this.hooks.onPinMessage(
      id,
      text,
      pinHref,
      title,
      typeof conversation === 'string' && conversation.trim() !== '' ? conversation : null,
    );
```

Keep whatever guard the existing code has between the `try` and `onPinMessage` (the current code checks `wc.isDestroyed()` — keep it as shown). Update the method's doc comment:

```ts
  /** Both capture doors end here: the title is the generic conversation
   *  hint, and the recipe's own handles are fetched from the page — the name
   *  (WhatsApp), the one thing that can later open a thread whose URL is
   *  shared by all, and the canonical thread URL (Slack), for a thread the
   *  document URL never names. */
```

- [x] **Step 6: Wire the preload — `__goetia.conversationUrl`, `byUrl`, and the reply URL**

In `src/preload/service.ts`, in the `notification:openConversation` handler, add the `byUrl` option after `byName`:

```ts
      byName: recipe?.openConversation?.bind(recipe),
      byUrl: recipe?.openUrl?.bind(recipe),
```

Change the reply so a landed replay reports the recipe's URL when it has one:

```ts
      .then(async (lane) => {
        // the replayed onclick routes through the SPA's own router; give it a
        // beat so the URL reported is the thread's, not the one before
        if (lane === 'replay') await new Promise((r) => setTimeout(r, REPLAY_SETTLE_MS));
        // a site whose address bar never names the thread (Slack) reports the
        // recipe's canonical URL instead, so the row learns something durable
        const url = (lane === 'replay' && recipe?.conversationUrl?.(document)) || window.location.href;
        port?.postMessage({ lane, url });
        port?.close();
      });
```

Extend the frozen object:

```ts
  Object.defineProperty(window, '__goetia', {
    value: Object.freeze({
      conversation: (): string | null => recipe?.conversation?.(document) ?? null,
      conversationUrl: (): string | null => recipe?.conversationUrl?.(document) ?? null,
    }),
```

Update the comment above it: "Main reads the open conversation's name and canonical URL through executeJavaScript at pin time."

- [x] **Step 7: Lint, typecheck, unit tests, e2e**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green.

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: green. The pins and loading specs exercise `capturePin` and the open reply path against the real preload; nothing Slack-specific runs under Playwright (no live session).

- [ ] **Step 8: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(pins,recents): capture and open Slack threads through the recipe's canonical URL`.

---

### Task 5: Docs, the live pass, and the spec's record of it

**Files:**

- Modify: `CLAUDE.md` (the Pins bullet under "Product principle: chat ONLY", the paragraph beginning "**Pins are the user's todo list, on Home**")
- Modify: `docs/superpowers/specs/2026-09-05-slack-thread-open-design.md` (a "Live pass" section)
- Modify: `src/preload/recipes/slack.ts` (header comment, only if the live pass changes the mechanism)

- [x] **Step 1: Add the CLAUDE.md line**

Append this sentence to the end of the Pins paragraph in `CLAUDE.md` (after the Zalo sentence ending "`tests/fixtures/zalo-chat.html` is the oracle."):

```markdown
Slack never puts the thread in the URL (the address bar stays on the channel while the flexpane shows a thread, verified 2026-09-05), so its recipe mints the canonical `/client/<T>/<C>/thread/<C>-<ts>` form from the flexpane root at pin time — only when the selection sits inside the flexpane, else the pin is the channel's — and opens it in-page through the `url` lane (after `same`, before `anchor`) by clicking the channel row and the root's View thread control; a landed replay teaches a recents row the recipe's `conversationUrl`, not `location.href`, gated by `learnedUrl`. `conversationUrl` and `openUrl` are declared as a pair (`recipes.test.ts`); `tests/fixtures/slack-thread.html` is the oracle.
```

Run: `npx markdownlint-cli2 CLAUDE.md`
Expected: 0 issues (the file has MD013 off via `.markdownlint-cli2.jsonc`).

- [ ] **Step 2: Live pass**

Build and launch with debug logging, signed into the workspace:

```bash
corepack pnpm package:mac
GOETIA_DEBUG_CALLS=1 open dist/mac-arm64/Goetia.app   # adjust the arch folder to what package:mac produced
```

Check, in order, and note each outcome:

1. Open a thread in Slack, select text inside the flexpane, `Edit ▸ Pin Selection`. On Home the pin shows the channel name. Close the flexpane, switch to another channel, open the pin: the flexpane shows the thread, and the console has no `[open] slack miss:` line.
2. Select text in the channel pane while a thread is open, pin it, open it: the channel opens, no thread.
3. Have a thread reply arrive as a banner (or reply from another account). Open ⌘K and the row: the thread opens (replay). Reload Slack (⌘R), open the row again: the thread opens through the learned URL (`url` lane).
4. Pin a thread whose root is far up the channel history, scroll the channel to the bottom, open the pin. If the root is not rendered, the log shows a miss on the `url` lane and the channel opens — expected, per spec.
5. Only if step 1 or 3 fails to open the flexpane: in DevTools (`View ▸ Toggle Developer Tools`) on the Slack view, try `document.querySelector('[data-qa="reply_bar_view_thread"]').click()` by hand and, separately, an injected anchor `a.href = 'https://we-build-vn.slack.com/archives/C…/p…?thread_ts=…&cid=C…'; a.click()`. Whichever Slack honours becomes the mechanism; if neither, the row click must go through `service:trusted-click` like Zalo's, and that is a change to `openSlackThread` (return a point) plus `byUrl` handling — stop and raise it with the user rather than improvising.

- [ ] **Step 3: Record the pass in the spec**

Append to `docs/superpowers/specs/2026-09-05-slack-thread-open-design.md`, before `## Out of scope`:

```markdown
## Live pass (2026-09-DD)

- Pin inside the flexpane, opened from another channel: <thread opened / miss>.
- Pin from the channel pane with a thread open: <channel opened>.
- Thread-reply recents row before and after a Slack reload: <replay landed / url lane landed>.
- Root outside the virtualized pane: <miss logged, channel opened>.
- Mechanism Slack honours: <synthetic click on View thread / injected permalink anchor>.
```

Fill every angle-bracketed field with what happened; if the mechanism changed, update `openSlackThread` and the recipe header accordingly and re-run Task 2's tests.

Run: `npx markdownlint-cli2 docs/superpowers/specs/2026-09-05-slack-thread-open-design.md CLAUDE.md`
Expected: 0 issues.

- [ ] **Step 4: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `docs(slack): record the thread-open invariant and live pass`.

---

## Self-review notes

- Spec coverage: recipe hooks → T1/T2; flexpane rule → T1; capture → T4 step 5; `url` lane, `OpenLane`, `LANES` → T3; recents learn rule and `validatedConversationUrl` → T4 steps 3–6; dead-view limit → unchanged code, recorded in spec; tests listed in the spec → T1–T4; CLAUDE.md line → T5; live pass → T5.
- Type consistency: `slackThreadUrl(doc, anchor?)`, `parseSlackThreadUrl(url)`, `openSlackThread(doc, url, opts?)` are defined in T1/T2 and consumed with those signatures in T2 and T4; `validatedConversationUrl(href, serviceUrl, chatPaths)` is defined in T4 and consumed by `learnedUrl` in the same task; `OpenOptions.byUrl` is defined in T3 and wired in T4.
- The learn rule lives in `lib/open-reply.ts` with a unit test, keeping `views.ts` thin, per the project rule.
