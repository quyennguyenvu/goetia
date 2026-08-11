# Notification service icons design

**Date:** 2026-08-06 **Goal:** Tell one service from another in the OS notification banner without reading it.

## Context

- `src/main/notifications.ts` builds every banner today. It gates on `shouldNotify`, then shows a native Electron `Notification` whose title is `` `${title} — ${serviceById(serviceId).name}` ``. No icon is passed, so every banner carries the Goetia app icon and nothing else distinguishes them.
- `SERVICES` (`src/shared/services.ts`) already holds a brand `color` per service; `src/renderer/src/assets/logos/<id>.svg` holds a white monochrome glyph on a 24-unit viewBox. `ServiceTile.tsx` composes the two as a 32 px tile with an 11 px radius (34 %) and an 18 px glyph (56 %).
- Electron 43's `NotificationConstructorOptions.icon` carries no platform annotation. On darwin it is rendered through `UNNotificationAttachment` (confirmed by `attachmentWithIdentifier:URL:options:error:` in the shipped `Electron Framework` binary); on win32 it maps to the toast's `appLogoOverride`.
- The app targets macOS and Windows only (`electron-builder.yml`).
- Reviewed as a visual specimen sheet covering all five services on both platforms, stacked banners, and the degradation paths.

## The constraint that shapes everything

**We do not own the banner layout.** macOS draws it and decides that the app bundle icon occupies the leading slot, the timestamp the top trailing corner, and the attachment the trailing edge beneath it. There is no API to place a second icon beside the app icon, to move the attachment, or to resize its box.

The one dimension we control is how much of the attachment box the artwork fills, by baking transparent padding into the PNG. Everything below follows from that.

## Decisions

| Question    | Decision                                                |
| ----------- | ------------------------------------------------------- |
| Placement   | Native `Notification.icon`                              |
| Icon art    | Brand-colour tile, white glyph                          |
| Icon build  | Build-time script, PNGs committed                       |
| Title text  | Sender only — the `— <Service>` suffix is dropped       |
| Tile size   | 28 px visible inside the 38 pt macOS slot               |
| Runtime     | Pass a file path; hold no images                        |

Rejected alternatives:

- **Custom frameless banner window.** Full layout control, but it forfeits Do Not Disturb, Notification Center history, OS grouping and multi-display placement, and adds a window to own.
- **Composite app-icon + service-icon image.** The app icon would appear twice on macOS — once in the OS slot, once inside our artwork.
- **Bare white glyph, no tile.** Invisible against a macOS light-mode banner.
- **Preloading or lazy-caching `NativeImage`.** Costs up to ~320 KB of resident decoded RGBA to avoid work the OS was going to do anyway.
- **`asarUnpack`.** Would keep the icons at an `app.asar/...` path that only Node's patched `fs` can resolve; a path handed to native code would miss. `extraResources` puts them on disk at a path everything can read.
- **Adding the service name to the macOS `subtitle`.** Available for free later if the tile alone proves too subtle; deliberately not shipped now.

## Deliverables

### 1. `scripts/build-notification-icons.mjs`

Run via `pnpm run icons`. Node 26 imports TypeScript directly, so the script reads `SERVICES` from `src/shared/services.ts` — no parsing, no duplicated service table, no drift.

For each service it composes a wrapper SVG and rasterises it with `@resvg/resvg-js` (new **devDependency**; nothing is added to the runtime or packaging dependency graph).

Geometry, all derived from named ratio constants rather than hardcoded pixels:

| Constant           | Value   | Source                                |
| ------------------ | ------- | ------------------------------------- |
| `CANVAS_PX`        | 128     | covers 38 pt at 3× and 48 px at 2×    |
| `RADIUS_RATIO`     | 0.34    | `ServiceTile` 11 px on 32 px          |
| `GLYPH_RATIO`      | 0.56    | `ServiceTile` 18 px on 32 px          |
| `MAC_INSET_RATIO`  | 28 / 38 | reviewed and chosen tile size         |

Two variants per service:

- `<id>.png` — tile fills the canvas. Used on Windows, where the tile *is* the app-icon slot and padding it would read as broken.
- `<id>-mac.png` — the same tile drawn at `MAC_INSET_RATIO` of the canvas, centred, on transparent ground. The visible tile lands at 28 pt inside the 38 pt slot.

The glyph is placed by nesting the source logo file whole, injecting `x`, `y`, `width` and `height` into its root `<svg>` tag so its own `viewBox="0 0 24 24"` scales into the box. This avoids extracting path data.

> Verify at implementation: `@resvg/resvg-js` must honour nested `<svg>` elements. If it does not, fall back to lifting the single `<path d="…">` out of each logo — every one of the five source files contains exactly one.

### 2. `resources/notification-icons/*.png`

Ten committed files (five services × two variants), roughly 2 KB each. Committed rather than generated during `pnpm build`, so neither a normal build nor `electron-builder` needs the rasteriser installed.

### 3. `src/main/lib/notification-icons.ts`

Pure and directly testable, in the style of the existing `lib/` modules:

```ts
export function iconFileName(id: ServiceId, platform: NodeJS.Platform): string;

export function resolveIcons(
  dir: string,
  ids: readonly ServiceId[],
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
): Map<ServiceId, string>;
```

`exists` is injected so the resolver is testable without touching the filesystem. `resolveIcons` silently omits any service whose file is missing.

### 4. `src/main/lib/notification-rules.ts`

Add a pure title builder beside `shouldNotify`:

```ts
export function notificationTitle(raw: string, fallback: string): string;
```

Returns `raw.trim()`, or `fallback` when the trimmed title is empty. Dropping the `— <Service>` suffix removes the guarantee that a title is never blank; a recipe emitting an empty sender would otherwise produce a headless banner.

### 5. `src/main/notifications.ts`

```ts
const ICON_DIR = app.isPackaged
  ? join(process.resourcesPath, 'notification-icons')
  : join(__dirname, '../../resources/notification-icons');
```

`NotificationRouter` resolves the icon map once in its constructor — `SERVICES.length` `existsSync` calls at startup, none on the notification path. `handle` then:

- keeps the `shouldNotify` gate exactly where it is, ahead of any icon work;
- sets `title` from `notificationTitle(title, serviceById(serviceId).name)`;
- spreads `icon` in only when the map has an entry for the service;
- leaves `body`, `sound`, the `failed` handler and the click handler untouched.

### 6. `electron-builder.yml`

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

The exclusion prevents the icons being packed into `app.asar` as well as copied out, and `extraResources` lands them at `process.resourcesPath` — a real path on disk that native code can open.

### 7. `package.json`

- `"icons": "node scripts/build-notification-icons.mjs"`
- `@resvg/resvg-js` in `devDependencies`

## Runtime cost

Per notification: one `Notification` construction plus the OS reading a ~2 KB PNG that stays in its page cache. Nothing is decoded in, or retained by, the main process. Resident cost is `SERVICES.length` path strings.

Muting is unaffected and still costs nothing: `shouldNotify` returns before the icon map is consulted.

## Tests

`tests/unit/notification-icons.test.ts`:

- `iconFileName` returns the `-mac` variant on `darwin` and the plain one otherwise.
- `resolveIcons` maps only the ids whose `exists` returns true.
- **Every id in `SERVICES` has both PNG variants present on disk.** This is the test that earns its keep: adding a sixth service without re-running `pnpm run icons` fails the suite instead of shipping a blank slot.

`tests/unit/notification-rules.test.ts` (extend):

- `notificationTitle` passes a real title through and falls back to the service name for empty or whitespace-only input.

## Manual verification

Unit tests cannot prove the OS renders anything. Before calling this done:

1. `pnpm dev`, trigger one notification per service, and confirm the tile appears at the expected size in both light and dark mode.
2. If macOS shows no thumbnail, Electron 43 wants a `NativeImage` rather than a path on darwin. The fix is `nativeImage.createFromPath` against the same unpacked file — one line, and the only cost is the resident memory the path approach was avoiding.
3. `pnpm package:mac`, install, and confirm the thumbnail survives packaging — this is the step that proves the `extraResources` path resolution.

## Out of scope

- Service name in the macOS `subtitle`.
- Any custom notification window.
- User-configurable or per-service icon overrides.
- Linux, which the app does not target.
