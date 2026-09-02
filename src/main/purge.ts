import { session } from 'electron';
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';

/** Local wipe only: clears the persist:<id> partition on this device and
 *  lands the view on the login page. The server session is NOT revoked —
 *  it lingers in the service's own devices list until it expires there.
 *  Never touches `disabled` or `order`: purge is about logins, banish is
 *  about the rail, and the two stay orthogonal in both directions.
 *
 *  The confirm lives in the renderer (`PurgeConfirm`), not here: a native
 *  dialog cannot disable its button until the acknowledgement is ticked,
 *  because `checkboxChecked` only comes back with the button press. Both
 *  channels are shell-only, so only the trusted shell frame reaches these. */
export async function purgeService(ctx: AppContext, id: ServiceId): Promise<void> {
  // before the wipe, and unconditionally: the confirm promises the call ends,
  // and both a call window and a sign-in popup run in this very partition
  ctx.views.closeCallWindows(id);
  ctx.views.closeIdentityWindows(id);
  await session.fromPartition(`persist:${id}`).clearStorageData();
  // the wipe already removed any lent Facebook cookies, so all that is left is
  // the bookkeeping: drop the marker and cancel the grace timer, or the next
  // boot sweeps a jar that has nothing in it
  ctx.identityShare.forget(id);
  // a no-op when the service has no view, which is what makes this one unit
  // serve live, hibernated and unbound services alike
  ctx.views.loadServiceUrl(id);
  // a live view re-reports zero from its login page on its own, but a
  // hibernated one would keep showing a badge for mail it can no longer open
  ctx.state.setRuntime(id, { unread: { direct: 0, indirect: 0 }, stale: false });
  ctx.activity.clear(id);
}

export async function purgeLogin(ctx: AppContext, id: ServiceId): Promise<void> {
  await purgeService(ctx, id);
  ctx.broadcast();
}

/** Home's sweep: every service in `order`, summoned and unbound alike. */
export async function purgeAll(ctx: AppContext): Promise<{ purged: number }> {
  const ids = ctx.settings.get().order;
  // sequential on purpose: ten partition wipes racing on one disk buys
  // nothing, and this is a one-shot user action
  for (const id of ids) await purgeService(ctx, id);
  ctx.broadcast();
  return { purged: ids.length };
}
