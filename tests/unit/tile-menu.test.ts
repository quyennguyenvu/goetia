import { describe, expect, it } from 'vitest';
import { tileMenuItems } from '../../src/main/lib/tile-menu';

const actions = (items: ReturnType<typeof tileMenuItems>) =>
  items.map((i) => (i.type === 'separator' ? '—' : i.action));

describe('tileMenuItems', () => {
  it('leads with reload, then mute, and sets banish apart', () => {
    expect(actions(tileMenuItems({ muted: false, live: true }))).toEqual([
      'reload',
      'mute',
      '—',
      'banish',
    ]);
  });

  it('labels with bare verbs — the tile the menu hangs off already names the service', () => {
    const labels = tileMenuItems({ muted: false, live: true })
      .filter((i) => i.type !== 'separator')
      .map((i) => i.label);
    expect(labels).toEqual(['Reload', 'Mute', 'Banish']);
  });

  it('offers Unmute when the service is muted', () => {
    const mute = tileMenuItems({ muted: true, live: true }).find(
      (i) => i.type !== 'separator' && i.action === 'mute',
    );
    expect(mute?.type === 'item' && mute.label).toBe('Unmute');
  });

  it('disables reload for a service with no live view', () => {
    // hibernated: nothing to reload — the tile click is what wakes it
    const [reload] = tileMenuItems({ muted: false, live: false });
    expect(reload.type === 'item' && reload.enabled).toBe(false);
    const [liveReload] = tileMenuItems({ muted: false, live: true });
    expect(liveReload.type === 'item' && liveReload.enabled).toBe(true);
  });
});
