# Loop-Invariant Performance Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repeated per-tick, per-keystroke and per-row work found by the 2026-09-26 repo-wide N+1 review, without changing any observable behavior.

**Architecture:** Each fix either hoists loop-invariant work out of a loop (parse once, build a Map/Set once, compile a filter once), issues independent async calls together, or skips a write/broadcast whose result nothing reads. Every change keeps the exact same outputs; existing unit tests are the characterization oracle, and each task adds a test pinning the new property (write skipped, calls concurrent, predicate equivalent).

**Tech Stack:** Electron main (TypeScript), React renderer, service preload recipes, vitest + happy-dom, Playwright e2e, biome.

## Global Constraints

- **No behavior change.** A fix that would alter what a user sees, when they see it, or what lands on disk at rest is dropped, not shipped (user requirement, 2026-09-27). Hence the "Dropped after verification" section below.
- Definition of done (CLAUDE.md): `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green; `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` for main/preload/renderer wiring.
- No commits during execution. The user commits through `/grimoire-core:commit` at the end (global CLAUDE.md).
- Every per-service mute change still goes through `setServiceMuted`; every recipe `count()` still returns `{ direct: 0, indirect: 0 }` on `blank.html` and never throws.
- Comments explain why, one short line where possible; match surrounding density.
- Baseline before starting (2026-09-27): lint 0, typecheck 0, 1352 unit tests passing.

## Review findings and verdicts

The review produced 14 findings. Each was re-read against the code with the no-behavior-change rule.

| # | Finding | Verdict | Task |
| --- | --- | --- | --- |
| 1 | Discord `count()` runs a `[class*=]` selector over the whole document every 2s | Shipped after the live check passed | Task 1 |
| 2 | Teams per-row badge query, no `watch` | Dropped | — |
| 3 | Telegram per-row badge query, no `watch` | Dropped | — |
| 4 | WhatsApp `store.getAll()` over the whole `chat` store | Dropped: the live check found no `unreadCount` index | Task 2 |
| 5 | Messenger/Instagram per-element `textContent`, ancestor walks, `hideChrome` re-query | Dropped | — |
| 6 | Recents rewrites the sealed file when only a title's unread count moved | Implement | Task 3 |
| 7 | Shortcut table rebuilt and re-parsed on every key event | Implement | Task 4 |
| 8 | Unused `runtime.loading` broadcasts full `ShellState` on every load | Shipped after the startup race was fixed (first attempt reverted) | Task 5 |
| 9 | 200 `existsSync` per Downloads poll | Dropped | — |
| 10 | Facebook identity cookies set/removed one `await` at a time | Implement | Task 8 |
| 11 | Timed-mute expiry writes settings once per service | Dropped | — |
| 12 | Whole-state selectors re-render the shell tree per broadcast | Dropped: the re-renders keep relative times fresh | — |
| 13 | Downloads/Diagnostics panes: `services.find` per row, O(selected × rows) prune | Implement | Task 6 |
| 14 | Diagnostics filter re-folds the query per row | Implement | Task 7 |

### Dropped after verification

- **#2 Teams, #3 Telegram.** Adding `watch` changes badge latency: the runner's observer watches only `childList` and the `class`/`aria-label` attributes, and a badge count changes by text (`characterData`) and Teams' unread marker by `aria-labelledby`, neither of which it sees. So a count change would wait up to `FORCE_RECOUNT_TICKS` (≈10s) instead of ≤2s. Batching the per-row badge query into one selector changes "first badge per row" into "every badge", and the saving is microseconds (rows are already scoped, per-row subtrees are small).
- **#5 Meta/Instagram tweaks.** The `threadRows` "skip rows inside the last accepted row" rewrite is not equivalent (today a button nested in *any* `role=button`, accepted or not, is excluded). Caching `hideChrome`'s element can return a stale-but-connected branch after an SPA re-layout. The `isUnreadRow` `textContent` saving runs only on observer-gated recounts. None of them is worth an equivalence risk.
- **#9 Download `missing` cache.** Caching existence would delay the "moved or deleted since" row from ≤1s to the next pane open, a visible change. The 200 stats run only while the pane is open *and* a file is downloading.
- **#11 Mute expiry batch.** A batched writer would bypass `setServiceMuted`, which CLAUDE.md names as the single path for every per-service mute change. Simultaneous expiries are rare, so the saving is one or two writes.
- **#8 `runtime.loading` (dropped during execution, 2026-09-27).** Nothing reads the field, but its broadcasts are load-bearing. The shell gets its first `ShellState` only from the broadcast on its own `did-finish-load` (`index.ts`), and that can land before `window.goetia.onState` is subscribed. The service views' early `loading` flips send the next broadcasts and cover the miss. With them removed, a launch rendered no rail for ~5.6s, and 10 e2e specs failed on it (`restart`, `reorder`, `welcome`, `loading`, `cap-trim`) while a clean `HEAD` passed. Task 5 was reverted in full. The underlying race (no initial-state pull in the renderer) is a separate pre-existing issue, out of scope for a no-behavior-change pass.
- **#12 Selector narrowing (deferred).** `services` carries each service's runtime, so every unread change replaces it and narrowing it alone saves nothing. The real fix needs custom equality across five components, where a missed field silently freezes UI. Measure with `getAppMetrics` (see memory "Measure shell CPU with app metrics") before taking that risk.

## File structure

| File | Change |
| --- | --- |
| `src/preload/recipes/discord.ts` | Task 1: scope the badge selector (only if the live check passes) |
| `tests/fixtures/discord.html`, `tests/unit/recipes.test.ts` | Task 1: fixture follows the live DOM; fallback test |
| `src/preload/recipes/whatsapp.ts` | Task 2: read unread chats via index when present (only if the live check passes) |
| `tests/unit/whatsapp-count.test.ts` (new) | Task 2 |
| `src/main/lib/recents-rules.ts`, `src/main/recents.ts`, `src/main/index.ts` | Task 3: skip same-row writes, flush on quit |
| `tests/unit/recents-rules.test.ts`, `tests/unit/recents-store.test.ts` | Task 3 |
| `src/main/lib/shortcuts.ts`, `src/main/views.ts`, `src/main/index.ts` | Task 4: parse cache, keyDown early return, memoized table for the interceptor |
| `tests/unit/shortcuts.test.ts` | Task 4 |
| `src/shared/types.ts`, `src/main/state.ts`, `src/main/resilience.ts`, `src/main/ipc-handlers.ts`, `src/main/views.ts`, `src/main/index.ts` | Task 5: drop `ServiceRuntime.loading` |
| `src/renderer/src/components/DownloadsPane.tsx`, `src/renderer/src/components/DiagnosticsPane.tsx` | Task 6: Map lookups, Set prune |
| `src/shared/diag-filter.ts`, `src/main/lib/diagnostics.ts`, `src/renderer/src/components/DiagnosticsPane.tsx` | Task 7: `compileDiagFilter` |
| `tests/unit/diag-filter.test.ts` | Task 7 |
| `src/main/identity-share.ts`, `tests/unit/identity-share-store.test.ts` | Task 8: concurrent cookie writes |

Order follows the review's suggestion: recipes first (Tasks 1–2, both gated on the user's live check, so execution proceeds to Task 3 while they wait), then main (3–5), then UI (6–7), then the rest (8), then full verification (9).

---

### Task 1: Discord badge selector scoped to the guild rail (SHIPPED)

> Live check 2026-09-28: `[2, 2, 3280]`. Both badges on the page (a DM avatar's 3, a server's 1) sit inside `guildsnav`, out of 3280 elements; the channel-list mention pill is not matched by the selector either way.

**Files:**

- Modify: `src/preload/recipes/discord.ts` (`count`, ≈ line 179)
- Modify: `tests/fixtures/discord.html`
- Test: `tests/unit/recipes.test.ts`

**Interfaces:** none new.

- [ ] **Step 0: Live gate (user).** With Discord on screen and at least one unread DM *and* one unread server mention, open `View ▸ Toggle Developer Tools` and run:

```js
const sel = '[class*="lowerBadge_"] [class*="numberBadge_"]';
const rail = document.querySelector('[data-list-id="guildsnav"]');
[document.querySelectorAll(sel).length, rail ? rail.querySelectorAll(sel).length : 'no rail', document.querySelectorAll('*').length];
```

Proceed only if the first two numbers are equal and non-zero. If they differ, record "Task 1 dropped: badges live outside guildsnav" in this plan and skip to Task 2.

- [ ] **Step 1: Move the fixture's badges into the rail and add the fallback test**

`tests/fixtures/discord.html` becomes:

```html
<title>• Discord | Friends</title>
<div data-list-id="guildsnav">
  <div class="lowerBadge_a1b2c3"><div class="numberBadge_d4e5f6">2</div></div>
  <div class="lowerBadge_a1b2c3"><div class="numberBadge_d4e5f6">1</div></div>
  <div class="numberBadge_orphan">9</div>
</div>
<div>
  <div class="lowerBadge_zz"><div class="numberBadge_zz">40</div></div>
</div>
```

The badge outside the rail (a channel-list pill shape) must not count once the rail exists. Add to `tests/unit/recipes.test.ts`, next to the existing Discord row:

```ts
it('discord counts every rail badge, and falls back to the whole page before the rail mounts', () => {
  const doc = loadFixture('discord.html');
  expect(discord.count(doc)).toEqual({ direct: 3, indirect: 1 });
  doc.querySelector('[data-list-id="guildsnav"]')?.removeAttribute('data-list-id');
  expect(discord.count(doc)).toEqual({ direct: 3 + 40, indirect: 1 });
});
```

Use whatever fixture loader `recipes.test.ts` already uses in place of `loadFixture`.

- [ ] **Step 2: Run it to see it fail**

Run: `corepack pnpm vitest run tests/unit/recipes.test.ts`
Expected: FAIL (the whole-page query counts 43 with the rail present).

- [ ] **Step 3: Scope the query**

```ts
  count(doc) {
    // every lowerBadge sits in the guild rail (live check 2026-09-27); scoping
    // the substring selector spares a sweep of the whole message list per tick
    const root = doc.querySelector('[data-list-id="guildsnav"]') ?? doc;
    const badges = [...root.querySelectorAll('[class*="lowerBadge_"] [class*="numberBadge_"]')]
```

The rest of `count` is unchanged.

- [ ] **Step 4: Run the recipe tests**

Run: `corepack pnpm vitest run tests/unit/recipes.test.ts`
Expected: PASS, including `blank.html` → `{ direct: 0, indirect: 0 }`.

---

### Task 2: WhatsApp reads only unread chats when the store indexes them (DROPPED)

> Live check 2026-09-27: the `chat` store's indexes are `accountLid`, `ephemeralDuration`, `historyChatId` and `tcTokenTimestamp`, all single-key and none on `unreadCount`, so no range read can narrow the scan. The full `getAll()` stays, still gated by the `#pane-side` observer.

**Files:**

- Modify: `src/preload/recipes/whatsapp.ts` (`readChats`, ≈ line 65)
- Create: `tests/unit/whatsapp-count.test.ts`

**Interfaces:**

- Produces: `export function readChats(database: IDBDatabase): Promise<WhatsAppChat[]>` (now exported for the test).

- [ ] **Step 0: Live gate (user).** With WhatsApp on screen, in its devtools console:

```js
indexedDB.open('model-storage').onsuccess = (e) => {
  const s = e.target.result.transaction('chat').objectStore('chat');
  console.log([...s.indexNames].map((n) => [n, s.index(n).keyPath, s.index(n).multiEntry]));
};
```

Proceed only if the output lists an index whose keyPath is exactly `'unreadCount'` with `multiEntry` false. Otherwise record "Task 2 dropped: no unreadCount index" and skip to Task 3.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { readChats } from '../../src/preload/recipes/whatsapp';

type Chat = { unreadCount?: number };

/** Just enough of IDBDatabase for readChats: one store, optional index. */
function fakeDb(chats: Chat[], index: { keyPath: string; multiEntry: boolean } | null) {
  const request = (result: Chat[]) => {
    const req: { result: Chat[]; onsuccess?: () => void; onerror?: () => void } = { result };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const calls: string[] = [];
  const store = {
    indexNames: { contains: (n: string) => index !== null && n === 'unreadCount' },
    getAll: () => {
      calls.push('store');
      return request(chats);
    },
    index: () => ({
      ...index,
      getAll: (range: { lower: number; lowerOpen: boolean }) => {
        calls.push(`index>${range.lower}${range.lowerOpen ? '' : '='}`);
        return request(chats.filter((c) => (c.unreadCount ?? 0) > range.lower));
      },
    }),
  };
  const db = { transaction: () => ({ objectStore: () => store }) } as unknown as IDBDatabase;
  return { db, calls };
}

(globalThis as { IDBKeyRange?: unknown }).IDBKeyRange ??= {
  lowerBound: (lower: number, lowerOpen: boolean) => ({ lower, lowerOpen }),
};

describe('readChats', () => {
  const chats = [{ unreadCount: 0 }, { unreadCount: 3 }, {}, { unreadCount: 1 }];

  it('reads only chats above zero through the unreadCount index', async () => {
    const { db, calls } = fakeDb(chats, { keyPath: 'unreadCount', multiEntry: false });
    expect(await readChats(db)).toEqual([{ unreadCount: 3 }, { unreadCount: 1 }]);
    expect(calls).toEqual(['index>0']);
  });

  it('reads the whole store when there is no such index', async () => {
    const { db, calls } = fakeDb(chats, null);
    expect(await readChats(db)).toEqual(chats);
    expect(calls).toEqual(['store']);
  });

  it('reads the whole store when the index is shaped differently', async () => {
    const { db, calls } = fakeDb(chats, { keyPath: 'unreadCount', multiEntry: true });
    expect(await readChats(db)).toEqual(chats);
    expect(calls).toEqual(['store']);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `corepack pnpm vitest run tests/unit/whatsapp-count.test.ts`
Expected: FAIL (`readChats` is not exported).

- [ ] **Step 3: Implement**

```ts
/** Only chats that can count. An exclusive-0 read of an `unreadCount` index is
 *  exactly what countWhatsAppChats keeps — it skips unread <= 0, and a record
 *  with no count is absent from the index. The schema is WhatsApp's, so
 *  without that index this reads the whole store as before. */
export function readChats(database: IDBDatabase): Promise<WhatsAppChat[]> {
  return new Promise((resolve, reject) => {
    const store = database.transaction('chat', 'readonly').objectStore('chat');
    const index = store.indexNames.contains('unreadCount') ? store.index('unreadCount') : null;
    const q =
      index && index.keyPath === 'unreadCount' && !index.multiEntry
        ? index.getAll(IDBKeyRange.lowerBound(0, true))
        : store.getAll();
    q.onsuccess = () => resolve(q.result as WhatsAppChat[]);
    q.onerror = () => reject(q.error);
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `corepack pnpm vitest run tests/unit/whatsapp-count.test.ts tests/unit/recipes.test.ts`
Expected: PASS.

---

### Task 3: Recents skips the write when only the top row's `at` moved

For a service with no `conversation` hook, the runner's report key includes `doc.title`, so `(3) #general` → `(4) #general` re-reports the same conversation. Main derives the same label, and `RecentsStore.upsert` re-encrypts and rewrites all 50 rows to change one timestamp. On disk the row is already newest (`restoreRecents` sorts by `at`), so the write can wait. It is flushed on quit, so the file ends identical to today's. A crash loses only a newer `at` on a row that stays on top either way.

**Files:**

- Modify: `src/main/lib/recents-rules.ts` (add `sameButAt`)
- Modify: `src/main/recents.ts` (`upsert`, `write`, new `flush`)
- Modify: `src/main/index.ts` (`before-quit`, ≈ line 532)
- Test: `tests/unit/recents-rules.test.ts`, `tests/unit/recents-store.test.ts`

**Interfaces:**

- Produces: `export function sameButAt(a: RecentEntry, b: RecentEntry): boolean` in `recents-rules.ts`; `RecentsStore.flush(): void`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/recents-rules.test.ts`:

```ts
describe('sameButAt', () => {
  const row = { id: 1, serviceId: 'slack', label: 'general', url: 'https://app.slack.com/client/T/C', at: 1 } as const;
  it('is true when only the time differs', () => {
    expect(sameButAt(row, { ...row, at: 2 })).toBe(true);
  });
  it('is false when anything a reader sees differs', () => {
    expect(sameButAt(row, { ...row, url: 'https://app.slack.com/client/T/D' })).toBe(false);
    expect(sameButAt(row, { ...row, label: 'random' })).toBe(false);
    expect(sameButAt(row, { ...row, id: 2 })).toBe(false);
    expect(sameButAt(row, { ...row, conversation: 'general' })).toBe(false);
    expect(sameButAt({ ...row, serviceId: 'discord' }, row)).toBe(false);
  });
});
```

(Import `sameButAt` beside the file's existing imports from `recents-rules`.)

In `tests/unit/recents-store.test.ts`, inside `describe('RecentsStore')`:

```ts
  it('keeps the file as is when the top row is re-reported with only a newer time', () => {
    const store = new RecentsStore(dir, codec);
    store.upsert(sighting('Minh Anh', 1));
    const before = file();
    store.upsert(sighting('Minh Anh', 2));
    expect(file()).toBe(before);
    expect(store.rows()[0]?.at).toBe(2);
  });

  it('flush writes the deferred time, and a fresh store reads it back', () => {
    const store = new RecentsStore(dir, codec);
    store.upsert(sighting('Minh Anh', 1));
    store.upsert(sighting('Minh Anh', 2));
    store.flush();
    expect(new RecentsStore(dir, codec).rows()[0]?.at).toBe(2);
  });

  it('flush writes nothing when nothing is deferred', () => {
    const store = new RecentsStore(dir, codec);
    store.flush();
    expect(() => file()).toThrow();
  });

  it('still writes at once when another conversation takes the top', () => {
    const store = new RecentsStore(dir, codec);
    store.upsert(sighting('Minh Anh', 1));
    store.upsert(sighting('Minh Anh', 2));
    store.upsert(sighting('Nhóm Sale', 3));
    expect(new RecentsStore(dir, codec).rows().map((r) => [r.label, r.at])).toEqual([
      ['Nhóm Sale', 3],
      ['Minh Anh', 2],
    ]);
  });

  it('still writes at once when the top row moved to a new url', () => {
    const store = new RecentsStore(dir, codec);
    store.upsert(sighting('Minh Anh', 1));
    store.upsert({ ...sighting('Minh Anh', 2), url: 'https://web.whatsapp.com/#x' });
    expect(new RecentsStore(dir, codec).rows()[0]?.url).toBe('https://web.whatsapp.com/#x');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `corepack pnpm vitest run tests/unit/recents-rules.test.ts tests/unit/recents-store.test.ts`
Expected: FAIL (`sameButAt` and `flush` do not exist; the file changes on the second upsert).

- [ ] **Step 3: Implement**

`src/main/lib/recents-rules.ts`, after `upsertRecent`:

```ts
/** The same row, only seen later: nothing a reader of the list would notice. */
export function sameButAt(a: RecentEntry, b: RecentEntry): boolean {
  return (
    a.id === b.id &&
    a.serviceId === b.serviceId &&
    a.label === b.label &&
    a.conversation === b.conversation &&
    a.url === b.url
  );
}
```

`src/main/recents.ts`, import `sameButAt` alongside `restoreRecents, upsertRecent`, then:

```ts
  private nextId = 1;
  /** memory holds a newer `at` than the file; see upsert */
  private deferred = false;
```

```ts
  upsert(sighting: Omit<RecentEntry, 'id'>): boolean {
    if (this.unreadable) return false;
    const top = this.entries[0];
    this.entries = upsertRecent(this.entries, sighting, () => this.nextId++);
    // a title's unread count moving re-reports the chat already on top: only
    // its `at` changed, and the file already sorts it first, so the sealed
    // rewrite waits for the next real change or flush() at quit
    const head = this.entries[0];
    if (top && head && sameButAt(top, head)) this.deferred = true;
    else this.write();
    return true;
  }

  /** Commit a deferred `at` before the process goes. */
  flush(): void {
    if (this.deferred && !this.unreadable) this.write();
  }
```

and in `write()`, first line: `this.deferred = false;`.

`src/main/index.ts`, in `before-quit`, before `diag.flush();`:

```ts
      recents.flush();
```

- [ ] **Step 4: Run the tests**

Run: `corepack pnpm vitest run tests/unit/recents-rules.test.ts tests/unit/recents-store.test.ts`
Expected: PASS, including every pre-existing recents test.

---

### Task 4: The key interceptor stops rebuilding the shortcut table per key event

`before-input-event` fires for every keyDown, keyUp and char in every service page. Today each one calls `resolveAccelerators` (a table copy) and, on keyDown, re-parses about 25 accelerator strings. Results stay identical: the parsed chord for a given `(platform, accelerator)` never changes, the resolved table changes only when `settings.shortcuts` does, and `shellCommandFor` already returns null for anything but keyDown.

**Files:**

- Modify: `src/main/lib/shortcuts.ts` (`parse` callers in `shellCommandFor`)
- Modify: `src/main/views.ts` (`before-input-event`, ≈ line 396)
- Modify: `src/main/index.ts` (the `accelerators` hook passed to `ServiceViewManager`, ≈ line 239/274)
- Test: `tests/unit/shortcuts.test.ts`

**Interfaces:** none new outside the modules.

- [ ] **Step 1: Write the characterization test**

In `tests/unit/shortcuts.test.ts` inside `describe('shellCommandFor')`:

```ts
  it('answers the same on repeat and follows a rebinding at once', () => {
    const down = { type: 'keyDown', key: 'g', code: 'KeyG', control: false, meta: true, shift: true, alt: false };
    expect(shellCommandFor(down, 'darwin')).toEqual({ kind: 'home' });
    expect(shellCommandFor(down, 'darwin')).toEqual({ kind: 'home' });
    const rebound = { ...ACCELERATORS, home: 'CmdOrCtrl+Shift+J' };
    expect(shellCommandFor(down, 'darwin', rebound)).toBeNull();
    expect(shellCommandFor({ ...down, key: 'j', code: 'KeyJ' }, 'darwin', rebound)).toEqual({ kind: 'home' });
    expect(shellCommandFor({ ...down, meta: false, control: true }, 'linux')).toEqual({ kind: 'home' });
  });
```

(Import `ACCELERATORS` from `../../src/main/lib/shortcuts` if the file does not already.)

- [ ] **Step 2: Run it (passes before and after, which is the point)**

Run: `corepack pnpm vitest run tests/unit/shortcuts.test.ts`
Expected: PASS. This test guards the cache in Step 3 against serving a stale chord.

- [ ] **Step 3: Cache parsed chords**

In `src/main/lib/shortcuts.ts`, after `parse`:

```ts
/** Parsed chords by platform + accelerator: the matcher runs on every key in
 *  every service page, and the strings are a small set (the table, the ⌘1…9
 *  row, the user's rebinds). The clear keeps it bounded all the same. */
const parsed = new Map<string, Chord>();
const PARSED_MAX = 256;

function chordFor(accelerator: string, platform: string): Chord {
  const key = `${platform}\n${accelerator}`;
  let chord = parsed.get(key);
  if (!chord) {
    if (parsed.size >= PARSED_MAX) parsed.clear();
    chord = parse(accelerator, platform);
    parsed.set(key, chord);
  }
  return chord;
}
```

In `shellCommandFor`, replace the three `parse(` calls with `chordFor(`. `matches` only reads the chord, so sharing one object is safe.

- [ ] **Step 4: Skip non-keyDown events before resolving the table**

In `src/main/views.ts` `before-input-event`, first line of the handler:

```ts
      if (input.type !== 'keyDown') return; // the matcher ignores the rest anyway
```

- [ ] **Step 5: Resolve the interceptor's table once per shortcuts change**

In `src/main/index.ts`, beside `const accelerators = …`:

```ts
    // settings are deep-frozen and replaced on write, so the shortcuts object's
    // identity says whether the resolved table is still current
    let resolvedFrom: Settings['shortcuts'] | null = null;
    let resolvedTable = accelerators();
    const interceptorAccelerators = () => {
      const from = settings.get().shortcuts;
      if (from !== resolvedFrom) {
        resolvedFrom = from;
        resolvedTable = Object.freeze(resolveAccelerators(from));
      }
      return resolvedTable;
    };
```

and pass `accelerators: interceptorAccelerators` to `ServiceViewManager` in place of `accelerators`. The menu, the recorder and Settings keep calling the unmemoized `accelerators`. Import the `Settings` type if `index.ts` lacks it. `ViewHooks.accelerators` is typed `() => Accelerators`; a frozen `Accelerators` satisfies it.

- [ ] **Step 6: Run the tests and typecheck**

Run: `corepack pnpm vitest run tests/unit/shortcuts.test.ts tests/unit/shortcut-recorder.test.ts tests/unit/shortcut-rules.test.ts && corepack pnpm typecheck`
Expected: PASS / exit 0.

---

### Task 5: Drop the unread `ServiceRuntime.loading` (SHIPPED on the second attempt)

> First attempt reverted: removing it broke 10 e2e specs by exposing a startup-state race (see #8 above). Re-applied on 2026-09-29, once `shell:ready` gave the renderer an initial-state request.

Nothing in the renderer or main reads `runtime.loading` (the placeholder moved to `waking`, per CLAUDE.md). Yet every `did-start-loading`, including a subframe's, and every `did-finish-load` flips it, and each flip coalesces into a full `ShellState` snapshot with settings and every pin, cloned over IPC. Every other runtime change broadcasts itself through `setRuntime` (`waking.end`, `noteRecovered` → `crashed: false`), so nothing depended on the loading broadcast.

**Files:**

- Modify: `src/shared/types.ts:378` (remove `loading: boolean;`)
- Modify: `src/main/state.ts:18` (remove `loading: false,`)
- Modify: `src/main/resilience.ts:64` (`{ crashed: true, loading: false }` → `{ crashed: true }`)
- Modify: `src/main/ipc-handlers.ts:242` (remove `loading: false,`)
- Modify: `src/main/views.ts:79,438,443` (hook becomes `onLoadFinished`)
- Modify: `src/main/index.ts:244` (the hook body)

**Interfaces:**

- Produces: `ViewHooks.onLoadFinished(id: ServiceId): void` replacing `onLoading(id, loading)`.

- [ ] **Step 1: Confirm no reader exists**

Run: `grep -rn "\.loading\b\|loading:" src tests --include='*.ts' --include='*.tsx' | grep -v "loading:state"`
Expected: only the writers listed in Files above.

- [ ] **Step 2: Remove the field and its writers**

Apply the Files edits. In `views.ts` the hook becomes:

```ts
export interface ViewHooks {
  /** did-finish-load: the main frame's document is up */
  onLoadFinished(id: ServiceId): void;
```

delete `wc.on('did-start-loading', …)` and in `did-finish-load` replace `this.hooks.onLoading(id, false);` with `this.hooks.onLoadFinished(id);`. In `index.ts`:

```ts
        onLoadFinished: (id) => {
          waking.end(id, 'load-finished');
          resilience?.noteRecovered(id);
        },
```

- [ ] **Step 3: Typecheck and test**

Run: `corepack pnpm typecheck && corepack pnpm test`
Expected: exit 0; every test passes (the compiler finds any reader Step 1 missed).

---

### Task 6: Downloads and Diagnostics panes look services up in a Map

**Files:**

- Modify: `src/renderer/src/components/DownloadsPane.tsx` (prune effect ≈ 130; `serviceName` ≈ 200; row `svc` ≈ 361)
- Modify: `src/renderer/src/components/DiagnosticsPane.tsx` (row `svc` ≈ 148)

**Interfaces:** none.

These are render-local and equivalent by construction: `Map.get` returns what `find` returned, since service ids are unique. `keep.has(id)` holds exactly when some row with that id is selectable, as `rows.some(...)` did. Existing e2e (`downloads*.spec.ts`, `diagnostics*.spec.ts`) plus typecheck are the oracle.

- [ ] **Step 1: Prune against a Set**

```ts
  useEffect(() => {
    if (!rows) return;
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const keep = new Set(rows.filter(selectable).map((r) => r.id));
      const next = new Set([...prev].filter((id) => keep.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);
```

- [ ] **Step 2: One Map per render in DownloadsPane**

Replace the `serviceName` definition:

```ts
  const byId = new Map(services?.map((s) => [s.id, s] as const));
  const serviceName = (r: DownloadView) => byId.get(r.serviceId)?.name ?? r.serviceId;
```

and at the row (`const svc = services?.find((s) => s.id === r.serviceId);`) use `const svc = byId.get(r.serviceId);`.

- [ ] **Step 3: The same in DiagnosticsPane**

Above the returned JSX: `const byId = new Map(services?.map((s) => [s.id, s] as const));`. At the row: `const svc = e.serviceId ? byId.get(e.serviceId) : undefined;`.

- [ ] **Step 4: Lint, typecheck, test**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: exit 0.

---

### Task 7: The Diagnostics filter is compiled once per filter

`matchesDiagFilter` trims and lowercases the query, and scans the tag array, once per row. The pane and `Diagnostics.report` both run it over the whole ring. Compile it once; `matchesDiagFilter` stays as a wrapper so the one-rule guarantee (the pane and the report agree) holds.

**Files:**

- Modify: `src/shared/diag-filter.ts`
- Modify: `src/main/lib/diagnostics.ts:231`
- Modify: `src/renderer/src/components/DiagnosticsPane.tsx:47`
- Test: `tests/unit/diag-filter.test.ts`

**Interfaces:**

- Produces: `export function compileDiagFilter(filter: DiagFilter): (entry: DiagEntry) => boolean`.

- [ ] **Step 1: Write the failing test**

```ts
describe('compileDiagFilter', () => {
  const filters: DiagFilter[] = [
    EMPTY_DIAG_FILTER,
    { tags: ['nav'], query: '' },
    { tags: [], query: '  ZALO ' },
    { tags: ['recipe', 'app'], query: 'stale' },
    { tags: [], query: '[nav] zalo' },
    { tags: ['app'], query: '   ' },
  ];
  it('agrees with matchesDiagFilter on every entry and filter', () => {
    for (const f of filters) {
      const test = compileDiagFilter(f);
      for (const e of [nav, stale, started]) expect(test(e)).toBe(matchesDiagFilter(e, f));
    }
  });
});
```

(Add `compileDiagFilter` and `type DiagFilter` to the file's imports.)

- [ ] **Step 2: Run it to see it fail**

Run: `corepack pnpm vitest run tests/unit/diag-filter.test.ts`
Expected: FAIL (`compileDiagFilter` is not exported).

- [ ] **Step 3: Implement**

Replace `matchesDiagFilter` in `src/shared/diag-filter.ts`:

```ts
/** The filter as one predicate, the query folded once rather than per row. */
export function compileDiagFilter(filter: DiagFilter): (entry: DiagEntry) => boolean {
  const tags = filter.tags.length > 0 ? new Set<DiagTag>(filter.tags) : null;
  const q = filter.query.trim().toLowerCase();
  return (entry) => (tags === null || tags.has(entry.tag)) && (q === '' || haystack(entry).includes(q));
}

export function matchesDiagFilter(entry: DiagEntry, filter: DiagFilter): boolean {
  return compileDiagFilter(filter)(entry);
}
```

`src/main/lib/diagnostics.ts`: `const rows = this.entries.filter(compileDiagFilter(filter));` (swap the import). `DiagnosticsPane.tsx`: `() => (entries ?? []).filter(compileDiagFilter(filter)),` (swap the import).

- [ ] **Step 4: Run the tests**

Run: `corepack pnpm vitest run tests/unit/diag-filter.test.ts tests/unit/diagnostics.test.ts && corepack pnpm lint`
Expected: PASS (skip a named file that does not exist; the full suite runs in Task 9).

---

### Task 8: Facebook identity cookies are written and removed together

`seed` stops the popup's load and replays it only after every cookie is set, so each sequential `await dest.set` is latency the user sees. The writes are independent: cookies from one `get` are unique by name, domain and path. One rejected cookie must still not abort the rest. The async arrow keeps that for a synchronous throw from `cookieSetDetails` / `removalUrl` too, which the old `try` covered. `unseed`'s removal likewise; its verify step (`mine()` afterwards) still decides success.

**Files:**

- Modify: `src/main/identity-share.ts` (≈ 118–126 and 166–173)
- Test: `tests/unit/identity-share-store.test.ts`

**Interfaces:** none.

- [ ] **Step 1: Write the failing tests**

In `describe('seed')`:

```ts
  it('issues every cookie write before the first one lands', async () => {
    let pending = 0;
    let peak = 0;
    const jar = jars.tiktok as FakeJar;
    const set = jar.set.bind(jar);
    jar.set = async (details) => {
      pending++;
      peak = Math.max(peak, pending);
      await new Promise((r) => setTimeout(r, 0));
      pending--;
      return set(details);
    };
    await expect(build().seed('tiktok')).resolves.toBe(true);
    expect(peak).toBe(2);
    expect(jars.tiktok.cookies.map((c) => c.name).sort()).toEqual(['c_user', 'xs']);
  });

  it('still sets the rest when one cookie is refused', async () => {
    const jar = jars.tiktok as FakeJar;
    const set = jar.set.bind(jar);
    jar.set = (details) => {
      if (details.name === 'xs') throw new Error('refused');
      return set(details);
    };
    await expect(build().seed('tiktok')).resolves.toBe(true);
    expect(jars.tiktok.cookies.map((c) => c.name)).toEqual(['c_user']);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `corepack pnpm vitest run tests/unit/identity-share-store.test.ts`
Expected: the first FAILS with `peak` 1. The second passes before and after, which pins the "one refusal never aborts" rule.

- [ ] **Step 3: Implement**

Seed:

```ts
      const share = from.filter((c) => isFacebookCookieDomain(c.domain ?? ''));
      // independent writes, issued together: the popup sits blank until they
      // land. One rejected cookie must not abort the set — a partial session
      // still beats a full password prompt, and Facebook re-issues what it needs
      await Promise.allSettled(share.map(async (c) => dest.set(cookieSetDetails(c))));
```

Unseed:

```ts
    const cookies = await mine();
    // one stuck cookie must not strand the rest; the check below is what
    // decides whether this counted
    await Promise.allSettled(cookies.map(async (c) => jar.remove(removalUrl(c), c.name)));
```

- [ ] **Step 4: Run the tests**

Run: `corepack pnpm vitest run tests/unit/identity-share-store.test.ts tests/unit/identity-share.test.ts`
Expected: PASS, including the existing "survived removal keeps the marker" cases.

---

### Task 9: Full verification

- [ ] **Step 1: Unit gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: exit 0; test count = 1352 + the tests added above.

- [ ] **Step 2: E2E (main, preload and renderer wiring changed)**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all specs pass. A reorder/restart drag spec that fails under load is re-run alone with `npx playwright test <spec>` before being treated as real (memory: "E2E drag specs flake under load").

- [ ] **Step 3: Markdown**

Run: `npx markdownlint-cli2 docs/superpowers/plans/2026-09-27-loop-invariant-performance.md`
Expected: no warnings.

- [ ] **Step 4: Hand off**

Report which tasks shipped, which gates are pending the user's live checks (Tasks 1–2), and ask the user to run `/grimoire-core:commit`.

## Execution log (2026-09-27)

- Tasks 3, 4, 6, 7, 8 shipped to the working tree, uncommitted.
- Task 5 was implemented, broke 10 e2e specs (verified against a clean `HEAD` export, where they pass), and was reverted.
- Task 2 dropped after the user's live check (no `unreadCount` index).
- Task 1 shipped after the user's Discord live check (2026-09-28); gates re-run: 1364 unit tests, e2e 58/58.
- Final gates after the revert: lint 0, typecheck 0, 1363 unit tests passing (1352 + 11 new), e2e 58/58 passing.
- Follow-up (2026-09-29, user request): the startup race behind #8 is fixed. The renderer sends `shell:ready` once `onState` is subscribed and main answers with the ordinary broadcast. The channel is shell-only and allowed while locked, and its reply carries nothing a locked broadcast does not. With the `loading` broadcasts disabled as an experiment, the 13 previously affected specs pass. With them restored: 1365 unit tests, e2e 58/58. Task 5 can now be re-applied safely; it has not been.
- Follow-up (2026-09-29): Task 5 re-applied. #12 dropped: `services` is static metadata (unread counts live in `runtime`), but both 200-row panes compute `now = Date.now()` for "5 min ago" labels, and those labels refresh only because broadcasts re-render the panes. Memoizing the panes would freeze them; a minute ticker would be new behavior. Separately, `rememberSurface` now skips its settings write when the recorded surface already matches and no usage stamp is due (Home commits and banish sweeps). The interceptor's shortcut table is seeded once at boot rather than built and discarded.
- Final gates (2026-09-29): lint 0, typecheck 0, 1368 unit tests passing, e2e 58/58 passing. One earlier full run lost `updates.spec.ts` to its 10s limit under load ("Target page … has been closed"); it passed 3/3 alone and in the next full run.
