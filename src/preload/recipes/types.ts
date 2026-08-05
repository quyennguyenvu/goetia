import type { Counts, ServiceId } from '../../shared/types';

export interface Recipe {
  id: ServiceId;
  intervalMs: number;
  /** Injected into the page on load — cosmetic fixes (hide site chrome, etc). */
  css?: string;
  /** Extract unread counts from the live page. Throwing marks counts stale. */
  count(doc: Document): Counts | Promise<Counts>;
}
