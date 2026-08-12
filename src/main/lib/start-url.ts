import type { ServiceMeta } from '../../shared/types';

/** URL for a view creation: the one-time firstRunUrl while the service has
 *  never loaded before, the canonical chat URL ever after. */
export function startUrl(meta: ServiceMeta, visited: boolean): string {
  return meta.firstRunUrl && !visited ? meta.firstRunUrl : meta.url;
}
