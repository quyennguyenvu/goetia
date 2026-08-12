# Graph Report - /Users/lap02445/workspace/gh_leo/goetia  (2026-08-13)

## Corpus Check
- 102 files · ~170,564 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1262 nodes · 2076 edges · 143 communities (96 shown, 47 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 275 edges (avg confidence: 0.86)
- Token cost: 1,195,335 input · 0 output

## Community Hubs (Navigation)
- Update Check & Waking Rules
- Tray & App Icon Assets
- Rail & Tile Reorder
- Badges, Shell & Fuzzy Search
- IPC Sender Policy & Loading Overlay
- Service View Manager
- Biome Lint Config
- Packaging, Signing & Gatekeeper
- Welcome Confirm & Activation
- Discord, Telegram, WhatsApp Recipes
- Recipe Runner & Types
- Security Guardrails Checklist
- Developing Guide & Release Basics
- Main Entry & Accelerators
- Features Inventory & State Broadcast
- TypeScript Config
- Welcome Screen (Dark Theme)
- Update Checker Plan
- Ember Portal App Icon Design
- Startup Surface & Settings Store
- Meta Recipes (Instagram, Messenger)
- Shopee & Zalo Recipes
- Welcome Screen (Light Theme)
- Home Board & Service Ordering
- Dev Dependencies
- README Showcase & Media Capture
- Announce Gate & Surface Persistence
- Mute, Badge & Reorder Invariants
- Lifecycle, Timers & Waking
- Chat-Only Containment Principle
- Notification Icons & Sound
- Welcome Component & Selling Points
- Home Surface Composition
- Version Compare & Settings Normalize
- Electron Fuses & Builder Config
- Package Scripts
- Media Capture Driver
- Rail Badges Screenshot (Dark)
- Slack Icons & Design System
- Telegram, WhatsApp, Zalo Icons
- Process Boundaries & Resilience
- Quick Switcher Screenshot (Dark)
- Settings Modal Screenshots
- Chat Client Design Spec
- Hardening Threat Model
- Portal, Welcome & Board Layout
- Slack & TikTok Recipe Wiring
- Quick Switcher Screenshot (Light)
- Banner SVG Branding
- Slack Service Plan
- Recipe Helpers & Count Rules
- CSP, Permissions & Showcase Claims
- Drag Reorder On Home
- Package Manifest Fields
- Brand Squircle Icon System
- Release Workflow CI
- Recipe Framework & TikTok Selectors
- Rail Badges Screenshot (Light)
- Update IPC Channels & Allowlists
- Notification Throttle & Toast Timing
- Instagram Chat Containment
- Shopee Chat Focus Design
- Slack Count & Ready
- TikTok DM Selectors
- Instagram Rail Space Reclaim
- Home Open State & Accelerator
- Notification Icon Build Script
- Reorder E2E Spec
- Shot Type Definitions
- Release Shell Script
- Notification Icon Resolution
- Emoji Text Extraction
- Messenger Fixtures & Synth
- Title-Based Unread Parsing
- Selector Calibration Risk
- Slack macOS Icon Variant
- TikTok Icon & Logo
- Hibernation Rules
- Notification Throttle Unit
- Notification Shim
- Restart E2E Spec
- Overlay Visibility Invariant
- Instagram macOS Notification Icon
- Navigation Policy
- Permission Policy
- Waking Overlay Page
- Updates E2E Spec
- Slack Notification Icon Asset
- macOS Template Tray Icon
- Backoff Helper
- External URL Guard
- View Layout Bounds
- User Agent Helper
- Visibility Spoof Preload
- Instagram Logo Asset
- Slack Logo Asset
- Home E2E Spec
- Welcome E2E Spec
- Conf Dependency
- Tray Quit & Crash Dwell
- Banner Markdown Embedding
- Electron Dependency
- electron-builder Dependency
- electron-vite Dependency
- happy-dom Dependency
- Motion Dependency
- React Dependency
- React DOM Dependency
- resvg Dependency
- Tailwind Vite Plugin
- React Types
- React DOM Types
- Vite Dependency
- Instagram Icon Convention
- Discord Brand Logo
- Messenger Brand Logo
- Telegram Brand Logo
- WhatsApp Brand Logo
- Zalo Brand Logo
- Loading Caption Preload
- Messenger Unread Signals
- Instagram Tile
- Messenger Tile
- Shopee Tile
- Slack Tile
- Telegram Tile
- WhatsApp Tile
- Coalesced Resize Layout
- pnpm Build Allowlist
- Blank Logged-Out Fixture
- Telegram Recipe Fixture
- Zalo Aggregated Badge Fixture
- Zalo Recipe Fixture

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 64 edges
2. `Recipe` - 25 edges
3. `Goetia engineering guardrails` - 24 edges
4. `ServiceViewManager` - 23 edges
5. `MainState` - 21 edges
6. `serviceById()` - 18 edges
7. `AppContext` - 16 edges
8. `startRecipe()` - 15 edges
9. `registerIpcHandlers()` - 14 edges
10. `Reliability and performance remediation plan` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Emoji delivered as <img alt> inside the row preview` --conceptually_related_to--> `textWithEmoji()`  [INFERRED]
  tests/fixtures/messenger-reaction.html → src/preload/recipes/emoji-text.ts
- `discord.html fixture (guild badges + dot title)` --references--> `discord`  [INFERRED]
  tests/fixtures/discord.html → src/preload/recipes/discord.ts
- `shopee.html fixture (expanded mini-chat, header badge 31)` --shares_data_with--> `chatHeader()`  [INFERRED]
  tests/fixtures/shopee.html → src/preload/recipes/shopee.ts
- `Discord bullet-prefixed title as indirect-unread signal` --conceptually_related_to--> `unreadFromTitle()`  [INFERRED]
  tests/fixtures/discord.html → src/preload/recipes/title.ts
- `Title-parsed count as IndexedDB fallback (no page IDB under test)` --conceptually_related_to--> `unreadFromTitle()`  [INFERRED]
  tests/fixtures/whatsapp.html → src/preload/recipes/title.ts

## Import Cycles
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/notifications.ts -> src/main/activate.ts`

## Hyperedges (group relationships)
- **The hardening controls that together contain a hostile service page** — docs_superpowers_plans_2026_08_07_security_hardening_fuses_task, docs_superpowers_plans_2026_08_07_security_hardening_is_safe_external_url, docs_superpowers_plans_2026_08_07_security_hardening_permission_allowed, docs_superpowers_plans_2026_08_07_security_hardening_ipc_sender_allowed, docs_superpowers_plans_2026_08_07_security_hardening_notification_throttle, docs_superpowers_plans_2026_08_07_security_hardening_navigation_allowlist, docs_superpowers_plans_2026_08_07_security_hardening_csp_tightening [EXTRACTED 1.00]
- **Waking-cover flow from recipe readiness to revealed view** — docs_superpowers_plans_2026_08_06_service_loading_screen_recipe_ready_check, docs_superpowers_plans_2026_08_06_service_loading_screen_ready_poll, docs_superpowers_plans_2026_08_06_service_loading_screen_waking_flag, docs_superpowers_plans_2026_08_06_service_loading_screen_waking_tracker, docs_superpowers_plans_2026_08_06_service_loading_screen_overlay_view, docs_superpowers_plans_2026_08_06_service_loading_screen_tile_breathe [EXTRACTED 1.00]
- **Unread-count pipeline and the cost invariants that shape it** — readme_unread_count_pipeline, docs_superpowers_plans_2026_08_04_goetia_v1_recipe_framework, docs_superpowers_plans_2026_08_04_goetia_v1_badge_aggregation, docs_superpowers_plans_2026_08_04_goetia_v1_main_state_pipeline, claude_count_cost_rules, claude_report_on_change [INFERRED 0.85]
- **Update check flow: poll, state slice, toast, dot** — docs_superpowers_plans_2026_08_08_check_for_updates_update_check_lib, docs_superpowers_plans_2026_08_08_check_for_updates_updatechecker, docs_superpowers_plans_2026_08_08_check_for_updates_updatestate_slice, docs_superpowers_plans_2026_08_08_check_for_updates_toast_rules, docs_superpowers_plans_2026_08_08_check_for_updates_updatetoast, docs_superpowers_plans_2026_08_08_check_for_updates_gear_dot [EXTRACTED 1.00]
- **Pure welcome decision helpers in src/shared/welcome.ts** — docs_superpowers_plans_2026_08_08_welcome_screen_builddisabledpatch, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_summondelta, docs_superpowers_plans_2026_08_10_welcome_sections_and_selling_points_welcomesections, docs_superpowers_plans_2026_08_11_home_board_and_service_ordering_byname, docs_superpowers_plans_2026_08_11_home_board_and_service_ordering_matchesquery, docs_superpowers_plans_2026_08_11_home_board_and_service_ordering_summonorder, docs_superpowers_plans_2026_08_12_tile_reorder_live_gap_enabledkey [INFERRED 0.85]
- **No view may be visible over a shell surface** — docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_anyoverlayopen, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_homeopen, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_show_false, docs_superpowers_plans_2026_08_10_restore_last_active_service_resolvestartupsurface, docs_superpowers_specs_2026_08_06_service_loading_screen_design_loading_overlay [INFERRED 0.85]
- **Home as a shell surface: the overlay invariant end to end** — docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_homeopen_surface, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_home_setopen_channel, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_anyoverlayopen, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_activate_show_option, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_overlay_invariant, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_activateservice_clears_home, docs_superpowers_specs_2026_08_10_restore_last_active_service_design_startup_hidden_activation [EXTRACTED 1.00]
- **src/shared/welcome.ts pure helper family** — docs_superpowers_specs_2026_08_08_welcome_screen_design_builddisabledpatch, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_summondelta, docs_superpowers_specs_2026_08_10_welcome_sections_and_selling_points_design_welcomesections, docs_superpowers_specs_2026_08_11_home_board_and_service_ordering_design_byname, docs_superpowers_specs_2026_08_11_home_board_and_service_ordering_design_summonorder, docs_superpowers_specs_2026_08_11_home_board_and_service_ordering_design_matchesquery [EXTRACTED 1.00]
- **The add-a-service pattern across tiktok, instagram and slack** — docs_superpowers_specs_2026_08_07_tiktok_chat_service_design_tiktok_chat_service, docs_superpowers_specs_2026_08_11_instagram_chat_service_design_instagram_chat_service, docs_superpowers_specs_2026_08_12_slack_service_design_slack_service, docs_superpowers_specs_2026_08_11_instagram_chat_service_design_catalog_position_slotting, docs_superpowers_specs_2026_08_07_tiktok_chat_service_design_chat_paths_containment, docs_superpowers_specs_2026_08_11_instagram_chat_service_design_calibration_caveat, docs_superpowers_specs_2026_08_12_slack_service_design_calibration_caveat [INFERRED 0.85]
- **Goetia Brand Identity System (mark, wordmark, tagline, palette)** — docs_media_banner_ember_portal_mark, docs_media_banner_wordmark, docs_media_banner_tagline, docs_media_banner_ember_palette, resources_icon, src_renderer_src_tokens [INFERRED 0.85]
- **Theme-Agnostic Rendering Strategy (transparent bg, presentation-attribute fallbacks, prefers-color-scheme refinement)** — docs_media_banner_banner, docs_media_banner_theme_resilient_fallback, docs_media_banner_tagline, docs_media_banner_ember_palette [EXTRACTED 1.00]
- **Quick switcher UI composition: query field, ranked service rows, accelerator hints, selection highlight** — docs_media_quick_switcher_dark_overlay_surface, docs_media_quick_switcher_dark_query_filter, docs_media_quick_switcher_dark_service_row_list, docs_media_quick_switcher_dark_accelerator_hint, docs_media_quick_switcher_dark_selected_row_highlight [EXTRACTED 1.00]
- **Fast service reach: type query, ranked match preselected, or press the service's stable accelerator** — docs_media_quick_switcher_dark_keyboard_first_navigation, docs_media_quick_switcher_dark_query_filter, docs_media_quick_switcher_dark_fuzzy_ranking, docs_media_quick_switcher_dark_stable_accelerator_index [INFERRED 0.85]
- **Quick Switcher type-to-filter and select flow** — docs_media_quick_switcher_light_quick_switcher_overlay, docs_media_quick_switcher_light_query_filter, docs_media_quick_switcher_light_match_ranking, docs_media_quick_switcher_light_selection_highlight, docs_media_quick_switcher_light_service_accelerator_hints [INFERRED 0.85]
- **Nine enabled service tiles in rail order (dark screenshot)** — docs_media_rail_badges_dark_discord_tile, docs_media_rail_badges_dark_instagram_tile, docs_media_rail_badges_dark_messenger_tile, docs_media_rail_badges_dark_shopee_tile, docs_media_rail_badges_dark_slack_tile, docs_media_rail_badges_dark_telegram_tile, docs_media_rail_badges_dark_tiktok_tile, docs_media_rail_badges_dark_whatsapp_tile, docs_media_rail_badges_dark_zalo_tile [EXTRACTED 1.00]
- **Per-tile status overlays on the rail (unread, mute, active)** — docs_media_rail_badges_dark_unread_badge, docs_media_rail_badges_dark_mute_indicator, docs_media_rail_badges_dark_active_service_highlight, docs_media_rail_badges_dark_service_rail [INFERRED 0.85]
- **Rail tile state affordances (active, unread, muted) share one tile surface** — docs_media_rail_badges_light_service_rail, docs_media_rail_badges_light_active_tile_highlight, docs_media_rail_badges_light_unread_badge, docs_media_rail_badges_light_mute_indicator, docs_media_rail_badges_light_nine_service_tiles [INFERRED 0.85]
- **Home Enable/Disable Draft-then-Commit Flow** — docs_media_welcome_dark_summoned_section, docs_media_welcome_dark_unbound_section, docs_media_welcome_dark_draft_selection_state, docs_media_welcome_dark_summon_banish_commit, docs_media_welcome_dark_dispel_button [INFERRED 0.85]
- **Occult Design Language Across Welcome Screen** — docs_media_welcome_dark_occult_vocabulary, docs_media_welcome_dark_ember_accent_palette, docs_media_welcome_dark_service_rail, docs_media_welcome_dark_tagline [INFERRED 0.75]
- **Draft-then-commit service enable/disable flow on Home** — docs_media_welcome_light_summoned_section, docs_media_welcome_light_unbound_section, docs_media_welcome_light_draft_selection, docs_media_welcome_light_summon_commit_cta, docs_media_welcome_light_dispel_button [INFERRED 0.85]
- **Occult copy system (summoned / unbound / dispel / banish)** — docs_media_welcome_light_occult_lexicon, docs_media_welcome_light_summoned_section, docs_media_welcome_light_unbound_section, docs_media_welcome_light_summoned_counter, docs_media_welcome_light_dispel_button [INFERRED 0.75]
- **Dark/Light Capture Set Across Shell Surfaces** — docs_media_settings_dark_screenshot, docs_media_settings_light_screenshot, docs_media_waking_dark_screenshot, docs_media_waking_light_screenshot, docs_media_welcome_dark_screenshot, docs_media_welcome_light_screenshot, docs_media_settings_dark_theme_parity [INFERRED 0.85]
- **TikTok service visual identity asset set (rail logo + per-platform notification icons)** — src_renderer_src_assets_logos_tiktok_logo, resources_notification_icons_tiktok_icon, resources_notification_icons_tiktok_mac_icon [INFERRED 0.85]
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

## Communities (143 total, 47 thin omitted)

### Community 0 - "Update Check & Waking Rules"
Cohesion: 0.06
Nodes (21): compareVersions(), isNewer(), parseLatestRelease(), parts(), releaseUrl(), endsWake(), WakeEnd, defaultRuntime() (+13 more)

### Community 1 - "Tray & App Icon Assets"
Cohesion: 0.07
Nodes (27): Goetia, Windows Tray Icon (orange ring mark), Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Tray Template Icon, macOS Template Image Convention, Goetia macOS Template Tray Icon (+19 more)

### Community 2 - "Rail & Tile Reorder"
Cohesion: 0.10
Nodes (19): Rail(), applySubsetOrder(), useTileReorder(), logos, PickTile(), Props, Props, ServiceBand() (+11 more)

### Community 3 - "Badges, Shell & Fuzzy Search"
Cohesion: 0.09
Nodes (19): App(), ContentPlaceholder(), fuzzyScore(), logos, QuickSwitcher(), close(), SectionId, SECTIONS (+11 more)

### Community 4 - "IPC Sender Policy & Loading Overlay"
Cohesion: 0.09
Nodes (15): ipcSenderAllowed(), BG, LoadingOverlay, LoadingState, api, GoetiaLoadingApi, LoadingState, allowed (+7 more)

### Community 5 - "Service View Manager"
Cohesion: 0.15
Nodes (5): NOTE: backgroundThrottling stays ON by default — disabling it also, ServiceViewManager, ViewHooks, RailPosition, ServiceId

### Community 6 - "Biome Lint Config"
Cohesion: 0.07
Nodes (26): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+18 more)

### Community 7 - "Packaging, Signing & Gatekeeper"
Cohesion: 0.13
Nodes (24): First-launch gate walkthrough, Installer checksum and attestation verification, Release notes preamble, Ad-hoc signature re-prompts for Safe Storage, Electron fuses invariant, Minimal macOS entitlements, Packaging and fuse verification, Reproducing the Gatekeeper prompt by hand (+16 more)

### Community 8 - "Welcome Confirm & Activation"
Cohesion: 0.14
Nodes (22): buildDisabledPatch, Welcome confirm flow, resolveActivation, Service picker grid, anyOverlayOpen, Escape leaves Home, Seeded, staged picker, Settings loses the enable toggle (+14 more)

### Community 9 - "Discord, Telegram, WhatsApp Recipes"
Cohesion: 0.12
Nodes (12): discord, startReadyPoll(), visiblyPresent(), telegram, whatsapp, WhatsAppChat, discord.html fixture (guild badges + dot title), Orphan numberBadge exclusion (badge must be nested in lowerBadge) (+4 more)

### Community 10 - "Recipe Runner & Types"
Cohesion: 0.19
Nodes (7): startRecipe(), Recipe, harness(), harness(), recipe, harness(), harness()

### Community 11 - "Security Guardrails Checklist"
Cohesion: 0.16
Nodes (21): Adding a service checklist, Goetia engineering guardrails, External links only via isSafeExternalUrl, Every IPC channel is classified and sender-checked, Navigation containment not yet wired, Permissions granted only via permissionAllowed, Renderer CSP lockdown, Coalesced window resize layout (+13 more)

### Community 12 - "Developing Guide & Release Basics"
Cohesion: 0.11
Nodes (20): Definition of done, corepack pnpm invocation, Ember Portal branding, Developing Goetia guide, pnpm media screenshot regeneration, Recipes adapted from ferdium-recipes, Releases cut by pushing a version tag, Harmless task_policy_set startup error (+12 more)

### Community 13 - "Main Entry & Accelerators"
Cohesion: 0.19
Nodes (10): e2eUpdate, userDataArg, serviceAccelerator(), startUrl(), buildAppMenu(), openSettings(), toggleHome(), serviceById() (+2 more)

### Community 14 - "Features Inventory & State Broadcast"
Cohesion: 0.18
Nodes (19): Report on change only, Service switch needed an explicit state.touch(), Goetia features and verification inventory, Manual checks with no automated coverage, Per-service recipe inventory, Settings, persistence and update check, Shell and navigation features, MainState snapshot and broadcast pipeline (+11 more)

### Community 15 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 16 - "Welcome Screen (Dark Theme)"
Cohesion: 0.15
Nodes (17): Bell (Global Mute) and Gear (Settings) Controls, Dispel Button (Discard Draft Selection), Draft Selection State (Glowing Tiles Pending Commit), Ember Accent on Near-Black Ground (Dark Theme Palette), Find a Service Filter Field, Home / Welcome Surface, Occult Vocabulary UI Language (Summon/Banish/Dispel/Unbound/Sigil), Goetia Welcome Screen Screenshot (Dark Theme) (+9 more)

### Community 17 - "Update Checker Plan"
Cohesion: 0.18
Nodes (17): Announce gate (latest vs announce), The update fetch lives in main, Settings gear update dot, Check for Updates Implementation Plan, Automatic checks fail silently, shouldToast / TOAST_MS, update-check pure version logic, UpdateChecker (+9 more)

### Community 18 - "Ember Portal App Icon Design"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 19 - "Startup Surface & Settings Store"
Cohesion: 0.17
Nodes (5): StartupSurface, normalize(), SettingsStore, DEFAULT_SETTINGS, Settings

### Community 20 - "Meta Recipes (Instagram, Messenger)"
Cohesion: 0.21
Nodes (6): instagram, countUnreadRows(), isUnreadRow(), synthFromRows(), Counts, UpdateStatus

### Community 21 - "Shopee & Zalo Recipes"
Cohesion: 0.15
Nodes (10): chatHeader(), shopee, zalo, shopee-collapsed.html fixture (collapsed pill badge 5), Collapsed pill as keep-alive click target (single wrapper child = not ready), shopee.html fixture (expanded mini-chat, header badge 31), Shopee mini-chat expanded state (wrapper has header + body children), zalo-dormant.html fixture (idle-deactivation activation modal) (+2 more)

### Community 22 - "Welcome Screen (Light Theme)"
Cohesion: 0.17
Nodes (16): Tagline: All your chats. Nothing else., Dispel (Discard Draft) Button, Draft Selection State (Summon 1 · Banish 1), Home Accelerator Hint (⌘/Ctrl 0), Home (Welcome) Surface, Light Theme Palette (Orange Accent on White), Occult Lexicon for Service State, Welcome Screen Screenshot (Light Theme) (+8 more)

### Community 23 - "Home Board & Service Ordering"
Cohesion: 0.19
Nodes (16): Home board layout, byName, matchesQuery substring filter, moveTo drag index arithmetic, PickTile, Home Board and Service Ordering Plan, ServiceBand, summonOrder append-on-summon (+8 more)

### Community 24 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): @biomejs/biome, devDependencies, @biomejs/biome, @playwright/test, tailwindcss, typescript, @vitejs/plugin-react, vitest (+7 more)

### Community 25 - "README Showcase & Media Capture"
Cohesion: 0.21
Nodes (14): LoadingOverlay WebContentsView, docs/media/banner.svg, capture-media.mjs capture driver, Capture matrix (SHOTS), Screenshots show Goetia's own chrome only, docs/DEVELOPING.md split, MD033 inline-HTML allowlist, README Showcase Implementation Plan (+6 more)

### Community 26 - "Announce Gate & Surface Persistence"
Cohesion: 0.14
Nodes (14): Stale-report dedup and no-op setRuntime, Announce gate, Settings.lastNotifiedVersion, shouldToast, Silent automatic failures, UpdateState, Settings.lastActiveId, Persist the surface on change, into Settings (+6 more)

### Community 27 - "Mute, Badge & Reorder Invariants"
Cohesion: 0.18
Nodes (13): Accelerator declared in the app menu only, Global mute goes through ctx.setGlobalMuted, Mute means silence, never blindness, Tile reorder is drag-local, Unread counts and badge surfaces, Badge aggregation across dock, overlay and rail, E2E smoke test and packaging targets, One badgeLabel with a 99+ threshold (+5 more)

### Community 28 - "Lifecycle, Timers & Waking"
Cohesion: 0.19
Nodes (13): Bounded timers and listeners, One long-lived window, Service lifecycle and resilience features, Design tokens and reduced-motion kill switch, Tray, close-to-tray and autostart, startReadyPoll in the service preload, Rail tiles breathe while waking, waking runtime flag and loading:state channel (+5 more)

### Community 29 - "Chat-Only Containment Principle"
Cohesion: 0.21
Nodes (13): Chat ONLY product principle, chatPaths snapback containment, hideChrome per-tick hook, Enable/disable lives on Home, never Settings, Recipe CSS hides host chrome, Launch restores the surface you left, Reload returns the view to the chat URL, Zero enabled services means zero service views (+5 more)

### Community 30 - "Notification Icons & Sound"
Cohesion: 0.21
Nodes (13): One throttled notification path, One sound per message, Notification features, Notification pipeline and shouldNotify, Assets shipped outside the asar, resolveIcons: paths resolved once at startup, NativeImage fallback if a path icon is ignored, NotificationRouter icon and title wiring (+5 more)

### Community 31 - "Welcome Component & Selling Points"
Cohesion: 0.24
Nodes (13): buildDisabledPatch, Welcome visibility is derived, not a flag, Welcome Screen Implementation Plan, Portal (shared ember-portal component), Welcome component, summonDelta / summonLabel, Three non-overlapping selling-point cards, Dispel button (+5 more)

### Community 32 - "Home Surface Composition"
Cohesion: 0.28
Nodes (13): resolveActivation, anyOverlayOpen predicate, Composition lives on Home, not Settings, homeOpen shell surface, Home Screen and Service Composition Plan, Rail home sigil and the ⌘/Ctrl 0 accelerator, activate(id, { show: false }) — resolve without revealing, Settings.lastActiveId + lastHomeOpen (+5 more)

### Community 33 - "Version Compare & Settings Normalize"
Cohesion: 0.17
Nodes (13): Per-field settings normalize coercion, compareVersions, isNewer, Decision: notifier, not auto-updater, parseLatestRelease, lib/update-check.ts pure layer, UpdateChecker, Settings.lastHomeOpen (+5 more)

### Community 34 - "Electron Fuses & Builder Config"
Cohesion: 0.17
Nodes (13): onlyLoadAppFromAsar + embedded asar integrity validation, electron-builder config (Goetia packaging), electronFuses hardening block, enableCookieEncryption (OS keychain session cookies), mac.identity '-' (ad-hoc signature for Notification Center), Custom mac entitlements + hardenedRuntime, runAsNode / NODE_OPTIONS / --inspect fuses off, Notification icons shipped unpacked via extraResources (+5 more)

### Community 35 - "Package Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, e2e, icons, lint, media, package:mac (+5 more)

### Community 36 - "Media Capture Driver"
Cohesion: 0.26
Nodes (8): capture(), isShell(), SURFACES, ALL_SERVICE_IDS, settingsFor(), SHOTS, SURFACES, THEMES

### Community 37 - "Rail Badges Screenshot (Dark)"
Cohesion: 0.23
Nodes (12): Rail Badges (Dark) Screenshot, Active Service Highlight (orange tile + left accent bar), Dark Theme Rail Presentation, Discord Tile (active), Monochrome Amber Icon Treatment, Mute Indicator (crossed-out bell, bottom-right of tile), Rail Sigil (Home entry point), Service Rail (horizontal tile strip) (+4 more)

### Community 38 - "Slack Icons & Design System"
Cohesion: 0.23
Nodes (12): Slack logo and notification icons, Graphite minimal design system, Notification router, Unisolated per-service preload, We do not own the banner layout, Brand-colour tile notification icon, build-notification-icons.mjs, extraResources over asarUnpack (+4 more)

### Community 39 - "Telegram, WhatsApp, Zalo Icons"
Cohesion: 0.27
Nodes (12): Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed), Telegram macOS Notification Icon (blue squircle, white circle, paper-plane glyph, inset padding), macOS Notification Icon Variant Convention (-mac suffix pairs), Per-Service Notification Icon Asset Set, Brand-Color Squircle Icon Design Language, WhatsApp Notification Icon (green rounded-square badge, white speech-bubble handset glyph, full bleed), WhatsApp macOS Notification Icon (green squircle, white speech-bubble handset glyph, inset padding), Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed) (+4 more)

### Community 40 - "Process Boundaries & Resilience"
Cohesion: 0.18
Nodes (11): No visible view while an overlay is open, Shell sandboxed, service views unisolated, Crash count forgotten only after a dwell, src/shared stays process-agnostic, Pure decision logic in lib/, thin wiring elsewhere, chromeUserAgent strips Electron tokens, Crash resilience with exponential backoff, Hibernation controller and rules (+3 more)

### Community 41 - "Quick Switcher Screenshot (Dark)"
Cohesion: 0.29
Nodes (11): Quick Switcher (dark theme) screenshot, Per-row accelerator hint (⌘1–⌘8), Dark theme palette (near-black panel, monochrome service glyphs), Enabled services shown (Shopee, Slack, Discord, Instagram, Messenger, WhatsApp), Match-first ranking (matches hoisted above unmatched services), Keyboard-first service navigation, Quick switcher overlay surface, Type-to-filter query field (+3 more)

### Community 42 - "Settings Modal Screenshots"
Cohesion: 0.27
Nodes (11): Appearance Settings Panel, Menu Position Setting, Settings Modal Screenshot (Dark), Settings Section Rail, Light/Dark Theme Parity, Theme Setting, Settings Modal Screenshot (Light), Goetia Orbit Sigil Mark (+3 more)

### Community 43 - "Chat Client Design Spec"
Cohesion: 0.29
Nodes (11): Badge shot seeds neverHibernate false, Catalog sorted by display name, Badge aggregator, Electron as the desktop shell, Hibernation controller, Per-service unread recipes, Per-service persist: session isolation, Goetia Chat Client Design Spec (+3 more)

### Community 44 - "Hardening Threat Model"
Cohesion: 0.24
Nodes (11): Accepted residual risk, Hardening & remediation design, Electron fuses block, Pure lib/ helper testing strategy, Navigation containment guard, Owner threat model (A local malware, B hostile web content, C supply chain), ALLOWED_HOSTS.tiktok, moveTo (+3 more)

### Community 45 - "Portal, Welcome & Board Layout"
Cohesion: 0.18
Nodes (11): Portal.tsx, Startup zero-view guard, Welcome.tsx, Welcome is derived, not flagged, Three tip cards that sell three things, Board layout (header / bands / pinned footer), Board sizing rules, The rail overflows before Home does (+3 more)

### Community 46 - "Slack & TikTok Recipe Wiring"
Cohesion: 0.25
Nodes (5): recipes, slack, tiktok, arg, serviceId

### Community 47 - "Quick Switcher Screenshot (Light)"
Cohesion: 0.24
Nodes (10): Quick Switcher (light theme) screenshot, Light-theme overlay palette, Match-ranked result order, Monochrome service glyph treatment, Overlay sits above service views, Single-character query filter ("s"), Quick Switcher overlay, Active-row selection highlight (+2 more)

### Community 48 - "Banner SVG Branding"
Cohesion: 0.36
Nodes (9): Accessible SVG Labeling (role=img, aria-label, title), Goetia Banner (1200x300 SVG), Ember Gradient Palette (arcA, arcB, core, word), Ember Portal Mark, Tagline: Summon every chat to one window, nothing but the chat, Theme-Resilient SVG Fallback, Goetia Wordmark, App Icon SVG (resources/icon.svg) (+1 more)

### Community 49 - "Slack Service Plan"
Cohesion: 0.31
Nodes (9): Fresh installs start all-disabled, Tasks 1–3 are one atomic change, Slack Service Implementation Plan, tests/fixtures/slack.html count oracle, ALLOWED_HOSTS slack entry, slack recipe, Slack service catalog entry, Selectors uncalibrated until a live login pass (+1 more)

### Community 50 - "Recipe Helpers & Count Rules"
Cohesion: 0.25
Nodes (9): Single badge-label formatter, Single-pass Messenger count(), Runner count() timeout race, hideChrome recipe hook, Instagram synthNotification, meta-unread.ts shared Meta heuristics, No chatPaths for Slack, Slack recipe css chrome hiding (+1 more)

### Community 51 - "CSP, Permissions & Showcase Claims"
Cohesion: 0.22
Nodes (9): Permission handler origin check, Release supply-chain SHA pinning and provenance, Renderer CSP tightening, TikTok chat service, The GitHub request belongs in main, Claims first, screenshots as proof, docs/DEVELOPING.md split, Six selling points (+1 more)

### Community 52 - "Drag Reorder On Home"
Cohesion: 0.22
Nodes (9): Rail leading sigil, PickTile, Drag-to-reorder on Home, macOS copy-cursor badge defect, What the drag looks like, Rail Reorder.Group wiring, Reorder.Group / pointer-driven reorder, Trailing-click guard (+1 more)

### Community 53 - "Package Manifest Fields"
Cohesion: 0.22
Nodes (8): description, main, name, packageManager, private, productName, type, version

### Community 54 - "Brand Squircle Icon System"
Cohesion: 0.36
Nodes (9): Brand squircle notification icon system (128x128 RGBA, white glyph on brand fill), Discord notification icon (full-bleed), Discord notification icon (macOS inset variant), macOS `-mac` inset icon variant convention, Messenger notification icon (full-bleed), Messenger notification icon (macOS inset variant), Shopee notification icon (full-bleed), Shopee notification icon (macOS inset variant) (+1 more)

### Community 55 - "Release Workflow CI"
Cohesion: 0.29
Nodes (8): Build provenance attestation step, Build job (mac arm64/x64 + win matrix), SHA256SUMS.txt generation, CSC_IDENTITY_AUTO_DISCOVERY disabled (no signing material), Publish release job, Tag must match package.json version, Release workflow (tag-triggered), publish: null (CI publishes, builder does not)

### Community 56 - "Recipe Framework & TikTok Selectors"
Cohesion: 0.39
Nodes (8): count() cost rules, Recipe framework and runner, Service loading screen (waking overlay) plan, Recipe ready(doc) chat-usable check, count() reads the widget badge via chatHeader, Structural selectors only, never hashed classes, TikTok DM recipe, UNCALIBRATED data-e2e selectors

### Community 57 - "Rail Badges Screenshot (Light)"
Cohesion: 0.36
Nodes (8): Rail Badges Screenshot (Light Theme), Active Service Highlight (glow + full-color tile), Home Sigil (leftmost, separated by divider), Light Theme Palette (white ground, coral/orange accent, grey inactive glyphs), Mute Indicator (crossed-out bell, bottom-right of tile), Nine Service Tiles (Discord, Instagram, Messenger, Shopee, Slack, Telegram, TikTok, WhatsApp, Zalo), Service Rail (horizontal tile strip), Unread Count Badge (red pill, top-right of tile)

### Community 58 - "Update IPC Channels & Allowlists"
Cohesion: 0.29
Nodes (8): External URL scheme allowlist, IPC sender/origin validation, Rail gear dot, releaseUrl, shouldAutoRecheck, updatePending, updates:check channel, updates:openDownload channel

### Community 59 - "Notification Throttle & Toast Timing"
Cohesion: 0.29
Nodes (8): Per-service notification rate limit, TikTok synthNotification, Timer-driven dismissal under reduced motion, Self-dismissing UpdateToast, Capture determinism via reduced motion, scripts/capture-media.mjs, Screenshots show only Goetia's own chrome, Slack needs no synthNotification

### Community 60 - "Instagram Chat Containment"
Cohesion: 0.29
Nodes (8): Chat ONLY principle (post-ship), chatPaths containment, The catalog ships in name order, normalize() catalog-position slotting, chatPaths: ['/direct'], Instagram chat service, pointer-events inerting of off-chat links, Slack service

### Community 61 - "Shopee Chat Focus Design"
Cohesion: 0.33
Nodes (7): Overlay above a still-visible view, Recipe CSS gated on the expanded state, Homepage entry URL, never /webchat, keepAlive trusted click on the collapsed pill, No network filtering, Unread from host textContent, Shopee Chat Focus Design

### Community 62 - "Slack Count & Ready"
Cohesion: 0.38
Nodes (7): Bounded startReadyPoll, Slack count() (mention badges + unread channels), Slack ready() on the channel sidebar, Slack recipe fixture, Mention-badge rows (2 + 1 → direct 3), Muted unread row that counts nothing, Badge-less unread channels (indirect 2)

### Community 63 - "TikTok DM Selectors"
Cohesion: 0.29
Nodes (7): Messages nav-badge count source, Rejected: chat-list scan, tiktok.html recipe fixture, data-e2e="dm-new-chatbox" ready + css gate, data-e2e="dm-new-conversation-item" / "-nickname" rows, DivDrawerContainer hosts the DM conversation list, data-e2e="top-dm-icon" badge host

### Community 64 - "Instagram Rail Space Reclaim"
Cohesion: 0.38
Nodes (7): Never hide the side-nav container itself, Rail space reclaim, Structural nav-rail computation, StyleX atomic class .x132t2bv, Instagram recipe fixture, #rail nav branch, Rail-sized offsets (#content margin, #inner padding)

### Community 65 - "Home Open State & Accelerator"
Cohesion: 0.38
Nodes (7): activateService clears homeOpen, Home accelerator (CmdOrCtrl+0), home:setOpen channel, homeOpen shell surface, Nested settings.update inside the handler is safe, rememberSurface, setHomeOpen

### Community 66 - "Notification Icon Build Script"
Cohesion: 0.33
Nodes (5): LOGO_DIR, OUT_DIR, placeGlyph(), ROOT, tileSvg()

### Community 67 - "Reorder E2E Spec"
Cohesion: 0.33
Nodes (3): isShell(), launch(), TWO_ENABLED

### Community 68 - "Shot Type Definitions"
Cohesion: 0.33
Nodes (5): SeededSettings, ServiceId, Shot, Surface, Theme

### Community 69 - "Release Shell Script"
Cohesion: 0.60
Nodes (5): die(), run(), release.sh script, skip(), step()

### Community 70 - "Notification Icon Resolution"
Cohesion: 0.53
Nodes (3): iconFileName(), resolveIcons(), ICON_DIR

### Community 71 - "Emoji Text Extraction"
Cohesion: 0.53
Nodes (3): collect(), glyph(), textWithEmoji()

### Community 72 - "Messenger Fixtures & Synth"
Cohesion: 0.40
Nodes (4): messenger, messenger.html fixture (chat-row unread oracle), Emoji delivered as <img alt> inside the row preview, messenger-reaction.html fixture (synthesized reaction notification)

### Community 73 - "Title-Based Unread Parsing"
Cohesion: 0.47
Nodes (4): unreadFromTitle(), countWhatsAppChats(), Discord bullet-prefixed title as indirect-unread signal, Title-parsed count as IndexedDB fallback (no page IDB under test)

### Community 74 - "Selector Calibration Risk"
Cohesion: 0.40
Nodes (5): TikTok bot-detection risk, data-e2e selector surface, Live selector recalibration (2026-08-07), Instagram calibration caveat, Slack calibration caveat

### Community 75 - "Slack macOS Icon Variant"
Cohesion: 0.50
Nodes (5): Slack macOS Notification Icon, Per-Service Notification Identity, Platform-Suffixed Notification Icon Variant (-mac), Slack Octothorpe Brand Mark (white on aubergine), Squircle App-Icon Treatment

### Community 76 - "TikTok Icon & Logo"
Cohesion: 0.70
Nodes (5): TikTok Notification Icon (default/Windows-Linux), TikTok Notification Icon (macOS variant), Platform-suffixed notification icon variant convention, TikTok Logo Mark (renderer SVG), Monochrome white glyph logo style (no brand fill)

### Community 77 - "Hibernation Rules"
Cohesion: 0.50
Nodes (3): HibernationCandidate, shouldHibernate(), base

### Community 80 - "Restart E2E Spec"
Cohesion: 0.50
Nodes (3): isShell(), launch(), TWO_ENABLED

### Community 81 - "Overlay Visibility Invariant"
Cohesion: 0.83
Nodes (4): views.activate show option, Buried Settings modal bug, Overlay invariant: no view visible over a shell surface, Startup activates hidden when Home is restored

### Community 82 - "Instagram macOS Notification Icon"
Cohesion: 0.83
Nodes (4): Flat White Camera Glyph on Crimson Squircle, Instagram macOS Notification Icon, Instagram Service Visual Identity, Per-Platform Notification Icon Variant Convention

### Community 85 - "Waking Overlay Page"
Cohesion: 0.83
Nodes (4): loading.html (waking overlay page), Inline critical first-paint CSS in loading.html, loading.html Content-Security-Policy meta, Ember portal SVG (ring arcs, embers, breathing core)

### Community 87 - "Slack Notification Icon Asset"
Cohesion: 1.00
Nodes (3): Per-Service Notification Icon Asset Convention, Slack Brand Glyph (four-lozenge octothorpe), Slack Notification Icon (slack.png)

### Community 88 - "macOS Template Tray Icon"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

### Community 94 - "Instagram Logo Asset"
Cohesion: 1.00
Nodes (3): Accessible SVG Labeling (role=img + <title>), Instagram Logo Glyph (rail icon asset), Monochrome 24x24 Service Logo Convention

### Community 95 - "Slack Logo Asset"
Cohesion: 0.67
Nodes (3): Slack Logo SVG (renderer asset), Slack Brand Mark (four-lozenge hash), Monochrome 24x24 Service Glyph Convention

## Ambiguous Edges - Review These
- `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` → `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`  [AMBIGUOUS]
  resources/notification-icons/zalo.png · relation: semantically_similar_to
- `Platform-suffixed notification icon variant convention` → `Monochrome white glyph logo style (no brand fill)`  [AMBIGUOUS]
  src/renderer/src/assets/logos/tiktok.svg · relation: conceptually_related_to
- `Mute means silence, never blindness` → `Badge aggregation across dock, overlay and rail`  [AMBIGUOUS]
  docs/superpowers/plans/2026-08-04-goetia-v1.md · relation: conceptually_related_to

## Knowledge Gaps
- **197 isolated node(s):** `HibernationCandidate`, `allowed`, `api`, `GoetiaApi`, `logos` (+192 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` and `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Platform-suffixed notification icon variant convention` and `Monochrome white glyph logo style (no brand fill)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Mute means silence, never blindness` and `Badge aggregation across dock, overlay and rail`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `ServiceId` connect `Service View Manager` to `Update Check & Waking Rules`, `Tray & App Icon Assets`, `Rail & Tile Reorder`, `Badges, Shell & Fuzzy Search`, `IPC Sender Policy & Loading Overlay`, `Notification Icon Resolution`, `Recipe Runner & Types`, `Main Entry & Accelerators`, `Notification Throttle Unit`, `Slack & TikTok Recipe Wiring`, `Navigation Policy`, `Startup Surface & Settings Store`, `Meta Recipes (Instagram, Messenger)`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `LoadingOverlay WebContentsView` connect `README Showcase & Media Capture` to `Home Surface Composition`, `Process Boundaries & Resilience`, `Developing Guide & Release Basics`, `Recipe Framework & TikTok Selectors`, `Lifecycle, Timers & Waking`, `Shopee Chat Focus Design`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `Goetia engineering guardrails` connect `Security Guardrails Checklist` to `Packaging, Signing & Gatekeeper`, `Process Boundaries & Resilience`, `Developing Guide & Release Basics`, `Features Inventory & State Broadcast`, `Recipe Framework & TikTok Selectors`, `Mute, Badge & Reorder Invariants`, `Lifecycle, Timers & Waking`, `Chat-Only Containment Principle`, `Notification Icons & Sound`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `HibernationCandidate`, `allowed`, `api` to the rest of the system?**
  _197 weakly-connected nodes found - possible documentation gaps or missing edges._