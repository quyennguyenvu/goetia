# Guard Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app lock's single `appLock.guardActions` switch with four — summon, purge, download history, passkeys — so a user can turn one guard off and keep the rest.

**Architecture:** `shared/types.ts` gains `GUARD_GROUPS` and `appLock.guard: Record<GuardGroup, boolean>`; `shared/lock.ts` gains `guardGroupOf(action)` and `guardOn(appLock, configured, group)`, the one rule main's `authorized()` and the four renderer ask-sites read. `fillAppLock` migrates a legacy `guardActions` boolean into all four groups at boot. `lock:configure { action: 'setGuard', group, on }` replaces `setGuardActions`, validated in `LockController` and persisted by a merge in `index.ts`. Settings → Lock renders four checkbox rows under one heading, behind the pane's passcode gate as today.

**Tech Stack:** TypeScript, Electron, React, Vitest, Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-25-guard-groups-design.md`.

## Global Constraints

- Gates after every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`. Task 3 and Task 4 also run `corepack pnpm build` then `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/guarded-actions.spec.ts tests/e2e/lock.spec.ts tests/e2e/downloads.spec.ts --reporter=line` (the e2e needs `ELECTRON_RUN_AS_NODE` unset; a spec that fails in a loaded run is rerun alone before it counts).
- No commits from the plan; the user commits through `/commit`. Never stage, commit or remove files through git from a task.
- `src/shared/**` imports nothing from `electron` or the DOM. The renderer imports nothing from `src/main`.
- Names, exactly: `GUARD_GROUPS = ['summon', 'purge', 'downloads', 'passkeys'] as const`, `GuardGroup`, `GuardSettings`, `isGuardGroup`, `guardGroupOf`, `guardOn`; the setting `appLock.guard`; the configure action `setGuard` with fields `current`, `group`, `on`; the new `LockConfigResult.error` value `'invalid'`; the Diagnostics line `configured: guard <group> on` / `off`.
- Test ids, exactly: the block `lock-guard-rows`, each checkbox `lock-guard-<group>`. The old `lock-guard-row` and `lock-guard-toggle` are removed.
- Copy, verbatim (Settings → Lock). Heading: `Ask for your credential before…`. Its hint: `This asks even while Goetia is unlocked, and Touch ID counts here. It does not guard services already on your rail.` Rows: `Summoning a banished service` / `A banished service keeps its login; bringing it back reveals its conversations.`; `Purging a login` / `Signs you out of that service and cannot be undone.`; `Removing download history` / `Erases the record of what was downloaded. Undo still covers the next few seconds.`; `Forgetting a passkey` / `Removes a sign-in credential from this Mac.` Status line after a change: `Asking before <label, lower case>.` or `No longer asking before <label, lower case>.`
- Defaults: all four groups `true`. A legacy `guardActions: true` migrates to all four on, `false` to all four off.
- `guardActions` must not survive anywhere: after Task 2, `grep -rn guardActions src tests` returns nothing.
- Comments explain why, not what; match the surrounding density.

---

### Task 1: Guard groups and the shared rule

**Files:**

- Modify: `src/shared/types.ts` (add `GUARD_GROUPS`, `GuardGroup`, `GuardSettings` directly above the `Settings` interface; nothing else changes yet)
- Modify: `src/shared/lock.ts` (add `isGuardGroup`, `guardGroupOf`, `guardOn` after `describeAction`)
- Test: `tests/unit/guard-policy.test.ts`

**Interfaces:**

- Consumes: `GuardedAction` from `src/shared/lock.ts`.
- Produces: `GUARD_GROUPS`, `type GuardGroup`, `type GuardSettings` (in `src/shared/types.ts`); `isGuardGroup(v: unknown): v is GuardGroup`, `guardGroupOf(action: GuardedAction): GuardGroup`, `guardOn(appLock: { guard: GuardSettings }, configured: boolean, group: GuardGroup): boolean` (in `src/shared/lock.ts`). Every later task uses these names.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/guard-policy.test.ts`, and extend its imports:

```ts
import { GUARD_GROUPS, guardGroupOf, guardOn, isGuardGroup } from '../../src/shared/lock';
```

```ts
describe('guardGroupOf', () => {
  it('places every kind in its group', () => {
    expect(guardGroupOf({ kind: 'summon' })).toBe('summon');
    expect(guardGroupOf({ kind: 'purge-one', serviceId: 'slack' })).toBe('purge');
    expect(guardGroupOf({ kind: 'purge-all' })).toBe('purge');
    expect(guardGroupOf({ kind: 'downloads-remove', ids: [1] })).toBe('downloads');
    expect(guardGroupOf({ kind: 'downloads-clear' })).toBe('downloads');
    expect(guardGroupOf({ kind: 'passkey-forget', id: 'abc' })).toBe('passkeys');
  });
});

describe('guardOn', () => {
  const all = { guard: { summon: true, purge: true, downloads: true, passkeys: true } };

  it('asks only when a passcode exists and the group is on', () => {
    expect(guardOn(all, true, 'purge')).toBe(true);
    // no credential to ask for: the guard is absent, and the UI says so rather
    // than degrading into something weaker
    expect(guardOn(all, false, 'purge')).toBe(false);
  });

  it('one group off leaves the other three guarded', () => {
    const noDownloads = { guard: { ...all.guard, downloads: false } };
    expect(guardOn(noDownloads, true, 'downloads')).toBe(false);
    for (const g of ['summon', 'purge', 'passkeys'] as const) {
      expect(guardOn(noDownloads, true, g)).toBe(true);
    }
  });
});

describe('isGuardGroup', () => {
  it('admits the four groups and nothing else', () => {
    for (const g of GUARD_GROUPS) expect(isGuardGroup(g)).toBe(true);
    expect(isGuardGroup('all')).toBe(false);
    expect(isGuardGroup('__proto__')).toBe(false);
    expect(isGuardGroup(1)).toBe(false);
    expect(isGuardGroup(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/guard-policy.test.ts`
Expected: FAIL — `guardGroupOf`, `guardOn`, `isGuardGroup`, `GUARD_GROUPS` are not exported.

- [ ] **Step 3: Add the groups to `src/shared/types.ts`**

Directly above `export interface Settings {`:

```ts
/** The concerns the action guard is switched by, in the Lock pane's order.
 *  Defined here rather than in lock.ts because appLock.guard is a Settings
 *  field and lock.ts already imports from this file. */
export const GUARD_GROUPS = ['summon', 'purge', 'downloads', 'passkeys'] as const;
export type GuardGroup = (typeof GUARD_GROUPS)[number];

/** One switch per group — `appLock.guard`. */
export type GuardSettings = Record<GuardGroup, boolean>;
```

- [ ] **Step 4: Add the rule to `src/shared/lock.ts`**

Change the import at the top to:

```ts
import { GUARD_GROUPS, type GuardGroup, type GuardSettings, type ServiceId } from './types';
```

Append after `describeAction`:

```ts
export { GUARD_GROUPS, type GuardGroup, type GuardSettings };

export function isGuardGroup(v: unknown): v is GuardGroup {
  return typeof v === 'string' && (GUARD_GROUPS as readonly string[]).includes(v);
}

/** Which switch an action answers to. Exhaustive: a new kind fails typecheck
 *  until it is placed. */
export function guardGroupOf(action: GuardedAction): GuardGroup {
  switch (action.kind) {
    case 'summon':
      return 'summon';
    case 'purge-one':
    case 'purge-all':
      return 'purge';
    case 'downloads-remove':
    case 'downloads-clear':
      return 'downloads';
    case 'passkey-forget':
      return 'passkeys';
  }
}

/** Whether a group asks right now — the one rule main's authorized() and the
 *  renderer's ask-sites read. The setting alone is not enough: with no
 *  passcode stored there is nothing to ask for. */
export function guardOn(
  appLock: { guard: GuardSettings },
  configured: boolean,
  group: GuardGroup,
): boolean {
  return configured && appLock.guard[group];
}
```

The re-export line lets every consumer import the groups and the rule from one module, as the spec reads; the definitions stay in `types.ts` to avoid an import cycle.

- [ ] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/guard-policy.test.ts`
Expected: PASS, all describes including the untouched `actionGuarded` block.

- [ ] **Step 6: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green. Nothing consumes the new code yet. If biome objects to the `switch` in `guardGroupOf` having no `default`, keep it exhaustive — never add a fallback group — and satisfy the rule with a `never` check:

```ts
    default: {
      const unreachable: never = action;
      return unreachable;
    }
```

---

### Task 2: Replace the boolean with the record, end to end

The atomic slice: the setting's shape, its migration, the configure action, main's enforcement and every renderer ask-site. Typecheck is red between the steps and green at the end of the task; there is no smaller cut that compiles, because one `tsconfig.json` covers `src` and `tests`.

**Files:**

- Modify: `src/shared/types.ts` (the `appLock` field, its doc comment, `DEFAULT_SETTINGS.appLock`)
- Modify: `src/shared/lock.ts` (`LockConfigure`, `LockConfigResult`)
- Modify: `src/main/settings.ts` (`fillAppLock`, new `fillGuard`)
- Modify: `src/main/lock.ts` (`LockDeps.persist`, the `configure` tail)
- Modify: `src/main/index.ts` (the `persist` closure handed to `LockController`)
- Modify: `src/main/ipc-handlers.ts` (`authorized`, imports)
- Modify: `src/main/lib/guard-policy.ts` (remove `actionGuarded`)
- Modify: `src/renderer/src/components/LockPane.tsx` (the guard block)
- Modify: `src/renderer/src/components/Welcome.tsx` (`summon`)
- Modify: `src/renderer/src/components/PurgeConfirm.tsx` (`guarded`)
- Modify: `src/renderer/src/components/SettingsView.tsx` (the `guarded` prop)
- Modify: `src/renderer/src/components/PasskeysPane.tsx` (`guarded`)
- Test: `tests/unit/settings.test.ts`, `tests/unit/lock-controller.test.ts`, `tests/unit/settings-backup.test.ts`, `tests/unit/guard-policy.test.ts`

**Interfaces:**

- Consumes: `GUARD_GROUPS`, `GuardGroup`, `GuardSettings`, `isGuardGroup`, `guardGroupOf`, `guardOn` from Task 1.
- Produces: `Settings['appLock'] = { enabled: boolean; touchId: boolean; guard: GuardSettings }`; `LockConfigure` member `{ action: 'setGuard'; current: string; group: GuardGroup; on: boolean }`; `LockConfigResult.error` value `'invalid'`; `LockDeps.persist(patch: { enabled?: boolean; touchId?: boolean; guard?: Partial<GuardSettings> })`; the Diagnostics line `configured: guard <group> on|off`; test ids `lock-guard-rows`, `lock-guard-<group>`. Task 3 drives the ids and the persisted shape.

- [ ] **Step 1: Write the failing settings tests**

In `tests/unit/settings.test.ts`, replace the six lock tests that start at `it('defaults the lock off with Touch ID armed for when it is turned on'` and end with `it('fills a settings.json written before the lock existed'` (inclusive) with:

```ts
  const ALL_ON = { summon: true, purge: true, downloads: true, passkeys: true };

  it('defaults the lock off with Touch ID armed and every guard group on', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    expect(new SettingsStore(dir).get().appLock).toEqual({
      enabled: false,
      touchId: true,
      guard: ALL_ON,
    });
  });

  it('coerces a guard block field by field and drops what it does not know', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        appLock: { enabled: true, touchId: true, guard: { downloads: false, purge: 'no', x: false } },
      }),
    );
    // a non-boolean falls back to the default rather than coercing truthy
    expect(new SettingsStore(dir).get().appLock.guard).toEqual({ ...ALL_ON, downloads: false });
  });

  // every install from before the groups holds one boolean, and nearly all
  // hold `true`: a migration that lost it would drop every guard silently
  it('seeds all four groups from a legacy guardActions: true', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ appLock: { enabled: true, touchId: true, guardActions: true } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.appLock.guard).toEqual(ALL_ON);
    expect('guardActions' in s.appLock).toBe(false);
  });

  it('keeps every group off when a legacy guardActions: false turned the guard off', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ appLock: { enabled: true, touchId: true, guardActions: false } }),
    );
    expect(new SettingsStore(dir).get().appLock.guard).toEqual({
      summon: false,
      purge: false,
      downloads: false,
      passkeys: false,
    });
  });

  it('coerces a hand-mangled appLock block field by field', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ appLock: { enabled: 'yes', touchId: false } }),
    );
    // a non-boolean falls back to the default rather than coercing truthy: a
    // corrupt file must never silently switch the lock on or off
    expect(new SettingsStore(dir).get().appLock).toEqual({
      enabled: false,
      touchId: false,
      guard: ALL_ON,
    });
  });

  it('fills a settings.json written before the lock existed', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ globalMuted: true }));
    const s = new SettingsStore(dir).get();
    expect(s.appLock).toEqual({ enabled: false, touchId: true, guard: ALL_ON });
    expect(s.globalMuted).toBe(true);
  });
```

- [ ] **Step 2: Write the failing controller tests**

In `tests/unit/lock-controller.test.ts`, extend the imports:

```ts
import type { GuardGroup, GuardSettings } from '../../src/shared/types';
```

In `build()`, change the `settings` line to:

```ts
  const settings: { enabled: boolean; touchId: boolean; guard?: Partial<GuardSettings> } = {
    enabled: opts.enabled ?? true,
    touchId: opts.touchId ?? true,
  };
```

In `it('records every configuration and a refused one'`, replace the `setGuardActions` call with:

```ts
    await controller.configure({
      action: 'setGuard',
      current: 'correct horse',
      group: 'purge',
      on: false,
    });
```

and the expected line `'configured: guard off'` with `'configured: guard purge off'`.

Add a new test after it, inside the same `describe`:

```ts
  it('setGuard persists one group and refuses a stranger', async () => {
    const { controller, settings, notes } = await armed();
    const ok = await controller.configure({
      action: 'setGuard',
      current: 'correct horse',
      group: 'downloads',
      on: false,
    });
    expect(ok).toEqual({ ok: true });
    expect(settings.guard).toEqual({ downloads: false });
    expect(notes.at(-1)).toBe('configured: guard downloads off');

    // the group name is renderer data: a record with a fixed shape must stay
    // that shape, whatever the shell's console sends
    const stranger = await controller.configure({
      action: 'setGuard',
      current: 'correct horse',
      group: 'all' as unknown as GuardGroup,
      on: false,
    });
    expect(stranger).toEqual({ ok: false, error: 'invalid' });
    const notBoolean = await controller.configure({
      action: 'setGuard',
      current: 'correct horse',
      group: 'purge',
      on: 'yes' as unknown as boolean,
    });
    expect(notBoolean).toEqual({ ok: false, error: 'invalid' });
    expect(settings.guard).toEqual({ downloads: false });
  });
```

- [ ] **Step 3: Update the backup fixture and drop the old policy test**

In `tests/unit/settings-backup.test.ts`, change the fixture line to:

```ts
  appLock: { enabled: true, touchId: false, guard: { ...DEFAULT_SETTINGS.appLock.guard, downloads: false } },
```

In `tests/unit/guard-policy.test.ts`, delete the whole `describe('actionGuarded', …)` block and remove `actionGuarded` from the `guard-policy` import.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts tests/unit/lock-controller.test.ts tests/unit/settings-backup.test.ts tests/unit/guard-policy.test.ts`
Expected: FAIL — `guard` is undefined on `appLock`, `setGuard` is not handled, and the backup fixture does not compile against the old shape.

- [ ] **Step 5: The setting's shape and default**

In `src/shared/types.ts`, replace the `appLock` field and its doc comment:

```ts
  /** Require Touch ID or a passcode before Goetia can be read. The secret
   *  itself lives in lock.json — never here, because ShellState broadcasts
   *  this whole object to the renderer. `touchId` is separately switchable
   *  because Touch ID accepts any finger enrolled on the Mac, which on a
   *  shared machine is exactly the person the lock is aimed at. `guard`
   *  extends the same credential to four groups of actions an unlocked Goetia
   *  would otherwise do for anyone, one switch each — `guardGroupOf` in
   *  shared/lock.ts places an action; see the 2026-09-25 spec. */
  appLock: { enabled: boolean; touchId: boolean; guard: GuardSettings };
```

In `DEFAULT_SETTINGS`:

```ts
  appLock: {
    enabled: false,
    touchId: true,
    guard: { summon: true, purge: true, downloads: true, passkeys: true },
  },
```

- [ ] **Step 6: The migration in `src/main/settings.ts`**

Extend the existing `import … from '../shared/types'` with `GUARD_GROUPS`, `type GuardGroup` and `type GuardSettings`. Replace `fillAppLock`:

```ts
/** summonHotkey-style field-by-field coercion for the lock block. A
 *  non-boolean falls back to the default rather than coercing truthy: a
 *  corrupt file must not decide whether the app is locked. */
function fillAppLock(raw: unknown): Settings['appLock'] {
  const d = DEFAULT_SETTINGS.appLock;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings['appLock']> & {
    guardActions?: unknown;
  };
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    touchId: typeof r.touchId === 'boolean' ? r.touchId : d.touchId,
    guard: fillGuard(r.guard, r.guardActions),
  };
}

/** The four switches, field by field. A settings.json from before the groups
 *  holds one `guardActions` boolean: it seeds all four, so an install that
 *  never touched the switch keeps every guard it had. */
function fillGuard(raw: unknown, legacy: unknown): GuardSettings {
  const d = DEFAULT_SETTINGS.appLock.guard;
  if (raw && typeof raw === 'object') {
    const r = raw as Partial<Record<GuardGroup, unknown>>;
    const out = { ...d };
    for (const g of GUARD_GROUPS) {
      if (typeof r[g] === 'boolean') out[g] = r[g] as boolean;
    }
    return out;
  }
  if (typeof legacy === 'boolean') {
    return { summon: legacy, purge: legacy, downloads: legacy, passkeys: legacy };
  }
  return { ...d };
}
```

- [ ] **Step 7: The configure action**

In `src/shared/lock.ts`, replace the last `LockConfigure` member and `LockConfigResult`:

```ts
  | { action: 'setTouchId'; current: string; touchId: boolean }
  /** One group's switch. `group` is renderer data: main checks it against
   *  GUARD_GROUPS before the record is touched. */
  | { action: 'setGuard'; current: string; group: GuardGroup; on: boolean };

export interface LockConfigResult {
  ok: boolean;
  /** `invalid`: a setGuard naming no group, or a non-boolean `on` */
  error?: 'wrong' | 'too-short' | 'already-set' | 'not-set' | 'invalid';
}
```

In `src/main/lock.ts`, add `isGuardGroup` to the `'../shared/lock'` import, change the types import to `import type { GuardSettings, ServiceId } from '../shared/types';`, change `LockDeps.persist` to:

```ts
  persist(patch: { enabled?: boolean; touchId?: boolean; guard?: Partial<GuardSettings> }): void;
```

and replace the three lines after the `setTouchId` branch at the end of `configure` with:

```ts
    if (!isGuardGroup(req.group) || typeof req.on !== 'boolean') {
      return { ok: false, error: 'invalid' };
    }
    this.deps.persist({ guard: { [req.group]: req.on } });
    this.deps.note?.(`configured: guard ${req.group} ${req.on ? 'on' : 'off'}`);
    return { ok: true };
```

In `src/main/index.ts`, replace the `persist` closure handed to `new LockController(...)`:

```ts
      persist: (patch) => {
        const current = settings.get().appLock;
        // a partial guard merges into the record; spread over it, one group's
        // switch would drop the other three
        settings.update({
          appLock: { ...current, ...patch, guard: { ...current.guard, ...patch.guard } },
        });
      },
```

- [ ] **Step 8: Enforcement in main**

In `src/main/ipc-handlers.ts`, change line 15 to:

```ts
import { describeAction, type GuardedAction, guardGroupOf, guardOn } from '../shared/lock';
```

remove `actionGuarded,` from the `'./lib/guard-policy'` import block, and replace the head of `authorized`:

```ts
function authorized(ctx: AppContext, action: GuardedAction): boolean {
  const guarded = guardOn(
    ctx.settings.get().appLock,
    ctx.lock.configured(),
    guardGroupOf(action),
  );
  if (!guarded) return true;
```

The rest of the function is unchanged. In `src/main/lib/guard-policy.ts`, delete `actionGuarded` and its doc comment; `Settings` stays imported for `stripAppLock`.

- [ ] **Step 9: The four ask-sites**

`src/renderer/src/components/Welcome.tsx` — add `import { guardOn } from '../../../shared/lock';` and change the line inside `summon`:

```ts
    const guarded = guardOn(state.settings.appLock, state.lockConfigured, 'summon');
```

`src/renderer/src/components/PurgeConfirm.tsx` — add `import { guardOn } from '../../../shared/lock';`, replace the two selectors `guardActions` and `lockConfigured` with:

```ts
  // main is the enforcer; this only decides when to ask
  const guarded = useShell((s) =>
    s.state ? guardOn(s.state.settings.appLock, s.state.lockConfigured, 'purge') : false,
  );
```

and delete the two lines `// main is the enforcer; this only decides when to ask` and `const guarded = guardActions && lockConfigured;` further down.

`src/renderer/src/components/SettingsView.tsx` — add `import { guardOn } from '../../../shared/lock';` and change the prop:

```tsx
                  guarded={guardOn(s.appLock, state.lockConfigured, 'downloads')}
```

`src/renderer/src/components/PasskeysPane.tsx` — add `import { guardOn } from '../../../shared/lock';` and replace the `guarded` selector:

```ts
  // main enforces; this only decides when to ask — the PurgeConfirm line
  const guarded = useShell((s) =>
    s.state ? guardOn(s.state.settings.appLock, s.state.lockConfigured, 'passkeys') : false,
  );
```

- [ ] **Step 10: The Lock pane block**

In `src/renderer/src/components/LockPane.tsx`, change the imports:

```ts
import { type LockConfigure, PASSCODE_MIN_LENGTH } from '../../../shared/lock';
import { DEFAULT_SETTINGS, GUARD_GROUPS, type GuardGroup } from '../../../shared/types';
```

Add above `const errorText`:

```ts
/** Settings → Lock's guard rows, in GUARD_GROUPS order. The label doubles as
 *  the status line's object ("Asking before purging a login."). */
const GUARD_ROWS: Record<GuardGroup, { label: string; hint: string }> = {
  summon: {
    label: 'Summoning a banished service',
    hint: 'A banished service keeps its login; bringing it back reveals its conversations.',
  },
  purge: {
    label: 'Purging a login',
    hint: 'Signs you out of that service and cannot be undone.',
  },
  downloads: {
    label: 'Removing download history',
    hint: 'Erases the record of what was downloaded. Undo still covers the next few seconds.',
  },
  passkeys: {
    label: 'Forgetting a passkey',
    hint: 'Removes a sign-in credential from this Mac.',
  },
};
```

Replace the `guardActions` selector:

```ts
  const guard = useShell((s) => s.state?.settings.appLock.guard ?? DEFAULT_SETTINGS.appLock.guard);
```

Replace the whole `<div … data-testid="lock-guard-row">…</div>` block (between the Touch ID row and the Change passcode row) with:

```tsx
          <div className="flex flex-col border-b border-border py-2" data-testid="lock-guard-rows">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-text-1">Ask for your credential before…</span>
              <span className="text-[11px] text-text-2">
                This asks even while Goetia is unlocked, and Touch ID counts here. It does not
                guard services already on your rail.
              </span>
            </span>
            {GUARD_GROUPS.map((group) => (
              <label
                key={group}
                className="flex items-center justify-between gap-4 py-1.5"
                data-testid={`lock-guard-${group}-row`}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-text-1">{GUARD_ROWS[group].label}</span>
                  <span className="text-[11px] text-text-2">{GUARD_ROWS[group].hint}</span>
                </span>
                <input
                  type="checkbox"
                  checked={guard[group]}
                  data-testid={`lock-guard-${group}`}
                  disabled={busy}
                  onChange={(e) =>
                    change(
                      { action: 'setGuard', current: verified, group, on: e.target.checked },
                      `${e.target.checked ? 'Asking' : 'No longer asking'} before ${GUARD_ROWS[group].label.toLowerCase()}.`,
                    )
                  }
                />
              </label>
            ))}
          </div>
```

`errorText` needs no change: an `invalid` result falls through to "That did not work.".

- [ ] **Step 11: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts tests/unit/lock-controller.test.ts tests/unit/settings-backup.test.ts tests/unit/guard-policy.test.ts tests/unit/lock-consent.test.ts`
Expected: PASS.

- [ ] **Step 12: Confirm nothing still names the old key**

Run: `grep -rn "guardActions\|actionGuarded\|setGuardActions\|lock-guard-toggle\|lock-guard-row\"" src tests`
Expected: no output from `src` or `tests/unit`. The three e2e seeds (`tests/e2e/lock.spec.ts`, `guarded-actions.spec.ts`, `downloads.spec.ts`) still say `guardActions` and are Task 3's.

- [ ] **Step 13: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green.

---

### Task 3: End-to-end — seeds, the bypass assertion, and one group off

**Files:**

- Modify: `tests/e2e/guarded-actions.spec.ts` (seed shape, a seeded download row, one new test)
- Modify: `tests/e2e/lock.spec.ts` (the console-bypass test's patch and assertion)
- Modify: `tests/e2e/downloads.spec.ts` (seed shape)

**Interfaces:**

- Consumes: test ids `lock-guard-downloads`, `lock-guard-purge`, `lock-status`, `lock-current-passcode`, `lock-unlock`, `lock-unlocked` (Task 2 and the existing pane); `download-row`, `download-select`, `downloads-remove`, `downloads-undo`, `credential-confirm`, `purge-zalo`, `purge-confirm`, `purge-confirm-btn` (existing); the persisted `appLock.guard` shape from Task 2; a plaintext `downloads.json` of the shape `{ downloads: DownloadRecord[] }`, which `DownloadHistoryStore` reads and re-seals at boot.
- Produces: nothing later tasks use.

- [ ] **Step 1: Move the three seeds to the new shape**

In `tests/e2e/guarded-actions.spec.ts` and `tests/e2e/downloads.spec.ts`, replace the seed line:

```ts
      appLock: { enabled: false, touchId: false, guardActions: true },
```

with:

```ts
      appLock: {
        enabled: false,
        touchId: false,
        guard: { summon: true, purge: true, downloads: true, passkeys: true },
      },
```

In `tests/e2e/lock.spec.ts`, in the test `settings:update cannot switch the lock off — lock:configure is its only writer`, replace the sent patch:

```ts
      { appLock: { enabled: false, touchId: false, guardActions: false } },
```

with:

```ts
      {
        appLock: {
          enabled: false,
          touchId: false,
          guard: { summon: false, purge: false, downloads: false, passkeys: false },
        },
      },
```

and the assertion:

```ts
  expect(JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).appLock).toMatchObject({
    enabled: true,
    guard: { summon: true, purge: true, downloads: true, passkeys: true },
  });
```

- [ ] **Step 2: Seed a download row for the new case**

In `tests/e2e/guarded-actions.spec.ts`, change the `node:fs` import to `import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';` and add to `makeProfile()` after the `settings.json` write, before `return profile;`:

```ts
  // one ended row for the Downloads pane; the file itself never existed, so
  // the row reads `missing` — still an ended row with a checkbox
  writeFileSync(
    join(profile, 'downloads.json'),
    JSON.stringify({
      downloads: [
        {
          id: 1,
          serviceId: 'zalo',
          filename: 'note.txt',
          path: join(profile, 'note.txt'),
          state: 'saved',
          received: 17,
          total: 17,
          at: Date.now(),
        },
      ],
    }),
  );
```

- [ ] **Step 3: Write the new case**

Add a helper after `armLock`:

```ts
/** The pane relocks whenever it unmounts, so every visit passes the gate. */
async function openLockPane(win: Page) {
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-current-passcode').fill(PASSCODE);
  await win.getByTestId('lock-unlock').click();
  await expect(win.getByTestId('lock-unlocked')).toBeVisible();
}
```

Append the test:

```ts
test('a group switched off stops asking; the others still do; on again asks again', async () => {
  const profile = makeProfile();
  const { app, win } = await launch(profile);
  await armLock(win);

  await win.getByTestId('settings-btn').click();
  await openLockPane(win);
  await expect(win.getByTestId('lock-guard-rows')).toBeVisible();
  // click, not uncheck(): change() sets `busy` before the scrypt round trip
  // lands, so React re-renders the controlled box to its old prop value and
  // Playwright's immediate post-click assertion would see it still checked
  await win.getByTestId('lock-guard-downloads').click();
  await expect(win.getByTestId('lock-guard-downloads')).not.toBeChecked();
  await expect(win.getByTestId('lock-status')).toHaveText(
    'No longer asking before removing download history.',
  );
  await expect(win.getByTestId('lock-guard-purge')).toBeChecked();

  // the downloads group is off: Remove acts at once, with Undo and no card
  await win.getByTestId('settings-nav-downloads').click();
  const rows = win.getByTestId('download-row');
  await expect(rows).toHaveCount(1);
  await rows.first().getByTestId('download-select').check();
  await win.getByTestId('downloads-remove').click();
  await expect(win.getByTestId('credential-confirm')).toHaveCount(0);
  await expect(rows).toHaveCount(0);
  await expect(win.getByTestId('downloads-undo')).toContainText('1 file removed');
  await win.getByTestId('downloads-undo').getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(1);

  // the purge group is still on: the confirm stays dead without the credential
  await win.getByTestId('settings-nav-services').click();
  await win.getByTestId('purge-zalo').click();
  await expect(win.getByTestId('purge-confirm')).toBeVisible();
  await expect(win.getByTestId('purge-confirm-btn')).toBeDisabled();
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('purge-confirm')).toHaveCount(0);

  // back on: Remove asks again
  await openLockPane(win);
  await win.getByTestId('lock-guard-downloads').click();
  await expect(win.getByTestId('lock-guard-downloads')).toBeChecked();
  await expect(win.getByTestId('lock-status')).toHaveText(
    'Asking before removing download history.',
  );
  await win.getByTestId('settings-nav-downloads').click();
  await rows.first().getByTestId('download-select').check();
  await win.getByTestId('downloads-remove').click();
  await expect(win.getByTestId('credential-confirm')).toBeVisible();
  await expect(rows).toHaveCount(1);

  // both switches are in the ring, and the record on disk has the new shape only
  await win.keyboard.press('Escape');
  await win.getByTestId('settings-nav-diagnostics').click();
  const diag = win.getByTestId('diag-row');
  await expect(diag.filter({ hasText: '[lock] configured: guard downloads off' })).toHaveCount(1);
  await expect(diag.filter({ hasText: '[lock] configured: guard downloads on' })).toHaveCount(1);
  await app.close();

  const appLock = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).appLock;
  expect(appLock.guard).toEqual({ summon: true, purge: true, downloads: true, passkeys: true });
  expect('guardActions' in appLock).toBe(false);
});
```

- [ ] **Step 4: Build and run the three specs**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/guarded-actions.spec.ts tests/e2e/lock.spec.ts tests/e2e/downloads.spec.ts --reporter=line`
Expected: every test passes, including the four in `guarded-actions.spec.ts`. If the new case fails on the Escape that dismisses the credential card leaving Settings open, check the Diagnostics rows through `settings-btn` again; the card captures Escape so Settings should still be open.

- [ ] **Step 5: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green.

---

### Task 4: Documentation and the final pass

**Files:**

- Modify: `CLAUDE.md` (the Security bullet beginning `**Guarded actions are recorded, and \`settings:update\` never writes \`appLock\`**`)
- Modify: `docs/superpowers/specs/2026-09-25-guard-groups-design.md` (status line)

**Interfaces:** none.

- [ ] **Step 1: CLAUDE.md**

In the bullet named above, replace the sentence `Enforcement lives in main; the renderer only decides when to ask (\`guardActions && lockConfigured\`).` with:

```markdown
**The guard is four switches, not one** (2026-09-25, user decision; spec `docs/superpowers/specs/2026-09-25-guard-groups-design.md`): `appLock.guard` holds one boolean per `GuardGroup` — `summon`, `purge` (both purges), `downloads` (remove and clear), `passkeys` — all on by default, a legacy `guardActions` boolean seeding all four at boot (`fillAppLock`), and `guardGroupOf` / `guardOn` in `shared/lock.ts` are the one rule main's `authorized()` and the four renderer ask-sites read; never read `appLock.guard[...]` directly at an ask-site. Each switch is a `lock:configure { action: 'setGuard' }` behind the Lock pane's passcode gate, validated against `GUARD_GROUPS` in `LockController`, and noted `configured: guard <group> on|off`. Enforcement lives in main; the renderer only decides when to ask.
```

Run: `npx markdownlint-cli2 CLAUDE.md`
Expected: `Summary: 0 issues`.

- [ ] **Step 2: Spec status**

In `docs/superpowers/specs/2026-09-25-guard-groups-design.md`, change `Status: approved in brainstorm (user decision, same day); not implemented.` to `Status: implemented 2026-09-25 (plan \`docs/superpowers/plans/2026-09-25-guard-groups.md\`).`

Run: `npx markdownlint-cli2 docs/superpowers/specs/2026-09-25-guard-groups-design.md docs/superpowers/plans/2026-09-25-guard-groups.md`
Expected: `Summary: 0 issues`.

- [ ] **Step 3: Final gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/guarded-actions.spec.ts tests/e2e/lock.spec.ts tests/e2e/downloads.spec.ts --reporter=line`
Expected: all green.

- [ ] **Step 4: Live look**

Run: `corepack pnpm dev`, open Settings → Lock, set a passcode, pass the gate, and confirm: four rows under the heading, unticking one shows its status line, and re-opening the pane shows the switch as left. Then stop and tell the user the branch is ready for `/commit`.
