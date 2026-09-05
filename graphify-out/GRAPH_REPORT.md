# Graph Report - .  (2026-09-05)

## Corpus Check
- 49 files · ~399,889 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2192 nodes · 3846 edges · 219 communities (155 shown, 64 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 298 edges (avg confidence: 0.83)
- Token cost: 96,031 input · 0 output

## Community Hubs (Navigation)
- Pins Board & Home Shell
- Shared Facebook Identity Seeding
- Service Tiles & Wake Rules
- WebAuthn Preload Shim
- Recipe Runner Framework
- Service View Manager
- Open Reply & Views Wiring
- Wake Captions Design
- Biome Lint Config
- CBOR & WebAuthn Crypto
- Home Redesign & Summon Cap
- Banner Title & Notifications
- Update Checker
- Hibernation, Layout & Passkeys Pane
- Main Entry & State
- Shell Chords & Commands
- Welcome Composition Flow
- IPC Sender Policy & Pin Channels
- Passkey Rules & Store Codec
- Quiet Hours Rules
- Rail Design (Light Theme)
- App Context Hooks
- Discord/Slack/Telegram Recipes
- Rail Design (Dark Theme)
- Pin Capture Main Wiring
- TypeScript Config
- Activation Rules & Settings Fill
- WebAuthn Request Validation
- Ember Loading Overlay
- Pin Rules
- Recipe Hardening Decisions
- Update Announce Gate
- Welcome Screen Plan
- Pin Store Model
- App Icon Ember Gradients
- Media Capture Scripts
- WhatsApp Recipe
- Quick Switcher UI
- Guardrails: Pins, Banish, Purge
- Guardrails: Home & Process Boundaries
- Service Context Menu
- Hardening & Remediation Design
- Hibernation Controller
- Dev Dependencies
- Guardrails: Services & IPC Classes
- Quick Switcher Dark Screenshot
- Settings Light Screenshot
- Welcome Dark Screenshot
- Welcome Light Screenshot
- Security Audit Hardening Plan
- Activate & IPC Handlers
- Settings View
- Docs & Branding Index
- Quick Switcher Light Screenshot
- Settings Dark Screenshot
- Main State Pipeline Notes
- Overlay Visibility Rules
- Activity Log
- Passkey Store
- Shopee Recipe
- Home Composition Plan
- Pinned Messages Plan
- Summon Cap Rules
- Pinned Messages Spec
- WhatsApp/Zalo Conversation Hooks
- Package Scripts
- Passkey Authenticator & Prompt
- Zalo Recipe
- Instagram Recipe
- Release Workflow Plan
- Slack Service Plan
- Home Picker & Drag
- Slack Design System Notes
- Passkeys Implementation Plan
- Chat-Only Catalog Rules
- Tray Icons
- Telegram Notification Icon
- Loading Overlay API
- Recipe Index & Teams
- Messenger Unread Rows
- Resilience Manager
- Goetia v1 Plan
- IPC Contract & Assets
- Portal & Welcome Component
- Context Menu Design
- Light Sleep Peeks
- TikTok Recipe
- Notification Rules
- Pins Board Dark Screenshot
- Badge & Throttle Decisions
- Chat-Only Principle & Shopee
- Goetia Banner SVG
- Passkeys Pane (Light)
- Passkeys Pane (Dark)
- Pins Board Light Screenshot
- Surface Persistence Settings
- Home Drag Reorder
- Slack Recipe Details
- Conversation Open Lanes
- Package Metadata
- Discord Notification Icons
- Badges Aggregation
- Reorder E2E Spec
- Passkey Authenticator Tests
- Waking Overlay Dark Screenshot
- Waking Overlay Light Screenshot
- Shopee Recipe Design
- Update Check Rules
- Banner Click Lanes Design
- Summon Combos
- Release Build Jobs
- Popup Policy Guardrails
- Badges, Tray & Smoke
- Shopee Overlay Decisions
- Update Check Pure Layer
- Quiet Hours Controller
- Purge & Sign Out
- Notification Icon Builder
- Call Policy
- Identity Share Prompt
- Passkeys E2E Spec
- Context Menu Plan
- Logged-out Login Landing
- Chat Client Design Spec
- Shot Types
- Release Script
- Notification Icons Resolver
- Peek Rules
- Emoji Text
- Shortcuts E2E Spec
- Definition of Done & Packaging
- Reload Guard & Quiet Hours Plans
- Passkey Ceremony Design
- Slack Notification Icon
- Teams Notification Icon
- TikTok Notification Icon
- Hibernation Rules
- Notification Throttle
- Permission Policy
- Summon Hotkey
- Rail Reorder Prompt
- Restart E2E Spec
- Reload Guard Rationale
- Instagram Notification Icon
- Teams Icon Assets
- Click Point
- Coalesce
- Navigation Audit
- Overlay Rules
- Zoom Rules
- Loading HTML Page
- Teams Logo SVG
- Overlay Badge
- Update Rules
- Banish E2E Spec
- Purge E2E Spec
- Updates E2E Spec
- Release Notes Preamble
- Back Affordance (Reverted)
- Slack Icon Convention
- macOS Template Tray Icon
- Backoff
- Client Hints
- External URL Safety
- Startup Surface
- User Agent
- Visibility Spoof
- Shell Index HTML
- Instagram Logo SVG
- Fuzzy Score
- Summon Gauge
- Peek E2E Spec
- Meta Conversation Test
- conf Dependency
- Summon Hotkey Plan
- Tray Quit & Crash Dwell
- Banner Markdown Allowlist
- Home Chord & Zoom Menu
- electron Dependency
- electron-builder Dependency
- Ad-hoc Signing & Fuses
- electron-vite Dependency
- happy-dom Dependency
- motion Dependency
- react Dependency
- react-dom Dependency
- resvg Dependency
- Tailwind Vite Dependency
- @types/react Dependency
- @types/react-dom Dependency
- vite Dependency
- Instagram Icon Convention
- Discord Logo
- Messenger Logo
- Telegram Logo
- WhatsApp Logo
- Zalo Logo
- Messenger Unread Signals
- Teams Fixtures
- One Sound Per Message
- Tile Reorder IPC Rule
- Bounded Ready Poll
- Coalesced Resize
- Will-redirect Hand-back
- Hardened Runtime Entitlements
- Unpacked Notification Icons
- Blank Logged-out Fixture
- Telegram Fixture
- Zalo Aggregated Badge Fixture
- Zalo Fixture

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 143 edges
2. `ServiceViewManager` - 45 edges
3. `Recipe` - 33 edges
4. `AppContext` - 31 edges
5. `registerIpcHandlers()` - 31 edges
6. `Pinned messages design spec (2026-08-25)` - 29 edges
7. `PinStore` - 28 edges
8. `MainState` - 24 edges
9. `startRecipe()` - 21 edges
10. `useShell` - 19 edges

## Surprising Connections (you probably didn't know these)
- `syncOverlay` --semantically_similar_to--> `ContentPlaceholder()`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-09-05-wake-captions.md → src/renderer/src/components/ContentPlaceholder.tsx
- `createTray()` --references--> `Windows Tray Icon (orange ring mark)`  [INFERRED]
  src/main/tray.ts → resources/tray/tray-win.png
- `Emoji delivered as <img alt> inside the row preview` --conceptually_related_to--> `textWithEmoji()`  [INFERRED]
  tests/fixtures/messenger-reaction.html → src/preload/recipes/emoji-text.ts
- `discord.html fixture (guild badges + dot title)` --references--> `discord`  [INFERRED]
  tests/fixtures/discord.html → src/preload/recipes/discord.ts
- `shopee.html fixture (expanded mini-chat, header badge 31)` --shares_data_with--> `chatHeader()`  [INFERRED]
  tests/fixtures/shopee.html → src/preload/recipes/shopee.ts

## Import Cycles
- 3-file cycle: `src/main/activate.ts -> src/main/ipc-handlers.ts -> src/main/notifications.ts -> src/main/activate.ts`

## Hyperedges (group relationships)
- **LoadKind rides MainLoads mark into WakingTracker and the caption** — src_main_views_load, src_main_lib_main_loads_mainloads, src_main_views_viewhooks, src_main_waking_wakingtracker, src_shared_types_serviceruntime, src_shared_wake_caption_wakecaption, src_main_index_synoverlay, src_renderer_src_components_contentplaceholder_contentplaceholder [EXTRACTED 1.00]
- **Banner, recents row and pin open through resolveBannerClick lanes** — claude_banner_click_lands_in_conversation, claude_recents_banner_stream_remembered, claude_pins_todo_list, src_main_lib_notification_click_resolvebannerclick, src_main_lib_activity_log_activitylog, src_main_pins_pinstore [EXTRACTED 1.00]
- **Deny-by-default popup and navigation hardening around unsandboxed views** — claude_process_boundaries, claude_navigation_containment, claude_call_popup_hidden_inert_guest, claude_identity_popup, claude_shared_facebook_identity, claude_off_chat_link_opens_externally [INFERRED 0.85]
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

## Communities (219 total, 64 thin omitted)

### Community 0 - "Pins Board & Home Shell"
Cohesion: 0.05
Nodes (39): Task 6: Done/unpin toast in the renderer, Task 8: PinnedBand on Home, Task 7: rail pin tally and pulse, Decision: focus altar board layout, Board snaps as one when the pin set changes, Toast hung after Undo then Done, App(), CapTrimToast() (+31 more)

### Community 1 - "Shared Facebook Identity Seeding"
Cohesion: 0.06
Nodes (31): CookieJar, debugIdentity(), IdentityShare, removalUrl(), SeedsFile, hostMatches(), IDENTITY_PROVIDERS, IdentityProvider (+23 more)

### Community 2 - "Service Tiles & Wake Rules"
Cohesion: 0.08
Nodes (23): serviceAccelerator(), endsWake(), WakeEnd, logos, Props, logos, PickTile(), Props (+15 more)

### Community 3 - "WebAuthn Preload Shim"
Cohesion: 0.10
Nodes (26): AnyRecord, assertion(), attestation(), b64(), buffer(), credential(), descriptors(), fromJson() (+18 more)

### Community 4 - "Recipe Runner Framework"
Cohesion: 0.10
Nodes (14): startRecipe(), Recipe, harness(), harness(), hashRouted, recipe, harness(), base (+6 more)

### Community 6 - "Open Reply & Views Wiring"
Cohesion: 0.10
Nodes (17): LANES, parseOpenReply(), DEBUG_CALLS, EDIT_LABELS, NOTE: backgroundThrottling stays ON by default — disabling it also, webAuthnEnabled(), installNotificationShim(), NotificationShimHandle (+9 more)

### Community 7 - "Wake Captions Design"
Cohesion: 0.12
Nodes (13): The waking cover is for loads main asked for, and names the kind, Wake Captions Implementation Plan, Wake Captions Design Spec, Five load kinds (wake, reload, restart, purge, hand-back), null wakeKind renders the wake caption, ContentPlaceholder keyed on waking, not loading, syncOverlay, MainLoads (+5 more)

### Community 8 - "Biome Lint Config"
Cohesion: 0.07
Nodes (27): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+19 more)

### Community 9 - "CBOR & WebAuthn Crypto"
Cohesion: 0.16
Nodes (18): RFC-8949, CborValue, compareBytes(), concat(), encodeCbor(), head(), attestationObject(), authenticatorData() (+10 more)

### Community 10 - "Home Redesign & Summon Cap"
Cohesion: 0.08
Nodes (27): HomeHero + SummonGauge single layout, MAX_SUMMONED / capBlocked / trimToCap, Home Redesign and Summon Cap Implementation Plan, ctx.noteUnreadReport late-bound hook, peek-rules scheduling helper, Light Sleep Implementation Plan, BANNER_GRACE_MS peek grace, Banner → Exact Conversation Implementation Plan (+19 more)

### Community 11 - "Banner Title & Notifications"
Cohesion: 0.13
Nodes (15): BannerParts, splitBannerTitle(), Slack Logo SVG (renderer asset), Slack Brand Mark (four-lozenge hash), Monochrome 24x24 Service Glyph Convention, serviceById(), SERVICES, DEFAULT_SETTINGS (+7 more)

### Community 12 - "Update Checker"
Cohesion: 0.14
Nodes (9): compareVersions(), isNewer(), parseLatestRelease(), parts(), releaseUrl(), UpdateChecker, UpdateCheckerDeps, harness() (+1 more)

### Community 13 - "Hibernation, Layout & Passkeys Pane"
Cohesion: 0.11
Nodes (10): DEBUG_PEEKS, sameBounds(), ViewBounds, dateOf(), PasskeysPane(), applySubsetOrder(), PasskeyView, RailPosition (+2 more)

### Community 14 - "Main Entry & State"
Cohesion: 0.18
Nodes (7): e2eUpdate, userDataArg, defaultRuntime(), MainState, WakingTracker, ServiceRuntime, UpdateState

### Community 15 - "Shell Chords & Commands"
Cohesion: 0.17
Nodes (16): Goetia's chords win inside a page, openSettings(), runShellCommand(), setActiveZoom(), Chord, CODES, FIXED, KeyInput (+8 more)

### Community 16 - "Welcome Composition Flow"
Cohesion: 0.13
Nodes (23): buildDisabledPatch, Welcome confirm flow, resolveActivation, Service picker grid, Escape leaves Home, Seeded, staged picker, Settings loses the enable toggle, summonDelta (+15 more)

### Community 17 - "IPC Sender Policy & Pin Channels"
Cohesion: 0.12
Nodes (12): Task 1: shared types, constants and IPC channels, Five shell-only pins:* channels and ShellState.pins, ipcSenderAllowed(), allowed, api, GoetiaApi, invokable, ShellStore (+4 more)

### Community 18 - "Passkey Rules & Store Codec"
Cohesion: 0.14
Nodes (9): accountLabel(), clock(), isB64(), parsePasskeys(), passkeyViews(), KeyCodec, PasskeysFile, known (+1 more)

### Community 19 - "Quiet Hours Rules"
Cohesion: 0.16
Nodes (11): minutesOf(), muteToggleResult(), nextBoundary(), quietNow(), quietWindowFor(), windowStartingOn(), QuietHoursController, QuietHoursSchedule (+3 more)

### Community 20 - "Rail Design (Light Theme)"
Cohesion: 0.14
Nodes (20): Active Service Highlight, Discord Service, Home Sigil, Icon-Only Minimal Chrome, Instagram Service, Light Theme, Messenger Service, Muted Service Indicator (+12 more)

### Community 21 - "App Context Hooks"
Cohesion: 0.17
Nodes (9): Pins survive purge and banish, AppContext, applyDisabledChange(), registerIpcHandlers(), setServiceMuted(), NotificationRouter, purgeAll(), purgeLogin() (+1 more)

### Community 22 - "Discord/Slack/Telegram Recipes"
Cohesion: 0.14
Nodes (11): discord, startReadyPoll(), visiblyPresent(), slack, telegram, discord.html fixture (guild badges + dot title), Orphan numberBadge exclusion (badge must be nested in lowerBadge), whatsapp.html fixture (pane-side mount + '(3)' title) (+3 more)

### Community 23 - "Rail Design (Dark Theme)"
Cohesion: 0.14
Nodes (19): Active Service Highlight, Amber Monochrome Icon Treatment, Badge Stays Visible While Muted, Dark Theme Rail Styling, Discord, Home Sigil, Instagram, Messenger (+11 more)

### Community 24 - "Pin Capture Main Wiring"
Cohesion: 0.18
Nodes (5): Task 5: main wiring (hooks, state, IPC handlers), Decision: capture point is the context menu, debugCalls(), ViewHooks, url()

### Community 25 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 26 - "Activation Rules & Settings Fill"
Cohesion: 0.23
Nodes (9): deepFreeze(), fillAutoBanish(), fillLastUsedAt(), fillQuietHours(), fillSummonHotkey(), fillZoom(), normalize(), SettingsStore (+1 more)

### Community 27 - "WebAuthn Request Validation"
Cohesion: 0.20
Nodes (14): AssertionRequest, base64Field(), CreationRequest, descriptorIds(), hostOfOrigin(), parseAssertion(), parseCreation(), parseUserVerification() (+6 more)

### Community 28 - "Ember Loading Overlay"
Cohesion: 0.16
Nodes (18): Ember-portal loading page, LoadingOverlay WebContentsView, Service loading screen (waking overlay) plan, Badge shot seeds neverHibernate false, docs/media/banner.svg, capture-media.mjs capture driver, Capture matrix (SHOTS), Screenshots show Goetia's own chrome only (+10 more)

### Community 29 - "Pin Rules"
Cohesion: 0.25
Nodes (10): Task 2: pure pin rules, BRAND_SEGMENTS, clampText(), conversationFromTitle(), GENERIC_TITLES, isPermutation(), parsePins(), pinViews() (+2 more)

### Community 30 - "Recipe Hardening Decisions"
Cohesion: 0.12
Nodes (18): Single-pass Messenger count(), Permission handler origin check, Runner count() timeout race, Stale-report dedup and no-op setRuntime, TikTok bot-detection risk, data-e2e selector surface, Messages nav-badge count source, Rejected: chat-list scan (+10 more)

### Community 31 - "Update Announce Gate"
Cohesion: 0.18
Nodes (17): Announce gate (latest vs announce), The update fetch lives in main, Settings gear update dot, Check for Updates Implementation Plan, Automatic checks fail silently, shouldToast / TOAST_MS, update-check pure version logic, UpdateChecker (+9 more)

### Community 32 - "Welcome Screen Plan"
Cohesion: 0.20
Nodes (17): buildDisabledPatch, Welcome visibility is derived, not a flag, Welcome Screen Implementation Plan, Portal (shared ember-portal component), Welcome component, summonDelta / summonLabel, Three non-overlapping selling-point cards, Dispel button (+9 more)

### Community 33 - "Pin Store Model"
Cohesion: 0.22
Nodes (7): Cap is visible: item disabled at 50, never a silent shift, Pin data model, Pin, PinsFile, PinStore, PIN_CAP, PIN_TEXT_MAX

### Community 34 - "App Icon Ember Gradients"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 35 - "Media Capture Scripts"
Cohesion: 0.18
Nodes (11): capture(), isShell(), SURFACES, ALL_SERVICE_IDS, DEMO_PASSKEYS, DEMO_PINS, NINE_UP, settingsFor() (+3 more)

### Community 36 - "WhatsApp Recipe"
Cohesion: 0.15
Nodes (9): unreadFromTitle(), clickRow(), countWhatsAppChats(), openWhatsAppConversation(), WhatsAppChat, whatsAppConversation(), Discord bullet-prefixed title as indirect-unread signal, Title-parsed count as IndexedDB fallback (no page IDB under test) (+1 more)

### Community 37 - "Quick Switcher UI"
Cohesion: 0.22
Nodes (11): logos, QuickSwitcher(), msUntilLabelChange(), nextLabelChange(), recentHaystack(), relativeTime(), switcherRows(), SwitcherService (+3 more)

### Community 38 - "Guardrails: Pins, Banish, Purge"
Cohesion: 0.15
Nodes (13): Auto-banish: the hibernation sweep one step later, Banner click lands in the conversation (OpenRequest lanes), Pins are the user's todo list on Home, Purge and banish are orthogonal axes, Recents are the banner stream remembered, Jump reuses the recents path verbatim, BanishCandidate, shouldBanish() (+5 more)

### Community 39 - "Guardrails: Home & Process Boundaries"
Cohesion: 0.16
Nodes (16): Home is a destination, not a toggle, Process boundaries (shell isolated, views unsandboxed), No view visible while a shell overlay is open, chromeUserAgent strips Electron tokens, Crash resilience with exponential backoff, Hibernation controller and rules, ServiceViewManager with isolated sessions, Crash-reload cap survives post-load crashes (+8 more)

### Community 40 - "Service Context Menu"
Cohesion: 0.22
Nodes (13): Task 4: context-menu pin-message item, buildContextMenuTemplate(), ContextMenuInfo, ContextMenuItem, edit(), image(), link(), pin() (+5 more)

### Community 41 - "Hardening & Remediation Design"
Cohesion: 0.15
Nodes (16): Accepted residual risk, Hardening & remediation design, Electron fuses block, Pure lib/ helper testing strategy, Navigation containment guard, Release supply-chain SHA pinning and provenance, Renderer CSP tightening, Owner threat model (A local malware, B hostile web content, C supply chain) (+8 more)

### Community 43 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): @biomejs/biome, devDependencies, @biomejs/biome, @playwright/test, tailwindcss, typescript, @vitejs/plugin-react, vitest (+7 more)

### Community 44 - "Guardrails: Services & IPC Classes"
Cohesion: 0.15
Nodes (15): Adding a service checklist, chatPaths containment and loginUrl landing, IPC channel classification (shell-only vs serviceId-validated), keepRendered is two mechanisms (visibility spoof + throttling exemption), Light Sleep peeks and peekSaver backoff, Navigation containment via ALLOWED_HOSTS and the contained window, Off-chat link opens in the OS browser, Recipe polling cost rules (count() cheap and settling) (+7 more)

### Community 45 - "Quick Switcher Dark Screenshot"
Cohesion: 0.18
Nodes (15): Quick Switcher (dark) screenshot, Dark theme surface, Discord, Instagram, Matches ranked first, other services still listed, Messenger, Cmd+1..9 service accelerators, Quick Switcher overlay (+7 more)

### Community 46 - "Settings Light Screenshot"
Cohesion: 0.16
Nodes (15): Settings (Light Theme) Screenshot, Appearance Pane, Grouped Card Row Layout, Settings Category Sidebar, General Pane, Light Theme, Menu Position Setting, Settings Has No Service Enable Toggle (+7 more)

### Community 47 - "Welcome Dark Screenshot"
Cohesion: 0.16
Nodes (15): Goetia Welcome Screen (Dark Theme Screenshot), Chat-Only Principle Tagline ("All your chats. Nothing else."), Dark Theme with Ember/Amber Accent, Find a Service Search Field, Hibernation Hint ("Signs in once · idle chats sleep"), Home (Welcome Screen), Home Shortcut Hint (⌘/Ctrl 0 returns you here), Service Board (Summon/Banish Editor) (+7 more)

### Community 48 - "Welcome Light Screenshot"
Cohesion: 0.15
Nodes (15): Welcome Screen Screenshot (Light Theme), Bell and Gear Controls, Chat Only · No Feeds, No Shops, Home / Welcome Screen, ⌘/Ctrl 0 Returns You Here, Signs In Once · Idle Chats Sleep, Light Theme Palette (Warm Orange Accent), Service Board (Summoned / Unbound) (+7 more)

### Community 49 - "Security Audit Hardening Plan"
Cohesion: 0.15
Nodes (15): facebookAppId Param-Pollution Refusal, Display-Media Confirm Fallback, IPC Handler Crash-Proofing, Security & Performance Hardening Plan (2026-09-02 Audit), sanitizeBanner, Identity Popup (Hardened Sign-in Window), IDENTITY_PROVIDERS Table, Popup vs Redirect OAuth Flows (+7 more)

### Community 50 - "Activate & IPC Handlers"
Cohesion: 0.30
Nodes (10): activateService(), performBannerAction(), presentSurface(), rememberSurface(), setHomeOpen(), setOverlayOpen(), invokeOrigin(), register() (+2 more)

### Community 51 - "Settings View"
Cohesion: 0.16
Nodes (10): close(), DAY_LABELS, DAY_ORDER, isMac, key(), SectionId, SECTIONS, SettingsView() (+2 more)

### Community 52 - "Docs & Branding Index"
Cohesion: 0.18
Nodes (14): Goetia Engineering Guardrails, Ad-hoc Signature Consequences, Ember Portal Branding, ferdium-recipes (Upstream), Developing Goetia Guide, Goetia Feature Inventory & Verification, Service-Switch Broadcast Regression (2026-08-07), Hardening and Remediation Design (2026-08-07) (+6 more)

### Community 53 - "Quick Switcher Light Screenshot"
Cohesion: 0.18
Nodes (14): Quick Switcher (light theme) screenshot, Per-service accelerator hints (⌘1…⌘9), Discord, Instagram, Light theme palette, Messenger, Substring query filter ("s"), Quick Switcher overlay (+6 more)

### Community 54 - "Settings Dark Screenshot"
Cohesion: 0.18
Nodes (14): Settings (Dark Theme) Screenshot, Appearance Section, Dark Theme, General Section, Menu Position Setting, Settings Has No Service Enable Toggle, Notifications Section, Shell Overlay Surface (+6 more)

### Community 55 - "Main State Pipeline Notes"
Cohesion: 0.21
Nodes (14): MainState snapshot and broadcast pipeline, Quick switcher, fuzzyScore and app menu accelerators, SettingsStore over conf, connectShell returns its unsubscribe, Hung count() released by a timeout race, Single-pass Messenger unread detection, Reliability and performance remediation plan, Readiness poll attempt cap (+6 more)

### Community 56 - "Overlay Visibility Rules"
Cohesion: 0.19
Nodes (14): views.activate show option, activateService clears homeOpen, anyOverlayOpen, Buried Settings modal bug, Home accelerator (CmdOrCtrl+0), home:setOpen channel, homeOpen shell surface, Overlay invariant: no view visible over a shell surface (+6 more)

### Community 57 - "Activity Log"
Cohesion: 0.21
Nodes (6): Decision: Architecture A, a dedicated PinStore in main, ActivityEntry, ActivityLog, conversationKey(), openHref(), entry()

### Community 59 - "Shopee Recipe"
Cohesion: 0.20
Nodes (9): chatHeader(), shopee, shopee-collapsed.html fixture (collapsed pill badge 5), Collapsed pill as keep-alive click target (single wrapper child = not ready), shopee.html fixture (expanded mini-chat, header badge 31), Shopee mini-chat expanded state (wrapper has header + body children), zalo-dormant.html fixture (idle-deactivation activation modal), Zalo idle-deactivation (app unmounted behind 'Kích hoạt' modal, counts freeze) (+1 more)

### Community 60 - "Home Composition Plan"
Cohesion: 0.28
Nodes (13): resolveActivation, anyOverlayOpen predicate, Composition lives on Home, not Settings, homeOpen shell surface, Home Screen and Service Composition Plan, Rail home sigil and the ⌘/Ctrl 0 accelerator, activate(id, { show: false }) — resolve without revealing, Settings.lastActiveId + lastHomeOpen (+5 more)

### Community 61 - "Pinned Messages Plan"
Cohesion: 0.17
Nodes (9): Pinned Messages Implementation Plan (2026-08-26), Plan global constraints, Task 10: docs and final verification, Task 9: end-to-end spec, Task 3: PinStore with pins.json persistence, Dragging a paragraph-length pin broke the board (min-w-0 fix), isShell(), launch() (+1 more)

### Community 62 - "Summon Cap Rules"
Cohesion: 0.18
Nodes (13): capBlocked picker rule, Discard replaces Dispel, HomeHero fixed left column, MAX_SUMMONED cap of 9, SummonGauge ring, trimToCap and normalize() enforcement, followLiveOrder (clean board follows silently), homeDirty / discardHomeDraft store fields (+5 more)

### Community 63 - "Pinned Messages Spec"
Cohesion: 0.21
Nodes (13): Pinned messages design spec (2026-08-25), Decision: acknowledgement is a tally pill beside the Home sigil, Conversation label from document.title, Decision: the dashboard is a section on Home, PinStore refuses duplicate pins, View > Toggle Developer Tools (detached), Chords moved to the left hand, Messenger names the thread from the sidebar row (+5 more)

### Community 64 - "WhatsApp/Zalo Conversation Hooks"
Cohesion: 0.31
Nodes (13): WhatsApp conversation()/openConversation() hooks, WhatsApp showed the member list and never jumped, Zalo: openConversation returns a point for a trusted click, whatsapp, zalo, WhatsApp chat fixture (whatsapp-chat.html), Chat-list row name in cell-frame-title, Header chat title span (no title attribute) (+5 more)

### Community 65 - "Package Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, e2e, icons, lint, media, package:mac (+5 more)

### Community 66 - "Passkey Authenticator & Prompt"
Cohesion: 0.26
Nodes (3): PasskeyAuthenticator, PasskeyPrompt, WireResult

### Community 67 - "Zalo Recipe"
Cohesion: 0.23
Nodes (7): nameMatches(), flat(), inside(), openZaloConversation(), zaloConversation(), PAGE, Rect

### Community 68 - "Instagram Recipe"
Cohesion: 0.21
Nodes (4): instagram, PAGE, rows(), watchRows()

### Community 69 - "Release Workflow Plan"
Cohesion: 0.18
Nodes (12): Arch-suffixed dmg artifact names, Release workflow implementation plan, publish: null plus --publish never, Two-phase build matrix and release job, Tag-matches-package.json guard, Signing prerequisites and cost, Designated requirement stability explains the keychain prompt, Turning the cookie-encryption fuse off is not an option (+4 more)

### Community 70 - "Slack Service Plan"
Cohesion: 0.24
Nodes (12): Fresh installs start all-disabled, Catalog sorted by display name, Tasks 1–3 are one atomic change, Slack Service Implementation Plan, tests/fixtures/slack.html count oracle, ALLOWED_HOSTS slack entry, slack recipe, Slack service catalog entry (+4 more)

### Community 71 - "Home Picker & Drag"
Cohesion: 0.23
Nodes (12): matchesQuery substring filter, moveTo drag index arithmetic, PickTile, ServiceBand, Unbound search and the Escape ladder, applySubsetOrder, consumeDrag, layoutScroll on the band scroll container (+4 more)

### Community 72 - "Slack Design System Notes"
Cohesion: 0.23
Nodes (12): Slack logo and notification icons, Graphite minimal design system, Notification router, Unisolated per-service preload, We do not own the banner layout, Brand-colour tile notification icon, build-notification-icons.mjs, extraResources over asarUnpack (+4 more)

### Community 73 - "Passkeys Implementation Plan"
Cohesion: 0.21
Nodes (12): encodeCbor (Canonical CBOR Encoder), Goetia Passkeys Implementation Plan, webauthn-crypto (Keys, authData, Signatures), webauthn-rules (Request Validation), WebAuthn Wire Types (shared/webauthn.ts), Hash-aware chatPaths, Microsoft Teams Service Design Spec, webauthn-block.ts (Superseded) (+4 more)

### Community 74 - "Chat-Only Catalog Rules"
Cohesion: 0.18
Nodes (12): Chat ONLY principle (post-ship), chatPaths containment, The catalog ships in name order, normalize() catalog-position slotting, chatPaths: ['/direct'], Instagram chat service, pointer-events inerting of off-chat links, Instagram DM Inbox Fixture (+4 more)

### Community 75 - "Tray Icons"
Cohesion: 0.17
Nodes (11): Goetia, Windows Tray Icon (orange ring mark), Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Tray Template Icon, macOS Template Image Convention, Goetia macOS Template Tray Icon (+3 more)

### Community 76 - "Telegram Notification Icon"
Cohesion: 0.27
Nodes (12): Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed), Telegram macOS Notification Icon (blue squircle, white circle, paper-plane glyph, inset padding), macOS Notification Icon Variant Convention (-mac suffix pairs), Per-Service Notification Icon Asset Set, Brand-Color Squircle Icon Design Language, WhatsApp Notification Icon (green rounded-square badge, white speech-bubble handset glyph, full bleed), WhatsApp macOS Notification Icon (green squircle, white speech-bubble handset glyph, inset padding), Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed) (+4 more)

### Community 77 - "Loading Overlay API"
Cohesion: 0.20
Nodes (8): BG, LoadingState, api, GoetiaLoadingApi, LoadingState, Window, captionEl, MainToRenderer

### Community 78 - "Recipe Index & Teams"
Cohesion: 0.20
Nodes (6): recipes, messenger, teams, messenger.html fixture (chat-row unread oracle), Emoji delivered as <img alt> inside the row preview, messenger-reaction.html fixture (synthesized reaction notification)

### Community 79 - "Messenger Unread Rows"
Cohesion: 0.33
Nodes (7): conversationFromRows(), countUnreadRows(), isUnreadRow(), rowTexts(), synthFromRows(), watchRows(), Counts

### Community 81 - "Goetia v1 Plan"
Cohesion: 0.18
Nodes (11): Design tokens and reduced-motion kill switch, Agents never commit (plan-wide constraint), Goetia v1 implementation plan, Single-window shell with a view per service, startReadyPoll in the service preload, Rail tiles breathe while waking, waking runtime flag and loading:state channel, WakingTracker and endsWake rules (+3 more)

### Community 82 - "IPC Contract & Assets"
Cohesion: 0.20
Nodes (11): Typed IPC contract, Notification pipeline and shouldNotify, Build-time tile rasteriser, Assets shipped outside the asar, resolveIcons: paths resolved once at startup, NativeImage fallback if a path icon is ignored, Notification service icons plan, NotificationRouter icon and title wiring (+3 more)

### Community 83 - "Portal & Welcome Component"
Cohesion: 0.18
Nodes (11): Portal.tsx, Startup zero-view guard, Welcome.tsx, Welcome is derived, not flagged, Three tip cards that sell three things, Board layout (header / bands / pinned footer), Board sizing rules, The rail overflows before Home does (+3 more)

### Community 84 - "Context Menu Design"
Cohesion: 0.18
Nodes (11): buildContextMenuTemplate, Service-view native context menu, Open Link in Browser hand-off, Add to Dictionary is per service, isBlankCallPopup (about:blank popups), call-policy.ts (CALL_POPUPS / CALL_ORIGINS / isCallPopup), Call URL adoption into a hardened call window, setDisplayMediaRequestHandler with the system picker (+3 more)

### Community 85 - "Light Sleep Peeks"
Cohesion: 0.22
Nodes (11): Stale-banner disabled guard, Light Sleep (peek while hibernated), neverHibernate default flips to false, Peek lifecycle and noteUnreadReport, peek-rules.ts scheduling, BANNER_GRACE_MS (the Light Sleep interaction), Auto-banish unused services, shouldBanish (banish-rules.ts) (+3 more)

### Community 87 - "Notification Rules"
Cohesion: 0.38
Nodes (8): Mute means silence, never blindness, Quiet hours are a scheduled global mute, audioMuted(), clip(), notificationTitle(), sanitizeBanner(), shouldNotify(), soundOptions()

### Community 88 - "Pins Board Dark Screenshot"
Cohesion: 0.29
Nodes (10): Pins Board Dark Theme Screenshot, Conversation Label per Pin (#release, Minh Anh, Nhóm Sale, #tabletop), Dark Theme Rendering of Home Pins Board, Dimmed Pin Row for Banished Service, Drag-Handle Reordering of Pins, Pin 0 In-Progress Slot (highlighted top pin with Done button), Per-Pin Notes (add a note placeholder, 'review by Thu' filled note), Pin Row Layout (drag handle, service icon, conversation label, message text, note, done check, unpin x) (+2 more)

### Community 89 - "Badge & Throttle Decisions"
Cohesion: 0.22
Nodes (10): Single badge-label formatter, Per-service notification rate limit, TikTok synthNotification, Timer-driven dismissal under reduced motion, Self-dismissing UpdateToast, Capture determinism via reduced motion, scripts/capture-media.mjs, Screenshots show only Goetia's own chrome (+2 more)

### Community 90 - "Chat-Only Principle & Shopee"
Cohesion: 0.25
Nodes (7): Product principle: chat ONLY, Reload is the only way back to the chat URL, Shopee disabled by default, Entry URL moves off the anti-bot gate, Shopee chat-focus plan, Service Back Affordance Design (rejected, 2026-08-13), reloadAllowed()

### Community 91 - "Goetia Banner SVG"
Cohesion: 0.36
Nodes (9): Accessible SVG Labeling (role=img, aria-label, title), Goetia Banner (1200x300 SVG), Ember Gradient Palette (arcA, arcB, core, word), Ember Portal Mark, Tagline: Summon every chat to one window, nothing but the chat, Theme-Resilient SVG Fallback, Goetia Wordmark, App Icon SVG (resources/icon.svg) (+1 more)

### Community 92 - "Passkeys Pane (Light)"
Cohesion: 0.28
Nodes (9): Dead-Entry Warning (forgetting locally leaves a stale credential on the site's own security page), Forget Passkey Action, Four Most-Recently-Used Accounts Cap per Site, Passkey List Row (rpId · username, via service, created/last-used dates, Forget button), Passkeys Keyed by rpId with Originating Service Attribution (via Messenger/Slack/TikTok), Passkeys Settings Screenshot (Dark Theme), Settings Modal Sidebar Navigation (General, Appearance, Services, Passkeys, Notifications, Shortcuts, Updates), Settings → Passkeys Panel (+1 more)

### Community 93 - "Passkeys Pane (Dark)"
Cohesion: 0.31
Nodes (9): Dead-Entry Warning: Forgetting Locally Leaves Stale Entry on Site Security Page, Forget Button (Per-Passkey Removal), Four Most Recently Used Accounts Offered Per Site, Light Theme Rendering of Settings UI, Passkey Row (rpId, Account, Origin Service, Created/Last-Used Dates), Settings Passkeys Pane, Passkeys Listed by rpId with Originating Service Attribution, Passkeys Settings Screenshot (Light Theme) (+1 more)

### Community 94 - "Pins Board Light Screenshot"
Cohesion: 0.31
Nodes (9): Pins Board Screenshot (Light Theme), Dimmed Pin for Banished Service, Drag-Handle Reordering of Pins, Per-Pin Note Affordance (add a note / review by Thu), Pin Row Anatomy (Drag Handle, Service Icon, Conversation Label, Text, Note, Done, Unpin), Pin Count Tally (PINNED · 4), Pin 0 In-Progress Emphasis, Pinned Messages Board on Home (+1 more)

### Community 95 - "Surface Persistence Settings"
Cohesion: 0.22
Nodes (9): Announce gate, Settings.lastNotifiedVersion, shouldToast, Settings.lastActiveId, Settings.lastHomeOpen, Persist the surface on change, into Settings, resolveStartupSurface, StartupSurface (+1 more)

### Community 96 - "Home Drag Reorder"
Cohesion: 0.25
Nodes (9): Drag-to-reorder on Home, moveTo, applySubsetOrder, macOS copy-cursor badge defect, Draft order, committed once on drag end, What the drag looks like, Pointer drag makes the reorder path e2e-testable, Reorder.Group / pointer-driven reorder (+1 more)

### Community 97 - "Slack Recipe Details"
Cohesion: 0.28
Nodes (7): firstRunUrl and lib/start-url.ts (superseded), Slack chat-only CSS, Slack ALLOWED_HOSTS entry, Slack service (ninth service), back-affordance.ts off-chat predicate (removed), No back affordance — reload is the only way back, Slack logged-out flow stays on app.slack.com

### Community 98 - "Conversation Open Lanes"
Cohesion: 0.31
Nodes (6): Open matches by resolved URL, no-op when already there, MaybePromise, openConversationInPage(), OpenOptions, Point, urlKey()

### Community 99 - "Package Metadata"
Cohesion: 0.22
Nodes (8): description, main, name, packageManager, private, productName, type, version

### Community 100 - "Discord Notification Icons"
Cohesion: 0.36
Nodes (9): Brand squircle notification icon system (128x128 RGBA, white glyph on brand fill), Discord notification icon (full-bleed), Discord notification icon (macOS inset variant), macOS `-mac` inset icon variant convention, Messenger notification icon (full-bleed), Messenger notification icon (macOS inset variant), Shopee notification icon (full-bleed), Shopee notification icon (macOS inset variant) (+1 more)

### Community 101 - "Badges Aggregation"
Cohesion: 0.31
Nodes (4): aggregateBadges(), BadgeEntry, badgeLabel(), BadgeSummary

### Community 102 - "Reorder E2E Spec"
Cohesion: 0.28
Nodes (5): drag(), isShell(), launch(), stableBox(), TWO_ENABLED

### Community 103 - "Passkey Authenticator Tests"
Cohesion: 0.31
Nodes (5): codec, createOptions(), input(), registered(), setup()

### Community 104 - "Waking Overlay Dark Screenshot"
Cohesion: 0.32
Nodes (8): Dark Theme Palette, Light Sleep Wake / Hibernation Rehydration, Naming the Service Being Woken, Waking Overlay Screenshot (Dark Theme), Goetia Sigil Spinner, Waking Cover Overlay, "Waking <Service>..." Status Label, Zalo Service (subject of the wake)

### Community 105 - "Waking Overlay Light Screenshot"
Cohesion: 0.39
Nodes (8): Waking Overlay Screenshot (Light Theme), Light Sleep Hibernation, Light Theme Surface, Non-Blocking Wake Feedback, Orbital Ring Sigil Spinner, Waking Cover, "Waking <Service>..." Status Label, Zalo Service

### Community 106 - "Shopee Recipe Design"
Cohesion: 0.36
Nodes (8): Recipe framework and runner, Recipe ready(doc) chat-usable check, count() reads the widget badge via chatHeader, Chat-focus CSS gated on the expanded state, Structural selectors only, never hashed classes, TikTok DM recipe, TikTok synthesized notification, UNCALIBRATED data-e2e selectors

### Community 107 - "Update Check Rules"
Cohesion: 0.29
Nodes (8): External URL scheme allowlist, IPC sender/origin validation, Rail gear dot, releaseUrl, shouldAutoRecheck, updatePending, updates:check channel, updates:openDownload channel

### Community 108 - "Banner Click Lanes Design"
Cohesion: 0.32
Nodes (8): Banner → exact conversation, Lane A — replay the page's own click, Lane B — synthetic banners carry an href, resolveBannerClick decision table, ActivityLog (in-memory banner ring buffer), Quick-switcher Recent section, confirmPurgeAll (Home-wide sweep), purgeService shared unit

### Community 109 - "Summon Combos"
Cohesion: 0.32
Nodes (6): comboLabel(), MAC_GLYPHS, MAC_ORDER, SUMMON_COMBOS, WIN_NAMES, WIN_ORDER

### Community 110 - "Release Build Jobs"
Cohesion: 0.33
Nodes (7): Build provenance attestation step, Build job (mac arm64/x64 + win matrix), SHA256SUMS.txt generation, CSC_IDENTITY_AUTO_DISCOVERY disabled (no signing material), Publish release job, Tag must match package.json version, Release workflow (tag-triggered)

### Community 111 - "Popup Policy Guardrails"
Cohesion: 0.29
Nodes (7): Call popups: hidden inert guest adopted into a hardened call window, Identity popups: visible hardened sign-in windows, Passkeys are a software authenticator in main, Shared Facebook identity seeding, Goetia Passkeys Design (2026-08-30), Social Login Design (2026-08-31), Shared Facebook Identity Design (2026-09-01)

### Community 112 - "Badges, Tray & Smoke"
Cohesion: 0.29
Nodes (7): Badge aggregation across dock, overlay and rail, E2E smoke test and packaging targets, Tray, close-to-tray and autostart, keepAlive opens the collapsed pill, One badgeLabel with a 99+ threshold, Close-to-tray off must quit, not zombie, Deferred trustedClick toggle guarded

### Community 113 - "Shopee Overlay Decisions"
Cohesion: 0.33
Nodes (7): Overlay above a still-visible view, Recipe CSS gated on the expanded state, Homepage entry URL, never /webchat, keepAlive trusted click on the collapsed pill, No network filtering, Unread from host textContent, Shopee Chat Focus Design

### Community 114 - "Update Check Pure Layer"
Cohesion: 0.33
Nodes (7): Per-field settings normalize coercion, compareVersions, isNewer, parseLatestRelease, lib/update-check.ts pure layer, normalize() leaves lastActiveId intact, An unrestorable record opens Home, a missing one does not

### Community 115 - "Quiet Hours Controller"
Cohesion: 0.33
Nodes (7): QuietHoursController and the shared side-effects tail, Quiet hours (scheduled global mute), quiet-hours-rules.ts, quietOverrideWindowStart (the macOS DND rule), SUMMON_COMBOS curated list, Summon hotkey (global shortcut), summonHotkeyOk (no silent failure)

### Community 116 - "Purge & Sign Out"
Cohesion: 0.33
Nodes (7): Per-service sign out (local partition wipe), service:tileMenu channel, --danger color token, Login purge (rename of sign out), Purge and banish are orthogonal axes, Sign-out moves to Settings → Services, Banish on the tile menu

### Community 117 - "Notification Icon Builder"
Cohesion: 0.33
Nodes (5): LOGO_DIR, OUT_DIR, placeGlyph(), ROOT, tileSvg()

### Community 118 - "Call Policy"
Cohesion: 0.48
Nodes (5): CALL_ORIGINS, CALL_POPUPS, CallPopupRule, isBlankCallPopup(), isCallPopup()

### Community 119 - "Identity Share Prompt"
Cohesion: 0.43
Nodes (5): Verification, ask(), biometric(), hasTouchId(), identitySharePrompt()

### Community 120 - "Passkeys E2E Spec"
Cohesion: 0.43
Nodes (5): CredentialJson, isService(), isShell(), launch(), makeProfile()

### Community 121 - "Context Menu Plan"
Cohesion: 0.33
Nodes (6): buildContextMenuTemplate pure builder, Service-View Context Menu Implementation Plan, call-policy (CALL_POPUPS, CALL_ORIGINS, isCallPopup), setDisplayMediaRequestHandler with useSystemPicker, Calls and Screen Share Implementation Plan, Mic/camera usage descriptions in extendInfo

### Community 122 - "Logged-out Login Landing"
Cohesion: 0.33
Nodes (6): Logged-out Login Landing Implementation Plan, Recipe.loginUrl Hook, Logged-out Login Landing Design Spec, TikTok Logged-out Shell, TikTok Signed-in Messages Fixture, TikTok Logged-out Shell Fixture

### Community 123 - "Chat Client Design Spec"
Cohesion: 0.60
Nodes (6): Electron as the desktop shell, Per-service persist: session isolation, Goetia Chat Client Design Spec, Chrome user-agent override, Viber excluded, Webview wrapper service integration

### Community 124 - "Shot Types"
Cohesion: 0.33
Nodes (5): SeededSettings, ServiceId, Shot, Surface, Theme

### Community 125 - "Release Script"
Cohesion: 0.60
Nodes (5): die(), run(), release.sh script, skip(), step()

### Community 126 - "Notification Icons Resolver"
Cohesion: 0.53
Nodes (3): iconFileName(), resolveIcons(), ICON_DIR

### Community 127 - "Peek Rules"
Cohesion: 0.53
Nodes (3): PeekCandidate, peekInterval(), pickPeek()

### Community 128 - "Emoji Text"
Cohesion: 0.53
Nodes (3): collect(), glyph(), textWithEmoji()

### Community 129 - "Shortcuts E2E Spec"
Cohesion: 0.53
Nodes (4): isService(), isShell(), launch(), makeProfile()

### Community 130 - "Definition of Done & Packaging"
Cohesion: 0.40
Nodes (5): Definition of Done (lint, typecheck, test, e2e, package:mac), Electron fuses and macOS entitlements, Packaging (ad-hoc signed DMG, Gatekeeper gate), Code Signing and Notarization Plan (2026-08-07), pnpm workspace config

### Community 131 - "Reload Guard & Quiet Hours Plans"
Cohesion: 0.40
Nodes (5): Reload Guard Implementation Plan, reload-guard predicate (RELOAD_MIN_INTERVAL_MS), QuietHoursController one-timer boundary, Quiet Hours Implementation Plan, quiet-hours-rules (quietWindowFor, quietNow, nextBoundary, muteToggleResult)

### Community 132 - "Passkey Ceremony Design"
Cohesion: 0.50
Nodes (5): PasskeyAuthenticator (Ceremony Owner), PasskeyStore (passkeys.json), UV Set on Accepted Confirm, WebAuthn Shim (webauthn-shim.ts), Identity-Share Local Verification (Touch ID)

### Community 133 - "Slack Notification Icon"
Cohesion: 0.50
Nodes (5): Slack macOS Notification Icon, Per-Service Notification Identity, Platform-Suffixed Notification Icon Variant (-mac), Slack Octothorpe Brand Mark (white on aubergine), Squircle App-Icon Treatment

### Community 134 - "Teams Notification Icon"
Cohesion: 0.60
Nodes (5): macOS Notification Icon Variant, Microsoft Teams, Goetia Notification Icon Assets, Teams Logo Mark (T tile with person silhouette), Teams macOS Notification Icon

### Community 135 - "TikTok Notification Icon"
Cohesion: 0.70
Nodes (5): TikTok Notification Icon (default/Windows-Linux), TikTok Notification Icon (macOS variant), Platform-suffixed notification icon variant convention, TikTok Logo Mark (renderer SVG), Monochrome white glyph logo style (no brand fill)

### Community 136 - "Hibernation Rules"
Cohesion: 0.50
Nodes (3): HibernationCandidate, shouldHibernate(), base

### Community 138 - "Permission Policy"
Cohesion: 0.70
Nodes (3): CALL_SURFACE_OK, GRANTED, permissionAllowed()

### Community 141 - "Restart E2E Spec"
Cohesion: 0.50
Nodes (3): isShell(), launch(), TWO_ENABLED

### Community 142 - "Reload Guard Rationale"
Cohesion: 0.50
Nodes (4): Why the reload guard cannot trap the user, reloadAllowed reload guard, Settings loses its per-service reload button, views.reload stays unguarded

### Community 143 - "Instagram Notification Icon"
Cohesion: 0.83
Nodes (4): Flat White Camera Glyph on Crimson Squircle, Instagram macOS Notification Icon, Instagram Service Visual Identity, Per-Platform Notification Icon Variant Convention

### Community 144 - "Teams Icon Assets"
Cohesion: 0.67
Nodes (4): Microsoft Teams (service), Notification Icon Asset Set, Teams Logo Mark (T glyph and person silhouette), Teams Notification Icon

### Community 150 - "Loading HTML Page"
Cohesion: 0.83
Nodes (4): loading.html (waking overlay page), Inline critical first-paint CSS in loading.html, loading.html Content-Security-Policy meta, Ember portal SVG (ring arcs, embers, breathing core)

### Community 151 - "Teams Logo SVG"
Cohesion: 0.83
Nodes (4): Microsoft Teams, Monochrome Glyph Mark (white fill, 24x24 viewBox), Service Rail Tile Icon, Microsoft Teams Logo (SVG asset)

### Community 154 - "Banish E2E Spec"
Cohesion: 0.67
Nodes (3): DISABLED, isShell(), launch()

### Community 157 - "Release Notes Preamble"
Cohesion: 0.67
Nodes (3): First-launch gate walkthrough, Installer checksum and attestation verification, Release notes preamble

### Community 158 - "Back Affordance (Reverted)"
Cohesion: 0.67
Nodes (3): backAvailable predicate, firstRunUrl mechanism removal, Service Back Affordance Implementation Plan (reverted)

### Community 159 - "Slack Icon Convention"
Cohesion: 1.00
Nodes (3): Per-Service Notification Icon Asset Convention, Slack Brand Glyph (four-lozenge octothorpe), Slack Notification Icon (slack.png)

### Community 160 - "macOS Template Tray Icon"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

### Community 167 - "Shell Index HTML"
Cohesion: 0.67
Nodes (3): Shell CSP meta policy (index.html), #root mount point + /src/main.tsx module entry, Shell window HTML document (index.html)

### Community 168 - "Instagram Logo SVG"
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
- **353 isolated node(s):** `target`, `module`, `moduleResolution`, `ES2022`, `DOM` (+348 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **64 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

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