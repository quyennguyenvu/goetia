# Summon Hotkey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A system-wide shortcut (curated combos, default `Alt+CmdOrCtrl+G`, off by default) shows or hides Goetia from any app, with failed registrations surfaced in Settings.

**Architecture:** Combo list + label formatter in `src/shared/summon.ts`; a `SummonHotkey` register/unregister wrapper in `src/main/summon-hotkey.ts`; press behavior and re-apply hook wired in `index.ts`; status on `MainState.summonHotkeyOk` riding the existing broadcast. Spec: `docs/superpowers/specs/2026-08-16-summon-hotkey-design.md`.

**Tech Stack:** TypeScript, Electron `globalShortcut`, vitest, Playwright, React.

## Global Constraints

- **Never run `git commit`.** Commits happen only when the user runs `/grimoire-core:commit`; stop and ask at each task's end (batched to the run's end under auto-run).
- All scripts through corepack; e2e/dev need `env -u ELECTRON_RUN_AS_NODE`.
- After writing each source file, run `npx biome check --write <paths>` before the lint gate.
- The accelerator persisted in settings must always be one of `SUMMON_COMBOS`; `normalize()` enforces it.
- No new IPC channel; the setting rides shell-only `settings:update`, status rides `shell:state`.
- The registration is torn down in `dispose()` from the existing `before-quit` block.
- Markdown edits pass `npx markdownlint-cli2 <file>`; prose never hard-wrapped.

---

### Task 1: Shared combo list and label formatter

**Files:**

- Create: `src/shared/summon.ts`
- Test: `tests/unit/summon.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `SUMMON_COMBOS: readonly string[]` (as const tuple) and `comboLabel(accelerator: string, isMac: boolean): string` — Tasks 2 (normalize) and 4 (settings UI) import both.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/summon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { comboLabel, SUMMON_COMBOS } from '../../src/shared/summon';

describe('SUMMON_COMBOS', () => {
  it('has no duplicates', () => {
    expect(new Set(SUMMON_COMBOS).size).toBe(SUMMON_COMBOS.length);
  });
});

describe('comboLabel', () => {
  it('renders macOS glyphs in ⌃⌥⇧⌘ order', () => {
    expect(comboLabel('Alt+CmdOrCtrl+G', true)).toBe('⌥⌘G');
    expect(comboLabel('Ctrl+Shift+Space', true)).toBe('⌃⇧Space');
  });

  it('renders Windows names in Ctrl+Alt+Shift order', () => {
    expect(comboLabel('Alt+CmdOrCtrl+G', false)).toBe('Ctrl+Alt+G');
    expect(comboLabel('Ctrl+Shift+Space', false)).toBe('Ctrl+Shift+Space');
  });

  it('labels every curated combo on both platforms', () => {
    for (const combo of SUMMON_COMBOS) {
      expect(comboLabel(combo, true)).toBeTruthy();
      expect(comboLabel(combo, false)).toMatch(/\+/);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm test tests/unit/summon.test.ts`

Expected: FAIL — cannot resolve `../../src/shared/summon`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/summon.ts` (shared: no `electron`, no DOM):

```ts
/** Curated system-wide accelerators — combos apps rarely claim locally, so a
 *  global registration doesn't shadow common in-app shortcuts. */
export const SUMMON_COMBOS = [
  'Alt+CmdOrCtrl+G',
  'Alt+CmdOrCtrl+Space',
  'Ctrl+Shift+Space',
  'Ctrl+Shift+G',
] as const;

const MAC_GLYPHS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', CmdOrCtrl: '⌘' };
const MAC_ORDER = ['Ctrl', 'Alt', 'Shift', 'CmdOrCtrl'];
const WIN_NAMES: Record<string, string> = { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', CmdOrCtrl: 'Ctrl' };
const WIN_ORDER = ['CmdOrCtrl', 'Ctrl', 'Alt', 'Shift'];

/** '⌥⌘G' on macOS, 'Ctrl+Alt+G' elsewhere — each platform's conventional
 *  modifier order, key last. */
export function comboLabel(accelerator: string, isMac: boolean): string {
  const parts = accelerator.split('+');
  const mods = parts.filter((p) => p in MAC_GLYPHS);
  const keys = parts.filter((p) => !(p in MAC_GLYPHS));
  const order = isMac ? MAC_ORDER : WIN_ORDER;
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return isMac
    ? [...mods.map((m) => MAC_GLYPHS[m]), ...keys].join('')
    : [...mods.map((m) => WIN_NAMES[m]), ...keys].join('+');
}
```

- [ ] **Step 4: Run the gates**

Run: `npx biome check --write src/shared/summon.ts tests/unit/summon.test.ts`

Run: `corepack pnpm test tests/unit/summon.test.ts` — expected: 4 passed.

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint` — expected: all green.

- [ ] **Step 5: Stop for the user's commit** (batched under auto-run)

Suggested message: `feat(summon): add curated hotkey combos and labels`.

---

### Task 2: Settings field and normalization

**Files:**

- Modify: `src/shared/types.ts` (`Settings`, `DEFAULT_SETTINGS`)
- Modify: `src/main/settings.ts`
- Test: `tests/unit/settings.test.ts` (append)

**Interfaces:**

- Consumes: `SUMMON_COMBOS` from Task 1.
- Produces: `Settings.summonHotkey: { enabled: boolean; accelerator: string }`, always list-valid after `normalize()`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('SettingsStore', …)` in `tests/unit/settings.test.ts`:

```ts
  it('defaults the summon hotkey off with the stock combo', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    expect(new SettingsStore(dir).get().summonHotkey).toEqual({
      enabled: false,
      accelerator: 'Alt+CmdOrCtrl+G',
    });
  });

  it('coerces an off-list summon accelerator back to the default', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ summonHotkey: { enabled: true, accelerator: 'CmdOrCtrl+Q' } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.summonHotkey.enabled).toBe(true); // valid field survives
    expect(s.summonHotkey.accelerator).toBe('Alt+CmdOrCtrl+G');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm test tests/unit/settings.test.ts` — expected: the two new cases FAIL (`summonHotkey` undefined).

- [ ] **Step 3: Extend types and defaults**

In `src/shared/types.ts`, inside `interface Settings` after the `quietOverrideWindowStart` member add:

```ts
  /** system-wide show/hide shortcut; accelerator must be one of SUMMON_COMBOS */
  summonHotkey: { enabled: boolean; accelerator: string };
```

In `DEFAULT_SETTINGS`, after `quietOverrideWindowStart: null,` add:

```ts
  summonHotkey: { enabled: false, accelerator: 'Alt+CmdOrCtrl+G' },
```

- [ ] **Step 4: Extend `normalize()`**

In `src/main/settings.ts`, add the import:

```ts
import { SUMMON_COMBOS } from '../shared/summon';
```

Below `fillQuietHours` add:

```ts
function fillSummonHotkey(raw: unknown): Settings['summonHotkey'] {
  const d = DEFAULT_SETTINGS.summonHotkey;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings['summonHotkey']>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    accelerator:
      typeof r.accelerator === 'string' &&
      (SUMMON_COMBOS as readonly string[]).includes(r.accelerator)
        ? r.accelerator
        : d.accelerator,
  };
}
```

In `normalize()`'s returned `settings` object, after the `quietOverrideWindowStart` entry add:

```ts
      summonHotkey: fillSummonHotkey(raw.summonHotkey),
```

- [ ] **Step 5: Run the gates**

Run: `npx biome check --write src/shared/types.ts src/main/settings.ts tests/unit/settings.test.ts`

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint` — expected: all green.

- [ ] **Step 6: Stop for the user's commit** (batched under auto-run)

Suggested message: `feat(summon): persist hotkey setting with list-valid accelerator`.

---

### Task 3: Registration wiring in main

**Files:**

- Create: `src/main/summon-hotkey.ts`
- Modify: `src/shared/types.ts` (`ShellState.summonHotkeyOk`)
- Modify: `src/main/state.ts` (public field + snapshot entry)
- Modify: `src/main/ipc-handlers.ts` (`AppContext.summonHotkeyChanged` + handler hook)
- Modify: `src/main/index.ts` (handler, `applySummon`, dispose)
- Test: `tests/unit/state.test.ts` (append)

**Interfaces:**

- Consumes: Tasks 1–2.
- Produces: `ShellState.summonHotkeyOk: boolean` for Task 4's warning hint; `AppContext.summonHotkeyChanged(): void`.

- [ ] **Step 1: Write the failing state test**

Append inside `describe('MainState', …)` in `tests/unit/state.test.ts`:

```ts
  it('snapshot carries summonHotkeyOk, defaulting true', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).summonHotkeyOk).toBe(true);
    s.summonHotkeyOk = false;
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).summonHotkeyOk).toBe(false);
  });
```

Run: `corepack pnpm typecheck` — expected: FAIL (`summonHotkeyOk` unknown).

- [ ] **Step 2: State and type plumbing**

In `src/shared/types.ts`, inside `interface ShellState` after the `quietActive` member add:

```ts
  /** false while an enabled summon combo failed to register (owned elsewhere) */
  summonHotkeyOk: boolean;
```

In `src/main/state.ts`, after the `capTrimmed` field declaration add:

```ts
  /** set by the summon-hotkey wiring; true when disabled or registered */
  summonHotkeyOk = true;
```

and in `snapshot()`'s return, after `quietActive,` add:

```ts
      summonHotkeyOk: this.summonHotkeyOk,
```

- [ ] **Step 3: The register/unregister wrapper**

Create `src/main/summon-hotkey.ts`:

```ts
import { globalShortcut } from 'electron';

/** One registration at a time; apply() swaps it to match the setting and
 *  reports whether the OS granted the combo (off is never a failure). */
export class SummonHotkey {
  private registered: string | null = null;

  constructor(private onSummon: () => void) {}

  apply(setting: { enabled: boolean; accelerator: string }): boolean {
    if (this.registered) {
      globalShortcut.unregister(this.registered);
      this.registered = null;
    }
    if (!setting.enabled) return true;
    const ok = globalShortcut.register(setting.accelerator, this.onSummon);
    if (ok) this.registered = setting.accelerator;
    return ok;
  }

  dispose(): void {
    if (this.registered) {
      globalShortcut.unregister(this.registered);
      this.registered = null;
    }
  }
}
```

- [ ] **Step 4: `AppContext` hook and handler**

In `src/main/ipc-handlers.ts`, after the `quietScheduleChanged` member add:

```ts
  /** re-register the summon hotkey after a setting edit; late-bound in index.ts */
  summonHotkeyChanged(): void;
```

In the `settings:update` handler, after the `quietHours` line add:

```ts
    if ('summonHotkey' in patch) ctx.summonHotkeyChanged();
```

- [ ] **Step 5: Wire in `src/main/index.ts`**

Add the import (biome sorts):

```ts
import { SummonHotkey } from './summon-hotkey';
```

Directly after the `const quiet = new QuietHoursController({ … });` block insert:

```ts
    const summon = new SummonHotkey(() => {
      if (win.isDestroyed()) return;
      if (win.isFocused()) {
        // hiding a fullscreen window strands an empty desktop space
        if (!win.isFullScreen()) win.hide();
        return;
      }
      win.show();
      win.focus();
    });
    const applySummon = () => {
      state.summonHotkeyOk = summon.apply(settings.get().summonHotkey);
    };
```

In the `ctx` literal, after `quietScheduleChanged: …,` add:

```ts
      summonHotkeyChanged: () => {
        applySummon();
        broadcast();
      },
```

After the `quiet.start();` line add:

```ts
    applySummon();
```

In the `before-quit` handler, after `quiet.dispose();` add:

```ts
      summon.dispose();
```

- [ ] **Step 6: Run the gates**

Run: `npx biome check --write src/main src/shared tests/unit/state.test.ts`

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` — expected: all green.

- [ ] **Step 7: Stop for the user's commit** (batched under auto-run)

Suggested message: `feat(summon): register global show/hide hotkey`.

---

### Task 4: Settings UI

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx` (General pane rows + Shortcuts line)

**Interfaces:**

- Consumes: `SUMMON_COMBOS`, `comboLabel` (Task 1); `ShellState.summonHotkeyOk` (Task 3).
- Produces: test ids `summon-enabled`, `summon-combo` for Task 5.

- [ ] **Step 1: Imports and platform flag**

In `src/renderer/src/components/SettingsView.tsx`, add the import:

```ts
import { comboLabel, SUMMON_COMBOS } from '../../../shared/summon';
```

Below the `DAY_LABELS` const add:

```ts
const isMac = navigator.platform.startsWith('Mac');
```

- [ ] **Step 2: General pane rows**

After the "Hibernate idle services after (minutes)" `Row` in the General pane, add:

```tsx
                <Row
                  label="Summoning hotkey"
                  hint={
                    state.summonHotkeyOk
                      ? 'Show or hide Goetia from anywhere.'
                      : 'That combo is taken by another app — pick a different one.'
                  }
                >
                  <input
                    type="checkbox"
                    data-testid="summon-enabled"
                    checked={s.summonHotkey.enabled}
                    onChange={(e) =>
                      update({ summonHotkey: { ...s.summonHotkey, enabled: e.target.checked } })
                    }
                  />
                </Row>
                <Row label="Combo">
                  <select
                    data-testid="summon-combo"
                    disabled={!s.summonHotkey.enabled}
                    value={s.summonHotkey.accelerator}
                    onChange={(e) =>
                      update({ summonHotkey: { ...s.summonHotkey, accelerator: e.target.value } })
                    }
                    className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 disabled:opacity-40"
                  >
                    {SUMMON_COMBOS.map((c) => (
                      <option key={c} value={c}>
                        {comboLabel(c, isMac)}
                      </option>
                    ))}
                  </select>
                </Row>
```

- [ ] **Step 3: Shortcuts pane line**

In the Shortcuts pane, after the `⌘/Ctrl + ⇧ + M` line add:

```tsx
                  {s.summonHotkey.enabled && (
                    <p className="py-1">
                      {comboLabel(s.summonHotkey.accelerator, isMac)} (system-wide) — summon /
                      dismiss Goetia
                    </p>
                  )}
```

- [ ] **Step 4: Run the gates**

Run: `npx biome check --write src/renderer/src/components/SettingsView.tsx`

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` — expected: all green.

- [ ] **Step 5: Stop for the user's commit** (batched under auto-run)

Suggested message: `feat(summon): hotkey settings rows with taken-combo warning`.

---

### Task 5: E2E, README, manual pass

**Files:**

- Modify: `tests/e2e/restart.spec.ts` (persistence case)
- Modify: `README.md` (Shortcuts bullet clause)

**Interfaces:**

- Consumes: Task 4's test ids.
- Produces: nothing — verification and documentation.

- [ ] **Step 1: E2E persistence case**

Append to `tests/e2e/restart.spec.ts`:

```ts
test('restart: summon hotkey setting persists', async () => {
  const profile = makeProfile({ disabled: TWO_ENABLED });
  const first = await launch(profile);

  await first.win.locator('[data-testid="settings-btn"]').click();
  await first.win.locator('[data-testid="settings-nav-general"]').click();
  await first.win.locator('[data-testid="summon-enabled"]').check();
  await first.win.locator('[data-testid="summon-combo"]').selectOption('Ctrl+Shift+Space');
  await first.app.close();

  const second = await launch(profile);
  await second.win.locator('[data-testid="settings-btn"]').click();
  await second.win.locator('[data-testid="settings-nav-general"]').click();
  await expect(second.win.locator('[data-testid="summon-enabled"]')).toBeChecked();
  await expect(second.win.locator('[data-testid="summon-combo"]')).toHaveValue('Ctrl+Shift+Space');
  await second.app.close();
});
```

- [ ] **Step 2: README clause**

The Shortcuts bullet in `README.md` (starts `- **Shortcuts**: ⌘/Ctrl+1…9`) gains this appended sentence, keeping the bullet one line:

```markdown
 A **system-wide summoning hotkey** (Settings → General, off by default) shows or hides Goetia from inside any app.
```

- [ ] **Step 3: Run all gates**

Run: `npx biome check --write tests/e2e/restart.spec.ts` then `npx markdownlint-cli2 README.md docs/superpowers/specs/2026-08-16-summon-hotkey-design.md docs/superpowers/plans/2026-08-16-summon-hotkey.md` — expected: 0 issues.

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test` — expected: all green.

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` — expected: all specs pass including the new case.

- [ ] **Step 4: Hand the manual pass to the user**

In `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev`: enable the hotkey; press it from another app (window appears focused, keyboard lands in the active service); press again (window hides); hide to tray first and confirm the press restores; pick a combo another app owns (e.g. register the same combo in a second Goetia dev instance) and confirm the settings row shows the warning.

- [ ] **Step 5: Stop for the user's commit** (batched under auto-run)

Suggested message: `feat(summon): cover setting persistence e2e and document the hotkey`.
