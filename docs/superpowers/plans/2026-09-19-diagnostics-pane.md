# Diagnostics Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings → Diagnostics pane that shows the evidence lines main already prints plus the runtime transitions it already sees, with one Copy button that puts a pasteable report on the clipboard.

**Architecture:** `src/main/lib/diagnostics.ts` holds a bounded in-memory ring (`Diagnostics`) that mirrors each note to `console.warn`. The seven existing evidence emitters call it instead of `console.*`; three new transition sources (recipe stale/recovered, view crash lifecycle, peek start/end) note once per change. Two shell-only invoke channels serve the pane; nothing is persisted.

**Tech Stack:** TypeScript, Electron (`ipcMain.handle`, `app.getVersion`, `clipboard` in e2e only), React (Settings pane), Vitest, Playwright-Electron, Biome.

Spec: `docs/superpowers/specs/2026-09-19-diagnostics-pane-design.md`. Read it first.

## Global Constraints

- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green after every task; `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` green after Task 5.
- **Never run `git commit`.** Commit steps mean: ask the user to run `/grimoire-core:commit`. Under "auto run" the steps are skipped and one summary is given at the end.
- `src/shared/**` imports nothing from `electron` or the DOM.
- `DIAG_CAP = 200`. Tags: `'nav' | 'open' | 'identity' | 'passkey' | 'ipc' | 'notifications' | 'downloads' | 'recipe' | 'view' | 'peek'`.
- `[nav]` lines store `redactUrl(url)` (origin + pathname), never the raw URL. No conversation title, body, filename or pin text may enter the ring.
- Both channels `diagnostics:recent` and `diagnostics:report` are shell-only: `INVOKE_CHANNELS` + `SHELL_ONLY_CHANNELS`.
- Transitions note once per change, never per tick. `recipeTransition` is pure and tested.
- Copy, verbatim: pane title `Diagnostics`, button `Copy report` / `Copied`, empty state `Nothing to report yet.`
- Markdown edited must pass `npx markdownlint-cli2 <file>`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/types.ts` (modify) | `DiagTag`, `DiagEntry` types shared with the renderer |
| `src/main/lib/diagnostics.ts` (create) | `Diagnostics` ring, `redactUrl`, `recipeTransition`, `formatReport` |
| `src/main/ipc-handlers.ts` (modify) | `ctx.diag` on `AppContext`; `[ipc]` notes; `recipe` transitions; the two channels |
| `src/main/index.ts` (modify) | construct `Diagnostics`; wire `ViewHooks.note`, authenticator `log`, identity-share `note`, downloads banner failure; e2e hook notes one line |
| `src/main/views.ts` (modify) | `ViewHooks.note`; three `[nav]` sites |
| `src/main/activate.ts` (modify) | `[open] miss` site |
| `src/main/notifications.ts` (modify) | banner `failed` site |
| `src/main/identity-share.ts` (modify) | optional `note` dep for the survived-cookies warning |
| `src/main/resilience.ts` (modify) | `view` transitions |
| `src/main/hibernation.ts` (modify) | `peek` transitions |
| `src/shared/ipc.ts` (modify) | the two channels |
| `src/renderer/src/components/DiagnosticsPane.tsx` (create) | the pane |
| `src/renderer/src/components/SettingsView.tsx` (modify) | the section |
| `tests/unit/diagnostics.test.ts` (create) | ring, redaction, transition, report |
| `tests/unit/resilience.test.ts`, `hibernation.test.ts`, `activate.test.ts` (modify) | `diag` stub; transition assertions |
| `tests/unit/ipc-sender-policy.test.ts` (modify) | channels shell-only |
| `tests/e2e/diagnostics.spec.ts` (create) | empty state, a row, Copy |
| `docs/FEATURES.md`, `README.md`, `CLAUDE.md` (modify) | inventory, user tip, guardrail |

---

### Task 1: The ring and its pure helpers

**Files:** create `src/main/lib/diagnostics.ts`; modify `src/shared/types.ts`; test `tests/unit/diagnostics.test.ts`.

**Produces:**

```ts
// shared/types.ts
export type DiagTag = 'nav' | 'open' | 'identity' | 'passkey' | 'ipc' | 'notifications' | 'downloads' | 'recipe' | 'view' | 'peek';
export interface DiagEntry { at: number; tag: DiagTag; serviceId?: ServiceId; line: string }
// lib/diagnostics.ts
export const DIAG_CAP = 200;
export interface ReportHeader { version: string; electron: string; platform: string; arch: string; enabled: ServiceId[]; settings: string }
export function redactUrl(url: string): string;
export function recipeTransition(wasStale: boolean, nowStale: boolean): 'stale' | 'recovered' | null;
export function settingsSummary(s: Settings): string;
export function formatReport(header: ReportHeader, oldestFirst: readonly DiagEntry[]): string;
export class Diagnostics {
  constructor(deps: { now(): number; mirror(line: string): void });
  note(tag: DiagTag, line: string, serviceId?: ServiceId): void;
  recent(): DiagEntry[]; // newest first
  report(header: ReportHeader): string;
}
```

- [ ] Write `tests/unit/diagnostics.test.ts` (cap/rotation, newest-first, mirror format, `redactUrl`, `recipeTransition`, `settingsSummary`, `formatReport` header + oldest-first + ISO time).
- [ ] Run: fails on missing module.
- [ ] Add the types to `src/shared/types.ts` after `PasskeyView`; write `src/main/lib/diagnostics.ts`.
- [ ] Run tests, typecheck, lint: green.

### Task 2: `ctx.diag` and the seven existing emitters

**Files:** `ipc-handlers.ts` (`AppContext.diag`, two `[ipc]` sites), `index.ts` (construct; wire hooks), `views.ts` (`ViewHooks.note`, three `[nav]` sites with `redactUrl`), `activate.ts` (`[open] miss`), `notifications.ts` (banner failed), `identity-share.ts` (5th ctor param `note?: (line: string, target: ServiceId) => void`, default `console.warn`), the authenticator `log` dep wired to `diag.note('passkey', …)` with its `[passkey]` prefix stripped, downloads `notify` failure. Test stubs in `activate.test.ts` gain `diag: { note: () => {} }`.

- [ ] Make the edits; every replaced `console.warn` keeps its exact wording in the `line` argument (minus the `[tag]` prefix, which `note` adds).
- [ ] Typecheck, lint, test: green.

### Task 3: The three new transitions

**Files:** `ipc-handlers.ts` (`unread:stale` / `unread:update` through `recipeTransition` on `ctx.state.runtime(id).stale` before the patch), `resilience.ts` (crash with attempt and delay, cap reached, load failed, recovered), `hibernation.ts` (`beginPeek` → `peek started`; `endPeek(destroy)` → `peek ended: report` when `destroy` and the count changed or a report arrived — use the reason passed by the caller: `noteUnreadReport` → `report`, timer → `timeout`, other ends not noted). Tests: `resilience.test.ts` harness gains `diag` and asserts the lines; `hibernation.test.ts` harness gains `diag`.

- [ ] Add a `reason` parameter to `endPeek(destroy, reason?: 'report' | 'timeout')` and note only when a reason is given.
- [ ] Write the resilience assertions first, run red, implement, run green.
- [ ] Typecheck, lint, test: green.

### Task 4: The channels

**Files:** `src/shared/ipc.ts` (`'diagnostics:recent': { result: DiagEntry[] }`, `'diagnostics:report': { result: string }`; both lists), `ipc-handlers.ts` (handlers: `recent` returns `ctx.diag.recent()`; `report` composes the header from `app.getVersion()`, `process.versions.electron`, `process.platform`, `process.arch`, enabled ids in rail order, `settingsSummary`), `tests/unit/ipc-sender-policy.test.ts`.

- [ ] Policy test first (red), then declare and handle (green).

### Task 5: The pane, the e2e, the docs

**Files:** create `DiagnosticsPane.tsx`; `SettingsView.tsx` adds `'diagnostics'` after `'updates'` in `SectionId` and `SECTIONS` and renders `<DiagnosticsPane />`; `index.ts` e2e block notes `diag.note('recipe', 'zalo stale', 'zalo')` alongside the fake unread; create `tests/e2e/diagnostics.spec.ts`; docs.

Pane: fetch once on mount via `diagnostics:recent`; `null` → nothing, `[]` → empty state (`data-testid="diag-empty"`), rows `data-testid="diag-row"` with relative time, colour dot from `services.find(...).color`, `[tag] line`. Button `data-testid="diag-copy"`: invoke `diagnostics:report`, `navigator.clipboard.writeText`, label `Copied` for `TOAST_MS`.

e2e: fresh profile with zalo enabled → Settings → Diagnostics → `diag-row` count ≥ 1 within 10s (the e2e hook fires at 1.5s), text contains `[recipe] zalo stale`; click `diag-copy`; `app.evaluate(({ clipboard }) => clipboard.readText())` whose first line starts with the word `Goetia`. A second launch with `--goetia-e2e` absent is not needed: the empty state is asserted on the same profile before the hook fires only if timing allows — instead assert the empty state by launching with the fake disabled? Keep it simple: assert rows appear and the copy header; the empty-state copy is covered by a unit-free render check in the same spec by opening the pane on a profile launched **without** `--goetia-e2e` (second launch in the same test).

Docs: FEATURES (new bullet under a new `## Diagnostics` section before `## Security hardening`; extend test counts line generically), README (`### If something looks off` gets a first bullet pointing to Settings → Diagnostics → Copy report), CLAUDE.md (Reliability section bullet: evidence lines go through `ctx.diag.note`, never bare `console.warn`; no content in the ring; channels shell-only).

- [ ] Build, run the new e2e, run the whole suite, lint markdown.
