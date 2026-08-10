# Graph Report - .  (2026-08-10)

## Corpus Check
- 111 files · ~143,224 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1031 nodes · 1663 edges · 118 communities (67 shown, 51 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 184 edges (avg confidence: 0.86)
- Token cost: 485,681 input · 0 output

## Community Hubs (Navigation)
- Tray Icons & Activation
- Renderer Shell UI
- Notification Icon Pipeline
- Main State & Waking
- Service Loading Overlay
- Biome Lint Config
- IPC Policy & Overlay
- Update Check Logic
- Service View Manager
- Settings & Waking Screenshots
- Goetia v1 Design Spec
- Release Workflow & Packaging
- Code Signing & Gatekeeper
- Engineering Invariants & Features
- README Media Capture
- Ember Branding & Switcher
- TypeScript Config
- Recipe Registry
- Recipe Runner
- Welcome Screen Component
- Chat-Only Product Guardrails
- App Icon Design
- Package Dependencies
- Shopee & Zalo Recipes
- WhatsApp & Discord Recipes
- Service Onboarding Checklist
- Security Hardening & Update IPC
- Notification Icon Delivery
- Welcome Sections & Dispel
- npm Scripts
- Media Capture Driver
- Ready Poll & Telegram
- CI Release Provenance
- Service Icon Asset Set
- TikTok Service Design
- Loading Page & Showcase
- Restore Last Active Service
- Security Audit Findings
- Update Notifier Design
- Home Surface Composition
- package.json Manifest
- Brand Squircle Icons
- Activation Rules & Tests
- Resilience Manager
- Messenger Recipe Fixtures
- Mute & Notification Rules
- Chat Containment Tips
- Tray Template Icons
- Settings Store
- Emoji Text Extraction
- Shell-Only IPC Channels
- Shot Type Definitions
- Release Script
- Notification Icon Resolver
- TikTok Brand Assets
- Hibernation Rules
- Notification Throttle
- Startup Surface Resolver
- Notification Shim
- Restart E2E Spec
- IPC Sender Validation
- Navigation Policy
- Permission Policy
- Updates E2E Spec
- macOS Template Tray Motif
- Backoff Helper
- External URL Guard
- User Agent Helper
- Visibility Spoof
- Home E2E Spec
- Welcome E2E Spec
- electron-conf Dependency
- Brand Tile Icon Design
- Shopee Default & Settings Risk
- Electron Dependency
- electron-builder Dependency
- happy-dom Dependency
- React Dependency
- Tailwind Dependency
- React Type Definitions
- React DOM Types
- Vite Dependency
- Vite React Plugin
- Vitest Dependency
- Zustand Dependency
- Discord Brand Logo
- Messenger Brand Logo
- Telegram Brand Logo
- WhatsApp Brand Logo
- Zalo Brand Logo
- Loading Page Script
- Origin-Checked Permissions
- Shopee Disabled Default
- Consolidated Badge Label
- connectShell Unsubscribe
- Settings Field Coercion
- Guarded Trusted Click
- Supply Chain Attestation
- Badge Label Duplication
- Close-to-Tray Bricking
- IPC Unsubscribe Leak
- Crash Reload Cap Defeat
- Messenger Count Layout Sweep
- Notification Rate Limit Gap
- openExternal Scheme Allowlist
- Permission Origin Check
- Resize Re-bound Cost
- Zalo Badge Fixture

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 62 edges
2. `ServiceViewManager` - 23 edges
3. `MainState` - 22 edges
4. `Recipe` - 21 edges
5. `AppContext` - 18 edges
6. `serviceById()` - 17 edges
7. `Goetia Chat Client Design Spec` - 16 edges
8. `registerIpcHandlers()` - 15 edges
9. `useShell` - 15 edges
10. `scripts` - 13 edges

## Surprising Connections (you probably didn't know these)
- `createTray()` --references--> `Windows Tray Icon (orange ring mark)`  [INFERRED]
  src/main/tray.ts → resources/tray/tray-win.png
- `createTray()` --references--> `macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina)`  [INFERRED]
  src/main/tray.ts → resources/tray/trayTemplate@2x.png
- `discord.html fixture (guild badges + dot title)` --shares_data_with--> `visiblyPresent()`  [INFERRED]
  tests/fixtures/discord.html → src/preload/recipes/ready.ts
- `whatsapp.html fixture (pane-side mount + '(3)' title)` --shares_data_with--> `visiblyPresent()`  [INFERRED]
  tests/fixtures/whatsapp.html → src/preload/recipes/ready.ts
- `shopee.html fixture (expanded mini-chat, header badge 31)` --shares_data_with--> `chatHeader()`  [INFERRED]
  tests/fixtures/shopee.html → src/preload/recipes/shopee.ts

## Import Cycles
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/menu.ts -> src/main/activate.ts`
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/notifications.ts -> src/main/activate.ts`

## Hyperedges (group relationships)
- **Unsigned distribution: build, verify, and the one-time first-launch gate** — _github_workflows_release_build_job, _github_workflows_release_attestation, _github_workflows_release_checksums, _github_release_body_first_launch_gate, readme_install_first_launch, claude_packaging, docs_superpowers_plans_2026_08_07_code_signing_and_notarization_plan [INFERRED 0.85]
- **Home surface and overlay containment** — docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_any_overlay_open, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_home_open_state, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_activate_show_option, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_rail_sigil, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_welcome_seeded_picker, claude_overlay_invariant [EXTRACTED 1.00]
- **Update check flow: poll, validate, announce, download** — docs_superpowers_plans_2026_08_08_check_for_updates_update_check_lib, docs_superpowers_plans_2026_08_08_check_for_updates_update_checker, docs_superpowers_plans_2026_08_08_check_for_updates_update_state_slice, docs_superpowers_plans_2026_08_08_check_for_updates_update_toast, docs_superpowers_plans_2026_08_08_check_for_updates_gear_dot, docs_superpowers_plans_2026_08_08_check_for_updates_updates_ipc_channels [EXTRACTED 1.00]
- **Launch-surface restore flow (record on change → resolve at launch)** — docs_superpowers_specs_2026_08_10_restore_last_active_service_design_lastactiveid, docs_superpowers_specs_2026_08_10_restore_last_active_service_design_lasthomeopen, docs_superpowers_specs_2026_08_10_restore_last_active_service_design_remembersurface, docs_superpowers_specs_2026_08_10_restore_last_active_service_design_sethomeopen, docs_superpowers_specs_2026_08_10_restore_last_active_service_design_resolvestartupsurface, docs_superpowers_specs_2026_08_10_restore_last_active_service_design_normalize_no_scrub [EXTRACTED 1.00]
- **Shell-surface overlay invariant (no view visible under a surface)** — docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_overlay_invariant, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_anyoverlayopen, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_homeopen_surface, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_buried_modal_bug, docs_superpowers_specs_2026_08_10_restore_last_active_service_design_resolvestartupsurface, docs_superpowers_specs_2026_08_08_welcome_screen_design_resolveactivation [EXTRACTED 1.00]
- **Home picker staged-edit model (stage, name the delta, apply or dispel)** — docs_superpowers_specs_2026_08_10_welcome_sections_and_selling_points_design_welcomesections, docs_superpowers_specs_2026_08_10_welcome_sections_and_selling_points_design_live_vs_staged_axes, docs_superpowers_specs_2026_08_10_welcome_sections_and_selling_points_design_dispel, docs_superpowers_specs_2026_08_10_welcome_sections_and_selling_points_design_picktile, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_summondelta, docs_superpowers_specs_2026_08_08_welcome_screen_design_builddisabledpatch [EXTRACTED 1.00]
- **Quick Switcher surface (both themes)** — docs_media_quick_switcher_dark_quick_switcher_overlay, docs_media_quick_switcher_light_quick_switcher_overlay, docs_media_quick_switcher_dark_query_filter, docs_media_quick_switcher_dark_selected_row_highlight, docs_media_quick_switcher_dark_service_accelerators [INFERRED 0.85]
- **Rail per-tile status signals** — docs_media_rail_badges_dark_unread_badge, docs_media_rail_badges_dark_mute_indicator, docs_media_rail_badges_dark_active_service_glow, docs_media_rail_badges_dark_home_sigil, docs_media_rail_badges_dark_service_roster [EXTRACTED 1.00]
- **Ember visual identity across icon, banner and rail** — docs_media_banner_ember_portal_mark, docs_media_banner_wordmark_gradient, docs_media_banner_ember_palette, docs_media_rail_badges_dark_home_sigil, docs_media_rail_badges_dark_active_service_glow [INFERRED 0.85]
- **Staged Service Enablement Flow on Home** — docs_media_welcome_dark_summoned_section, docs_media_welcome_dark_unbound_section, docs_media_welcome_dark_service_tile_roster, docs_media_welcome_dark_summon_banish_action, docs_media_welcome_dark_dispel_action [EXTRACTED 1.00]
- **Three Product Promise Pillars** — docs_media_welcome_dark_chat_only_pillar, docs_media_welcome_dark_stays_signed_in_pillar, docs_media_welcome_dark_quiet_and_light_pillar, docs_media_welcome_dark_welcome_home_surface [EXTRACTED 1.00]
- **Dark/Light Capture Set Across Shell Surfaces** — docs_media_settings_dark_screenshot, docs_media_settings_light_screenshot, docs_media_waking_dark_screenshot, docs_media_waking_light_screenshot, docs_media_welcome_dark_screenshot, docs_media_welcome_light_screenshot, docs_media_settings_dark_theme_parity [INFERRED 0.85]
- **TikTok service visual identity asset set (rail logo + per-platform notification icons)** — src_renderer_src_assets_logos_tiktok_logo, resources_notification_icons_tiktok_icon, resources_notification_icons_tiktok_mac_icon [INFERRED 0.85]
- **Waking overlay lifecycle (begin, ready, reveal)** — docs_superpowers_plans_2026_08_06_service_loading_screen_waking_flag, docs_superpowers_plans_2026_08_06_service_loading_screen_recipe_ready, docs_superpowers_plans_2026_08_06_service_loading_screen_startreadypoll, docs_superpowers_plans_2026_08_06_service_loading_screen_endswake, docs_superpowers_plans_2026_08_06_service_loading_screen_wakingtracker, docs_superpowers_plans_2026_08_06_service_loading_screen_loadingoverlay, docs_superpowers_plans_2026_08_06_service_loading_screen_syncoverlay [EXTRACTED 1.00]
- **Defense-in-depth around unsandboxed service views** — docs_superpowers_plans_2026_08_07_security_hardening_electron_fuses, docs_superpowers_plans_2026_08_07_security_hardening_issafeexternalurl, docs_superpowers_plans_2026_08_07_security_hardening_permissionallowed, docs_superpowers_plans_2026_08_07_security_hardening_ipcsenderallowed, docs_superpowers_plans_2026_08_07_security_hardening_isnavigationallowed, docs_superpowers_plans_2026_08_07_security_hardening_notificationthrottle, docs_superpowers_plans_2026_08_07_security_hardening_renderer_csp [EXTRACTED 1.00]
- **Bounded-cost / report-on-change pattern for always-on polling** — docs_superpowers_plans_2026_08_07_reliability_and_performance_runner_stale_dedup, docs_superpowers_plans_2026_08_07_reliability_and_performance_setruntime_noop, docs_superpowers_plans_2026_08_07_reliability_and_performance_ready_poll_cap, docs_superpowers_plans_2026_08_07_reliability_and_performance_count_timeout_ms, docs_superpowers_plans_2026_08_07_reliability_and_performance_schedulelayout, docs_superpowers_plans_2026_08_07_reliability_and_performance_messenger_single_pass [INFERRED 0.85]
- **Waking overlay readiness flow** — docs_superpowers_specs_2026_08_06_service_loading_screen_design_waking_flag, docs_superpowers_specs_2026_08_06_service_loading_screen_design_recipe_ready, docs_superpowers_specs_2026_08_06_service_loading_screen_design_service_ready_ipc, docs_superpowers_specs_2026_08_06_service_loading_screen_design_waking_rules, docs_superpowers_specs_2026_08_06_service_loading_screen_design_timeout_reveal, docs_superpowers_specs_2026_08_06_service_loading_screen_design_overlay_module, docs_superpowers_specs_2026_08_06_service_loading_screen_design_waitforready [EXTRACTED 1.00]
- **Shopee chat-focus mechanism** — docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_homepage_entry, docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_chat_focus_css, docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_has_gating, docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_keepalive_pill_click, docs_superpowers_specs_2026_08_06_shopee_chat_focus_design_unread_count [EXTRACTED 1.00]
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

## Communities (118 total, 51 thin omitted)

### Community 0 - "Tray Icons & Activation"
Cohesion: 0.08
Nodes (31): Windows Tray Icon (orange ring mark), macOS Tray Template Icon, LOGO_DIR, OUT_DIR, placeGlyph(), ROOT, tileSvg(), activateService() (+23 more)

### Community 1 - "Renderer Shell UI"
Cohesion: 0.06
Nodes (29): viewBounds(), App(), ContentPlaceholder(), fuzzyScore(), Portal(), logos, QuickSwitcher(), Rail() (+21 more)

### Community 2 - "Notification Icon Pipeline"
Cohesion: 0.06
Nodes (39): Bounded timers and listeners cleared on destroy, We do not own the banner layout, scripts/build-notification-icons.mjs, extraResources icon placement (asarUnpack rejected), resources/notification-icons/*.png committed variants, Every service has both PNG variants on disk (test), iconFileName(id, platform), MAC_INSET_RATIO (28/38) named geometry constants (+31 more)

### Community 3 - "Main State & Waking"
Cohesion: 0.14
Nodes (9): endsWake(), WakeEnd, defaultRuntime(), MainState, WakingTracker, Props, ServiceMeta, ServiceRuntime (+1 more)

### Community 4 - "Service Loading Overlay"
Cohesion: 0.08
Nodes (29): Ember Portal loading page (second renderer entry), endsWake(event, meta) reveal rule, LoadingOverlay WebContentsView, Service loading screen (waking overlay) implementation plan, Recipe.ready(doc) chat-usable check, startReadyPoll in the service preload, syncOverlay visibility rule in broadcast(), tile-breathe rail animation (+21 more)

### Community 5 - "Biome Lint Config"
Cohesion: 0.07
Nodes (26): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+18 more)

### Community 6 - "IPC Policy & Overlay"
Cohesion: 0.10
Nodes (13): ipcSenderAllowed(), BG, LoadingOverlay, LoadingState, api, GoetiaLoadingApi, LoadingState, allowed (+5 more)

### Community 7 - "Update Check Logic"
Cohesion: 0.14
Nodes (9): compareVersions(), isNewer(), parseLatestRelease(), parts(), releaseUrl(), UpdateChecker, UpdateCheckerDeps, harness() (+1 more)

### Community 8 - "Service View Manager"
Cohesion: 0.17
Nodes (3): ServiceViewManager, ViewHooks, ServiceId

### Community 9 - "Settings & Waking Screenshots"
Cohesion: 0.15
Nodes (23): Appearance Settings Panel, Menu Position Setting, Settings Modal Screenshot (Dark), Settings Section Rail, Light/Dark Theme Parity, Theme Setting, Settings Modal Screenshot (Light), Goetia Orbit Sigil Mark (+15 more)

### Community 10 - "Goetia v1 Design Spec"
Cohesion: 0.13
Nodes (21): Goetia v1 Implementation Plan, ShellState Broadcast Pipeline, Badge Aggregator, Close-to-Tray Lifecycle, Electron Desktop Shell Decision, ferdium-recipes (external project), Graphite Minimal Design System, Service Hibernation (+13 more)

### Community 11 - "Release Workflow & Packaging"
Cohesion: 0.11
Nodes (20): Release Workflow Implementation Plan, publish: null Policy, Release Workflow Design, Tag-Push Release Flow, Unsigned Builds Decision, Version/Tag Match Guard, onlyLoadAppFromAsar + embedded asar integrity validation, electron-builder config (Goetia packaging) (+12 more)

### Community 12 - "Code Signing & Gatekeeper"
Cohesion: 0.16
Nodes (19): First-launch Gatekeeper/SmartScreen bypass notice, Release notes preamble (release-body.md), Electron fuses invariant, Minimal macOS entitlements (no dyld env vars), Packaging and packaged-build fuse verification, Goetia Safe Storage keychain prompt on every rebuild, Package the installers (package:mac / package:win), Reproducing the Gatekeeper prompt with xattr quarantine (+11 more)

### Community 13 - "Engineering Invariants & Features"
Cohesion: 0.12
Nodes (19): No view visible while a shell surface is open, Process boundaries: sandboxed shell, unsandboxed service views, Report-on-change broadcast discipline, ResilienceManager crash-count dwell, Developing Goetia, Regression: service switch not broadcast under the setRuntime no-op guard, Goetia features & verification inventory, Service lifecycle & resilience features (+11 more)

### Community 14 - "README Media Capture"
Cohesion: 0.13
Nodes (19): src/shared stays process-agnostic, Build from source via corepack pnpm, Ember Portal branding and accent colors, pnpm media regenerates the README screenshots, Badge shot seeds neverHibernate:false so the injected count survives, Theme-aware banner.svg, Capture driver (scripts/capture-media.mjs), Capture matrix (scripts/lib/shots.mjs, settingsFor) (+11 more)

### Community 15 - "Ember Branding & Switcher"
Cohesion: 0.16
Nodes (19): Ember accent palette, Ember Portal Mark, Goetia Banner (README hero), Tagline: seven chat services, one window, nothing but the chat, Theme-agnostic presentation-attribute fallback, Warm Gradient Wordmark, Quick Switcher query filter, Quick Switcher overlay (dark theme) (+11 more)

### Community 16 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 17 - "Recipe Registry"
Cohesion: 0.22
Nodes (8): discord, recipes, tiktok, arg, serviceId, Counts, UpdateStatus, cases

### Community 18 - "Recipe Runner"
Cohesion: 0.18
Nodes (6): startRecipe(), Recipe, harness(), recipe, harness(), harness()

### Community 19 - "Welcome Screen Component"
Cohesion: 0.20
Nodes (8): logos, Welcome(), buildDisabledPatch(), services(), SummonDelta, summonLabel(), WelcomeSections, label()

### Community 20 - "Chat-Only Product Guardrails"
Cohesion: 0.17
Nodes (17): Product principle: chat ONLY, chatPaths snapback containment, Service composition lives on Home, never Settings, Definition of done (lint, typecheck, test, e2e), Fresh installs start with every service disabled, Goetia engineering guardrails, resolveStartupSurface restores the last surface, DEFAULT_SETTINGS.disabled flipped all-true (+9 more)

### Community 21 - "App Icon Design"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 22 - "Package Dependencies"
Cohesion: 0.13
Nodes (15): @biomejs/biome, electron-vite, devDependencies, @biomejs/biome, electron-vite, @playwright/test, react-dom, @resvg/resvg-js (+7 more)

### Community 23 - "Shopee & Zalo Recipes"
Cohesion: 0.17
Nodes (10): chatHeader(), shopee, zalo, shopee-collapsed.html fixture (collapsed pill badge 5), Collapsed pill as keep-alive click target (single wrapper child = not ready), shopee.html fixture (expanded mini-chat, header badge 31), Shopee mini-chat expanded state (wrapper has header + body children), zalo-dormant.html fixture (idle-deactivation activation modal) (+2 more)

### Community 24 - "WhatsApp & Discord Recipes"
Cohesion: 0.16
Nodes (10): unreadFromTitle(), countWhatsAppChats(), whatsapp, WhatsAppChat, discord.html fixture (guild badges + dot title), Orphan numberBadge exclusion (badge must be nested in lowerBadge), Discord bullet-prefixed title as indirect-unread signal, whatsapp.html fixture (pane-side mount + '(3)' title) (+2 more)

### Community 25 - "Service Onboarding Checklist"
Cohesion: 0.18
Nodes (14): Adding a service checklist, Navigation containment (ALLOWED_HOSTS, guard not yet wired), Recipe count() cost rules (cheap, always settles), Recipes adapted from ferdium-recipes (selector + fixture pair), Not yet wired / known limits, Per-service recipes inventory, Single-pass Messenger unread detection, TikTok Chat Service implementation plan (+6 more)

### Community 26 - "Security Hardening & Update IPC"
Cohesion: 0.21
Nodes (14): External links only behind isSafeExternalUrl, IPC registration and shell-only/service classification, Renderer CSP lockdown (default-src 'self'), Security hardening inventory, Update check feature entry, Fetch lives in main because the renderer CSP is default-src 'self', Check for updates implementation plan, update-check.ts pure version logic (+6 more)

### Community 27 - "Notification Icon Delivery"
Cohesion: 0.14
Nodes (14): Ship notification icons via extraResources (outside the asar), iconFileName(id, platform), NativeImage icon fallback for Electron 43 on darwin, NotificationRouter.handle wiring, notificationTitle(raw, fallback), Notification service icons implementation plan, resolveIcons(dir, ids, platform, exists), Build-time tile rasterisation pipeline (+6 more)

### Community 28 - "Welcome Sections & Dispel"
Cohesion: 0.18
Nodes (14): Agent never runs git commit; tasks end by requesting /commit, Welcome sections, Dispel, and selling points implementation plan, Task 3: Dispel button, The one bug this feature can have: partition from `selected` not `enabled`, Section subcomponent in Welcome.tsx, Task 1: welcomeSections partition helper, buildDisabledPatch confirm patch builder, Molten-squircle service picker with staged selection (+6 more)

### Community 29 - "npm Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, e2e, icons, lint, media, package:mac (+5 more)

### Community 30 - "Media Capture Driver"
Cohesion: 0.26
Nodes (8): capture(), isShell(), SURFACES, ALL_SERVICE_IDS, settingsFor(), SHOTS, SURFACES, THEMES

### Community 31 - "Ready Poll & Telegram"
Cohesion: 0.21
Nodes (5): startReadyPoll(), visiblyPresent(), telegram, base, doc

### Community 32 - "CI Release Provenance"
Cohesion: 0.18
Nodes (12): Installer verification: SHA256SUMS + attestation, Build provenance attestation step, Build job (mac arm64/x64 + win matrix), SHA256SUMS.txt generation, CSC_IDENTITY_AUTO_DISCOVERY disabled (no signing material), Publish release job, Tag must match package.json version, Release workflow (tag-triggered) (+4 more)

### Community 33 - "Service Icon Asset Set"
Cohesion: 0.27
Nodes (12): Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed), Telegram macOS Notification Icon (blue squircle, white circle, paper-plane glyph, inset padding), macOS Notification Icon Variant Convention (-mac suffix pairs), Per-Service Notification Icon Asset Set, Brand-Color Squircle Icon Design Language, WhatsApp Notification Icon (green rounded-square badge, white speech-bubble handset glyph, full bleed), WhatsApp macOS Notification Icon (green squircle, white speech-bubble handset glyph, inset padding), Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed) (+4 more)

### Community 34 - "TikTok Service Design"
Cohesion: 0.25
Nodes (11): TikTok chat service design, ALLOWED_HOSTS.tiktok navigation containment, Count from the Messages nav badge, not a chat-list scan, data-e2e selector calibration risk, synthNotification for push-delegating sites, TikTok recipe (count / ready / synthNotification), TikTok service registration (SERVICES + DEFAULT_SETTINGS), tiktok.html recipe fixture (+3 more)

### Community 35 - "Loading Page & Showcase"
Cohesion: 0.25
Nodes (11): Dismissal is a setTimeout; the drain bar is decoration, README showcase design, scripts/capture-media.mjs, Byte-identical captures via emulateMedia reducedMotion, MD033 inline-HTML allowlist, Screenshots show only Goetia's own chrome, Portal hero extracted from the loading screen, loading.html (waking overlay page) (+3 more)

### Community 36 - "Restore Last Active Service"
Cohesion: 0.33
Nodes (10): Restore the last active service implementation plan, ELECTRON_RUN_AS_NODE breaks Playwright Electron launch, restart.spec.ts quit-and-reopen e2e (shared profile directory), Restore the last active service design, Settings.lastActiveId, Settings.lastHomeOpen, normalize() must not scrub an unknown lastActiveId, rememberSurface(ctx) (+2 more)

### Community 37 - "Security Audit Findings"
Cohesion: 0.22
Nodes (9): Accepted residual risk (same-user malware, notarization out of scope), Hardening & remediation design, [Critical] No Electron fuses configured, [Medium] IPC has no sender/origin validation, [High] No navigation containment on service views, [Medium] Release supply chain (mutable action tags, no provenance), Threat A — local malware as the same user, Threat B — hostile web content inside a service view (+1 more)

### Community 38 - "Update Notifier Design"
Cohesion: 0.25
Nodes (9): Check for updates design, The announce gate (latest vs announce), Rail gear dot as the durable update record, Notifier, not auto-updater, shouldAutoRecheck and updatePending (2026-08-09 amendment), Automatic update failures are silent, UpdateChecker lifecycle (src/main/updates.ts), UpdateToast self-dismissing announcement (+1 more)

### Community 39 - "Home Surface Composition"
Cohesion: 0.31
Nodes (9): Welcome screen design, Welcome is derived, not flagged, resolveActivation (runtime re-homing after a composition change), Home screen and service composition design, anyOverlayOpen pure predicate, The buried Settings modal bug, homeOpen: Home is a surface, Welcome is its content, No service view visible while a shell surface is open (+1 more)

### Community 40 - "package.json Manifest"
Cohesion: 0.22
Nodes (8): description, main, name, packageManager, private, productName, type, version

### Community 41 - "Brand Squircle Icons"
Cohesion: 0.36
Nodes (9): Brand squircle notification icon system (128x128 RGBA, white glyph on brand fill), Discord notification icon (full-bleed), Discord notification icon (macOS inset variant), macOS `-mac` inset icon variant convention, Messenger notification icon (full-bleed), Messenger notification icon (macOS inset variant), Shopee notification icon (full-bleed), Shopee notification icon (macOS inset variant) (+1 more)

### Community 44 - "Messenger Recipe Fixtures"
Cohesion: 0.29
Nodes (6): isUnreadRow(), messenger, messenger.html fixture (chat-row unread oracle), Green presence dot excluded from unread count (only blue dot counts), messenger-reaction.html fixture (synthesized reaction notification), Messenger unread-row signals (bold weight, blue dot, 'Unread message' text)

### Community 45 - "Mute & Notification Rules"
Cohesion: 0.33
Nodes (7): Mute means silence, never blindness, Throttled NotificationRouter is the only banner path, One sound per message (synthetic banners only), Every global-mute path goes through ctx.setGlobalMuted, Notifications features (synthetic, shim, mute, throttle), Announce gate: hold the toast while the window is hidden, Muting means silence, not blindness (user doc)

### Community 46 - "Chat Containment Tips"
Cohesion: 0.33
Nodes (7): Task 4: three non-overlapping tip cards, Chat ONLY product principle (post-ship feedback), chatPaths SPA-routing containment, Never hide DivSideNavPlaceholder — it hosts the DM drawer, The six README selling points, Three cards that sell three things, DivDrawerContainer hosts the DM conversation list

### Community 47 - "Tray Template Icons"
Cohesion: 0.29
Nodes (7): Goetia, Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Template Image Convention, Goetia macOS Template Tray Icon, Windows System Tray

### Community 48 - "Settings Store"
Cohesion: 0.52
Nodes (3): normalize(), SettingsStore, Settings

### Community 49 - "Emoji Text Extraction"
Cohesion: 0.43
Nodes (4): collect(), glyph(), textWithEmoji(), Emoji delivered as <img alt> inside the row preview

### Community 50 - "Shell-Only IPC Channels"
Cohesion: 0.40
Nodes (6): parseLatestRelease tag_name validation, Pure update-check layer (compareVersions, isNewer, releaseUrl), updates:check and updates:openDownload (shell-only channels), home:setOpen shell-only IPC channel, Rail leading sigil and ⌘/Ctrl 0 accelerator, setHomeOpen(ctx, open)

### Community 51 - "Shot Type Definitions"
Cohesion: 0.33
Nodes (5): SeededSettings, ServiceId, Shot, Surface, Theme

### Community 52 - "Release Script"
Cohesion: 0.60
Nodes (5): die(), run(), release.sh script, skip(), step()

### Community 53 - "Notification Icon Resolver"
Cohesion: 0.53
Nodes (3): iconFileName(), resolveIcons(), ICON_DIR

### Community 54 - "TikTok Brand Assets"
Cohesion: 0.70
Nodes (5): TikTok Notification Icon (default/Windows-Linux), TikTok Notification Icon (macOS variant), Platform-suffixed notification icon variant convention, TikTok Logo Mark (renderer SVG), Monochrome white glyph logo style (no brand fill)

### Community 55 - "Hibernation Rules"
Cohesion: 0.50
Nodes (3): HibernationCandidate, shouldHibernate(), base

### Community 59 - "Restart E2E Spec"
Cohesion: 0.50
Nodes (3): isShell(), launch(), TWO_ENABLED

### Community 60 - "IPC Sender Validation"
Cohesion: 0.50
Nodes (4): ipcSenderAllowed sender-origin policy, register() IPC dispatcher wrapper, ServiceViewManager.serviceIdForWebContentsId, SHELL_ONLY_CHANNELS classification

### Community 64 - "macOS Template Tray Motif"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

## Ambiguous Edges - Review These
- `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` → `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`  [AMBIGUOUS]
  resources/notification-icons/zalo.png · relation: semantically_similar_to
- `Platform-suffixed notification icon variant convention` → `Monochrome white glyph logo style (no brand fill)`  [AMBIGUOUS]
  src/renderer/src/assets/logos/tiktok.svg · relation: conceptually_related_to

## Knowledge Gaps
- **195 isolated node(s):** `HibernationCandidate`, `allowed`, `api`, `GoetiaApi`, `logos` (+190 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` and `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Platform-suffixed notification icon variant convention` and `Monochrome white glyph logo style (no brand fill)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ServiceId` connect `Service View Manager` to `Tray Icons & Activation`, `Renderer Shell UI`, `Main State & Waking`, `IPC Policy & Overlay`, `Activation Rules & Tests`, `Resilience Manager`, `Settings Store`, `Recipe Registry`, `Recipe Runner`, `Welcome Screen Component`, `Notification Icon Resolver`, `Notification Throttle`, `Startup Surface Resolver`, `Navigation Policy`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `Goetia v1 Implementation Plan` connect `Goetia v1 Design Spec` to `WhatsApp & Discord Recipes`, `Messenger Recipe Fixtures`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `load()` connect `WhatsApp & Discord Recipes` to `Recipe Registry`, `Messenger Recipe Fixtures`, `Shopee & Zalo Recipes`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `HibernationCandidate`, `allowed`, `api` to the rest of the system?**
  _195 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tray Icons & Activation` be split into smaller, more focused modules?**
  _Cohesion score 0.07868852459016394 - nodes in this community are weakly interconnected._