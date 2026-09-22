# Settings Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export Goetia's preferences to a JSON file and import them back from Settings → General, through the native dialogs, without ever moving a login, pin, passkey or the lock.

**Architecture:** A pure `lib/settings-backup.ts` owns the allowlist, the file shape and the parser; `SettingsStore.sanitize` runs the store's own `normalize` over an imported patch. Two shell-only invoke channels wrap the dialogs and file I/O in `ipc-handlers.ts`, and import applies through `applySettingsPatch`, the `settings:update` handler's body lifted into a function, plus the menu, zoom and audio tails. The guard is honoured by parking a summoning patch until `CredentialConfirm` verifies.

**Tech Stack:** TypeScript, Electron `dialog`, `node:fs/promises`, React, Vitest, Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-22-settings-backup-design.md`.

## Global Constraints

- Gates: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`; `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` at the end.
- No commits from the plan; the user commits through `/commit`. One summary at the end.
- Only `BACKUP_KEYS` ever leave or enter through this path; `appLock`, `lastUsedAt`, `mutedUntil`, `globalMutedUntil`, `quietOverrideWindowStart`, `lastActiveId`, `lastHomeOpen`, `lastNotifiedVersion` and `downloads.dir` never do.
- The file is data: allowlist, scalar type checks, then `normalize`.
- Copy, verbatim: row `Backup`, hint `Preferences only — never logins, pins or passkeys.`, buttons `Export…` / `Import…`; statuses `Saved to <path>`, `Restored from <path>`, `Not a Goetia settings file`, `That file is not JSON`, `That file is too large`, `Nothing to restore in that file`, `Could not read that file`, `Could not write that file`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/main/lib/settings-backup.ts` (create) | allowlist, `buildBackup`, `backupFileName`, `parseBackup` |
| `src/main/settings.ts` | `sanitize` |
| `src/shared/ipc.ts` | `settings:export`, `settings:import` (invoke, shell-only) |
| `src/main/ipc-handlers.ts` | `applySettingsPatch`, the two handlers, the parked import |
| `src/renderer/src/components/SettingsView.tsx` | Backup row, status, guarded confirm |
| tests | `settings-backup.test.ts` (new), `settings.test.ts`, `ipc-sender-policy.test.ts`, `lock-ipc-policy.test.ts`, e2e `settings-backup.spec.ts` (new) |
| docs | `FEATURES.md`, `README.md`, `CLAUDE.md` |

### Task 1: the pure half (tests first)

- [ ] `settings-backup.test.ts`, `settings.test.ts` `sanitize` cases, policy tests → red.
- [ ] `lib/settings-backup.ts`; `SettingsStore.sanitize`; `ipc.ts` channels → green.

### Task 2: main wiring

- [ ] `applySettingsPatch(ctx, patch): boolean` lifted from `on('settings:update')`; `settings:export` (save dialog or the e2e path, `writeFile`); `settings:import` (open dialog or the e2e path, `readFile` with the size cap, `parseBackup`, `sanitize`, summon check → `guarded` + parked patch with `IMPORT_PENDING_MS`, else apply + tails); typecheck.

### Task 3: renderer

- [ ] Backup row with `Export…`/`Import…`, status line (`BACKUP_STATUS_MS`), `CredentialConfirm` on `guarded` → retry.

### Task 4: e2e and docs

- [ ] `tests/e2e/settings-backup.spec.ts`; `FEATURES.md`, `README.md`, `CLAUDE.md`; full gates.
