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

/** A banner title split into the conversation it belongs to and who sent it.
 *  Every service but Discord titles its banners with the conversation already,
 *  so they pass through untouched — never guess a split that is not there. */
export function splitBannerTitle(serviceId: ServiceId, title: string): BannerParts {
  const t = title.replace(/\s+/g, ' ').trim();
  if (serviceId === 'discord') {
    const m = DISCORD_GUILD.exec(t);
    if (m) {
      const author = m[1].trim();
      return author === '' ? { conversation: m[2] } : { conversation: m[2], author };
    }
  }
  return { conversation: t };
}
