import type { Participant, CurrentUser, Thread } from '@textshq/platform-sdk'
import { orderBy } from 'lodash'

const TWITTER_EPOCH = 1288834974657

export const SlackBootData = {
  user_id: 'U01HZEYCMPH',
  team_id: 'T01JSSU9V4H',
  api_token: 'xoxs-1638912335153-1611508429799-1834520136723-ec1bae8849b040228d766730fdc4a76cf94fc7151238e91809e177f0aad911ee',
  feature_builder_manage_many_workflows: true,
  feature_builder_question_type_date: false,
  feature_jsf_1619: true,
  feature_half_booted_visuals: false,
  feature_builder_multistep_collaborators_modal: true,
  feature_builder_message_button_helper_text: true,
  feature_builder_extensions: true,
  feature_builder_extension_steps_pref: true,
  feature_apps_can_submit_with_workflow_steps: true,
  feature_builder_unique_trigger_id_output: false,
  feature_builder_feedback_button: false,
  feature_builder_message_step_rich_text: true,
  feature_chime_access_check: false,
  feature_app_views_v1: true,
  feature_audit_logs_view: false,
  feature_audit_logs_view_workspace: false,
  feature_data_location_new_translations: false,
  feature_accessible_selects: true,
  feature_select_on_tab: true,
  feature_pronouns_in_profile: false,
  feature_builder_disable_global_triggers: true,
  feature_workflow_builder_enabled_org_setting: true,
  feature_builder_can_access: true,
  feature_always_show_archive_channel_option: true,
  feature_org_dashboard_gantry_access: false,
  feature_org_dash_gantry_redirect: false,
  feature_org_dashboard_gantry_teams_migration: false,
  feature_info_barriers: true,
  feature_day2_share_modal: true,
  feature_granular_dnd: false,
  feature_lock_thread_translations: false,
  feature_informative_announce_only_footer_translations: false,
  feature_context_bar_tz_issues: false,
  feature_newxp_5109: true,
  feature_newxp_3848: true,
  feature_day1_convo: true,
  feature_day1_channel_examples: true,
  feature_copy_joiner_flow: true,
  feature_tinyspeck: false,
  feature_qr_code_invite: false,
  feature_connect_dm_early_access: true,
  feature_disconnect_lightweight_dm: true,
  feature_end_dm: true,
  feature_scdm_ssb_redirect: true,
  feature_couple_user_hub_v1_to_scdm_send: true,
  feature_scdm_early_access_form: true,
  feature_scdm_compose_entry_point: true,
  feature_scdm_email_classification: true,
  feature_scdm_education: false,
  feature_scdm_email_modal_i18n: true,
  feature_scdm_compose_copy_paste_email: false,
  feature_olug_esc_channels_work: true,
  feature_olug_remove_required_workspace_setting: false,
  feature_data_table_in_org_level_user_groups: false,
  feature_org_members_m11n: false,
  feature_org_members_details_m11n: false,
  feature_org_settings_m11n: false,
  feature_deprecate_get_member_by_name: false,
  feature_unknown_messages: true,
  feature_add_message_perf: false,
  feature_fix_custom_emoji_errors: true,
  feature_modern_delete_file: true,
  feature_copy_channel_link: true,
  feature_collapse_reactions: false,
  feature_full_profile_link: true,
  feature_print_pdf: false,
  feature_safari10_deprecation: true,
  feature_safari10_deprecation_modal: true,
  feature_safari10_deprecation_block: true,
  feature_desktop460_deprecation: false,
  feature_desktop460_deprecation_block: false,
  feature_email_workflow: false,
  feature_wider_reaction_tip: false,
  feature_file_picker_search_i18n: false,
  feature_show_replies_immediately: true,
  feature_composer_email_classification: false,
  feature_amazon_a11y_custom_status_emoji: true,
  feature_amazon_a11y_activity_labels: true,
  feature_file_threads: true,
  feature_broadcast_indicator: true,
  feature_new_replies_after_bcast: true,
  feature_sonic_emoji: true,
  feature_emoji_12: false,
  feature_email_ingestion: false,
  feature_attachments_inline: false,
  feature_aaa_admin_apis: true,
  feature_remove_actions_from_sidebar: false,
  feature_shortcuts_v2_education: true,
  feature_pad_1534: false,
  feature_app_launcher_search_pagination: false,
  feature_channel_sidebar_drafts_section: true,
  feature_navigate_history: true,
  feature_compose_flow: true,
  feature_compose_flow_xws: true,
  feature_faster_count_all_unreads: true,
  feature_channel_selector_for_team_guests_update: true,
  feature_sk_data_table_pinned_rows_and_columns: false,
  feature_desktop_symptom_events: false,
  feature_data_residency_debugging: false,
  feature_new_subteam_linked_channel_limit: true,
  feature_subteam_user_limit: true,
  feature_ent_admin_approved_apps_v2: true,
  feature_dashboard_sortable_lists: false,
  feature_sk_loading_button_motions: true,
  feature_sk_base_icon: true,
  feature_sk_required_arialabel: false,
  feature_ce_eng_privacy_form_translation: true,
  feature_ce_eng_search_demo: false,
  feature_ce_eng_help_vitess: false,
  feature_trials_contact_topic: true,
  feature_trials_contact_topic_from_app: true,
  feature_app_dir_phoenix: false,
  feature_do_app_verification_exceedingly: true,
  feature_condition_block: false,
  feature_shared_channel_bot_tokens: false,
  feature_shared_channels_multi_org_mpim: true,
  feature_shared_channels_multi_org_mpim_fe: true,
  feature_chat_mpim_open_refactor_fe_copy: true,
  feature_find_an_admin_disconnect_explainer: false,
  feature_shared_channels_multi_org_invites_be: true,
  feature_shared_channels_multi_org_qa_limit_override: false,
  feature_mwsc_creation: false,
  feature_multi_workspace_shared_channels_be: false,
  feature_mwsc_pending_invites: true,
  feature_mwsc_list_shared_invites: true,
  feature_mwsc_listExternal_endpoint: true,
  feature_mwsc_connected_orgs: false,
  feature_mwsc_flannel_callbacks_refactor: true,
  feature_esc_to_mwsc_admin: false,
  feature_mwsc_migrations: false,
  feature_revoke_esc_invites_fe: true,
  feature_mwsc_esc_to_xws: false,
  feature_mwsc_disconnect: true,
  feature_mwsc_reconnect: false,
  feature_mwsc_org_apps: true,
  feature_enterprise_channels_team_ids_new_cache_key: true,
  feature_remove_double_rings: false,
  feature_remove_double_diamonds: false,
  feature_channels_view_in_msc: false,
  feature_shared_channels_emoji_delight: true,
  feature_gdpr_user_join_tos: true,
  feature_user_invite_tos_april_2018: true,
  feature_fetch_team_users_csv_export_job: true,
  feature_roles_are_fresh_phase_1: false,
  feature_roles_admin_role: false,
  feature_users_admin_role: false,
  feature_roles_ga_ready: false,
  feature_users_admin_role_workspace: false,
  feature_channel_mgmt_message_count: false,
  feature_admin_conversations_search_cursormarks: false,
  feature_user_prefs_fanout: true,
  feature_team_site_deactivate: false,
  feature_ui_generator_updates: false,
  feature_spacesuit_revamp: false,
  feature_neue_type: false,
  feature_cust_acq_i18n_tweaks: false,
  feature_exp_downloads_refresh: false,
  feature_exp_bold_prospect_hp: false,
  feature_exp_native_app_hp: false,
  feature_proj_solutions_it_updates: false,
  feature_whitelist_zendesk_chat_widget: false,
  feature_commendations_spy: true,
  feature_use_imgproxy_resizing: true,
  feature_share_mention_comment_cleanup: false,
  feature_boards_in_dev: false,
  feature_disable_bk_in_thread: true,
  feature_new_locale_toast: true,
  feature_channel_exports: false,
  feature_docs_mentions_and_channels: false,
  feature_flag_message_m2: false,
  feature_calls_survey_request_response: true,
  feature_token_ip_whitelist: true,
  feature_sidebar_theme_undo: true,
  feature_allow_intra_word_formatting: true,
  feature_i18n_channels_validate_emoji: true,
  feature_fw_eng_normalization: true,
  feature_slim_scrollbar: false,
  feature_primary_search: false,
  feature_file_browser_v2: false,
  feature_react_messages: true,
  feature_edge_upload_proxy_check: true,
  feature_unread_counts_delay: true,
  feature_legacy_file_upload_analytics: true,
  feature_mpdm_limit_channel_creation: false,
  feature_snippet_modes_i18n: false,
  feature_ekm_message_revocation_polling_test: false,
  feature_team_admins_list_api: true,
  feature_ms_latest: true,
  feature_guests_use_entitlements: true,
  feature_rooms_join_api: true,
  feature_rooms_join_url: false,
  feature_calls_sip_integration_labels: false,
  feature_tasks_v1_copy: false,
  feature_custom_status_calendar_sync_copy: true,
  feature_custom_status_calendar_sync: true,
  feature_mask_undocumented_errors: true,
  feature_app_actions_admin_pages: true,
  feature_app_views_reminders: true,
  feature_reminders_org_shard: true,
  feature_reminders_grid_migrations_org_shard: true,
  feature_blocks_reminders_list: false,
  feature_share_message_via_message_blocks: false,
  feature_message_blocks: false,
  feature_silence_app_dms: false,
  feature_set_tz_automatically: true,
  feature_confirm_clear_all_unreads_pref: true,
  feature_block_mounts: true,
  feature_attachments_v2: true,
  feature_group_block: false,
  feature_show_block_kit_in_share_dialogs: false,
  feature_block_kit_user_block: false,
  feature_block_kit_table: false,
  feature_password_element: true,
  feature_header_block: true,
  feature_input_blocks_in_messages: false,
  feature_multiselects_in_actions_block: false,
  feature_domain_verification: false,
  feature_block_kit_range_datepicker: false,
  feature_delete_app_homes_associated_with_deleted_service: false,
  feature_soft_delete_app_homes_on_user_deactivation: false,
  feature_block_kit_timepicker: true,
  feature_block_kit_timepicker_remind: true,
  feature_block_kit_datepicker_input: true,
  feature_block_kit_remount_on_update: true,
  feature_add_app_home_team_name: true,
  feature_beacon_js_errors: false,
  feature_beacon_js_admin_errors: false,
  feature_user_app_disable_speed_bump: true,
  feature_tractor_shared_invite_link: true,
  feature_newxp_2119: true,
  feature_tractor_backup_channelname_copy: true,
  feature_degraded_rtm_always_fails: false,
  feature_apps_manage_permissions_scope_changes: true,
  feature_reminder_cross_workspace: true,
  feature_p2p: false,
  feature_new_reactions: true,
  feature_pages_example: false,
  feature_sonic_video_placeholder: true,
  feature_iap1: false,
  feature_ia_ga: true,
  feature_ia_debug_off: false,
  feature_ia_i18n: true,
  feature_ia_themes: true,
  feature_ia_member_profile: true,
  feature_workspace_scim_management: false,
  feature_turn_mpdm_notifs_on: true,
  feature_desktop_reload_on_generic_error: true,
  feature_desktop_extend_app_menu: true,
  feature_desktop_restart_service_worker: false,
  feature_desktop_system_notification_playback: false,
  feature_dolores: false,
  feature_desktop_force_production_channel: false,
  feature_desktop_logs_upload: true,
  feature_macos_disable_hw: true,
  feature_create_private_c_channels: false,
  feature_managed_connections_grid: true,
  feature_managed_connections_grid_org_dash: false,
  feature_managed_connections_grid_fe: false,
  feature_slack_connect_approve_new_channels: false,
  feature_bots_not_members: true,
  feature_wta_stop_creation: true,
  feature_platform_deprecations_fe: true,
  feature_app_manifest_create_ui: false,
  feature_app_config_collaborators_gantry: true,
  feature_no_socket_mode: false,
  feature_no_callback_id_edit: false,
  feature_siws_idl_transfer: true,
  feature_channel_actions: true,
  feature_screen_share_needs_aero: false,
  feature_emoji_by_id: true,
  feature_mc_migration_banner: true,
  feature_deactivated_apps_tab_apps_manage_gantry_v2: true,
  feature_scg_conversion_channels: true,
  feature_enterprise_retention_allow_override_on_org_level_channels: false,
  feature_enterprise_retention_admin_retention_by_ccm: false,
  feature_legal_holds_org_dashboard: false,
  feature_track_time_spent: true,
  feature_channel_invite_tokenization: true,
  feature_imports_cancel: true,
  feature_email_workobject_ui: false,
  feature_email_notify: false,
  feature_improved_email_rendering: true,
  feature_mini_browser_translations: false,
  feature_team_themes: false,
  feature_unfurl_metadata: false,
  feature_paperclip_coachmark_experiments: true,
  feature_plus_menu_add_apps_link: false,
  feature_recent_files_omnipicker: false,
  feature_recent_desktop_files: true,
  feature_huddles_i18n: false,
  feature_connect_deeplink: false,
  feature_cea_allowlist_changes: false,
  feature_cea_admin_controls: false,
  feature_cea_allowlist_changes_plus: false,
  feature_link_protocol_beta: true,
  feature_stripe_light_legacy_purchase_mode: false,
  feature_checkout_force_into_legacy: false,
  feature_ia_context_menus: true,
  feature_ia_layout: true,
  feature_misc_ia_a11y_translations: false,
  feature_threaded_call_block: false,
  feature_enable_read_time_validations_for_shortcuts: true,
  feature_slack_message_attachment_tooltip: false,
  feature_enterprise_mobile_device_check: true,
  feature_shared_channels_custom_emojis_url: false,
  feature_new_copy_for_identity_basic: false,
  feature_shared_channels_inviter_trial: false,
  feature_shared_channels_multi_email_invite: true,
  feature_shared_channels_90_day_trial_inviter: false,
  feature_shared_channels_day1_creator: true,
  feature_shared_channels_accept_flow_v2: true,
  feature_shared_channels_happier_paths: false,
  feature_shared_channel_invites_v2: true,
  feature_slack_connect_dm_day1_creator: true,
  feature_shared_channels_trial_edu: true,
  feature_paid_onboarding_pageupdate: true,
  feature_trace_webapp_init: true,
  feature_trace_jq_init: true,
  feature_trial_end_l10n: true,
  feature_seven_days_email_update: true,
  feature_stripe_completely_down_banner: false,
  feature_fair_billing_detail_invoice_statements: false,
  feature_checkout_zip_autocomplete_translations: true,
  feature_billing_member_email_updates: false,
  feature_checkout_session_payment_error: true,
  feature_stripe_ssi_plan_switcher: false,
  feature_uae_tax_id_collection: true,
  feature_chile_tax_id_collection: true,
  feature_ksa_tax_id_collection: true,
  feature_indonesia_tax_change_notification: false,
  feature_indonesia_tax_assessment: false,
  feature_update_timeseries_member_counts: true,
  feature_updated_analytics_overview_banner_and_exports: true,
  feature_modern_analytics_in_gantry: false,
  feature_workspace_level_analytics_in_team_site: false,
  feature_messages_from_apps_analytics: false,
  feature_org_level_apps: true,
  feature_org_install_status_polling: true,
  feature_channel_sections: true,
  feature_channel_sections_sidebar_behavior_ui: false,
  feature_analytics_scim_fields_paid: false,
  feature_google_directory_invites: false,
  feature_add_teammates_after_sc_invite_acceptance: false,
  feature_migrate_google_directory_apis: true,
  feature_show_email_forwarded_by: false,
  feature_feature_builder_sk_required_arialabel: false,
  feature_builder_workflow_activity: true,
  feature_builder_export_form_csv_admin: true,
  feature_rate_limit_app_creation: true,
  feature_giphy_shortcut: true,
  feature_download_finder_update: true,
  feature_share_modal_dialog: true,
  feature_block_files_esc: true,
  feature_from_another_team_labels: false,
  feature_ultralight_beam: false,
  feature_app_directory_mon_intent: true,
  feature_help_flex_asat: true,
  feature_help_flex: false,
  feature_parsec_methods: false,
  feature_invite_new_error: false,
  feature_soul_searchers: false,
  feature_snd_query_refinements: true,
  feature_primary_owner_consistent_roles: true,
  feature_siws_links: false,
  feature_locale_it_IT: true,
  feature_locale_ko_KR: true,
  feature_locale_ru_RU: false,
  feature_locale_zh_CN: false,
  feature_locale_zh_TW: false,
  feature_search_filter_file_attachments: true,
  feature_mpdm_audience_expansion: true,
  feature_ce_eng_search_zendesk_api: false,
  feature_bk_error_messaging: true,
  feature_large_emoji_in_tooltip: true,
  feature_newxp_3795: false,
  feature_new_notifications_string: false,
  feature_guard_channel_details_translations: false,
  feature_msc_button_for_slackbot_msg: false,
  feature_refine_your_search_i18n: true,
  feature_inline_feedback: true,
  feature_idr_backfills: false,
  feature_xws_user_groups_selector: true,
  feature_stripe_ssi: false,
  feature_slack_connect_allowed_workspaces_pref: true,
  feature_slack_connect_allowed_workspaces_pref_be: true,
  feature_slack_connect_allowed_workspaces_pref_fe: true,
  feature_context_menu_keyboard_shortcut: true,
  feature_announcer_api: false,
  feature_reacji_aria_announcements: false,
  feature_search_aria_initial_state: true,
  feature_free_trial_chat: true,
  feature_invited_users_count: true,
  feature_accessible_date_picker_select: false,
  feature_universal_sidebar_prefs: false,
  feature_file_upload_size_restricted: true,
  feature_builder_improve_messaging: true,
  feature_slack_connect_page_grid: true,
  feature_remove_email_preview_link: true,
  feature_channel_unread_count_summary: false,
  feature_add_to_slack_typeahead: true,
  feature_app_directory_org_wide_apps_banner: true,
  feature_desktop_enable_tslog: false,
  feature_desktop_enable_sticky_notification_pref: false,
  feature_image_pdf_popout: true,
  feature_video_office_popout: true,
  feature_open_in_browser_file_action: true,
  feature_ntlm_domain_approval_ui: false,
  feature_edu_309: true,
  feature_animations_os_pref_sync: true,
  feature_slack_connect_block_files_by_type: true,
  feature_pagination_arrow_keys_i18n: true,
  feature_email_determine_charset: true,
  feature_windows7_deprecation: true,
  feature_windows7_deprecation_modal: false,
  feature_pad_2035: false,
  feature_scan_files_for_malware: false,
  feature_edu_409: false,
  feature_pricing_pdf_translations: false,
  feature_deprecation_in_updater: true,
  feature_mixed_results_related_i18n: false,
  no_login: false,
}

function getTimestampFromSnowflake(snowflake: string) {
  if (!snowflake) return
  const int = BigInt.asUintN(64, BigInt(snowflake))
  // @ts-expect-error
  const dateBits = Number(int >> 22n)
  return new Date(dateBits + TWITTER_EPOCH)
}

export function mapCurrentUser(user: any): CurrentUser {
  return {
    id: user.id_str,
    fullName: user.name,
    displayText: '@' + user.screen_name,
    imgURL: user.profile_image_url_https.replace('_normal', ''),
    isVerified: user.verified,
  }
}

export function mapParticipant(user: any, participant: any): Participant {
  if (!user) return
  return {
    id: user.id_str,
    username: user.screen_name,
    fullName: user.name,
    imgURL: user.profile_image_url_https.replace('_normal', ''),
    isVerified: user.verified,
    cannotMessage: user.is_dm_able === false,
    isAdmin: !!participant.is_admin,
  }
}

const MAP_THREAD_TYPE = {
  ONE_TO_ONE: 'single',
  GROUP_DM: 'group',
}

export function mapThread(thread: any, users: any = {}, currentUserTw: any): Thread {
  const participants = orderBy(
    (thread.participants as any[]).map(p => mapParticipant(users[p.user_id], p)).filter(Boolean),
    u => u.id === currentUserTw.id_str,
  )
  const mapped: Thread = {
    _original: JSON.stringify(thread),
    id: thread.conversation_id,
    isReadOnly: thread.read_only,
    imgURL: thread.avatar_image_https,
    isUnread: null,
    messages: null,
    participants: {
      hasMore: false,
      items: participants,
    },
    title: thread.name,
    timestamp: new Date(+thread.sort_timestamp || Date.now()),
    type: MAP_THREAD_TYPE[thread.type],
  }
  if (thread.notifications_disabled) {
    mapped.mutedUntil = thread.mute_expiration_time ? new Date(+thread.mute_expiration_time) : 'forever'
  }
  return mapped
}

export function mapThreads(json: any, currentUser: any, inboxType: string): Thread[] {
  if (!json) return []
  const { conversations, entries, users } = json
  const threads = Object.values(conversations || {})
  const groupedMessages = [] // groupMessages(entries || [])
  return threads.map((t: any) => {
    if (t.trusted !== (inboxType === 'trusted')) return null
    const thread = mapThread(t, users, currentUser)
    const messages = [] // mapMessages(groupedMessages[t.conversation_id] || [], t, currentUser.id_str)
    const lastMessage = messages[messages.length - 1]
    return {
      ...thread,
      messages: {
        hasMore: t.status !== 'AT_END',
        items: messages,
        oldestCursor: t.min_entry_id,
      },
      isUnread: getTimestampFromSnowflake(t.last_read_event_id) < getTimestampFromSnowflake(lastMessage?.id) && !lastMessage?.isSender,
    }
  }).filter(Boolean)
}
