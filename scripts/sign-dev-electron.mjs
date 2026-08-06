// macOS refuses Notification Center registration for unsigned bundles, and the
// Electron dev binary ships linker-signed only — ad-hoc sign it so notifications
// work in `pnpm dev`. Re-runs are cheap and idempotent (--force).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const app = 'node_modules/electron/dist/Electron.app';
if (process.platform === 'darwin' && existsSync(app)) {
  execSync(`codesign --force --deep --sign - "${app}"`, { stdio: 'inherit' });
}
