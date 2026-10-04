import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

test('a second launch on the same profile quits and brings the first window back', async () => {
  // a fresh profile: every service disabled, so the shell is Home and nothing
  // else is created — the lock is what this spec is about
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-single-'));
  const args = ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`];
  const app = await electron.launch({ args });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');

  // the window is away, as it is behind close-to-tray
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());
  const visible = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);
  expect(await visible()).toBe(false);

  // the same binary, the same profile: Playwright's launcher would wait for a
  // window that never comes, so the second instance is a plain child process
  const execPath = await app.evaluate(() => process.execPath);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const second = spawn(execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  second.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`second instance still running:\n${stderr}`)),
      30_000,
    );
    second.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  expect(exitCode).toBe(0);
  expect(stderr).toContain('another Goetia is already running on this profile');

  // the refused launch's whole effect
  await expect.poll(visible, { timeout: 10_000 }).toBe(true);
  // and the first instance is untouched: still one window, still the shell
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  await app.close();
});
