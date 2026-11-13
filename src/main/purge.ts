import { session } from 'electron';
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { anyOverlayOpen } from './lib/overlay-rules';

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
  // The page comes down before the wipe: a live one can write its login
  // straight back (an unload handler, a token refresh landing late).
  // destroy() also ends the call, the sign-in popup and the contained window
  // — the confirm promises the call ends, and all three run in this partition.
  const live = ctx.views.has(id);
  if (live) {
    ctx.views.destroy(id);
    ctx.noteDestroyed(id); // free a peek that was mid-flight on this view
    ctx.waking.end(id, 'destroyed');
  }
  await session.fromPartition(`persist:${id}`).clearStorageData();
  // the wipe already removed any lent Facebook cookies, so all that is left is
  // the bookkeeping: drop the marker and cancel the grace timer, or the next
  // boot sweeps a jar that has nothing in it
  ctx.identityShare.forget(id);
  // back on the login page — but a service that was asleep (or only peeking)
  // must not wake just to show one
  if (live && !ctx.state.runtime(id).hibernated && !ctx.settings.get().disabled[id]) {
    if (ctx.state.activeId === id) {
      ctx.views.activate(id, { show: !anyOverlayOpen(ctx.state), kind: 'purge' });
    } else ctx.views.ensure(id, 'purge');
  }
  // a hibernated service would otherwise keep showing a badge for mail it can
  // no longer open
  ctx.state.setRuntime(id, { unread: { direct: 0, indirect: 0 }, stale: false });
  ctx.activity.clear(id);
  ctx.recents.clear(id);
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
