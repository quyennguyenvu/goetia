import { dialog, session } from 'electron';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';

/** Local wipe only: clears the persist:<id> partition on this device and
 *  lands the view on the login page. The server session is NOT revoked —
 *  it lingers in the service's own devices list until it expires there. */
export async function confirmSignOut(ctx: AppContext, id: ServiceId): Promise<void> {
  const name = serviceById(id).name;
  const { response } = await dialog.showMessageBox(ctx.win, {
    type: 'warning',
    message: `Sign out of ${name}?`,
    detail: 'This clears its login on this device. An active call on this service would end.',
    buttons: ['Cancel', 'Sign Out'],
    defaultId: 0,
    cancelId: 0,
  });
  if (response !== 1) return;
  await session.fromPartition(`persist:${id}`).clearStorageData();
  ctx.views.loadServiceUrl(id);
  ctx.broadcast();
}
