# Welcome Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fresh installs open on a single-screen welcome (walkthrough + service picker + confirm); the screen shows whenever every service is disabled.

**Architecture:** Welcome visibility is derived in the renderer from existing `ShellState` (`every service disabled`) — no new flag, no new IPC channel. `DEFAULT_SETTINGS.disabled` flips to all-true. Two main-process paths that today create a view for a disabled service when nothing is enabled get a pure, unit-tested activation rule. Confirm reuses the existing `settings:update` channel. Spec: `docs/superpowers/specs/2026-08-08-welcome-screen-design.md`.

**Tech Stack:** Electron, React 19, Zustand, Tailwind v4 tokens (`tokens.css`), vitest (`tests/unit`), Playwright e2e (`tests/e2e`), Biome.

## Global Constraints

- **Never run `git commit`.** At every "Commit" step, STOP and ask the user to run `/grimoire-core:commit`, quoting the suggested message. Do not write `GRIMOIRE_COMMIT_MSG.txt`. Do not auto-commit to keep the workflow moving.
- Definition of done per task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green. E2E (Task 7/8) runs as `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` (VS Code shells export `ELECTRON_RUN_AS_NODE`, which breaks Electron launch).
- `disabled` means **no tile, no view, no network**. Zero enabled services must mean zero service views — never create a view for a disabled service.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- No new IPC channels. The welcome screen only sends the existing `settings:update` (already shell-only validated).
- Copy is fixed by the spec: title "Welcome to Goetia", tagline "All your chats. Nothing else.", hint "Pick at least one — you can change this anytime in Settings.", confirm "Summon N services" pluralized ("Summon 1 service"), shortcut prefix written literally as `⌘/Ctrl` (matches SettingsView).
- Formatting: Biome, 100-col line width, single quotes. If `corepack pnpm lint` complains, run `corepack pnpm exec biome check --write .`.

---

### Task 1: `resolveActivation` rule

Pure decision logic for "which service (if any) to activate after the disabled set changes", per the repo rule that decision logic lives in `src/main/lib/` with a vitest unit test.

**Files:**

- Create: `src/main/lib/activation-rules.ts`
- Test: `tests/unit/activation-rules.test.ts`

**Interfaces:**

- Consumes: `ServiceId`, `Settings` from `src/shared/types.ts`.
- Produces: `resolveActivation(input: { order: ServiceId[]; disabled: Settings['disabled']; activeId: ServiceId; hasActiveView: boolean }): ServiceId | null` — Task 2 calls this from `ipc-handlers.ts`. `null` means "activate nothing".

- [ ] **Step 1: Write the failing test**

Create `tests/unit/activation-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveActivation } from '../../src/main/lib/activation-rules';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';

// messenger, telegram, zalo, whatsapp, discord, tiktok, shopee
const order = DEFAULT_SETTINGS.order;
const rec = (enabled: ServiceId[]): Record<ServiceId, boolean> =>
  Object.fromEntries(
    order.map((id) => [id, !enabled.includes(id)]),
  ) as Record<ServiceId, boolean>;

describe('resolveActivation', () => {
  it('activates nothing when every service is disabled', () => {
    expect(
      resolveActivation({
        order,
        disabled: rec([]),
        activeId: 'messenger',
        hasActiveView: false,
      }),
    ).toBeNull();
  });

  it('keeps an enabled active service that already has a view', () => {
    expect(
      resolveActivation({
        order,
        disabled: rec(['messenger', 'zalo']),
        activeId: 'messenger',
        hasActiveView: true,
      }),
    ).toBeNull();
  });

  it('activates an enabled active service that has no view yet', () => {
    // welcome confirm where the stale activeId is among the selection
    expect(
      resolveActivation({
        order,
        disabled: rec(['messenger']),
        activeId: 'messenger',
        hasActiveView: false,
      }),
    ).toBe('messenger');
  });

  it('falls to the first enabled service in rail order', () => {
    // zalo precedes whatsapp in the default order
    expect(
      resolveActivation({
        order,
        disabled: rec(['whatsapp', 'zalo']),
        activeId: 'messenger',
        hasActiveView: false,
      }),
    ).toBe('zalo');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/activation-rules.test.ts`

Expected: FAIL — cannot find module `../../src/main/lib/activation-rules`.

- [ ] **Step 3: Write the implementation**

Create `src/main/lib/activation-rules.ts`:

```ts
import type { ServiceId, Settings } from '../../shared/types';

/** Which service (if any) to activate after the disabled set changes.
 *  Null means activate nothing: with zero enabled services the shell
 *  shows the welcome screen, and a disabled service must never get a
 *  view (disabled = no tile, no view, no network). */
export function resolveActivation(input: {
  order: ServiceId[];
  disabled: Settings['disabled'];
  activeId: ServiceId;
  hasActiveView: boolean;
}): ServiceId | null {
  const { order, disabled, activeId, hasActiveView } = input;
  if (!disabled[activeId]) return hasActiveView ? null : activeId;
  return order.find((id) => !disabled[id]) ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/activation-rules.test.ts`

Expected: 4 passed.

- [ ] **Step 5: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green.

- [ ] **Step 6: Commit**

STOP. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(main): add activation rule for disabled-set changes`.

---

### Task 2: guard the two view-creating fallbacks

Startup and the `settings:update` handler currently fall back to `order[0]` and create a view even when that service is disabled. Wire in `resolveActivation` and the startup guard so all-disabled means zero views.

**Files:**

- Modify: `src/main/ipc-handlers.ts:105-110`
- Modify: `src/main/index.ts:156-159`

**Interfaces:**

- Consumes: `resolveActivation` from Task 1.
- Produces: no new exports; behavior only. With every service disabled the app starts with no service views and `state.activeId === order[0]` (harmless placeholder; nothing renders it).

- [ ] **Step 1: Replace the `settings:update` activation fallback**

In `src/main/ipc-handlers.ts`, add the import:

```ts
import { resolveActivation } from './lib/activation-rules';
```

Then replace this block inside the `if (patch.disabled) {` branch:

```ts
      if (after.disabled[ctx.state.activeId]) {
        const next =
          after.order.find((id) => !after.disabled[id]) ?? after.order[0];
        ctx.state.activeId = next;
        ctx.noteActivated(next);
        ctx.views.activate(next);
      }
```

with:

```ts
      const next = resolveActivation({
        order: after.order,
        disabled: after.disabled,
        activeId: ctx.state.activeId,
        hasActiveView: ctx.views.has(ctx.state.activeId),
      });
      if (next) {
        ctx.state.activeId = next;
        ctx.noteActivated(next);
        ctx.views.activate(next);
      }
```

(Note: the old code only reacted when the active service became disabled. The new code also activates when the active service just became enabled but has no view yet — the welcome-confirm case — and activates nothing when everything is disabled.)

- [ ] **Step 2: Guard startup activation**

In `src/main/index.ts`, replace:

```ts
    const s0 = settings.get();
    state.activeId = s0.order.find((id) => !s0.disabled[id]) ?? s0.order[0];
    ctx.noteActivated(state.activeId);
    views.activate(state.activeId);
```

with:

```ts
    const s0 = settings.get();
    const first = s0.order.find((id) => !s0.disabled[id]);
    // all-disabled (fresh install): show the welcome screen, create no
    // view — activating order[0] would give a disabled service network
    state.activeId = first ?? s0.order[0];
    if (first) {
      ctx.noteActivated(first);
      views.activate(first);
    }
```

- [ ] **Step 3: Verify the gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green (behavior is unchanged while defaults still enable messenger and zalo; the all-disabled path gets e2e coverage in Task 7).

- [ ] **Step 4: Commit**

STOP. Ask the user to run `/grimoire-core:commit`. Suggested message: `fix(main): never create a service view when every service is disabled`.

---

### Task 3: `buildDisabledPatch` helper

The welcome confirm needs a full `disabled` record (conf persists whole top-level objects, so partial records are not safe).

**Files:**

- Create: `src/shared/welcome.ts`
- Test: `tests/unit/welcome-patch.test.ts`

**Interfaces:**

- Consumes: `ServiceId`, `Settings` from `src/shared/types.ts`.
- Produces: `buildDisabledPatch(order: ServiceId[], selected: ReadonlySet<ServiceId>): Settings['disabled']` — Task 5's Welcome component calls this. Selected ids map to `false` (enabled), everything else `true`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/welcome-patch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';
import { buildDisabledPatch } from '../../src/shared/welcome';

describe('buildDisabledPatch', () => {
  const order = DEFAULT_SETTINGS.order;

  it('enables exactly the selected ids', () => {
    const patch = buildDisabledPatch(order, new Set<ServiceId>(['zalo']));
    expect(patch.zalo).toBe(false);
    expect(patch.messenger).toBe(true);
    expect(patch.shopee).toBe(true);
  });

  it('covers every service id even with nothing selected', () => {
    const patch = buildDisabledPatch(order, new Set());
    expect(Object.keys(patch).sort()).toEqual([...order].sort());
    expect(Object.values(patch).every((v) => v === true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/welcome-patch.test.ts`

Expected: FAIL — cannot find module `../../src/shared/welcome`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/welcome.ts`:

```ts
import type { ServiceId, Settings } from './types';

/** Full disabled-record for a welcome-screen confirm: selected ids
 *  enabled, everything else disabled. Always covers every id in
 *  `order` — conf persists whole top-level objects. */
export function buildDisabledPatch(
  order: ServiceId[],
  selected: ReadonlySet<ServiceId>,
): Settings['disabled'] {
  return Object.fromEntries(
    order.map((id) => [id, !selected.has(id)]),
  ) as Settings['disabled'];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/welcome-patch.test.ts`

Expected: 2 passed.

- [ ] **Step 5: Verify the gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green.

- [ ] **Step 6: Commit**

STOP. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(shared): add buildDisabledPatch welcome helper`.

---

### Task 4: extract the ember portal for reuse

The welcome hero reuses the loading screen's portal. Move its animation CSS into a shared stylesheet and add a React component. `loading.html` keeps its inline critical-CSS copy untouched (guarded by `tests/unit/loading-critical-css.test.ts`).

**Files:**

- Create: `src/renderer/src/portal.css`
- Create: `src/renderer/src/components/Portal.tsx`
- Modify: `src/renderer/src/loading.css` (remove moved rules)
- Modify: `src/renderer/src/loading.ts` (import portal.css)

**Interfaces:**

- Produces: `Portal({ className }: { className: string })` default export — Task 5 renders `<Portal className="h-24 w-24" />`. CSS classes `ring`, `core`, `ember`, `ember-2`, `ember-3` and their keyframes come from `portal.css` (imported by `Portal.tsx`, so consumers need no extra import).

- [ ] **Step 1: Create `src/renderer/src/portal.css`**

Move the animation rules out of `loading.css`, verbatim:

```css
/* Ember-portal animation, shared by the loading page and the shell's
 * welcome screen. Sizing/layout stays with each consumer. */
.ring {
  transform-origin: 48px 48px;
  animation: portal-spin 6s linear infinite;
}
.core {
  transform-origin: 48px 48px;
  animation: portal-breathe 2.4s ease-in-out infinite;
}
@keyframes portal-spin {
  to {
    transform: rotate(-360deg);
  }
}
/* embers drift along the ring band (rotate about the ring center keeps
 * them on its radius), trailing behind the counterclockwise spin */
.ember {
  transform-origin: 48px 48px;
  animation: ember-drift 1.8s linear infinite;
}
.ember-2 {
  animation-delay: 0.3s;
}
.ember-3 {
  animation-delay: 0.6s;
}
@keyframes ember-drift {
  0% {
    transform: rotate(0deg);
    opacity: 0.95;
  }
  100% {
    transform: rotate(28deg);
    opacity: 0;
  }
}
@keyframes portal-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.14);
    opacity: 1;
  }
}
```

- [ ] **Step 2: Trim `src/renderer/src/loading.css` to layout only**

Replace the whole file with:

```css
.stage {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--bg-0);
}
.portal {
  width: 128px;
  height: 128px;
}
.caption {
  color: var(--text-2);
}
```

- [ ] **Step 3: Import portal.css from the loading page**

`src/renderer/src/loading.ts`, top of file:

```ts
import './tokens.css';
import './loading.css';
import './portal.css';
```

- [ ] **Step 4: Create `src/renderer/src/components/Portal.tsx`**

JSX translation of the SVG in `loading.html` (same ids, same geometry — attribute names camelCased). Keep the two copies in sync when either changes:

```tsx
import '../portal.css';

/** The ember portal from the loading screen. loading.html carries its
 *  own inline copy (it must paint before any JS arrives) — keep both
 *  in sync. */
export default function Portal({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <linearGradient
          id="arcA"
          gradientUnits="userSpaceOnUse"
          x1="77.5"
          y1="42.8"
          x2="18.7"
          y2="54.2"
        >
          <stop offset="0" stopColor="#E23D28" />
          <stop offset="1" stopColor="#FF7A1F" />
        </linearGradient>
        <linearGradient
          id="arcB"
          gradientUnits="userSpaceOnUse"
          x1="18.7"
          y1="54.2"
          x2="53.2"
          y2="18.5"
        >
          <stop offset="0" stopColor="#FF7A1F" />
          <stop offset="1" stopColor="#FFD34D" />
        </linearGradient>
        <radialGradient id="coreg" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stopColor="#FFF6CE" />
          <stop offset="0.35" stopColor="#FFCE5A" />
          <stop offset="0.7" stopColor="#FF9E2C" />
          <stop offset="1" stopColor="#F0663A" />
        </radialGradient>
        <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <filter id="softer" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="5.5" />
        </filter>
      </defs>
      <g className="ring">
        <g filter="url(#soft)" opacity="0.5" fill="none" strokeLinecap="round">
          <path
            d="M77.55 42.79 A30 30 0 0 1 18.66 54.24"
            stroke="url(#arcA)"
            strokeWidth="12"
          />
          <path
            d="M18.66 54.24 A30 30 0 0 1 53.21 18.45"
            stroke="url(#arcB)"
            strokeWidth="12"
          />
        </g>
        <path
          d="M77.55 42.79 A30 30 0 0 1 18.66 54.24"
          fill="none"
          stroke="url(#arcA)"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <path
          d="M18.66 54.24 A30 30 0 0 1 53.21 18.45"
          fill="none"
          stroke="url(#arcB)"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        <circle
          className="ember ember-1"
          cx="59.2"
          cy="20.2"
          r="3.4"
          fill="#FFD34D"
        />
        <circle
          className="ember ember-2"
          cx="67.3"
          cy="25"
          r="2.5"
          fill="#FFCB45"
          opacity="0.8"
        />
        <circle
          className="ember ember-3"
          cx="73.2"
          cy="31.7"
          r="1.8"
          fill="#FFC13D"
          opacity="0.55"
        />
      </g>
      <g className="core">
        <circle
          cx="48"
          cy="48"
          r="13"
          fill="#FF8A2A"
          opacity="0.45"
          filter="url(#softer)"
        />
        <circle cx="48" cy="48" r="7" fill="url(#coreg)" />
        <circle cx="48" cy="46.5" r="2.6" fill="#FFFBEA" opacity="0.95" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 5: Verify the gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green — `loading-critical-css.test.ts` still passes because `loading.html` is untouched. (`Portal.tsx` is not yet imported anywhere; that is fine.)

- [ ] **Step 6: Commit**

STOP. Ask the user to run `/grimoire-core:commit`. Suggested message: `refactor(renderer): extract ember portal into a shared component`.

---

### Task 5: Welcome component + App wiring

**Files:**

- Create: `src/renderer/src/components/Welcome.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**

- Consumes: `buildDisabledPatch` (Task 3), `Portal` (Task 4), `useShell` store, `window.goetia.send('settings:update', …)`.
- Produces: `Welcome()` default export; root element carries `data-testid="welcome"`; picker tiles are buttons named by service (`aria-pressed` reflects selection); confirm button text is `Summon N service(s)` — Task 7's e2e relies on all three.

- [ ] **Step 1: Create `src/renderer/src/components/Welcome.tsx`**

```tsx
import type React from 'react';
import { useState } from 'react';
import type { ServiceId, ServiceMeta } from '../../../shared/types';
import { buildDisabledPatch } from '../../../shared/welcome';
import { useShell } from '../store';
import Portal from './Portal';

const logos = import.meta.glob<string>('../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

function RailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="9" width="5" height="5" rx="1.5" />
      <rect x="10" y="9" width="5" height="5" rx="1.5" />
      <rect x="17" y="9" width="5" height="5" rx="1.5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function KeysIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 15h10" />
    </svg>
  );
}

function Tip({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="w-60 rounded-modal border border-border bg-bg-1 px-4 py-3">
      <p className="flex items-center gap-2 font-semibold text-text-1">
        <span className="text-accent">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-text-2">{body}</p>
    </div>
  );
}

function PickTile({
  service,
  on,
  onToggle,
}: {
  service: ServiceMeta;
  on: boolean;
  onToggle(): void;
}) {
  const logo = logos[`../assets/logos/${service.id}.svg`];
  // same molten-squircle language as the rail's active tile
  const face = on
    ? `scale-105 bg-linear-to-br from-[#FFB43D] via-[#FF8A2A]
       to-[#F04E3E] text-[#15181F]
       shadow-[0_0_10px_rgba(255,158,44,0.45),0_2px_14px_rgba(240,78,62,0.5)]`
    : `bg-bg-2 text-accent opacity-70 group-hover:opacity-100
       group-hover:shadow-[0_0_0_1px_rgba(255,158,44,0.35)]`;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="group flex w-[76px] flex-col items-center gap-1.5 rounded-tile
        p-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-[15px]
          transition-all duration-150 ease-out ${face}`}
      >
        <span
          className="glyph h-6 w-6"
          style={{ '--glyph': `url("${logo}")` } as React.CSSProperties}
        />
      </span>
      <span className={on ? 'text-text-1' : 'text-text-2'}>
        {service.name}
      </span>
    </button>
  );
}

export default function Welcome() {
  const state = useShell((s) => s.state);
  const [selected, setSelected] = useState<ReadonlySet<ServiceId>>(new Set());
  if (!state) return null;

  const toggle = (id: ServiceId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const summon = () =>
    window.goetia.send('settings:update', {
      disabled: buildDisabledPatch(
        state.services.map((svc) => svc.id),
        selected,
      ),
    });

  const n = selected.size;
  return (
    <div
      data-testid="welcome"
      className="flex flex-1 flex-col items-center justify-center gap-5
        overflow-y-auto bg-bg-0 px-8"
    >
      <Portal className="h-24 w-24" />
      <div className="text-center">
        <h1 className="text-xl font-semibold text-text-1">
          Welcome to Goetia
        </h1>
        <p className="mt-1 text-text-2">All your chats. Nothing else.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Tip
          icon={<RailIcon />}
          title="Pick & jump"
          body="Your chats live in the rail — ⌘/Ctrl 1…6 jumps to one."
        />
        <Tip
          icon={<ChatIcon />}
          title="Chat only"
          body="No feeds, no shops. Reload (⌘/Ctrl R) returns to the chat."
        />
        <Tip
          icon={<KeysIcon />}
          title="Quick keys"
          body="⌘/Ctrl K switcher · ⌘/Ctrl , settings · right-click mutes."
        />
      </div>
      <div className="flex flex-wrap items-start justify-center gap-2">
        {state.services.map((svc) => (
          <PickTile
            key={svc.id}
            service={svc}
            on={selected.has(svc.id)}
            onToggle={() => toggle(svc.id)}
          />
        ))}
      </div>
      <p className="text-xs text-text-2">
        Pick at least one — you can change this anytime in Settings.
      </p>
      <button
        type="button"
        disabled={n === 0}
        onClick={summon}
        className="tabular rounded-ctl bg-linear-to-br from-[#FFB43D]
          via-[#FF8A2A] to-[#F04E3E] px-6 py-2 font-semibold text-[#15181F]
          shadow-[0_0_12px_rgba(255,158,44,0.35)] transition-opacity
          duration-150 enabled:hover:opacity-90 disabled:opacity-40
          disabled:shadow-none"
      >
        Summon {n} {n === 1 ? 'service' : 'services'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `src/renderer/src/App.tsx`**

Add the import:

```tsx
import Welcome from './components/Welcome';
```

Add the derived flag after the `pos` line:

```tsx
  const allDisabled = state
    ? state.services.every((svc) => state.settings.disabled[svc.id])
    : false;
```

Replace the content-area line:

```tsx
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <ContentPlaceholder />
      </div>
```

with:

```tsx
      <div className="relative flex min-h-0 min-w-0 flex-1">
        {allDisabled ? <Welcome /> : <ContentPlaceholder />}
      </div>
```

- [ ] **Step 3: Verify the gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green. (The screen is not yet reachable with default settings; e2e coverage lands with the defaults flip in Task 7.)

- [ ] **Step 4: Commit**

STOP. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(renderer): welcome screen shown when every service is disabled`.

---

### Task 6: allow disabling every service in Settings

The welcome screen is the supported zero-enabled state, and disabling everything is the way back to it. Drop the "last enabled service" checkbox guard.

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx:152-162`

**Interfaces:**

- Consumes: nothing new.
- Produces: behavior only — unchecking the final enabled service is now allowed; main destroys all views (existing handler loop) and the derived welcome condition becomes true.

- [ ] **Step 1: Remove the guard**

In `src/renderer/src/components/SettingsView.tsx`, replace:

```tsx
<input
  type="checkbox"
  checked={!s.disabled[svc.id]}
  disabled={
    !s.disabled[svc.id] &&
    state.services.filter((x) => !s.disabled[x.id]).length === 1
  }
  onChange={(e) =>
    update({ disabled: { ...s.disabled, [svc.id]: !e.target.checked } })
  }
/>
```

with:

```tsx
<input
  type="checkbox"
  checked={!s.disabled[svc.id]}
  onChange={(e) =>
    update({ disabled: { ...s.disabled, [svc.id]: !e.target.checked } })
  }
/>
```

(Whitespace may differ from the file after Biome formatting — the change is solely deleting the `disabled={…}` prop.)

- [ ] **Step 2: Verify the gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green.

- [ ] **Step 3: Commit**

STOP. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(settings): allow disabling every service`.

---

### Task 7: all-disabled defaults + e2e coverage

Flip the fresh-install defaults, seed the existing e2e profiles so their assertions keep holding, and add the welcome e2e.

**Files:**

- Modify: `src/shared/types.ts:56-64`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `tests/e2e/loading.spec.ts`
- Create: `tests/e2e/welcome.spec.ts`
- Modify: `CLAUDE.md` (Product principle bullet)

**Interfaces:**

- Consumes: everything from Tasks 1–6.
- Produces: `DEFAULT_SETTINGS.disabled` all `true`; e2e specs self-contained.

- [ ] **Step 1: Flip the defaults**

In `src/shared/types.ts`, replace the `disabled` record of `DEFAULT_SETTINGS`:

```ts
  disabled: {
    whatsapp: true,
    messenger: false,
    telegram: true,
    discord: true,
    zalo: false,
    tiktok: true,
    shopee: true,
  },
```

with:

```ts
  // all disabled ⇒ fresh installs open on the welcome screen
  disabled: {
    whatsapp: true,
    messenger: true,
    telegram: true,
    discord: true,
    zalo: true,
    tiktok: true,
    shopee: true,
  },
```

- [ ] **Step 2: Run unit tests — must stay green**

Run: `corepack pnpm test`

Expected: all green (`settings.test.ts` is default-value-agnostic; if anything fails on the new defaults, fix the test's seeded expectations, not the defaults).

- [ ] **Step 3: Seed the existing e2e profiles**

In **both** `tests/e2e/smoke.spec.ts` and `tests/e2e/loading.spec.ts`:

Add `writeFileSync` to the fs import:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
```

Immediately after the `const profile = mkdtempSync(…)` line, add:

```ts
  // fresh profiles now start all-disabled (welcome screen); these specs
  // assume the pre-welcome defaults, so seed them explicitly
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
      },
    }),
  );
```

In `smoke.spec.ts`, update the stale comment `// only messenger and zalo are enabled by default` to `// the seeded profile enables only messenger and zalo`.

- [ ] **Step 4: Create `tests/e2e/welcome.spec.ts`**

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ??
    (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('fresh install: welcome picker → summon → rail', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  const { app, win } = await launch(profile);

  // fresh profile: welcome shows, no rail tiles, no service views
  const welcome = win.locator('[data-testid="welcome"]');
  await expect(welcome).toBeVisible();
  const tiles = win.locator('[data-testid="rail"] button[aria-label]');
  await expect(tiles).toHaveCount(0);

  // confirm is disabled until something is selected
  const summon = win.getByRole('button', { name: /^Summon/ });
  await expect(summon).toBeDisabled();

  await welcome.getByRole('button', { name: 'Zalo' }).click();
  await expect(summon).toHaveText('Summon 1 service');
  await summon.click();

  // welcome gone, one tile, zalo active
  await expect(welcome).toHaveCount(0);
  await expect(tiles).toHaveCount(1);
  await expect(
    win.locator('[data-testid="rail"] button[aria-current="page"]'),
  ).toHaveAttribute('aria-label', 'Zalo');
  await app.close();

  // the choice persisted: a relaunch skips the welcome
  const second = await launch(profile);
  await expect(
    second.win.locator('[data-testid="rail"] button[aria-label]'),
  ).toHaveCount(1);
  await expect(
    second.win.locator('[data-testid="welcome"]'),
  ).toHaveCount(0);
  await second.app.close();
});
```

- [ ] **Step 5: Record the invariant in `CLAUDE.md`**

Add one bullet to the end of the "Product principle: chat ONLY" list:

```markdown
- Fresh installs start with every service disabled: the shell shows the
  welcome screen whenever all services are disabled (derived from
  settings — no flag). Zero enabled services must mean zero service
  views; see `resolveActivation` and the startup guard.
```

- [ ] **Step 6: Run the full e2e suite**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: smoke, loading, and welcome specs all pass.

- [ ] **Step 7: Verify the gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green.

- [ ] **Step 8: Commit**

STOP. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(app): welcome screen for fresh installs (all services start disabled)`.

---

### Task 8: final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run:

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: everything green.

- [ ] **Step 2: Manual smoke (dev)**

Run `corepack pnpm dev` and check, in a scratch profile if available:

- Welcome screen fits 940×600 with no scrollbars (resize to minimum).
- Portal breathes; tiles light with the molten gradient when selected.
- Confirm stays disabled at zero selections; label pluralizes.
- Summoning activates the first selected service (waking cover shows).
- Settings → disable every service → welcome returns; re-enable works.
- Dark and light themes both render correctly (Settings → Theme).

Report results to the user; do not claim success without having run the commands.
