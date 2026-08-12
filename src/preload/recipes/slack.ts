import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

// Chat only, discord-shaped: everything under app.slack.com/client is chat,
// so there is no chatPaths containment and the css below is cosmetic.
// Selectors follow Slack's long-stable BEM classes and data-qa hooks but are
// UNCALIBRATED until a live login pass (tiktok precedent). Slack notifies
// in-page via HTML5 Notification, so no synthNotification.
const slack: Recipe = {
  id: 'slack',
  intervalMs: 2000,
  // upsell banners + non-chat tab-rail destinations. The rail items carry no
  // stable class, only (locale-sensitive) aria-labels — a no-op in other
  // locales is acceptable for cosmetics. None of these exist on login pages.
  css: `
    .p-channel_sidebar__banner--upgrade,
    [data-qa="upgrade_banner"],
    [data-qa*="upsell"],
    .p-tab_rail [aria-label="Canvases"],
    .p-tab_rail [aria-label="Files"],
    .p-tab_rail [aria-label="Automations"],
    .p-tab_rail [aria-label="Templates"] {
      display: none !important;
    }
  `,
  // Slack's "loading your workspace" splash covers the client while it boots
  ready(doc) {
    return visiblyPresent(
      doc,
      doc.querySelector('.p-channel_sidebar, [data-qa="workspace_sidebar"]'),
    );
  },
  count(doc) {
    const sidebar = doc.querySelector('.p-channel_sidebar') ?? doc;
    const badges = [...sidebar.querySelectorAll('.c-mention_badge')]
      .map((el) => Number.parseInt(el.textContent ?? '', 10))
      .filter((n) => Number.isFinite(n));
    const direct =
      badges.length > 0 ? badges.reduce((a, b) => a + b, 0) : unreadFromTitle(doc.title);
    // unread channels without a mention badge; badge rows already counted above
    const indirect = [
      ...sidebar.querySelectorAll(
        '.p-channel_sidebar__channel--unread:not(.p-channel_sidebar__channel--muted)',
      ),
    ].filter((el) => !el.querySelector('.c-mention_badge')).length;
    return { direct, indirect };
  },
};
export default slack;
