# Graph Report - .  (2026-08-06)

## Corpus Check
- Corpus is ~33,507 words - fits in a single context window. You may not need a graph.

## Summary
- 382 nodes · 682 edges · 24 communities (19 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.88)
- Token cost: 439,361 input · 0 output

## Community Hubs (Navigation)
- Main Process Lifecycle
- Design Docs & Release Pipeline
- Unread Count Recipes
- Settings & Main State
- Package Dependencies
- Renderer UI Components
- Service Views & Resilience
- Biome Lint Config
- Package Scripts & Metadata
- TypeScript Config
- App Icon Design
- Preload IPC Bridge
- Tray Icon Assets
- Tray Template Motif
- Discord Branding
- Messenger Branding
- Telegram Branding
- WhatsApp Branding
- Zalo Branding

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 37 edges
2. `ServiceViewManager` - 18 edges
3. `Goetia Chat Client Design Spec` - 17 edges
4. `AppContext` - 15 edges
5. `Unread Count Recipes` - 14 edges
6. `scripts` - 11 edges
7. `MainState` - 11 edges
8. `useShell` - 11 edges
9. `serviceById()` - 11 edges
10. `compilerOptions` - 11 edges

## Surprising Connections (you probably didn't know these)
- `createTray()` --references--> `Windows Tray Icon (orange ring mark)`  [INFERRED]
  src/main/tray.ts → resources/tray/tray-win.png
- `createTray()` --references--> `macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina)`  [INFERRED]
  src/main/tray.ts → resources/tray/trayTemplate@2x.png
- `createTray()` --references--> `Goetia macOS Template Tray Icon`  [EXTRACTED]
  src/main/tray.ts → resources/tray/tray-win.svg
- `build matrix job (mac/win)` --references--> `pnpm allowBuilds allowlist`  [INFERRED]
  .github/workflows/release.yml → pnpm-workspace.yaml
- `Goetia README` --references--> `Viber Exclusion`  [EXTRACTED]
  README.md → docs/superpowers/specs/2026-08-04-goetia-chat-client-design.md

## Import Cycles
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/notifications.ts -> src/main/activate.ts`
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/menu.ts -> src/main/activate.ts`

## Hyperedges (group relationships)
- **Fixture-locked recipe test suite** — docs_superpowers_specs_2026_08_04_goetia_chat_client_design_unread_recipes, tests_fixtures_blank_fixture, tests_fixtures_whatsapp_fixture, tests_fixtures_messenger_fixture, tests_fixtures_telegram_fixture, tests_fixtures_discord_fixture, tests_fixtures_zalo_fixture, tests_fixtures_zalo_5plus_fixture [EXTRACTED 1.00]
- **Tag-push release pipeline** — _github_workflows_release_workflow, _github_workflows_release_build_job, _github_workflows_release_release_job, _github_workflows_release_version_guard, electron_builder_config, docs_superpowers_specs_2026_08_05_release_workflow_design_tag_push_release_flow [EXTRACTED 1.00]
- **Unread/notification data flow (preload -> main -> UI)** — docs_superpowers_specs_2026_08_04_goetia_chat_client_design_unisolated_service_preload, docs_superpowers_specs_2026_08_04_goetia_chat_client_design_unread_recipes, docs_superpowers_specs_2026_08_04_goetia_chat_client_design_badge_aggregator, docs_superpowers_specs_2026_08_04_goetia_chat_client_design_notification_router, docs_superpowers_plans_2026_08_04_goetia_v1_shellstate_broadcast [EXTRACTED 1.00]

## Communities (24 total, 5 thin omitted)

### Community 0 - "Main Process Lifecycle"
Cohesion: 0.09
Nodes (20): Windows Tray Icon (orange ring mark), macOS Tray Template Icon, activateService(), applyBadges(), applyOverlay(), HibernationController, userDataArg, AppContext (+12 more)

### Community 1 - "Design Docs & Release Pipeline"
Cohesion: 0.09
Nodes (41): build matrix job (mac/win), release publish job, Tag/version guard step, Release Workflow (GitHub Actions), Goetia v1 Implementation Plan, ShellState Broadcast Pipeline, Release Workflow Implementation Plan, Badge Aggregator (+33 more)

### Community 2 - "Unread Count Recipes"
Cohesion: 0.10
Nodes (17): discord, recipes, messenger, startRecipe(), telegram, unreadFromTitle(), Recipe, countWhatsAppChats() (+9 more)

### Community 3 - "Settings & Main State"
Cohesion: 0.11
Nodes (16): viewBounds(), SettingsStore, defaultRuntime(), MainState, NOTE: backgroundThrottling must stay ON — disabling it also disables, badgeText(), logos, Props (+8 more)

### Community 4 - "Package Dependencies"
Cohesion: 0.05
Nodes (37): @biomejs/biome, conf, electron, electron-builder, electron-vite, happy-dom, devDependencies, @biomejs/biome (+29 more)

### Community 5 - "Renderer UI Components"
Cohesion: 0.13
Nodes (16): App(), ContentPlaceholder(), fuzzyScore(), renderOverlayDataUrl(), logos, QuickSwitcher(), Rail(), close() (+8 more)

### Community 6 - "Service Views & Resilience"
Cohesion: 0.13
Nodes (6): backoffDelay(), ResilienceManager, ServiceViewManager, ViewHooks, ServiceId, url()

### Community 7 - "Biome Lint Config"
Cohesion: 0.08
Nodes (24): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+16 more)

### Community 8 - "Package Scripts & Metadata"
Cohesion: 0.10
Nodes (19): description, main, name, packageManager, private, productName, scripts, build (+11 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 10 - "App Icon Design"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 11 - "Preload IPC Bridge"
Cohesion: 0.26
Nodes (8): allowed, api, GoetiaApi, Window, ShellStore, MainToRenderer, RendererToMain, ShellState

### Community 12 - "Tray Icon Assets"
Cohesion: 0.29
Nodes (7): Goetia, Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Template Image Convention, Goetia macOS Template Tray Icon, Windows System Tray

### Community 13 - "Tray Template Motif"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

## Knowledge Gaps
- **108 isolated node(s):** `$schema`, `indentStyle`, `indentWidth`, `lineWidth`, `preset` (+103 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ServiceId` connect `Service Views & Resilience` to `Main Process Lifecycle`, `Unread Count Recipes`, `Settings & Main State`, `Renderer UI Components`, `Preload IPC Bridge`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `createTray()` connect `Main Process Lifecycle` to `Tray Icon Assets`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `ServiceViewManager` connect `Service Views & Resilience` to `Main Process Lifecycle`, `Settings & Main State`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `$schema`, `indentStyle`, `indentWidth` to the rest of the system?**
  _108 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Main Process Lifecycle` be split into smaller, more focused modules?**
  _Cohesion score 0.09082125603864734 - nodes in this community are weakly interconnected._
- **Should `Design Docs & Release Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.09024390243902439 - nodes in this community are weakly interconnected._
- **Should `Unread Count Recipes` be split into smaller, more focused modules?**
  _Cohesion score 0.09634146341463415 - nodes in this community are weakly interconnected._