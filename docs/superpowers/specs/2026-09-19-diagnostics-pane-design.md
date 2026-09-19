# Diagnostics pane — design

Date: 2026-09-19. Status: approved in brainstorm (user decision, same day); not implemented. Scope: a bounded in-memory record of the evidence lines main already prints and of the runtime transitions it already sees, shown in a Settings pane with one Copy button. Nothing is persisted and nothing leaves the machine except by that clipboard.

## Problem

This project's own process runs on log lines. `[nav] contained:` is the evidence for widening `ALLOWED_HOSTS`, `[nav] popup denied:` for the identity table, `[open] <service> miss:` for the next conversation-opener lane. A packaged app has no terminal, so none of that reaches anyone but a developer running `pnpm dev`. The README answers the most common report — "a service shows new messages but the icon has no badge" — with "tell me and I'll push a fix", and the person reporting has nothing to attach. That report is a recipe going stale, which today is a grey dot and no line anywhere. The recurring "calibrate the recipe to the live DOM" commits (Teams, Instagram, TikTok, Shopee) each began with exactly that kind of report.

## Threat model

The pane is read-only over what main already knows, and a service page can write nothing into it. Every note is composed main-side from ids and states, never from a page payload verbatim:

- `[nav]` lines store the URL as origin plus path, with query and hash dropped (`redactUrl`). A contained login redirect can carry a token in its query string, and the pane's whole purpose is to be copied and sent to someone.
- `[open] miss` carries lane names and a service id. The stale, crash and peek transitions carry a service id and a state word.
- No conversation title, message body, filename, pin text or banner ever enters the ring. The ring is not another activity log.
- Both channels are shell-only, so they are refused while the app is locked, like every other shell channel: a locked Goetia shows no diagnostics.
- The ring is in memory and bounded at `DIAG_CAP` (200). A page that provokes refusals in a loop rotates the ring; it cannot grow it, and the `NavigationAudit` dedupe already in front of the `[nav]` lines keeps one origin from repeating.

**Does not defend against:** the person who owns the machine pasting the report somewhere public. The report names services in use and the hosts their logins touched; that is the point of it, and it is the user's to send.

## Decisions

- **Evidence lines plus runtime transitions** (user decision, option 1 of 3). Lines alone would miss the stale badge, the report that arrives most. The debug-flag firehoses (`[calls-debug]`, the per-peek `[peek]` cadence line) stay behind their env flags; a peek's start and end are recorded as one transition each.
- **A `Diagnostics` ring in main, fed explicitly** (approach A of 3). Rejected: hooking `console.warn` globally, which catches Electron's own noise and still cannot produce the transitions nobody logs today; and a log file in the profile directory, which puts URLs and service ids on disk for good when the README case needs no history across launches. If crash-time evidence turns out to matter, a ring flushed on `before-quit` is a small later addition.
- **One button, Copy, and nothing else.** No filters, no Clear, no send. The person pasting it is a friend reporting a problem, not a developer triaging; the report is built to be pasted whole.
- **In memory only.** Same principle as the activity log: a restart clears it.
- **Mirror to `console.warn`.** `note()` prints the same `[tag] line` the code printed before, so a dev run reads unchanged and the seven existing emitters lose nothing by moving.

## Data

`src/main/lib/diagnostics.ts`:

```ts
export const DIAG_CAP = 200;
export type DiagTag =
  | 'nav' | 'open' | 'identity' | 'passkey' | 'ipc' | 'notifications' | 'downloads'
  | 'recipe' | 'view' | 'peek';
export interface DiagEntry { at: number; tag: DiagTag; serviceId?: ServiceId; line: string }
export interface ReportHeader {
  version: string; electron: string; platform: string; arch: string;
  enabled: ServiceId[]; settings: string;
}
export class Diagnostics {
  constructor(deps: { now(): number; mirror(line: string): void });
  note(tag: DiagTag, line: string, serviceId?: ServiceId): void;
  recent(): DiagEntry[];               // newest first
  report(header: ReportHeader): string; // header block, blank line, lines oldest first
}
export function redactUrl(url: string): string; // origin + pathname; unparseable returned verbatim
```

`DiagEntry` and `DiagTag` live in `src/shared/types.ts` so the renderer can type the invoke result; the class and cap stay in main. `ctx.diag: Diagnostics` joins `AppContext`.

## Feeding it

The seven existing `console.warn`/`console.error` evidence sites become `note()` calls with the matching tag. `views.ts` has no `ctx`, so `ViewHooks` gains `note(tag, line, serviceId?)`, wired in `index.ts` to `diag.note`. The `[nav]` sites pass `redactUrl(url)`.

New transitions, one line each, only on change:

| Tag | Where | Lines |
| --- | --- | --- |
| `recipe` | `ipc-handlers.ts` `unread:stale` / `unread:update` | `<id> stale` when the flag turns on; `<id> recovered` on the first count after stale. Never per tick — gated on the runtime flag actually changing. |
| `view` | `resilience.ts` | `<id> crashed (attempt n/5, reload in Xs)`, `<id> crashed (cap reached; manual Retry)`, `<id> load failed`, `<id> recovered` (in `noteRecovered` when `crashed` was set). |
| `peek` | `hibernation.ts` | `<id> peek started`, `<id> peek ended: report` / `timeout`. |

## Surface

Settings gains a **Diagnostics** pane after **Updates**. On open it invokes `diagnostics:recent` once (shell-only, returns `DiagEntry[]` newest first) and renders each as a row: relative time (`12s ago`, `4 min ago`, `2 h ago`), the service's tile colour dot where the entry has a service, then `[tag] line` in the mono face. Empty ring renders "Nothing to report yet."

One button, **Copy report**: invokes `diagnostics:report` (shell-only, returns the text), writes it with `navigator.clipboard.writeText`, and shows "Copied" for `TOAST_MS` before the label returns. The report is:

```text
Goetia <version> · Electron <version> · <platform> <arch>
Services: <enabled ids in rail order>
Settings: lightSleep=<b> peekSaver=<b> autoBanish=<b>/<h>h quietHours=<b> appLock=<b> downloads=<ask|folder>

<ISO time> [nav] contained: zalo id.zalo.me (/oauth/…)
…
```

Lines are oldest first in the report (a reader scrolls down through time) and newest first in the pane (the latest is what they came to see). Both channels join `INVOKE_CHANNELS` and `SHELL_ONLY_CHANNELS`; the header is composed in the handler from `app.getVersion()`, `process.versions.electron`, `process.platform`, `process.arch` and `ctx.settings.get()`.

## Testing

- `tests/unit/diagnostics.test.ts` — cap and rotation (201 notes keep the newest 200), newest-first `recent()`, `redactUrl` (query and hash dropped, unparseable verbatim), the report header and oldest-first ordering, the console mirror format.
- `tests/unit/resilience.test.ts` — each `view` transition notes exactly once; a crash past the cap notes the cap line.
- A `recipe` transition test on the stale handler: stale twice notes once; a count after stale notes `recovered` once.
- `tests/unit/ipc-sender-policy.test.ts` — both channels refused from a service frame.
- `tests/e2e/diagnostics.spec.ts` — open Settings → Diagnostics on a fresh profile, assert the empty state; then, with the `--goetia-e2e` path extended to note one `recipe` line after its fake unread, assert the row renders and that **Copy report** puts a text whose first line starts with the word `Goetia` on the clipboard (read back through `app.evaluate(({ clipboard }) => clipboard.readText())`).

## Out of scope

- Persistence across launches; a crash loses the ring.
- Filters, search, Clear.
- Sending the report anywhere but the clipboard.
- The debug-flag firehoses.
