import type { ServiceId } from '../../shared/types';

/** Floor between native banners per service, so a hostile page (or a runaway
 *  recipe) using the Notification shim can't spam the OS notification centre. */
export class NotificationThrottle {
  private last = new Map<ServiceId, number>();

  constructor(private minIntervalMs = 800) {}

  allow(id: ServiceId, now: number): boolean {
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < this.minIntervalMs) return false;
    this.last.set(id, now);
    return true;
  }
}
