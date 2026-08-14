import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { SERVICES } from '../../src/shared/services';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('an over-cap install is trimmed to nine, told once, and lands on Home', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  // an upgrade profile with all ten enabled; default order ends with zalo.
  // neverHibernate off for everyone: the default would spawn nine live views
  // at launch, and their load can push first paint past the toast's lifetime
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: Object.fromEntries(SERVICES.map((s) => [s.id, false])),
      neverHibernate: Object.fromEntries(SERVICES.map((s) => [s.id, false])),
      lastActiveId: 'messenger',
    }),
  );

  const { app, win } = await launch(profile);

  // trimmed to nine, forced onto Home, and the toast names the banished one
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(9);
  const toast = win.locator('[data-testid="cap-trim-toast"]');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Zalo was banished');
  await app.close();

  // the trim persisted: a relaunch has nothing to trim and nothing to say
  const second = await launch(profile);
  await expect(second.win.locator('[data-testid="service-tile"]')).toHaveCount(9);
  await expect(second.win.locator('[data-testid="cap-trim-toast"]')).toHaveCount(0);
  await second.app.close();
});
