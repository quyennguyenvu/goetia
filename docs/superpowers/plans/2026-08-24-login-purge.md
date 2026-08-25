# Login Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the per-service "Sign out…" to "Purge login…" in red, and add a Home-wide "Purge all logins…" sweep that reaches every service including unbound ones.

**Architecture:** The existing single-service wipe (`src/main/signout.ts`) becomes `src/main/purge.ts` with a shared `purgeService` unit that both entry points call; the bulk entry point iterates `settings.order` behind a native checkbox confirm and returns a count over a new **invoke** channel, so the completion toast never touches `ShellState`. Red gets its own `--danger` token rather than reusing `--badge` (unread) or `--accent-2` (the hero gradient's end stop).

**Tech Stack:** Electron main process, React 19 + Tailwind v4 renderer, zustand store, vitest unit tests, Playwright e2e.

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-08-24-login-purge-design.md`. Read it before Task 1.
- Package manager is **corepack pnpm**. Definition of done for the whole plan: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm e2e` all green.
- E2E must run with `ELECTRON_RUN_AS_NODE` unset: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`.
- **Copy is fixed. Use these exact strings:**
  - Settings button label: `Purge login…` (U+2026 ellipsis, not three dots)
  - Settings button `title`: `Clears this service's saved login on this device. Your account stays active — nothing is signed out elsewhere.`
  - Home footer label: `Purge all logins…`
  - Bulk dialog buttons: `['Cancel', 'Purge All']`
  - Bulk dialog checkbox: `Yes, wipe every service`
  - Nudge prefix: `Tick the box below to confirm.`
- **Naming is fixed.** Channel `service:purgeLogin`; invoke channel `services:purgeAll`; module `src/main/purge.ts`; exports `confirmPurgeLogin`, `confirmPurgeAll`, `purgeService`; copy helpers in `src/main/lib/purge-rules.ts`; test ids `purge-<id>` and `purge-all-btn`.
- **Token values are fixed:** `--danger: #d1293d` (light `:root`), `--danger: #ff5a6a` (`:root[data-theme="dark"]`), exposed as `--color-danger`.
- Purge must never touch `disabled` or `order`. Banish must never touch a login. These two axes stay orthogonal.
- Never add `Co-Authored-By` trailers. **Never create a commit yourself** — every task's commit step means: stop, report the staged diff, and ask the user to run `/grimoire-core:commit`.
- Markdown edits must pass `npx markdownlint-cli2 <file>` (MD013 is off in this repo — never hard-wrap prose).

---

## File Structure

| Path | Responsibility | Task |
| --- | --- | --- |
| `src/main/lib/purge-rules.ts` | **Create.** Pure dialog copy builders, no electron import. | 1 |
| `tests/unit/purge-rules.test.ts` | **Create.** Copy builder tests. | 1 |
| `src/main/lib/activity-log.ts` | **Modify.** Add `clear(id?)`. | 2 |
| `tests/unit/activity-log.test.ts` | **Modify.** `clear` tests. | 2 |
| `src/renderer/src/tokens.css` | **Modify.** `--danger` in both themes + `--color-danger`. | 3 |
| `src/shared/ipc.ts` | **Modify.** Rename channel, add invoke channel. | 4 |
| `src/main/ipc-handlers.ts` | **Modify.** Widen `registerInvoke`, rewire handlers. | 4, 5 |
| `tests/unit/ipc-sender-policy.test.ts` | **Modify.** Rename pair, add `services:purgeAll` pair. | 4 |
| `src/main/purge.ts` | **Create** (replaces `signout.ts`). `purgeService`, `confirmPurgeLogin`, `confirmPurgeAll`. | 5 |
| `src/main/signout.ts` | **Delete.** | 5 |
| `src/renderer/src/components/SettingsView.tsx` | **Modify.** Red `Purge login…` button. | 6 |
| `tests/e2e/banish.spec.ts` | **Modify.** Label assertion. | 6 |
| `src/renderer/src/components/toast-rules.ts` | **Modify.** Add `purgeToastMessage`. | 7 |
| `tests/unit/toast-rules.test.ts` | **Modify.** `purgeToastMessage` tests. | 7 |
| `src/renderer/src/store.ts` | **Modify.** `purgeToast` + `setPurgeToast`. | 7 |
| `src/renderer/src/components/PurgeToast.tsx` | **Create.** Bottom-centre toast. | 7 |
| `src/renderer/src/App.tsx` | **Modify.** Mount `PurgeToast`. | 7 |
| `src/renderer/src/components/welcome/HomeHero.tsx` | **Modify.** Footer purge link. | 8 |
| `src/renderer/src/components/Welcome.tsx` | **Modify.** Invoke handler. | 8 |
| `tests/e2e/home.spec.ts` | **Modify.** Footer link assertion. | 8 |
| `README.md`, `docs/FEATURES.md`, `CLAUDE.md` | **Modify.** Copy + invariant. | 9 |

---

## Task 1: Dialog copy helpers

Pure functions first, so the dialog wording is testable without electron. `src/main/lib/` must not import electron — these builders return plain option objects that `purge.ts` hands to `dialog.showMessageBox`.

**Files:**

- Create: `src/main/lib/purge-rules.ts`
- Test: `tests/unit/purge-rules.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `export interface PurgeDialogCopy { message: string; detail: string; buttons: string[]; defaultId: number; cancelId: number; checkboxLabel?: string }`
  - `export function purgeLoginDialog(name: string): PurgeDialogCopy`
  - `export function purgeAllDialog(count: number, nudge: boolean): PurgeDialogCopy`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/purge-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { purgeAllDialog, purgeLoginDialog } from '../../src/main/lib/purge-rules';

describe('purgeLoginDialog', () => {
  it('names the service and offers Purge as the non-default button', () => {
    const d = purgeLoginDialog('Telegram');
    expect(d.message).toBe('Purge the Telegram login?');
    expect(d.buttons).toEqual(['Cancel', 'Purge']);
    expect(d.defaultId).toBe(0);
    expect(d.cancelId).toBe(0);
  });

  // the caveat is the whole reason for the rename — it must not be droppable
  it('states the device-only scope and the ended call', () => {
    const d = purgeLoginDialog('Telegram');
    expect(d.detail).toContain('this device');
    expect(d.detail).toContain('call');
    expect(d.detail).toContain('stays active');
  });

  it('carries no checkbox — one service is not the heavy action', () => {
    expect(purgeLoginDialog('Telegram').checkboxLabel).toBeUndefined();
  });
});

describe('purgeAllDialog', () => {
  it('counts the services and gates on the acknowledgement checkbox', () => {
    const d = purgeAllDialog(10, false);
    expect(d.message).toBe('Purge all 10 logins?');
    expect(d.checkboxLabel).toBe('Yes, wipe every service');
    expect(d.buttons).toEqual(['Cancel', 'Purge All']);
    expect(d.defaultId).toBe(0);
    expect(d.cancelId).toBe(0);
  });

  it('pluralizes on the count', () => {
    expect(purgeAllDialog(1, false).message).toBe('Purge all 1 login?');
    expect(purgeAllDialog(2, false).message).toBe('Purge all 2 logins?');
  });

  // the sweep is the ONLY path to an unbound service's credentials, so the
  // dialog has to say it reaches them
  it('names summoned and unbound, and keeps the account caveat', () => {
    const d = purgeAllDialog(10, false);
    expect(d.detail).toContain('summoned and unbound');
    expect(d.detail).toContain('this device');
    expect(d.detail).toContain('stay active');
  });

  it('prefixes the nudge when the box was left unticked', () => {
    const d = purgeAllDialog(10, true);
    expect(d.detail.startsWith('Tick the box below to confirm.')).toBe(true);
    expect(d.detail).toContain('summoned and unbound');
  });

  it('leaves the nudge off on the first pass', () => {
    expect(purgeAllDialog(10, false).detail).not.toContain('Tick the box');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/purge-rules.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/main/lib/purge-rules"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/lib/purge-rules.ts`:

```ts
/** Native-dialog copy for the two purge entry points. Pure so the wording is
 *  testable without electron — `purge.ts` hands these straight to
 *  `dialog.showMessageBox`. */
export interface PurgeDialogCopy {
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
  checkboxLabel?: string;
}

const NUDGE = 'Tick the box below to confirm.';

const ALL_DETAIL =
  'Clears every saved login on this device — summoned and unbound — and ends any call in progress. Your accounts stay active; nothing is signed out elsewhere.';

export function purgeLoginDialog(name: string): PurgeDialogCopy {
  return {
    message: `Purge the ${name} login?`,
    detail: `Clears its saved login on this device and ends any ${name} call in progress. Your account stays active — nothing is signed out elsewhere.`,
    buttons: ['Cancel', 'Purge'],
    defaultId: 0,
    cancelId: 0,
  };
}

export function purgeAllDialog(count: number, nudge: boolean): PurgeDialogCopy {
  const logins = count === 1 ? 'login' : 'logins';
  return {
    message: `Purge all ${count} ${logins}?`,
    detail: nudge ? `${NUDGE} ${ALL_DETAIL}` : ALL_DETAIL,
    buttons: ['Cancel', 'Purge All'],
    defaultId: 0,
    cancelId: 0,
    checkboxLabel: 'Yes, wipe every service',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/purge-rules.test.ts`

Expected: PASS — 9 tests.

- [ ] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`

Expected: both clean.

- [ ] **Step 6: Commit**

Stage `src/main/lib/purge-rules.ts` and `tests/unit/purge-rules.test.ts`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `feat(purge): add dialog copy helpers`.

---

## Task 2: `ActivityLog.clear`

Recents rows are conversation titles from the session about to be wiped; a ⌘K row would deep-link into a thread that now resolves to a login page. In-memory only, so there is nothing to scrub from disk.

**Files:**

- Modify: `src/main/lib/activity-log.ts` (add a method to the `ActivityLog` class, after `append`)
- Test: `tests/unit/activity-log.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `clear(id?: ServiceId): void` on `ActivityLog` — no argument clears every entry; an argument clears only that service's.

- [ ] **Step 1: Write the failing test**

Append to the existing `describe('ActivityLog', ...)` block in `tests/unit/activity-log.test.ts`. The file already defines an `entry(n, over)` helper at the top — reuse it, do not redefine it.

```ts
  it('clears one service without touching the others', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'telegram' }));
    log.append(entry(2, { serviceId: 'messenger' }));
    log.append(entry(3, { serviceId: 'telegram' }));

    log.clear('telegram');

    const rows = log.recent();
    expect(rows).toHaveLength(1);
    expect(rows[0].serviceId).toBe('messenger');
  });

  it('clears every entry when given no service', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'telegram' }));
    log.append(entry(2, { serviceId: 'messenger' }));

    log.clear();

    expect(log.recent()).toHaveLength(0);
  });

  // ids are opaque handles the switcher holds across a purge; a cleared
  // entry must resolve to undefined rather than to a recycled row
  it('never reissues a cleared id', () => {
    const log = new ActivityLog();
    log.append(entry(1));
    log.clear();
    log.append(entry(2));

    expect(log.get(1)).toBeUndefined();
    expect(log.get(2)?.title).toBe('chat 2');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/activity-log.test.ts`

Expected: FAIL — `log.clear is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/main/lib/activity-log.ts`, insert directly after the `append` method:

```ts
  /** Drop one service's history, or all of it. A purge wipes the session
   *  these titles came from, so leaving them would deep-link ⌘K rows into
   *  threads that now resolve to a login page. `nextId` keeps counting, so a
   *  switcher row held across a clear resolves to undefined, never to a
   *  recycled entry. */
  clear(id?: ServiceId): void {
    this.entries = id ? this.entries.filter((e) => e.serviceId !== id) : [];
  }
```

`ServiceId` is already imported at the top of the file — do not add a second import.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/activity-log.test.ts`

Expected: PASS — the pre-existing tests plus the 3 new ones.

- [ ] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`

Expected: both clean.

- [ ] **Step 6: Commit**

Stage `src/main/lib/activity-log.ts` and `tests/unit/activity-log.test.ts`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `feat(activity): add ActivityLog.clear`.

---

## Task 3: The `--danger` token

`--badge` (`#ff4d5e`) means *unread* — reusing it would make a destructive button read as a message count. `--accent-2` (`#c92a2a` / `#f04e3e`) is referenced nowhere in the renderer but its dark value `#F04E3E` is the hard-coded end stop of the hero's summon gradient, so repurposing it would make that gradient read as a warning. Red gets its own token.

**Files:**

- Modify: `src/renderer/src/tokens.css`

**Interfaces:**

- Consumes: nothing.
- Produces: the Tailwind colour utilities `text-danger`, `border-danger`, `bg-danger` (and opacity variants like `border-danger/60`, `bg-danger/10`) for Tasks 6, 7 and 8.

- [ ] **Step 1: Add the light value**

In the `:root` block, add `--danger` immediately after the `--badge` line so the two reds sit together:

```css
  --badge: #ff4d5e;
  --danger: #d1293d;
```

- [ ] **Step 2: Add the dark value**

In the `:root[data-theme="dark"]` block, add the dark override as the last declaration (after `--on-accent`):

```css
  --on-accent: #15181f;
  --danger: #ff5a6a;
```

`--badge` is deliberately *not* overridden for dark — `--danger` is, because it is used as text and border colour where the light red goes muddy on a dark ground.

- [ ] **Step 3: Expose it to Tailwind**

In the `@theme inline` block, add the mapping after `--color-badge`:

```css
  --color-badge: var(--badge);
  --color-danger: var(--danger);
```

- [ ] **Step 4: Verify both themes resolve**

Run: `corepack pnpm lint && corepack pnpm build`

Expected: both clean. Then confirm the custom property landed in the built CSS:

Run: `grep -c "danger" out/renderer/assets/*.css`

Expected: a non-zero count. Tailwind v4 only emits a utility that is actually used, so `text-danger` itself will not appear until Task 6 — the custom property will.

- [ ] **Step 5: Commit**

Stage `src/renderer/src/tokens.css`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `feat(tokens): add --danger for destructive controls`.

---

## Task 4: IPC channels and the invoke gate

The rename and the new invoke channel land together with their sender-policy tests, because a channel that can wipe a partition must never exist without its classification test.

**Files:**

- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc-handlers.ts` — the `registerInvoke` wrapper (~line 88-99) and the `service:signOut` registration (~line 170)
- Test: `tests/unit/ipc-sender-policy.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `'service:purgeLogin': { serviceId: ServiceId }` in `RendererToMain`, in `R2M_CHANNELS`, in `SHELL_ONLY_CHANNELS`
  - `'services:purgeAll': { result: { purged: number } }` in `RendererInvoke`, in `INVOKE_CHANNELS`, in `SHELL_ONLY_CHANNELS`
  - `registerInvoke` accepting an async handler

- [ ] **Step 1: Write the failing test**

In `tests/unit/ipc-sender-policy.test.ts`, replace the two existing sign-out tests (`allows sign-out from the shell frame` and `rejects sign-out from a service frame — even for its own id`) with these four:

```ts
  it('allows a login purge from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:purgeLogin',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: 'telegram',
      }),
    ).toBe(true);
  });
  it('rejects a login purge from a service frame — even for its own id', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:purgeLogin',
        fromShell: false,
        senderServiceId: 'telegram',
        payloadServiceId: 'telegram',
      }),
    ).toBe(false);
  });
  it('allows the purge-all sweep from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'services:purgeAll',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
  });
  // the sweep carries no serviceId to validate, so shell-only is the ONLY
  // thing standing between a service page and every partition on disk
  it('rejects the purge-all sweep from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'services:purgeAll',
        fromShell: false,
        senderServiceId: 'telegram',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/ipc-sender-policy.test.ts`

Expected: FAIL — the `channel` values are not assignable to `keyof RendererToMain | keyof RendererInvoke`, so vitest reports a transform/type error rather than an assertion failure.

- [ ] **Step 3: Rename the channel in `src/shared/ipc.ts`**

Three edits. In `RendererToMain`, replace the sign-out entry:

```ts
  /** Settings → Services row: wipe the service's login on this device */
  'service:purgeLogin': { serviceId: ServiceId };
```

In `R2M_CHANNELS`, replace `'service:signOut',` with `'service:purgeLogin',`.

In `SHELL_ONLY_CHANNELS`, replace `'service:signOut',` with `'service:purgeLogin',`.

- [ ] **Step 4: Add the invoke channel in `src/shared/ipc.ts`**

In `RendererInvoke`, add after the `activity:recent` entry:

```ts
  /** Home's sweep: wipes every service's login, summoned and unbound.
   *  Returns the count so the renderer can toast it — invoke rather than
   *  send because the confirm is modal and the wipes are async, and a
   *  one-shot acknowledgement has no business in every later broadcast. */
  'services:purgeAll': { result: { purged: number } };
```

In `INVOKE_CHANNELS`, add `'services:purgeAll',` after `'activity:recent',`.

In `SHELL_ONLY_CHANNELS`, add `'services:purgeAll',` after `'activity:recent',`.

- [ ] **Step 5: Widen `registerInvoke` in `src/main/ipc-handlers.ts`**

The current wrapper types the handler as synchronous, so an async purge cannot be registered through the gate at all — and registering outside the gate is not an option. Replace the whole `registerInvoke` function:

```ts
/** invoke twin of register(): same gate, so a round-trip channel cannot be
 *  added without one. `blocked` is what a rejected sender receives — always
 *  synchronous, so a refusal never awaits. */
function registerInvoke(ctx: AppContext) {
  return <C extends keyof RendererInvoke>(
    channel: C,
    blocked: RendererInvoke[C]['result'],
    fn: () => RendererInvoke[C]['result'] | Promise<RendererInvoke[C]['result']>,
  ): void => {
    ipcMain.handle(channel, (e) => (senderAllowed(ctx, channel, e.sender.id) ? fn() : blocked));
  };
}
```

`ipcMain.handle` already awaits a returned promise, so the body is unchanged.

- [ ] **Step 6: Point the existing handler at the renamed channel**

In `registerIpcHandlers`, change the `on('service:signOut', …)` line to:

```ts
  on('service:purgeLogin', ({ serviceId }) => void confirmSignOut(ctx, serviceId));
```

Leave the `confirmSignOut` import alone — Task 5 replaces the module. This step only has to compile.

- [ ] **Step 7: Run tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/ipc-sender-policy.test.ts && corepack pnpm typecheck`

Expected: PASS on all sender-policy tests (the four above plus the pre-existing ones), and a clean typecheck.

- [ ] **Step 8: Confirm nothing else still sends the old channel**

Run: `grep -rn "service:signOut" src/ tests/`

Expected: **one** hit only — `src/renderer/src/components/SettingsView.tsx`, which Task 6 rewrites. If grep finds anything else, fix it now.

- [ ] **Step 9: Commit**

Stage `src/shared/ipc.ts`, `src/main/ipc-handlers.ts`, `tests/unit/ipc-sender-policy.test.ts`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `refactor(ipc): rename service:signOut to service:purgeLogin, add purgeAll`.

The renderer still sends the old name at this point, so the Settings button is temporarily inert. Task 6 closes that. Do not run `e2e` until then.

---

## Task 5: `src/main/purge.ts`

The shared wipe unit plus both entry points. `loadServiceUrl` is already a no-op when a service has no view, which is exactly what lets one unit serve live, hibernated and unbound services alike.

**Files:**

- Create: `src/main/purge.ts`
- Delete: `src/main/signout.ts`
- Modify: `src/main/ipc-handlers.ts` — the `confirmSignOut` import (~line 17), the `service:purgeLogin` handler (~line 170), and one new `onInvoke` registration beside the `activity:recent` one (~line 225)

**Interfaces:**

- Consumes: `purgeLoginDialog`, `purgeAllDialog` (Task 1); `ActivityLog.clear(id?)` (Task 2); `'services:purgeAll'` (Task 4).
- Produces:
  - `export async function purgeService(ctx: AppContext, id: ServiceId): Promise<void>`
  - `export async function confirmPurgeLogin(ctx: AppContext, id: ServiceId): Promise<void>`
  - `export async function confirmPurgeAll(ctx: AppContext): Promise<{ purged: number }>`

- [ ] **Step 1: Create the module**

Create `src/main/purge.ts`:

```ts
import { dialog, session } from 'electron';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { purgeAllDialog, purgeLoginDialog } from './lib/purge-rules';

/** Local wipe only: clears the persist:<id> partition on this device and
 *  lands the view on the login page. The server session is NOT revoked —
 *  it lingers in the service's own devices list until it expires there.
 *  Never touches `disabled` or `order`: purge is about logins, banish is
 *  about the rail, and the two stay orthogonal in both directions. */
export async function purgeService(ctx: AppContext, id: ServiceId): Promise<void> {
  // before the wipe, and unconditionally: the dialog promises the call ends,
  // and a call window runs in this very partition
  ctx.views.closeCallWindows(id);
  await session.fromPartition(`persist:${id}`).clearStorageData();
  // a no-op when the service has no view, which is what makes this one unit
  // serve live, hibernated and unbound services alike
  ctx.views.loadServiceUrl(id);
  // a live view re-reports zero from its login page on its own, but a
  // hibernated one would keep showing a badge for mail it can no longer open
  ctx.state.setRuntime(id, { unread: { direct: 0, indirect: 0 }, stale: false });
  ctx.activity.clear(id);
}

export async function confirmPurgeLogin(ctx: AppContext, id: ServiceId): Promise<void> {
  const copy = purgeLoginDialog(serviceById(id).name);
  const { response } = await dialog.showMessageBox(ctx.win, { type: 'warning', ...copy });
  if (response !== 1) return;
  await purgeService(ctx, id);
  ctx.broadcast();
}

/** Home's sweep. Native dialogs cannot gate a button on a checkbox —
 *  `checkboxChecked` only comes back with the button press — so an unticked
 *  confirm re-asks once with a nudge, then gives up. */
export async function confirmPurgeAll(ctx: AppContext): Promise<{ purged: number }> {
  const ids = ctx.settings.get().order;
  for (const nudge of [false, true]) {
    const copy = purgeAllDialog(ids.length, nudge);
    const { response, checkboxChecked } = await dialog.showMessageBox(ctx.win, {
      type: 'warning',
      ...copy,
    });
    if (response !== 1) return { purged: 0 };
    if (!checkboxChecked) continue;
    for (const id of ids) await purgeService(ctx, id);
    ctx.broadcast();
    return { purged: ids.length };
  }
  return { purged: 0 };
}
```

- [ ] **Step 2: Rewire `src/main/ipc-handlers.ts`**

Replace the `confirmSignOut` import:

```ts
import { confirmPurgeAll, confirmPurgeLogin } from './purge';
```

Replace the handler line:

```ts
  on('service:purgeLogin', ({ serviceId }) => void confirmPurgeLogin(ctx, serviceId));
```

Add the invoke registration immediately after the `activity:recent` line:

```ts
  onInvoke('activity:recent', [], () => ctx.activity.recent());
  onInvoke('services:purgeAll', { purged: 0 }, () => confirmPurgeAll(ctx));
```

- [ ] **Step 3: Delete the old module**

Run: `git rm src/main/signout.ts`

- [ ] **Step 4: Verify nothing references it**

Run: `grep -rn "signout\|signOut\|confirmSignOut" src/ tests/ --include="*.ts" --include="*.tsx"`

Expected: **one** hit only — `service:signOut` in `SettingsView.tsx`, which Task 6 rewrites. Anything else is a miss to fix now.

- [ ] **Step 5: Typecheck and run the full unit suite**

Run: `corepack pnpm typecheck && corepack pnpm test`

Expected: typecheck clean; every unit test passes.

- [ ] **Step 6: Lint**

Run: `corepack pnpm lint`

Expected: clean. If Biome flags the `await` inside `for (const id of ids)`, keep the loop sequential — ten partition wipes racing on one disk is not worth the parallelism — and suppress it with a one-line `// biome-ignore` naming that reason.

- [ ] **Step 7: Commit**

Stage `src/main/purge.ts`, the deletion of `src/main/signout.ts`, and `src/main/ipc-handlers.ts`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `feat(purge): add the shared wipe unit and the purge-all sweep`.

---

## Task 6: The red Settings button

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx` — the sign-out `<button>` in the Services pane (~lines 357-367)
- Modify: `tests/e2e/banish.spec.ts` — the label assertion (~line 45)

**Interfaces:**

- Consumes: `--color-danger` (Task 3); `'service:purgeLogin'` (Task 4); `confirmPurgeLogin` (Task 5).
- Produces: `data-testid="purge-<id>"` on each row's button, for the e2e assertion.

- [ ] **Step 1: Update the e2e assertion first**

In `tests/e2e/banish.spec.ts`, replace the sign-out assertion and its comment:

```ts
  // the per-service login purge lives here: one button per enabled service
  await expect(pane.getByRole('button', { name: 'Purge login…' })).toHaveCount(2);
```

The launch profile enables messenger + zalo only, hence 2.

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- banish.spec.ts`

Expected: FAIL — the button is still labelled `Sign out…`, so the locator resolves 0.

If the run errors before reaching the assertion with an `ELECTRON_RUN_AS_NODE` complaint, the `env -u` prefix was dropped — VS Code shells export that variable.

- [ ] **Step 3: Rewrite the button**

Replace the `<button>` element in the Services pane with:

```tsx
                        <button
                          type="button"
                          data-testid={`purge-${svc.id}`}
                          title="Clears this service's saved login on this device. Your account stays active — nothing is signed out elsewhere."
                          onClick={() =>
                            window.goetia.send('service:purgeLogin', { serviceId: svc.id })
                          }
                          className="rounded-ctl border border-danger/60 bg-bg-2 px-2.5 py-1 text-danger transition-colors duration-120 hover:border-danger hover:bg-danger/10"
                        >
                          Purge login…
                        </button>
```

Two things that must not drift: the label's `…` is a single U+2026 character, and the `title` is the exact Global Constraints string — it carries the caveat that justifies the whole rename.

- [ ] **Step 4: Run the e2e to verify it passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- banish.spec.ts`

Expected: PASS.

- [ ] **Step 5: Confirm the old name is gone from the tree**

Run: `grep -rni "signout\|sign out\|sign-out" src/ tests/`

Expected: **no output.** This is the point at which the rename is complete in code.

- [ ] **Step 6: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`

Expected: both clean.

- [ ] **Step 7: Commit**

Stage `src/renderer/src/components/SettingsView.tsx` and `tests/e2e/banish.spec.ts`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `feat(settings): purge login button, in danger red`.

---

## Task 7: The completion toast

Driven by renderer-local store state, following the existing `homeDirty` / `homeDiscardTick` precedent for a signal that crosses components without ever leaving the renderer. Bottom-**centre**, because `UpdateToast` owns bottom-right and `CapTrimToast` owns bottom-left and the two can overlap in principle — a startup cap-trim toast lives 8s, long enough for a click on the Home it opened onto.

**Files:**

- Modify: `src/renderer/src/components/toast-rules.ts`
- Test: `tests/unit/toast-rules.test.ts`
- Modify: `src/renderer/src/store.ts`
- Create: `src/renderer/src/components/PurgeToast.tsx`
- Modify: `src/renderer/src/App.tsx` — the toast mounts inside the `relative flex min-h-0 min-w-0 flex-1` div

**Interfaces:**

- Consumes: `TOAST_MS` (already exported from `toast-rules.ts`); `--color-danger` (Task 3).
- Produces:
  - `export function purgeToastMessage(count: number): string | null`
  - `purgeToast: string | null` and `setPurgeToast(message: string | null): void` on `useShell`
  - default-exported `PurgeToast` component, `data-testid="purge-toast"`

- [ ] **Step 1: Write the failing test**

In `tests/unit/toast-rules.test.ts`, add `purgeToastMessage` to the existing import list, then append:

```ts
describe('purgeToastMessage', () => {
  it('pluralizes the count', () => {
    expect(purgeToastMessage(1)).toBe('Purged 1 login.');
    expect(purgeToastMessage(10)).toBe('Purged 10 logins.');
  });

  // a cancelled sweep returns { purged: 0 } — the same shape a rejected
  // sender gets — and must show nothing at all
  it('says nothing when the sweep was cancelled', () => {
    expect(purgeToastMessage(0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/toast-rules.test.ts`

Expected: FAIL — `purgeToastMessage is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `src/renderer/src/components/toast-rules.ts`:

```ts
/** Acknowledges a completed purge sweep. Null at zero: a cancelled sweep
 *  returns the same { purged: 0 } a rejected sender would, and neither
 *  deserves a toast. */
export function purgeToastMessage(count: number): string | null {
  if (count === 0) return null;
  return `Purged ${count} ${count === 1 ? 'login' : 'logins'}.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/toast-rules.test.ts`

Expected: PASS.

- [ ] **Step 5: Add the store slice**

In `src/renderer/src/store.ts`, add to the `ShellStore` interface after the `homeDiscardTick` / `discardHomeDraft` pair:

```ts
  /** the purge sweep's one-shot acknowledgement — set by Welcome from the
   *  invoke result, rendered by PurgeToast. Renderer-local on purpose: a
   *  one-shot event has no business in every later ShellState broadcast. */
  purgeToast: string | null;
  setPurgeToast(message: string | null): void;
```

And to the `create<ShellStore>` body after `discardHomeDraft`:

```ts
  purgeToast: null,
  setPurgeToast: (purgeToast) => set({ purgeToast }),
```

- [ ] **Step 6: Create the toast component**

Create `src/renderer/src/components/PurgeToast.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useShell } from '../store';
import { TOAST_MS } from './toast-rules';

/** Acknowledges a completed purge sweep, then leaves. Same machinery as
 *  CapTrimToast — timer dismissal, hovering banks the remainder — but driven
 *  by the store rather than ShellState, because the trigger is an invoke
 *  result. Sits bottom-centre: UpdateToast owns bottom-right, CapTrimToast
 *  bottom-left, and a startup cap-trim toast can still be on screen when the
 *  user clicks purge on the Home it opened onto. */
export default function PurgeToast() {
  const message = useShell((s) => s.purgeToast);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);

  useEffect(() => {
    if (message) remaining.current = TOAST_MS;
  }, [message]);

  useEffect(() => {
    if (!message || paused) return;
    const startedAt = Date.now();
    const id = setTimeout(() => useShell.getState().setPurgeToast(null), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [message, paused]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center"
    >
      {message && (
        <button
          type="button"
          data-testid="purge-toast"
          onClick={() => useShell.getState().setPurgeToast(null)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-start gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          <span className="h-7 w-7 flex-none rounded-tile bg-danger/20" />
          <span className="min-w-0 text-text-1">{message}</span>
          <span
            aria-hidden="true"
            style={{
              animationDuration: `${TOAST_MS}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
            className="toast-drain absolute inset-x-0 bottom-0 h-0.5 bg-danger"
          />
        </button>
      )}
    </div>
  );
}
```

The drain bar is `bg-danger` rather than the ember gradient the other two toasts use — this toast reports a destructive action, and the gradient is the summon signature.

- [ ] **Step 7: Mount it**

In `src/renderer/src/App.tsx`, add the import beside the other toast imports:

```tsx
import PurgeToast from './components/PurgeToast';
```

and mount it after `CapTrimToast`:

```tsx
        <UpdateToast />
        <CapTrimToast />
        <PurgeToast />
```

- [ ] **Step 8: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all clean. The toast has no trigger yet — Task 8 wires it.

- [ ] **Step 9: Commit**

Stage `toast-rules.ts`, `tests/unit/toast-rules.test.ts`, `store.ts`, `PurgeToast.tsx`, `App.tsx`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `feat(home): add the purge completion toast`.

---

## Task 8: The Home hero sweep link

The link sits at the bottom of the hero column, below the mnemonic block and behind a hairline rule — as far from the Summon CTA as the column allows, and unfilled so it cannot compete with it.

**Files:**

- Modify: `src/renderer/src/components/welcome/HomeHero.tsx`
- Modify: `src/renderer/src/components/Welcome.tsx` — the handler block beside `summon`/`discard`, and the `HomeHero` call site
- Modify: `tests/e2e/home.spec.ts`

**Interfaces:**

- Consumes: `--color-danger` (Task 3); `'services:purgeAll'` (Task 4); `confirmPurgeAll` (Task 5); `purgeToastMessage` and `setPurgeToast` (Task 7).
- Produces: `data-testid="purge-all-btn"`.

- [ ] **Step 1: Write the failing e2e**

Append to `tests/e2e/home.spec.ts`:

```ts
test('home: the hero offers a purge sweep, painted danger red', async () => {
  const { app, win } = await launch();
  await win.locator('[data-testid="home-btn"]').click();

  const purge = win.locator('[data-testid="purge-all-btn"]');
  await expect(purge).toBeVisible();
  await expect(purge).toHaveText('Purge all logins…');

  // it must not read as brand orange — a destructive control is red
  const token = await win.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--danger').trim(),
  );
  expect(token).not.toBe('');
  const [r, g, b] = await purge.evaluate((el) => {
    const m = getComputedStyle(el).color.match(/\d+/g) ?? [];
    return m.slice(0, 3).map(Number);
  });
  expect(r).toBeGreaterThan(g + 40);
  expect(r).toBeGreaterThan(b + 40);

  await app.close();
});
```

The colour check compares channels rather than matching a hex, so it holds in both themes without duplicating the token values into the test.

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- home.spec.ts`

Expected: FAIL — `purge-all-btn` never becomes visible.

- [ ] **Step 3: Add the prop and the link to `HomeHero`**

Add `onPurgeAll(): void;` to the `Props` interface after `onDiscard(): void;`, and add `onPurgeAll` to the destructured parameter list.

Then insert this block immediately after the closing `</p>` of the mnemonic paragraph and before the closing `</aside>`:

```tsx
      <div className="relative w-full border-t border-border pt-2">
        <button
          type="button"
          data-testid="purge-all-btn"
          title="Clears every saved login on this device — summoned and unbound. Your accounts stay active; nothing is signed out elsewhere."
          onClick={onPurgeAll}
          className="w-full text-center text-[11px] text-danger transition-opacity duration-120 hover:underline hover:opacity-90"
        >
          Purge all logins…
        </button>
      </div>
```

The mnemonic `<p>` already carries `mt-auto`, which pushes both it and this block to the bottom of the column.

- [ ] **Step 4: Wire the handler in `Welcome.tsx`**

Add this after `const discard = () => setStaged(liveSummoned);`:

```tsx
  // main owns the confirm, so the renderer only awaits the count. Zero means
  // cancelled (or a rejected sender) and toasts nothing.
  const purgeAll = async () => {
    const { purged } = await window.goetia.invoke('services:purgeAll');
    useShell.getState().setPurgeToast(purgeToastMessage(purged));
  };
```

Add the import:

```tsx
import { purgeToastMessage } from './toast-rules';
```

and pass the handler at the `HomeHero` call site, after `onDiscard={discard}`:

```tsx
        onPurgeAll={() => void purgeAll()}
```

`useShell` is already imported in `Welcome.tsx` — do not add a second import.

- [ ] **Step 5: Run the e2e to verify it passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- home.spec.ts`

Expected: PASS on the new test and on the pre-existing home tests.

- [ ] **Step 6: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all four green.

- [ ] **Step 7: Manual verification**

Native dialogs are not Playwright-drivable, so the confirm-and-wipe path only exists as a manual check. Run `corepack pnpm dev`, walk every line, and record the result — do not report this task done on the automated gate alone.

1. Open Home (`⌘⇧H`) → the red `Purge all logins…` link sits at the bottom of the hero, below the hairline rule.
2. Click it → dialog reads `Purge all N logins?` with the checkbox unticked and **Cancel** focused.
3. Click `Purge All` without ticking → the dialog re-opens with `Tick the box below to confirm.` leading the detail.
4. Click `Purge All` again without ticking → the dialog closes, **no toast**, nothing wiped.
5. Click the link, tick the box, click `Purge All` → every service lands on its login page, the bottom-centre toast reads `Purged N logins.` and drains over 8s; hovering it pauses the drain.
6. Confirm the board is untouched: same services in Summoned, same order, nothing moved to Unbound.
7. Confirm `⌘K` shows no Recent rows.
8. Purge a single service from Settings → Services and confirm only that service's badge and recents clear.
9. Start a call, then purge that service — the call window closes.
10. Switch the theme (Settings → General) and confirm both red controls stay legible in light and dark.

- [ ] **Step 8: Commit**

Stage `HomeHero.tsx`, `Welcome.tsx`, `tests/e2e/home.spec.ts`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `feat(home): add the purge-all sweep to the hero`.

---

## Task 9: Docs

Both existing doc lines describe sign-out as living on the tile right-click menu, which has been stale since the 2026-08-24 tile-menu change moved it into Settings. Fix that while renaming.

**Files:**

- Modify: `README.md` — the **Shortcuts** bullet (~line 171)
- Modify: `docs/FEATURES.md` — the **Mute / Sign Out** bullet (~line 36)
- Modify: `CLAUDE.md` — the "Product principle: chat ONLY" section

**Interfaces:**

- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Update `README.md`**

In the **Shortcuts** bullet, replace `right-click an icon to mute it or sign out (sign-out clears the login on this device only)` with:

```text
right-click an icon to mute or banish it
```

Then add a new bullet to the same list, after the Shortcuts one:

```markdown
- **Purging a login**: Settings → Services → `Purge login…` clears one service's saved login on this device; Home's `Purge all logins…` clears every service's, summoned and unbound alike — the only way to reach a banished service's credentials. Neither revokes the session on the service's own servers: the site keeps listing this device until the token expires there. Purging never changes which services are summoned, and banishing never touches a login.
```

- [ ] **Step 2: Update `docs/FEATURES.md`**

Find this opening fragment of the bullet:

```markdown
**Mute / Sign Out** per-service (right-click a tile opens a native menu; sign-out clears the `persist:<id>` partition locally after a confirm)
```

Replace it with:

```markdown
**Mute / Purge** per-service (right-click a tile to mute or banish; Settings → Services → `Purge login…` clears the `persist:<id>` partition locally after a confirm, and Home's `Purge all logins…` sweeps every service including unbound ones behind an acknowledgement checkbox — impl `src/main/purge.ts`, copy in `lib/purge-rules.ts`, verified by `purge-rules.test.ts`)
```

Leave the rest of that bullet — the mute/badge/`setGlobalMuted` prose — exactly as it is.

- [ ] **Step 3: Add the invariant to `CLAUDE.md`**

In the "Product principle: chat ONLY" section, add this bullet after the "Enabling and disabling services lives on Home" bullet:

```markdown
- **Purge and banish are orthogonal axes.** Banish clears the rail and keeps the login; purge (`src/main/purge.ts`) clears the login and never touches `disabled` or `order`. Home's `Purge all logins…` sweeps every service in `order`, summoned and unbound — it is the **only** path to an unbound service's credentials, since Settings → Services lists enabled services only, so narrowing the sweep to enabled services would silently strand them. Its confirm re-asks once when the acknowledgement checkbox is unticked, because a native `showMessageBox` cannot gate a button on `checkboxChecked`. The completion count rides the `services:purgeAll` invoke return, never `ShellState`.
```

- [ ] **Step 4: Lint the markdown**

Run: `npx markdownlint-cli2 README.md docs/FEATURES.md CLAUDE.md`

Expected: `Summary: 0 issues`. Never hard-wrap prose — MD013 is off in this repo and one line per bullet is the house rule.

- [ ] **Step 5: Final full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all four green.

- [ ] **Step 6: Commit**

Stage `README.md`, `docs/FEATURES.md`, `CLAUDE.md`, then **stop and ask the user to run `/grimoire-core:commit`.** Suggested subject: `docs(purge): rename sign-out, document the sweep`.
