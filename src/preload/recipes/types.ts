import type { Counts, ServiceId } from '../../shared/types';

export interface Recipe {
  id: ServiceId;
  intervalMs: number;
  /** Extract unread counts from the live page. Throwing marks counts stale. */
  count(doc: Document): Counts | Promise<Counts>;
}
