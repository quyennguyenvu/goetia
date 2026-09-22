import type { ServiceId } from '../../shared/types';

export interface BannerParts {
  /** what a ⌘K row leads with, and the key that makes two banners one row */
  conversation: string;
  /** who sent it, where the service told us separately from the thread */
  author?: string;
}

/** Discord packs sender and place into one banner title — "Author (#channel,
 *  Server)". Everything after the channel is dropped: Discord fills that field
 *  with the server on one banner and the category on the next for the very
 *  same channel, so keeping it split one channel across two rows. The author
 *  is kept but demoted, because it is not always a name — a member Discord
 *  cannot resolve arrives as the literal "Username" (reported 2026-09-03). */
const DISCORD_GUILD = /^(.*?)\s*\((#[^,()]+)\s*,[^()]*\)$/;

/** Zalo titles a group banner with a localized label before the name —
 *  "Nhóm: <name>", "Cộng đồng: <name>" ("Group:", "Community:"; Zalo Web
 *  ships Vietnamese and English only) — and marks an urgent or important
 *  message in front of any banner, group or DM: "Khẩn cấp - ", "Quan trọng - "
 *  ("Urgent - ", "Important - "). Read from createNotifyForMessages in the
 *  live bundle, 2026-09-22. The chat-list row keeps the bare name, so with the
 *  label left in a group row could never be opened by name, and the urgent
 *  banner sat in ⌘K as a second row for the same chat. */
const ZALO_URGENCY = /^(?:Khẩn cấp|Quan trọng|Urgent|Important) - /;
const ZALO_LABEL = /^(?:Nhóm|Cộng đồng|Group|Community): /;

/** Telegram (web.telegram.org/k) titles a group banner "Sender @ Group"; a DM
 *  or channel post carries the chat title alone and a forum topic reads
 *  "Topic (Forum)", both left whole. With a second account signed in it
 *  appends " ➜ <account>". Read from buildNotification in the live bundle,
 *  2026-09-22. */
const TELEGRAM_SENDER = ' @ ';
const TELEGRAM_OTHER_ACCOUNT = / ➜ [^➜]+$/;

/** Slack's browser banners wrap the conversation in boilerplate
 *  (getNotificationTitle, live bundle 2026-09-22): "New message in #general",
 *  "New thread message in #general", "New message from An", "An is trying
 *  to reach you", and on a multi-workspace desktop build "[workspace] in
 *  #general" / "[workspace] from An". English only — a title in another
 *  locale passes through whole rather than be guessed at. */
const SLACK_TITLES = [
  /^New (?:thread )?message in (.+)$/,
  /^New message from (.+)$/,
  /^\[[^\]]+\] (?:in|from) (.+)$/,
  /^(.+) is trying to reach you$/,
];

/** A banner title split into the conversation it belongs to and who sent it.
 *  Discord and Telegram pack the sender in front of it, Zalo and Slack wrap
 *  it in a label; every other service titles its banners with the
 *  conversation already, so they pass through untouched — never guess a
 *  split that is not there. */
export function splitBannerTitle(serviceId: ServiceId, title: string): BannerParts {
  const t = title.replace(/\s+/g, ' ').trim();
  if (serviceId === 'discord') {
    const m = DISCORD_GUILD.exec(t);
    if (m) {
      const author = m[1].trim();
      return author === '' ? { conversation: m[2] } : { conversation: m[2], author };
    }
  }
  if (serviceId === 'zalo') {
    const bare = t.replace(ZALO_URGENCY, '').replace(ZALO_LABEL, '');
    return { conversation: bare === '' ? t : bare };
  }
  if (serviceId === 'telegram') {
    const own = t.replace(TELEGRAM_OTHER_ACCOUNT, '').trim() || t;
    const at = own.indexOf(TELEGRAM_SENDER);
    if (at > 0) {
      const author = own.slice(0, at).trim();
      const conversation = own.slice(at + TELEGRAM_SENDER.length).trim();
      if (author !== '' && conversation !== '') return { conversation, author };
    }
    return { conversation: own };
  }
  if (serviceId === 'slack') {
    for (const re of SLACK_TITLES) {
      const m = re.exec(t);
      if (m && m[1].trim() !== '') return { conversation: m[1].trim() };
    }
  }
  return { conversation: t };
}
