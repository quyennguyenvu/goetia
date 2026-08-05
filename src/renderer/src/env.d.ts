import type { GoetiaApi } from '../../preload/shell';

declare global {
  interface Window {
    goetia: GoetiaApi;
  }
}
