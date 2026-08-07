import type { GoetiaLoadingApi } from '../../preload/loading';
import type { GoetiaApi } from '../../preload/shell';

declare global {
  interface Window {
    goetia: GoetiaApi;
    goetiaLoading: GoetiaLoadingApi;
  }
}
