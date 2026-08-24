# Sign-Out in Settings, Tile Banish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Sign Out… from the rail tile's right-click menu into Settings → Services as a per-service button, and put a quick no-confirm Banish item in its tile-menu slot.

**Architecture:** A new shell-only `service:signOut` IPC channel routes the Settings button to the unchanged main-side `confirmSignOut` (native confirm + partition wipe). The tile menu template swaps Sign Out… for `Banish ${name}`, which calls the existing `ctx.banishServices([id])` one-patch disable tail from the auto-banish feature.

**Tech Stack:** Electron + TypeScript, React renderer, vitest unit tests, Playwright e2e.

Spec: `docs/superpowers/specs/2026-08-24-signout-settings-and-tile-banish-design.md`.

## Global Constraints

- **Never run `git commit` (or write `GRIMOIRE_COMMIT_MSG.txt`).** At every commit step, stop and ask the user to run `/grimoire-core:commit`, suggesting a message. This is the user's global rule and overrides the workflow's commit habit.
- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` all green (VS Code shells export `ELECTRON_RUN_AS_NODE`; e2e breaks without unsetting it).
- Every IPC channel is registered through the `register()` wrapper and classified: `service:signOut` is **shell-only** — a service page must never be able to trigger a partition wipe, its own included.
- `confirmSignOut` (`src/main/signout.ts`) stays byte-identical: native confirm with Cancel as default, call windows closed, `persist:<id>` cleared, view reloaded to the chat URL.
- Tile banish gets **no confirm dialog** — it is quick and fully recoverable (login kept; re-summon on Home). Sign-out keeps its confirm.
- Any edited `.md` must pass `npx markdownlint-cli2 <file>`; never hard-wrap prose.

---

### Task 1: `service:signOut` shell-only channel

**Files:**

- Modify: `src/shared/ipc.ts` (`RendererToMain`, `R2M_CHANNELS`, `SHELL_ONLY_CHANNELS`)
- Modify: `src/main/ipc-handlers.ts` (one `on(...)` registration in `registerIpcHandlers`)
- Test: `tests/unit/ipc-sender-policy.test.ts`

**Interfaces:**

- Consumes: `confirmSignOut(ctx, id)` from `src/main/signout.ts` (already imported in `ipc-handlers.ts` for the tile menu).
- Produces: `'service:signOut': { serviceId: ServiceId }` on `RendererToMain`, sendable from the shell preload (which gates on `R2M_CHANNELS`). Task 3's button sends it.

- [x] **Step 1: Write the failing tests**

In `tests/unit/ipc-sender-policy.test.ts`, insert after the `rejects the tile menu from a service frame` test:

```ts
  it('allows sign-out from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:signOut',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: 'telegram',
      }),
    ).toBe(true);
  });
  it('rejects sign-out from a service frame — even for its own id', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:signOut',
        fromShell: false,
        senderServiceId: 'telegram',
        payloadServiceId: 'telegram',
      }),
    ).toBe(false);
  });
```

- [x] **Step 2: Run tests to verify the reject case fails**

Run: `corepack pnpm exec vitest run tests/unit/ipc-sender-policy.test.ts`
Expected: `rejects sign-out from a service frame — even for its own id` FAILS — before the channel joins `SHELL_ONLY_CHANNELS`, an unclassified channel with a matching `payloadServiceId` falls into the service-channel rule and is allowed. The allow case passes vacuously.

- [x] **Step 3: Register the channel in `src/shared/ipc.ts`**

In `RendererToMain`, after the `'service:tileMenu'` entry:

```ts
  /** Settings → Services row: wipe the service's login on this device */
  'service:signOut': { serviceId: ServiceId };
```

In `R2M_CHANNELS`, after `'service:tileMenu',`:

```ts
  'service:signOut',
```

In `SHELL_ONLY_CHANNELS`, after `'service:tileMenu',`:

```ts
  'service:signOut',
```

- [x] **Step 4: Register the handler in `src/main/ipc-handlers.ts`**

In `registerIpcHandlers`, directly after the `on('service:tileMenu', …)` block:

```ts
  on('service:signOut', ({ serviceId }) => void confirmSignOut(ctx, serviceId));
```

- [x] **Step 5: Run tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/ipc-sender-policy.test.ts && corepack pnpm typecheck`
Expected: PASS (all policy tests, including the two new ones), typecheck clean.

- [x] **Step 6: Commit gate**

Run `corepack pnpm lint` (expect clean), then stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(signout): shell-only service:signOut channel`). Do not run `git commit` yourself.

---

### Task 2: Tile menu — Mute/Unmute + Banish

**Files:**

- Modify: `src/main/ipc-handlers.ts` (the `service:tileMenu` handler)

**Interfaces:**

- Consumes: `ctx.banishServices(ids: ServiceId[])` (late-bound in `index.ts` by the auto-banish feature; one-patch disable through `applyDisabledChange`).
- Produces: the tile menu template — Mute/Unmute, separator, `Banish ${name}`. Sign Out… no longer appears anywhere in this handler.

The template is built inline with native `Menu.buildFromTemplate` (no unit test exists or is added); the existing unit suite proves the refactor breaks nothing, and banish-via-menu reuses the `banishServices` path already covered by the hibernation unit tests.

- [x] **Step 1: Swap the menu items**

Replace the `on('service:tileMenu', …)` block in `registerIpcHandlers` with:

```ts
  on('service:tileMenu', ({ serviceId }) => {
    const muted = ctx.settings.get().muted[serviceId];
    const name = serviceById(serviceId).name;
    Menu.buildFromTemplate([
      {
        label: muted ? `Unmute ${name}` : `Mute ${name}`,
        click: () => setServiceMuted(ctx, serviceId, !muted),
      },
      { type: 'separator' },
      // quick and recoverable (login kept, re-summon on Home) — no confirm
      { label: `Banish ${name}`, click: () => ctx.banishServices([serviceId]) },
    ]).popup({ window: ctx.win });
  });
```

The `confirmSignOut` import stays — Task 1's `service:signOut` handler uses it.

- [x] **Step 2: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all PASS.

- [x] **Step 3: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(rail): tile menu banishes instead of signing out`). Do not run `git commit` yourself.

---

### Task 3: Settings UI — Sign out… button + Shortcuts copy

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx` (Services pane per-service row; Shortcuts pane copy)

**Interfaces:**

- Consumes: `'service:signOut'` channel (Task 1) via `window.goetia.send`.
- Produces: `data-testid="signout-<id>"` buttons, one per enabled-service row (Task 4 asserts them by role/name).

- [x] **Step 1: Add the button to each Services row**

In the Services pane's `.map(...)`, inside the `<span className="flex items-center gap-4 text-text-2">`, after the closing `</label>` of the "never hibernate" checkbox, insert:

```tsx
                        <button
                          type="button"
                          data-testid={`signout-${svc.id}`}
                          title="Clears this service's login on this device"
                          onClick={() =>
                            window.goetia.send('service:signOut', { serviceId: svc.id })
                          }
                          className="rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
                        >
                          Sign out…
                        </button>
```

- [x] **Step 2: Update the Shortcuts pane copy**

In the Shortcuts pane, change:

```tsx
                  <p className="py-1">Right-click a tile — mute/unmute service</p>
```

to:

```tsx
                  <p className="py-1">Right-click a tile — mute or banish service</p>
```

- [x] **Step 3: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all PASS (no unit test renders SettingsView; Task 4's e2e covers it).

- [x] **Step 4: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(settings): per-service sign-out button in Services`). Do not run `git commit` yourself.

---

### Task 4: E2E assertions + full verification

**Files:**

- Modify: `tests/e2e/banish.spec.ts` (the `sleep settings live in Services…` test)

**Interfaces:**

- Consumes: the Sign out… buttons (Task 3); existing test ids `settings`, `settings-nav-services`.
- Produces: nothing downstream.

Native menus and native dialogs are not Playwright-drivable, so the sign-out click-through and the tile-menu banish stay manual checks; the e2e proves the buttons render where the spec says.

- [x] **Step 1: Assert the buttons in the Services pane test**

In `tests/e2e/banish.spec.ts`, in the `sleep settings live in Services; the hours input follows the toggle` test, after the `light-sleep-enabled` visibility assertion, insert:

```ts
  // sign-out moved here from the tile menu: one button per enabled service
  await expect(pane.getByRole('button', { name: 'Sign out…' })).toHaveCount(2);
```

- [x] **Step 2: Run the spec**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm exec playwright test tests/e2e/banish.spec.ts`
Expected: 2 PASS.

- [x] **Step 3: Full verification**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all green — the project's definition of done.

- [x] **Step 4: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested message: `test(signout): assert Services-pane sign-out buttons`). Do not run `git commit` yourself.
