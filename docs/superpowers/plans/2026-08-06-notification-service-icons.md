# Notification service icons implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a brand-coloured service tile in every OS notification banner so
Zalo, Telegram and the rest are distinguishable without reading the text.

**Architecture:** A build-time script rasterises one tile per service into
committed PNGs. At runtime the main process resolves those files to paths once
at startup and hands a path to Electron's `Notification` — no image is ever
decoded into or retained by the app. Pure helpers live in `src/main/lib/` and
carry the unit tests; `notifications.ts` stays a thin wiring layer.

**Tech Stack:** Electron 43, TypeScript, Vitest, Biome, electron-builder,
`@resvg/resvg-js` (devDependency only).

**Spec:** `docs/superpowers/specs/2026-08-06-notification-service-icons-design.md`

## Global Constraints

- **Never run `git commit`.** This repo's owner commits via their own
  `/commit` command after reviewing a drafted message. Where this plan says
  "stop and request a commit", stop and say so — do not commit, do not write
  `GRIMOIRE_COMMIT_MSG.txt`, do not `git add` and proceed.
- Asset canvas is **128 px** square; corner radius ratio **0.34**; glyph ratio
  **0.56**; macOS inset ratio **28 / 38**. Derive pixels from these constants,
  never hardcode them.
- Two variants per service: `<id>.png` (full-bleed, Windows) and
  `<id>-mac.png` (inset, macOS).
- `@resvg/resvg-js` is a **devDependency**. Nothing new may enter the runtime
  or packaging dependency graph.
- The `shouldNotify` mute gate stays first in `handle`, ahead of any icon work.
- Biome is configured with `lineWidth: 100`. Code in this plan is wrapped
  narrower to fit the document; running `pnpm lint` will reflow it. That is
  expected — do not fight it.
- Node 26 imports TypeScript directly, so build scripts import
  `src/shared/services.ts` rather than duplicating the service table.

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `scripts/build-notification-icons.mjs` | Compose and rasterise the tiles |
| `resources/notification-icons/*.png` | Ten committed assets |
| `src/main/lib/notification-icons.ts` | Pure path resolution |
| `src/main/lib/notification-rules.ts` | Pure mute gate + title fallback |
| `src/main/notifications.ts` | Wiring only |
| `electron-builder.yml` | Ship assets outside the asar |
| `tests/unit/notification-icons.test.ts` | Assets + resolver |
| `tests/unit/notification-rules.test.ts` | Mute gate + title fallback |

---

### Task 1: Generate and commit the tile assets

**Files:**

- Create: `scripts/build-notification-icons.mjs`
- Create: `tests/unit/notification-icons.test.ts`
- Create: `resources/notification-icons/*.png` (generated, ten files)
- Modify: `package.json` (add `icons` script, add devDependency)

**Interfaces:**

- Consumes: `SERVICES` from `src/shared/services.ts` — each entry has `id`
  (`ServiceId`) and `color` (hex string).
- Produces: `resources/notification-icons/<id>.png` and
  `resources/notification-icons/<id>-mac.png`, each a 128×128 PNG.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/notification-icons.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SERVICES } from '../../src/shared/services';

const ICON_DIR = fileURLToPath(
  new URL('../../resources/notification-icons', import.meta.url),
);

/** PNG signature then IHDR: width at byte 16, height at byte 20. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('notification icon assets', () => {
  it.each(SERVICES.map((s) => s.id))(
    '%s has both variants at 128px',
    (id) => {
      for (const name of [`${id}.png`, `${id}-mac.png`]) {
        expect(pngSize(join(ICON_DIR, name))).toEqual({
          width: 128,
          height: 128,
        });
      }
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/notification-icons.test.ts`

Expected: FAIL — `ENOENT: no such file or directory` for
`resources/notification-icons/messenger.png`.

- [ ] **Step 3: Add the rasteriser as a devDependency**

Run: `pnpm add -D @resvg/resvg-js`

If pnpm warns that build scripts were ignored for this package, add it to
`allowBuilds` in `pnpm-workspace.yaml` alongside the existing entries and
re-run `pnpm install`.

- [ ] **Step 4: Write the generator**

Create `scripts/build-notification-icons.mjs`:

```js
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { SERVICES } from '../src/shared/services.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO_DIR = join(ROOT, 'src/renderer/src/assets/logos');
const OUT_DIR = join(ROOT, 'resources/notification-icons');

const CANVAS_PX = 128; // covers 38pt at 3x and 48px at 2x
const RADIUS_RATIO = 0.34; // ServiceTile: 11px on a 32px tile
const GLYPH_RATIO = 0.56; // ServiceTile: 18px on a 32px tile
const MAC_INSET_RATIO = 28 / 38; // reviewed tile size in the macOS slot

// Nest the logo file whole so its own viewBox scales into the box we give
// it — no path extraction, nothing to re-parse when a logo is replaced.
function placeGlyph(id, offset, size) {
  const src = readFileSync(join(LOGO_DIR, `${id}.svg`), 'utf8').trim();
  const box = `x="${offset}" y="${offset}" width="${size}" height="${size}"`;
  return src.replace('<svg', `<svg ${box}`);
}

function tileSvg(service, tilePx) {
  const inset = (CANVAS_PX - tilePx) / 2;
  const glyph = tilePx * GLYPH_RATIO;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_PX}"`,
    ` height="${CANVAS_PX}" viewBox="0 0 ${CANVAS_PX} ${CANVAS_PX}">`,
    `<rect x="${inset}" y="${inset}" width="${tilePx}"`,
    ` height="${tilePx}" rx="${tilePx * RADIUS_RATIO}"`,
    ` fill="${service.color}"/>`,
    placeGlyph(service.id, inset + (tilePx - glyph) / 2, glyph),
    '</svg>',
  ].join('');
}

const png = (svg) => new Resvg(svg).render().asPng();

mkdirSync(OUT_DIR, { recursive: true });
for (const service of SERVICES) {
  const full = join(OUT_DIR, `${service.id}.png`);
  const mac = join(OUT_DIR, `${service.id}-mac.png`);
  writeFileSync(full, png(tileSvg(service, CANVAS_PX)));
  writeFileSync(mac, png(tileSvg(service, CANVAS_PX * MAC_INSET_RATIO)));
  console.log(`${service.id}: full-bleed + macOS inset`);
}
```

- [ ] **Step 5: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
"icons": "node scripts/build-notification-icons.mjs",
```

- [ ] **Step 6: Generate the assets**

Run: `pnpm run icons`

Expected: five lines, `messenger: full-bleed + macOS inset` through
`discord: full-bleed + macOS inset`, and ten files in
`resources/notification-icons/`.

If `@resvg/resvg-js` throws on the nested `<svg>` element, fall back to
lifting the glyph path instead — replace `placeGlyph` with:

```js
function placeGlyph(id, offset, size) {
  const src = readFileSync(join(LOGO_DIR, `${id}.svg`), 'utf8');
  const d = src.match(/<path[^>]*\sd="([^"]+)"/)[1];
  const scale = size / 24; // every logo uses a 24-unit viewBox
  return [
    `<g transform="translate(${offset},${offset}) scale(${scale})"`,
    ` fill="#ffffff"><path d="${d}"/></g>`,
  ].join('');
}
```

- [ ] **Step 7: Eyeball one asset**

Run: `open resources/notification-icons/zalo-mac.png`

Expected: a blue rounded tile with a white Zalo glyph, centred in a
transparent square with visible margin on all four sides. Compare against
`resources/notification-icons/zalo.png`, which should have no margin.

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm vitest run tests/unit/notification-icons.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 9: Lint**

Run: `pnpm lint`

Expected: no errors. Biome may reformat the generator; accept its output.

- [ ] **Step 10: Stop and request a commit**

Do not commit. Tell the user Task 1 is complete and ask them to run
`/commit`. Suggested message:
`feat(notifications): generate brand tile assets for service icons`

---

### Task 2: Resolve icon paths without touching the filesystem

**Files:**

- Create: `src/main/lib/notification-icons.ts`
- Modify: `tests/unit/notification-icons.test.ts` (add a `describe` block)

**Interfaces:**

- Consumes: `ServiceId` from `src/shared/types.ts`.
- Produces:
  - `iconFileName(id: ServiceId, platform: NodeJS.Platform): string`
  - `resolveIcons(dir: string, ids: readonly ServiceId[], platform:
    NodeJS.Platform, exists: (path: string) => boolean):
    Map<ServiceId, string>`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/notification-icons.test.ts` (and add the import of the
module under test to the top of the file):

```ts
import {
  iconFileName,
  resolveIcons,
} from '../../src/main/lib/notification-icons';

describe('iconFileName', () => {
  it('uses the inset variant on macOS', () => {
    expect(iconFileName('zalo', 'darwin')).toBe('zalo-mac.png');
  });

  it('uses the full-bleed variant elsewhere', () => {
    expect(iconFileName('zalo', 'win32')).toBe('zalo.png');
    expect(iconFileName('zalo', 'linux')).toBe('zalo.png');
  });
});

describe('resolveIcons', () => {
  const dir = join('/tmp', 'icons');

  it('maps only the ids whose file is present', () => {
    const present = new Set([join(dir, 'zalo-mac.png')]);
    const found = resolveIcons(
      dir,
      ['zalo', 'telegram'],
      'darwin',
      (p) => present.has(p),
    );
    expect([...found.keys()]).toEqual(['zalo']);
    expect(found.get('zalo')).toBe(join(dir, 'zalo-mac.png'));
  });

  it('returns an empty map when nothing is present', () => {
    const found = resolveIcons(dir, ['zalo'], 'darwin', () => false);
    expect(found.size).toBe(0);
  });

  it('resolves every committed asset for real', () => {
    const ids = SERVICES.map((s) => s.id);
    const found = resolveIcons(ICON_DIR, ids, 'darwin', existsSync);
    expect([...found.keys()]).toEqual(ids);
  });
});
```

Add `existsSync` to the `node:fs` import at the top of the file so the last
test compiles:

```ts
import { existsSync, readFileSync } from 'node:fs';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/notification-icons.test.ts`

Expected: FAIL — cannot resolve
`../../src/main/lib/notification-icons`.

- [ ] **Step 3: Write the implementation**

Create `src/main/lib/notification-icons.ts`:

```ts
import { join } from 'node:path';
import type { ServiceId } from '../../shared/types';

/** macOS gets the padded variant, so the tile reads smaller than the app
 *  icon in the slot; every other platform gets the full-bleed one. */
export function iconFileName(
  id: ServiceId,
  platform: NodeJS.Platform,
): string {
  return platform === 'darwin' ? `${id}-mac.png` : `${id}.png`;
}

/** Resolved once at startup — a missing asset silently drops out rather
 *  than costing a stat call on every notification. */
export function resolveIcons(
  dir: string,
  ids: readonly ServiceId[],
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
): Map<ServiceId, string> {
  const found = new Map<ServiceId, string>();
  for (const id of ids) {
    const path = join(dir, iconFileName(id, platform));
    if (exists(path)) found.set(id, path);
  }
  return found;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/unit/notification-icons.test.ts`

Expected: PASS, 10 tests — the five asset checks from Task 1 plus five new
ones.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: both clean.

- [ ] **Step 6: Stop and request a commit**

Do not commit. Suggested message:
`feat(notifications): resolve per-service icon paths at startup`

---

### Task 3: Keep titles non-empty once the service suffix is gone

**Files:**

- Modify: `src/main/lib/notification-rules.ts`
- Modify: `tests/unit/notification-rules.test.ts`

**Interfaces:**

- Produces: `notificationTitle(raw: string, fallback: string): string`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/notification-rules.test.ts`, and extend the import on
line 2 to `import { notificationTitle, shouldNotify } from '...'`:

```ts
describe('notificationTitle', () => {
  it('passes a real title through, trimmed', () => {
    expect(notificationTitle('  Anh Quyền  ', 'Zalo')).toBe('Anh Quyền');
  });

  it.each(['', '   ', '\n\t'])(
    'falls back to the service name for %j',
    (raw) => {
      expect(notificationTitle(raw, 'Zalo')).toBe('Zalo');
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/notification-rules.test.ts`

Expected: FAIL — `notificationTitle is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/main/lib/notification-rules.ts`:

```ts
/** The title carries the sender alone now, so a recipe that reports an
 *  empty one would otherwise raise a headless banner. */
export function notificationTitle(raw: string, fallback: string): string {
  return raw.trim() || fallback;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/unit/notification-rules.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Stop and request a commit**

Do not commit. Suggested message:
`feat(notifications): fall back to service name for empty titles`

---

### Task 4: Wire the icon and the new title into the router

**Files:**

- Modify: `src/main/notifications.ts` (whole file replaced)

**Interfaces:**

- Consumes: `resolveIcons` (Task 2), `notificationTitle` (Task 3), the
  committed assets (Task 1).
- Produces: no new exports; `NotificationRouter.handle` keeps its signature
  `(serviceId: ServiceId, title: string, body: string): void`.

- [ ] **Step 1: Replace the file**

Write `src/main/notifications.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, Notification } from 'electron';
import { SERVICES, serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import { activateService } from './activate';
import type { AppContext } from './ipc-handlers';
import { resolveIcons } from './lib/notification-icons';
import {
  notificationTitle,
  shouldNotify,
} from './lib/notification-rules';

// Packaged, extraResources drops these beside the asar rather than inside
// it, so the path is one the OS can open. Dev mirrors tray.ts.
const ICON_DIR = app.isPackaged
  ? join(process.resourcesPath, 'notification-icons')
  : join(__dirname, '../../resources/notification-icons');

export class NotificationRouter {
  // Resolved once: no stat call, no decode, no retained bitmap per banner.
  private icons = resolveIcons(
    ICON_DIR,
    SERVICES.map((s) => s.id),
    process.platform,
    existsSync,
  );

  constructor(private ctx: AppContext) {}

  handle(serviceId: ServiceId, title: string, body: string): void {
    const s = this.ctx.settings.get();
    const gate = {
      serviceMuted: s.muted[serviceId],
      globalMuted: s.globalMuted,
    };
    if (!shouldNotify(gate)) return;
    const icon = this.icons.get(serviceId);
    const n = new Notification({
      title: notificationTitle(title, serviceById(serviceId).name),
      body,
      sound: 'default', // macOS plays no sound unless one is requested
      ...(icon ? { icon } : {}),
    });
    n.on('failed', (_e, err) =>
      console.error(`[notifications] ${serviceId}: ${err}`),
    );
    n.on('click', () => {
      this.ctx.win.show();
      activateService(this.ctx, serviceId);
    });
    n.show();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: clean. If it complains that `icon` is not assignable, confirm the
spread is `...(icon ? { icon } : {})` and not `icon: icon ?? undefined`.

- [ ] **Step 3: Run the whole unit suite**

Run: `pnpm test`

Expected: all suites pass. Nothing here is directly covered — the pure parts
were tested in Tasks 2 and 3, and Electron's `Notification` cannot be
exercised under Vitest. Behaviour is verified by hand in Task 6.

- [ ] **Step 4: Lint**

Run: `pnpm lint`

Expected: clean.

- [ ] **Step 5: Stop and request a commit**

Do not commit. Suggested message:
`feat(notifications): show service icon and drop the title suffix`

---

### Task 5: Ship the assets outside the asar

**Files:**

- Modify: `electron-builder.yml`

**Interfaces:**

- Produces: `notification-icons/` inside the packaged app's `Resources`
  directory, matching the `app.isPackaged` branch in Task 4.

- [ ] **Step 1: Edit the config**

In `electron-builder.yml`, replace the `files:` block and add
`extraResources:` immediately after it:

```yaml
files:
  - out/**
  - resources/**
  - '!resources/notification-icons/**'
  - package.json
extraResources:
  - from: resources/notification-icons
    to: notification-icons
```

Leave `icon`, `mac`, `win`, `nsis` and `publish` untouched.

- [ ] **Step 2: Package without building an installer**

Run: `pnpm build && pnpm exec electron-builder --mac --dir`

Expected: completes with a `dist/mac-*/Goetia.app` bundle. This takes a few
minutes.

- [ ] **Step 3: Verify the assets landed on disk and stayed out of the asar**

Run:

```bash
node -e '
const { execSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const app = execSync("ls -d dist/mac*/Goetia.app").toString().trim();
const res = app + "/Contents/Resources";
console.log(execSync(`ls ${res}/notification-icons`).toString());
const asar = readFileSync(res + "/app.asar");
const header = asar.subarray(16, 16 + asar.readUInt32LE(12)).toString();
console.log("in asar:", header.includes("notification-icons"));
'
```

Expected: ten filenames listed, then `in asar: false`.

- [ ] **Step 4: Stop and request a commit**

Do not commit. Suggested message:
`build: ship notification icons via extraResources`

---

### Task 6: Verify against real banners

No automated test can prove the OS drew anything. This task is manual and its
outcome may send you back to Task 4.

**Files:**

- Possibly modify: `src/main/notifications.ts` (fallback below)

- [ ] **Step 1: Run the app in dev**

Run: `pnpm dev`

- [ ] **Step 2: Trigger one notification per service**

Use whichever services are enabled in settings. For each banner, confirm:

- the tile appears on the trailing edge, below the timestamp;
- it reads clearly smaller than the Goetia app icon on the left;
- the title is the sender alone, with no `— <Service>` suffix.

- [ ] **Step 3: Check both appearances**

Switch macOS between Light and Dark in System Settings → Appearance and
trigger one more banner in each. The tile must stay legible in both — that is
the whole reason it has an opaque brand background.

- [ ] **Step 4: If no tile appears, apply the NativeImage fallback**

Electron 43 may only honour `icon` as a `NativeImage` on darwin. In
`src/main/notifications.ts`, add `nativeImage` to the electron import and
change the two icon lines:

```ts
import { app, nativeImage, Notification } from 'electron';

// ...inside handle()
const iconPath = this.icons.get(serviceId);
const icon = iconPath ? nativeImage.createFromPath(iconPath) : null;
const n = new Notification({
  title: notificationTitle(title, serviceById(serviceId).name),
  body,
  sound: 'default',
  ...(icon && !icon.isEmpty() ? { icon } : {}),
});
```

Then re-run Steps 1–3. Note in the commit message that the path form did not
work, so the next person does not "simplify" it back.

- [ ] **Step 5: Verify the packaged app**

Run: `pnpm package:mac`, install the resulting dmg from `dist/`, launch it,
and trigger one notification. This is the step that proves the
`process.resourcesPath` branch — dev exercises only the other one.

- [ ] **Step 6: Update the spec if reality differed**

If Step 4 was needed, edit the "Runtime cost" and "Manual verification"
sections of
`docs/superpowers/specs/2026-08-06-notification-service-icons-design.md` to
record what actually happened.

- [ ] **Step 7: Stop and request a commit**

Do not commit. Report what you observed on each platform and ask the user to
run `/commit`.
