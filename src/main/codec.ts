import { safeStorage } from 'electron';

/** Encrypts a secret at rest. Main hands in safeStorage; tests hand in
 *  something reversible, so no store ever imports electron. Shared by the
 *  passkey, lock and pin stores. */
export interface KeyCodec {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

/** Secrets rest under the OS keychain-backed key safeStorage owns — the
 *  same tier as the session cookies (enableCookieEncryption). */
export function safeStorageCodec(): KeyCodec {
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
  };
}
