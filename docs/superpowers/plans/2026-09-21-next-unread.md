# Jump To Next Unread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `⌘/Ctrl ⇧ ]` and `⌘/Ctrl ⇧ [` walk the rail to the next or previous service with unread, wrapping, from a service page, Home or the menu.

**Architecture:** A pure `nextUnread` rule in `lib/unread-jump.ts` reads the rail order and the runtime counts the badges already use. The chord joins the single accelerator table, the `FIXED` matcher list and `commands.ts`, so the `Go` menu items, the in-view interceptor and the shell accelerator share one implementation. No new state.

**Tech Stack:** TypeScript, Electron `Menu`, Vitest, Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-21-next-unread-design.md`.

## Global Constraints

- Gates: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`; `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` at the end.
- No commits from the plan; the user commits through `/commit`. One summary at the end.
- Every chord is declared once in `shared/shortcuts.ts`; the interceptor and the menu read it.
- Copy, verbatim: menu `Next Unread` / `Previous Unread`; Settings row `next / previous service with unread`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/main/lib/unread-jump.ts` (create) | `nextUnread` |
| `src/shared/shortcuts.ts` | `nextUnread`, `prevUnread` accelerators |
| `src/main/lib/shortcuts.ts` | `unread` command, `FIXED` rows, bracket codes |
| `src/main/commands.ts` | `case 'unread'` |
| `src/main/menu.ts` | two `Go` items |
| `src/renderer/src/components/SettingsView.tsx` | Navigate row |
| tests | `unread-jump.test.ts` (new), `shortcuts.test.ts`, e2e `shortcuts.spec.ts` |
| docs | `FEATURES.md`, `README.md`, `CLAUDE.md` |

### Task 1: rule and matcher (tests first)

- [ ] `unread-jump.test.ts`, `shortcuts.test.ts` additions → red.
- [ ] `lib/unread-jump.ts`; `shared/shortcuts.ts`; `lib/shortcuts.ts` → green.

### Task 2: command, menu, Settings row

- [ ] `commands.ts` `case 'unread'`; `menu.ts` items; `SettingsView.tsx` row; typecheck.

### Task 3: e2e and docs

- [ ] `shortcuts.spec.ts` jump test (telegram active, zalo unread from the e2e hook); `FEATURES.md`, `README.md`, `CLAUDE.md`; full gates.
