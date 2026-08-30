import { safeStorage } from 'electron';
import type { KeyCodec } from './store';

/** Private keys rest under the OS keychain-backed key safeStorage owns — the
 *  same tier as the session cookies (enableCookieEncryption). */
export function safeStorageCodec(): KeyCodec {
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
  };
}
