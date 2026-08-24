# Home board ↔ rail reorder sync — design

Date: 2026-08-24. Status: approved for planning.

## Problem

The rail stays visible and drag-reorderable while Home is open, and a rail drop commits immediately (`useTileReorder` → one `service:reorder`). Home's board seeds its `staged` edit from the live order but reseeds on membership only (`enabledKey`), so a rail drop while Home is open leaves `staged` stale: the Summoned band keeps the old order, "Apply new order" lights up though the user never touched the board, and clicking it would commit the stale order — silently undoing the rail drag it was lit by.

## Decisions (user, 2026-08-24)

1. **Board-internal reorder is unchanged.** Dragging inside the Summoned band still stages the order as a preview, "Apply new order" still commits it, and a mixed edit (reorder + summon + banish) still lands as ONE `settings:update` on confirm. `summonLabel` and `commitOrder` are untouched.
2. **Rail drop while Home is open and the board is clean → the board follows silently.** `staged` resyncs to the new live order, the Summoned band reflects the rail drag immediately, and the confirm button stays "No changes" (disabled).
3. **Rail drop while the board has a pending edit → confirm modal.** The drop is intercepted before the IPC send; the drafted rail order stays shown (no snap-back under the modal). Two choices:
   - **Discard changes & reorder** — the staged board edit is discarded, then the held `service:reorder` is sent. The follow-live sync from decision 2 then brings the (now clean) board to the new order.
   - **Keep editing** — the rail draft is dropped (tiles snap back to the live order), nothing is sent, the staged edit survives to apply at Home, and the handler explicitly sends `home:setOpen { open: true }` so the board is what the user sees. Today that send is a guaranteed no-op — a staged edit only exists while Welcome is mounted — but the cancel path owns the guarantee rather than assuming it.
4. Escape and a backdrop click mean **Keep editing**. The modal's Escape listener runs in the capture phase and stops propagation so Welcome's own Escape-closes-Home handler never fires underneath it.

## Mechanics (renderer-only; no main or IPC changes)

- **Store (`store.ts`)** gains two Welcome↔Rail coordination fields: `homeDirty: boolean` (published by Welcome whenever `staged` differs from the live summoned sequence — the existing `orderChanged`, which already covers adds, removals and order; cleared on unmount) and a `discardHomeDraft()` signal (a bumped tick Welcome subscribes to, resetting `staged` to the live summoned order).
- **Welcome** adds a follow-live effect keyed on the live summoned join: when the board is clean, `staged` resyncs to it. Dirty boards are never clobbered — with the modal in place, the only way the live order changes under a dirty board is the user confirming the discard, which cleans it first.
- **`useTileReorder`** gains an optional commit intercept — called at drag end with the merged `orderedIds`; returning true defers the commit (draft kept, nothing sent) — and a returned `cancelDraft()` for the snap-back. The existing behavior (send on drop, draft cleared when the broadcast lands) is the default when no intercept is given or it declines.
- **Rail** intercepts when `homeDirty`, holds the pending `orderedIds` in local state, and renders the modal as a fixed full-window overlay (layered above the shell's overlays). Confirm: `discardHomeDraft()`, send `service:reorder` with the held ids, clear pending — the draft clears when the broadcast lands, so the drop never snaps back for a frame. Cancel: `cancelDraft()`, clear pending, send `home:setOpen { open: true }`.
- A drop that lands back in the original order still sends nothing and shows no modal (existing guard). Rail drags while Home is closed are untouched — no staged edit can exist then. The all-disabled welcome has an empty rail, so no drag can originate there.

## Invariants preserved

- Reorder never streams to IPC: still at most one `service:reorder` per drag, now possibly deferred behind the modal decision.
- The board's whole edit still commits as a single `settings:update` frame on confirm (2026-08-15 decision) — this design only changes what happens when the *rail* writes the order while that edit is pending.
- The modal is a shell-renderer surface; no service view can become visible behind or above it (Home is open the whole time).

## Testing

- **E2E** (`reorder.spec.ts` / `home.spec.ts`, reusing the existing rail-drag helpers): clean board + rail drag → Summoned band shows the new order and the confirm button stays disabled at "No changes"; dirty board (stage a banish by clicking a summoned tile) + rail drag → modal appears; **Keep editing** → rail snaps back, staged edit intact, order unchanged in state; **Discard changes & reorder** → order persisted, board mirrors it, button back to "No changes".
- **Unit:** any pure helper extracted for the follow/intercept decisions gets a vitest case; `welcome.test.ts` is unchanged (the label logic is untouched).
- Definition of done per CLAUDE.md: lint, typecheck, unit, e2e all green.

## Rejected alternatives

- **Commit board reorders directly on drop (rail-style):** rejected by the user — the staged preview and "Apply new order" are the point of the board.
- **Silent last-write-wins (rail drop discards or clobbers the staged edit without asking):** the edit can carry summons/banishes; losing it to a stray drag is exactly the surprise the modal exists to prevent. A modal over a toast is a deliberate exception to the usual non-blocking-UI preference — the user asked for it, and the choice is destructive to in-progress work.
- **Blocking rail drags while the board is dirty:** hides why nothing moves; the modal explains and lets the user choose.
