# Graph Report - .  (2026-08-29)

## Corpus Check
- 56 files · ~303,547 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1853 nodes · 3204 edges · 187 communities (129 shown, 58 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 355 edges (avg confidence: 0.85)
- Token cost: 180,756 input · 0 output

## Community Hubs (Navigation)
- Pinned Messages Store & Rules
- WhatsApp/Zalo Conversation Open
- Shell Shortcuts & Settings View
- Hibernation & Peeks
- Call Policy & Permissions
- Guardrail Invariants
- Biome Lint Config
- Update Check & Versioning
- Startup Surface & View Manager
- Security Hardening Design
- Product Docs & Feature Inventory
- Process Boundary Invariants
- Meta Recipes (Instagram/Messenger)
- Welcome Confirm Flow
- Service Catalog & Default Settings
- IPC Channels & Shell State
- Quiet Hours Scheduling
- MainState Runtime Store
- Post-Ship Hardening Decisions
- Welcome Sections & Summon Labels
- Recipe Runner & Containment Tests
- State Broadcast & Shell Wiring
- Rail Badges (Light Theme)
- Service Tile Components
- Settings Migrations & Zoom
- Rail Badges (Dark Theme)
- Service Context Menu Builder
- TypeScript Config
- SettingsStore Implementation
- Activation & Surface Routing
- Check-for-Updates Plan
- Summon Cap & Home Redesign
- App Icon & Ember Branding
- Ready Poll & Discord/Telegram Recipes
- Home Board Ordering Plan
- Unread Counting Optimizations
- Slack & Teams Service Design
- Dev Dependencies
- Quick Switcher (Dark)
- Settings Screenshot (Light)
- Welcome Screenshot (Dark)
- Welcome Screenshot (Light)
- Startup Surface Restore
- Notification Rules & Router
- Resilience Manager
- Quick Switcher (Light)
- Settings Screenshot (Dark)
- README Showcase & Media Capture
- Media Capture Scripts
- Toast & Placeholder Components
- Quick Switcher Component
- Fuses, Signing & Gatekeeper
- Welcome Screen Plan
- Home Composition Plan
- Notification Throttle & Toast Rules
- Package Scripts
- Shell Store & App Root
- Notification Icons Design
- Recipe Selector Calibration
- Teams Hosts & Call Windows
- Tray Template Icons
- Telegram/WhatsApp/Zalo Icons
- Shell Commands & App Menu
- Emoji Text Extraction
- Shopee & Zalo Recipes
- Release Workflow & Tray
- Chat Client Design Spec
- Home Overlay Activation Rules
- Light Sleep & Banner Click
- IPC Handlers & AppContext
- View Hooks & Lifecycle
- Chat-Only Recipe Principles
- TikTok, Icons & Home Board Plans
- Home Pinned & Service Bands
- Recipe Interface & Slack
- Banner Click Resolution
- Reload Guard & Back Affordance
- Banner SVG & Wordmark
- Slack Service Plan
- Drag-to-Reorder Design
- Context Menu & Sign-Out Design
- Package Metadata
- Brand Squircle Icon System
- Badge Aggregation
- Purge Confirm & Copy
- Reorder E2E Spec
- Waking Overlay (Dark)
- Waking Overlay (Light)
- Goetia v1 Implementation Plan
- Reload Guard & Auto-Banish
- Activity Log
- Recipe Index & Teams Recipe
- Release CI Workflow
- Rail Component & Pin Tally
- Shopee Chat Focus Design
- Quiet Hours & Summon Hotkey Design
- Notification Icon Build Script
- LoadingOverlay Class
- Notification Shim
- PinRow Callback Props
- Renderer Shell Store
- Navigation Audit
- Pin Capture Wiring
- Pin Toast & Acknowledgement
- Screenshot Shot Types
- Release Shell Script
- Notification Icon Resolution
- Loading Screen API
- HomeHero Component
- Shortcuts E2E Spec
- Mute & Notification Invariants
- Slack Notification Icons
- Teams macOS Icon
- TikTok Icons & Logo
- Notification Throttle
- Summon Hotkey
- Rail Reorder Prompt
- Restart E2E Spec
- Detached DevTools Toggle
- Instagram macOS Icon
- Teams Notification Icon
- Coalesce Helper
- Overlay Rules
- WebAuthn Block Shim
- TikTok Recipe & Synth Test
- Loading HTML Page
- Teams Logo SVG
- App Shell & Overlay Badge
- Update Toast Rules
- Banish E2E Spec
- Purge E2E Spec
- Updates E2E Spec
- Release Notes Preamble
- Packaging & Gatekeeper
- Slack Notification Icon
- Tray Template SVG
- Backoff Helper
- User Agent Helper
- Shell HTML Document
- Instagram Logo SVG
- Fuzzy Matching
- Activation Rules & Reorder
- SummonGauge Component
- Peek E2E Spec
- conf Dependency
- Tray Quit & Crash Dwell
- README Banner Assets
- Zoom & Home Accelerator
- electron Dependency
- electron-builder Dependency
- electron-vite Dependency
- happy-dom Dependency
- Motion Dependency
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
- Calls, Permissions & External Links
- pnpm Build Allowlist
- Blank Fixture
- Telegram Fixture
- Zalo Badge Fixture
- Zalo Fixture

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 108 edges
2. `ServiceViewManager` - 40 edges
3. `PinStore` - 31 edges
4. `Recipe` - 30 edges
5. `Pinned messages design spec (2026-08-25)` - 29 edges
6. `AppContext` - 28 edges
7. `registerIpcHandlers()` - 25 edges
8. `useShell` - 25 edges
9. `MainState` - 23 edges
10. `Settings` - 18 edges

## Surprising Connections (you probably didn't know these)
- `chatPaths containment` --shares_data_with--> `resolveBannerClick()`  [INFERRED]
  CLAUDE.md → src/main/lib/notification-click.ts
- `Board snaps as one when the pin set changes` --rationale_for--> `Welcome()`  [INFERRED]
  docs/superpowers/specs/2026-08-25-pinned-messages-design.md → src/renderer/src/components/Welcome.tsx
- `createTray()` --references--> `Windows Tray Icon (orange ring mark)`  [INFERRED]
  src/main/tray.ts → resources/tray/tray-win.png
- `discord.html fixture (guild badges + dot title)` --references--> `discord`  [INFERRED]
  tests/fixtures/discord.html → src/preload/recipes/discord.ts
- `shopee.html fixture (expanded mini-chat, header badge 31)` --shares_data_with--> `chatHeader()`  [INFERRED]
  tests/fixtures/shopee.html → src/preload/recipes/shopee.ts

## Import Cycles
- 3-file cycle: `src/main/commands.ts -> src/main/ipc-handlers.ts -> src/main/menu.ts -> src/main/commands.ts`
- 4-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/menu.ts -> src/main/commands.ts -> src/main/activate.ts`

## Hyperedges (group relationships)
- **Pin capture flow: context menu to rail tally** — src_main_lib_context_menu_pin, src_main_lib_context_menu_buildcontextmenutemplate, src_main_views_serviceviewmanager, src_main_views_serviceviewmanager_menuitemfor, src_main_views_viewhooks_onpinmessage, src_main_pins_pinstore_pin, src_main_state_mainstate_snapshot, src_renderer_src_components_rail_rail [EXTRACTED 1.00]
- **Pin open flow: Home row to in-page conversation** — src_renderer_src_components_welcome_pinnedband_pinnedband, src_main_ipc_handlers_registeripchandlers, src_main_lib_notification_click_resolvebannerclick, src_main_activate_performbanneraction, src_preload_lib_conversation_open_openconversationinpage, claude_conversation_recipe_hooks, claude_trusted_click_channel [INFERRED 0.85]
- **Notification silence rules (mute, quiet hours, sound, badges)** — claude_one_sound_per_message, claude_mute_means_silence, claude_quiet_hours_scheduled_mute, src_main_lib_notification_rules_shouldnotify, src_main_lib_notification_rules_audiomuted, src_main_lib_notification_rules_soundoptions, src_shared_badges_aggregatebadges [EXTRACTED 1.00]
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

## Communities (187 total, 58 thin omitted)

### Community 0 - "Pinned Messages Store & Rules"
Cohesion: 0.06
Nodes (43): Home is a destination, not a toggle, Pins are the user's todo list, on Home, Recents are the banner stream remembered, Pinned messages (feature entry), v0.9 Zoom, Sign-Out, and Quick-Switcher Recents Plan, switcher-results ranking, zoom-rules (clampZoom, stepZoom), Pinned Messages Implementation Plan (2026-08-26) (+35 more)

### Community 1 - "WhatsApp/Zalo Conversation Open"
Cohesion: 0.06
Nodes (39): Recipe conversation()/openConversation() hooks, keepRendered is two mechanisms, service:trusted-click channel, Keep-alive trusted clicks, Open matches by resolved URL, no-op when already there, WhatsApp conversation()/openConversation() hooks, WhatsApp showed the member list and never jumped, Zalo: openConversation returns a point for a trusted click (+31 more)

### Community 2 - "Shell Shortcuts & Settings View"
Cohesion: 0.08
Nodes (29): Left-hand chords for mouse-paired actions, Goetia's chords win inside a page, Shell shortcuts win inside pages (feature entry), Chords moved to the left hand, Chords intercepted in before-input-event, README shortcuts list, sameBounds(), ViewBounds (+21 more)

### Community 3 - "Hibernation & Peeks"
Cohesion: 0.10
Nodes (13): Auto-banish is the hibernation sweep, one step later, DEBUG_PEEKS, HibernationController, BanishCandidate, shouldBanish(), HibernationCandidate, shouldHibernate(), PeekCandidate (+5 more)

### Community 4 - "Call Policy & Permissions"
Cohesion: 0.08
Nodes (26): Adding a service checklist, Call popups: hidden inert guest, adopted into a hardened call window, Minimal macOS entitlements, External links policy, Permission allowlist, ferdium-recipes (Apache-2.0) as recipe source, Update check (feature entry), buildContextMenuTemplate pure builder (+18 more)

### Community 5 - "Guardrail Invariants"
Cohesion: 0.08
Nodes (31): Single throttled notification path, Purge confirm is an in-app modal, Purge and banish are orthogonal axes, HomeHero + SummonGauge single layout, MAX_SUMMONED / capBlocked / trimToCap, Home Redesign and Summon Cap Implementation Plan, ctx.noteUnreadReport late-bound hook, peek-rules scheduling helper (+23 more)

### Community 6 - "Biome Lint Config"
Cohesion: 0.07
Nodes (27): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+19 more)

### Community 7 - "Update Check & Versioning"
Cohesion: 0.14
Nodes (9): compareVersions(), isNewer(), parseLatestRelease(), parts(), releaseUrl(), UpdateChecker, UpdateCheckerDeps, harness() (+1 more)

### Community 9 - "Security Hardening Design"
Cohesion: 0.10
Nodes (25): Accepted residual risk, Hardening & remediation design, Electron fuses block, External URL scheme allowlist, IPC sender/origin validation, Pure lib/ helper testing strategy, Navigation containment guard, Per-field settings normalize coercion (+17 more)

### Community 10 - "Product Docs & Feature Inventory"
Cohesion: 0.10
Nodes (24): Product principle: chat ONLY, chatPaths containment, Recipe hideChrome hook, Light Sleep peeks, One sound per message, peekSaver backoff, Build from source via corepack pnpm, Regression fixed 2026-08-07: switching services didn't update the UI (+16 more)

### Community 11 - "Process Boundary Invariants"
Cohesion: 0.11
Nodes (24): IPC sender policy, Process boundaries, Renderer CSP, WebAuthn/passkey blocking shim, chromeUserAgent strips Electron tokens, Hibernation controller and rules, Typed IPC contract, Notification pipeline and shouldNotify (+16 more)

### Community 12 - "Meta Recipes (Instagram/Messenger)"
Cohesion: 0.16
Nodes (10): link(), instagram, conversationFromRows(), countUnreadRows(), isUnreadRow(), rowTexts(), synthFromRows(), watchRows() (+2 more)

### Community 13 - "Welcome Confirm Flow"
Cohesion: 0.13
Nodes (23): buildDisabledPatch, Welcome confirm flow, resolveActivation, Service picker grid, Escape leaves Home, Seeded, staged picker, Settings loses the enable toggle, summonDelta (+15 more)

### Community 14 - "Service Catalog & Default Settings"
Cohesion: 0.13
Nodes (12): Slack Logo SVG (renderer asset), Slack Brand Mark (four-lozenge hash), Monochrome 24x24 Service Glyph Convention, serviceById(), SERVICES, DEFAULT_SETTINGS, isShell(), launch() (+4 more)

### Community 15 - "IPC Channels & Shell State"
Cohesion: 0.15
Nodes (17): Tile reorder never streams to IPC, Task 1: shared types, constants and IPC channels, Five shell-only pins:* channels and ShellState.pins, ipcSenderAllowed(), BG, LoadingState, allowed, api (+9 more)

### Community 16 - "Quiet Hours Scheduling"
Cohesion: 0.16
Nodes (11): minutesOf(), muteToggleResult(), nextBoundary(), quietNow(), quietWindowFor(), windowStartingOn(), QuietHoursController, QuietHoursSchedule (+3 more)

### Community 17 - "MainState Runtime Store"
Cohesion: 0.18
Nodes (7): defaultRuntime(), MainState, WakingTracker, Props, PinView, ServiceRuntime, UpdateState

### Community 18 - "Post-Ship Hardening Decisions"
Cohesion: 0.11
Nodes (21): Permission handler origin check, Release supply-chain SHA pinning and provenance, Renderer CSP tightening, Chat ONLY principle (post-ship), chatPaths containment, TikTok chat service, The GitHub request belongs in main, Claims first, screenshots as proof (+13 more)

### Community 19 - "Welcome Sections & Summon Labels"
Cohesion: 0.16
Nodes (13): serviceAccelerator(), buildDisabledPatch(), byName(), capBlocked(), commitOrder(), enabledKey(), followLiveOrder(), matchesQuery() (+5 more)

### Community 20 - "Recipe Runner & Containment Tests"
Cohesion: 0.19
Nodes (10): startRecipe(), harness(), harness(), hashRouted, recipe, harness(), harness(), once() (+2 more)

### Community 21 - "State Broadcast & Shell Wiring"
Cohesion: 0.15
Nodes (20): Bounded timers and listeners, Report on change only, MainState snapshot and broadcast pipeline, Quick switcher, fuzzyScore and app menu accelerators, SettingsStore over conf, startReadyPoll in the service preload, keepAlive opens the collapsed pill, connectShell returns its unsubscribe (+12 more)

### Community 22 - "Rail Badges (Light Theme)"
Cohesion: 0.14
Nodes (20): Active Service Highlight, Discord Service, Home Sigil, Icon-Only Minimal Chrome, Instagram Service, Light Theme, Messenger Service, Muted Service Indicator (+12 more)

### Community 23 - "Service Tile Components"
Cohesion: 0.17
Nodes (9): endsWake(), WakeEnd, logos, Props, logos, PickTile(), Props, ServiceMeta (+1 more)

### Community 24 - "Settings Migrations & Zoom"
Cohesion: 0.17
Nodes (15): clampZoom(), stepZoom(), fillAutoBanish(), fillLastUsedAt(), fillQuietHours(), fillSummonHotkey(), fillZoom(), normalize() (+7 more)

### Community 25 - "Rail Badges (Dark Theme)"
Cohesion: 0.14
Nodes (19): Active Service Highlight, Amber Monochrome Icon Treatment, Badge Stays Visible While Muted, Dark Theme Rail Styling, Discord, Home Sigil, Instagram, Messenger (+11 more)

### Community 26 - "Service Context Menu Builder"
Cohesion: 0.18
Nodes (15): Task 4: context-menu pin-message item, buildContextMenuTemplate(), ContextMenuInfo, ContextMenuItem, edit(), image(), pin(), sameOrigin() (+7 more)

### Community 27 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 28 - "SettingsStore Implementation"
Cohesion: 0.20
Nodes (6): Fresh installs start with every service disabled, resolveActivation(), StartupSurface, deepFreeze(), SettingsStore, Settings

### Community 29 - "Activation & Surface Routing"
Cohesion: 0.26
Nodes (12): No view visible while an overlay is open, Launch restores the surface you left, activateService(), performBannerAction(), presentSurface(), rememberSurface(), setHomeOpen(), setOverlayOpen() (+4 more)

### Community 30 - "Check-for-Updates Plan"
Cohesion: 0.18
Nodes (17): Announce gate (latest vs announce), The update fetch lives in main, Settings gear update dot, Check for Updates Implementation Plan, Automatic checks fail silently, shouldToast / TOAST_MS, update-check pure version logic, UpdateChecker (+9 more)

### Community 31 - "Summon Cap & Home Redesign"
Cohesion: 0.15
Nodes (17): capBlocked picker rule, Discard replaces Dispel, HomeHero fixed left column, MAX_SUMMONED cap of 9, SummonGauge ring, trimToCap and normalize() enforcement, followLiveOrder (clean board follows silently), homeDirty / discardHomeDraft store fields (+9 more)

### Community 32 - "App Icon & Ember Branding"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 33 - "Ready Poll & Discord/Telegram Recipes"
Cohesion: 0.15
Nodes (10): discord, startReadyPoll(), visiblyPresent(), telegram, discord.html fixture (guild badges + dot title), Orphan numberBadge exclusion (badge must be nested in lowerBadge), whatsapp.html fixture (pane-side mount + '(3)' title), base (+2 more)

### Community 34 - "Home Board Ordering Plan"
Cohesion: 0.19
Nodes (16): Home board layout, byName, matchesQuery substring filter, moveTo drag index arithmetic, PickTile, Home Board and Service Ordering Plan, ServiceBand, summonOrder append-on-summon (+8 more)

### Community 35 - "Unread Counting Optimizations"
Cohesion: 0.15
Nodes (16): Single badge-label formatter, Single-pass Messenger count(), TikTok synthNotification, Instagram synthNotification, meta-unread.ts shared Meta heuristics, Rail space reclaim, Structural nav-rail computation, StyleX atomic class .x132t2bv (+8 more)

### Community 36 - "Slack & Teams Service Design"
Cohesion: 0.18
Nodes (15): firstRunUrl and lib/start-url.ts (superseded), Slack chat-only CSS, Slack ALLOWED_HOSTS entry, Slack recipe count(), Slack service (ninth service), Hash-aware chatPaths, Teams keeps its app bar (no css), Teams recipe count() (+7 more)

### Community 37 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): @biomejs/biome, devDependencies, @biomejs/biome, @playwright/test, tailwindcss, typescript, @vitejs/plugin-react, vitest (+7 more)

### Community 38 - "Quick Switcher (Dark)"
Cohesion: 0.18
Nodes (15): Quick Switcher (dark) screenshot, Dark theme surface, Discord, Instagram, Matches ranked first, other services still listed, Messenger, Cmd+1..9 service accelerators, Quick Switcher overlay (+7 more)

### Community 39 - "Settings Screenshot (Light)"
Cohesion: 0.16
Nodes (15): Settings (Light Theme) Screenshot, Appearance Pane, Grouped Card Row Layout, Settings Category Sidebar, General Pane, Light Theme, Menu Position Setting, Settings Has No Service Enable Toggle (+7 more)

### Community 40 - "Welcome Screenshot (Dark)"
Cohesion: 0.16
Nodes (15): Goetia Welcome Screen (Dark Theme Screenshot), Chat-Only Principle Tagline ("All your chats. Nothing else."), Dark Theme with Ember/Amber Accent, Find a Service Search Field, Hibernation Hint ("Signs in once · idle chats sleep"), Home (Welcome Screen), Home Shortcut Hint (⌘/Ctrl 0 returns you here), Service Board (Summon/Banish Editor) (+7 more)

### Community 41 - "Welcome Screenshot (Light)"
Cohesion: 0.15
Nodes (15): Welcome Screen Screenshot (Light Theme), Bell and Gear Controls, Chat Only · No Feeds, No Shops, Home / Welcome Screen, ⌘/Ctrl 0 Returns You Here, Signs In Once · Idle Chats Sleep, Light Theme Palette (Warm Orange Accent), Service Board (Summoned / Unbound) (+7 more)

### Community 42 - "Startup Surface Restore"
Cohesion: 0.14
Nodes (15): Settings.lastNotifiedVersion, Portal.tsx, Startup zero-view guard, Welcome.tsx, Welcome is derived, not flagged, activateService clears homeOpen, Settings.lastActiveId, Settings.lastHomeOpen (+7 more)

### Community 43 - "Notification Rules & Router"
Cohesion: 0.27
Nodes (8): Mute means silence, never blindness, Quiet hours are a scheduled global mute, ctx.setGlobalMuted is the only global-mute path, audioMuted(), notificationTitle(), shouldNotify(), soundOptions(), NotificationRouter

### Community 44 - "Resilience Manager"
Cohesion: 0.20
Nodes (5): ResilienceManager forgets crashes only after DWELL_MS, Crash resilience, Crash resilience with exponential backoff, Crash-reload cap survives post-load crashes, ResilienceManager

### Community 45 - "Quick Switcher (Light)"
Cohesion: 0.18
Nodes (14): Quick Switcher (light theme) screenshot, Per-service accelerator hints (⌘1…⌘9), Discord, Instagram, Light theme palette, Messenger, Substring query filter ("s"), Quick Switcher overlay (+6 more)

### Community 46 - "Settings Screenshot (Dark)"
Cohesion: 0.18
Nodes (14): Settings (Dark Theme) Screenshot, Appearance Section, Dark Theme, General Section, Menu Position Setting, Settings Has No Service Enable Toggle, Notifications Section, Shell Overlay Surface (+6 more)

### Community 47 - "README Showcase & Media Capture"
Cohesion: 0.21
Nodes (14): LoadingOverlay WebContentsView, docs/media/banner.svg, capture-media.mjs capture driver, Capture matrix (SHOTS), Screenshots show Goetia's own chrome only, docs/DEVELOPING.md split, MD033 inline-HTML allowlist, README Showcase Implementation Plan (+6 more)

### Community 48 - "Media Capture Scripts"
Cohesion: 0.23
Nodes (9): capture(), isShell(), SURFACES, ALL_SERVICE_IDS, NINE_UP, settingsFor(), SHOTS, SURFACES (+1 more)

### Community 49 - "Toast & Placeholder Components"
Cohesion: 0.23
Nodes (8): CapTrimToast(), NO_IDS, NO_SERVICES, capTrimMessage(), pinRemovedMessage(), shouldToast(), UpdateToast(), logos

### Community 50 - "Quick Switcher Component"
Cohesion: 0.29
Nodes (9): logos, QuickSwitcher(), msUntilLabelChange(), nextLabelChange(), relativeTime(), switcherRows(), SwitcherService, ActivityEntryView (+1 more)

### Community 51 - "Fuses, Signing & Gatekeeper"
Cohesion: 0.21
Nodes (13): Electron fuses, Goetia engineering guardrails (CLAUDE.md), Packaging: ad-hoc signing and Gatekeeper, Code signing and notarization plan, Signing prerequisites and cost, Designated requirement stability explains the keychain prompt, Turning the cookie-encryption fuse off is not an option, Open question: fuse flipping vs signing order (+5 more)

### Community 52 - "Welcome Screen Plan"
Cohesion: 0.24
Nodes (13): buildDisabledPatch, Welcome visibility is derived, not a flag, Welcome Screen Implementation Plan, Portal (shared ember-portal component), Welcome component, summonDelta / summonLabel, Three non-overlapping selling-point cards, Dispel button (+5 more)

### Community 53 - "Home Composition Plan"
Cohesion: 0.28
Nodes (13): resolveActivation, anyOverlayOpen predicate, Composition lives on Home, not Settings, homeOpen shell surface, Home Screen and Service Composition Plan, Rail home sigil and the ⌘/Ctrl 0 accelerator, activate(id, { show: false }) — resolve without revealing, Settings.lastActiveId + lastHomeOpen (+5 more)

### Community 54 - "Notification Throttle & Toast Rules"
Cohesion: 0.17
Nodes (13): Per-service notification rate limit, Runner count() timeout race, Stale-report dedup and no-op setRuntime, Announce gate, Timer-driven dismissal under reduced motion, Self-dismissing UpdateToast, shouldToast, Silent automatic failures (+5 more)

### Community 55 - "Package Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, e2e, icons, lint, media, package:mac (+5 more)

### Community 56 - "Shell Store & App Root"
Cohesion: 0.31
Nodes (6): App(), ContentPlaceholder(), logos, PurgeToast(), connectShell(), useShell

### Community 57 - "Notification Icons Design"
Cohesion: 0.23
Nodes (12): Slack logo and notification icons, Graphite minimal design system, Notification router, Unisolated per-service preload, We do not own the banner layout, Brand-colour tile notification icon, build-notification-icons.mjs, extraResources over asarUnpack (+4 more)

### Community 58 - "Recipe Selector Calibration"
Cohesion: 0.17
Nodes (12): TikTok bot-detection risk, data-e2e selector surface, Messages nav-badge count source, Rejected: chat-list scan, Live selector recalibration (2026-08-07), Never hide the side-nav container itself, Instagram calibration caveat, tiktok.html recipe fixture (+4 more)

### Community 59 - "Teams Hosts & Call Windows"
Cohesion: 0.17
Nodes (12): Origin-exact permission caveat (teams.live.com), Teams ALLOWED_HOSTS and tenant SSO gap, WebAuthn/passkey block shim, buildContextMenuTemplate, Open Link in Browser hand-off, isBlankCallPopup (about:blank popups), call-policy.ts (CALL_POPUPS / CALL_ORIGINS / isCallPopup), Call URL adoption into a hardened call window (+4 more)

### Community 60 - "Tray Template Icons"
Cohesion: 0.17
Nodes (11): Goetia, Windows Tray Icon (orange ring mark), Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Tray Template Icon, macOS Template Image Convention, Goetia macOS Template Tray Icon (+3 more)

### Community 61 - "Telegram/WhatsApp/Zalo Icons"
Cohesion: 0.27
Nodes (12): Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed), Telegram macOS Notification Icon (blue squircle, white circle, paper-plane glyph, inset padding), macOS Notification Icon Variant Convention (-mac suffix pairs), Per-Service Notification Icon Asset Set, Brand-Color Squircle Icon Design Language, WhatsApp Notification Icon (green rounded-square badge, white speech-bubble handset glyph, full bleed), WhatsApp macOS Notification Icon (green squircle, white speech-bubble handset glyph, inset padding), Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed) (+4 more)

### Community 62 - "Shell Commands & App Menu"
Cohesion: 0.33
Nodes (7): openSettings(), runShellCommand(), setActiveZoom(), e2eUpdate, userDataArg, buildAppMenu(), toggleDetachedDevTools()

### Community 63 - "Emoji Text Extraction"
Cohesion: 0.23
Nodes (7): collect(), glyph(), textWithEmoji(), messenger, messenger.html fixture (chat-row unread oracle), Emoji delivered as <img alt> inside the row preview, messenger-reaction.html fixture (synthesized reaction notification)

### Community 64 - "Shopee & Zalo Recipes"
Cohesion: 0.23
Nodes (9): chatHeader(), shopee, shopee-collapsed.html fixture (collapsed pill badge 5), Collapsed pill as keep-alive click target (single wrapper child = not ready), shopee.html fixture (expanded mini-chat, header badge 31), Shopee mini-chat expanded state (wrapper has header + body children), zalo-dormant.html fixture (idle-deactivation activation modal), Zalo idle-deactivation (app unmounted behind 'Kích hoạt' modal, counts freeze) (+1 more)

### Community 65 - "Release Workflow & Tray"
Cohesion: 0.18
Nodes (11): Badge aggregation across dock, overlay and rail, E2E smoke test and packaging targets, Tray, close-to-tray and autostart, Arch-suffixed dmg artifact names, Release workflow implementation plan, publish: null plus --publish never, Two-phase build matrix and release job, Tag-matches-package.json guard (+3 more)

### Community 66 - "Chat Client Design Spec"
Cohesion: 0.29
Nodes (11): Badge shot seeds neverHibernate false, Catalog sorted by display name, Badge aggregator, Electron as the desktop shell, Hibernation controller, Per-service unread recipes, Per-service persist: session isolation, Goetia Chat Client Design Spec (+3 more)

### Community 67 - "Home Overlay Activation Rules"
Cohesion: 0.24
Nodes (11): views.activate show option, anyOverlayOpen, Buried Settings modal bug, Home accelerator (CmdOrCtrl+0), home:setOpen channel, homeOpen shell surface, Overlay invariant: no view visible over a shell surface, Rail leading sigil (+3 more)

### Community 68 - "Light Sleep & Banner Click"
Cohesion: 0.22
Nodes (11): Stale-banner disabled guard, Light Sleep (peek while hibernated), neverHibernate default flips to false, Peek lifecycle and noteUnreadReport, BANNER_GRACE_MS (the Light Sleep interaction), Banner → exact conversation, Lane A — replay the page's own click, Lane B — synthetic banners carry an href (+3 more)

### Community 69 - "IPC Handlers & AppContext"
Cohesion: 0.31
Nodes (4): AppContext, applyDisabledChange(), registerIpcHandlers(), setServiceMuted()

### Community 71 - "Chat-Only Recipe Principles"
Cohesion: 0.29
Nodes (10): count() must be cheap and always settle, Recipe framework and runner, Service loading screen (waking overlay) plan, Recipe ready(doc) chat-usable check, count() reads the widget badge via chatHeader, Chat-focus CSS gated on the expanded state, Structural selectors only, never hashed classes, Single-pass Messenger unread detection (+2 more)

### Community 72 - "TikTok, Icons & Home Board Plans"
Cohesion: 0.20
Nodes (10): Home's board is a staged edit, Ember Portal branding, Build-time tile rasteriser, resolveIcons: paths resolved once at startup, Notification service icons plan, Full-bleed and macOS-inset variants, e2e needs ELECTRON_RUN_AS_NODE unset, TikTok chat service plan (+2 more)

### Community 73 - "Home Pinned & Service Bands"
Cohesion: 0.27
Nodes (8): Task 8: PinnedBand on Home, Decision: focus altar board layout, PinnedBand(), PinRow(), Props, ServiceBand(), Welcome(), PIN_NOTE_MAX

### Community 75 - "Banner Click Resolution"
Cohesion: 0.31
Nodes (7): Banner click lands in the conversation, Notification shim, Jump reuses the recents path verbatim, BannerClickAction, conversationUrl(), resolveBannerClick(), base

### Community 76 - "Reload Guard & Back Affordance"
Cohesion: 0.25
Nodes (7): Reload guard (RELOAD_MIN_INTERVAL_MS), Reload is the only way back, backAvailable predicate, firstRunUrl mechanism removal, Service Back Affordance Implementation Plan (reverted), Service back affordance design (2026-08-13, rejected), reloadAllowed()

### Community 77 - "Banner SVG & Wordmark"
Cohesion: 0.36
Nodes (9): Accessible SVG Labeling (role=img, aria-label, title), Goetia Banner (1200x300 SVG), Ember Gradient Palette (arcA, arcB, core, word), Ember Portal Mark, Tagline: Summon every chat to one window, nothing but the chat, Theme-Resilient SVG Fallback, Goetia Wordmark, App Icon SVG (resources/icon.svg) (+1 more)

### Community 78 - "Slack Service Plan"
Cohesion: 0.31
Nodes (9): Fresh installs start all-disabled, Tasks 1–3 are one atomic change, Slack Service Implementation Plan, tests/fixtures/slack.html count oracle, ALLOWED_HOSTS slack entry, slack recipe, Slack service catalog entry, Selectors uncalibrated until a live login pass (+1 more)

### Community 79 - "Drag-to-Reorder Design"
Cohesion: 0.25
Nodes (9): Drag-to-reorder on Home, moveTo, applySubsetOrder, macOS copy-cursor badge defect, Draft order, committed once on drag end, What the drag looks like, Pointer drag makes the reorder path e2e-testable, Reorder.Group / pointer-driven reorder (+1 more)

### Community 80 - "Context Menu & Sign-Out Design"
Cohesion: 0.22
Nodes (9): Service-view native context menu, Add to Dictionary is per service, peek-rules.ts scheduling, Per-service sign out (local partition wipe), service:tileMenu channel, Auto-banish sweep step and applyDisabledChange, Purge and banish are orthogonal axes, Sign-out moves to Settings → Services (+1 more)

### Community 81 - "Package Metadata"
Cohesion: 0.22
Nodes (8): description, main, name, packageManager, private, productName, type, version

### Community 82 - "Brand Squircle Icon System"
Cohesion: 0.36
Nodes (9): Brand squircle notification icon system (128x128 RGBA, white glyph on brand fill), Discord notification icon (full-bleed), Discord notification icon (macOS inset variant), macOS `-mac` inset icon variant convention, Messenger notification icon (full-bleed), Messenger notification icon (macOS inset variant), Shopee notification icon (full-bleed), Shopee notification icon (macOS inset variant) (+1 more)

### Community 83 - "Badge Aggregation"
Cohesion: 0.31
Nodes (4): aggregateBadges(), BadgeEntry, badgeLabel(), BadgeSummary

### Community 84 - "Purge Confirm & Copy"
Cohesion: 0.42
Nodes (6): PurgeConfirm(), purgeToastMessage(), PurgeRequest, purgeAllCopy(), PurgeCopy, purgeLoginCopy()

### Community 85 - "Reorder E2E Spec"
Cohesion: 0.28
Nodes (5): drag(), isShell(), launch(), stableBox(), TWO_ENABLED

### Community 86 - "Waking Overlay (Dark)"
Cohesion: 0.32
Nodes (8): Dark Theme Palette, Light Sleep Wake / Hibernation Rehydration, Naming the Service Being Woken, Waking Overlay Screenshot (Dark Theme), Goetia Sigil Spinner, Waking Cover Overlay, "Waking <Service>..." Status Label, Zalo Service (subject of the wake)

### Community 87 - "Waking Overlay (Light)"
Cohesion: 0.39
Nodes (8): Waking Overlay Screenshot (Light Theme), Light Sleep Hibernation, Light Theme Surface, Non-Blocking Wake Feedback, Orbital Ring Sigil Spinner, Waking Cover, "Waking <Service>..." Status Label, Zalo Service

### Community 88 - "Goetia v1 Implementation Plan"
Cohesion: 0.25
Nodes (8): Design tokens and reduced-motion kill switch, Agents never commit (plan-wide constraint), Goetia v1 implementation plan, Single-window shell with a view per service, Rail tiles breathe while waking, waking runtime flag and loading:state channel, WakingTracker and endsWake rules, Registration must land atomically

### Community 89 - "Reload Guard & Auto-Banish"
Cohesion: 0.29
Nodes (8): Why the reload guard cannot trap the user, reloadAllowed reload guard, Settings loses its per-service reload button, views.reload stays unguarded, Auto-banish unused services, shouldBanish (banish-rules.ts), lastUsedAt persisted wall clock, Sleep settings move to the Services pane

### Community 90 - "Activity Log"
Cohesion: 0.36
Nodes (4): ActivityEntry, hostMatches(), isNavigationAllowed(), entry()

### Community 91 - "Recipe Index & Teams Recipe"
Cohesion: 0.32
Nodes (3): recipes, teams, cases

### Community 92 - "Release CI Workflow"
Cohesion: 0.33
Nodes (7): Build provenance attestation step, Build job (mac arm64/x64 + win matrix), SHA256SUMS.txt generation, CSC_IDENTITY_AUTO_DISCOVERY disabled (no signing material), Publish release job, Tag must match package.json version, Release workflow (tag-triggered)

### Community 93 - "Rail Component & Pin Tally"
Cohesion: 0.38
Nodes (4): Task 7: rail pin tally and pulse, NO_PINS, PinIcon(), Rail()

### Community 94 - "Shopee Chat Focus Design"
Cohesion: 0.33
Nodes (7): Overlay above a still-visible view, Recipe CSS gated on the expanded state, Homepage entry URL, never /webchat, keepAlive trusted click on the collapsed pill, No network filtering, Unread from host textContent, Shopee Chat Focus Design

### Community 95 - "Quiet Hours & Summon Hotkey Design"
Cohesion: 0.33
Nodes (7): QuietHoursController and the shared side-effects tail, Quiet hours (scheduled global mute), quiet-hours-rules.ts, quietOverrideWindowStart (the macOS DND rule), SUMMON_COMBOS curated list, Summon hotkey (global shortcut), summonHotkeyOk (no silent failure)

### Community 96 - "Notification Icon Build Script"
Cohesion: 0.33
Nodes (5): LOGO_DIR, OUT_DIR, placeGlyph(), ROOT, tileSvg()

### Community 98 - "Notification Shim"
Cohesion: 0.33
Nodes (3): installNotificationShim(), NotificationShimHandle, NotifyForward

### Community 101 - "Navigation Audit"
Cohesion: 0.40
Nodes (3): Navigation containment, Navigation allowlist NOT yet wired (stale claim), NavigationAudit

### Community 103 - "Pin Toast & Acknowledgement"
Cohesion: 0.40
Nodes (6): Task 6: Done/unpin toast in the renderer, Decision: acknowledgement is a tally pill beside the Home sigil, Decision: no modal at pin time, Toast hung after Undo then Done, PinToast(), PinToastState

### Community 104 - "Screenshot Shot Types"
Cohesion: 0.33
Nodes (5): SeededSettings, ServiceId, Shot, Surface, Theme

### Community 105 - "Release Shell Script"
Cohesion: 0.60
Nodes (5): die(), run(), release.sh script, skip(), step()

### Community 106 - "Notification Icon Resolution"
Cohesion: 0.53
Nodes (3): iconFileName(), resolveIcons(), ICON_DIR

### Community 107 - "Loading Screen API"
Cohesion: 0.47
Nodes (4): api, GoetiaLoadingApi, LoadingState, Window

### Community 109 - "Shortcuts E2E Spec"
Cohesion: 0.53
Nodes (4): isService(), isShell(), launch(), makeProfile()

### Community 110 - "Mute & Notification Invariants"
Cohesion: 0.40
Nodes (5): Reload Guard Implementation Plan, reload-guard predicate (RELOAD_MIN_INTERVAL_MS), QuietHoursController one-timer boundary, Quiet Hours Implementation Plan, quiet-hours-rules (quietWindowFor, quietNow, nextBoundary, muteToggleResult)

### Community 111 - "Slack Notification Icons"
Cohesion: 0.50
Nodes (5): Slack macOS Notification Icon, Per-Service Notification Identity, Platform-Suffixed Notification Icon Variant (-mac), Slack Octothorpe Brand Mark (white on aubergine), Squircle App-Icon Treatment

### Community 112 - "Teams macOS Icon"
Cohesion: 0.60
Nodes (5): macOS Notification Icon Variant, Microsoft Teams, Goetia Notification Icon Assets, Teams Logo Mark (T tile with person silhouette), Teams macOS Notification Icon

### Community 113 - "TikTok Icons & Logo"
Cohesion: 0.70
Nodes (5): TikTok Notification Icon (default/Windows-Linux), TikTok Notification Icon (macOS variant), Platform-suffixed notification icon variant convention, TikTok Logo Mark (renderer SVG), Monochrome white glyph logo style (no brand fill)

### Community 117 - "Restart E2E Spec"
Cohesion: 0.50
Nodes (3): isShell(), launch(), TWO_ENABLED

### Community 118 - "Detached DevTools Toggle"
Cohesion: 0.83
Nodes (3): Detached developer tools, Toggle Developer Tools (feature entry), View > Toggle Developer Tools (detached)

### Community 119 - "Instagram macOS Icon"
Cohesion: 0.83
Nodes (4): Flat White Camera Glyph on Crimson Squircle, Instagram macOS Notification Icon, Instagram Service Visual Identity, Per-Platform Notification Icon Variant Convention

### Community 120 - "Teams Notification Icon"
Cohesion: 0.67
Nodes (4): Microsoft Teams (service), Notification Icon Asset Set, Teams Logo Mark (T glyph and person silhouette), Teams Notification Icon

### Community 125 - "Loading HTML Page"
Cohesion: 0.83
Nodes (4): loading.html (waking overlay page), Inline critical first-paint CSS in loading.html, loading.html Content-Security-Policy meta, Ember portal SVG (ring arcs, embers, breathing core)

### Community 126 - "Teams Logo SVG"
Cohesion: 0.83
Nodes (4): Microsoft Teams, Monochrome Glyph Mark (white fill, 24x24 viewBox), Service Rail Tile Icon, Microsoft Teams Logo (SVG asset)

### Community 129 - "Banish E2E Spec"
Cohesion: 0.67
Nodes (3): DISABLED, isShell(), launch()

### Community 132 - "Release Notes Preamble"
Cohesion: 0.67
Nodes (3): First-launch gate walkthrough, Installer checksum and attestation verification, Release notes preamble

### Community 133 - "Packaging & Gatekeeper"
Cohesion: 1.00
Nodes (3): Reproducing the Gatekeeper prompt by hand, Ad-hoc mac signing identity '-', electronFuses block

### Community 134 - "Slack Notification Icon"
Cohesion: 1.00
Nodes (3): Per-Service Notification Icon Asset Convention, Slack Brand Glyph (four-lozenge octothorpe), Slack Notification Icon (slack.png)

### Community 135 - "Tray Template SVG"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

### Community 138 - "Shell HTML Document"
Cohesion: 0.67
Nodes (3): Shell CSP meta policy (index.html), #root mount point + /src/main.tsx module entry, Shell window HTML document (index.html)

### Community 139 - "Instagram Logo SVG"
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
- `Navigation containment` → `Navigation allowlist NOT yet wired (stale claim)`  [AMBIGUOUS]
  docs/FEATURES.md · relation: conceptually_related_to

## Knowledge Gaps
- **292 isolated node(s):** `target`, `module`, `moduleResolution`, `ES2022`, `DOM` (+287 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **58 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

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