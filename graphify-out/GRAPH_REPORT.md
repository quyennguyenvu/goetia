# Graph Report - .  (2026-09-13)

## Corpus Check
- 81 files · ~454,356 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2426 nodes · 4446 edges · 222 communities (157 shown, 65 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 339 edges (avg confidence: 0.82)
- Token cost: 304,376 input · 0 output

## Community Hubs (Navigation)
- Activation & Banner Wiring
- Shared Facebook Identity
- Update Check & Main State
- Slack/Discord Thread Open
- Guarded Actions & Banish Rules
- App Lock Controller
- Chat DOM Fixtures
- WebAuthn Shim
- Recipe Runner & Types
- Loading Overlay & Lock Wiring
- Service View Manager
- Shell Shortcuts & Settings
- Shopee Recipe
- Chat-Only Guardrails
- Biome Config
- CBOR & WebAuthn Crypto
- Home Redesign & Summon Cap
- Mute, Quiet Hours & Lock Spec
- Toasts & Cap Trim
- Wake Captions & Reload
- Welcome Board Design
- Passkey Rules & Store
- Goetia v1 Plan
- Quiet Hours Rules
- Reliability & Performance Plan
- Rail Badges Light Shot
- Pinned Band & Tile Reorder
- Security Hardening Plan
- Hibernation Controller
- Rail Badges Dark Shot
- Loading Screen & README Media
- TypeScript Config
- WebAuthn Request Rules
- View Manager Internals
- Settings Normalization
- Check for Updates Design
- Welcome Screen Plan
- Pin Rules
- Hardening Design Decisions
- Pin Store
- App Icon
- Screenshot Capture Scripts
- Service Tiles & Waking Rules
- WhatsApp Recipe
- Developing Guide & Passkeys Plan
- Context Menu
- Hardening Remediation Design
- Activation Rules & Defaults
- Ready Poll & Telegram
- Quick Switcher
- Welcome Board Logic
- Dev Dependencies
- Quick Switcher Dark Shot
- Settings Light Shot
- Welcome Dark Shot
- Welcome Light Shot
- Home Cap & Rail Sync Design
- Quick Switcher Light Shot
- Settings Dark Shot
- Activity Log
- WhatsApp/Zalo Chat Fixtures
- Passkey Authenticator
- Home E2E & Slack Logo
- IPC Channel Policy
- Feature Inventory & Login Landing
- Release Workflow & Signing
- Home Composition Design
- Pinned Messages Plan
- TikTok/Instagram Service Design
- Package Scripts
- Passkey Store
- Zalo Recipe
- Instagram Recipe
- Slack Service Plan
- Tile Reorder Plan
- Notification Icons Design
- Instagram & chatPaths Design
- Pinned Messages Spec
- Shopee/Telegram Icons
- Emoji Text & Messenger Fixture
- Teams Recipe & Registry
- Messenger Recipe
- Security Hardening Plan v1
- Notification Icons Plan
- Welcome & Portal Components
- Home Surface Design
- TikTok Recipe
- Pins Dark Shot
- Rail Component
- Restore Last Surface Design
- Passkey Authenticator Tests
- Banner SVG
- Passkeys Dark Shot
- Passkeys Light Shot
- Pins Light Shot
- Drag Reorder Design
- Slack Service Design
- Calls & Login Purge Design
- Light Sleep Design
- Package Metadata
- Discord Notification Icons
- Badge Aggregation
- Resilience Manager
- Shell Store
- Reorder E2E
- Waking Dark Shot
- Waking Light Shot
- Update Design Details
- Reload Guard Design
- Main Loads Tracker
- Summon Combos
- Release Workflow YAML
- Shopee Focus & Loading Design
- Settings Normalize & Updates
- Context Menu Design
- Quiet Hours & Hotkey Design
- Tray Icons
- Notification Icon Builder
- Biometrics Prompt
- Call Policy
- Navigation Audit & Startup Surface
- Notification Shim
- Passkeys E2E
- Banner Title Split
- Context Menu & Calls Plan
- Chat Client Design Spec
- Banner to Conversation Design
- Shot Types
- Release Script
- Notification Icon Resolver
- Peek Rules
- Off-Chat Link
- Loading Page Script
- Loading HTML
- Home Hero
- Guarded Actions E2E
- Shortcuts E2E
- Reload Guard & Quiet Hours Plan
- Purge
- Slack Mac Icon
- Teams Mac Icon
- TikTok Icons
- Hibernation Rules
- Notification Throttle
- Permission Policy
- Tile Menu
- Summon Hotkey
- Rail Reorder Prompt
- Purge Copy
- Lock E2E
- Restart E2E
- Instagram Mac Icon
- Teams Icon
- Click Point
- Coalesce
- Layout Bounds
- Service Accelerator
- Zoom Rules
- Teams SVG
- Overlay Badge
- Banish E2E
- Purge E2E
- Updates E2E
- Release Notes Body
- Back Affordance Plan
- Slack Icon
- Tray Template SVG
- Backoff
- Client Hints
- External URL
- User Agent
- Visibility Spoof
- Shell index.html
- Instagram SVG
- Fuzzy Score
- Passkeys Pane
- Summon Gauge
- Peek E2E
- Meta Conversation Test
- conf Dependency
- Summon Hotkey Plan
- Tray Quit & Crash Dwell
- README Showcase Design
- Zoom & Home Chord Design
- Social Login Design
- electron Dependency
- electron-builder Dependency
- Electron Builder Config
- electron-vite Dependency
- happy-dom Dependency
- motion Dependency
- react Dependency
- react-dom Dependency
- resvg Dependency
- Tailwind Vite Dependency
- types/react Dependency
- types/react-dom Dependency
- vite Dependency
- Instagram Icon
- Discord SVG
- Messenger SVG
- Telegram SVG
- WhatsApp SVG
- Zalo SVG
- Messenger Fixture Signals
- Bounded Ready Poll
- Coalesced Resize
- Will-Redirect Hand-back
- Hardened Runtime Entitlements
- Unpacked Notification Icons
- Blank Fixture
- Telegram Fixture
- Zalo 5+ Fixture
- Zalo Fixture

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 147 edges
2. `ServiceViewManager` - 49 edges
3. `LockController` - 38 edges
4. `Recipe` - 35 edges
5. `registerIpcHandlers()` - 34 edges
6. `AppContext` - 32 edges
7. `MainState` - 30 edges
8. `PinStore` - 28 edges
9. `Pinned messages design spec (2026-08-25)` - 28 edges
10. `serviceById()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `syncOverlay` --semantically_similar_to--> `ContentPlaceholder()`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-09-05-wake-captions.md → src/renderer/src/components/ContentPlaceholder.tsx
- `createTray()` --references--> `Windows Tray Icon (orange ring mark)`  [INFERRED]
  src/main/tray.ts → resources/tray/tray-win.png
- `createTray()` --references--> `macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina)`  [INFERRED]
  src/main/tray.ts → resources/tray/trayTemplate@2x.png
- `discord.html fixture (guild badges + dot title)` --references--> `discord`  [INFERRED]
  tests/fixtures/discord.html → src/preload/recipes/discord.ts
- `shopee.html fixture (expanded mini-chat, header badge 31)` --shares_data_with--> `chatHeader()`  [INFERRED]
  tests/fixtures/shopee.html → src/preload/recipes/shopee.ts

## Import Cycles
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/notifications.ts -> src/main/activate.ts`
- 3-file cycle: `src/main/commands.ts -> src/main/ipc-handlers.ts -> src/main/menu.ts -> src/main/commands.ts`
- 4-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/menu.ts -> src/main/commands.ts -> src/main/activate.ts`

## Hyperedges (group relationships)
- **App lock enforcement gates** — src_main_lib_overlay_rules_anyoverlayopen, src_main_commands_runshellcommand, src_main_lib_ipc_sender_policy_channelallowedwhilelocked, src_main_state_mainstate, src_main_activate_applylocked, src_main_lock_lockcontroller [EXTRACTED 1.00]
- **Conversation open lane chain (replay > name > same > url > anchor > load)** — src_main_lib_notification_click_resolvebannerclick, src_preload_lib_conversation_open_openconversationinpage, src_preload_recipes_slack_openslackthread, src_main_lib_open_reply_parseopenreply, src_main_lib_open_reply_learnedurl, src_main_lib_notification_click_validatedconversationurl [EXTRACTED 1.00]
- **Guarded action consent flow** — src_renderer_src_components_credentialconfirm_credentialconfirm, src_renderer_src_components_summonconfirm_summonconfirm, src_renderer_src_components_purgeconfirm_purgeconfirm, src_main_lock_lockcontroller, src_main_ipc_handlers_authorized, src_main_lib_guard_policy_actionguarded, src_main_lib_banish_rules_summonedids [EXTRACTED 1.00]
- **Conversation list rows: match the title element, never the preview beneath** — tests_fixtures_shopee_chat_row_shop_title, tests_fixtures_shopee_chat_row_preview_span, tests_fixtures_teams_chat_title_chat_list_item, tests_fixtures_teams_chat_message_preview_chat_list_item [INFERRED 0.85]
- **Threads with no anchor or URL: opened by clicking a root-message or sidebar control** — tests_fixtures_discord_thread_thread_sidebar_button, tests_fixtures_discord_thread_message_accessories_open_thread, tests_fixtures_slack_thread_reply_bar_view_thread, tests_fixtures_slack_thread_threads_flexpane, tests_fixtures_teams_chat_no_href_rows [INFERRED 0.85]
- **Shopee's only unhashed handles below the mini-chat host** — tests_fixtures_shopee_chat_shopee_react_input, tests_fixtures_shopee_chat_shopee_react_dropdown, tests_fixtures_shopee_chat_react_virtualized_grid, tests_fixtures_shopee_chat_hashed_classes [EXTRACTED 1.00]
- **LoadKind rides MainLoads mark into WakingTracker and the caption** — src_main_views_load, src_main_lib_main_loads_mainloads, src_main_views_viewhooks, src_main_waking_wakingtracker, src_shared_types_serviceruntime, src_shared_wake_caption_wakecaption, src_main_index_synoverlay, src_renderer_src_components_contentplaceholder_contentplaceholder [EXTRACTED 1.00]
- **Goetia Software Authenticator Ceremony** — docs_superpowers_specs_2026_08_30_goetia_passkeys_design_webauthn_shim, docs_superpowers_specs_2026_08_30_goetia_passkeys_design_passkey_authenticator, docs_superpowers_specs_2026_08_30_goetia_passkeys_design_passkey_store, docs_superpowers_specs_2026_08_30_goetia_passkeys_design_rpid_validation, docs_superpowers_plans_2026_08_30_goetia_passkeys_webauthn_crypto [EXTRACTED 1.00]
- **In-app Social Login Pipeline** — docs_superpowers_specs_2026_08_31_social_login_design_identity_popup, docs_superpowers_specs_2026_08_31_social_login_design_identity_providers, docs_superpowers_specs_2026_09_01_shared_facebook_identity_design_identity_share, docs_superpowers_specs_2026_09_01_shared_facebook_identity_design_fb_app_ids, docs_superpowers_specs_2026_09_01_shared_facebook_identity_design_identity_source, docs_superpowers_specs_2026_09_01_shared_facebook_identity_design_local_user_verification [EXTRACTED 1.00]
- **Pin capture flow: context menu to rail tally** — src_main_lib_context_menu_pin, src_main_lib_context_menu_buildcontextmenutemplate, src_main_views_serviceviewmanager, src_main_views_serviceviewmanager_menuitemfor, src_main_views_viewhooks_onpinmessage, src_main_pins_pinstore_pin, src_main_state_mainstate_snapshot, src_renderer_src_components_rail_rail [EXTRACTED 1.00]
- **Pin open flow: Home row to in-page conversation** — src_renderer_src_components_welcome_pinnedband_pinnedband, src_main_ipc_handlers_registeripchandlers, src_main_lib_notification_click_resolvebannerclick, src_main_activate_performbanneraction, src_preload_lib_conversation_open_openconversationinpage, claude_conversation_recipe_hooks, claude_trusted_click_channel [INFERRED 0.85]
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

## Communities (222 total, 65 thin omitted)

### Community 0 - "Activation & Banner Wiring"
Cohesion: 0.08
Nodes (44): Banner click lands in the conversation, One sound per message, No view visible while an overlay is open, Task 5: main wiring (hooks, state, IPC handlers), Jump reuses the recents path verbatim, locked joins anyOverlayOpen, Parked banner click, Windows Tray Icon (orange ring mark) (+36 more)

### Community 1 - "Shared Facebook Identity"
Cohesion: 0.06
Nodes (33): Sign-in dialog as visible hardened popup, Shared Facebook identity seeding, CookieJar, debugIdentity(), IdentityShare, removalUrl(), SeedsFile, hostMatches() (+25 more)

### Community 2 - "Update Check & Main State"
Cohesion: 0.07
Nodes (17): compareVersions(), isNewer(), parseLatestRelease(), parts(), releaseUrl(), defaultRuntime(), MainState, UpdateChecker (+9 more)

### Community 3 - "Slack/Discord Thread Open"
Cohesion: 0.07
Nodes (41): Pins are the user's todo list, on Home, Slack thread open implementation plan, tests/fixtures/slack-thread.html, Open matches by resolved URL, no-op when already there, Canonical Slack thread URL, Discord thread addendum (2026-09-06), The flexpane rule, conversationUrl / openUrl hook pair (+33 more)

### Community 4 - "Guarded Actions & Banish Rules"
Cohesion: 0.07
Nodes (28): Auto-banish is the hibernation sweep one step later, Home is a destination, not a toggle, Purge and banish are orthogonal axes, Tile reorder never streams to IPC, Guarded actions implementation plan, Enforcement is in main, never the renderer, Every guarded action asks, no grace window, The guard does not exist when the lock is unconfigured (+20 more)

### Community 5 - "App Lock Controller"
Cohesion: 0.08
Nodes (28): App lock implementation notes (2026-09-10), App lock implementation plan, Guarded actions implementation notes (2026-09-13), An unreadable credential fails closed, Passcode as scrypt hash in safeStorage-encrypted lock.json, Failed-attempt backoff, One-shot, action-bound consent minted in main, passcodeAcceptable() (+20 more)

### Community 6 - "Chat DOM Fixtures"
Cohesion: 0.07
Nodes (39): Discord thread fixture, Sidebar item data-list-item-id=channels___<id>, Discord channel sidebar list (data-list-id=channels), Message list items id=chat-messages-<channel>-<message>, Channel #general-ticketbox (aria-current=page), Open Thread accessory (#message-accessories-<thread>), Thread sidebar item (typeThread, role=button, no href), Thread '[THSH] Custom Image in Email' (+31 more)

### Community 7 - "WebAuthn Shim"
Cohesion: 0.10
Nodes (26): AnyRecord, assertion(), attestation(), b64(), buffer(), credential(), descriptors(), fromJson() (+18 more)

### Community 8 - "Recipe Runner & Types"
Cohesion: 0.11
Nodes (14): startRecipe(), Recipe, harness(), harness(), hashRouted, recipe, harness(), base (+6 more)

### Community 9 - "Loading Overlay & Lock Wiring"
Cohesion: 0.10
Nodes (17): BG, LoadingState, LockDeps, allowed, api, GoetiaApi, invokable, captionEl (+9 more)

### Community 10 - "Service View Manager"
Cohesion: 0.13
Nodes (6): View > Toggle Developer Tools (detached), PendingOpen, CeremonyInput, ServiceViewManager, RailPosition, ServiceId

### Community 11 - "Shell Shortcuts & Settings"
Cohesion: 0.10
Nodes (22): Goetia's chords win inside a page, Lock Now (Cmd/Ctrl-Shift-L), runShellCommand returns early while locked, Chord, CODES, FIXED, KeyInput, matches() (+14 more)

### Community 12 - "Shopee Recipe"
Cohesion: 0.11
Nodes (23): chatBody(), chatHeader(), chatPane(), findRow(), flat(), inside(), listPane(), openShopeeConversation() (+15 more)

### Community 13 - "Chat-Only Guardrails"
Cohesion: 0.10
Nodes (29): Adding a service checklist, Call popup as hidden inert guest, Chat ONLY product principle, chatPaths snap-back containment, Definition of done, Electron fuses and entitlements, Goetia engineering guardrails (CLAUDE.md), keepRendered is two mechanisms (+21 more)

### Community 14 - "Biome Config"
Cohesion: 0.07
Nodes (27): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+19 more)

### Community 15 - "CBOR & WebAuthn Crypto"
Cohesion: 0.17
Nodes (17): RFC-8949, CborValue, compareBytes(), concat(), encodeCbor(), head(), attestationObject(), authenticatorData() (+9 more)

### Community 16 - "Home Redesign & Summon Cap"
Cohesion: 0.08
Nodes (27): HomeHero + SummonGauge single layout, MAX_SUMMONED / capBlocked / trimToCap, Home Redesign and Summon Cap Implementation Plan, ctx.noteUnreadReport late-bound hook, peek-rules scheduling helper, Light Sleep Implementation Plan, BANNER_GRACE_MS peek grace, Banner → Exact Conversation Implementation Plan (+19 more)

### Community 17 - "Mute, Quiet Hours & Lock Spec"
Cohesion: 0.12
Nodes (23): Mute means silence, never blindness, Quiet hours are a scheduled global mute, The waking cover is for loads main asked for, Dead-view limit, App lock, Badges and counts are untouched by the lock, Configuration requires the passcode, never Touch ID, Lock screen asks which door (+15 more)

### Community 18 - "Toasts & Cap Trim"
Cohesion: 0.16
Nodes (17): Task 6: Done/unpin toast in the renderer, Toast hung after Undo then Done, CapTrimToast(), NO_IDS, NO_SERVICES, logos, PinToast(), PurgeToast() (+9 more)

### Community 19 - "Wake Captions & Reload"
Cohesion: 0.12
Nodes (10): Reload is the only way back to chat, Wake Captions Design Spec, Five load kinds (wake, reload, restart, purge, hand-back), null wakeKind renders the wake caption, ContentPlaceholder keyed on waking, not loading, syncOverlay, reloadAllowed(), LoadingOverlay (+2 more)

### Community 20 - "Welcome Board Design"
Cohesion: 0.13
Nodes (23): buildDisabledPatch, Welcome confirm flow, resolveActivation, Service picker grid, Escape leaves Home, Seeded, staged picker, Settings loses the enable toggle, summonDelta (+15 more)

### Community 21 - "Passkey Rules & Store"
Cohesion: 0.14
Nodes (10): accountLabel(), clock(), isB64(), parsePasskeys(), passkeyViews(), KeyCodec, PasskeysFile, PasskeyView (+2 more)

### Community 22 - "Goetia v1 Plan"
Cohesion: 0.11
Nodes (22): Design tokens and reduced-motion kill switch, Agents never commit (plan-wide constraint), Goetia v1 implementation plan, Recipe framework and runner, Single-window shell with a view per service, startReadyPoll in the service preload, Recipe ready(doc) chat-usable check, Rail tiles breathe while waking (+14 more)

### Community 23 - "Quiet Hours Rules"
Cohesion: 0.16
Nodes (11): minutesOf(), muteToggleResult(), nextBoundary(), quietNow(), quietWindowFor(), windowStartingOn(), QuietHoursController, QuietHoursSchedule (+3 more)

### Community 24 - "Reliability & Performance Plan"
Cohesion: 0.13
Nodes (21): Badge aggregation across dock, overlay and rail, E2E smoke test and packaging targets, MainState snapshot and broadcast pipeline, Quick switcher, fuzzyScore and app menu accelerators, SettingsStore over conf, Tray, close-to-tray and autostart, keepAlive opens the collapsed pill, One badgeLabel with a 99+ threshold (+13 more)

### Community 25 - "Rail Badges Light Shot"
Cohesion: 0.14
Nodes (20): Active Service Highlight, Discord Service, Home Sigil, Icon-Only Minimal Chrome, Instagram Service, Light Theme, Messenger Service, Muted Service Indicator (+12 more)

### Community 26 - "Pinned Band & Tile Reorder"
Cohesion: 0.12
Nodes (11): Task 8: PinnedBand on Home, Decision: focus altar board layout, Board snaps as one when the pin set changes, useTileReorder(), PinnedBand(), PinRow(), RowProps, Props (+3 more)

### Community 27 - "Security Hardening Plan"
Cohesion: 0.12
Nodes (20): facebookAppId Param-Pollution Refusal, Display-Media Confirm Fallback, IPC Handler Crash-Proofing, Security & Performance Hardening Plan (2026-09-02 Audit), sanitizeBanner, PasskeyAuthenticator (Ceremony Owner), PasskeyStore (passkeys.json), UV Set on Accepted Confirm (+12 more)

### Community 28 - "Hibernation Controller"
Cohesion: 0.16
Nodes (3): DEBUG_PEEKS, HibernationController, quietWalk()

### Community 29 - "Rail Badges Dark Shot"
Cohesion: 0.14
Nodes (19): Active Service Highlight, Amber Monochrome Icon Treatment, Badge Stays Visible While Muted, Dark Theme Rail Styling, Discord, Home Sigil, Instagram, Messenger (+11 more)

### Community 30 - "Loading Screen & README Media"
Cohesion: 0.15
Nodes (19): Ember-portal loading page, LoadingOverlay WebContentsView, Service loading screen (waking overlay) plan, Renderer CSP tightening, Badge shot seeds neverHibernate false, docs/media/banner.svg, capture-media.mjs capture driver, Capture matrix (SHOTS) (+11 more)

### Community 31 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 32 - "WebAuthn Request Rules"
Cohesion: 0.20
Nodes (14): AssertionRequest, base64Field(), CreationRequest, descriptorIds(), hostOfOrigin(), parseAssertion(), parseCreation(), parseUserVerification() (+6 more)

### Community 33 - "View Manager Internals"
Cohesion: 0.18
Nodes (4): Decision: capture point is the context menu, debugCalls(), ViewHooks, webAuthnEnabled()

### Community 34 - "Settings Normalization"
Cohesion: 0.25
Nodes (10): deepFreeze(), fillAppLock(), fillAutoBanish(), fillLastUsedAt(), fillQuietHours(), fillSummonHotkey(), fillZoom(), normalize() (+2 more)

### Community 35 - "Check for Updates Design"
Cohesion: 0.18
Nodes (17): Announce gate (latest vs announce), The update fetch lives in main, Settings gear update dot, Check for Updates Implementation Plan, Automatic checks fail silently, shouldToast / TOAST_MS, update-check pure version logic, UpdateChecker (+9 more)

### Community 36 - "Welcome Screen Plan"
Cohesion: 0.20
Nodes (17): buildDisabledPatch, Welcome visibility is derived, not a flag, Welcome Screen Implementation Plan, Portal (shared ember-portal component), Welcome component, summonDelta / summonLabel, Three non-overlapping selling-point cards, Dispel button (+9 more)

### Community 37 - "Pin Rules"
Cohesion: 0.24
Nodes (9): Task 2: pure pin rules, BRAND_SEGMENTS, clampText(), conversationFromTitle(), GENERIC_TITLES, isPermutation(), parsePins(), pinViews() (+1 more)

### Community 38 - "Hardening Design Decisions"
Cohesion: 0.13
Nodes (17): Single badge-label formatter, Single-pass Messenger count(), Per-service notification rate limit, Runner count() timeout race, Stale-report dedup and no-op setRuntime, TikTok synthNotification, Announce gate, Timer-driven dismissal under reduced motion (+9 more)

### Community 39 - "Pin Store"
Cohesion: 0.22
Nodes (7): Cap is visible: item disabled at 50, never a silent shift, Pin data model, Pin, PinsFile, PinStore, PIN_CAP, PIN_TEXT_MAX

### Community 40 - "App Icon"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 41 - "Screenshot Capture Scripts"
Cohesion: 0.18
Nodes (11): capture(), isShell(), SURFACES, ALL_SERVICE_IDS, DEMO_PASSKEYS, DEMO_PINS, NINE_UP, settingsFor() (+3 more)

### Community 42 - "Service Tiles & Waking Rules"
Cohesion: 0.16
Nodes (8): endsWake(), WakeEnd, logos, Props, logos, PickTile(), Props, ServiceMeta

### Community 43 - "WhatsApp Recipe"
Cohesion: 0.15
Nodes (9): unreadFromTitle(), clickRow(), countWhatsAppChats(), openWhatsAppConversation(), WhatsAppChat, whatsAppConversation(), Discord bullet-prefixed title as indirect-unread signal, Title-parsed count as IndexedDB fallback (no page IDB under test) (+1 more)

### Community 44 - "Developing Guide & Passkeys Plan"
Cohesion: 0.16
Nodes (16): Ad-hoc Signature Consequences, Ember Portal Branding, ferdium-recipes (Upstream), Developing Goetia Guide, encodeCbor (Canonical CBOR Encoder), Goetia Passkeys Implementation Plan, webauthn-crypto (Keys, authData, Signatures), webauthn-rules (Request Validation) (+8 more)

### Community 45 - "Context Menu"
Cohesion: 0.22
Nodes (13): Task 4: context-menu pin-message item, buildContextMenuTemplate(), ContextMenuInfo, ContextMenuItem, edit(), image(), link(), pin() (+5 more)

### Community 46 - "Hardening Remediation Design"
Cohesion: 0.15
Nodes (16): Accepted residual risk, Hardening & remediation design, Electron fuses block, Pure lib/ helper testing strategy, Navigation containment guard, Release supply-chain SHA pinning and provenance, Renderer CSP tightening, Owner threat model (A local malware, B hostile web content, C supply chain) (+8 more)

### Community 47 - "Activation Rules & Defaults"
Cohesion: 0.18
Nodes (4): applySubsetOrder(), DEFAULT_SETTINGS, UpdateStatus, buildDisabledPatch()

### Community 48 - "Ready Poll & Telegram"
Cohesion: 0.16
Nodes (10): discord, startReadyPoll(), visiblyPresent(), telegram, discord.html fixture (guild badges + dot title), Orphan numberBadge exclusion (badge must be nested in lowerBadge), whatsapp.html fixture (pane-side mount + '(3)' title), base (+2 more)

### Community 49 - "Quick Switcher"
Cohesion: 0.24
Nodes (10): logos, QuickSwitcher(), msUntilLabelChange(), nextLabelChange(), recentHaystack(), relativeTime(), switcherRows(), SwitcherService (+2 more)

### Community 50 - "Welcome Board Logic"
Cohesion: 0.23
Nodes (12): byName(), capBlocked(), commitOrder(), enabledKey(), followLiveOrder(), matchesQuery(), services(), SummonDelta (+4 more)

### Community 51 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): @biomejs/biome, devDependencies, @biomejs/biome, @playwright/test, tailwindcss, typescript, @vitejs/plugin-react, vitest (+7 more)

### Community 52 - "Quick Switcher Dark Shot"
Cohesion: 0.18
Nodes (15): Quick Switcher (dark) screenshot, Dark theme surface, Discord, Instagram, Matches ranked first, other services still listed, Messenger, Cmd+1..9 service accelerators, Quick Switcher overlay (+7 more)

### Community 53 - "Settings Light Shot"
Cohesion: 0.16
Nodes (15): Settings (Light Theme) Screenshot, Appearance Pane, Grouped Card Row Layout, Settings Category Sidebar, General Pane, Light Theme, Menu Position Setting, Settings Has No Service Enable Toggle (+7 more)

### Community 54 - "Welcome Dark Shot"
Cohesion: 0.16
Nodes (15): Goetia Welcome Screen (Dark Theme Screenshot), Chat-Only Principle Tagline ("All your chats. Nothing else."), Dark Theme with Ember/Amber Accent, Find a Service Search Field, Hibernation Hint ("Signs in once · idle chats sleep"), Home (Welcome Screen), Home Shortcut Hint (⌘/Ctrl 0 returns you here), Service Board (Summon/Banish Editor) (+7 more)

### Community 55 - "Welcome Light Shot"
Cohesion: 0.15
Nodes (15): Welcome Screen Screenshot (Light Theme), Bell and Gear Controls, Chat Only · No Feeds, No Shops, Home / Welcome Screen, ⌘/Ctrl 0 Returns You Here, Signs In Once · Idle Chats Sleep, Light Theme Palette (Warm Orange Accent), Service Board (Summoned / Unbound) (+7 more)

### Community 56 - "Home Cap & Rail Sync Design"
Cohesion: 0.16
Nodes (15): capBlocked picker rule, Discard replaces Dispel, HomeHero fixed left column, MAX_SUMMONED cap of 9, SummonGauge ring, trimToCap and normalize() enforcement, followLiveOrder (clean board follows silently), homeDirty / discardHomeDraft store fields (+7 more)

### Community 57 - "Quick Switcher Light Shot"
Cohesion: 0.18
Nodes (14): Quick Switcher (light theme) screenshot, Per-service accelerator hints (⌘1…⌘9), Discord, Instagram, Light theme palette, Messenger, Substring query filter ("s"), Quick Switcher overlay (+6 more)

### Community 58 - "Settings Dark Shot"
Cohesion: 0.18
Nodes (14): Settings (Dark Theme) Screenshot, Appearance Section, Dark Theme, General Section, Menu Position Setting, Settings Has No Service Enable Toggle, Notifications Section, Shell Overlay Surface (+6 more)

### Community 59 - "Activity Log"
Cohesion: 0.21
Nodes (5): Decision: Architecture A, a dedicated PinStore in main, ActivityEntry, ActivityLog, conversationKey(), openHref()

### Community 60 - "WhatsApp/Zalo Chat Fixtures"
Cohesion: 0.27
Nodes (13): WhatsApp conversation()/openConversation() hooks, WhatsApp showed the member list and never jumped, Zalo: openConversation returns a point for a trusted click, whatsapp, zalo, WhatsApp chat fixture (whatsapp-chat.html), Chat-list row name in cell-frame-title, Header chat title span (no title attribute) (+5 more)

### Community 61 - "Passkey Authenticator"
Cohesion: 0.27
Nodes (3): PasskeyAuthenticator, PasskeyPrompt, WireResult

### Community 62 - "Home E2E & Slack Logo"
Cohesion: 0.18
Nodes (10): Slack Logo SVG (renderer asset), Slack Brand Mark (four-lozenge hash), Monochrome 24x24 Service Glyph Convention, SERVICES, isShell(), launch(), isShell(), launch() (+2 more)

### Community 63 - "IPC Channel Policy"
Cohesion: 0.32
Nodes (11): IPC channel classification, Task 1: shared types, constants and IPC channels, Five shell-only pins:* channels and ShellState.pins, LOCKED_ALLOWED_CHANNELS, senderAllowed(), channelAllowedWhileLocked(), ipcSenderAllowed(), LOCKED_ALLOWED_CHANNELS (+3 more)

### Community 64 - "Feature Inventory & Login Landing"
Cohesion: 0.17
Nodes (13): Goetia Feature Inventory & Verification, Service-Switch Broadcast Regression (2026-08-07), Logged-out Login Landing Implementation Plan, hostMatches (Shared Suffix Matcher), Social Login Implementation Plan, Shared Facebook Identity Implementation Plan, Recipe.loginUrl Hook, Logged-out Login Landing Design Spec (+5 more)

### Community 65 - "Release Workflow & Signing"
Cohesion: 0.17
Nodes (13): Arch-suffixed dmg artifact names, Release workflow implementation plan, publish: null plus --publish never, Two-phase build matrix and release job, Tag-matches-package.json guard, Signing prerequisites and cost, Designated requirement stability explains the keychain prompt, Turning the cookie-encryption fuse off is not an option (+5 more)

### Community 66 - "Home Composition Design"
Cohesion: 0.28
Nodes (13): resolveActivation, anyOverlayOpen predicate, Composition lives on Home, not Settings, homeOpen shell surface, Home Screen and Service Composition Plan, Rail home sigil and the ⌘/Ctrl 0 accelerator, activate(id, { show: false }) — resolve without revealing, Settings.lastActiveId + lastHomeOpen (+5 more)

### Community 67 - "Pinned Messages Plan"
Cohesion: 0.17
Nodes (9): Pinned Messages Implementation Plan (2026-08-26), Plan global constraints, Task 10: docs and final verification, Task 9: end-to-end spec, Task 3: PinStore with pins.json persistence, Dragging a paragraph-length pin broke the board (min-w-0 fix), isShell(), launch() (+1 more)

### Community 68 - "TikTok/Instagram Service Design"
Cohesion: 0.15
Nodes (13): Permission handler origin check, TikTok bot-detection risk, data-e2e selector surface, Messages nav-badge count source, Rejected: chat-list scan, Live selector recalibration (2026-08-07), Never hide the side-nav container itself, TikTok chat service (+5 more)

### Community 69 - "Package Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, e2e, icons, lint, media, package:mac (+5 more)

### Community 71 - "Zalo Recipe"
Cohesion: 0.23
Nodes (7): nameMatches(), flat(), inside(), openZaloConversation(), zaloConversation(), PAGE, Rect

### Community 72 - "Instagram Recipe"
Cohesion: 0.21
Nodes (4): instagram, PAGE, rows(), watchRows()

### Community 73 - "Slack Service Plan"
Cohesion: 0.24
Nodes (12): Fresh installs start all-disabled, Catalog sorted by display name, Tasks 1–3 are one atomic change, Slack Service Implementation Plan, tests/fixtures/slack.html count oracle, ALLOWED_HOSTS slack entry, slack recipe, Slack service catalog entry (+4 more)

### Community 74 - "Tile Reorder Plan"
Cohesion: 0.23
Nodes (12): matchesQuery substring filter, moveTo drag index arithmetic, PickTile, ServiceBand, Unbound search and the Escape ladder, applySubsetOrder, consumeDrag, layoutScroll on the band scroll container (+4 more)

### Community 75 - "Notification Icons Design"
Cohesion: 0.23
Nodes (12): Slack logo and notification icons, Graphite minimal design system, Notification router, Unisolated per-service preload, We do not own the banner layout, Brand-colour tile notification icon, build-notification-icons.mjs, extraResources over asarUnpack (+4 more)

### Community 76 - "Instagram & chatPaths Design"
Cohesion: 0.18
Nodes (12): Chat ONLY principle (post-ship), chatPaths containment, The catalog ships in name order, normalize() catalog-position slotting, chatPaths: ['/direct'], Instagram chat service, pointer-events inerting of off-chat links, Instagram DM Inbox Fixture (+4 more)

### Community 77 - "Pinned Messages Spec"
Cohesion: 0.23
Nodes (12): Pinned messages design spec (2026-08-25), Decision: acknowledgement is a tally pill beside the Home sigil, Conversation label from document.title, Decision: the dashboard is a section on Home, PinStore refuses duplicate pins, Chords moved to the left hand, Messenger names the thread from the sidebar row, Decision: no modal at pin time (+4 more)

### Community 78 - "Shopee/Telegram Icons"
Cohesion: 0.27
Nodes (12): Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed), Telegram macOS Notification Icon (blue squircle, white circle, paper-plane glyph, inset padding), macOS Notification Icon Variant Convention (-mac suffix pairs), Per-Service Notification Icon Asset Set, Brand-Color Squircle Icon Design Language, WhatsApp Notification Icon (green rounded-square badge, white speech-bubble handset glyph, full bleed), WhatsApp macOS Notification Icon (green squircle, white speech-bubble handset glyph, inset padding), Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed) (+4 more)

### Community 79 - "Emoji Text & Messenger Fixture"
Cohesion: 0.23
Nodes (7): collect(), glyph(), textWithEmoji(), messenger, messenger.html fixture (chat-row unread oracle), Emoji delivered as <img alt> inside the row preview, messenger-reaction.html fixture (synthesized reaction notification)

### Community 80 - "Teams Recipe & Registry"
Cohesion: 0.27
Nodes (8): recipes, flat(), isUnread(), openTeamsConversation(), teams, teamsConversation(), UNREAD_TOKENS, PAGE

### Community 81 - "Messenger Recipe"
Cohesion: 0.33
Nodes (7): conversationFromRows(), countUnreadRows(), isUnreadRow(), rowTexts(), synthFromRows(), watchRows(), Counts

### Community 82 - "Security Hardening Plan v1"
Cohesion: 0.24
Nodes (11): chromeUserAgent strips Electron tokens, Crash resilience with exponential backoff, Hibernation controller and rules, ServiceViewManager with isolated sessions, Crash-reload cap survives post-load crashes, ipcSenderAllowed sender-origin policy, isSafeExternalUrl scheme allowlist, ALLOWED_HOSTS navigation containment (+3 more)

### Community 83 - "Notification Icons Plan"
Cohesion: 0.20
Nodes (11): Typed IPC contract, Notification pipeline and shouldNotify, Build-time tile rasteriser, Assets shipped outside the asar, resolveIcons: paths resolved once at startup, NativeImage fallback if a path icon is ignored, Notification service icons plan, NotificationRouter icon and title wiring (+3 more)

### Community 84 - "Welcome & Portal Components"
Cohesion: 0.18
Nodes (11): Portal.tsx, Startup zero-view guard, Welcome.tsx, Welcome is derived, not flagged, Three tip cards that sell three things, Board layout (header / bands / pinned footer), Board sizing rules, The rail overflows before Home does (+3 more)

### Community 85 - "Home Surface Design"
Cohesion: 0.24
Nodes (11): views.activate show option, anyOverlayOpen, Buried Settings modal bug, Home accelerator (CmdOrCtrl+0), home:setOpen channel, homeOpen shell surface, Overlay invariant: no view visible over a shell surface, Rail leading sigil (+3 more)

### Community 87 - "Pins Dark Shot"
Cohesion: 0.29
Nodes (10): Pins Board Dark Theme Screenshot, Conversation Label per Pin (#release, Minh Anh, Nhóm Sale, #tabletop), Dark Theme Rendering of Home Pins Board, Dimmed Pin Row for Banished Service, Drag-Handle Reordering of Pins, Pin 0 In-Progress Slot (highlighted top pin with Done button), Per-Pin Notes (add a note placeholder, 'review by Thu' filled note), Pin Row Layout (drag handle, service icon, conversation label, message text, note, done check, unpin x) (+2 more)

### Community 88 - "Rail Component"
Cohesion: 0.27
Nodes (6): Task 7: rail pin tally and pulse, NO_PINS, PinIcon(), Rail(), Props, PinView

### Community 89 - "Restore Last Surface Design"
Cohesion: 0.22
Nodes (10): Settings.lastNotifiedVersion, activateService clears homeOpen, Settings.lastActiveId, Settings.lastHomeOpen, Nested settings.update inside the handler is safe, Persist the surface on change, into Settings, rememberSurface, resolveStartupSurface (+2 more)

### Community 90 - "Passkey Authenticator Tests"
Cohesion: 0.27
Nodes (6): Verification, codec, createOptions(), input(), registered(), setup()

### Community 91 - "Banner SVG"
Cohesion: 0.36
Nodes (9): Accessible SVG Labeling (role=img, aria-label, title), Goetia Banner (1200x300 SVG), Ember Gradient Palette (arcA, arcB, core, word), Ember Portal Mark, Tagline: Summon every chat to one window, nothing but the chat, Theme-Resilient SVG Fallback, Goetia Wordmark, App Icon SVG (resources/icon.svg) (+1 more)

### Community 92 - "Passkeys Dark Shot"
Cohesion: 0.28
Nodes (9): Dead-Entry Warning (forgetting locally leaves a stale credential on the site's own security page), Forget Passkey Action, Four Most-Recently-Used Accounts Cap per Site, Passkey List Row (rpId · username, via service, created/last-used dates, Forget button), Passkeys Keyed by rpId with Originating Service Attribution (via Messenger/Slack/TikTok), Passkeys Settings Screenshot (Dark Theme), Settings Modal Sidebar Navigation (General, Appearance, Services, Passkeys, Notifications, Shortcuts, Updates), Settings → Passkeys Panel (+1 more)

### Community 93 - "Passkeys Light Shot"
Cohesion: 0.31
Nodes (9): Dead-Entry Warning: Forgetting Locally Leaves Stale Entry on Site Security Page, Forget Button (Per-Passkey Removal), Four Most Recently Used Accounts Offered Per Site, Light Theme Rendering of Settings UI, Passkey Row (rpId, Account, Origin Service, Created/Last-Used Dates), Settings Passkeys Pane, Passkeys Listed by rpId with Originating Service Attribution, Passkeys Settings Screenshot (Light Theme) (+1 more)

### Community 94 - "Pins Light Shot"
Cohesion: 0.31
Nodes (9): Pins Board Screenshot (Light Theme), Dimmed Pin for Banished Service, Drag-Handle Reordering of Pins, Per-Pin Note Affordance (add a note / review by Thu), Pin Row Anatomy (Drag Handle, Service Icon, Conversation Label, Text, Note, Done, Unpin), Pin Count Tally (PINNED · 4), Pin 0 In-Progress Emphasis, Pinned Messages Board on Home (+1 more)

### Community 95 - "Drag Reorder Design"
Cohesion: 0.25
Nodes (9): Drag-to-reorder on Home, moveTo, applySubsetOrder, macOS copy-cursor badge defect, Draft order, committed once on drag end, What the drag looks like, Pointer drag makes the reorder path e2e-testable, Reorder.Group / pointer-driven reorder (+1 more)

### Community 96 - "Slack Service Design"
Cohesion: 0.28
Nodes (7): firstRunUrl and lib/start-url.ts (superseded), Slack chat-only CSS, Slack ALLOWED_HOSTS entry, Slack service (ninth service), back-affordance.ts off-chat predicate (removed), No back affordance — reload is the only way back, Slack logged-out flow stays on app.slack.com

### Community 97 - "Calls & Login Purge Design"
Cohesion: 0.22
Nodes (9): isBlankCallPopup (about:blank popups), call-policy.ts (CALL_POPUPS / CALL_ORIGINS / isCallPopup), Call URL adoption into a hardened call window, setDisplayMediaRequestHandler with the system picker, Inert guest popup (never commits a navigation), macOS call entitlements and usage descriptions, permissionAllowed gains call origins, confirmPurgeAll (Home-wide sweep) (+1 more)

### Community 98 - "Light Sleep Design"
Cohesion: 0.22
Nodes (9): Stale-banner disabled guard, Light Sleep (peek while hibernated), neverHibernate default flips to false, Peek lifecycle and noteUnreadReport, peek-rules.ts scheduling, BANNER_GRACE_MS (the Light Sleep interaction), Auto-banish sweep step and applyDisabledChange, Purge and banish are orthogonal axes (+1 more)

### Community 99 - "Package Metadata"
Cohesion: 0.22
Nodes (8): description, main, name, packageManager, private, productName, type, version

### Community 100 - "Discord Notification Icons"
Cohesion: 0.36
Nodes (9): Brand squircle notification icon system (128x128 RGBA, white glyph on brand fill), Discord notification icon (full-bleed), Discord notification icon (macOS inset variant), macOS `-mac` inset icon variant convention, Messenger notification icon (full-bleed), Messenger notification icon (macOS inset variant), Shopee notification icon (full-bleed), Shopee notification icon (macOS inset variant) (+1 more)

### Community 101 - "Badge Aggregation"
Cohesion: 0.31
Nodes (4): aggregateBadges(), BadgeEntry, badgeLabel(), BadgeSummary

### Community 104 - "Reorder E2E"
Cohesion: 0.28
Nodes (5): drag(), isShell(), launch(), stableBox(), TWO_ENABLED

### Community 105 - "Waking Dark Shot"
Cohesion: 0.32
Nodes (8): Dark Theme Palette, Light Sleep Wake / Hibernation Rehydration, Naming the Service Being Woken, Waking Overlay Screenshot (Dark Theme), Goetia Sigil Spinner, Waking Cover Overlay, "Waking <Service>..." Status Label, Zalo Service (subject of the wake)

### Community 106 - "Waking Light Shot"
Cohesion: 0.39
Nodes (8): Waking Overlay Screenshot (Light Theme), Light Sleep Hibernation, Light Theme Surface, Non-Blocking Wake Feedback, Orbital Ring Sigil Spinner, Waking Cover, "Waking <Service>..." Status Label, Zalo Service

### Community 107 - "Update Design Details"
Cohesion: 0.29
Nodes (8): External URL scheme allowlist, IPC sender/origin validation, Rail gear dot, releaseUrl, shouldAutoRecheck, updatePending, updates:check channel, updates:openDownload channel

### Community 108 - "Reload Guard Design"
Cohesion: 0.29
Nodes (8): Why the reload guard cannot trap the user, reloadAllowed reload guard, Settings loses its per-service reload button, views.reload stays unguarded, Auto-banish unused services, shouldBanish (banish-rules.ts), lastUsedAt persisted wall clock, Sleep settings move to the Services pane

### Community 109 - "Main Loads Tracker"
Cohesion: 0.39
Nodes (3): MainLoads, views.load (private load), LoadKind

### Community 110 - "Summon Combos"
Cohesion: 0.32
Nodes (6): comboLabel(), MAC_GLYPHS, MAC_ORDER, SUMMON_COMBOS, WIN_NAMES, WIN_ORDER

### Community 111 - "Release Workflow YAML"
Cohesion: 0.33
Nodes (7): Build provenance attestation step, Build job (mac arm64/x64 + win matrix), SHA256SUMS.txt generation, CSC_IDENTITY_AUTO_DISCOVERY disabled (no signing material), Publish release job, Tag must match package.json version, Release workflow (tag-triggered)

### Community 112 - "Shopee Focus & Loading Design"
Cohesion: 0.33
Nodes (7): Overlay above a still-visible view, Recipe CSS gated on the expanded state, Homepage entry URL, never /webchat, keepAlive trusted click on the collapsed pill, No network filtering, Unread from host textContent, Shopee Chat Focus Design

### Community 113 - "Settings Normalize & Updates"
Cohesion: 0.33
Nodes (7): Per-field settings normalize coercion, compareVersions, isNewer, parseLatestRelease, lib/update-check.ts pure layer, normalize() leaves lastActiveId intact, An unrestorable record opens Home, a missing one does not

### Community 114 - "Context Menu Design"
Cohesion: 0.29
Nodes (7): buildContextMenuTemplate, Service-view native context menu, Open Link in Browser hand-off, Add to Dictionary is per service, Per-service sign out (local partition wipe), service:tileMenu channel, Sign-out moves to Settings → Services

### Community 115 - "Quiet Hours & Hotkey Design"
Cohesion: 0.33
Nodes (7): QuietHoursController and the shared side-effects tail, Quiet hours (scheduled global mute), quiet-hours-rules.ts, quietOverrideWindowStart (the macOS DND rule), SUMMON_COMBOS curated list, Summon hotkey (global shortcut), summonHotkeyOk (no silent failure)

### Community 116 - "Tray Icons"
Cohesion: 0.29
Nodes (7): Goetia, Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Template Image Convention, Goetia macOS Template Tray Icon, Windows System Tray

### Community 117 - "Notification Icon Builder"
Cohesion: 0.33
Nodes (5): LOGO_DIR, OUT_DIR, placeGlyph(), ROOT, tileSvg()

### Community 118 - "Biometrics Prompt"
Cohesion: 0.52
Nodes (5): biometric(), hasTouchId(), ask(), electronPrompt(), identitySharePrompt()

### Community 119 - "Call Policy"
Cohesion: 0.48
Nodes (5): CALL_ORIGINS, CALL_POPUPS, CallPopupRule, isBlankCallPopup(), isCallPopup()

### Community 121 - "Notification Shim"
Cohesion: 0.33
Nodes (3): installNotificationShim(), NotificationShimHandle, NotifyForward

### Community 122 - "Passkeys E2E"
Cohesion: 0.43
Nodes (5): CredentialJson, isService(), isShell(), launch(), makeProfile()

### Community 123 - "Banner Title Split"
Cohesion: 0.40
Nodes (4): Recents are the banner stream remembered, A Cmd-K row leads with the conversation, not the sender, BannerParts, splitBannerTitle()

### Community 124 - "Context Menu & Calls Plan"
Cohesion: 0.33
Nodes (6): buildContextMenuTemplate pure builder, Service-View Context Menu Implementation Plan, call-policy (CALL_POPUPS, CALL_ORIGINS, isCallPopup), setDisplayMediaRequestHandler with useSystemPicker, Calls and Screen Share Implementation Plan, Mic/camera usage descriptions in extendInfo

### Community 125 - "Chat Client Design Spec"
Cohesion: 0.60
Nodes (6): Electron as the desktop shell, Per-service persist: session isolation, Goetia Chat Client Design Spec, Chrome user-agent override, Viber excluded, Webview wrapper service integration

### Community 126 - "Banner to Conversation Design"
Cohesion: 0.47
Nodes (6): Banner → exact conversation, Lane A — replay the page's own click, Lane B — synthetic banners carry an href, resolveBannerClick decision table, ActivityLog (in-memory banner ring buffer), Quick-switcher Recent section

### Community 127 - "Shot Types"
Cohesion: 0.33
Nodes (5): SeededSettings, ServiceId, Shot, Surface, Theme

### Community 128 - "Release Script"
Cohesion: 0.60
Nodes (5): die(), run(), release.sh script, skip(), step()

### Community 129 - "Notification Icon Resolver"
Cohesion: 0.53
Nodes (3): iconFileName(), resolveIcons(), ICON_DIR

### Community 130 - "Peek Rules"
Cohesion: 0.53
Nodes (3): PeekCandidate, peekInterval(), pickPeek()

### Community 131 - "Off-Chat Link"
Cohesion: 0.47
Nodes (3): offChatLinkUrl(), parse(), messenger

### Community 132 - "Loading Page Script"
Cohesion: 0.47
Nodes (4): api, GoetiaLoadingApi, LoadingState, Window

### Community 133 - "Loading HTML"
Cohesion: 0.40
Nodes (6): Critical first-paint inline styles, Loading page Content-Security-Policy, loading.ts module entry, Portal sigil layers (ring, embers, core), Waking caption (#caption), Shell loading page (Goetia — waking)

### Community 136 - "Shortcuts E2E"
Cohesion: 0.53
Nodes (4): isService(), isShell(), launch(), makeProfile()

### Community 137 - "Reload Guard & Quiet Hours Plan"
Cohesion: 0.40
Nodes (5): Reload Guard Implementation Plan, reload-guard predicate (RELOAD_MIN_INTERVAL_MS), QuietHoursController one-timer boundary, Quiet Hours Implementation Plan, quiet-hours-rules (quietWindowFor, quietNow, nextBoundary, muteToggleResult)

### Community 138 - "Purge"
Cohesion: 0.60
Nodes (4): Pins survive purge and banish, purgeAll(), purgeLogin(), purgeService()

### Community 139 - "Slack Mac Icon"
Cohesion: 0.50
Nodes (5): Slack macOS Notification Icon, Per-Service Notification Identity, Platform-Suffixed Notification Icon Variant (-mac), Slack Octothorpe Brand Mark (white on aubergine), Squircle App-Icon Treatment

### Community 140 - "Teams Mac Icon"
Cohesion: 0.60
Nodes (5): macOS Notification Icon Variant, Microsoft Teams, Goetia Notification Icon Assets, Teams Logo Mark (T tile with person silhouette), Teams macOS Notification Icon

### Community 141 - "TikTok Icons"
Cohesion: 0.70
Nodes (5): TikTok Notification Icon (default/Windows-Linux), TikTok Notification Icon (macOS variant), Platform-suffixed notification icon variant convention, TikTok Logo Mark (renderer SVG), Monochrome white glyph logo style (no brand fill)

### Community 142 - "Hibernation Rules"
Cohesion: 0.50
Nodes (3): HibernationCandidate, shouldHibernate(), base

### Community 144 - "Permission Policy"
Cohesion: 0.70
Nodes (3): CALL_SURFACE_OK, GRANTED, permissionAllowed()

### Community 148 - "Purge Copy"
Cohesion: 0.60
Nodes (3): purgeAllCopy(), PurgeCopy, purgeLoginCopy()

### Community 150 - "Restart E2E"
Cohesion: 0.50
Nodes (3): isShell(), launch(), TWO_ENABLED

### Community 151 - "Instagram Mac Icon"
Cohesion: 0.83
Nodes (4): Flat White Camera Glyph on Crimson Squircle, Instagram macOS Notification Icon, Instagram Service Visual Identity, Per-Platform Notification Icon Variant Convention

### Community 152 - "Teams Icon"
Cohesion: 0.67
Nodes (4): Microsoft Teams (service), Notification Icon Asset Set, Teams Logo Mark (T glyph and person silhouette), Teams Notification Icon

### Community 158 - "Teams SVG"
Cohesion: 0.83
Nodes (4): Microsoft Teams, Monochrome Glyph Mark (white fill, 24x24 viewBox), Service Rail Tile Icon, Microsoft Teams Logo (SVG asset)

### Community 160 - "Banish E2E"
Cohesion: 0.67
Nodes (3): DISABLED, isShell(), launch()

### Community 163 - "Release Notes Body"
Cohesion: 0.67
Nodes (3): First-launch gate walkthrough, Installer checksum and attestation verification, Release notes preamble

### Community 164 - "Back Affordance Plan"
Cohesion: 0.67
Nodes (3): backAvailable predicate, firstRunUrl mechanism removal, Service Back Affordance Implementation Plan (reverted)

### Community 165 - "Slack Icon"
Cohesion: 1.00
Nodes (3): Per-Service Notification Icon Asset Convention, Slack Brand Glyph (four-lozenge octothorpe), Slack Notification Icon (slack.png)

### Community 166 - "Tray Template SVG"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

### Community 172 - "Shell index.html"
Cohesion: 0.67
Nodes (3): Shell CSP meta policy (index.html), #root mount point + /src/main.tsx module entry, Shell window HTML document (index.html)

### Community 173 - "Instagram SVG"
Cohesion: 1.00
Nodes (3): Accessible SVG Labeling (role=img + <title>), Instagram Logo Glyph (rail icon asset), Monochrome 24x24 Service Logo Convention

## Ambiguous Edges - Review These
- `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` → `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`  [AMBIGUOUS]
  resources/notification-icons/zalo.png · relation: semantically_similar_to
- `Platform-suffixed notification icon variant convention` → `Monochrome white glyph logo style (no brand fill)`  [AMBIGUOUS]
  src/renderer/src/assets/logos/tiktok.svg · relation: conceptually_related_to
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
- `Pins Board Dark Theme Screenshot` → `Dimmed Pin Row for Banished Service`  [AMBIGUOUS]
  docs/media/pins-dark.png · relation: references

## Knowledge Gaps
- **364 isolated node(s):** `target`, `module`, `moduleResolution`, `ES2022`, `DOM` (+359 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **65 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed)` and `Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Platform-suffixed notification icon variant convention` and `Monochrome white glyph logo style (no brand fill)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Cmd+1..9 service accelerators` and `Monochrome service glyphs`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Quick Switcher overlay` and `Accelerators track rail order, not filtered position`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Rail Badges (Dark Theme) Screenshot` and `Badge Stays Visible While Muted`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Settings Sidebar Navigation` and `Shell Overlay Surface`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Services Pane` and `Settings Has No Service Enable Toggle`?**
  _Edge tagged AMBIGUOUS (relation: rationale_for) - confidence is low._