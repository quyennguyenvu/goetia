import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');
const isService = (p: Page) => p.url().startsWith('https://');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-passkeys-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: 'zalo',
      disabled: {
        whatsapp: true,
        messenger: true,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
        instagram: true,
        slack: true,
        teams: true,
      },
    }),
  );
  return profile;
}

async function launch() {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${makeProfile()}`],
    env: { ...process.env, GOETIA_WEBAUTHN_PROMPT: 'accept' },
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  const page =
    app.windows().find(isService) ?? (await app.waitForEvent('window', { predicate: isService }));
  await page.waitForLoadState('domcontentloaded');
  return { app, win, page };
}

const b64 = (s: string) => Buffer.from(s, 'base64url');
type CredentialJson = { id: string; response: Record<string, string> };

test('a service page registers a passkey, asserts with it, and Settings lists it', async () => {
  const { app, win, page } = await launch();
  try {
    const created = await page.evaluate(async () => {
      const enc = (s: string) => new TextEncoder().encode(s);
      const cred = (await navigator.credentials.create({
        publicKey: {
          rp: { name: 'Zalo' },
          user: { id: enc('user-1'), name: 'e2e@example.com', displayName: 'E2E' },
          challenge: enc('create-challenge'),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          extensions: { credProps: true },
        },
      })) as PublicKeyCredential;
      const r = cred.response as AuthenticatorAttestationResponse;
      return {
        isInstance: cred instanceof PublicKeyCredential,
        json: cred.toJSON() as unknown as { id: string; response: Record<string, string> },
        spki: btoa(String.fromCharCode(...new Uint8Array(r.getPublicKey() as ArrayBuffer))),
        rk: (cred.getClientExtensionResults() as { credProps?: { rk?: boolean } }).credProps?.rk,
        uvpaa: await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
      };
    });
    expect(created.isInstance).toBe(true);
    expect(created.rk).toBe(true);
    expect(created.uvpaa).toBe(true);
    // zalo may have routed within its host; the origin is whatever the page is on
    const pageOrigin = new URL(page.url());
    const clientData = JSON.parse(b64(created.json.response.clientDataJSON).toString());
    expect(clientData).toMatchObject({
      type: 'webauthn.create',
      origin: pageOrigin.origin,
      crossOrigin: false,
    });

    const asserted: CredentialJson = await page.evaluate(async (id: string) => {
      const enc = (s: string) => new TextEncoder().encode(s);
      const raw = Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
        c.charCodeAt(0),
      );
      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge: enc('get-challenge'),
          allowCredentials: [{ type: 'public-key', id: raw }],
        },
      })) as PublicKeyCredential;
      return cred.toJSON() as unknown as { id: string; response: Record<string, string> };
    }, created.json.id);
    expect(asserted.id).toBe(created.json.id);
    const ad = b64(asserted.response.authenticatorData);
    expect(ad.subarray(0, 32).toString('hex')).toBe(
      createHash('sha256').update(pageOrigin.hostname).digest('hex'),
    );
    expect(ad[32]).toBe(0x05);
    const pub = createPublicKey({
      key: Buffer.from(created.spki, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const signed = Buffer.concat([
      ad,
      createHash('sha256').update(b64(asserted.response.clientDataJSON)).digest(),
    ]);
    expect(verify('sha256', signed, pub, b64(asserted.response.signature))).toBe(true);

    // the credential shows up in Settings and can be forgotten and restored
    const rp = pageOrigin.hostname;
    await win.getByTestId('settings-btn').click();
    await win.getByTestId('settings-nav-passkeys').click();
    await expect(win.getByTestId(`passkey-${rp}`)).toContainText('E2E');
    await win.getByTestId(`forget-${rp}`).click();
    await expect(win.getByTestId('passkey-undo')).toBeVisible();
    await win.getByTestId('passkey-undo').getByRole('button', { name: 'Undo' }).click();
    await expect(win.getByTestId(`passkey-${rp}`)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('a get with no matching passkey rejects NotAllowedError instead of hanging', async () => {
  const { app, page } = await launch();
  try {
    const name = await page.evaluate(async () => {
      try {
        await navigator.credentials.get({
          publicKey: { challenge: new TextEncoder().encode('x') },
        });
        return 'resolved';
      } catch (e) {
        return (e as DOMException).name;
      }
    });
    expect(name).toBe('NotAllowedError');
  } finally {
    await app.close();
  }
});
