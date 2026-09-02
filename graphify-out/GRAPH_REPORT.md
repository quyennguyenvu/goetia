# Graph Report - .  (2026-09-02)

## Corpus Check
- 100 files · ~386,521 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2119 nodes · 3728 edges · 218 communities (155 shown, 63 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 292 edges (avg confidence: 0.83)
- Token cost: 397,902 input · 0 output

## Community Hubs (Navigation)
- Main Wiring & Startup Surface
- Recipe Runner & Types
- Conversation Open Hooks
- Passkey Store & Rules
- Pin Rules & Data Model
- Shell App & Toasts
- Biome Tooling Config
- Identity Provider Policy
- CBOR & WebAuthn Crypto
- Light Sleep & Banner Plans
- Update Checker
- Engineering Guardrails Docs
- Wake & Main State
- Chat-Only Principle & Passkey Plans
- Home Picker & Summon Cap
- App Context & IPC Handlers
- Quiet Hours
- Rail UI Concepts (Light)
- Pinned Band & Tile Reorder
- Service Registry & E2E Specs
- Rail UI Concepts (Dark)
- TypeScript Config
- Surface Activation & Commands
- Preload Bridge & IPC Types
- Service Recipes (Instagram/Teams)
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- Community 179
- Community 180
- Community 181
- Community 182
- Community 183
- Community 184
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 197
- Community 200
- Community 201
- Community 202
- Community 203
- Community 204
- Community 205
- Community 208
- Community 210
- Community 211
- Community 212
- Community 213

## God Nodes (most connected - your core abstractions)
1. `ServiceId` - 134 edges
2. `ServiceViewManager` - 44 edges
3. `Recipe` - 33 edges
4. `AppContext` - 32 edges
5. `Pinned messages design spec (2026-08-25)` - 28 edges
6. `PinStore` - 27 edges
7. `registerIpcHandlers()` - 27 edges
8. `useShell` - 23 edges
9. `PasskeyStore` - 22 edges
10. `startRecipe()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `Board snaps as one when the pin set changes` --rationale_for--> `Welcome()`  [INFERRED]
  docs/superpowers/specs/2026-08-25-pinned-messages-design.md → src/renderer/src/components/Welcome.tsx
- `createTray()` --references--> `Windows Tray Icon (orange ring mark)`  [INFERRED]
  src/main/tray.ts → resources/tray/tray-win.png
- `discord.html fixture (guild badges + dot title)` --references--> `discord`  [INFERRED]
  tests/fixtures/discord.html → src/preload/recipes/discord.ts
- `shopee.html fixture (expanded mini-chat, header badge 31)` --shares_data_with--> `chatHeader()`  [INFERRED]
  tests/fixtures/shopee.html → src/preload/recipes/shopee.ts
- `whatsapp.html fixture (pane-side mount + '(3)' title)` --references--> `whatsapp`  [INFERRED]
  tests/fixtures/whatsapp.html → src/preload/recipes/whatsapp.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Goetia Software Authenticator Ceremony** — docs_superpowers_specs_2026_08_30_goetia_passkeys_design_webauthn_shim, docs_superpowers_specs_2026_08_30_goetia_passkeys_design_passkey_authenticator, docs_superpowers_specs_2026_08_30_goetia_passkeys_design_passkey_store, docs_superpowers_specs_2026_08_30_goetia_passkeys_design_rpid_validation, docs_superpowers_plans_2026_08_30_goetia_passkeys_webauthn_crypto [EXTRACTED 1.00]
- **In-app Social Login Pipeline** — docs_superpowers_specs_2026_08_31_social_login_design_identity_popup, docs_superpowers_specs_2026_08_31_social_login_design_identity_providers, docs_superpowers_specs_2026_09_01_shared_facebook_identity_design_identity_share, docs_superpowers_specs_2026_09_01_shared_facebook_identity_design_fb_app_ids, docs_superpowers_specs_2026_09_01_shared_facebook_identity_design_identity_source, docs_superpowers_specs_2026_09_01_shared_facebook_identity_design_local_user_verification [EXTRACTED 1.00]
- **Chat-only Containment System** — claude_chat_only_principle, claude_chatpaths_containment, docs_superpowers_specs_2026_08_30_logged_out_login_landing_design_loginurl_hook, claude_navigation_containment, docs_superpowers_specs_2026_08_13_microsoft_teams_service_design_hash_aware_chatpaths [EXTRACTED 1.00]
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

## Communities (218 total, 63 thin omitted)

### Community 0 - "Main Wiring & Startup Surface"
Cohesion: 0.10
Nodes (8): Task 5: main wiring (hooks, state, IPC handlers), Decision: capture point is the context menu, StartupSurface, CeremonyInput, ServiceViewManager, ViewHooks, serviceById(), ServiceId

### Community 1 - "Recipe Runner & Types"
Cohesion: 0.11
Nodes (15): startRecipe(), slack, Recipe, harness(), harness(), hashRouted, recipe, harness() (+7 more)

### Community 2 - "Conversation Open Hooks"
Cohesion: 0.11
Nodes (24): Open matches by resolved URL, no-op when already there, WhatsApp conversation()/openConversation() hooks, WhatsApp showed the member list and never jumped, Zalo: openConversation returns a point for a trusted click, nameMatches(), openConversationInPage(), OpenOptions, urlKey() (+16 more)

### Community 3 - "Passkey Store & Rules"
Cohesion: 0.12
Nodes (11): clock(), isB64(), parsePasskeys(), Passkey, passkeyViews(), safeStorageCodec(), KeyCodec, PasskeysFile (+3 more)

### Community 4 - "Pin Rules & Data Model"
Cohesion: 0.16
Nodes (14): Task 2: pure pin rules, Pin data model, BRAND_SEGMENTS, clampText(), conversationFromTitle(), GENERIC_TITLES, isPermutation(), parsePins() (+6 more)

### Community 5 - "Shell App & Toasts"
Cohesion: 0.15
Nodes (17): Task 6: Done/unpin toast in the renderer, Toast hung after Undo then Done, App(), CapTrimToast(), NO_IDS, NO_SERVICES, ContentPlaceholder(), logos (+9 more)

### Community 6 - "Biome Tooling Config"
Cohesion: 0.07
Nodes (27): css, parser, files, includes, formatter, indentStyle, indentWidth, lineWidth (+19 more)

### Community 7 - "Identity Provider Policy"
Cohesion: 0.16
Nodes (17): clientHintHeaders(), hostMatches(), IDENTITY_PROVIDERS, IdentityProvider, identityUrlPatterns(), isIdentityHost(), isIdentityPopup(), parseHttps() (+9 more)

### Community 8 - "CBOR & WebAuthn Crypto"
Cohesion: 0.17
Nodes (17): RFC-8949, CborValue, compareBytes(), concat(), encodeCbor(), head(), attestationObject(), authenticatorData() (+9 more)

### Community 9 - "Light Sleep & Banner Plans"
Cohesion: 0.08
Nodes (27): HomeHero + SummonGauge single layout, MAX_SUMMONED / capBlocked / trimToCap, Home Redesign and Summon Cap Implementation Plan, ctx.noteUnreadReport late-bound hook, peek-rules scheduling helper, Light Sleep Implementation Plan, BANNER_GRACE_MS peek grace, Banner → Exact Conversation Implementation Plan (+19 more)

### Community 10 - "Update Checker"
Cohesion: 0.14
Nodes (9): compareVersions(), isNewer(), parseLatestRelease(), parts(), releaseUrl(), UpdateChecker, UpdateCheckerDeps, harness() (+1 more)

### Community 11 - "Engineering Guardrails Docs"
Cohesion: 0.11
Nodes (25): Contained Window, Goetia Engineering Guardrails, keepRendered Two Mechanisms, Light Sleep Peeks, Navigation Containment (ALLOWED_HOSTS), Pinned Messages (Home Todo List), Shell Chords Win Inside Pages, Ember Portal Branding (+17 more)

### Community 12 - "Wake & Main State"
Cohesion: 0.17
Nodes (7): endsWake(), WakeEnd, defaultRuntime(), MainState, WakingTracker, ServiceRuntime, UpdateState

### Community 13 - "Chat-Only Principle & Passkey Plans"
Cohesion: 0.11
Nodes (23): Chat Only Product Principle, chatPaths Containment, Ad-hoc Signature Consequences, Shopee disabled by default, Entry URL moves off the anti-bot gate, Shopee chat-focus plan, encodeCbor (Canonical CBOR Encoder), Goetia Passkeys Implementation Plan (+15 more)

### Community 14 - "Home Picker & Summon Cap"
Cohesion: 0.13
Nodes (23): buildDisabledPatch, Welcome confirm flow, resolveActivation, Service picker grid, Escape leaves Home, Seeded, staged picker, Settings loses the enable toggle, summonDelta (+15 more)

### Community 15 - "App Context & IPC Handlers"
Cohesion: 0.18
Nodes (11): AppContext, applyDisabledChange(), invokeOrigin(), register(), registerInvoke(), registerIpcHandlers(), senderAllowed(), setServiceMuted() (+3 more)

### Community 16 - "Quiet Hours"
Cohesion: 0.16
Nodes (11): minutesOf(), muteToggleResult(), nextBoundary(), quietNow(), quietWindowFor(), windowStartingOn(), QuietHoursController, QuietHoursSchedule (+3 more)

### Community 17 - "Rail UI Concepts (Light)"
Cohesion: 0.14
Nodes (20): Active Service Highlight, Discord Service, Home Sigil, Icon-Only Minimal Chrome, Instagram Service, Light Theme, Messenger Service, Muted Service Indicator (+12 more)

### Community 18 - "Pinned Band & Tile Reorder"
Cohesion: 0.13
Nodes (10): Task 8: PinnedBand on Home, Decision: focus altar board layout, useTileReorder(), logos, PinnedBand(), PinRow(), RowProps, Props (+2 more)

### Community 19 - "Service Registry & E2E Specs"
Cohesion: 0.15
Nodes (12): Slack Logo SVG (renderer asset), Slack Brand Mark (four-lozenge hash), Monochrome 24x24 Service Glyph Convention, SERVICES, DEFAULT_SETTINGS, isShell(), launch(), isShell() (+4 more)

### Community 20 - "Rail UI Concepts (Dark)"
Cohesion: 0.14
Nodes (19): Active Service Highlight, Amber Monochrome Icon Treatment, Badge Stays Visible While Muted, Dark Theme Rail Styling, Discord, Home Sigil, Instagram, Messenger (+11 more)

### Community 21 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2022, src, tests, vite/client, compilerOptions, jsx (+10 more)

### Community 22 - "Surface Activation & Commands"
Cohesion: 0.25
Nodes (12): activateService(), performBannerAction(), presentSurface(), rememberSurface(), setHomeOpen(), setOverlayOpen(), openSettings(), runShellCommand() (+4 more)

### Community 23 - "Preload Bridge & IPC Types"
Cohesion: 0.21
Nodes (14): WebAuthnBridge, allowed, api, GoetiaApi, invokable, InvokePayload, MainToService, RendererInvoke (+6 more)

### Community 24 - "Service Recipes (Instagram/Teams)"
Cohesion: 0.14
Nodes (6): recipes, instagram, teams, PAGE, rows(), watchRows()

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (18): Single-pass Messenger count(), Permission handler origin check, Runner count() timeout race, Stale-report dedup and no-op setRuntime, TikTok bot-detection risk, data-e2e selector surface, Messages nav-badge count source, Rejected: chat-list scan (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.14
Nodes (5): sameBounds(), ViewBounds, applySubsetOrder(), RailPosition, UpdateStatus

### Community 27 - "Community 27"
Cohesion: 0.20
Nodes (5): accountLabel(), hostOfOrigin(), PasskeyAuthenticator, PasskeyPrompt, toBase64Url()

### Community 28 - "Community 28"
Cohesion: 0.22
Nodes (13): AssertionRequest, base64Field(), CreationRequest, descriptorIds(), parseAssertion(), parseCreation(), parseUserVerification(), resolveRpId() (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.22
Nodes (17): AnyRecord, assertion(), attestation(), b64(), buffer(), credential(), descriptors(), fromJson() (+9 more)

### Community 30 - "Community 30"
Cohesion: 0.14
Nodes (12): dateOf(), PasskeysPane(), close(), DAY_LABELS, DAY_ORDER, isMac, key(), SectionId (+4 more)

### Community 31 - "Community 31"
Cohesion: 0.20
Nodes (13): buildDisabledPatch(), byName(), capBlocked(), commitOrder(), enabledKey(), followLiveOrder(), matchesQuery(), services() (+5 more)

### Community 32 - "Community 32"
Cohesion: 0.15
Nodes (17): Design tokens and reduced-motion kill switch, Agents never commit (plan-wide constraint), Goetia v1 implementation plan, Recipe framework and runner, Single-window shell with a view per service, Service loading screen (waking overlay) plan, startReadyPoll in the service preload, Recipe ready(doc) chat-usable check (+9 more)

### Community 33 - "Community 33"
Cohesion: 0.18
Nodes (17): Announce gate (latest vs announce), The update fetch lives in main, Settings gear update dot, Check for Updates Implementation Plan, Automatic checks fail silently, shouldToast / TOAST_MS, update-check pure version logic, UpdateChecker (+9 more)

### Community 34 - "Community 34"
Cohesion: 0.15
Nodes (17): Goetia App Icon (glowing timer/orbit ring on dark squircle), Arc Gradient A (red #E23D28 to orange #FF7A1F), Arc Gradient B (orange #FF7A1F to yellow #FFD34D), White-Hot Core, Core Radial Gradient (white-hot to ember orange), macOS-style Dark Squircle App Icon Design, Ember Dissolve Trail, Ember Portal v2 Design (+9 more)

### Community 35 - "Community 35"
Cohesion: 0.18
Nodes (11): capture(), isShell(), SURFACES, ALL_SERVICE_IDS, DEMO_PASSKEYS, DEMO_PINS, NINE_UP, settingsFor() (+3 more)

### Community 36 - "Community 36"
Cohesion: 0.14
Nodes (8): BG, LoadingOverlay, LoadingState, api, GoetiaLoadingApi, LoadingState, Window, MainToRenderer

### Community 37 - "Community 37"
Cohesion: 0.27
Nodes (9): deepFreeze(), fillAutoBanish(), fillLastUsedAt(), fillQuietHours(), fillSummonHotkey(), fillZoom(), normalize(), SettingsStore (+1 more)

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (10): discord, startReadyPoll(), visiblyPresent(), telegram, discord.html fixture (guild badges + dot title), Orphan numberBadge exclusion (badge must be nested in lowerBadge), whatsapp.html fixture (pane-side mount + '(3)' title), base (+2 more)

### Community 39 - "Community 39"
Cohesion: 0.16
Nodes (16): Process Boundaries, chromeUserAgent strips Electron tokens, Crash resilience with exponential backoff, Hibernation controller and rules, ServiceViewManager with isolated sessions, Ember-portal loading page, Crash-reload cap survives post-load crashes, Renderer CSP tightening (+8 more)

### Community 40 - "Community 40"
Cohesion: 0.19
Nodes (16): Home board layout, byName, matchesQuery substring filter, moveTo drag index arithmetic, PickTile, Home Board and Service Ordering Plan, ServiceBand, summonOrder append-on-summon (+8 more)

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (13): Task 4: context-menu pin-message item, buildContextMenuTemplate(), ContextMenuInfo, ContextMenuItem, edit(), image(), link(), pin() (+5 more)

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (16): Accepted residual risk, Hardening & remediation design, Electron fuses block, Pure lib/ helper testing strategy, Navigation containment guard, Release supply-chain SHA pinning and provenance, Renderer CSP tightening, Owner threat model (A local malware, B hostile web content, C supply chain) (+8 more)

### Community 43 - "Community 43"
Cohesion: 0.18
Nodes (12): Chords moved to the left hand, Edit > Pin Selection as a second capture door, Chords intercepted in before-input-event, Chord, CODES, FIXED, KeyInput, matches() (+4 more)

### Community 44 - "Community 44"
Cohesion: 0.26
Nodes (11): SeedsFile, cookieSetDetails(), facebookAppId(), FB_APP_IDS, hasFacebookSession(), isFacebookCookieDomain(), isSeedableFacebookDialog(), maySeed() (+3 more)

### Community 45 - "Community 45"
Cohesion: 0.16
Nodes (6): CookieJar, build(), FakeJar, jarFor(), StuckJar, ThrowingJar

### Community 46 - "Community 46"
Cohesion: 0.23
Nodes (3): debugIdentity(), IdentityShare, removalUrl()

### Community 47 - "Community 47"
Cohesion: 0.13
Nodes (15): @biomejs/biome, conf, devDependencies, @biomejs/biome, conf, tailwindcss, typescript, @vitejs/plugin-react (+7 more)

### Community 48 - "Community 48"
Cohesion: 0.17
Nodes (14): IPC Sender Policy, Pinned Messages Implementation Plan (2026-08-26), Plan global constraints, Task 10: docs and final verification, Task 9: end-to-end spec, Task 3: PinStore with pins.json persistence, Task 1: shared types, constants and IPC channels, Dragging a paragraph-length pin broke the board (min-w-0 fix) (+6 more)

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (15): Quick Switcher (dark) screenshot, Dark theme surface, Discord, Instagram, Matches ranked first, other services still listed, Messenger, Cmd+1..9 service accelerators, Quick Switcher overlay (+7 more)

### Community 50 - "Community 50"
Cohesion: 0.16
Nodes (15): Settings (Light Theme) Screenshot, Appearance Pane, Grouped Card Row Layout, Settings Category Sidebar, General Pane, Light Theme, Menu Position Setting, Settings Has No Service Enable Toggle (+7 more)

### Community 51 - "Community 51"
Cohesion: 0.16
Nodes (15): Goetia Welcome Screen (Dark Theme Screenshot), Chat-Only Principle Tagline ("All your chats. Nothing else."), Dark Theme with Ember/Amber Accent, Find a Service Search Field, Hibernation Hint ("Signs in once · idle chats sleep"), Home (Welcome Screen), Home Shortcut Hint (⌘/Ctrl 0 returns you here), Service Board (Summon/Banish Editor) (+7 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (15): Welcome Screen Screenshot (Light Theme), Bell and Gear Controls, Chat Only · No Feeds, No Shops, Home / Welcome Screen, ⌘/Ctrl 0 Returns You Here, Signs In Once · Idle Chats Sleep, Light Theme Palette (Warm Orange Accent), Service Board (Summoned / Unbound) (+7 more)

### Community 53 - "Community 53"
Cohesion: 0.17
Nodes (8): unreadFromTitle(), countWhatsAppChats(), openWhatsAppConversation(), WhatsAppChat, whatsAppConversation(), Discord bullet-prefixed title as indirect-unread signal, Title-parsed count as IndexedDB fallback (no page IDB under test), PAGE

### Community 54 - "Community 54"
Cohesion: 0.15
Nodes (14): Notification & Mute Rules, facebookAppId Param-Pollution Refusal, Display-Media Confirm Fallback, IPC Handler Crash-Proofing, Security & Performance Hardening Plan (2026-09-02 Audit), sanitizeBanner, IDENTITY_PROVIDERS Table, ROAMING_HOSTS (+6 more)

### Community 55 - "Community 55"
Cohesion: 0.18
Nodes (14): Quick Switcher (light theme) screenshot, Per-service accelerator hints (⌘1…⌘9), Discord, Instagram, Light theme palette, Messenger, Substring query filter ("s"), Quick Switcher overlay (+6 more)

### Community 56 - "Community 56"
Cohesion: 0.18
Nodes (14): Settings (Dark Theme) Screenshot, Appearance Section, Dark Theme, General Section, Menu Position Setting, Settings Has No Service Enable Toggle, Notifications Section, Shell Overlay Surface (+6 more)

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (14): Typed IPC contract, Notification pipeline and shouldNotify, Build-time tile rasteriser, Assets shipped outside the asar, resolveIcons: paths resolved once at startup, NativeImage fallback if a path icon is ignored, Notification service icons plan, NotificationRouter icon and title wiring (+6 more)

### Community 58 - "Community 58"
Cohesion: 0.21
Nodes (14): MainState snapshot and broadcast pipeline, Quick switcher, fuzzyScore and app menu accelerators, SettingsStore over conf, connectShell returns its unsubscribe, Hung count() released by a timeout race, Single-pass Messenger unread detection, Reliability and performance remediation plan, Readiness poll attempt cap (+6 more)

### Community 59 - "Community 59"
Cohesion: 0.21
Nodes (14): LoadingOverlay WebContentsView, docs/media/banner.svg, capture-media.mjs capture driver, Capture matrix (SHOTS), Screenshots show Goetia's own chrome only, docs/DEVELOPING.md split, MD033 inline-HTML allowlist, README Showcase Implementation Plan (+6 more)

### Community 60 - "Community 60"
Cohesion: 0.19
Nodes (14): views.activate show option, activateService clears homeOpen, anyOverlayOpen, Buried Settings modal bug, Home accelerator (CmdOrCtrl+0), home:setOpen channel, homeOpen shell surface, Overlay invariant: no view visible over a shell surface (+6 more)

### Community 61 - "Community 61"
Cohesion: 0.16
Nodes (14): Pinned messages design spec (2026-08-25), Decision: acknowledgement is a tally pill beside the Home sigil, Cap is visible: item disabled at 50, never a silent shift, Conversation label from document.title, Decision: the dashboard is a section on Home, PinStore refuses duplicate pins, View > Toggle Developer Tools (detached), Board snaps as one when the pin set changes (+6 more)

### Community 63 - "Community 63"
Cohesion: 0.20
Nodes (9): chatHeader(), shopee, shopee-collapsed.html fixture (collapsed pill badge 5), Collapsed pill as keep-alive click target (single wrapper child = not ready), shopee.html fixture (expanded mini-chat, header badge 31), Shopee mini-chat expanded state (wrapper has header + body children), zalo-dormant.html fixture (idle-deactivation activation modal), Zalo idle-deactivation (app unmounted behind 'Kích hoạt' modal, counts freeze) (+1 more)

### Community 64 - "Community 64"
Cohesion: 0.29
Nodes (9): logos, QuickSwitcher(), msUntilLabelChange(), nextLabelChange(), relativeTime(), switcherRows(), SwitcherService, ActivityEntryView (+1 more)

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (13): Badge aggregation across dock, overlay and rail, E2E smoke test and packaging targets, Tray, close-to-tray and autostart, Arch-suffixed dmg artifact names, Release workflow implementation plan, publish: null plus --publish never, Two-phase build matrix and release job, Tag-matches-package.json guard (+5 more)

### Community 66 - "Community 66"
Cohesion: 0.24
Nodes (13): buildDisabledPatch, Welcome visibility is derived, not a flag, Welcome Screen Implementation Plan, Portal (shared ember-portal component), Welcome component, summonDelta / summonLabel, Three non-overlapping selling-point cards, Dispel button (+5 more)

### Community 67 - "Community 67"
Cohesion: 0.28
Nodes (13): resolveActivation, anyOverlayOpen predicate, Composition lives on Home, not Settings, homeOpen shell surface, Home Screen and Service Composition Plan, Rail home sigil and the ⌘/Ctrl 0 accelerator, activate(id, { show: false }) — resolve without revealing, Settings.lastActiveId + lastHomeOpen (+5 more)

### Community 68 - "Community 68"
Cohesion: 0.18
Nodes (13): capBlocked picker rule, Discard replaces Dispel, HomeHero fixed left column, MAX_SUMMONED cap of 9, SummonGauge ring, trimToCap and normalize() enforcement, followLiveOrder (clean board follows silently), homeDirty / discardHomeDraft store fields (+5 more)

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (11): Goetia, Windows Tray Icon (orange ring mark), Goetia Windows Tray Icon, macOS Template Image Convention (monochrome icon auto-tinted by menu bar theme), macOS Tray Template Icon @2x (monochrome ring-and-dot glyph, Retina), macOS Tray Template Icon, macOS Template Image Convention, Goetia macOS Template Tray Icon (+3 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (13): scripts, build, dev, e2e, icons, lint, media, package:mac (+5 more)

### Community 71 - "Community 71"
Cohesion: 0.19
Nodes (7): logos, Props, logos, PickTile(), Props, Props, ServiceMeta

### Community 72 - "Community 72"
Cohesion: 0.23
Nodes (12): Slack logo and notification icons, Graphite minimal design system, Notification router, Unisolated per-service preload, We do not own the banner layout, Brand-colour tile notification icon, build-notification-icons.mjs, extraResources over asarUnpack (+4 more)

### Community 73 - "Community 73"
Cohesion: 0.18
Nodes (12): Chat ONLY principle (post-ship), chatPaths containment, The catalog ships in name order, normalize() catalog-position slotting, chatPaths: ['/direct'], Instagram chat service, pointer-events inerting of off-chat links, Instagram DM Inbox Fixture (+4 more)

### Community 74 - "Community 74"
Cohesion: 0.27
Nodes (12): Telegram Notification Icon (blue rounded-square badge, white circle, paper-plane glyph, full bleed), Telegram macOS Notification Icon (blue squircle, white circle, paper-plane glyph, inset padding), macOS Notification Icon Variant Convention (-mac suffix pairs), Per-Service Notification Icon Asset Set, Brand-Color Squircle Icon Design Language, WhatsApp Notification Icon (green rounded-square badge, white speech-bubble handset glyph, full bleed), WhatsApp macOS Notification Icon (green squircle, white speech-bubble handset glyph, inset padding), Zalo Notification Icon (blue rounded-square badge, white 'Zalo' wordmark, full bleed) (+4 more)

### Community 75 - "Community 75"
Cohesion: 0.24
Nodes (8): DEBUG_PEEKS, e2eUpdate, userDataArg, ask(), biometric(), electronPrompt(), hasTouchId(), identitySharePrompt()

### Community 76 - "Community 76"
Cohesion: 0.23
Nodes (7): collect(), glyph(), textWithEmoji(), messenger, messenger.html fixture (chat-row unread oracle), Emoji delivered as <img alt> inside the row preview, messenger-reaction.html fixture (synthesized reaction notification)

### Community 77 - "Community 77"
Cohesion: 0.33
Nodes (7): conversationFromRows(), countUnreadRows(), isUnreadRow(), rowTexts(), synthFromRows(), watchRows(), Counts

### Community 78 - "Community 78"
Cohesion: 0.29
Nodes (11): Badge shot seeds neverHibernate false, Catalog sorted by display name, Badge aggregator, Electron as the desktop shell, Hibernation controller, Per-service unread recipes, Per-service persist: session isolation, Goetia Chat Client Design Spec (+3 more)

### Community 79 - "Community 79"
Cohesion: 0.18
Nodes (11): Portal.tsx, Startup zero-view guard, Welcome.tsx, Welcome is derived, not flagged, Three tip cards that sell three things, Board layout (header / bands / pinned footer), Board sizing rules, The rail overflows before Home does (+3 more)

### Community 80 - "Community 80"
Cohesion: 0.18
Nodes (11): buildContextMenuTemplate, Service-view native context menu, Open Link in Browser hand-off, Add to Dictionary is per service, isBlankCallPopup (about:blank popups), call-policy.ts (CALL_POPUPS / CALL_ORIGINS / isCallPopup), Call URL adoption into a hardened call window, setDisplayMediaRequestHandler with the system picker (+3 more)

### Community 81 - "Community 81"
Cohesion: 0.22
Nodes (11): Stale-banner disabled guard, Light Sleep (peek while hibernated), neverHibernate default flips to false, Peek lifecycle and noteUnreadReport, peek-rules.ts scheduling, BANNER_GRACE_MS (the Light Sleep interaction), Auto-banish unused services, shouldBanish (banish-rules.ts) (+3 more)

### Community 82 - "Community 82"
Cohesion: 0.20
Nodes (3): Five shell-only pins:* channels and ShellState.pins, ShellStore, ShellState

### Community 83 - "Community 83"
Cohesion: 0.45
Nodes (7): audioMuted(), clip(), notificationTitle(), sanitizeBanner(), shouldNotify(), soundOptions(), NotificationRouter

### Community 85 - "Community 85"
Cohesion: 0.29
Nodes (10): Pins Board Dark Theme Screenshot, Conversation Label per Pin (#release, Minh Anh, Nhóm Sale, #tabletop), Dark Theme Rendering of Home Pins Board, Dimmed Pin Row for Banished Service, Drag-Handle Reordering of Pins, Pin 0 In-Progress Slot (highlighted top pin with Done button), Per-Pin Notes (add a note placeholder, 'review by Thu' filled note), Pin Row Layout (drag handle, service icon, conversation label, message text, note, done check, unpin x) (+2 more)

### Community 86 - "Community 86"
Cohesion: 0.22
Nodes (10): Single badge-label formatter, Per-service notification rate limit, TikTok synthNotification, Timer-driven dismissal under reduced motion, Self-dismissing UpdateToast, Capture determinism via reduced motion, scripts/capture-media.mjs, Screenshots show only Goetia's own chrome (+2 more)

### Community 87 - "Community 87"
Cohesion: 0.24
Nodes (3): Decision: Architecture A, a dedicated PinStore in main, ActivityEntry, ActivityLog

### Community 88 - "Community 88"
Cohesion: 0.27
Nodes (6): Verification, codec, createOptions(), input(), registered(), setup()

### Community 90 - "Community 90"
Cohesion: 0.24
Nodes (5): installNotificationShim(), NotificationShimHandle, NotifyForward, arg, serviceId

### Community 91 - "Community 91"
Cohesion: 0.20
Nodes (3): Bridge, createResult, getResult

### Community 92 - "Community 92"
Cohesion: 0.36
Nodes (9): Accessible SVG Labeling (role=img, aria-label, title), Goetia Banner (1200x300 SVG), Ember Gradient Palette (arcA, arcB, core, word), Ember Portal Mark, Tagline: Summon every chat to one window, nothing but the chat, Theme-Resilient SVG Fallback, Goetia Wordmark, App Icon SVG (resources/icon.svg) (+1 more)

### Community 93 - "Community 93"
Cohesion: 0.28
Nodes (9): Dead-Entry Warning (forgetting locally leaves a stale credential on the site's own security page), Forget Passkey Action, Four Most-Recently-Used Accounts Cap per Site, Passkey List Row (rpId · username, via service, created/last-used dates, Forget button), Passkeys Keyed by rpId with Originating Service Attribution (via Messenger/Slack/TikTok), Passkeys Settings Screenshot (Dark Theme), Settings Modal Sidebar Navigation (General, Appearance, Services, Passkeys, Notifications, Shortcuts, Updates), Settings → Passkeys Panel (+1 more)

### Community 94 - "Community 94"
Cohesion: 0.31
Nodes (9): Dead-Entry Warning: Forgetting Locally Leaves Stale Entry on Site Security Page, Forget Button (Per-Passkey Removal), Four Most Recently Used Accounts Offered Per Site, Light Theme Rendering of Settings UI, Passkey Row (rpId, Account, Origin Service, Created/Last-Used Dates), Settings Passkeys Pane, Passkeys Listed by rpId with Originating Service Attribution, Passkeys Settings Screenshot (Light Theme) (+1 more)

### Community 95 - "Community 95"
Cohesion: 0.31
Nodes (9): Pins Board Screenshot (Light Theme), Dimmed Pin for Banished Service, Drag-Handle Reordering of Pins, Per-Pin Note Affordance (add a note / review by Thu), Pin Row Anatomy (Drag Handle, Service Icon, Conversation Label, Text, Note, Done, Unpin), Pin Count Tally (PINNED · 4), Pin 0 In-Progress Emphasis, Pinned Messages Board on Home (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.31
Nodes (9): Fresh installs start all-disabled, Tasks 1–3 are one atomic change, Slack Service Implementation Plan, tests/fixtures/slack.html count oracle, ALLOWED_HOSTS slack entry, slack recipe, Slack service catalog entry, Selectors uncalibrated until a live login pass (+1 more)

### Community 97 - "Community 97"
Cohesion: 0.22
Nodes (9): Announce gate, Settings.lastNotifiedVersion, shouldToast, Settings.lastActiveId, Settings.lastHomeOpen, Persist the surface on change, into Settings, resolveStartupSurface, StartupSurface (+1 more)

### Community 98 - "Community 98"
Cohesion: 0.25
Nodes (9): Drag-to-reorder on Home, moveTo, applySubsetOrder, macOS copy-cursor badge defect, Draft order, committed once on drag end, What the drag looks like, Pointer drag makes the reorder path e2e-testable, Reorder.Group / pointer-driven reorder (+1 more)

### Community 99 - "Community 99"
Cohesion: 0.28
Nodes (7): firstRunUrl and lib/start-url.ts (superseded), Slack chat-only CSS, Slack ALLOWED_HOSTS entry, Slack service (ninth service), back-affordance.ts off-chat predicate (removed), No back affordance — reload is the only way back, Slack logged-out flow stays on app.slack.com

### Community 100 - "Community 100"
Cohesion: 0.22
Nodes (8): description, main, name, packageManager, private, productName, type, version

### Community 101 - "Community 101"
Cohesion: 0.36
Nodes (9): Brand squircle notification icon system (128x128 RGBA, white glyph on brand fill), Discord notification icon (full-bleed), Discord notification icon (macOS inset variant), macOS `-mac` inset icon variant convention, Messenger notification icon (full-bleed), Messenger notification icon (macOS inset variant), Shopee notification icon (full-bleed), Shopee notification icon (macOS inset variant) (+1 more)

### Community 102 - "Community 102"
Cohesion: 0.31
Nodes (4): aggregateBadges(), BadgeEntry, badgeLabel(), BadgeSummary

### Community 103 - "Community 103"
Cohesion: 0.42
Nodes (6): PurgeConfirm(), purgeToastMessage(), PurgeRequest, purgeAllCopy(), PurgeCopy, purgeLoginCopy()

### Community 104 - "Community 104"
Cohesion: 0.28
Nodes (5): drag(), isShell(), launch(), stableBox(), TWO_ENABLED

### Community 105 - "Community 105"
Cohesion: 0.32
Nodes (8): Electron Fuses & Entitlements, Signing prerequisites and cost, Designated requirement stability explains the keychain prompt, Turning the cookie-encryption fuse off is not an option, Open question: fuse flipping vs signing order, One-time migration cost of switching identities, Code signing and notarization (parked), Electron fuses in electron-builder.yml

### Community 106 - "Community 106"
Cohesion: 0.32
Nodes (8): Dark Theme Palette, Light Sleep Wake / Hibernation Rehydration, Naming the Service Being Woken, Waking Overlay Screenshot (Dark Theme), Goetia Sigil Spinner, Waking Cover Overlay, "Waking <Service>..." Status Label, Zalo Service (subject of the wake)

### Community 107 - "Community 107"
Cohesion: 0.39
Nodes (8): Waking Overlay Screenshot (Light Theme), Light Sleep Hibernation, Light Theme Surface, Non-Blocking Wake Feedback, Orbital Ring Sigil Spinner, Waking Cover, "Waking <Service>..." Status Label, Zalo Service

### Community 108 - "Community 108"
Cohesion: 0.29
Nodes (8): External URL scheme allowlist, IPC sender/origin validation, Rail gear dot, releaseUrl, shouldAutoRecheck, updatePending, updates:check channel, updates:openDownload channel

### Community 109 - "Community 109"
Cohesion: 0.32
Nodes (8): Banner → exact conversation, Lane A — replay the page's own click, Lane B — synthetic banners carry an href, resolveBannerClick decision table, ActivityLog (in-memory banner ring buffer), Quick-switcher Recent section, confirmPurgeAll (Home-wide sweep), purgeService shared unit

### Community 110 - "Community 110"
Cohesion: 0.32
Nodes (6): comboLabel(), MAC_GLYPHS, MAC_ORDER, SUMMON_COMBOS, WIN_NAMES, WIN_ORDER

### Community 111 - "Community 111"
Cohesion: 0.33
Nodes (7): Build provenance attestation step, Build job (mac arm64/x64 + win matrix), SHA256SUMS.txt generation, CSC_IDENTITY_AUTO_DISCOVERY disabled (no signing material), Publish release job, Tag must match package.json version, Release workflow (tag-triggered)

### Community 112 - "Community 112"
Cohesion: 0.38
Nodes (4): Task 7: rail pin tally and pulse, NO_PINS, PinIcon(), Rail()

### Community 113 - "Community 113"
Cohesion: 0.33
Nodes (7): Overlay above a still-visible view, Recipe CSS gated on the expanded state, Homepage entry URL, never /webchat, keepAlive trusted click on the collapsed pill, No network filtering, Unread from host textContent, Shopee Chat Focus Design

### Community 114 - "Community 114"
Cohesion: 0.33
Nodes (7): Per-field settings normalize coercion, compareVersions, isNewer, parseLatestRelease, lib/update-check.ts pure layer, normalize() leaves lastActiveId intact, An unrestorable record opens Home, a missing one does not

### Community 115 - "Community 115"
Cohesion: 0.33
Nodes (7): QuietHoursController and the shared side-effects tail, Quiet hours (scheduled global mute), quiet-hours-rules.ts, quietOverrideWindowStart (the macOS DND rule), SUMMON_COMBOS curated list, Summon hotkey (global shortcut), summonHotkeyOk (no silent failure)

### Community 116 - "Community 116"
Cohesion: 0.33
Nodes (7): Per-service sign out (local partition wipe), service:tileMenu channel, --danger color token, Login purge (rename of sign out), Purge and banish are orthogonal axes, Sign-out moves to Settings → Services, Banish on the tile menu

### Community 117 - "Community 117"
Cohesion: 0.38
Nodes (5): Jump reuses the recents path verbatim, BannerClickAction, conversationUrl(), resolveBannerClick(), base

### Community 118 - "Community 118"
Cohesion: 0.33
Nodes (5): LOGO_DIR, OUT_DIR, placeGlyph(), ROOT, tileSvg()

### Community 119 - "Community 119"
Cohesion: 0.48
Nodes (5): CALL_ORIGINS, CALL_POPUPS, CallPopupRule, isBlankCallPopup(), isCallPopup()

### Community 120 - "Community 120"
Cohesion: 0.43
Nodes (5): CredentialJson, isService(), isShell(), launch(), makeProfile()

### Community 121 - "Community 121"
Cohesion: 0.40
Nodes (6): Purge and Banish Orthogonality, PasskeyAuthenticator (Ceremony Owner), PasskeyStore (passkeys.json), UV Set on Accepted Confirm, WebAuthn Shim (webauthn-shim.ts), Identity-Share Local Verification (Touch ID)

### Community 122 - "Community 122"
Cohesion: 0.33
Nodes (6): buildContextMenuTemplate pure builder, Service-View Context Menu Implementation Plan, call-policy (CALL_POPUPS, CALL_ORIGINS, isCallPopup), setDisplayMediaRequestHandler with useSystemPicker, Calls and Screen Share Implementation Plan, Mic/camera usage descriptions in extendInfo

### Community 123 - "Community 123"
Cohesion: 0.33
Nodes (5): SeededSettings, ServiceId, Shot, Surface, Theme

### Community 124 - "Community 124"
Cohesion: 0.60
Nodes (5): die(), run(), release.sh script, skip(), step()

### Community 125 - "Community 125"
Cohesion: 0.53
Nodes (3): iconFileName(), resolveIcons(), ICON_DIR

### Community 126 - "Community 126"
Cohesion: 0.53
Nodes (3): PeekCandidate, peekInterval(), pickPeek()

### Community 129 - "Community 129"
Cohesion: 0.53
Nodes (4): isService(), isShell(), launch(), makeProfile()

### Community 130 - "Community 130"
Cohesion: 0.40
Nodes (5): Reload Guard Implementation Plan, reload-guard predicate (RELOAD_MIN_INTERVAL_MS), QuietHoursController one-timer boundary, Quiet Hours Implementation Plan, quiet-hours-rules (quietWindowFor, quietNow, nextBoundary, muteToggleResult)

### Community 131 - "Community 131"
Cohesion: 0.50
Nodes (5): Slack macOS Notification Icon, Per-Service Notification Identity, Platform-Suffixed Notification Icon Variant (-mac), Slack Octothorpe Brand Mark (white on aubergine), Squircle App-Icon Treatment

### Community 132 - "Community 132"
Cohesion: 0.60
Nodes (5): macOS Notification Icon Variant, Microsoft Teams, Goetia Notification Icon Assets, Teams Logo Mark (T tile with person silhouette), Teams macOS Notification Icon

### Community 133 - "Community 133"
Cohesion: 0.70
Nodes (5): TikTok Notification Icon (default/Windows-Linux), TikTok Notification Icon (macOS variant), Platform-suffixed notification icon variant convention, TikTok Logo Mark (renderer SVG), Monochrome white glyph logo style (no brand fill)

### Community 134 - "Community 134"
Cohesion: 0.50
Nodes (3): BanishCandidate, shouldBanish(), base

### Community 136 - "Community 136"
Cohesion: 0.50
Nodes (3): HibernationCandidate, shouldHibernate(), base

### Community 138 - "Community 138"
Cohesion: 0.70
Nodes (3): CALL_SURFACE_OK, GRANTED, permissionAllowed()

### Community 141 - "Community 141"
Cohesion: 0.50
Nodes (3): isShell(), launch(), TWO_ENABLED

### Community 142 - "Community 142"
Cohesion: 0.50
Nodes (4): Why the reload guard cannot trap the user, reloadAllowed reload guard, Settings loses its per-service reload button, views.reload stays unguarded

### Community 143 - "Community 143"
Cohesion: 0.83
Nodes (4): Flat White Camera Glyph on Crimson Squircle, Instagram macOS Notification Icon, Instagram Service Visual Identity, Per-Platform Notification Icon Variant Convention

### Community 144 - "Community 144"
Cohesion: 0.67
Nodes (4): Microsoft Teams (service), Notification Icon Asset Set, Teams Logo Mark (T glyph and person silhouette), Teams Notification Icon

### Community 150 - "Community 150"
Cohesion: 0.83
Nodes (4): loading.html (waking overlay page), Inline critical first-paint CSS in loading.html, loading.html Content-Security-Policy meta, Ember portal SVG (ring arcs, embers, breathing core)

### Community 151 - "Community 151"
Cohesion: 0.83
Nodes (4): Microsoft Teams, Monochrome Glyph Mark (white fill, 24x24 viewBox), Service Rail Tile Icon, Microsoft Teams Logo (SVG asset)

### Community 154 - "Community 154"
Cohesion: 0.67
Nodes (3): DISABLED, isShell(), launch()

### Community 157 - "Community 157"
Cohesion: 0.67
Nodes (3): First-launch gate walkthrough, Installer checksum and attestation verification, Release notes preamble

### Community 158 - "Community 158"
Cohesion: 0.67
Nodes (3): backAvailable predicate, firstRunUrl mechanism removal, Service Back Affordance Implementation Plan (reverted)

### Community 159 - "Community 159"
Cohesion: 1.00
Nodes (3): Per-Service Notification Icon Asset Convention, Slack Brand Glyph (four-lozenge octothorpe), Slack Notification Icon (slack.png)

### Community 160 - "Community 160"
Cohesion: 0.67
Nodes (3): Ember Portal Mono Design Motif, macOS Template Image Convention (Black + Alpha), Goetia Tray Icon (macOS Template)

### Community 166 - "Community 166"
Cohesion: 0.67
Nodes (3): Shell CSP meta policy (index.html), #root mount point + /src/main.tsx module entry, Shell window HTML document (index.html)

### Community 167 - "Community 167"
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
- **341 isolated node(s):** `target`, `module`, `moduleResolution`, `ES2022`, `DOM` (+336 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

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