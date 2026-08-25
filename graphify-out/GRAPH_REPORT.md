# Graph Report - .  (2026-08-25)

## Corpus Check
- 170 files · ~278,290 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1662 nodes · 2812 edges · 172 communities (124 shown, 48 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 269 edges (avg confidence: 0.84)
- Token cost: 822,936 input · 0 output

## Community Hubs (Navigation)
- Hibernation & Peeks
- Home Screen Components
- Guardrail Invariants
- Startup Surface & View Manager
- Biome Lint Config
- Chat-Only Recipe Principles
- Update Check & Versioning
- State Broadcast & Shell Wiring
- Security Hardening Design
- Service Catalog & Icons
- Settings View UI
- Welcome Confirm Flow
- Loading Overlay & IPC Sender Policy
- Quiet Hours Scheduling
- Post-Ship Hardening Decisions
- Activation & Surface Routing
- Recipe Runner & Containment Tests
- Rail Badges (Light Theme)
- Process Boundary Invariants
- Rail Badges (Dark Theme)
- Goetia v1 Implementation Plan
- TypeScript Config
- IPC Handlers & AppContext
- Call Policy & Layout
- MainState Runtime Store
- Ready Poll & Slack/Telegram Recipes
- Home Overlay Activation Rules
- Discord & WhatsApp Recipes
- Meta Recipes (Instagram/Messenger)
- Toast & Placeholder Components
- Release Workflow & Fuses
- Mute & Notification Invariants
- Check-for-Updates Plan
- Unread Counting Optimizations
- Summon Cap & Home Redesign
- App Icon & Ember Branding
- Preload Notify/WebAuthn Shims
- Shopee & Zalo Recipes
- Home Board Ordering Plan
- Slack & Teams Service Design
- Dev Dependencies
- Quick Switcher (Dark)
- Settings Screenshot (Light)
- Welcome Screenshot (Dark)
- Welcome Screenshot (Light)
- Notification Throttle & Toast Rules
- Peek Discipline & Overlay Guard
- Quick Switcher (Light)
- Settings Screenshot (Dark)
- README Showcase & Media Capture
- Media Capture Scripts
- Service Context Menu Builder
- Quick Switcher Component
- Welcome Screen Plan
- Home Composition Plan
- Package Scripts
- Main Entry & Summon Hotkey
- Activation Rules & Reorder
- Calls, Permissions & External Links
- Notification Icons Design
- Recipe Selector Calibration
- Telegram/WhatsApp/Zalo Icons
- Settings Migrations & Zoom
- View Hooks & Lifecycle
- Service Tile Components
- Chat Client Design Spec
- Context Menu & Sign-Out Design
- Light Sleep & Banner Click
- Rail Component & Reorder Prompt
- Teams Hosts & Call Windows
- Notification Rules & Router
- SettingsStore Implementation
- Banner SVG & Wordmark
- Slack Service Plan
- Drag-to-Reorder Design
- Package Metadata
- Brand Squircle Icon System
- Badge Aggregation
- Activity Log
- Resilience Manager
- Reorder E2E Spec
- Waking Overlay (Dark)
- Waking Overlay (Light)
- Reload Guard & Auto-Banish
- Navigation Policy & Hosts
- Recipe Index & Teams Recipe
- App Shell & Overlay Badge
- Purge Confirm & Copy
- Release CI Workflow
- Shopee Chat Focus Design
- Quiet Hours & Summon Hotkey Design
- Tray Template Icons
- Tray Creation & Mute
- Notification Icon Build Script
- LoadingOverlay Class
- Renderer Shell Store
- Packaging & Gatekeeper
- Overlay Invariant Bugs
- Screenshot Shot Types
- Release Shell Script
- Banner Click Resolution
- Waking Rules
- Emoji Text Extraction
- Messenger Fixtures & Synth
- Slack Notification Icons
- Teams macOS Icon
- TikTok Icons & Logo
- Notification Throttle
- Permission Policy
- Restart E2E Spec
- Instagram macOS Icon
- Teams Notification Icon
- Navigation Audit
- Overlay Rules
- TikTok Recipe & Synth Test
- Loading HTML Page
- Teams Logo SVG
- Update Toast Rules
- Banish E2E Spec
- Purge E2E Spec
- Updates E2E Spec
- Release Notes Preamble
- Slack Notification Icon
- Tray Template SVG
- Backoff Helper
- External URL Guard
- User Agent Helper
- Visibility Spoof
- Shell HTML Document
- Instagram Logo SVG
- Fuzzy Matching
- conf Dependency
- Tray Quit & Crash Dwell
- README Banner Assets
- Zoom & Home Accelerator
- electron Dependency
- electron-builder Dependency
- electron-vite Dependency
- happy-dom Dependency
- Playwright Dependency
- react Dependency
- react-dom Dependency
- resvg Dependency
- Tailwind Vite Dependency
- React Types Dependency
- React DOM Types Dependency
- vite Dependency
- Instagram Notification Icon
- Discord Logo SVG
- Messenger Logo SVG
- Telegram Logo SVG
- WhatsApp Logo SVG
- Zalo Logo SVG
- Loading Renderer Script
- Messenger Unread Signals
- Viber Exclusion
- Bounded Ready Poll
- Coalesced Resize Layout
- pnpm Build Allowlist
- Blank Fixture
- Telegram Fixture
- Zalo Badge Fixture
- Zalo Fixture

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 96 edges
2. `ServiceViewManager` - 35 edges
3. `Recipe` - 28 edges
4. `AppContext` - 27 edges
5. `registerIpcHandlers()` - 24 edges
6. `MainState` - 22 edges
7. `useShell` - 21 edges
8. `serviceById()` - 19 edges
9. `Settings` - 18 edges
10. `HibernationController` - 15 edges

## Surprising Connections (you probably didn't know these)
- `createTray()` --references--> `Windows Tray Icon (orange ring mark)`  [INFERRED]
  src/main/tray.ts → resources/tray/tray-win.png
- `createTray()` --references--> `macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina)`  [INFERRED]
  src/main/tray.ts → resources/tray/trayTemplate@2x.png
- `Emoji delivered as <img alt> inside the row preview` --conceptually_related_to--> `textWithEmoji()`  [INFERRED]
  tests/fixtures/messenger-reaction.html → src/preload/recipes/emoji-text.ts
- `discord.html fixture (guild badges + dot title)` --references--> `discord`  [INFERRED]
  tests/fixtures/discord.html → src/preload/recipes/discord.ts
- `shopee.html fixture (expanded mini-chat, header badge 31)` --shares_data_with--> `chatHeader()`  [INFERRED]
  tests/fixtures/shopee.html → src/preload/recipes/shopee.ts

## Import Cycles
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/menu.ts -> src/main/activate.ts`
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/notifications.ts -> src/main/activate.ts`

## Hyperedges (group relationships)
- **The 60s hibernation sweep: hibernate → peek → banish** — claude_light_sleep_peeks, claude_peek_saver, claude_auto_banish_invariant, docs_superpowers_plans_2026_08_16_light_sleep_peekrules, docs_superpowers_plans_2026_08_23_auto_banish_unused_services_shouldbanish, docs_superpowers_plans_2026_08_17_banner_to_conversation_grace [EXTRACTED 1.00]
- **Effective silence: one decision pair feeding every banner and audio surface** — claude_mute_means_silence, claude_quiet_hours_scheduled_mute, claude_one_sound_per_message, claude_set_global_muted_choke_point, docs_superpowers_plans_2026_08_16_quiet_hours_rules, docs_superpowers_plans_2026_08_16_quiet_hours_controller [EXTRACTED 1.00]
- **Containment ring around the unsandboxed service view** — claude_process_boundaries, claude_navigation_containment, claude_ipc_sender_policy, claude_permission_allowlist, claude_external_links_policy, claude_call_popup_guest_adoption, claude_electron_fuses, claude_renderer_csp [EXTRACTED 1.00]
- **Chat-only containment: CSS is cosmetic, chatPaths contains, reload is the escape** — docs_superpowers_specs_2026_08_13_microsoft_teams_service_design_hash_aware_chatpaths, docs_superpowers_specs_2026_08_13_microsoft_teams_service_design_no_css, docs_superpowers_specs_2026_08_12_slack_service_design_slack_chat_only_css, docs_superpowers_specs_2026_08_13_service_back_affordance_design_no_back_affordance, docs_superpowers_specs_2026_08_14_reload_guard_design_reload_guard [INFERRED 0.85]
- **Awareness while asleep: peeks, banner grace, deep routing and the remembered banner stream** — docs_superpowers_specs_2026_08_16_light_sleep_and_notification_click_through_design_peek_lifecycle, docs_superpowers_specs_2026_08_17_banner_to_conversation_design_banner_grace, docs_superpowers_specs_2026_08_17_banner_to_conversation_design_resolve_banner_click, docs_superpowers_specs_2026_08_17_zoom_signout_and_recents_design_activity_log, docs_superpowers_specs_2026_08_16_quiet_hours_design_quiet_hours [INFERRED 0.85]
- **Call containment: inert guest, adopted hardened window, widened media permissions, mac entitlements** — docs_superpowers_specs_2026_08_16_calls_and_screen_share_design_call_policy, docs_superpowers_specs_2026_08_16_calls_and_screen_share_design_inert_guest, docs_superpowers_specs_2026_08_16_calls_and_screen_share_design_call_window_adoption, docs_superpowers_specs_2026_08_16_calls_and_screen_share_design_permission_call_origins, docs_superpowers_specs_2026_08_16_calls_and_screen_share_design_mac_entitlements [EXTRACTED 1.00]
- **Quick Switcher row anatomy: glyph, name, and its Cmd-number accelerator** — docs_media_quick_switcher_dark_service_row, docs_media_quick_switcher_dark_service_icon, docs_media_quick_switcher_dark_numeric_accelerator, docs_media_quick_switcher_dark_selection_highlight [EXTRACTED 1.00]
- **Typing 's' selects the best match while the full service list stays reachable** — docs_media_quick_switcher_dark_search_input, docs_media_quick_switcher_dark_match_first_ordering, docs_media_quick_switcher_dark_shopee, docs_media_quick_switcher_dark_slack, docs_media_quick_switcher_dark_selection_highlight [INFERRED 0.85]
- **Type-to-filter switcher: query narrows rows, first match is preselected, accelerators stay bound to rail order** — docs_media_quick_switcher_light_quick_switcher, docs_media_quick_switcher_light_query_filter, docs_media_quick_switcher_light_selection_highlight, docs_media_quick_switcher_light_accelerator_hints [INFERRED 0.85]
- **Services matching the substring "s" listed in the switcher** — docs_media_quick_switcher_light_shopee, docs_media_quick_switcher_light_slack, docs_media_quick_switcher_light_discord, docs_media_quick_switcher_light_instagram, docs_media_quick_switcher_light_messenger, docs_media_quick_switcher_light_whatsapp [EXTRACTED 1.00]
- **Rail tile state vocabulary: active highlight, unread badge, mute bell** — docs_media_rail_badges_dark_service_tile, docs_media_rail_badges_dark_active_service_highlight, docs_media_rail_badges_dark_unread_badge, docs_media_rail_badges_dark_mute_indicator [EXTRACTED 1.00]
- **Enabled service roster shown in rail order after the home sigil** — docs_media_rail_badges_dark_home_sigil, docs_media_rail_badges_dark_discord, docs_media_rail_badges_dark_instagram, docs_media_rail_badges_dark_messenger, docs_media_rail_badges_dark_shopee, docs_media_rail_badges_dark_slack, docs_media_rail_badges_dark_telegram, docs_media_rail_badges_dark_tiktok, docs_media_rail_badges_dark_whatsapp, docs_media_rail_badges_dark_zalo [EXTRACTED 1.00]
- **Per-tile status affordances on one rail** — docs_media_rail_badges_light_service_tile, docs_media_rail_badges_light_unread_badge, docs_media_rail_badges_light_mute_indicator, docs_media_rail_badges_light_active_service_highlight [INFERRED 0.85]
- **Enabled chat services shown in rail order** — docs_media_rail_badges_light_discord, docs_media_rail_badges_light_instagram, docs_media_rail_badges_light_messenger, docs_media_rail_badges_light_shopee, docs_media_rail_badges_light_slack, docs_media_rail_badges_light_telegram, docs_media_rail_badges_light_tiktok, docs_media_rail_badges_light_whatsapp, docs_media_rail_badges_light_zalo, docs_media_rail_badges_light_tile_order [EXTRACTED 1.00]
- **Settings sidebar section taxonomy** — docs_media_settings_dark_general_section, docs_media_settings_dark_appearance_section, docs_media_settings_dark_services_section, docs_media_settings_dark_notifications_section, docs_media_settings_dark_shortcuts_section, docs_media_settings_dark_updates_section [EXTRACTED 1.00]
- **Appearance pane composition: labeled rows with dropdown controls in a bordered card** — docs_media_settings_dark_appearance_section, docs_media_settings_dark_menu_position, docs_media_settings_dark_theme_setting, docs_media_settings_dark_dark_theme [INFERRED 0.85]
- **Settings six-pane sidebar taxonomy** — docs_media_settings_light_general, docs_media_settings_light_appearance, docs_media_settings_light_services, docs_media_settings_light_notifications, docs_media_settings_light_shortcuts, docs_media_settings_light_updates [EXTRACTED 1.00]
- **Appearance pane: labeled dropdown rows in one card** — docs_media_settings_light_appearance, docs_media_settings_light_menu_position, docs_media_settings_light_theme, docs_media_settings_light_card_row_layout [INFERRED 0.85]
- **Waking cover composition: full-bleed dark backdrop, glowing sigil spinner, and named status line** — docs_media_waking_dark_waking_cover, docs_media_waking_dark_sigil_spinner, docs_media_waking_dark_waking_label, docs_media_waking_dark_dark_theme [INFERRED 0.85]
- **Waking cover composition: sigil spinner + service-named label on a light surface** — docs_media_waking_light_waking_cover, docs_media_waking_light_orbit_sigil, docs_media_waking_light_waking_label, docs_media_waking_light_light_theme [INFERRED 0.85]
- **One-frame staged board edit: sections + counter + confirm/discard** — docs_media_welcome_dark_summoned_section, docs_media_welcome_dark_unbound_section, docs_media_welcome_dark_summon_counter, docs_media_welcome_dark_staged_edit [INFERRED 0.95]
- **Home surface: rail, board, titlebar controls and hint footer compose one destination screen** — docs_media_welcome_dark_home_screen, docs_media_welcome_dark_service_rail, docs_media_welcome_dark_service_board, docs_media_welcome_dark_titlebar_controls, docs_media_welcome_dark_home_shortcut_hint [INFERRED 0.85]
- **Staged board edit: move tiles between Summoned and Unbound, commit or discard as one frame** — docs_media_welcome_light_summoned_section, docs_media_welcome_light_unbound_section, docs_media_welcome_light_staged_edit, docs_media_welcome_light_summon_counter [INFERRED 0.85]
- **Home as a destination reached by sigil, keyboard shortcut, or rail, showing the service board** — docs_media_welcome_light_home_screen, docs_media_welcome_light_sigil, docs_media_welcome_light_home_shortcut, docs_media_welcome_light_service_rail [INFERRED 0.85]
- **The hardening controls that together contain a hostile service page** — docs_superpowers_plans_2026_08_07_security_hardening_fuses_task, docs_superpowers_plans_2026_08_07_security_hardening_is_safe_external_url, docs_superpowers_plans_2026_08_07_security_hardening_permission_allowed, docs_superpowers_plans_2026_08_07_security_hardening_ipc_sender_allowed, docs_superpowers_plans_2026_08_07_security_hardening_notification_throttle, docs_superpowers_plans_2026_08_07_security_hardening_navigation_allowlist, docs_superpowers_plans_2026_08_07_security_hardening_csp_tightening [EXTRACTED 1.00]
- **Waking-cover flow from recipe readiness to revealed view** — docs_superpowers_plans_2026_08_06_service_loading_screen_recipe_ready_check, docs_superpowers_plans_2026_08_06_service_loading_screen_ready_poll, docs_superpowers_plans_2026_08_06_service_loading_screen_waking_flag, docs_superpowers_plans_2026_08_06_service_loading_screen_waking_tracker, docs_superpowers_plans_2026_08_06_service_loading_screen_overlay_view, docs_superpowers_plans_2026_08_06_service_loading_screen_tile_breathe [EXTRACTED 1.00]
- **Update check flow: poll, state slice, toast, dot** — docs_superpowers_plans_2026_08_08_check_for_updates_update_check_lib, docs_superpowers_plans_2026_08_08_check_for_updates_updatechecker, docs_superpowers_plans_2026_08_08_check_for_updates_updatestate_slice, docs_superpowers_plans_2026_08_08_check_for_updates_toast_rules, docs_superpowers_plans_2026_08_08_check_for_updates_updatetoast, docs_superpowers_plans_2026_08_08_check_for_updates_gear_dot [EXTRACTED 1.00]
- **Pure welcome decision helpers in src/shared/welcome.ts** — docs_superpowers_plans_2026_08_08_welcome_screen_builddisabledpatch, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_summondelta, docs_superpowers_plans_2026_08_10_welcome_sections_and_selling_points_welcomesections, docs_superpowers_plans_2026_08_11_home_board_and_service_ordering_byname, docs_superpowers_plans_2026_08_11_home_board_and_service_ordering_matchesquery, docs_superpowers_plans_2026_08_11_home_board_and_service_ordering_summonorder, docs_superpowers_plans_2026_08_12_tile_reorder_live_gap_enabledkey [INFERRED 0.85]
- **No view may be visible over a shell surface** — docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_anyoverlayopen, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_homeopen, docs_superpowers_plans_2026_08_09_home_screen_and_service_composition_show_false, docs_superpowers_plans_2026_08_10_restore_last_active_service_resolvestartupsurface, docs_superpowers_specs_2026_08_06_service_loading_screen_design_loading_overlay [INFERRED 0.85]
- **Home as a shell surface: the overlay invariant end to end** — docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_homeopen_surface, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_home_setopen_channel, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_anyoverlayopen, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_activate_show_option, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_overlay_invariant, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_activateservice_clears_home, docs_superpowers_specs_2026_08_10_restore_last_active_service_design_startup_hidden_activation [EXTRACTED 1.00]
- **src/shared/welcome.ts pure helper family** — docs_superpowers_specs_2026_08_08_welcome_screen_design_builddisabledpatch, docs_superpowers_specs_2026_08_09_home_screen_and_service_composition_design_summondelta, docs_superpowers_specs_2026_08_10_welcome_sections_and_selling_points_design_welcomesections, docs_superpowers_specs_2026_08_11_home_board_and_service_ordering_design_byname, docs_superpowers_specs_2026_08_11_home_board_and_service_ordering_design_summonorder, docs_superpowers_specs_2026_08_11_home_board_and_service_ordering_design_matchesquery [EXTRACTED 1.00]
- **Goetia Brand Identity System (mark, wordmark, tagline, palette)** — docs_media_banner_ember_portal_mark, docs_media_banner_wordmark, docs_media_banner_tagline, docs_media_banner_ember_palette, resources_icon, src_renderer_src_tokens [INFERRED 0.85]
- **Theme-Agnostic Rendering Strategy (transparent bg, presentation-attribute fallbacks, prefers-color-scheme refinement)** — docs_media_banner_banner, docs_media_banner_theme_resilient_fallback, docs_media_banner_tagline, docs_media_banner_ember_palette [EXTRACTED 1.00]
- **TikTok service visual identity asset set (rail logo + per-platform notification icons)** — src_renderer_src_assets_logos_tiktok_logo, resources_notification_icons_tiktok_icon, resources_notification_icons_tiktok_mac_icon [INFERRED 0.85]
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

## Communities (172 total, 48 thin omitted)

### Community 0 - "Hibernation & Peeks"
Cohesion: 0.11
Nodes (12): DEBUG_PEEKS, HibernationController, BanishCandidate, shouldBanish(), HibernationCandidate, shouldHibernate(), PeekCandidate, peekInterval() (+4 more)

### Community 1 - "Home Screen Components"
Cohesion: 0.14
Nodes (17): Props, Props, Props, SummonGauge(), Welcome(), buildDisabledPatch(), byName(), capBlocked() (+9 more)

### Community 2 - "Guardrail Invariants"
Cohesion: 0.09
Nodes (29): Auto-banish as a hibernation sweep step, Banner click lands in the conversation, chatPaths containment (SPA snapback), Home is a destination, not a toggle, Single throttled notification path, Purge and banish are orthogonal axes, Recents are the banner stream remembered, Launch restores the surface you left (+21 more)

### Community 3 - "Startup Surface & View Manager"
Cohesion: 0.14
Nodes (3): StartupSurface, ServiceViewManager, ServiceId

### Community 4 - "Biome Lint Config"
Cohesion: 0.07
Nodes (26): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+18 more)

### Community 5 - "Chat-Only Recipe Principles"
Cohesion: 0.10
Nodes (27): Adding a service checklist, Chat ONLY product principle, count() cost and settlement rules, Recipe hideChrome per-tick hook, Build from source via corepack pnpm, ferdium-recipes (Apache-2.0) as recipe source, Recipe framework and runner, Service loading screen (waking overlay) plan (+19 more)

### Community 6 - "Update Check & Versioning"
Cohesion: 0.14
Nodes (9): compareVersions(), isNewer(), parseLatestRelease(), parts(), releaseUrl(), UpdateChecker, UpdateCheckerDeps, harness() (+1 more)

### Community 7 - "State Broadcast & Shell Wiring"
Cohesion: 0.11
Nodes (25): Bounded timers and listener teardown, Report on change only, Regression: switching services didn't update the UI, MainState snapshot and broadcast pipeline, Quick switcher, fuzzyScore and app menu accelerators, SettingsStore over conf, Tray, close-to-tray and autostart, keepAlive opens the collapsed pill (+17 more)

### Community 8 - "Security Hardening Design"
Cohesion: 0.10
Nodes (25): Accepted residual risk, Hardening & remediation design, Electron fuses block, External URL scheme allowlist, IPC sender/origin validation, Pure lib/ helper testing strategy, Navigation containment guard, Per-field settings normalize coercion (+17 more)

### Community 9 - "Service Catalog & Icons"
Cohesion: 0.13
Nodes (13): iconFileName(), resolveIcons(), Slack Logo SVG (renderer asset), Slack Brand Mark (four-lozenge hash), Monochrome 24x24 Service Glyph Convention, SERVICES, isShell(), launch() (+5 more)

### Community 10 - "Settings View UI"
Cohesion: 0.11
Nodes (16): close(), DAY_LABELS, DAY_ORDER, isMac, SectionId, SECTIONS, SettingsView(), updateStatusLine() (+8 more)

### Community 11 - "Welcome Confirm Flow"
Cohesion: 0.13
Nodes (22): buildDisabledPatch, Welcome confirm flow, Portal.tsx, Service picker grid, Welcome.tsx, Escape leaves Home, Seeded, staged picker, summonDelta (+14 more)

### Community 12 - "Loading Overlay & IPC Sender Policy"
Cohesion: 0.13
Nodes (15): ipcSenderAllowed(), BG, LoadingState, api, GoetiaLoadingApi, LoadingState, allowed, api (+7 more)

### Community 13 - "Quiet Hours Scheduling"
Cohesion: 0.16
Nodes (11): minutesOf(), muteToggleResult(), nextBoundary(), quietNow(), quietWindowFor(), windowStartingOn(), QuietHoursController, QuietHoursSchedule (+3 more)

### Community 14 - "Post-Ship Hardening Decisions"
Cohesion: 0.11
Nodes (21): Permission handler origin check, Release supply-chain SHA pinning and provenance, Renderer CSP tightening, Chat ONLY principle (post-ship), chatPaths containment, TikTok chat service, The GitHub request belongs in main, Claims first, screenshots as proof (+13 more)

### Community 15 - "Activation & Surface Routing"
Cohesion: 0.21
Nodes (12): activateService(), performBannerAction(), presentSurface(), rememberSurface(), setHomeOpen(), setOverlayOpen(), applyDisabledChange(), serviceAccelerator() (+4 more)

### Community 16 - "Recipe Runner & Containment Tests"
Cohesion: 0.19
Nodes (10): startRecipe(), harness(), harness(), hashRouted, recipe, harness(), harness(), once() (+2 more)

### Community 17 - "Rail Badges (Light Theme)"
Cohesion: 0.14
Nodes (20): Active Service Highlight, Discord Service, Home Sigil, Icon-Only Minimal Chrome, Instagram Service, Light Theme, Messenger Service, Muted Service Indicator (+12 more)

### Community 18 - "Process Boundary Invariants"
Cohesion: 0.14
Nodes (19): IPC channel classification and sender check, keepRendered is two mechanisms, not one, Navigation containment and the contained window fallback, Process boundaries (shell sandboxed, views not), Renderer CSP lockdown, WebAuthn/passkey blocking shim, Navigation guard not yet wired (superseded), chromeUserAgent strips Electron tokens (+11 more)

### Community 19 - "Rail Badges (Dark Theme)"
Cohesion: 0.14
Nodes (19): Active Service Highlight, Amber Monochrome Icon Treatment, Badge Stays Visible While Muted, Dark Theme Rail Styling, Discord, Home Sigil, Instagram, Messenger (+11 more)

### Community 20 - "Goetia v1 Implementation Plan"
Cohesion: 0.12
Nodes (19): Design tokens and reduced-motion kill switch, Typed IPC contract, Agents never commit (plan-wide constraint), Notification pipeline and shouldNotify, Goetia v1 implementation plan, Single-window shell with a view per service, Build-time tile rasteriser, Assets shipped outside the asar (+11 more)

### Community 21 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 22 - "IPC Handlers & AppContext"
Cohesion: 0.23
Nodes (9): AppContext, register(), registerInvoke(), registerIpcHandlers(), senderAllowed(), setServiceMuted(), purgeAll(), purgeLogin() (+1 more)

### Community 23 - "Call Policy & Layout"
Cohesion: 0.19
Nodes (12): CALL_ORIGINS, CALL_POPUPS, CallPopupRule, isBlankCallPopup(), isCallPopup(), sameBounds(), ViewBounds, reloadAllowed() (+4 more)

### Community 24 - "MainState Runtime Store"
Cohesion: 0.22
Nodes (5): defaultRuntime(), MainState, WakingTracker, ServiceRuntime, UpdateState

### Community 25 - "Ready Poll & Slack/Telegram Recipes"
Cohesion: 0.12
Nodes (6): startReadyPoll(), slack, telegram, Recipe, base, doc

### Community 26 - "Home Overlay Activation Rules"
Cohesion: 0.14
Nodes (18): resolveActivation, Startup zero-view guard, Welcome is derived, not flagged, activateService clears homeOpen, anyOverlayOpen, Home accelerator (CmdOrCtrl+0), home:setOpen channel, homeOpen shell surface (+10 more)

### Community 27 - "Discord & WhatsApp Recipes"
Cohesion: 0.14
Nodes (12): discord, visiblyPresent(), unreadFromTitle(), countWhatsAppChats(), whatsapp, WhatsAppChat, discord.html fixture (guild badges + dot title), Orphan numberBadge exclusion (badge must be nested in lowerBadge) (+4 more)

### Community 28 - "Meta Recipes (Instagram/Messenger)"
Cohesion: 0.20
Nodes (6): instagram, countUnreadRows(), isUnreadRow(), synthFromRows(), watchRows(), Counts

### Community 29 - "Toast & Placeholder Components"
Cohesion: 0.22
Nodes (10): CapTrimToast(), NO_IDS, NO_SERVICES, ContentPlaceholder(), PurgeToast(), capTrimMessage(), purgeToastMessage(), shouldToast() (+2 more)

### Community 30 - "Release Workflow & Fuses"
Cohesion: 0.13
Nodes (17): Electron fuses invariant, Badge aggregation across dock, overlay and rail, E2E smoke test and packaging targets, Arch-suffixed dmg artifact names, Release workflow implementation plan, publish: null plus --publish never, Two-phase build matrix and release job, Tag-matches-package.json guard (+9 more)

### Community 31 - "Mute & Notification Invariants"
Cohesion: 0.15
Nodes (17): Mute means silence, never blindness, One sound per message, Quiet hours as a scheduled global mute, Reload is the only way back, ResilienceManager crash-count dwell, ctx.setGlobalMuted single choke point, Manual-only verification areas, Feature inventory & verification status (+9 more)

### Community 32 - "Check-for-Updates Plan"
Cohesion: 0.18
Nodes (17): Announce gate (latest vs announce), The update fetch lives in main, Settings gear update dot, Check for Updates Implementation Plan, Automatic checks fail silently, shouldToast / TOAST_MS, update-check pure version logic, UpdateChecker (+9 more)

### Community 33 - "Unread Counting Optimizations"
Cohesion: 0.14
Nodes (17): Single badge-label formatter, Single-pass Messenger count(), Runner count() timeout race, Stale-report dedup and no-op setRuntime, hideChrome recipe hook, meta-unread.ts shared Meta heuristics, Rail space reclaim, Structural nav-rail computation (+9 more)

### Community 34 - "Summon Cap & Home Redesign"
Cohesion: 0.15
Nodes (17): capBlocked picker rule, Discard replaces Dispel, HomeHero fixed left column, MAX_SUMMONED cap of 9, SummonGauge ring, trimToCap and normalize() enforcement, followLiveOrder (clean board follows silently), homeDirty / discardHomeDraft store fields (+9 more)

### Community 35 - "App Icon & Ember Branding"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 36 - "Preload Notify/WebAuthn Shims"
Cohesion: 0.16
Nodes (7): openConversationInPage(), installNotificationShim(), NotificationShimHandle, NotifyForward, installWebAuthnBlock(), arg, serviceId

### Community 37 - "Shopee & Zalo Recipes"
Cohesion: 0.15
Nodes (10): chatHeader(), shopee, zalo, shopee-collapsed.html fixture (collapsed pill badge 5), Collapsed pill as keep-alive click target (single wrapper child = not ready), shopee.html fixture (expanded mini-chat, header badge 31), Shopee mini-chat expanded state (wrapper has header + body children), zalo-dormant.html fixture (idle-deactivation activation modal) (+2 more)

### Community 38 - "Home Board Ordering Plan"
Cohesion: 0.19
Nodes (16): Home board layout, byName, matchesQuery substring filter, moveTo drag index arithmetic, PickTile, Home Board and Service Ordering Plan, ServiceBand, summonOrder append-on-summon (+8 more)

### Community 39 - "Slack & Teams Service Design"
Cohesion: 0.18
Nodes (15): firstRunUrl and lib/start-url.ts (superseded), Slack chat-only CSS, Slack ALLOWED_HOSTS entry, Slack recipe count(), Slack service (ninth service), Hash-aware chatPaths, Teams keeps its app bar (no css), Teams recipe count() (+7 more)

### Community 40 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): @biomejs/biome, motion, devDependencies, @biomejs/biome, motion, tailwindcss, typescript, @vitejs/plugin-react (+7 more)

### Community 41 - "Quick Switcher (Dark)"
Cohesion: 0.18
Nodes (15): Quick Switcher (dark) screenshot, Dark theme surface, Discord, Instagram, Matches ranked first, other services still listed, Messenger, Cmd+1..9 service accelerators, Quick Switcher overlay (+7 more)

### Community 42 - "Settings Screenshot (Light)"
Cohesion: 0.16
Nodes (15): Settings (Light Theme) Screenshot, Appearance Pane, Grouped Card Row Layout, Settings Category Sidebar, General Pane, Light Theme, Menu Position Setting, Settings Has No Service Enable Toggle (+7 more)

### Community 43 - "Welcome Screenshot (Dark)"
Cohesion: 0.16
Nodes (15): Goetia Welcome Screen (Dark Theme Screenshot), Chat-Only Principle Tagline ("All your chats. Nothing else."), Dark Theme with Ember/Amber Accent, Find a Service Search Field, Hibernation Hint ("Signs in once · idle chats sleep"), Home (Welcome Screen), Home Shortcut Hint (⌘/Ctrl 0 returns you here), Service Board (Summon/Banish Editor) (+7 more)

### Community 44 - "Welcome Screenshot (Light)"
Cohesion: 0.15
Nodes (15): Welcome Screen Screenshot (Light Theme), Bell and Gear Controls, Chat Only · No Feeds, No Shops, Home / Welcome Screen, ⌘/Ctrl 0 Returns You Here, Signs In Once · Idle Chats Sleep, Light Theme Palette (Warm Orange Accent), Service Board (Summoned / Unbound) (+7 more)

### Community 45 - "Notification Throttle & Toast Rules"
Cohesion: 0.14
Nodes (15): Per-service notification rate limit, TikTok synthNotification, Announce gate, Settings.lastNotifiedVersion, Timer-driven dismissal under reduced motion, Self-dismissing UpdateToast, shouldToast, Silent automatic failures (+7 more)

### Community 46 - "Peek Discipline & Overlay Guard"
Cohesion: 0.18
Nodes (14): Light Sleep peek discipline, Views layer above the shell: overlay guard, peekSaver adaptive backoff, Tile reorder never streams to IPC, Ember Portal branding, HomeHero + SummonGauge single layout, MAX_SUMMONED / capBlocked / trimToCap, Home Redesign and Summon Cap Implementation Plan (+6 more)

### Community 47 - "Quick Switcher (Light)"
Cohesion: 0.18
Nodes (14): Quick Switcher (light theme) screenshot, Per-service accelerator hints (⌘1…⌘9), Discord, Instagram, Light theme palette, Messenger, Substring query filter ("s"), Quick Switcher overlay (+6 more)

### Community 48 - "Settings Screenshot (Dark)"
Cohesion: 0.18
Nodes (14): Settings (Dark Theme) Screenshot, Appearance Section, Dark Theme, General Section, Menu Position Setting, Settings Has No Service Enable Toggle, Notifications Section, Shell Overlay Surface (+6 more)

### Community 49 - "README Showcase & Media Capture"
Cohesion: 0.21
Nodes (14): LoadingOverlay WebContentsView, docs/media/banner.svg, capture-media.mjs capture driver, Capture matrix (SHOTS), Screenshots show Goetia's own chrome only, docs/DEVELOPING.md split, MD033 inline-HTML allowlist, README Showcase Implementation Plan (+6 more)

### Community 50 - "Media Capture Scripts"
Cohesion: 0.23
Nodes (9): capture(), isShell(), SURFACES, ALL_SERVICE_IDS, NINE_UP, settingsFor(), SHOTS, SURFACES (+1 more)

### Community 51 - "Service Context Menu Builder"
Cohesion: 0.21
Nodes (10): buildContextMenuTemplate(), ContextMenuInfo, ContextMenuItem, edit(), image(), link(), spelling(), allEdit (+2 more)

### Community 52 - "Quick Switcher Component"
Cohesion: 0.29
Nodes (9): logos, QuickSwitcher(), msUntilLabelChange(), nextLabelChange(), relativeTime(), switcherRows(), SwitcherService, ActivityEntryView (+1 more)

### Community 53 - "Welcome Screen Plan"
Cohesion: 0.24
Nodes (13): buildDisabledPatch, Welcome visibility is derived, not a flag, Welcome Screen Implementation Plan, Portal (shared ember-portal component), Welcome component, summonDelta / summonLabel, Three non-overlapping selling-point cards, Dispel button (+5 more)

### Community 54 - "Home Composition Plan"
Cohesion: 0.28
Nodes (13): resolveActivation, anyOverlayOpen predicate, Composition lives on Home, not Settings, homeOpen shell surface, Home Screen and Service Composition Plan, Rail home sigil and the ⌘/Ctrl 0 accelerator, activate(id, { show: false }) — resolve without revealing, Settings.lastActiveId + lastHomeOpen (+5 more)

### Community 55 - "Package Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, e2e, icons, lint, media, package:mac (+5 more)

### Community 56 - "Main Entry & Summon Hotkey"
Cohesion: 0.19
Nodes (4): e2eUpdate, userDataArg, coalesce(), SummonHotkey

### Community 57 - "Activation Rules & Reorder"
Cohesion: 0.22
Nodes (3): applySubsetOrder(), DEFAULT_SETTINGS, UpdateStatus

### Community 58 - "Calls, Permissions & External Links"
Cohesion: 0.21
Nodes (12): Call popup: inert guest adopted into a hardened window, Minimal mac entitlements, External links: isSafeExternalUrl gate, Origin-checked permission allowlist, buildContextMenuTemplate pure builder, Service-View Context Menu Implementation Plan, call-policy (CALL_POPUPS, CALL_ORIGINS, isCallPopup), setDisplayMediaRequestHandler with useSystemPicker (+4 more)

### Community 59 - "Notification Icons Design"
Cohesion: 0.23
Nodes (12): Slack logo and notification icons, Graphite minimal design system, Notification router, Unisolated per-service preload, We do not own the banner layout, Brand-colour tile notification icon, build-notification-icons.mjs, extraResources over asarUnpack (+4 more)

### Community 60 - "Recipe Selector Calibration"
Cohesion: 0.17
Nodes (12): TikTok bot-detection risk, data-e2e selector surface, Messages nav-badge count source, Rejected: chat-list scan, Live selector recalibration (2026-08-07), Never hide the side-nav container itself, Instagram calibration caveat, tiktok.html recipe fixture (+4 more)

### Community 61 - "Telegram/WhatsApp/Zalo Icons"
Cohesion: 0.27
Nodes (12): Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed), Telegram macOS Notification Icon (blue squircle, white circle, paper-plane glyph, inset padding), macOS Notification Icon Variant Convention (-mac suffix pairs), Per-Service Notification Icon Asset Set, Brand-Color Squircle Icon Design Language, WhatsApp Notification Icon (green rounded-square badge, white speech-bubble handset glyph, full bleed), WhatsApp macOS Notification Icon (green squircle, white speech-bubble handset glyph, inset padding), Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed) (+4 more)

### Community 62 - "Settings Migrations & Zoom"
Cohesion: 0.33
Nodes (9): clampZoom(), stepZoom(), fillAutoBanish(), fillLastUsedAt(), fillQuietHours(), fillSummonHotkey(), fillZoom(), normalize() (+1 more)

### Community 63 - "View Hooks & Lifecycle"
Cohesion: 0.24
Nodes (5): debugCalls(), ViewHooks, serviceById(), allFalse, url()

### Community 64 - "Service Tile Components"
Cohesion: 0.21
Nodes (6): logos, Props, logos, PickTile(), Props, ServiceMeta

### Community 65 - "Chat Client Design Spec"
Cohesion: 0.29
Nodes (11): Badge shot seeds neverHibernate false, Catalog sorted by display name, Badge aggregator, Electron as the desktop shell, Hibernation controller, Per-service unread recipes, Per-service persist: session isolation, Goetia Chat Client Design Spec (+3 more)

### Community 66 - "Context Menu & Sign-Out Design"
Cohesion: 0.18
Nodes (11): buildContextMenuTemplate, Service-view native context menu, Open Link in Browser hand-off, Add to Dictionary is per service, peek-rules.ts scheduling, Per-service sign out (local partition wipe), service:tileMenu channel, Auto-banish sweep step and applyDisabledChange (+3 more)

### Community 67 - "Light Sleep & Banner Click"
Cohesion: 0.22
Nodes (11): Stale-banner disabled guard, Light Sleep (peek while hibernated), neverHibernate default flips to false, Peek lifecycle and noteUnreadReport, BANNER_GRACE_MS (the Light Sleep interaction), Banner → exact conversation, Lane A — replay the page's own click, Lane B — synthetic banners carry an href (+3 more)

### Community 68 - "Rail Component & Reorder Prompt"
Cohesion: 0.25
Nodes (4): Rail(), Props, RailReorderPrompt(), useTileReorder()

### Community 69 - "Teams Hosts & Call Windows"
Cohesion: 0.20
Nodes (10): Origin-exact permission caveat (teams.live.com), Teams ALLOWED_HOSTS and tenant SSO gap, WebAuthn/passkey block shim, isBlankCallPopup (about:blank popups), call-policy.ts (CALL_POPUPS / CALL_ORIGINS / isCallPopup), Call URL adoption into a hardened call window, setDisplayMediaRequestHandler with the system picker, Inert guest popup (never commits a navigation) (+2 more)

### Community 70 - "Notification Rules & Router"
Cohesion: 0.47
Nodes (6): audioMuted(), notificationTitle(), shouldNotify(), soundOptions(), NotificationRouter, RendererToMain

### Community 71 - "SettingsStore Implementation"
Cohesion: 0.44
Nodes (3): deepFreeze(), SettingsStore, Settings

### Community 72 - "Banner SVG & Wordmark"
Cohesion: 0.36
Nodes (9): Accessible SVG Labeling (role=img, aria-label, title), Goetia Banner (1200x300 SVG), Ember Gradient Palette (arcA, arcB, core, word), Ember Portal Mark, Tagline: Summon every chat to one window, nothing but the chat, Theme-Resilient SVG Fallback, Goetia Wordmark, App Icon SVG (resources/icon.svg) (+1 more)

### Community 73 - "Slack Service Plan"
Cohesion: 0.31
Nodes (9): Fresh installs start all-disabled, Tasks 1–3 are one atomic change, Slack Service Implementation Plan, tests/fixtures/slack.html count oracle, ALLOWED_HOSTS slack entry, slack recipe, Slack service catalog entry, Selectors uncalibrated until a live login pass (+1 more)

### Community 74 - "Drag-to-Reorder Design"
Cohesion: 0.25
Nodes (9): Drag-to-reorder on Home, moveTo, applySubsetOrder, macOS copy-cursor badge defect, Draft order, committed once on drag end, What the drag looks like, Pointer drag makes the reorder path e2e-testable, Reorder.Group / pointer-driven reorder (+1 more)

### Community 75 - "Package Metadata"
Cohesion: 0.22
Nodes (8): description, main, name, packageManager, private, productName, type, version

### Community 76 - "Brand Squircle Icon System"
Cohesion: 0.36
Nodes (9): Brand squircle notification icon system (128x128 RGBA, white glyph on brand fill), Discord notification icon (full-bleed), Discord notification icon (macOS inset variant), macOS `-mac` inset icon variant convention, Messenger notification icon (full-bleed), Messenger notification icon (macOS inset variant), Shopee notification icon (full-bleed), Shopee notification icon (macOS inset variant) (+1 more)

### Community 77 - "Badge Aggregation"
Cohesion: 0.31
Nodes (4): aggregateBadges(), BadgeEntry, badgeLabel(), BadgeSummary

### Community 78 - "Activity Log"
Cohesion: 0.28
Nodes (3): ActivityEntry, ActivityLog, entry()

### Community 80 - "Reorder E2E Spec"
Cohesion: 0.28
Nodes (5): drag(), isShell(), launch(), stableBox(), TWO_ENABLED

### Community 81 - "Waking Overlay (Dark)"
Cohesion: 0.32
Nodes (8): Dark Theme Palette, Light Sleep Wake / Hibernation Rehydration, Naming the Service Being Woken, Waking Overlay Screenshot (Dark Theme), Goetia Sigil Spinner, Waking Cover Overlay, "Waking <Service>..." Status Label, Zalo Service (subject of the wake)

### Community 82 - "Waking Overlay (Light)"
Cohesion: 0.39
Nodes (8): Waking Overlay Screenshot (Light Theme), Light Sleep Hibernation, Light Theme Surface, Non-Blocking Wake Feedback, Orbital Ring Sigil Spinner, Waking Cover, "Waking <Service>..." Status Label, Zalo Service

### Community 83 - "Reload Guard & Auto-Banish"
Cohesion: 0.29
Nodes (8): Why the reload guard cannot trap the user, reloadAllowed reload guard, Settings loses its per-service reload button, views.reload stays unguarded, Auto-banish unused services, shouldBanish (banish-rules.ts), lastUsedAt persisted wall clock, Sleep settings move to the Services pane

### Community 84 - "Navigation Policy & Hosts"
Cohesion: 0.36
Nodes (3): ALLOWED_HOSTS, hostMatches(), isNavigationAllowed()

### Community 85 - "Recipe Index & Teams Recipe"
Cohesion: 0.32
Nodes (3): recipes, teams, cases

### Community 86 - "App Shell & Overlay Badge"
Cohesion: 0.46
Nodes (4): App(), overlayNeedsUpdate(), renderOverlayDataUrl(), connectShell()

### Community 87 - "Purge Confirm & Copy"
Cohesion: 0.46
Nodes (5): PurgeConfirm(), PurgeRequest, purgeAllCopy(), PurgeCopy, purgeLoginCopy()

### Community 88 - "Release CI Workflow"
Cohesion: 0.33
Nodes (7): Build provenance attestation step, Build job (mac arm64/x64 + win matrix), SHA256SUMS.txt generation, CSC_IDENTITY_AUTO_DISCOVERY disabled (no signing material), Publish release job, Tag must match package.json version, Release workflow (tag-triggered)

### Community 89 - "Shopee Chat Focus Design"
Cohesion: 0.33
Nodes (7): Overlay above a still-visible view, Recipe CSS gated on the expanded state, Homepage entry URL, never /webchat, keepAlive trusted click on the collapsed pill, No network filtering, Unread from host textContent, Shopee Chat Focus Design

### Community 90 - "Quiet Hours & Summon Hotkey Design"
Cohesion: 0.33
Nodes (7): QuietHoursController and the shared side-effects tail, Quiet hours (scheduled global mute), quiet-hours-rules.ts, quietOverrideWindowStart (the macOS DND rule), SUMMON_COMBOS curated list, Summon hotkey (global shortcut), summonHotkeyOk (no silent failure)

### Community 91 - "Tray Template Icons"
Cohesion: 0.29
Nodes (7): Goetia, Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Template Image Convention, Goetia macOS Template Tray Icon, Windows System Tray

### Community 92 - "Tray Creation & Mute"
Cohesion: 0.29
Nodes (4): Windows Tray Icon (orange ring mark), macOS Tray Template Icon, createTray(), RESOURCES

### Community 93 - "Notification Icon Build Script"
Cohesion: 0.33
Nodes (5): LOGO_DIR, OUT_DIR, placeGlyph(), ROOT, tileSvg()

### Community 96 - "Packaging & Gatekeeper"
Cohesion: 0.47
Nodes (6): Packaging, ad-hoc signing, and Gatekeeper, Reproducing the Gatekeeper prompt by hand, Ad-hoc mac signing identity '-', electronFuses block, SHA256SUMS + GitHub build-provenance attestation, Unsigned distribution and the first-launch warning

### Community 97 - "Overlay Invariant Bugs"
Cohesion: 0.47
Nodes (6): views.activate show option, Buried Settings modal bug, Overlay invariant: no view visible over a shell surface, Settings loses the enable toggle, Startup activates hidden when Home is restored, Dispel button

### Community 98 - "Screenshot Shot Types"
Cohesion: 0.33
Nodes (5): SeededSettings, ServiceId, Shot, Surface, Theme

### Community 99 - "Release Shell Script"
Cohesion: 0.60
Nodes (5): die(), run(), release.sh script, skip(), step()

### Community 100 - "Banner Click Resolution"
Cohesion: 0.47
Nodes (4): BannerClickAction, conversationUrl(), resolveBannerClick(), base

### Community 102 - "Emoji Text Extraction"
Cohesion: 0.53
Nodes (3): collect(), glyph(), textWithEmoji()

### Community 103 - "Messenger Fixtures & Synth"
Cohesion: 0.40
Nodes (4): messenger, messenger.html fixture (chat-row unread oracle), Emoji delivered as <img alt> inside the row preview, messenger-reaction.html fixture (synthesized reaction notification)

### Community 104 - "Slack Notification Icons"
Cohesion: 0.50
Nodes (5): Slack macOS Notification Icon, Per-Service Notification Identity, Platform-Suffixed Notification Icon Variant (-mac), Slack Octothorpe Brand Mark (white on aubergine), Squircle App-Icon Treatment

### Community 105 - "Teams macOS Icon"
Cohesion: 0.60
Nodes (5): macOS Notification Icon Variant, Microsoft Teams, Goetia Notification Icon Assets, Teams Logo Mark (T tile with person silhouette), Teams macOS Notification Icon

### Community 106 - "TikTok Icons & Logo"
Cohesion: 0.70
Nodes (5): TikTok Notification Icon (default/Windows-Linux), TikTok Notification Icon (macOS variant), Platform-suffixed notification icon variant convention, TikTok Logo Mark (renderer SVG), Monochrome white glyph logo style (no brand fill)

### Community 108 - "Permission Policy"
Cohesion: 0.70
Nodes (3): CALL_SURFACE_OK, GRANTED, permissionAllowed()

### Community 109 - "Restart E2E Spec"
Cohesion: 0.50
Nodes (3): isShell(), launch(), TWO_ENABLED

### Community 110 - "Instagram macOS Icon"
Cohesion: 0.83
Nodes (4): Flat White Camera Glyph on Crimson Squircle, Instagram macOS Notification Icon, Instagram Service Visual Identity, Per-Platform Notification Icon Variant Convention

### Community 111 - "Teams Notification Icon"
Cohesion: 0.67
Nodes (4): Microsoft Teams (service), Notification Icon Asset Set, Teams Logo Mark (T glyph and person silhouette), Teams Notification Icon

### Community 115 - "Loading HTML Page"
Cohesion: 0.83
Nodes (4): loading.html (waking overlay page), Inline critical first-paint CSS in loading.html, loading.html Content-Security-Policy meta, Ember portal SVG (ring arcs, embers, breathing core)

### Community 116 - "Teams Logo SVG"
Cohesion: 0.83
Nodes (4): Microsoft Teams, Monochrome Glyph Mark (white fill, 24x24 viewBox), Service Rail Tile Icon, Microsoft Teams Logo (SVG asset)

### Community 118 - "Banish E2E Spec"
Cohesion: 0.67
Nodes (3): DISABLED, isShell(), launch()

### Community 121 - "Release Notes Preamble"
Cohesion: 0.67
Nodes (3): First-launch gate walkthrough, Installer checksum and attestation verification, Release notes preamble

### Community 122 - "Slack Notification Icon"
Cohesion: 1.00
Nodes (3): Per-Service Notification Icon Asset Convention, Slack Brand Glyph (four-lozenge octothorpe), Slack Notification Icon (slack.png)

### Community 123 - "Tray Template SVG"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

### Community 128 - "Shell HTML Document"
Cohesion: 0.67
Nodes (3): Shell CSP meta policy (index.html), #root mount point + /src/main.tsx module entry, Shell window HTML document (index.html)

### Community 129 - "Instagram Logo SVG"
Cohesion: 1.00
Nodes (3): Accessible SVG Labeling (role=img + <title>), Instagram Logo Glyph (rail icon asset), Monochrome 24x24 Service Logo Convention

## Ambiguous Edges - Review These
- `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` → `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`  [AMBIGUOUS]
  resources/notification-icons/zalo.png · relation: semantically_similar_to
- `Platform-suffixed notification icon variant convention` → `Monochrome white glyph logo style (no brand fill)`  [AMBIGUOUS]
  src/renderer/src/assets/logos/tiktok.svg · relation: conceptually_related_to
- `Badge aggregation across dock, overlay and rail` → `Mute means silence, never blindness`  [AMBIGUOUS]
  docs/superpowers/plans/2026-08-04-goetia-v1.md · relation: conceptually_related_to
- `Cmd+1..9 service accelerators` → `Monochrome service glyphs`  [AMBIGUOUS]
  docs/media/quick-switcher-dark.png · relation: conceptually_related_to
- `Quick Switcher overlay` → `Accelerators track rail order, not filtered position`  [AMBIGUOUS]
  docs/media/quick-switcher-light.png · relation: conceptually_related_to
- `Rail Badges (Dark Theme) Screenshot` → `Badge Stays Visible While Muted`  [AMBIGUOUS]
  docs/media/rail-badges-dark.png · relation: references
- `Settings Sidebar Navigation` → `Shell Overlay Surface`  [AMBIGUOUS]
  docs/media/settings-dark.png · relation: conceptually_related_to
- `Services Pane` → `Settings Has No Service Enable Toggle`  [AMBIGUOUS]
  docs/media/settings-light.png · relation: rationale_for
- `Shell Overlay Surface` → `Settings Has No Service Enable Toggle`  [AMBIGUOUS]
  docs/media/settings-light.png · relation: conceptually_related_to
- `Zalo Service` → `Light Sleep Hibernation`  [AMBIGUOUS]
  docs/media/waking-light.png · relation: conceptually_related_to
- `Summon Counter Ring (3 / 9 AFTER SUMMON)` → `Service Rail with Unread Badge`  [AMBIGUOUS]
  docs/media/welcome-dark.png · relation: semantically_similar_to
- `Monochrome Glyph Mark (white fill, 24x24 viewBox)` → `Service Rail Tile Icon`  [AMBIGUOUS]
  src/renderer/src/assets/logos/teams.svg · relation: rationale_for

## Knowledge Gaps
- **276 isolated node(s):** `target`, `module`, `moduleResolution`, `ES2022`, `DOM` (+271 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **48 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` and `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Platform-suffixed notification icon variant convention` and `Monochrome white glyph logo style (no brand fill)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Badge aggregation across dock, overlay and rail` and `Mute means silence, never blindness`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Cmd+1..9 service accelerators` and `Monochrome service glyphs`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Quick Switcher overlay` and `Accelerators track rail order, not filtered position`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Rail Badges (Dark Theme) Screenshot` and `Badge Stays Visible While Muted`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Settings Sidebar Navigation` and `Shell Overlay Surface`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._