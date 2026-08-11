# Welcome sections, Dispel, and selling points design

**Date:** 2026-08-10

**Goal:** Make the Home screen's picker readable at a glance by splitting it into a summoned and an unbound section, without letting tiles jump around mid-edit. Add an explicit way to abandon a staged edit in place. Replace the three tip cards, two of which sold the same thing.

## Context

`Welcome.tsx` renders every service as one flat wrapped row of `PickTile`s. Selection is staged in local React state, seeded from the live enabled set on every visit, and applied on confirm through a single `settings:update` patch built by `buildDisabledPatch` (`2026-08-09-home-screen-and-service-composition-design.md`).

Three problems:

1. One flat row hides which services are actually running. With seven services and no grouping, the only signal is the molten face, and a user scanning for "what did I summon" has to read all seven.
2. There is no way to abandon a staged edit without leaving the screen. `Escape` and the rail sigil both discard, but both also navigate away, so correcting a mis-click means leaving Home and coming back.
3. Of the three tip cards, `Pick & jump` ("chats live in the rail — `⌘/Ctrl 1…6` jumps to one") and `Quick keys` ("`⌘/Ctrl K` switcher · `⌘/Ctrl 0` home · right-click mutes") sell the same thing. Both are keyboard cheatsheets, so two thirds of the screen's pitch is one idea.

## Decision 1: sections track the live set, the glow tracks the staged set

Section membership is derived from the **live** enabled set. The molten face is derived from the **staged** selection. They are independent axes, and keeping them independent is the whole design: a tile you just deselected stays exactly where your cursor left it and only loses its glow. Nothing re-sorts until the edit is applied.

A new pure helper joins `buildDisabledPatch` and `summonDelta` in `src/shared/welcome.ts`:

```ts
export interface WelcomeSections {
  summoned: ServiceId[];
  unbound: ServiceId[];
}

/** Partition for the Home picker, in rail order. Keyed on the LIVE enabled
 *  set, never the staged selection, so a tile never moves out from under the
 *  cursor mid-edit — sections re-sort only once a confirm lands. */
export function welcomeSections(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
): WelcomeSections;
```

`PickTile` is unchanged. Its `on` prop keeps meaning "is staged on", so the four reachable states fall out of one rule — the face follows `selected` and nothing else:

| Section | Staged on | Means | Face |
| --- | --- | --- | --- |
| SUMMONED | yes | running, staying | molten (today's on) |
| SUMMONED | no | staged to banish | dim (today's off) |
| UNBOUND | yes | staged to summon | molten |
| UNBOUND | no | untouched | dim |

A glowing tile under UNBOUND is the pending-summon signal, and a dim tile under SUMMONED is the pending-banish signal. Neither gets an extra ring, dashed border, or badge: the confirm button already names the counts, and a second affordance would fight the one instruction this design exists to honor ("keep it in place, just drop the highlight").

### Layout

Two stacked blocks inside the existing centered column, replacing the single wrapped row:

```text
SUMMONED · 2
[Telegram] [Zalo]
──────────────────────────────
UNBOUND · 5
[Messenger] [WhatsApp] [Discord] [TikTok] [Shopee]
```

Both blocks list in rail order (`settings.order`), which is why Telegram precedes Zalo above.

- Section label: `text-text-2`, `text-xs`, `uppercase tracking-wide` — the literal strings stay `Summoned` / `Unbound` in the source and are cased by CSS, so a screen reader is not spelling out capitals. Tile count follows after a `·` separator.
- Counts are the number of tiles below them, so they are live and change only on confirm. That is the point — a count that moved while staging would contradict the tiles under it.
- Hairline `border-border` divider between the blocks.
- Tiles keep wrapping inside each block, so nothing about narrow-window behavior changes. The column already scrolls (`overflow-y-auto`).

An empty section keeps its header and shows a muted `text-text-2` line where its tiles would be — "Nothing yet." under SUMMONED, "Every one is bound." under UNBOUND. A fresh install therefore reads `SUMMONED · 0` / "Nothing yet." above `UNBOUND · 7` with all seven tiles. Hiding the empty section was rejected: it would make a fresh install look exactly like today's flat row, so the first-run user never learns the two-section model before they need it.

Confirming is the one moment tiles move, because that is the moment the live set changes and the component re-derives.

## Decision 2: Dispel

The button row gains a secondary button before the confirm:

```text
[ Dispel ]  [ Summon 2 · Banish 1 ]
```

- **Behavior:** resets `selected` to the live enabled set. That is the same reseed the screen already performs on every visit (`setSelected(new Set(enabledKey…))`); Dispel just puts it under the user's thumb.
- **Style:** the codebase's existing secondary button, borrowed verbatim from the `Manage services…` row in `SettingsView.tsx` — `rounded-ctl border border-border bg-bg-2 text-text-1 hover:border-accent` — with no gradient and no glow, so it reads as the quiet escape and never competes with the molten confirm. It takes the confirm's `disabled:opacity-40` so the two fade identically at rest.
- **Disabled state:** reuses the `disabled` flag `summonLabel` already returns. That flag is true exactly when the delta is empty — both the `0 → 0` fresh case and the `n → n` no-change case — which is precisely when there is nothing to dispel. No new predicate, no new test surface.

Both buttons therefore go dead together in the resting state. That is preferable to hiding Dispel when the edit is clean: the confirm is already rendered-but-dead at rest, so a matching dead sibling is consistent, and a button that appears and vanishes under the pointer would shift the row's centering on every first click.

`Escape` keeps the behavior specified on 2026-08-09 — leave Home, which discards the staged edit as a side effect. Dispel is the discard-in-place. No new accelerator: the screen already spends `Escape` on leaving, and a second binding for a two-click-away button is not worth the collision.

## Decision 3: three cards that sell three things

The overlap is not that cards 1 and 3 shared a shortcut — it is that both were cheatsheets rather than benefits. Removing the cheatsheet framing entirely leaves room for two claims the screen never made.

| Icon | Title | Body |
| --- | --- | --- |
| speech bubble | Chat only | No feeds, no shops. Reload (⌘/Ctrl R) returns to the chat. |
| lock | Stays signed in | Each service keeps its own session. Sign in once. |
| moon | Quiet & light | Only messages for you get a count. Idle chats sleep. |

Each claim is true in code today, not aspirational:

- **Chat only** — the product principle in `CLAUDE.md`; recipe `css` hides host chrome and `views.refresh` returns a user reload to the chat URL.
- **Stays signed in** — every view is created with `partition: persist:${id}` (`src/main/views.ts`), so logins survive restarts and no service can read another's cookies.
- **Quiet & light** — `ServiceTile` badges `runtime.unread.direct` and renders indirect traffic as a dot, and `DEFAULT_SETTINGS.hibernationMinutes` is 30, so idle views really are torn down.

Card mechanics are unchanged: same `Tip` component, same `w-60` card, same three-across wrap. `RailIcon` and `KeysIcon` are deleted and replaced by `LockIcon` and `MoonIcon`; `ChatIcon` stays.

Shortcut discovery is not lost. The hint line under the tiles keeps "come back here anytime with `⌘/Ctrl 0`", and Settings → Shortcuts still lists every binding including `⌘/Ctrl 1…6` and `⌘/Ctrl K`.

## Testing

**Unit (vitest), `tests/unit/welcome.test.ts`:**

- `welcomeSections`: all enabled, all disabled (fresh install), mixed, and order preservation — the returned ids must follow `order`, not insertion order of the enabled set.

No new cases for the Dispel disabled state: it is `summonLabel().disabled`, already covered by all six rows of the existing label table.

**E2E (Playwright):**

- `welcome.spec.ts` — a fresh install shows both section headers, with Zalo under UNBOUND; selecting Zalo leaves it under UNBOUND with the confirm reading `Summon 1 service`; after confirm, Zalo is under SUMMONED.
- `home.spec.ts` — deselecting Messenger leaves it under SUMMONED and unglowed while the confirm reads `Banish 1 service`; Dispel restores the glow and returns the confirm to `No changes`.
- The existing selectors survive: tiles are still matched by `getByRole('button', { name: 'Zalo' })`, and the confirm by `getByRole('button', { name: /^Summon/ })`, which "Dispel" does not match.

Definition of done is unchanged: `lint`, `typecheck`, `test`, and `e2e` all green.

## Out of scope

- No change to `buildDisabledPatch`, `summonDelta`, `summonLabel`, or the `settings:update` IPC path. This is presentation plus one partition helper.
- No change to the rail, the sigil, `⌘/Ctrl 0`, `Escape`, or the overlay invariant from 2026-08-09.
- No drag-to-reorder inside the sections. Rail order still comes from `settings.order`, edited on the rail.
- No per-tile pending marker beyond the existing glow.
- No new accelerator for Dispel.
