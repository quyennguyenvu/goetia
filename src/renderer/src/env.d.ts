import type { GoetiaLoadingApi } from '../../preload/loading';
import type { GoetiaApi } from '../../preload/shell';
import type { GoetiaToastApi } from '../../preload/toast';

declare global {
  interface Window {
    goetia: GoetiaApi;
    goetiaLoading: GoetiaLoadingApi;
    goetiaToast: GoetiaToastApi;
  }
}
