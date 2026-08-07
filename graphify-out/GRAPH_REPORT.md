# Graph Report - /Users/lap02445/workspace/gh_leo/goetia  (2026-08-07)

## Corpus Check
- 113 files · ~68,431 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 731 nodes · 1163 edges · 66 communities (47 shown, 19 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 141 edges (avg confidence: 0.89)
- Token cost: 413,120 input · 0 output

## Community Hubs (Navigation)
- Window, Tray & Hibernation
- Security Policy Helpers
- Feature & Verification Inventory
- Build Dependencies
- Renderer UI & Badges
- Release Workflow & Provenance
- Waking Rules & Main State
- Biome Config
- Notification Delivery & Icons
- V1 Design Decisions
- Package Manifest
- Packaging & Fuse Invariants
- TypeScript Config
- Discord, Telegram & WhatsApp Recipes
- App Icon Design
- Messenger Recipe & Emoji Text
- Recipe Runner Contract
- Telegram/WhatsApp/Zalo Icon Assets
- Readiness Signals & IPC Guards
- Preload Shims
- Recipe Cost Rules
- Zalo Recipe & Keep-Alive
- Discord/Messenger/Shopee Icon Assets
- Shopee Chat Focus & Navigation
- Threat Model & Hardening
- Ready Polling
- Tray Icon Conventions
- Notification Icon Build Script
- Loading Overlay
- Shopee Recipe
- Engineering Guardrails
- Waking Flag & lib/ Helpers
- Notification Router & Throttle
- Renderer CSP & Ember Portal
- Loading Preload API
- Settings Normalization
- IPC Sender Policy
- Hibernation Rules
- Title Unread Parsing
- Close-to-Tray Lifecycle
- Tray Template Motif
- Backoff Helper
- User Agent Helper
- External Link Gate
- Permission Policy
- Report-on-Change Dedup
- Crash Resilience Dwell
- Resize Coalescing
- CI Supply Chain
- Notification Icon Design
- Discord Branding
- Messenger Branding
- Telegram Branding
- WhatsApp Branding
- Zalo Branding
- Loading Renderer Entry
- connectShell Unsubscribe
- connectShell Leak Finding
- Zalo 5+ Badge Fixture

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 51 edges
2. `ServiceViewManager` - 21 edges
3. `Recipe` - 19 edges
4. `AppContext` - 17 edges
5. `Goetia Chat Client Design Spec` - 16 edges
6. `MainState` - 16 edges
7. `serviceById()` - 16 edges
8. `scripts` - 12 edges
9. `compilerOptions` - 11 edges
10. `useShell` - 11 edges

## Surprising Connections (you probably didn't know these)
- `createTray()` --references--> `Windows Tray Icon (orange ring mark)`  [INFERRED]
  src/main/tray.ts → resources/tray/tray-win.png
- `createTray()` --references--> `macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina)`  [INFERRED]
  src/main/tray.ts → resources/tray/trayTemplate@2x.png
- `Emoji delivered as <img alt> inside the row preview` --conceptually_related_to--> `textWithEmoji()`  [INFERRED]
  tests/fixtures/messenger-reaction.html → src/preload/recipes/emoji-text.ts
- `shopee.html fixture (expanded mini-chat, header badge 31)` --shares_data_with--> `chatHeader()`  [INFERRED]
  tests/fixtures/shopee.html → src/preload/recipes/shopee.ts
- `shopee-collapsed.html fixture (collapsed pill badge 5)` --references--> `shopee`  [INFERRED]
  tests/fixtures/shopee-collapsed.html → src/preload/recipes/shopee.ts

## Import Cycles
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/notifications.ts -> src/main/activate.ts`

## Hyperedges (group relationships)
- **Waking overlay lifecycle (begin, ready, reveal)** — docs_superpowers_plans_2026_08_06_service_loading_screen_waking_flag, docs_superpowers_plans_2026_08_06_service_loading_screen_recipe_ready, docs_superpowers_plans_2026_08_06_service_loading_screen_startreadypoll, docs_superpowers_plans_2026_08_06_service_loading_screen_endswake, docs_superpowers_plans_2026_08_06_service_loading_screen_wakingtracker, docs_superpowers_plans_2026_08_06_service_loading_screen_loadingoverlay, docs_superpowers_plans_2026_08_06_service_loading_screen_syncoverlay [EXTRACTED 1.00]
- **Defense-in-depth around unsandboxed service views** — docs_superpowers_plans_2026_08_07_security_hardening_electron_fuses, docs_superpowers_plans_2026_08_07_security_hardening_issafeexternalurl, docs_superpowers_plans_2026_08_07_security_hardening_permissionallowed, docs_superpowers_plans_2026_08_07_security_hardening_ipcsenderallowed, docs_superpowers_plans_2026_08_07_security_hardening_isnavigationallowed, docs_superpowers_plans_2026_08_07_security_hardening_notificationthrottle, docs_superpowers_plans_2026_08_07_security_hardening_renderer_csp [EXTRACTED 1.00]
- **Bounded-cost / report-on-change pattern for always-on polling** — docs_superpowers_plans_2026_08_07_reliability_and_performance_runner_stale_dedup, docs_superpowers_plans_2026_08_07_reliability_and_performance_setruntime_noop, docs_superpowers_plans_2026_08_07_reliability_and_performance_ready_poll_cap, docs_superpowers_plans_2026_08_07_reliability_and_performance_count_timeout_ms, docs_superpowers_plans_2026_08_07_reliability_and_performance_schedulelayout, docs_superpowers_plans_2026_08_07_reliability_and_performance_messenger_single_pass [INFERRED 0.85]
- **Waking overlay readiness flow** — docs_superpowers_specs_2026_08_06_service_loading_screen_design_waking_flag, docs_superpowers_specs_2026_08_06_service_loading_screen_design_recipe_ready, docs_superpowers_specs_2026_08_06_service_loading_screen_design_service_ready_ipc, docs_superpowers_specs_2026_08_06_service_loading_screen_design_waking_rules, docs_superpowers_specs_2026_08_06_service_loading_screen_design_timeout_reveal, docs_superpowers_specs_2026_08_06_service_loading_screen_design_overlay_module, docs_superpowers_specs_2026_08_06_service_loading_screen_design_waitforready [EXTRACTED 1.00]
- **Goetia security invariant set (never weaken)** — claude_electron_fuses, claude_mac_entitlements, claude_ipc_register_wrapper, claude_issafeexternalurl, claude_permissionallowed, claude_navigation_policy, claude_renderer_csp, claude_notificationrouter [EXTRACTED 1.00]
- **Shopee chat-focus mechanism** — docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_homepage_entry, docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_chat_focus_css, docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_has_gating, docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_keepalive_pill_click, docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_unread_count [EXTRACTED 1.00]
- **Tagged release pipeline: version gate, matrix build, attestation, publish** — _github_workflows_release_tag_version_check, _github_workflows_release_build_job, _github_workflows_release_build_provenance_attestation, _github_workflows_release_installer_artifacts, _github_workflows_release_release_job [EXTRACTED 1.00]
- **macOS ad-hoc hardening set: fuses, entitlements, identity, re-signing** — electron_builder_electronfuses, electron_builder_mac_entitlements, electron_builder_mac_adhoc_identity, electron_builder_reset_adhoc_darwin_signature, _github_workflows_release_csc_identity_auto_discovery_off [INFERRED 0.95]
- **Shell renderer containment: self-only CSP across both shell documents** — src_renderer_index_csp, src_renderer_loading_csp, src_renderer_index_shell_document, src_renderer_loading_document [INFERRED 0.95]
- **Fixture DOM oracles for recipe unread counts** — tests_fixtures_discord_fixture, tests_fixtures_messenger_fixture, tests_fixtures_shopee_fixture, tests_fixtures_whatsapp_fixture, tests_fixtures_shopee_collapsed_fixture [INFERRED 0.85]
- **Degraded-page states requiring a keep-alive click** — tests_fixtures_zalo_dormant_fixture, tests_fixtures_shopee_collapsed_fixture, tests_fixtures_zalo_dormant_trusted_activation_click, tests_fixtures_shopee_collapsed_pill_keepalive_target [INFERRED 0.85]
- **Title-derived unread signals (no DOM count available)** — tests_fixtures_whatsapp_title_count_fallback, tests_fixtures_discord_title_dot_indirect, tests_fixtures_whatsapp_fixture, tests_fixtures_discord_fixture [INFERRED 0.75]
- **Paired base/-mac notification icon assets per service** — resources_notification_icons_discord_icon, resources_notification_icons_discord_mac_icon, resources_notification_icons_messenger_icon, resources_notification_icons_messenger_mac_icon, resources_notification_icons_shopee_icon, resources_notification_icons_shopee_mac_icon [INFERRED 0.85]
- **Shared design language: white glyph centred on solid brand-colour squircle** — resources_notification_icons_discord_icon, resources_notification_icons_messenger_icon, resources_notification_icons_shopee_icon, resources_notification_icons_discord_brand_squircle_icon_system [INFERRED 0.85]
- **macOS inset variants sized for banner rounding/shadow** — resources_notification_icons_discord_mac_icon, resources_notification_icons_messenger_mac_icon, resources_notification_icons_shopee_mac_icon, resources_notification_icons_discord_mac_inset_variant_convention [INFERRED 0.85]
- **Chat-service notification icon assets (default platform variants)** — resources_notification_icons_telegram_icon, resources_notification_icons_whatsapp_icon, resources_notification_icons_zalo_icon, resources_notification_icons_telegram_service_notification_icon_set [INFERRED 0.85]
- **macOS -mac icon variants sharing the inset-padding convention** — resources_notification_icons_telegram_mac_icon, resources_notification_icons_whatsapp_mac_icon, resources_notification_icons_zalo_mac_icon, resources_notification_icons_telegram_mac_platform_variant_convention [INFERRED 0.85]
- **Per-service visual identity assets across renderer UI and OS notifications** — src_renderer_src_assets_logos_shopee_shopee, resources_notification_icons_telegram_icon, resources_notification_icons_whatsapp_icon, resources_notification_icons_zalo_icon, src_renderer_src_assets_logos_shopee_service_identity_asset_pipeline [INFERRED 0.75]
- **Unread/notification data flow (preload -> main -> UI)** — docs_superpowers_specs_2026_08_04_goetia_chat_client_design_unisolated_service_preload, docs_superpowers_specs_2026_08_04_goetia_chat_client_design_unread_recipes, docs_superpowers_specs_2026_08_04_goetia_chat_client_design_badge_aggregator, docs_superpowers_specs_2026_08_04_goetia_chat_client_design_notification_router, docs_superpowers_plans_2026_08_04_goetia_v1_shellstate_broadcast [EXTRACTED 1.00]

## Communities (66 total, 19 thin omitted)

### Community 0 - "Window, Tray & Hibernation"
Cohesion: 0.07
Nodes (34): Windows Tray Icon (orange ring mark), macOS Tray Template Icon, activateService(), HibernationController, userDataArg, AppContext, register(), registerIpcHandlers() (+26 more)

### Community 1 - "Security Policy Helpers"
Cohesion: 0.07
Nodes (13): isSafeExternalUrl(), viewBounds(), ALLOWED_HOSTS, isNavigationAllowed(), NotificationThrottle, GRANTED, permissionAllowed(), ResilienceManager (+5 more)

### Community 2 - "Feature & Verification Inventory"
Cohesion: 0.05
Nodes (49): Regression: service switch not broadcast after setRuntime no-op guard, External-link allowlist (only http(s) reach the OS browser), Goetia features & verification inventory, Hibernation of idle services, Keep-alive trusted clicks, Loading / waking overlay, Navigation allowlist (helper exists, guard not wired), One window, many services (WebContentsView per service) (+41 more)

### Community 3 - "Build Dependencies"
Cohesion: 0.05
Nodes (39): @biomejs/biome, conf, electron, electron-builder, electron-vite, happy-dom, devDependencies, @biomejs/biome (+31 more)

### Community 4 - "Renderer UI & Badges"
Cohesion: 0.11
Nodes (17): App(), ContentPlaceholder(), fuzzyScore(), renderOverlayDataUrl(), logos, QuickSwitcher(), Rail(), close() (+9 more)

### Community 5 - "Release Workflow & Provenance"
Cohesion: 0.07
Nodes (35): build job (mac/win matrix), Build provenance attestation (SLSA, id-token), CSC_IDENTITY_AUTO_DISCOVERY=false (no CI signing identity), Installer artifacts (dist/*.dmg, dist/*.exe), SHA-pinned GitHub Actions (supply-chain pinning), release job (Publish release), Release Workflow (tag-triggered), Tag/package.json version gate (+27 more)

### Community 6 - "Waking Rules & Main State"
Cohesion: 0.14
Nodes (10): endsWake(), WakeEnd, defaultRuntime(), MainState, WakingTracker, logos, Props, ServiceTile() (+2 more)

### Community 7 - "Biome Config"
Cohesion: 0.08
Nodes (25): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+17 more)

### Community 8 - "Notification Delivery & Icons"
Cohesion: 0.08
Nodes (26): Crash resilience with backoff and a reload cap, Electron fuses (packaged-binary lockdown), Native OS notifications with per-service icons, Notification shim (page Notification API rerouted to native), Unsigned distribution gate (Gatekeeper / SmartScreen), Ship notification icons via extraResources (outside the asar), iconFileName(id, platform), NativeImage icon fallback for Electron 43 on darwin (+18 more)

### Community 9 - "V1 Design Decisions"
Cohesion: 0.13
Nodes (21): Goetia v1 Implementation Plan, ShellState Broadcast Pipeline, Badge Aggregator, Close-to-Tray Lifecycle, Electron Desktop Shell Decision, ferdium-recipes (external project), Graphite Minimal Design System, Service Hibernation (+13 more)

### Community 10 - "Package Manifest"
Cohesion: 0.10
Nodes (20): description, main, name, packageManager, private, productName, scripts, build (+12 more)

### Community 11 - "Packaging & Fuse Invariants"
Cohesion: 0.11
Nodes (20): Adding a service checklist, Electron fuses invariant (electron-builder.yml), build/entitlements.mac.plist minimal entitlement set, Ad-hoc signed packaging and fuse verification, Goetia Safe Storage keychain re-prompt per build, We do not own the banner layout, scripts/build-notification-icons.mjs, extraResources icon placement (asarUnpack rejected) (+12 more)

### Community 12 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 13 - "Discord, Telegram & WhatsApp Recipes"
Cohesion: 0.18
Nodes (12): discord, recipes, visiblyPresent(), telegram, countWhatsAppChats(), whatsapp, WhatsAppChat, discord.html fixture (guild badges + dot title) (+4 more)

### Community 14 - "App Icon Design"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 15 - "Messenger Recipe & Emoji Text"
Cohesion: 0.19
Nodes (10): collect(), glyph(), textWithEmoji(), isUnreadRow(), messenger, messenger.html fixture (chat-row unread oracle), Green presence dot excluded from unread count (only blue dot counts), Emoji delivered as <img alt> inside the row preview (+2 more)

### Community 16 - "Recipe Runner Contract"
Cohesion: 0.27
Nodes (5): startRecipe(), Recipe, Counts, harness(), harness()

### Community 17 - "Telegram/WhatsApp/Zalo Icon Assets"
Cohesion: 0.27
Nodes (12): Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed), Telegram macOS Notification Icon (blue squircle, white circle, paper-plane glyph, inset padding), macOS Notification Icon Variant Convention (-mac suffix pairs), Per-Service Notification Icon Asset Set, Brand-Color Squircle Icon Design Language, WhatsApp Notification Icon (green rounded-square badge, white speech-bubble handset glyph, full bleed), WhatsApp macOS Notification Icon (green squircle, white speech-bubble handset glyph, inset padding), Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed) (+4 more)

### Community 18 - "Readiness Signals & IPC Guards"
Cohesion: 0.20
Nodes (11): Bounded timers and listener teardown, IPC register() wrapper enforcing ipcSenderAllowed, SHELL_ONLY_CHANNELS channel classification, messenger.ready(): chat list rows exist, Recipe.ready?(doc): boolean, service:ready IPC channel, shopee.ready(): mini-chat expanded, Synthetic input does not reach invisible views (+3 more)

### Community 19 - "Preload Shims"
Cohesion: 0.25
Nodes (5): installNotificationShim(), NotifyForward, installVisibilitySpoof(), arg, serviceId

### Community 20 - "Recipe Cost Rules"
Cohesion: 0.20
Nodes (9): count(doc) must be cheap and always settle, ServiceTile breathes while waking, tests/fixtures/shopee.html structural fixture, Shopee unread count from host textContent, [Low] Badge-label logic duplicated with divergent caps, [High/Medium] Messenger count() style/layout sweep every 2s, ferdium-recipes (Apache-2.0) upstream, Per-service unread-count recipes (src/preload/recipes/) (+1 more)

### Community 21 - "Zalo Recipe & Keep-Alive"
Cohesion: 0.24
Nodes (6): zalo, shopee-collapsed.html fixture (collapsed pill badge 5), Collapsed pill as keep-alive click target (single wrapper child = not ready), zalo-dormant.html fixture (idle-deactivation activation modal), Zalo idle-deactivation (app unmounted behind 'Kích hoạt' modal, counts freeze), Trusted activation click requirement (synthetic events rejected by the session gate)

### Community 22 - "Discord/Messenger/Shopee Icon Assets"
Cohesion: 0.36
Nodes (9): Brand squircle notification icon system (128x128 RGBA, white glyph on brand fill), Discord notification icon (full-bleed), Discord notification icon (macOS inset variant), macOS `-mac` inset icon variant convention, Messenger notification icon (full-bleed), Messenger notification icon (macOS inset variant), Shopee notification icon (full-bleed), Shopee notification icon (macOS inset variant) (+1 more)

### Community 23 - "Shopee Chat Focus & Navigation"
Cohesion: 0.29
Nodes (8): isNavigationAllowed / ALLOWED_HOSTS navigation containment, 10 s timeout reveal fallback, Shopee anti-bot captcha wall, Chat-focus recipe CSS (hide #main, fix host to inset 0), :has() expanded-state gating of every CSS rule, Entry URL decision: https://shopee.vn/, No webRequest network filtering for Shopee, [High] No navigation containment on service views

### Community 24 - "Threat Model & Hardening"
Cohesion: 0.25
Nodes (8): Hardening & remediation design, [Medium] IPC has no sender/origin validation, [Medium] Release supply chain (mutable action tags, no provenance), Threat A — local malware as the same user, Threat B — hostile web content inside a service view, Threat C — tampered app/update supply chain, Isolated persist:<id> session per service, Release cut by pushing a version tag

### Community 25 - "Ready Polling"
Cohesion: 0.29
Nodes (3): startReadyPoll(), base, doc

### Community 26 - "Tray Icon Conventions"
Cohesion: 0.29
Nodes (7): Goetia, Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Template Image Convention, Goetia macOS Template Tray Icon, Windows System Tray

### Community 27 - "Notification Icon Build Script"
Cohesion: 0.33
Nodes (5): LOGO_DIR, OUT_DIR, placeGlyph(), ROOT, tileSvg()

### Community 29 - "Shopee Recipe"
Cohesion: 0.38
Nodes (4): chatHeader(), shopee, shopee.html fixture (expanded mini-chat, header badge 31), Shopee mini-chat expanded state (wrapper has header + body children)

### Community 30 - "Engineering Guardrails"
Cohesion: 0.33
Nodes (6): Definition of done (lint, typecheck, test, e2e, real package build), Goetia engineering guardrails, Process boundaries: sandboxed shell, unsandboxed service views, src/shared stays process-agnostic, Hardening testing strategy, corepack pnpm invocation workflow

### Community 31 - "Waking Flag & lib/ Helpers"
Cohesion: 0.33
Nodes (6): Pure decision logic lives in lib/ helpers, Service loading screen (waking overlay) design, ServiceRuntime.waking flag, src/main/lib/waking-rules.ts, Shopee chat-focus design, [Low, Accept] neverHibernate defaults true for all services

### Community 32 - "Notification Router & Throttle"
Cohesion: 0.33
Nodes (6): NotificationRouter with per-service NotificationThrottle, iconFileName(id, platform), notificationTitle(raw, fallback), resolveIcons(dir, ids, platform, exists), NotificationRouter constructor-time icon map, [Medium] No rate limit on notification:fired

### Community 33 - "Renderer CSP & Ember Portal"
Cohesion: 0.33
Nodes (6): Renderer CSP invariant for index.html and loading.html, Ember Portal overlay animation, loading.html second renderer entry, src/main/loading-overlay.ts overlay WebContentsView, [Low] Renderer CSP tightening, Ember Portal branding and icon sources

### Community 34 - "Loading Preload API"
Cohesion: 0.47
Nodes (4): api, GoetiaLoadingApi, LoadingState, Window

### Community 35 - "Settings Normalization"
Cohesion: 0.50
Nodes (5): Corrupt settings.json tolerance, New-service reconciliation in settings normalize, Persisted settings store, Shopee disabled by default, settings normalize per-field coercion

### Community 36 - "IPC Sender Policy"
Cohesion: 0.40
Nodes (5): IPC sender policy (shell-only vs service channels), ipcSenderAllowed sender-origin policy, register() IPC dispatcher wrapper, ServiceViewManager.serviceIdForWebContentsId, SHELL_ONLY_CHANNELS classification

### Community 37 - "Hibernation Rules"
Cohesion: 0.50
Nodes (3): HibernationCandidate, shouldHibernate(), base

### Community 38 - "Title Unread Parsing"
Cohesion: 0.60
Nodes (3): unreadFromTitle(), Discord bullet-prefixed title as indirect-unread signal, Title-parsed count as IndexedDB fallback (no page IDB under test)

### Community 39 - "Close-to-Tray Lifecycle"
Cohesion: 0.67
Nodes (3): One long-lived window lifecycle assumption, [High] 'Close to tray' off bricks the app, Close-to-tray background running

### Community 40 - "Tray Template Motif"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

## Ambiguous Edges - Review These
- `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` → `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`  [AMBIGUOUS]
  resources/notification-icons/zalo.png · relation: semantically_similar_to

## Knowledge Gaps
- **166 isolated node(s):** `HibernationCandidate`, `allowed`, `api`, `GoetiaApi`, `logos` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` and `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `ServiceId` connect `Security Policy Helpers` to `Window, Tray & Hibernation`, `Renderer UI & Badges`, `Waking Rules & Main State`, `Discord, Telegram & WhatsApp Recipes`, `Recipe Runner Contract`, `Preload Shims`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `Goetia v1 Implementation Plan` connect `V1 Design Decisions` to `Discord, Telegram & WhatsApp Recipes`, `Messenger Recipe & Emoji Text`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `HibernationCandidate`, `allowed`, `api` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Window, Tray & Hibernation` be split into smaller, more focused modules?**
  _Cohesion score 0.06738738738738739 - nodes in this community are weakly interconnected._
- **Should `Security Policy Helpers` be split into smaller, more focused modules?**
  _Cohesion score 0.07111756168359942 - nodes in this community are weakly interconnected._
- **Should `Feature & Verification Inventory` be split into smaller, more focused modules?**
  _Cohesion score 0.04591836734693878 - nodes in this community are weakly interconnected._