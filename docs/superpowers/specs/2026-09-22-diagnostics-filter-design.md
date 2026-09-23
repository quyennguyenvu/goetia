# Diagnostics filter and search — design

Date: 2026-09-22. Status: implemented 2026-09-22. Scope: a search field and tag chips over the Diagnostics pane's ring, and a Copy report that honours them. The ring itself, what enters it and how it persists are unchanged from the 2026-09-19 spec and its 2026-09-20 amendment.

## Problem

The ring holds up to 200 lines across sessions, and the pane shows all of them newest first. Reading it for one thing — every `[nav] contained:` line, one service's stale transitions, one host — means scrolling the whole list, and copying the report for a single problem means the reader gets 200 lines around the ten that matter. The 2026-09-19 spec deliberately shipped one button and no filters because the first reader was a friend pasting the whole report; a developer triaging their own install is the second reader, and the pane gives them nothing.

## Decisions

- **Search field plus tag chips** (user decision, option 1 of 4). A text field matching tag, service id and line text, and a chip row for the tags present in the ring. The field alone would work — typing `zalo` or `nav` already narrows — but nobody learns the tag names from a text box, and the chips are the pane's vocabulary. Service chips were rejected: the field already covers them and a second chip row is more chrome than the pane has room for.
- **Copy respects the filter and says so** (user decision, option 2 of 3). While a filter narrows, Copy report copies the rows on screen and the header gains one `Filtered:` line naming the tags, the query and the shown-of-total count, so the reader knows rows were dropped and by what rule. With no filter the report is exactly what it is today, byte for byte — the friend-reporting case is unchanged.
- **No Clear** (user decision). The bundle the original spec deferred was "filters, search, Clear"; on its own, Clear argues against itself. The ring exists to hold evidence, the 2026-09-20 amendment persisted it across restarts precisely so a report still holds the session before it, the 200-line cap already rotates noise out, and filtering now covers the reading problem Clear would have solved. Privacy is not a reason either: the ring holds redacted URLs and ids, the file is read only by this app, and the lock already refuses the channels. Nothing in this design removes a line from the ring.
- **Filter in the renderer, report in main.** The pane filters the rows it already fetched; a keystroke is never a round-trip. Copy passes the filter to the existing `diagnostics:report` invoke, and main applies the same pure rule so the pane and the report can never disagree on which rows match. Rejected: assembling the filtered report in the renderer (the report format would live in two processes), and a filter payload on `diagnostics:recent` (pointless at 200 rows).
- **Substring match, one rule.** The query is trimmed, lower-cased and tested as a substring of `[tag] serviceId line`. No regex, no per-word AND, no fuzzy match: the ring's lines are short, structured and machine-composed, and `zalo stale` is already contiguous in the line it names.
- **The filter is not state.** It lives in the pane component and resets when Settings closes. Nothing is persisted, broadcast or remembered.

## Threat model

Nothing about what enters the ring changes; this design only reads it. Two things are new and both are shell-only, so a service page reaches neither:

- **The filter crosses IPC.** `diagnostics:report`'s payload is renderer-supplied data and is normalised in main before use: tags outside the known set are dropped, the query is a string clipped to `DIAG_QUERY_MAX` (100) or nothing, and anything else becomes the empty filter. The query is only ever a substring test, never a regex or a selector.
- **The query enters the report.** The `Filtered:` line echoes what the user typed themselves into a text they are about to paste. That is their own input, clipped, in a report they choose to send.

`diagnostics:report` stays shell-only and refused while locked. No channel is added.

## Data

`src/shared/diag-filter.ts` — process-agnostic, imported by the pane and by main:

```ts
export const DIAG_TAGS: readonly DiagTag[]; // fixed order: app, nav, open, identity, passkey, ipc, notifications, downloads, recipe, view, peek
export const DIAG_QUERY_MAX = 100;
export interface DiagFilter { tags: DiagTag[]; query: string }
export const EMPTY_DIAG_FILTER: DiagFilter;
/** unknown → a well-formed filter: known tags only, deduped, in DIAG_TAGS order; query trimmed and clipped; anything malformed is the empty filter */
export function normalizeDiagFilter(raw: unknown): DiagFilter;
/** an empty tag set means every tag; the query is a case-insensitive substring of `[tag] serviceId line` (fields space-joined, the service id omitted when absent) */
export function matchesDiagFilter(entry: DiagEntry, filter: DiagFilter): boolean;
/** true when the filter can drop a row: a non-empty tag set or a non-empty query */
export function diagFilterNarrows(filter: DiagFilter): boolean;
/** the header line's body: `tag=nav,recipe · "zalo" · 12 of 87 lines`; tags or query omitted when empty */
export function describeDiagFilter(filter: DiagFilter, shown: number, total: number): string;
```

`DIAG_TAGS` replaces the `TAGS` set inside `src/main/lib/diagnostics.ts`, so `restoreEntries`, the chips and the normaliser read one table; `DiagTag` in `src/shared/types.ts` stays the type and the array is asserted to cover it.

`Diagnostics.report(header, filter = EMPTY_DIAG_FILTER)` filters the entries oldest-first through `matchesDiagFilter` and hands `formatReport` the matching rows plus, when `diagFilterNarrows(filter)`, a `filtered` string from `describeDiagFilter`. `formatReport` prints it as the last header line before the blank:

```text
Goetia 0.9.0 · Electron 37.2.0 · darwin arm64 · OS 25.6.0
Started 2026-09-22T01:10:00.000Z · up 3h 12m
Services: zalo, whatsapp
Settings: lightSleep=on peekSaver=off autoBanish=off/72h quietHours=off appLock=off downloads=folder
Now:
  zalo: live · chat.zalo.me/ · unread 0/0
  whatsapp: asleep · unread 2/0
Filtered: tag=recipe · "zalo" · 3 of 87 lines

2026-09-22T01:14:02.000Z [recipe] zalo stale: … · on chat.zalo.me/
…
```

A filter that matches nothing prints `(nothing matched)` where the empty ring prints `(nothing recorded)`. The unfiltered report is unchanged, so the existing e2e assertions on the first six lines and on the blank-line boundary still hold.

## IPC

`diagnostics:report` gains a payload, `{ filter: DiagFilter }`, and the handler runs it through `normalizeDiagFilter` before `ctx.diag.report(header, filter)`. The channel keeps its place in `INVOKE_CHANNELS`, `SHELL_ONLY_CHANNELS` and outside `LOCKED_ALLOWED_CHANNELS`. The preload's `invoke` typing follows `RendererInvoke`, so the pane passes the filter with no preload change.

## Surface

The pane keeps its description line and gains one toolbar between it and the list:

- **Search field**, placeholder `Filter lines…`, `data-testid="diag-search"`, the Settings text-input style. Every keystroke re-filters the rows already in state. Escape with text in the field clears the field and stops there; with an empty field it falls through to the Settings handler and closes Settings as anywhere else in the pane.
- **Tag chips**, one per tag present in the ring, in `DIAG_TAGS` order, `data-testid="diag-tag-<tag>"`, `aria-pressed`, styled like the quiet-hours day chips (`bg-accent/15 text-accent` pressed, `bg-bg-2 text-text-2` not). Clicking toggles the tag in the set; an empty set means every tag. Tags not present are not rendered, so a chip never leads to an empty list on its own.
- **Copy report** stays where it is and keeps its `diag-copy` test id. Its label reads `Copy report` with no filter and `Copy 12 of 87` while one narrows, so the button says what it will do. It invokes `diagnostics:report` with the pane's current filter.

Below the toolbar the list renders the matching rows newest first, exactly as today. No matches renders `No lines match.` (`data-testid="diag-no-match"`) with a **Show all** button that clears both the field and the tag set. The empty ring keeps `Nothing to report yet.` and hides the toolbar — there is nothing to filter.

## Testing

- `tests/unit/diag-filter.test.ts` — `normalizeDiagFilter` drops unknown tags, dedupes and orders them, trims and clips the query, and maps a non-object, a missing field or a wrong type to the empty filter; `matchesDiagFilter` matches every row on the empty filter, narrows by tag set, matches the query case-insensitively against tag, service id and line, and requires both when both are set; `diagFilterNarrows` and `describeDiagFilter` (tags only, query only, both, and the count).
- `tests/unit/diagnostics.test.ts` — `report` with a filter prints only the matching rows oldest first and adds the `Filtered:` line with the shown-of-total count; with the empty filter the output is identical to today's; a filter matching nothing prints `(nothing matched)`; `DIAG_TAGS` covers every `DiagTag` and `restoreEntries` still rejects a tag outside it.
- `tests/unit/ipc-sender-policy.test.ts` — the existing refusal row covers `diagnostics:report` unchanged; a payload from a service frame is refused before normalisation.
- `tests/e2e/diagnostics.spec.ts` — after the existing assertions: type `stale` into the field and expect one row; clear it and press the `app` chip and expect the two start rows; with the chip still pressed, Copy report and assert the button read `Copy 2 of 3`, that the clipboard text carries a `Filtered: tag=app · 2 of 3 lines` line immediately before the blank, and that its body holds exactly two lines both containing `[app] started`; press the chip again and assert Copy reads `Copy report` and the clipboard text has no `Filtered:` line.

## Out of scope

- Clear — rejected, see Decisions; not deferred.
- Live refresh of the pane while it is open; it still fetches once per open.
- Persisting or remembering the filter.
- Regex, per-word or fuzzy matching; a date or time range.
- Service chips, or any second chip row.
