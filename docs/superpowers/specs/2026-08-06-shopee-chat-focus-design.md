# Shopee chat-focus design

Date: 2026-08-06. Status: approved pending review.

## 1. Problem

Shopee shipped as a basic embed pointed at `https://shopee.vn/webchat`. Live verification found two problems:

- `/webchat` trips Shopee's anti-bot wall on every launch (`shopee.vn/verify/captcha?...scene=crawler_item`). Repeated hits risk flagging the account. The buyer chat is only reliably reachable as the mini-chat widget on the shopping site.
- The default view is the full shopping homepage; chat is a small bottom-right widget. The user wants chat to fill the view like every other service, with no shopping chrome and no header controls that navigate back into the anti-bot gate.

## 2. Verified facts (probed 2026-08-06, logged-in session)

- The homepage (`https://shopee.vn/`) loads clean in the real session.
- The shopping site renders inside `div#main`; the chat widget is a body-level sibling `div#shopee-mini-chat-embedded`. Both IDs are stable; every class name below them is build-hashed (e.g. `UvGSSkd1qQ`) and must not be referenced.
- Expanded panel structure (structural selectors only): `host > div` wrapper → `div:first-child` header (40 px, holds the unread badge and two buttons: expand-to-`/webchat` and collapse) → `div:last-child` body (conversation list + thread pane).
- Collapsed state is a 100×48 pill whose `textContent` is the unread count (observed "31").
- Forcing the host to `position: fixed; inset: 0` produces a perfect full-window chat (screenshot-verified); inner panes stretch.

## 3. Decisions

- **Entry URL → `https://shopee.vn/`.** `/webchat` hits the anti-bot wall on every launch; the homepage is the supported entry.
- **Chat fills the view via recipe `css`** (same mechanism as messenger): hide `#main`; fix `#shopee-mini-chat-embedded` to `inset: 0`; structural child rules for the body height. IDs only, no hashed classes.
- **Every rule is gated on the expanded state** (`:has()` on the panel's body child; Chromium 150 supports `:has()`). While the widget is collapsed the page stays completely untouched: login and captcha pages remain usable, and the pill keeps its real rect for `keepAlive`. Live testing showed ungated rules stretch the collapsed pill into a blank white view and would invisibly hide a captcha.
- **Header hidden in the expanded state only.** Its expand button navigates to `/webchat` (anti-bot) and collapse hides chat.
- **Auto-open via `keepAlive`**: returns the collapsed pill's center (the pill element itself, not the host, which may be restyled), reusing the Zalo trusted-click machinery (runner rate-limits to one click per 30 s). Fires only when the panel is collapsed.
- **Unread count**: parse the first integer in the host's header/pill `textContent`. Replaces the title-fallback stub (Shopee titles never carry "(n)"). `display: none` keeps `textContent` readable; falls back to 0 when the badge is absent.
- **Default state `disabled: true`.** User decision: Shopee is opt-in; enable once in Settings.
- **No network filtering.** webRequest blocking makes the client look more bot-like to a platform that already served a captcha, and risks breaking login. The hidden shopping shell loads once and idles. Revisit only if it becomes a problem.
- **Reload robustness needs no special code.** The preload injects recipe `css` on every `DOMContentLoaded`, and the homepage entry means reload lands on `shopee.vn/`. Verify manually.

## 4. Recipe sketch

```ts
const shopee: Recipe = {
  id: 'shopee',
  intervalMs: 2000,
  css: `
    body:has(#shopee-mini-chat-embedded > div > div:nth-child(2))
      #main { display: none !important; }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2)) {
      position: fixed !important; inset: 0 !important;
      width: 100vw !important; height: 100vh !important;
      max-width: none !important; max-height: none !important;
    }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2)) > div {
      width: 100% !important; height: 100% !important;
      max-width: none !important; max-height: none !important;
    }
    #shopee-mini-chat-embedded > div:has(> div:nth-child(2))
      > div:first-child { display: none !important; }
    #shopee-mini-chat-embedded:has(> div > div:nth-child(2))
      > div > div:last-child {
      height: 100% !important; max-height: none !important;
    }
  `,
  count(doc) { /* first integer in host textContent, else 0 */ },
  keepAlive(doc) { /* collapsed pill center, else null */ },
};
```

`count` must return zeros on `tests/fixtures/blank.html` and never throw. `keepAlive` must survive happy-dom's zero-rects (see zalo's degenerate-rect guard).

## 5. Testing

- `tests/fixtures/shopee.html` rebuilt from the real structure: `#shopee-mini-chat-embedded` host, wrapper, header with badge count, body with list/thread panes — hashed class names replaced with neutral ones (selectors are structural, so the fixture stays honest).
- `recipes.test.ts` row asserts the badge count from the fixture; blank-page zero case runs automatically.
- A collapsed-state fixture (or a second assertion) locks `keepAlive`'s pill detection and its null return when expanded.
- `services.test.ts` / `settings.test.ts` / e2e revert to "shopee disabled by default" expectations.
- Manual: enable Shopee in Settings, log in, confirm full-window chat; ⌘/Ctrl+R reload keeps the chat-focus treatment; collapsed pill auto-opens within ~30 s.

## 6. Risks

- Shopee renames `#shopee-mini-chat-embedded` or `#main`: CSS stops matching and the view degrades to the plain site; badge falls to 0. Nothing crashes; selectors need a refresh (same maintenance contract as every other recipe).
- Anti-bot sensitivity: the design deliberately avoids `/webchat`, automated navigation, and request blocking. The only synthetic input is the rate-limited trusted click on the pill.

## 7. Out of scope

- Notifications (`synthNotification`) for Shopee — separate follow-up.
- Any change to other services or the reload machinery.
