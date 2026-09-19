import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type DownloadBanner,
  type DownloadItemLike,
  DownloadManager,
  type DownloadManagerDeps,
} from '../../src/main/downloads';
import { DOWNLOAD_BURST_CAP } from '../../src/main/lib/download-rules';

const DIR = '/tmp/goetia-dl';

class FakeItem extends EventEmitter implements DownloadItemLike {
  savePath = '';
  dialog: { defaultPath?: string } | null = null;
  cancelled = false;
  received = 0;
  constructor(
    private name: string,
    private url = `blob:https://web.whatsapp.com/${name}`,
    public total = 100,
  ) {
    super();
  }
  getFilename() {
    return this.name;
  }
  getURL() {
    return this.url;
  }
  setSavePath(p: string) {
    this.savePath = p;
  }
  getSavePath() {
    return this.savePath;
  }
  setSaveDialogOptions(o: { defaultPath?: string }) {
    this.dialog = o;
  }
  getReceivedBytes() {
    return this.received;
  }
  getTotalBytes() {
    return this.total;
  }
  cancel() {
    this.cancelled = true;
    this.emit('done', {}, 'cancelled');
  }
  progress(received: number) {
    this.received = received;
    this.emit('updated', {}, 'progressing');
  }
  finish(state: 'completed' | 'interrupted' | 'cancelled') {
    this.emit('done', {}, state);
  }
}

class FakeSession extends EventEmitter {
  fire(item: FakeItem) {
    this.emit('will-download', {}, item, {});
  }
}

function harness(over: Partial<DownloadManagerDeps> & { files?: Set<string> } = {}) {
  const files = over.files ?? new Set<string>();
  const banners: DownloadBanner[] = [];
  const box = { locked: false, settings: { ask: false, dir: null as string | null } };
  const deps: DownloadManagerDeps = {
    settings: () => box.settings,
    defaultDir: () => DIR,
    locked: () => box.locked,
    serviceName: (id) => (id === 'whatsapp' ? 'WhatsApp' : id),
    icons: new Map([['whatsapp', '/icons/whatsapp.png']]),
    exists: (p) => p === DIR || files.has(p),
    notify: (b) => void banners.push(b),
    reveal: vi.fn(),
    dockFinished: vi.fn(),
    setProgress: vi.fn(),
    showWindow: vi.fn(),
    now: () => 1_000_000,
    ...over,
  };
  const dm = new DownloadManager(deps);
  const ses = new FakeSession();
  dm.attach('whatsapp', ses);
  return { dm, ses, deps, banners, box, files };
}

describe('DownloadManager', () => {
  it('saves into the OS folder silently and announces the file', () => {
    const { ses, deps, banners } = harness();
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    expect(item.savePath).toBe(join(DIR, 'photo.jpg'));
    expect(item.dialog).toBeNull();
    item.finish('completed');
    expect(banners).toHaveLength(1);
    expect(banners[0]).toMatchObject({
      title: 'photo.jpg',
      body: 'Saved from WhatsApp',
      icon: '/icons/whatsapp.png',
    });
    expect(deps.dockFinished).toHaveBeenCalledWith(join(DIR, 'photo.jpg'));
    banners[0].onClick();
    expect(deps.reveal).toHaveBeenCalledWith(join(DIR, 'photo.jpg'));
    expect(deps.showWindow).not.toHaveBeenCalled();
  });

  it('prefers the chosen folder over the OS default', () => {
    const { ses, box } = harness({ exists: (p) => p === '/Volumes/Chat' });
    box.settings = { ask: false, dir: '/Volumes/Chat' };
    const item = new FakeItem('a.pdf');
    ses.fire(item);
    expect(item.savePath).toBe(join('/Volumes/Chat', 'a.pdf'));
  });

  it('shows the dialog when the setting asks, seeded with the folder', () => {
    const { ses, box } = harness();
    box.settings = { ask: true, dir: null };
    const item = new FakeItem('a.pdf');
    ses.fire(item);
    expect(item.savePath).toBe('');
    expect(item.dialog).toEqual({ defaultPath: join(DIR, 'a.pdf') });
  });

  it('honours Save Image As… once, then forgets the URL', () => {
    const { dm, ses } = harness();
    dm.expectAsk('https://cdn.example/x.png');
    const first = new FakeItem('x.png', 'https://cdn.example/x.png');
    ses.fire(first);
    expect(first.dialog).not.toBeNull();
    const again = new FakeItem('x.png', 'https://cdn.example/x.png');
    ses.fire(again);
    expect(again.dialog).toBeNull();
    expect(again.savePath).toBe(join(DIR, 'x.png'));
  });

  it('turns a burst back into dialogs, not counting user requests', () => {
    const { dm, ses } = harness();
    for (let i = 0; i < DOWNLOAD_BURST_CAP; i++) {
      const it = new FakeItem(`p${i}.jpg`);
      ses.fire(it);
      expect(it.dialog).toBeNull();
    }
    const excess = new FakeItem('p9.jpg');
    ses.fire(excess);
    expect(excess.dialog).not.toBeNull();
    // a Save Image As… inside the burst is the user's, and asks anyway
    dm.expectAsk('https://cdn.example/y.png');
    const user = new FakeItem('y.png', 'https://cdn.example/y.png');
    ses.fire(user);
    expect(user.dialog).not.toBeNull();
  });

  it('de-duplicates against files already on disk', () => {
    const files = new Set([join(DIR, 'photo.jpg')]);
    const { ses } = harness({ files });
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    expect(item.savePath).toBe(join(DIR, 'photo (1).jpg'));
  });

  it('reports an interrupted download and stays silent on cancel', () => {
    const { ses, deps, banners } = harness();
    const bad = new FakeItem('a.pdf');
    ses.fire(bad);
    bad.finish('interrupted');
    expect(banners[0]).toMatchObject({ title: 'Could not save a.pdf', body: 'WhatsApp' });
    banners[0].onClick();
    expect(deps.showWindow).toHaveBeenCalledTimes(1);
    expect(deps.reveal).not.toHaveBeenCalled();
    const gone = new FakeItem('b.pdf');
    ses.fire(gone);
    gone.finish('cancelled');
    expect(banners).toHaveLength(1);
  });

  it('redacts the banner while locked and never reveals through it', () => {
    const { ses, deps, banners, box } = harness();
    const item = new FakeItem('secret.pdf');
    ses.fire(item);
    box.locked = true;
    item.finish('completed');
    expect(banners[0]).toMatchObject({ title: 'WhatsApp', body: '' });
    banners[0].onClick();
    expect(deps.reveal).not.toHaveBeenCalled();
    expect(deps.showWindow).toHaveBeenCalledTimes(1);
  });

  it('checks the lock at click time too', () => {
    const { ses, deps, banners, box } = harness();
    const item = new FakeItem('secret.pdf');
    ses.fire(item);
    item.finish('completed');
    box.locked = true;
    banners[0].onClick();
    expect(deps.reveal).not.toHaveBeenCalled();
    expect(deps.showWindow).toHaveBeenCalledTimes(1);
  });

  it('drives the progress bar and clears it when the last item ends', () => {
    const { ses, deps } = harness();
    const a = new FakeItem('a.bin', undefined, 100);
    const b = new FakeItem('b.bin', undefined, 100);
    ses.fire(a);
    ses.fire(b);
    a.progress(50);
    expect(deps.setProgress).toHaveBeenLastCalledWith(0.25);
    b.progress(50);
    expect(deps.setProgress).toHaveBeenLastCalledWith(0.5);
    a.finish('completed');
    expect(deps.setProgress).toHaveBeenLastCalledWith(0.5);
    b.finish('completed');
    expect(deps.setProgress).toHaveBeenLastCalledWith(-1);
  });

  it('cancels a service’s downloads and stops listening on detach', () => {
    const { dm, ses, deps, banners } = harness();
    const item = new FakeItem('a.bin');
    ses.fire(item);
    dm.detach('whatsapp');
    expect(item.cancelled).toBe(true);
    expect(banners).toHaveLength(0);
    expect(deps.setProgress).toHaveBeenLastCalledWith(-1);
    const late = new FakeItem('late.bin');
    ses.fire(late);
    expect(late.savePath).toBe('');
    expect(dm.inflightCount()).toBe(0);
  });

  it('attaches one listener per service however often attach is called', () => {
    const { dm, ses } = harness();
    dm.attach('whatsapp', ses);
    dm.attach('whatsapp', ses);
    expect(ses.listenerCount('will-download')).toBe(1);
  });

  it('dispose cancels everything and clears the bar', () => {
    const { dm, ses, deps } = harness();
    const item = new FakeItem('a.bin');
    ses.fire(item);
    dm.dispose();
    expect(item.cancelled).toBe(true);
    expect(deps.setProgress).toHaveBeenLastCalledWith(-1);
    expect(ses.listenerCount('will-download')).toBe(0);
  });
});
