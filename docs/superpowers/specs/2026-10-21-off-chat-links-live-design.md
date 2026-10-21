# Off-chat links stay live — design

Date: 2026-10-21. Status: approved 2026-10-21 (user decision). Scope: Messenger's and Instagram's off-chat links open in the OS browser instead of being dead clicks; an audit of every other service against the same rule. Builds on the 2026-09-04 off-chat link interceptor (`src/preload/lib/off-chat-link.ts`, CLAUDE.md "An off-chat link opens in the OS browser").

## Problem

In Messenger, "View profile" in a conversation's menu and "Profile" in the thread's info panel do nothing when clicked (reported 2026-10-21). The user's rule: Goetia shows chat only — an off-chat destination must neither load inside the view nor open in a Goetia window — but a **link** to it should open in the OS browser.

The cause is the recipe CSS. Messenger and Instagram set `pointer-events: none` on every relative link that leaves the chat surface (`a[href^='/']` outside `/messages` and `/messenger_media`, or outside `/direct`). That rule predates the 2026-09-04 interceptor, which already sends exactly these links to the browser: it reads `e.target.closest('a[href]')` in a capture-phase click listener. With pointer events off, the click lands on the link's parent, `closest` finds no anchor, and the interceptor never fires. The 2026-09-04 report was an absolute `facebook.com/share/p/…` link, which the relative-only rule never matched, so the overlap went unnoticed.

Evidence: the live Messenger body dump (`temp/messenger_body.html`, 2026-10-03) shows the thread-header avatar as `<a href="/100001104480246/" role="link">` — the rule's exact shape. Both reported controls are unclickable, and the only rule that can make them so matches `a[href^='/']`, so both are relative anchors.

## Audit: every service against the rule

| Service | Off-chat links today | Change |
| --- | --- | --- |
| Messenger | relative off-chat anchors inerted — dead clicks | remove the inert rule |
| Instagram | the same rule (profile, @mentions, shared posts) | remove the inert rule |
| TikTok | declares `chatPaths`, nothing inerted — the interceptor already diverts | none |
| Teams | declares `chatPaths`, nothing inerted — the interceptor already diverts | none |
| Discord, Slack, Telegram, WhatsApp | chat-only; message links are `target=_blank`, so `setWindowOpenHandler` already opens them in the OS browser | none |
| Zalo | blank-then-assign opens already reach the OS browser through `blank-open-shim.ts` | none |
| Shopee | chat-only widget; no off-chat links seen in the fixture | none |

Discord's untargeted `/store`, `/shop` and `/quest-home` anchors live in rows its recipe already hides.

## Decision

1. **Remove the inert rule from both recipes** and let the interceptor do its job: an off-chat link opens in the OS browser, an in-chat link stays with the site.
2. **No recipe may inert links again.** `recipes.test.ts` refuses `pointer-events: none` in any recipe's `css`, because it silently disables the interceptor for whatever it matches.
3. **Buttons are unchanged** (user decision, 2026-10-21). A control with no `href` that routes off chat — in practice only Teams' app bar (Calendar, Contacts, Communities, Activity) — keeps the 2026-08-13 behaviour: it stays visible and the snap-back returns to chat (a fragment navigation for Teams, no reload).
4. **Not built:**
   - Diverting button routes to the browser by hooking `history.pushState` — it would patch the site's history in a shared world and still flash the off-chat screen.
   - Showing off-chat screens in a Goetia overlay with a close button — that is an in-app browser, which the user ruled out, and the same affordance the 2026-08-13 back-button rejection covers.

## Design

- `src/preload/recipes/messenger.ts`: delete the `body:has(a[href*='/t/']) a[href^='/']:not(…)` block; the comment says off-chat links are left live for the preload to divert, and `chatPaths` still contains anything that routes without a link.
- `src/preload/recipes/instagram.ts`: delete the `body:has(a[href^='/direct/']) a[href^='/']:not([href^='/direct'])` block, with the same comment change. The overflow and rail-padding rules stay.
- `tests/unit/recipes.test.ts`: one case over every recipe — `css` contains no `pointer-events: none`.
- `CLAUDE.md`: the product-principle bullet that allows inerting off-chat links says instead that they are never inerted, and why.

The interceptor itself (`offChatLinkUrl`, the listener in `service.ts`, `service:openExternal` in main) does not change. Its guards stay as they are: only `chatPaths` services, only while the document is in chat, trusted unmodified primary clicks, targeted anchors and downloads left alone, main re-checks with `isSafeExternalUrl` and throttles.

## Known side effect

The interceptor calls `stopPropagation` so the site's router never sees the click (the 2026-09-04 reason). The site's menu handler doesn't see it either, so Facebook's conversation menu may stay open after "View profile" opens the browser. It closes on the next click or Escape. Check this in the live session; it's acceptable unless the live check shows worse.

## Testing

- Unit: the new `recipes.test.ts` case; `off-chat-link.test.ts` already covers the routing rule.
- Live (signed-in packaged build, Messenger and Instagram): "View profile" from a conversation's menu, "Profile" in the info panel, the thread-header avatar, and a shared post each open the OS browser once, and the view stays on its thread. A `/messages/t/…` link and a photo (`/messenger_media`) still open in place; Instagram's `/direct/requests/` still opens in place.
- `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`.
