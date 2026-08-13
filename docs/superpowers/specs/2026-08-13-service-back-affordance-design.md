# Service back affordance — built, then rejected

Date: 2026-08-13. Status: **rejected** (user decision, same day, after implementation). Kept as the record of why Goetia has no back button and what the Slack login flow actually does. Supersedes the **First-run entry** decision in `2026-08-12-slack-service-design.md`, which stays superseded — the `firstRunUrl` teardown shipped and stands.

## Outcome

**Goetia has no back affordance. Reload is the only way back.** `views.refresh` loads `SERVICES[].url` — `https://www.tiktok.com/messages`, `https://app.slack.com/client` — and that is the escape hatch when a site's own links wander off chat. Reachable from `Go ▸ Reload Service` (⌘/Ctrl+R) and F5 while a service page covers the window.

Do not re-propose a back button, a back menu item, or a back accelerator without a new decision. The reasoning: back is browser chrome, Goetia is a chat shell rather than a browser, and reload already lands on the chat URL — a second, history-shaped way back buys discoverability at the price of the product's whole premise.

## What was built and removed

Implemented in full, verified green (lint, typecheck, 360 unit tests, 18 e2e specs) and against live Slack, then reverted the same day:

- `src/main/lib/back-affordance.ts` + test — the off-chat predicate.
- `ServiceRuntime.backAvailable`, `ViewHooks.onBackAvailable`, `did-navigate`/`did-navigate-in-page` reporting, `views.goBack`.
- `service:goBack` (shell-only IPC), a rail chevron gated on `backAvailable`, `Go ▸ Back` declaring ⌘[ with `registerAccelerator: false`, and a `before-input-event` handler taking ⌘[ / Alt+← only while off-chat.

The `firstRunUrl` teardown from the same session was **not** reverted: Slack's `firstRunUrl`, `ServiceMeta.firstRunUrl`, `Settings.visited`, `lib/start-url.ts` and its test are gone, and every service starts on `url`.

## What Slack's logged-out flow actually does

Worth keeping, because it cost a bug and it will mislead the next person the same way. The 2026-08-12 Slack spec recorded that `app.slack.com/client` "302s to the workspace-first signin" without recording the host, and the natural assumption — that the signin lives on `slack.com` — is wrong. Driving the built app against live Slack:

```text
landing after the 302  : https://app.slack.com/workspace-signin?redir=…
"Find your workspaces" : https://app.slack.com/get-started?redir=…#/find
```

The entire logged-out flow stays on `app.slack.com`, the client's own host. Only the path changes. A first implementation gated the affordance on the host differing from the service's host, which meant it never fired on the one trap it existed for — while lint, typecheck, 356 unit tests and 18 e2e specs were all green. The replacement compared host plus first path segment.

Two lessons that outlive this feature:

- A redirect's **host and path** are part of a service's contract and belong in that service's spec, not just the fact that it redirects.
- Assumptions about a live site's URLs are verified by driving the built app, not by reasoning from an earlier doc. Unit tests only prove a predicate matches the URLs you imagined.

## Placements considered

All mocked interactively before implementation. Recorded so a future proposal starts from here rather than from scratch:

- **Rail chevron, contextual** — chosen and built. Only appeared off-chat, so it never read as permanent chrome. No new main-process machinery beyond the predicate.
- **Notice strip above the view** ("You've left Slack — Back / Back to chat") — most discoverable, but it shrinks `viewBounds` and reflows the page for a transient state.
- **Native right-click menu inside the view** — matches browser habit at zero chrome cost, but overrides the custom context menus Slack, Discord and Messenger all ship.
- **Floating pill over the page** (`loading-overlay.ts` machinery) — nothing in the rail moves and the page never reflows, but it needs a second overlay view positioned, raised and torn down, and it covers whatever the site puts in its own top-left corner.
- **Chevron plus a `⌂ Slack chat` chip** jumping straight to the chat URL — the chip is what `views.refresh` already does. If discoverability of the escape hatch is ever revisited, **this is the half worth keeping**: a visible reload, not a visible back.

## Gates considered

If a reload affordance ever needs an "am I off chat?" test, these were the candidates:

- **Host plus first path segment of `SERVICES[].url`** — what shipped. `app.slack.com/client` vs `/workspace-signin` → off-chat; `/client/T0/C0` → on-chat. A service whose url is the site root (whatsapp, zalo, shopee) claims its whole host. No per-service declarations, no recipe plumbing.
- **Host only** — provably insufficient, see above.
- **History alone (`canGoBack`)** — works everywhere but lights up on every SPA route change, which is permanent chrome.
- **Recipe `chatPaths`** — most precise, but only facebook and tiktok declare one; ten recipes would need paths written and calibrated plus preload→main plumbing.
