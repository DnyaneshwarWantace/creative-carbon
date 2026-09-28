--
-- PostgreSQL database dump
--

\restrict uozjfPuOsaIx2wv7tB9Yp7ENZ0vlMYGHRhFaqrXAvpzOfiol8xQvzggNoYMKrbe

-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    actor_user_id uuid,
    resource_kind text NOT NULL,
    resource_id text NOT NULL,
    access_type text NOT NULL,
    fields_json jsonb,
    context_json jsonb,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: action_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    actor_user_id uuid,
    command_id text NOT NULL,
    action_label text,
    resource_kind text,
    resource_id text,
    execution_state text DEFAULT 'done'::text NOT NULL,
    undo_token text,
    command_payload jsonb,
    snapshot_before jsonb,
    snapshot_after jsonb,
    changes_json jsonb,
    context_json jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    parent_resource_kind text,
    parent_resource_id text,
    action_type text,
    changed_fields text[],
    primary_changed_field text,
    source_key text,
    related_resource_kind text,
    related_resource_id text
);


--
-- Name: ai_agent_mutation_policy_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_mutation_policy_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    agent_id text NOT NULL,
    mutation_policy text NOT NULL,
    notes text,
    created_by_user_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: ai_agent_prompt_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_prompt_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    agent_id text NOT NULL,
    version integer NOT NULL,
    sections jsonb NOT NULL,
    notes text,
    created_by_user_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: ai_agent_runtime_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_runtime_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    agent_id character varying(128),
    provider_id character varying(64),
    model_id character varying(256),
    base_url character varying(2048),
    updated_by_user_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    loop_disabled boolean,
    loop_max_steps integer,
    loop_max_tool_calls integer,
    loop_max_wall_clock_ms integer,
    loop_max_tokens integer,
    loop_stop_when_json jsonb,
    loop_active_tools_json jsonb,
    allowed_override_providers jsonb,
    allowed_override_models_by_provider jsonb DEFAULT '{}'::jsonb NOT NULL,
    input_moderation boolean
);


--
-- Name: ai_chat_conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chat_conversation_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    conversation_id text NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'owner'::text NOT NULL,
    last_read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: ai_chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    conversation_id text NOT NULL,
    agent_id text NOT NULL,
    owner_user_id uuid NOT NULL,
    title text,
    status text DEFAULT 'open'::text NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    page_context jsonb,
    last_message_at timestamp with time zone,
    imported_from_local_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: ai_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    conversation_id text NOT NULL,
    client_message_id text,
    role text NOT NULL,
    content text NOT NULL,
    ui_parts jsonb,
    attachment_ids jsonb,
    files_metadata jsonb,
    model text,
    metadata jsonb,
    created_by_user_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: ai_moderation_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_moderation_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    agent_id text NOT NULL,
    user_id text NOT NULL,
    provider_id text NOT NULL,
    model_id text NOT NULL,
    categories jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: ai_pending_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_pending_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    agent_id text NOT NULL,
    tool_name text NOT NULL,
    conversation_id text,
    target_entity_type text,
    target_record_id text,
    normalized_input jsonb NOT NULL,
    field_diff jsonb DEFAULT '[]'::jsonb NOT NULL,
    records jsonb,
    failed_records jsonb,
    side_effects_summary text,
    record_version text,
    attachment_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    idempotency_key text NOT NULL,
    created_by_user_id uuid NOT NULL,
    status text NOT NULL,
    queue_mode text DEFAULT 'inline'::text NOT NULL,
    execution_result jsonb,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by_user_id uuid
);


--
-- Name: ai_tenant_model_allowlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_tenant_model_allowlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    allowed_providers jsonb,
    allowed_models_by_provider jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by_user_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: ai_token_usage_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_token_usage_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    day date NOT NULL,
    agent_id text NOT NULL,
    model_id text NOT NULL,
    provider_id text NOT NULL,
    input_tokens bigint NOT NULL,
    output_tokens bigint NOT NULL,
    cached_input_tokens bigint NOT NULL,
    reasoning_tokens bigint NOT NULL,
    step_count bigint NOT NULL,
    turn_count bigint NOT NULL,
    session_count bigint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: ai_token_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_token_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    user_id uuid NOT NULL,
    agent_id text NOT NULL,
    module_id text NOT NULL,
    session_id uuid NOT NULL,
    turn_id uuid NOT NULL,
    step_index integer NOT NULL,
    provider_id text NOT NULL,
    model_id text NOT NULL,
    input_tokens integer NOT NULL,
    output_tokens integer NOT NULL,
    cached_input_tokens integer,
    reasoning_tokens integer,
    finish_reason text,
    loop_abort_reason text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    tenant_id uuid,
    organization_id uuid,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    roles_json jsonb,
    created_by uuid,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    session_token text,
    session_user_id uuid,
    session_secret_encrypted text,
    opencode_session_id text
);


--
-- Name: attachment_partitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachment_partitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    storage_driver text DEFAULT 'local'::text NOT NULL,
    config_json jsonb,
    is_public boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    requires_ocr boolean DEFAULT true NOT NULL,
    ocr_model text,
    organization_id uuid,
    tenant_id uuid
);


--
-- Name: attachment_quota_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachment_quota_reservations (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    reserved_bytes bigint NOT NULL,
    actual_bytes bigint,
    status text DEFAULT 'reserved'::text NOT NULL,
    source text NOT NULL,
    storage_driver text NOT NULL,
    partition_code text,
    storage_path text NOT NULL,
    lease_token uuid NOT NULL,
    upload_token_hash text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id text NOT NULL,
    record_id text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    url text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    partition_code text NOT NULL,
    storage_driver text DEFAULT 'local'::text NOT NULL,
    storage_path text NOT NULL,
    storage_metadata jsonb,
    content text
);


--
-- Name: business_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id character varying(50) NOT NULL,
    rule_name character varying(200) NOT NULL,
    description text,
    rule_type character varying(20) NOT NULL,
    rule_category character varying(50),
    entity_type character varying(50) NOT NULL,
    event_type character varying(50),
    condition_expression jsonb,
    success_actions jsonb,
    failure_actions jsonb,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    effective_from timestamp with time zone,
    effective_to timestamp with time zone,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_by character varying(50),
    updated_by character varying(50),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: carrier_shipment_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carrier_shipment_idempotency_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_key text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    shipment_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: carrier_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carrier_shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    provider_key text NOT NULL,
    carrier_shipment_id text NOT NULL,
    tracking_number text NOT NULL,
    unified_status text DEFAULT 'label_created'::text NOT NULL,
    carrier_status text,
    label_url text,
    label_data text,
    tracking_events jsonb,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    last_webhook_at timestamp with time zone,
    last_polled_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: carrier_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carrier_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_key text NOT NULL,
    idempotency_key text NOT NULL,
    event_type text NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    processed_at timestamp with time zone NOT NULL
);


--
-- Name: catalog_price_kinds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_price_kinds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    display_mode text DEFAULT 'excluding-tax'::text NOT NULL,
    currency_code text,
    is_promotion boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: catalog_product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    slug text,
    description text,
    parent_id uuid,
    root_id uuid,
    tree_path text,
    depth integer DEFAULT 0 NOT NULL,
    ancestor_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    child_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    descendant_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: catalog_product_category_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_category_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    category_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: catalog_product_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    metadata jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    default_media_id uuid,
    default_media_url text
);


--
-- Name: catalog_product_option_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_option_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    schema jsonb NOT NULL,
    metadata jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: catalog_product_option_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_option_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    option_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: catalog_product_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    is_multiple boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    input_type text DEFAULT 'select'::text NOT NULL,
    input_config jsonb
);


--
-- Name: catalog_product_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_product_id uuid NOT NULL,
    child_product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    relation_type text DEFAULT 'grouped'::text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    min_quantity integer,
    max_quantity integer,
    "position" integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: catalog_product_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_tag_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: catalog_product_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: catalog_product_unit_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_unit_conversions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    unit_code text NOT NULL,
    to_base_factor numeric(24,12) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: catalog_product_variant_option_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_variant_option_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_id uuid NOT NULL,
    option_value_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: catalog_product_variant_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_variant_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    variant_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    currency_code text NOT NULL,
    kind text DEFAULT 'regular'::text NOT NULL,
    min_quantity integer DEFAULT 1 NOT NULL,
    max_quantity integer,
    unit_price_net numeric(16,4),
    unit_price_gross numeric(16,4),
    tax_rate numeric(7,4),
    metadata jsonb,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    product_id uuid,
    offer_id uuid,
    channel_id uuid,
    user_id uuid,
    user_group_id uuid,
    customer_id uuid,
    customer_group_id uuid,
    price_kind_id uuid NOT NULL,
    tax_amount numeric(16,4)
);


--
-- Name: catalog_product_variant_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_variant_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_variant_id uuid NOT NULL,
    child_variant_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    relation_type text DEFAULT 'grouped'::text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    min_quantity integer,
    max_quantity integer,
    "position" integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    child_product_id uuid
);


--
-- Name: catalog_product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text,
    sku text,
    barcode text,
    status_entry_id text,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    weight_value numeric(16,4),
    weight_unit text,
    dimensions jsonb,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    custom_fieldset_code text,
    default_media_id uuid,
    default_media_url text,
    tax_rate_id uuid,
    tax_rate numeric(7,4),
    option_values jsonb,
    gtin_type text,
    hs_code text
);


--
-- Name: catalog_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    subtitle text,
    status_entry_id uuid,
    primary_currency_code text,
    default_unit text,
    metadata jsonb,
    is_configurable boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    product_type text DEFAULT 'simple'::text NOT NULL,
    sku text,
    handle text,
    option_schema_id uuid,
    custom_fieldset_code text,
    default_media_id uuid,
    default_media_url text,
    weight_value numeric(16,4),
    weight_unit text,
    dimensions jsonb,
    tax_rate_id uuid,
    tax_rate numeric(7,4),
    default_sales_unit text,
    default_sales_unit_quantity numeric(18,6) DEFAULT '1'::numeric NOT NULL,
    uom_rounding_scale smallint DEFAULT 4 NOT NULL,
    uom_rounding_mode text DEFAULT 'half_up'::text NOT NULL,
    unit_price_enabled boolean DEFAULT false NOT NULL,
    unit_price_reference_unit text,
    unit_price_base_quantity numeric(18,6),
    country_of_origin_code text,
    pkwiu_code text,
    cn_code text,
    hs_code text,
    tax_classification_code text,
    gtu_codes text[],
    age_min smallint,
    is_excise_good boolean DEFAULT false NOT NULL,
    excise_category text,
    requires_prescription boolean DEFAULT false NOT NULL,
    hazmat_class text,
    un_number text,
    hazmat_packing_group text,
    contains_lithium_battery boolean DEFAULT false NOT NULL,
    launch_at timestamp with time zone,
    end_of_life_at timestamp with time zone,
    available_from timestamp with time zone,
    available_until timestamp with time zone,
    min_order_qty integer,
    max_order_qty integer,
    order_qty_increment integer,
    requires_shipping boolean DEFAULT true NOT NULL,
    is_quote_only boolean DEFAULT false NOT NULL,
    seo_title text,
    seo_description text,
    canonical_url text
);


--
-- Name: channel_ingest_dead_letters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_ingest_dead_letters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    channel_id uuid NOT NULL,
    provider_key text NOT NULL,
    external_uid text,
    external_message_id text,
    error_class text NOT NULL,
    error_message text NOT NULL,
    raw_body text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: channel_thread_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_thread_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_conversation_id uuid NOT NULL,
    message_thread_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    provider_key text NOT NULL,
    external_thread_ref text NOT NULL,
    assigned_user_id uuid,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: channel_thread_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_thread_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    message_thread_id uuid NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone
);


--
-- Name: checkout_link_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkout_link_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    title text,
    subtitle text,
    description text,
    logo_attachment_id uuid,
    logo_url text,
    primary_color text,
    secondary_color text,
    background_color text,
    theme_mode text DEFAULT 'auto'::text NOT NULL,
    pricing_mode text NOT NULL,
    fixed_price_amount numeric(12,2),
    fixed_price_currency_code text,
    fixed_price_includes_tax boolean DEFAULT true NOT NULL,
    fixed_price_original_amount numeric(12,2),
    custom_amount_min numeric(12,2),
    custom_amount_max numeric(12,2),
    custom_amount_currency_code text,
    price_list_items jsonb,
    gateway_provider_key text,
    gateway_settings jsonb,
    customer_fields_schema jsonb,
    legal_documents jsonb,
    display_custom_fields_on_page boolean DEFAULT false NOT NULL,
    success_title text,
    success_message text,
    cancel_title text,
    cancel_message text,
    error_title text,
    error_message text,
    success_email_subject text,
    success_email_body text,
    error_email_subject text,
    error_email_body text,
    start_email_subject text,
    start_email_body text,
    password_hash text,
    max_completions integer,
    status text DEFAULT 'draft'::text NOT NULL,
    checkout_type text DEFAULT 'pay_link'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    send_success_email boolean DEFAULT true NOT NULL,
    send_error_email boolean DEFAULT true NOT NULL,
    send_start_email boolean DEFAULT true NOT NULL,
    collect_customer_details boolean DEFAULT true NOT NULL,
    custom_fieldset_code text
);


--
-- Name: checkout_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkout_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    title text,
    subtitle text,
    description text,
    logo_attachment_id uuid,
    logo_url text,
    primary_color text,
    secondary_color text,
    background_color text,
    theme_mode text DEFAULT 'auto'::text NOT NULL,
    pricing_mode text NOT NULL,
    fixed_price_amount numeric(12,2),
    fixed_price_currency_code text,
    fixed_price_includes_tax boolean DEFAULT true NOT NULL,
    fixed_price_original_amount numeric(12,2),
    custom_amount_min numeric(12,2),
    custom_amount_max numeric(12,2),
    custom_amount_currency_code text,
    price_list_items jsonb,
    gateway_provider_key text,
    gateway_settings jsonb,
    customer_fields_schema jsonb,
    legal_documents jsonb,
    display_custom_fields_on_page boolean DEFAULT false NOT NULL,
    success_title text,
    success_message text,
    cancel_title text,
    cancel_message text,
    error_title text,
    error_message text,
    success_email_subject text,
    success_email_body text,
    error_email_subject text,
    error_email_body text,
    start_email_subject text,
    start_email_body text,
    password_hash text,
    max_completions integer,
    status text DEFAULT 'draft'::text NOT NULL,
    checkout_type text DEFAULT 'pay_link'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    template_id uuid,
    slug text NOT NULL,
    completion_count integer DEFAULT 0 NOT NULL,
    active_reservation_count integer DEFAULT 0 NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    send_success_email boolean DEFAULT true NOT NULL,
    send_error_email boolean DEFAULT true NOT NULL,
    send_start_email boolean DEFAULT true NOT NULL,
    collect_customer_details boolean DEFAULT true NOT NULL,
    custom_fieldset_code text
);


--
-- Name: checkout_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkout_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    link_id uuid NOT NULL,
    status text NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency_code text NOT NULL,
    idempotency_key text NOT NULL,
    customer_data jsonb,
    first_name text,
    last_name text,
    email text,
    phone text,
    gateway_transaction_id uuid,
    payment_status text,
    selected_price_item_id text,
    accepted_legal_consents jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: communication_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communication_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_key text NOT NULL,
    channel_type text NOT NULL,
    display_name text NOT NULL,
    external_identifier text,
    credentials_ref uuid,
    capabilities jsonb,
    is_active boolean DEFAULT true NOT NULL,
    user_id uuid,
    is_primary boolean DEFAULT false NOT NULL,
    poll_interval_seconds integer,
    last_polled_at timestamp with time zone,
    status text DEFAULT 'connected'::text NOT NULL,
    last_error text,
    channel_state jsonb,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    symbol text,
    decimal_places integer DEFAULT 2 NOT NULL,
    thousands_separator text,
    decimal_separator text,
    is_base boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: currency_fetch_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency_fetch_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    sync_time text,
    last_sync_at timestamp with time zone,
    last_sync_status text,
    last_sync_message text,
    last_sync_count integer,
    config jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: custom_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id text NOT NULL,
    label text NOT NULL,
    description text,
    label_field text,
    default_editor text,
    show_in_sidebar boolean DEFAULT false NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    access_restricted boolean DEFAULT false NOT NULL
);


--
-- Name: custom_entities_storage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_entities_storage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    doc jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: custom_field_defs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_field_defs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    key text NOT NULL,
    kind text NOT NULL,
    config_json jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: custom_field_entity_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_field_entity_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    config_json jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: custom_field_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_field_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id text NOT NULL,
    record_id text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    field_key text NOT NULL,
    value_text text,
    value_multiline text,
    value_int integer,
    value_float real,
    value_bool boolean,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: customer_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    activity_type text NOT NULL,
    subject text,
    body text,
    occurred_at timestamp with time zone,
    author_user_id uuid,
    appearance_icon text,
    appearance_color text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    entity_id uuid NOT NULL,
    deal_id uuid
);


--
-- Name: customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text,
    purpose text,
    address_line1 text NOT NULL,
    address_line2 text,
    city text,
    region text,
    postal_code text,
    country text,
    building_number text,
    flat_number text,
    latitude real,
    longitude real,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    entity_id uuid NOT NULL,
    company_name text
);


--
-- Name: customer_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    body text NOT NULL,
    author_user_id uuid,
    appearance_icon text,
    appearance_color text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    entity_id uuid NOT NULL,
    deal_id uuid
);


--
-- Name: customer_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    legal_name text,
    brand_name text,
    domain text,
    website_url text,
    industry text,
    size_bucket text,
    annual_revenue numeric(16,2),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    entity_id uuid NOT NULL
);


--
-- Name: customer_company_billing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_company_billing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    bank_name text,
    bank_account_masked text,
    payment_terms text,
    preferred_currency text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: customer_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_deal_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_deal_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone NOT NULL,
    deal_id uuid NOT NULL,
    company_entity_id uuid NOT NULL
);


--
-- Name: customer_deal_people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_deal_people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role text,
    created_at timestamp with time zone NOT NULL,
    deal_id uuid NOT NULL,
    person_entity_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: customer_deal_stage_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_deal_stage_transitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    stage_label text NOT NULL,
    stage_order integer NOT NULL,
    transitioned_at timestamp with time zone NOT NULL,
    transitioned_by_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    deal_id uuid NOT NULL
);


--
-- Name: customer_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    pipeline_stage text,
    value_amount numeric(14,2),
    value_currency text,
    probability integer,
    expected_close_at timestamp with time zone,
    owner_user_id uuid,
    source text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    pipeline_id uuid,
    pipeline_stage_id uuid,
    closure_outcome text,
    loss_reason_id uuid,
    loss_notes text
);


--
-- Name: customer_dictionary_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_dictionary_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    value text NOT NULL,
    normalized_value text NOT NULL,
    label text NOT NULL,
    color text,
    icon text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: customer_dictionary_kind_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_dictionary_kind_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    selection_mode text DEFAULT 'single'::text NOT NULL,
    visible_in_tags boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: customer_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    display_name text NOT NULL,
    description text,
    owner_user_id uuid,
    primary_email text,
    primary_phone text,
    status text,
    lifecycle_stage text,
    source text,
    next_interaction_at timestamp with time zone,
    next_interaction_name text,
    next_interaction_ref_id text,
    next_interaction_icon text,
    next_interaction_color text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    temperature text,
    renewal_quarter text
);


--
-- Name: customer_entity_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_entity_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_type text NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: customer_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    interaction_type text NOT NULL,
    title text,
    body text,
    status text DEFAULT 'planned'::text NOT NULL,
    scheduled_at timestamp with time zone,
    occurred_at timestamp with time zone,
    priority integer,
    author_user_id uuid,
    owner_user_id uuid,
    appearance_icon text,
    appearance_color text,
    source text,
    deal_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    entity_id uuid NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    duration_minutes integer,
    location text,
    all_day boolean,
    recurrence_rule text,
    recurrence_end timestamp with time zone,
    participants jsonb,
    reminder_minutes integer,
    visibility text,
    linked_entities jsonb,
    guest_permissions jsonb,
    external_message_id uuid,
    channel_provider_key text
);


--
-- Name: customer_label_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_label_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    label_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: customer_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: customer_people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    first_name text,
    last_name text,
    preferred_name text,
    job_title text,
    department text,
    seniority text,
    timezone text,
    linked_in_url text,
    twitter_url text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    entity_id uuid NOT NULL,
    company_entity_id uuid
);


--
-- Name: customer_person_company_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_person_company_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    person_entity_id uuid NOT NULL,
    company_entity_id uuid NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: customer_person_company_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_person_company_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    person_entity_id uuid NOT NULL,
    company_entity_id uuid NOT NULL,
    role_value text NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: customer_pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: customer_pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: customer_role_acls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_role_acls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    features_json jsonb,
    is_portal_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: customer_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_default boolean DEFAULT false NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    customer_assignable boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: customer_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    address_format text DEFAULT 'line_first'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    stuck_threshold_days integer DEFAULT 14 NOT NULL,
    dictionary_sort_modes jsonb
);


--
-- Name: customer_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_tag_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    tag_id uuid NOT NULL,
    entity_id uuid NOT NULL
);


--
-- Name: customer_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    color text,
    description text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: customer_todo_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_todo_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    todo_id uuid NOT NULL,
    todo_source text DEFAULT 'customers:interaction'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by_user_id uuid,
    entity_id uuid NOT NULL
);


--
-- Name: customer_user_acls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_user_acls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    features_json jsonb,
    is_portal_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: customer_user_email_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_user_email_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    purpose text DEFAULT 'email_verification'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: customer_user_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_user_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    email_hash text NOT NULL,
    token text NOT NULL,
    customer_entity_id uuid,
    role_ids_json jsonb,
    invited_by_user_id uuid,
    invited_by_customer_user_id uuid,
    display_name text,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    person_entity_id uuid
);


--
-- Name: customer_user_password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_user_password_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: customer_user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: customer_user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    ip_address text,
    user_agent text,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: customer_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    email text NOT NULL,
    email_hash text NOT NULL,
    password_hash text,
    display_name text NOT NULL,
    email_verified_at timestamp with time zone,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    person_entity_id uuid,
    customer_entity_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    sessions_revoked_at timestamp with time zone
);


--
-- Name: dashboard_layouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    layout_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: dashboard_role_widgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_role_widgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    widget_ids_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: dashboard_user_widgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_user_widgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    mode text DEFAULT 'inherit'::text NOT NULL,
    widget_ids_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_batch_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_batch_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    production_batch_id uuid NOT NULL,
    stage_type text NOT NULL,
    sequence_number integer NOT NULL,
    is_skipped boolean DEFAULT false NOT NULL,
    machine_used text,
    operator_name text,
    shift text,
    planned_output_qty numeric(14,3),
    actual_output_qty numeric(14,3),
    wastage_qty numeric(14,3),
    wastage_action text DEFAULT 'pending_decision'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    signed_off_by text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_bom_headers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_bom_headers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    product_id uuid NOT NULL,
    product_kind text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    batch_size numeric(14,3) NOT NULL,
    batch_unit text NOT NULL,
    notes text,
    created_by_name text,
    approved_by_name text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    order_id uuid,
    order_no text
);


--
-- Name: dermat_bom_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_bom_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bom_id uuid NOT NULL,
    "position" integer NOT NULL,
    component_product_id uuid NOT NULL,
    component_kind text NOT NULL,
    percent numeric(9,4),
    qty_per_unit numeric(14,5),
    unit text NOT NULL,
    remark text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    fill_qty numeric(12,3),
    fill_unit text
);


--
-- Name: dermat_bom_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_bom_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bom_id uuid NOT NULL,
    component_kind text NOT NULL,
    packaging_material_id uuid,
    quantity numeric(14,4) NOT NULL,
    unit text DEFAULT 'kg'::text NOT NULL,
    sequence_number integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    component_code text,
    raw_material_id uuid,
    qty_per_unit numeric(14,4) NOT NULL,
    wastage_percent numeric(6,3) DEFAULT '0'::numeric NOT NULL,
    total_qty numeric(14,4) NOT NULL,
    rm_percent numeric(8,4)
);


--
-- Name: dermat_boms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_boms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bom_name text NOT NULL,
    catalog_product_id uuid,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    batch_quantity numeric(14,3) DEFAULT '1'::numeric NOT NULL,
    metadata jsonb
);


--
-- Name: dermat_company_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_company_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    legal_name text,
    gstin text,
    pan text,
    address text,
    phone text,
    email text,
    website text,
    bank_name text,
    bank_branch text,
    bank_account text,
    bank_ifsc text,
    upi_id text,
    signatory text,
    pi_terms text,
    invoice_terms text,
    pi_validity_days integer DEFAULT 15 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    grn_over_percent integer DEFAULT 0 NOT NULL,
    number_series jsonb
);


--
-- Name: dermat_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    gst_number text,
    billing_address text,
    delivery_address text,
    contact_person text,
    contact_phone text,
    contact_email text,
    sales_poc_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    contact_email text,
    contact_phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    role_id uuid
);


--
-- Name: dermat_grn_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_grn_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    grn_id uuid NOT NULL,
    po_line_id uuid,
    product_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    unit text NOT NULL,
    store text NOT NULL,
    quantity numeric(14,4) NOT NULL,
    lot_id uuid,
    lot_number text NOT NULL,
    mfg_date text,
    expiry_date text,
    qc_check_id uuid,
    qc_status text DEFAULT 'pending'::text NOT NULL,
    returned_qty numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    rate numeric(14,4),
    gst_percent numeric(5,2)
);


--
-- Name: dermat_grns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_grns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    po_id uuid,
    po_code text,
    vendor_id uuid NOT NULL,
    vendor_name text NOT NULL,
    grn_date text NOT NULL,
    invoice_no text,
    invoice_date text,
    status text DEFAULT 'under_test'::text NOT NULL,
    notes text,
    received_by_name text,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_list_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_list_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    list_key text NOT NULL,
    value text NOT NULL,
    "position" integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_by_name text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_material_plan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_material_plan_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    bom_id uuid NOT NULL,
    bom_name text,
    product_id uuid,
    order_id uuid,
    order_number text,
    quantity_pcs numeric(18,4) NOT NULL,
    pack_size_grams numeric(18,4),
    bulk_kg numeric(18,4) NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_material_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_material_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    plan_number text NOT NULL,
    name text,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_by text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_material_request_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_material_request_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    request_id uuid NOT NULL,
    material_id uuid NOT NULL,
    material_code text,
    material_name text,
    unit text,
    required_qty numeric(18,4) NOT NULL,
    stock_at_request numeric(18,4) NOT NULL,
    issued_qty numeric(18,4),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_material_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_material_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    request_number text NOT NULL,
    plan_id uuid NOT NULL,
    plan_number text,
    store text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_by text,
    issued_by text,
    issued_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_order_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_order_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    stage_key text,
    action text NOT NULL,
    note text,
    by_name text,
    created_at timestamp with time zone NOT NULL,
    changes jsonb
);


--
-- Name: dermat_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    "position" integer NOT NULL,
    product_id uuid NOT NULL,
    brand_name text,
    pack_size text,
    mrp numeric(12,2),
    quantity numeric(14,3) NOT NULL,
    rate numeric(12,2),
    batch_no text,
    specs jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    gst_percent numeric(6,2) DEFAULT '18'::numeric NOT NULL,
    discount_percent numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    sample_needed boolean DEFAULT false NOT NULL,
    rd_number text
);


--
-- Name: dermat_order_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_order_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    order_no text NOT NULL,
    kind text NOT NULL,
    amount numeric(14,2) NOT NULL,
    paid_on text NOT NULL,
    mode text,
    reference text,
    note text,
    by_name text,
    voided_at timestamp with time zone,
    void_reason text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    invoice_id uuid,
    invoice_code text,
    history jsonb
);


--
-- Name: dermat_order_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_order_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    stage_key text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    responsible_user_id uuid,
    responsible_name text,
    data jsonb,
    hold_reason text,
    hold_party text,
    opened_at timestamp with time zone,
    completed_at timestamp with time zone,
    completed_by_name text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: dermat_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_no text NOT NULL,
    order_date date NOT NULL,
    delivery_date date,
    customer_id uuid NOT NULL,
    customer_po_ref text,
    order_type text DEFAULT 'new'::text NOT NULL,
    source_order_id uuid,
    sales_manager text,
    payment_terms text,
    payment_remarks text,
    product_remarks text,
    billing_remarks text,
    packing_remarks text,
    status text DEFAULT 'booked'::text NOT NULL,
    created_by_name text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    prices_include_gst boolean DEFAULT false NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    billing_address text,
    shipping_address text,
    revised_at timestamp with time zone,
    revised_by_name text,
    revision_note text
);


--
-- Name: dermat_planning_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_planning_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    action text NOT NULL,
    order_id uuid NOT NULL,
    order_no text NOT NULL,
    to_order_id uuid,
    to_order_no text,
    product_id uuid NOT NULL,
    quantity numeric(14,4) NOT NULL,
    note text,
    by_name text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: dermat_planning_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_planning_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    items jsonb,
    notes text,
    created_by_name text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    store_status text,
    sent_at timestamp with time zone,
    sent_by_name text,
    prepare_by text,
    store_note text,
    store_updated_at timestamp with time zone,
    store_by_name text
);


--
-- Name: dermat_planning_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_planning_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    order_no text NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(14,4) NOT NULL,
    note text,
    by_name text,
    since timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: dermat_pm_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_pm_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    stock numeric(14,3) DEFAULT 0 NOT NULL,
    unit text NOT NULL,
    make_brand_name text,
    supplier text,
    category text,
    dimensions text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_po_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_po_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    po_id uuid NOT NULL,
    "position" integer NOT NULL,
    product_id uuid NOT NULL,
    unit text NOT NULL,
    quantity numeric(14,4) NOT NULL,
    rate numeric(14,4) NOT NULL,
    gst_percent numeric(6,2) DEFAULT '18'::numeric NOT NULL,
    received_qty numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: dermat_pos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_pos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    vendor_id uuid NOT NULL,
    vendor_name text NOT NULL,
    vendor_gstin text,
    po_date text NOT NULL,
    expected_date text,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    terms text,
    order_refs jsonb,
    created_by_name text,
    approved_by_name text,
    approved_at timestamp with time zone,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_production_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_production_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    batch_number text NOT NULL,
    order_id text,
    product_name text NOT NULL,
    planned_quantity numeric(14,3) NOT NULL,
    planned_unit text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_proforma_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_proforma_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    order_id uuid NOT NULL,
    order_no text NOT NULL,
    customer_id uuid NOT NULL,
    customer_name text NOT NULL,
    customer_gstin text,
    pi_date text NOT NULL,
    valid_until text,
    status text DEFAULT 'draft'::text NOT NULL,
    advance_percent numeric(6,2),
    prices_include_gst boolean DEFAULT false NOT NULL,
    lines jsonb NOT NULL,
    totals jsonb NOT NULL,
    terms text,
    bank_details text,
    notes text,
    sent_at timestamp with time zone,
    sent_by_name text,
    created_by_name text,
    cancel_reason text,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_purchase_indents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_purchase_indents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    source text DEFAULT 'department'::text NOT NULL,
    department text,
    needed_by text,
    notes text,
    lines jsonb NOT NULL,
    order_refs jsonb,
    requested_by_name text,
    approved_by_name text,
    approved_at timestamp with time zone,
    decision_note text,
    po_refs jsonb,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_purchase_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_purchase_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    purchase_order_id uuid NOT NULL,
    line_kind text NOT NULL,
    raw_material_id uuid,
    packaging_material_id uuid,
    component_code text,
    quantity numeric(14,4) NOT NULL,
    pack numeric(14,4),
    free_quantity numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    mrp numeric(14,4),
    unit text DEFAULT 'kg'::text NOT NULL,
    received_quantity numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    qc_approved boolean DEFAULT false NOT NULL,
    qc_approved_at timestamp with time zone,
    qc_approved_by text,
    sequence_number integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_purchase_order_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_purchase_order_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    financial_year text NOT NULL,
    current_value integer DEFAULT 0 NOT NULL
);


--
-- Name: dermat_purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    po_number text NOT NULL,
    department text NOT NULL,
    vendor_id uuid NOT NULL,
    bom_id uuid,
    gst_number text,
    payment_terms text,
    po_date date NOT NULL,
    delivery_date date,
    billing_address text,
    delivery_address text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_qa_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_qa_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    doc_no text NOT NULL,
    version integer NOT NULL,
    title text NOT NULL,
    doc_type text NOT NULL,
    department text,
    effective_date text NOT NULL,
    review_date text,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    change_note text,
    prepared_by_name text,
    approved_by_name text,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_qc_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_qc_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    applies_to text NOT NULL,
    chemical_required boolean DEFAULT true NOT NULL,
    micro_required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_qc_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_qc_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    reference_type text NOT NULL,
    reference_id text,
    test_type text NOT NULL,
    result text DEFAULT 'pending'::text NOT NULL,
    tested_by text,
    tested_at timestamp with time zone,
    remarks text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_quality_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_quality_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    operation text NOT NULL,
    product_id uuid NOT NULL,
    order_id uuid,
    order_no text,
    stage_key text,
    batch_no text,
    rule_id uuid,
    requires_chemical boolean DEFAULT true NOT NULL,
    requires_micro boolean DEFAULT false NOT NULL,
    chemical_status text DEFAULT 'pending'::text NOT NULL,
    micro_status text DEFAULT 'na'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    results jsonb,
    chemical_by text,
    chemical_at timestamp with time zone,
    micro_by text,
    micro_at timestamp with time zone,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    ar_no text,
    round integer DEFAULT 1 NOT NULL,
    worksheet jsonb
);


--
-- Name: dermat_quality_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_quality_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    operation text NOT NULL,
    product_id uuid,
    requires_chemical boolean DEFAULT true NOT NULL,
    requires_micro boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    parameters jsonb,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_rm_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_rm_master (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    inci_name text,
    code text NOT NULL,
    stock numeric(14,3) DEFAULT 0 NOT NULL,
    unit text NOT NULL,
    make_brand_name text,
    supplier text,
    benefit text,
    alternate_rm text,
    physical_state text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_rnd_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_rnd_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    kind text DEFAULT 'client'::text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    customer_id uuid,
    customer_name text,
    order_id uuid,
    order_no text,
    product_name text NOT NULL,
    brand text,
    product_type text,
    ingredients text,
    texture text,
    fragrance text,
    colour text,
    pack_size text,
    notes text,
    due_date text,
    rounds jsonb,
    requested_by_name text,
    assigned_name text,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_samples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_samples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_id text NOT NULL,
    product_name text,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_by text,
    requested_at timestamp with time zone,
    sent_at timestamp with time zone,
    customer_decision_at timestamp with time zone,
    rejection_reason text,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    rnd_stage text DEFAULT 'pending'::text NOT NULL,
    source_order_verified_by text
);


--
-- Name: dermat_stage_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_stage_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    subject_type text NOT NULL,
    phase text,
    phase_label text,
    unit text,
    sequence integer NOT NULL,
    department text NOT NULL,
    kind text NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_optional boolean DEFAULT false NOT NULL,
    is_automatic boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_stage_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_stage_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    order_number text,
    customer_name text,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    stage_code text NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    batch_number text,
    product_id uuid,
    product_name text,
    product_code text,
    quantity numeric(18,4),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    completed_by text,
    revert_reason text,
    reverted_at timestamp with time zone,
    reverted_by text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_stage_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_stage_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    stage_key text NOT NULL,
    label text,
    day_limit integer,
    hidden_steps jsonb,
    required_fields jsonb,
    extra_fields jsonb,
    documents jsonb,
    extra_documents jsonb,
    updated_by_name text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    reopen_hours integer
);


--
-- Name: dermat_stock_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_stock_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid,
    order_number text,
    material_kind text NOT NULL,
    material_id uuid NOT NULL,
    material_code text,
    material_name text,
    unit text,
    quantity numeric(18,4) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    reserved_by text,
    closed_at timestamp with time zone,
    closed_by text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    plan_id uuid,
    plan_number text
);


--
-- Name: dermat_store_request_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_store_request_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    request_id uuid NOT NULL,
    "position" integer NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    unit text NOT NULL,
    required_qty numeric(14,4) NOT NULL,
    issued_qty numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    received_qty numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    used_qty numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    returned_qty numeric(14,4) DEFAULT '0'::numeric NOT NULL,
    issues jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: dermat_store_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_store_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    order_id uuid NOT NULL,
    order_no text NOT NULL,
    stage_key text NOT NULL,
    store text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    notes text,
    requested_by_name text,
    received_by_name text,
    received_at timestamp with time zone,
    used_at timestamp with time zone,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_tax_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_tax_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    kind text DEFAULT 'invoice'::text NOT NULL,
    against_id uuid,
    against_code text,
    order_id uuid NOT NULL,
    order_no text NOT NULL,
    customer_id uuid NOT NULL,
    customer_name text NOT NULL,
    customer_gstin text,
    customer_address text,
    invoice_date text NOT NULL,
    due_date text,
    status text DEFAULT 'draft'::text NOT NULL,
    inter_state boolean DEFAULT false NOT NULL,
    place_of_supply text,
    prices_include_gst boolean DEFAULT false NOT NULL,
    lines jsonb NOT NULL,
    totals jsonb NOT NULL,
    transporter text,
    vehicle_no text,
    lr_no text,
    eway_bill_no text,
    terms text,
    bank_details text,
    notes text,
    issued_at timestamp with time zone,
    issued_by_name text,
    created_by_name text,
    cancel_reason text,
    history jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_vendor_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_vendor_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    vendor_id uuid NOT NULL,
    vendor_name text NOT NULL,
    bill_no text NOT NULL,
    bill_date text NOT NULL,
    due_date text,
    po_id uuid,
    po_code text,
    grn_ids jsonb,
    grn_codes jsonb,
    taxable numeric(14,2) NOT NULL,
    gst numeric(14,2) NOT NULL,
    total numeric(14,2) NOT NULL,
    paid numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    notes text,
    payments jsonb,
    history jsonb,
    created_by_name text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dermat_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermat_vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    gst_number text,
    contact_person text,
    contact_phone text,
    contact_email text,
    address text,
    payment_terms text,
    category text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: dictionaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dictionaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    manager_visibility text DEFAULT 'default'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    entry_sort_mode text DEFAULT 'label_asc'::text NOT NULL
);


--
-- Name: dictionary_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dictionary_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dictionary_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    value text NOT NULL,
    normalized_value text NOT NULL,
    label text NOT NULL,
    color text,
    icon text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: domain_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domain_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hostname text NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    replaces_domain_id uuid,
    provider text DEFAULT 'traefik'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    verified_at timestamp with time zone,
    last_dns_check_at timestamp with time zone,
    dns_failure_reason text,
    tls_failure_reason text,
    tls_retry_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT domain_mappings_hostname_normalized_chk CHECK (((hostname = lower(hostname)) AND (hostname !~~ '%.'::text))),
    CONSTRAINT domain_mappings_provider_check CHECK ((provider = 'traefik'::text)),
    CONSTRAINT domain_mappings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'active'::text, 'dns_failed'::text, 'tls_failed'::text])))
);


--
-- Name: encryption_maps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encryption_maps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_id text NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    fields_json jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: entity_index_coverage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_index_coverage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    with_deleted boolean DEFAULT false NOT NULL,
    base_count integer DEFAULT 0 NOT NULL,
    indexed_count integer DEFAULT 0 NOT NULL,
    vector_indexed_count integer DEFAULT 0 NOT NULL,
    refreshed_at timestamp with time zone NOT NULL
);


--
-- Name: entity_index_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_index_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    partition_index integer,
    partition_count integer,
    processed_count integer,
    total_count integer,
    heartbeat_at timestamp with time zone,
    status text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone
);


--
-- Name: entity_indexes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_indexes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    doc jsonb NOT NULL,
    embedding jsonb,
    index_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    organization_id_coalesced uuid GENERATED ALWAYS AS (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED NOT NULL
);


--
-- Name: entity_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    translations jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: eudr_due_diligence_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eudr_due_diligence_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    commodity text NOT NULL,
    reference_number text,
    verification_number text,
    status text DEFAULT 'draft'::text NOT NULL,
    quantity_kg numeric(14,3),
    order_id uuid,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    activity_type text,
    actor_role text,
    referenced_statements jsonb DEFAULT '[]'::jsonb NOT NULL,
    supplementary_unit text,
    supplementary_quantity numeric(14,3),
    submitted_at timestamp with time zone,
    reference_issued_at timestamp with time zone,
    order_snapshot jsonb
);


--
-- Name: eudr_evidence_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eudr_evidence_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    supplier_entity_id uuid NOT NULL,
    supplier_snapshot jsonb,
    commodity text NOT NULL,
    product_mapping_id uuid,
    statement_id uuid,
    origin_country text,
    geolocation jsonb,
    quantity_kg numeric(14,3),
    batch_number text,
    harvest_from timestamp with time zone,
    harvest_to timestamp with time zone,
    producer_name text,
    attachment_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    completeness_score integer DEFAULT 0 NOT NULL,
    missing_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    plot_ids jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: eudr_mitigation_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eudr_mitigation_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    risk_assessment_id uuid NOT NULL,
    action_type text DEFAULT 'other'::text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'planned'::text NOT NULL,
    due_date timestamp with time zone,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: eudr_plots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eudr_plots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    supplier_entity_id uuid NOT NULL,
    supplier_snapshot jsonb,
    name text NOT NULL,
    external_id text,
    description text,
    origin_country text NOT NULL,
    plot_type text DEFAULT 'point'::text NOT NULL,
    geometry jsonb NOT NULL,
    area_ha numeric(12,4),
    validation_warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    producer_name text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: eudr_product_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eudr_product_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_snapshot jsonb,
    commodity text NOT NULL,
    hs_code text,
    is_in_scope boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    species_scientific_name text,
    species_common_name text
);


--
-- Name: eudr_risk_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eudr_risk_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    statement_id uuid NOT NULL,
    country_risks jsonb DEFAULT '[]'::jsonb NOT NULL,
    overall_tier text DEFAULT 'unknown'::text NOT NULL,
    criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    conclusion text DEFAULT 'non_negligible'::text NOT NULL,
    is_simplified boolean DEFAULT false NOT NULL,
    assessed_at timestamp with time zone NOT NULL,
    assessed_by_name text,
    review_due_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: example_customer_interaction_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.example_customer_interaction_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    interaction_id uuid NOT NULL,
    todo_id uuid NOT NULL,
    sync_status text DEFAULT 'pending'::text NOT NULL,
    last_synced_at timestamp with time zone,
    last_error text,
    source_updated_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: example_customer_priorities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.example_customer_priorities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: example_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.example_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: example_todo_bulk_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.example_todo_bulk_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    todo_ids jsonb NOT NULL,
    progress_job_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    published_at timestamp with time zone,
    publish_attempts integer DEFAULT 0 NOT NULL,
    last_publish_attempt_at timestamp with time zone,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    next_item_index integer DEFAULT 0 NOT NULL,
    succeeded_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    failed_items jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    from_currency_code text NOT NULL,
    to_currency_code text NOT NULL,
    rate numeric(18,8) NOT NULL,
    date timestamp with time zone NOT NULL,
    source text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    type text
);


--
-- Name: external_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    external_conversation_id text NOT NULL,
    subject text,
    contact_person_id uuid,
    assigned_user_id uuid,
    last_message_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: external_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    external_message_id text NOT NULL,
    direction text NOT NULL,
    sender_identifier text,
    sender_display_name text,
    provider_timestamp timestamp with time zone,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: feature_toggle_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_toggle_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    toggle_id uuid NOT NULL,
    organization_id uuid,
    actor_user_id uuid,
    action text NOT NULL,
    previous_value jsonb,
    new_value jsonb,
    changed_fields jsonb,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: feature_toggle_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_toggle_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    toggle_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    value jsonb NOT NULL
);


--
-- Name: feature_toggles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_toggles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    default_value jsonb NOT NULL,
    type text NOT NULL
);


--
-- Name: gateway_payment_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gateway_payment_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_id text NOT NULL,
    transaction_id uuid NOT NULL,
    operation_type text NOT NULL,
    provider_key text NOT NULL,
    request_hash text NOT NULL,
    provider_idempotency_key text NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    attempt_token text NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    result jsonb,
    lease_expires_at timestamp with time zone,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    reserved_amount numeric(18,4)
);


--
-- Name: gateway_session_initializations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gateway_session_initializations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_key text NOT NULL,
    provider_key text NOT NULL,
    claim_token uuid,
    claimed_at timestamp with time zone,
    gateway_transaction_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: gateway_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gateway_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    provider_key text NOT NULL,
    provider_session_id text,
    gateway_payment_id text,
    gateway_refund_id text,
    unified_status text DEFAULT 'pending'::text NOT NULL,
    gateway_status text,
    redirect_url text,
    client_secret text,
    amount numeric(18,4) NOT NULL,
    currency_code text NOT NULL,
    gateway_metadata jsonb,
    webhook_log jsonb,
    last_webhook_at timestamp with time zone,
    last_polled_at timestamp with time zone,
    expires_at timestamp with time zone,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    captured_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL
);


--
-- Name: gateway_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gateway_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_key text NOT NULL,
    idempotency_key text NOT NULL,
    event_type text NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    processed_at timestamp with time zone NOT NULL
);


--
-- Name: inbox_discrepancies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_discrepancies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid NOT NULL,
    action_id uuid,
    type text NOT NULL,
    severity text NOT NULL,
    description text NOT NULL,
    expected_value text,
    found_value text,
    resolved boolean DEFAULT false NOT NULL,
    metadata jsonb,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: inbox_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id text,
    content_hash text,
    forwarded_by_address text NOT NULL,
    forwarded_by_name text,
    to_address text NOT NULL,
    subject text NOT NULL,
    reply_to text,
    in_reply_to text,
    "references" jsonb,
    raw_text text,
    raw_html text,
    cleaned_text text,
    thread_messages jsonb,
    detected_language text,
    attachment_ids jsonb,
    received_at timestamp with time zone NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    processing_error text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: inbox_proposal_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_proposal_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid NOT NULL,
    sort_order integer NOT NULL,
    action_type text NOT NULL,
    description text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confidence numeric(3,2) NOT NULL,
    required_feature text,
    matched_entity_id uuid,
    matched_entity_type text,
    created_entity_id uuid,
    created_entity_type text,
    execution_error text,
    executed_at timestamp with time zone,
    executed_by_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: inbox_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inbox_email_id uuid NOT NULL,
    summary text NOT NULL,
    participants jsonb NOT NULL,
    confidence numeric(3,2) NOT NULL,
    detected_language text,
    status text DEFAULT 'pending'::text NOT NULL,
    possibly_incomplete boolean DEFAULT false NOT NULL,
    reviewed_by_user_id uuid,
    reviewed_at timestamp with time zone,
    llm_model text,
    llm_tokens_used integer,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    working_language text,
    translations jsonb,
    category text
);


--
-- Name: inbox_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inbox_address text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    working_language text DEFAULT 'en'::text NOT NULL,
    webhook_secret text
);


--
-- Name: indexer_error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indexer_error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    handler text NOT NULL,
    entity_type text,
    record_id text,
    tenant_id uuid,
    organization_id uuid,
    payload jsonb,
    message text NOT NULL,
    stack text,
    occurred_at timestamp with time zone NOT NULL
);


--
-- Name: indexer_status_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indexer_status_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    handler text NOT NULL,
    level text DEFAULT 'info'::text NOT NULL,
    entity_type text,
    record_id text,
    tenant_id uuid,
    organization_id uuid,
    message text NOT NULL,
    details jsonb,
    occurred_at timestamp with time zone NOT NULL
);


--
-- Name: integration_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    credentials jsonb NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    user_id uuid
);


--
-- Name: integration_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    run_id uuid,
    scope_entity_type text,
    scope_entity_id uuid,
    level text NOT NULL,
    message text NOT NULL,
    code text,
    payload jsonb,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: integration_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    api_version text,
    reauth_required boolean DEFAULT false NOT NULL,
    last_health_status text,
    last_health_checked_at timestamp with time zone,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    last_health_latency_ms integer,
    enabled_at timestamp with time zone
);


--
-- Name: manufacturing_bill_of_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_bill_of_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(100) NOT NULL,
    description text,
    product_variant_id uuid,
    product_name character varying(255),
    product_sku character varying(255),
    output_quantity numeric(15,4) DEFAULT 1 NOT NULL,
    unit_of_measure character varying(50),
    status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    material_cost_cents bigint DEFAULT 0 NOT NULL,
    operation_cost_cents bigint DEFAULT 0 NOT NULL,
    total_cost_cents bigint DEFAULT 0 NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: manufacturing_bom_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_bom_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    bom_id uuid NOT NULL,
    line_number integer NOT NULL,
    product_variant_id uuid NOT NULL,
    product_name text NOT NULL,
    product_sku text,
    quantity numeric(15,4) NOT NULL,
    unit_of_measure text,
    wastage_percent numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    unit_cost_cents bigint NOT NULL,
    is_critical boolean DEFAULT false NOT NULL,
    sub_bom_id uuid,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    line_total bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: manufacturing_bom_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_bom_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    bom_id uuid NOT NULL,
    sequence_number integer NOT NULL,
    name text NOT NULL,
    description text,
    work_center_id uuid,
    machine_id uuid,
    setup_time_minutes numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    run_time_minutes numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: manufacturing_boms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_boms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    product_variant_id uuid NOT NULL,
    product_name text NOT NULL,
    output_quantity numeric(15,4) NOT NULL,
    unit_of_measure text,
    status text DEFAULT 'draft'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    material_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    operation_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    total_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    notes text
);


--
-- Name: manufacturing_machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_machines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    status text DEFAULT 'available'::character varying NOT NULL,
    work_center_id uuid,
    make_model text,
    serial_number text,
    purchase_date timestamp with time zone,
    last_maintenance_date timestamp with time zone,
    next_maintenance_date timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: manufacturing_material_consumptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_material_consumptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    production_order_id uuid NOT NULL,
    bom_line_id uuid,
    product_variant_id uuid NOT NULL,
    product_name text NOT NULL,
    product_sku text,
    planned_quantity numeric(15,4) NOT NULL,
    actual_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    wastage_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    unit_of_measure text,
    unit_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    warehouse_id uuid,
    lot_id uuid,
    issued_at timestamp with time zone,
    issued_by uuid,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: manufacturing_production_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_production_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    order_number text NOT NULL,
    bom_id uuid NOT NULL,
    bom_name text NOT NULL,
    product_variant_id uuid NOT NULL,
    product_name text NOT NULL,
    planned_quantity numeric(15,4) NOT NULL,
    produced_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    rejected_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    unit_of_measure text,
    status text DEFAULT 'draft'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    planned_start_date timestamp with time zone,
    planned_end_date timestamp with time zone,
    actual_start_date timestamp with time zone,
    actual_end_date timestamp with time zone,
    warehouse_id uuid,
    material_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    labor_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    overhead_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    total_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    sales_order_id uuid,
    sales_order_number text
);


--
-- Name: manufacturing_production_stage_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_production_stage_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    sequence_number integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    default_work_center_id uuid,
    default_machine_id uuid,
    estimated_setup_minutes numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    estimated_run_minutes numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    requires_quality_check boolean DEFAULT false NOT NULL,
    notes text
);


--
-- Name: manufacturing_production_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_production_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    production_order_id uuid NOT NULL,
    sequence_number integer NOT NULL,
    name text NOT NULL,
    description text,
    work_center_id uuid,
    machine_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    planned_quantity numeric(15,4) NOT NULL,
    produced_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    rejected_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    planned_setup_minutes numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    planned_run_minutes numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    actual_setup_minutes numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    actual_run_minutes numeric(10,2) DEFAULT '0'::numeric NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    operator_id uuid,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: manufacturing_quality_check_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_quality_check_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    inspection_id uuid NOT NULL,
    check_name text NOT NULL,
    description text,
    specification text,
    min_value numeric(15,4),
    max_value numeric(15,4),
    measured_value numeric(15,4),
    text_value text,
    result text,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: manufacturing_quality_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_quality_inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    inspection_number text NOT NULL,
    inspection_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    production_order_id uuid,
    production_stage_id uuid,
    product_variant_id uuid NOT NULL,
    product_name text NOT NULL,
    inspected_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    passed_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    failed_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    overall_result text,
    inspector_id uuid,
    inspected_at timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: manufacturing_work_centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_work_centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    status text DEFAULT 'active'::character varying NOT NULL,
    cost_per_hour_cents bigint DEFAULT '0'::bigint NOT NULL,
    capacity_per_day numeric(15,4),
    unit_of_measure text,
    location text,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: message_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_access_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    use_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: message_channel_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_channel_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    external_conversation_id uuid NOT NULL,
    external_message_id uuid,
    provider_key text NOT NULL,
    channel_type text NOT NULL,
    direction text NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    channel_payload jsonb,
    channel_content_type text,
    interactive_state jsonb,
    channel_metadata jsonb,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: message_confirmations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_confirmations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    confirmed boolean DEFAULT true NOT NULL,
    confirmed_by_user_id uuid,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: message_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    entity_module text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action_required boolean DEFAULT false NOT NULL,
    action_type text,
    action_label text,
    entity_snapshot jsonb,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    emoji text NOT NULL,
    reacted_by_user_id uuid,
    reacted_by_external_id text,
    reacted_by_display_name text,
    provider_key text,
    external_reaction_id text,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT message_reactions_exactly_one_actor_chk CHECK (((reacted_by_user_id IS NULL) <> (reacted_by_external_id IS NULL)))
);


--
-- Name: message_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    recipient_type text DEFAULT 'to'::text NOT NULL,
    status text DEFAULT 'unread'::text NOT NULL,
    read_at timestamp with time zone,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    email_delivered_at timestamp with time zone,
    email_opened_at timestamp with time zone,
    email_failed_at timestamp with time zone,
    email_error text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text DEFAULT 'default'::text NOT NULL,
    thread_id uuid,
    parent_message_id uuid,
    sender_user_id uuid NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    body_format text DEFAULT 'text'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    is_draft boolean DEFAULT true NOT NULL,
    sent_at timestamp with time zone,
    action_data jsonb,
    action_result jsonb,
    action_taken text,
    action_taken_by_user_id uuid,
    action_taken_at timestamp with time zone,
    send_via_email boolean DEFAULT false NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    visibility text,
    source_entity_type text,
    source_entity_id uuid,
    external_email text,
    external_name text,
    external_email_sent_at timestamp with time zone,
    external_email_failed_at timestamp with time zone,
    external_email_error text,
    external_email_hash text,
    idempotency_key text
);


--
-- Name: mikro_orm_migrations_ai_assistant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_ai_assistant (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_ai_assistant_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_ai_assistant_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_ai_assistant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_ai_assistant_id_seq OWNED BY public.mikro_orm_migrations_ai_assistant.id;


--
-- Name: mikro_orm_migrations_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_api_keys (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_api_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_api_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_api_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_api_keys_id_seq OWNED BY public.mikro_orm_migrations_api_keys.id;


--
-- Name: mikro_orm_migrations_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_attachments (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_attachments_id_seq OWNED BY public.mikro_orm_migrations_attachments.id;


--
-- Name: mikro_orm_migrations_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_audit_logs (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_audit_logs_id_seq OWNED BY public.mikro_orm_migrations_audit_logs.id;


--
-- Name: mikro_orm_migrations_auth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_auth (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_auth_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_auth_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_auth_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_auth_id_seq OWNED BY public.mikro_orm_migrations_auth.id;


--
-- Name: mikro_orm_migrations_business_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_business_rules (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_business_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_business_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_business_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_business_rules_id_seq OWNED BY public.mikro_orm_migrations_business_rules.id;


--
-- Name: mikro_orm_migrations_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_catalog (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_catalog_id_seq OWNED BY public.mikro_orm_migrations_catalog.id;


--
-- Name: mikro_orm_migrations_checkout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_checkout (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_checkout_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_checkout_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_checkout_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_checkout_id_seq OWNED BY public.mikro_orm_migrations_checkout.id;


--
-- Name: mikro_orm_migrations_communication_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_communication_channels (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_communication_channels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_communication_channels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_communication_channels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_communication_channels_id_seq OWNED BY public.mikro_orm_migrations_communication_channels.id;


--
-- Name: mikro_orm_migrations_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_configs (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_configs_id_seq OWNED BY public.mikro_orm_migrations_configs.id;


--
-- Name: mikro_orm_migrations_currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_currencies (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_currencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_currencies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_currencies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_currencies_id_seq OWNED BY public.mikro_orm_migrations_currencies.id;


--
-- Name: mikro_orm_migrations_customer_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_customer_accounts (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_customer_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_customer_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_customer_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_customer_accounts_id_seq OWNED BY public.mikro_orm_migrations_customer_accounts.id;


--
-- Name: mikro_orm_migrations_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_customers (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_customers_id_seq OWNED BY public.mikro_orm_migrations_customers.id;


--
-- Name: mikro_orm_migrations_dashboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dashboards (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dashboards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dashboards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dashboards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dashboards_id_seq OWNED BY public.mikro_orm_migrations_dashboards.id;


--
-- Name: mikro_orm_migrations_data_sync; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_data_sync (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_data_sync_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_data_sync_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_data_sync_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_data_sync_id_seq OWNED BY public.mikro_orm_migrations_data_sync.id;


--
-- Name: mikro_orm_migrations_dermat_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_accounts (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_accounts_id_seq OWNED BY public.mikro_orm_migrations_dermat_accounts.id;


--
-- Name: mikro_orm_migrations_dermat_bom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_bom (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_bom_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_bom_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_bom_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_bom_id_seq OWNED BY public.mikro_orm_migrations_dermat_bom.id;


--
-- Name: mikro_orm_migrations_dermat_boms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_boms (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_boms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_boms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_boms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_boms_id_seq OWNED BY public.mikro_orm_migrations_dermat_boms.id;


--
-- Name: mikro_orm_migrations_dermat_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_customers (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_customers_id_seq OWNED BY public.mikro_orm_migrations_dermat_customers.id;


--
-- Name: mikro_orm_migrations_dermat_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_departments (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_departments_id_seq OWNED BY public.mikro_orm_migrations_dermat_departments.id;


--
-- Name: mikro_orm_migrations_dermat_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_lists (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_lists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_lists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_lists_id_seq OWNED BY public.mikro_orm_migrations_dermat_lists.id;


--
-- Name: mikro_orm_migrations_dermat_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_orders (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_orders_id_seq OWNED BY public.mikro_orm_migrations_dermat_orders.id;


--
-- Name: mikro_orm_migrations_dermat_planning; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_planning (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_planning_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_planning_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_planning_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_planning_id_seq OWNED BY public.mikro_orm_migrations_dermat_planning.id;


--
-- Name: mikro_orm_migrations_dermat_pm_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_pm_master (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_pm_master_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_pm_master_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_pm_master_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_pm_master_id_seq OWNED BY public.mikro_orm_migrations_dermat_pm_master.id;


--
-- Name: mikro_orm_migrations_dermat_production; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_production (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_production_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_production_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_production_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_production_id_seq OWNED BY public.mikro_orm_migrations_dermat_production.id;


--
-- Name: mikro_orm_migrations_dermat_purchase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_purchase (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_purchase_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_purchase_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_purchase_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_purchase_id_seq OWNED BY public.mikro_orm_migrations_dermat_purchase.id;


--
-- Name: mikro_orm_migrations_dermat_purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_purchase_orders (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_purchase_orders_id_seq OWNED BY public.mikro_orm_migrations_dermat_purchase_orders.id;


--
-- Name: mikro_orm_migrations_dermat_qc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_qc (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_qc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_qc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_qc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_qc_id_seq OWNED BY public.mikro_orm_migrations_dermat_qc.id;


--
-- Name: mikro_orm_migrations_dermat_quality; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_quality (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_quality_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_quality_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_quality_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_quality_id_seq OWNED BY public.mikro_orm_migrations_dermat_quality.id;


--
-- Name: mikro_orm_migrations_dermat_rm_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_rm_master (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_rm_master_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_rm_master_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_rm_master_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_rm_master_id_seq OWNED BY public.mikro_orm_migrations_dermat_rm_master.id;


--
-- Name: mikro_orm_migrations_dermat_rnd; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_rnd (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_rnd_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_rnd_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_rnd_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_rnd_id_seq OWNED BY public.mikro_orm_migrations_dermat_rnd.id;


--
-- Name: mikro_orm_migrations_dermat_sampling; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_sampling (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_sampling_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_sampling_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_sampling_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_sampling_id_seq OWNED BY public.mikro_orm_migrations_dermat_sampling.id;


--
-- Name: mikro_orm_migrations_dermat_store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_store (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_store_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_store_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_store_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_store_id_seq OWNED BY public.mikro_orm_migrations_dermat_store.id;


--
-- Name: mikro_orm_migrations_dermat_vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_vendors (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_vendors_id_seq OWNED BY public.mikro_orm_migrations_dermat_vendors.id;


--
-- Name: mikro_orm_migrations_dermat_workflow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dermat_workflow (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dermat_workflow_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dermat_workflow_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dermat_workflow_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dermat_workflow_id_seq OWNED BY public.mikro_orm_migrations_dermat_workflow.id;


--
-- Name: mikro_orm_migrations_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_devices (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_devices_id_seq OWNED BY public.mikro_orm_migrations_devices.id;


--
-- Name: mikro_orm_migrations_dictionaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_dictionaries (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_dictionaries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_dictionaries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_dictionaries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_dictionaries_id_seq OWNED BY public.mikro_orm_migrations_dictionaries.id;


--
-- Name: mikro_orm_migrations_directory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_directory (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_directory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_directory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_directory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_directory_id_seq OWNED BY public.mikro_orm_migrations_directory.id;


--
-- Name: mikro_orm_migrations_entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_entities (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_entities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_entities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_entities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_entities_id_seq OWNED BY public.mikro_orm_migrations_entities.id;


--
-- Name: mikro_orm_migrations_eudr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_eudr (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_eudr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_eudr_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_eudr_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_eudr_id_seq OWNED BY public.mikro_orm_migrations_eudr.id;


--
-- Name: mikro_orm_migrations_example; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_example (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_example_customers_sync; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_example_customers_sync (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_example_customers_sync_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_example_customers_sync_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_example_customers_sync_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_example_customers_sync_id_seq OWNED BY public.mikro_orm_migrations_example_customers_sync.id;


--
-- Name: mikro_orm_migrations_example_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_example_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_example_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_example_id_seq OWNED BY public.mikro_orm_migrations_example.id;


--
-- Name: mikro_orm_migrations_feature_toggles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_feature_toggles (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_feature_toggles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_feature_toggles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_feature_toggles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_feature_toggles_id_seq OWNED BY public.mikro_orm_migrations_feature_toggles.id;


--
-- Name: mikro_orm_migrations_inbox_ops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_inbox_ops (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_inbox_ops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_inbox_ops_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_inbox_ops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_inbox_ops_id_seq OWNED BY public.mikro_orm_migrations_inbox_ops.id;


--
-- Name: mikro_orm_migrations_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_integrations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_integrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_integrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_integrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_integrations_id_seq OWNED BY public.mikro_orm_migrations_integrations.id;


--
-- Name: mikro_orm_migrations_manufacturing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_manufacturing (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_manufacturing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_manufacturing_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_manufacturing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_manufacturing_id_seq OWNED BY public.mikro_orm_migrations_manufacturing.id;


--
-- Name: mikro_orm_migrations_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_messages (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_messages_id_seq OWNED BY public.mikro_orm_migrations_messages.id;


--
-- Name: mikro_orm_migrations_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_notifications (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_notifications_id_seq OWNED BY public.mikro_orm_migrations_notifications.id;


--
-- Name: mikro_orm_migrations_onboarding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_onboarding (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_onboarding_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_onboarding_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_onboarding_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_onboarding_id_seq OWNED BY public.mikro_orm_migrations_onboarding.id;


--
-- Name: mikro_orm_migrations_payment_gateways; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_payment_gateways (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_payment_gateways_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_payment_gateways_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_payment_gateways_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_payment_gateways_id_seq OWNED BY public.mikro_orm_migrations_payment_gateways.id;


--
-- Name: mikro_orm_migrations_perspectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_perspectives (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_perspectives_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_perspectives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_perspectives_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_perspectives_id_seq OWNED BY public.mikro_orm_migrations_perspectives.id;


--
-- Name: mikro_orm_migrations_planner; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_planner (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_planner_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_planner_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_planner_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_planner_id_seq OWNED BY public.mikro_orm_migrations_planner.id;


--
-- Name: mikro_orm_migrations_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_progress (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_progress_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_progress_id_seq OWNED BY public.mikro_orm_migrations_progress.id;


--
-- Name: mikro_orm_migrations_purchasing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_purchasing (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_purchasing_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_purchasing_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_purchasing_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_purchasing_id_seq OWNED BY public.mikro_orm_migrations_purchasing.id;


--
-- Name: mikro_orm_migrations_push_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_push_notifications (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_push_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_push_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_push_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_push_notifications_id_seq OWNED BY public.mikro_orm_migrations_push_notifications.id;


--
-- Name: mikro_orm_migrations_query_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_query_index (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_query_index_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_query_index_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_query_index_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_query_index_id_seq OWNED BY public.mikro_orm_migrations_query_index.id;


--
-- Name: mikro_orm_migrations_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_resources (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_resources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_resources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_resources_id_seq OWNED BY public.mikro_orm_migrations_resources.id;


--
-- Name: mikro_orm_migrations_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_sales (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_sales_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_sales_id_seq OWNED BY public.mikro_orm_migrations_sales.id;


--
-- Name: mikro_orm_migrations_scheduler; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_scheduler (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_scheduler_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_scheduler_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_scheduler_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_scheduler_id_seq OWNED BY public.mikro_orm_migrations_scheduler.id;


--
-- Name: mikro_orm_migrations_shipping_carriers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_shipping_carriers (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_shipping_carriers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_shipping_carriers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_shipping_carriers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_shipping_carriers_id_seq OWNED BY public.mikro_orm_migrations_shipping_carriers.id;


--
-- Name: mikro_orm_migrations_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_staff (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_staff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_staff_id_seq OWNED BY public.mikro_orm_migrations_staff.id;


--
-- Name: mikro_orm_migrations_sync_excel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_sync_excel (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_sync_excel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_sync_excel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_sync_excel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_sync_excel_id_seq OWNED BY public.mikro_orm_migrations_sync_excel.id;


--
-- Name: mikro_orm_migrations_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_translations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_translations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_translations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_translations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_translations_id_seq OWNED BY public.mikro_orm_migrations_translations.id;


--
-- Name: mikro_orm_migrations_warranty_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_warranty_claims (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_warranty_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_warranty_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_warranty_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_warranty_claims_id_seq OWNED BY public.mikro_orm_migrations_warranty_claims.id;


--
-- Name: mikro_orm_migrations_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_webhooks (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_webhooks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_webhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_webhooks_id_seq OWNED BY public.mikro_orm_migrations_webhooks.id;


--
-- Name: mikro_orm_migrations_wms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_wms (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_wms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_wms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_wms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_wms_id_seq OWNED BY public.mikro_orm_migrations_wms.id;


--
-- Name: mikro_orm_migrations_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mikro_orm_migrations_workflows (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    executed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP(6) NOT NULL
);


--
-- Name: mikro_orm_migrations_workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mikro_orm_migrations_workflows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mikro_orm_migrations_workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mikro_orm_migrations_workflows_id_seq OWNED BY public.mikro_orm_migrations_workflows.id;


--
-- Name: module_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module_id text NOT NULL,
    name text NOT NULL,
    value_json jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    organization_id uuid,
    tenant_id uuid
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    notification_type_id text NOT NULL,
    channel text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: notification_type_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_type_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    notification_type_id text NOT NULL,
    channels jsonb,
    non_opt_out boolean,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: notification_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_types (
    id text NOT NULL,
    tenant_id uuid,
    label_key text NOT NULL,
    description_key text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    non_opt_out boolean DEFAULT false NOT NULL,
    category text,
    silent boolean DEFAULT false NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    icon text,
    severity text DEFAULT 'info'::text NOT NULL,
    status text DEFAULT 'unread'::text NOT NULL,
    action_data jsonb,
    action_result jsonb,
    action_taken text,
    source_module text,
    source_entity_type text,
    source_entity_id uuid,
    link_href text,
    group_key text,
    created_at timestamp with time zone NOT NULL,
    read_at timestamp with time zone,
    actioned_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    expires_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    title_key text,
    body_key text,
    title_variables jsonb,
    body_variables jsonb,
    data jsonb,
    push_options jsonb,
    channels jsonb
);


--
-- Name: onboarding_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    organization_name text NOT NULL,
    locale text,
    terms_accepted boolean DEFAULT false NOT NULL,
    password_hash text,
    expires_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    tenant_id uuid,
    organization_id uuid,
    user_id uuid,
    last_email_sent_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    processing_started_at timestamp with time zone,
    marketing_consent boolean DEFAULT false,
    preparation_completed_at timestamp with time zone,
    ready_email_sent_at timestamp with time zone,
    preparation_started_at timestamp with time zone,
    email_hash text
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    parent_id uuid,
    root_id uuid,
    tree_path text,
    depth integer DEFAULT 0 NOT NULL,
    ancestor_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    child_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    descendant_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    slug text,
    logo_url text,
    logo_preserve_aspect_ratio boolean DEFAULT false NOT NULL
);


--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: perspectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perspectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    table_id text NOT NULL,
    name text NOT NULL,
    settings_json jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: planner_availability_rule_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planner_availability_rule_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    timezone text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: planner_availability_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planner_availability_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    timezone text NOT NULL,
    rrule text NOT NULL,
    exdates jsonb DEFAULT '[]'::jsonb NOT NULL,
    kind text DEFAULT 'availability'::text NOT NULL,
    note text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    unavailability_reason_entry_id uuid,
    unavailability_reason_value text,
    CONSTRAINT planner_availability_rules_kind_check CHECK ((kind = ANY (ARRAY['availability'::text, 'unavailability'::text]))),
    CONSTRAINT planner_availability_rules_subject_type_check CHECK ((subject_type = ANY (ARRAY['member'::text, 'resource'::text, 'ruleset'::text])))
);


--
-- Name: progress_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.progress_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_type text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    progress_percent smallint DEFAULT 0 NOT NULL,
    processed_count integer DEFAULT 0 NOT NULL,
    total_count integer,
    eta_seconds integer,
    started_by_user_id uuid,
    started_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    finished_at timestamp with time zone,
    result_summary jsonb,
    error_message text,
    error_stack text,
    meta jsonb,
    cancellable boolean DEFAULT false NOT NULL,
    cancelled_by_user_id uuid,
    cancel_requested_at timestamp with time zone,
    parent_job_id uuid,
    partition_index integer,
    partition_count integer,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: purchasing_goods_receipt_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchasing_goods_receipt_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    goods_receipt_id uuid NOT NULL,
    purchase_order_line_id uuid NOT NULL,
    product_variant_id uuid,
    product_name text NOT NULL,
    received_quantity numeric(15,4) NOT NULL,
    accepted_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    rejected_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    batch_number text,
    lot_number text,
    expiry_date timestamp with time zone,
    warehouse_location_id uuid,
    notes text
);


--
-- Name: purchasing_goods_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchasing_goods_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    receipt_number text NOT NULL,
    purchase_order_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    receipt_date timestamp with time zone NOT NULL,
    warehouse_id uuid,
    received_by_user_id uuid,
    notes text
);


--
-- Name: purchasing_purchase_invoice_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchasing_purchase_invoice_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    purchase_invoice_id uuid NOT NULL,
    purchase_order_line_id uuid,
    line_number integer NOT NULL,
    product_variant_id uuid,
    product_name text NOT NULL,
    description text,
    quantity numeric(15,4) NOT NULL,
    unit_of_measure text,
    unit_price_cents bigint NOT NULL,
    line_total bigint DEFAULT '0'::bigint NOT NULL,
    tax_rate numeric(5,2),
    notes text
);


--
-- Name: purchasing_purchase_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchasing_purchase_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    invoice_number text NOT NULL,
    supplier_invoice_number text,
    supplier_id uuid NOT NULL,
    purchase_order_id uuid,
    goods_receipt_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    invoice_date timestamp with time zone NOT NULL,
    due_date timestamp with time zone,
    currency_code text,
    subtotal_cents bigint DEFAULT '0'::bigint NOT NULL,
    tax_cents bigint DEFAULT '0'::bigint NOT NULL,
    total_cents bigint DEFAULT '0'::bigint NOT NULL,
    paid_cents bigint DEFAULT '0'::bigint NOT NULL,
    balance_cents bigint DEFAULT '0'::bigint NOT NULL,
    payment_terms text,
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    notes text
);


--
-- Name: purchasing_purchase_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchasing_purchase_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    purchase_order_id uuid NOT NULL,
    line_number integer NOT NULL,
    product_variant_id uuid,
    product_name text NOT NULL,
    product_sku text,
    description text,
    quantity numeric(15,4) NOT NULL,
    unit_of_measure text,
    unit_price_cents bigint NOT NULL,
    line_total bigint DEFAULT '0'::bigint NOT NULL,
    tax_rate numeric(5,2),
    received_quantity numeric(15,4) DEFAULT '0'::numeric NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text
);


--
-- Name: purchasing_purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchasing_purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    order_number text NOT NULL,
    supplier_id uuid NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    order_date timestamp with time zone NOT NULL,
    expected_delivery_date timestamp with time zone,
    warehouse_id uuid,
    currency_code text,
    subtotal_cents bigint DEFAULT '0'::bigint NOT NULL,
    tax_cents bigint DEFAULT '0'::bigint NOT NULL,
    total_cents bigint DEFAULT '0'::bigint NOT NULL,
    payment_terms text,
    shipping_method text,
    created_by_user_id uuid,
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    notes text
);


--
-- Name: purchasing_supplier_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchasing_supplier_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    supplier_id uuid NOT NULL,
    product_variant_id uuid NOT NULL,
    product_name text NOT NULL,
    product_sku text,
    unit_price_cents bigint NOT NULL,
    currency_code text,
    min_quantity numeric(15,4) DEFAULT '1'::numeric NOT NULL,
    lead_time_days integer,
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    notes text
);


--
-- Name: purchasing_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchasing_suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    contact_name text,
    contact_email text,
    contact_phone text,
    website text,
    tax_id text,
    address_line1 text,
    address_line2 text,
    city text,
    state text,
    postal_code text,
    country text,
    currency_code text,
    payment_terms text,
    lead_time_days integer,
    notes text
);


--
-- Name: push_notification_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_notification_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    notification_id uuid,
    notification_type_id text NOT NULL,
    user_device_id uuid NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    token_snapshot text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    payload jsonb NOT NULL,
    provider_response jsonb,
    created_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL,
    silent boolean DEFAULT false NOT NULL
);


--
-- Name: resources_resource_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources_resource_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    activity_type text NOT NULL,
    subject text,
    body text,
    occurred_at timestamp with time zone,
    author_user_id uuid,
    appearance_icon text,
    appearance_color text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    resource_id uuid NOT NULL
);


--
-- Name: resources_resource_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources_resource_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    body text NOT NULL,
    author_user_id uuid,
    appearance_icon text,
    appearance_color text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    resource_id uuid NOT NULL
);


--
-- Name: resources_resource_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources_resource_tag_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: resources_resource_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources_resource_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    color text,
    description text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: resources_resource_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources_resource_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    appearance_icon text,
    appearance_color text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: resources_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    resource_type_id uuid,
    capacity integer,
    capacity_unit_value text,
    capacity_unit_name text,
    capacity_unit_color text,
    capacity_unit_icon text,
    appearance_icon text,
    appearance_color text,
    is_active boolean DEFAULT true NOT NULL,
    availability_rule_set_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    custom_fieldset_code text
);


--
-- Name: role_acls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_acls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    features_json jsonb,
    is_super_admin boolean DEFAULT false NOT NULL,
    organizations_json jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: role_perspectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_perspectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    table_id text NOT NULL,
    name text NOT NULL,
    settings_json jsonb NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: role_sidebar_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_sidebar_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    tenant_id uuid,
    locale text NOT NULL,
    settings_json jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone,
    min_active_holders integer DEFAULT 0 NOT NULL
);


--
-- Name: rule_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_execution_logs (
    id bigint NOT NULL,
    rule_id uuid NOT NULL,
    entity_id character varying(255) NOT NULL,
    entity_type character varying(50) NOT NULL,
    execution_result character varying(20) NOT NULL,
    input_context jsonb,
    output_context jsonb,
    error_message text,
    execution_time_ms integer NOT NULL,
    executed_at timestamp with time zone NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    executed_by character varying(50)
);


--
-- Name: rule_execution_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rule_execution_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rule_execution_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rule_execution_logs_id_seq OWNED BY public.rule_execution_logs.id;


--
-- Name: rule_set_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_set_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_set_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: rule_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    set_id character varying(50) NOT NULL,
    set_name character varying(200) NOT NULL,
    description text,
    enabled boolean DEFAULT true NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_by character varying(50),
    updated_by character varying(50),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    status_entry_id uuid,
    status text,
    website_url text,
    contact_email text,
    contact_phone text,
    address_line1 text,
    address_line2 text,
    city text,
    region text,
    postal_code text,
    country text,
    latitude numeric(10,6),
    longitude numeric(10,6),
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_credit_memo_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_credit_memo_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    credit_memo_id uuid NOT NULL,
    order_line_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    line_number integer DEFAULT 0 NOT NULL,
    description text,
    quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    quantity_unit text,
    currency_code text NOT NULL,
    unit_price_net numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    unit_price_gross numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    tax_rate numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    metadata jsonb,
    normalized_quantity numeric(18,6) DEFAULT '0'::numeric NOT NULL,
    normalized_unit text,
    uom_snapshot jsonb,
    name text,
    sku text
);


--
-- Name: sales_credit_memos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_credit_memos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    invoice_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    credit_memo_number text NOT NULL,
    status_entry_id uuid,
    status text,
    issue_date timestamp with time zone,
    currency_code text NOT NULL,
    subtotal_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    subtotal_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    tax_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    grand_total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    grand_total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    metadata jsonb,
    custom_field_set_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    reason text
);


--
-- Name: sales_delivery_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_delivery_windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    lead_time_days integer,
    cutoff_time text,
    timezone text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_document_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_document_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    document_id uuid NOT NULL,
    document_kind text NOT NULL,
    order_id uuid,
    quote_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    customer_address_id uuid,
    name text,
    purpose text,
    company_name text,
    address_line1 text NOT NULL,
    address_line2 text,
    city text,
    region text,
    postal_code text,
    country text,
    building_number text,
    flat_number text,
    latitude real,
    longitude real,
    deleted_at timestamp with time zone
);


--
-- Name: sales_document_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_document_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    document_kind text NOT NULL,
    current_value integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_document_tag_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_document_tag_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    document_id uuid NOT NULL,
    document_kind text NOT NULL,
    order_id uuid,
    quote_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: sales_document_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_document_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    color text,
    description text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: sales_invoice_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_invoice_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    order_line_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    line_number integer DEFAULT 0 NOT NULL,
    kind text DEFAULT 'product'::text NOT NULL,
    description text,
    quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    quantity_unit text,
    currency_code text NOT NULL,
    unit_price_net numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    unit_price_gross numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_percent numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    tax_rate numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    metadata jsonb,
    normalized_quantity numeric(18,6) DEFAULT '0'::numeric NOT NULL,
    normalized_unit text,
    uom_snapshot jsonb,
    name text,
    sku text
);


--
-- Name: sales_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    invoice_number text NOT NULL,
    status_entry_id uuid,
    status text,
    issue_date timestamp with time zone,
    due_date timestamp with time zone,
    currency_code text NOT NULL,
    subtotal_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    subtotal_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    tax_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    grand_total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    grand_total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    paid_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    outstanding_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    metadata jsonb,
    custom_field_set_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    context_type text NOT NULL,
    context_id uuid NOT NULL,
    order_id uuid,
    quote_id uuid,
    author_user_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    appearance_icon text,
    appearance_color text,
    deleted_at timestamp with time zone
);


--
-- Name: sales_order_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_order_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    order_line_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    scope text DEFAULT 'order'::text NOT NULL,
    kind text DEFAULT 'custom'::text NOT NULL,
    code text,
    label text,
    calculator_key text,
    promotion_id uuid,
    rate numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    amount_net numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    amount_gross numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    currency_code text,
    metadata jsonb,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    line_number integer DEFAULT 0 NOT NULL,
    kind text DEFAULT 'product'::text NOT NULL,
    status_entry_id uuid,
    status text,
    product_id uuid,
    product_variant_id uuid,
    catalog_snapshot jsonb,
    name text,
    description text,
    comment text,
    quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    quantity_unit text,
    reserved_quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    fulfilled_quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    invoiced_quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    returned_quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    currency_code text NOT NULL,
    unit_price_net numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    unit_price_gross numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_percent numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    tax_rate numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    configuration jsonb,
    promotion_code text,
    promotion_snapshot jsonb,
    metadata jsonb,
    custom_field_set_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    normalized_quantity numeric(18,6) DEFAULT '0'::numeric NOT NULL,
    normalized_unit text,
    uom_snapshot jsonb
);


--
-- Name: sales_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_number text NOT NULL,
    external_reference text,
    customer_reference text,
    customer_entity_id uuid,
    customer_contact_id uuid,
    billing_address_id uuid,
    shipping_address_id uuid,
    currency_code text NOT NULL,
    exchange_rate numeric(18,8),
    status_entry_id uuid,
    status text,
    fulfillment_status_entry_id uuid,
    fulfillment_status text,
    payment_status_entry_id uuid,
    payment_status text,
    tax_strategy_key text,
    discount_strategy_key text,
    shipping_method_snapshot jsonb,
    payment_method_snapshot jsonb,
    placed_at timestamp with time zone,
    expected_delivery_at timestamp with time zone,
    due_at timestamp with time zone,
    comments text,
    internal_notes text,
    subtotal_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    subtotal_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    tax_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    shipping_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    shipping_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    surcharge_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    grand_total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    grand_total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    paid_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    refunded_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    outstanding_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    line_item_count integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    custom_field_set_id uuid,
    channel_id uuid,
    channel_ref_id uuid,
    shipping_method_id uuid,
    shipping_method_ref_id uuid,
    delivery_window_id uuid,
    delivery_window_ref_id uuid,
    payment_method_id uuid,
    payment_method_ref_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    customer_snapshot jsonb,
    billing_address_snapshot jsonb,
    shipping_address_snapshot jsonb,
    tax_info jsonb,
    delivery_window_snapshot jsonb,
    shipping_method_code text,
    delivery_window_code text,
    payment_method_code text,
    totals_snapshot jsonb
);


--
-- Name: sales_payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_payment_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid NOT NULL,
    order_id uuid,
    invoice_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    currency_code text NOT NULL,
    metadata jsonb
);


--
-- Name: sales_payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    provider_key text,
    terms text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    payment_method_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    payment_reference text,
    status_entry_id uuid,
    status text,
    amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    currency_code text NOT NULL,
    captured_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    refunded_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    received_at timestamp with time zone,
    captured_at timestamp with time zone,
    metadata jsonb,
    custom_field_set_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_quote_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_quote_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    quote_line_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    scope text DEFAULT 'order'::text NOT NULL,
    kind text DEFAULT 'custom'::text NOT NULL,
    code text,
    label text,
    calculator_key text,
    promotion_id uuid,
    rate numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    amount_net numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    amount_gross numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    currency_code text,
    metadata jsonb,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_quote_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_quote_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    line_number integer DEFAULT 0 NOT NULL,
    kind text DEFAULT 'product'::text NOT NULL,
    status_entry_id uuid,
    status text,
    product_id uuid,
    product_variant_id uuid,
    catalog_snapshot jsonb,
    name text,
    description text,
    comment text,
    quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    quantity_unit text,
    currency_code text NOT NULL,
    unit_price_net numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    unit_price_gross numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_percent numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    tax_rate numeric(7,4) DEFAULT '0'::numeric NOT NULL,
    tax_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    configuration jsonb,
    promotion_code text,
    promotion_snapshot jsonb,
    metadata jsonb,
    custom_field_set_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    normalized_quantity numeric(18,6) DEFAULT '0'::numeric NOT NULL,
    normalized_unit text,
    uom_snapshot jsonb
);


--
-- Name: sales_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    quote_number text NOT NULL,
    status_entry_id uuid,
    status text,
    customer_entity_id uuid,
    customer_contact_id uuid,
    currency_code text NOT NULL,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    comments text,
    subtotal_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    subtotal_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    discount_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    tax_total_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    grand_total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    grand_total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    line_item_count integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    custom_field_set_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    converted_order_id uuid,
    customer_snapshot jsonb,
    billing_address_id uuid,
    shipping_address_id uuid,
    billing_address_snapshot jsonb,
    shipping_address_snapshot jsonb,
    tax_info jsonb,
    shipping_method_id uuid,
    shipping_method_code text,
    shipping_method_ref_id uuid,
    delivery_window_id uuid,
    delivery_window_code text,
    delivery_window_ref_id uuid,
    payment_method_id uuid,
    payment_method_code text,
    payment_method_ref_id uuid,
    shipping_method_snapshot jsonb,
    delivery_window_snapshot jsonb,
    payment_method_snapshot jsonb,
    channel_id uuid,
    channel_ref_id uuid,
    external_reference text,
    customer_reference text,
    placed_at timestamp with time zone,
    totals_snapshot jsonb,
    acceptance_token text,
    sent_at timestamp with time zone
);


--
-- Name: sales_return_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_return_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_id uuid NOT NULL,
    order_line_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    quantity_returned numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    unit_price_net numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    unit_price_gross numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_net_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_gross_amount numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    return_number text NOT NULL,
    status_entry_id uuid,
    status text,
    reason text,
    notes text,
    returned_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sales_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_number_format text DEFAULT 'ORDER-{yyyy}{mm}{dd}-{seq:5}'::text NOT NULL,
    quote_number_format text DEFAULT 'QUOTE-{yyyy}{mm}{dd}-{seq:5}'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    order_customer_editable_statuses jsonb,
    order_address_editable_statuses jsonb
);


--
-- Name: sales_shipment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_shipment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shipment_id uuid NOT NULL,
    order_line_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    quantity numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    metadata jsonb
);


--
-- Name: sales_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    shipment_number text,
    shipping_method_id uuid,
    status_entry_id uuid,
    status text,
    carrier_name text,
    tracking_numbers jsonb,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    weight_value numeric(16,4),
    weight_unit text,
    declared_value_net numeric(18,4),
    declared_value_gross numeric(18,4),
    currency_code text,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    items_snapshot jsonb
);


--
-- Name: sales_shipping_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_shipping_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    carrier_code text,
    service_level text,
    estimated_transit_days integer,
    base_rate_net numeric(16,4) DEFAULT '0'::numeric NOT NULL,
    base_rate_gross numeric(16,4) DEFAULT '0'::numeric NOT NULL,
    currency_code text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    provider_key text
);


--
-- Name: sales_tax_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_tax_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    rate numeric(7,4) NOT NULL,
    country_code text,
    region_code text,
    postal_code text,
    city text,
    customer_group_id uuid,
    product_category_id uuid,
    channel_id uuid,
    priority integer DEFAULT 0 NOT NULL,
    is_compound boolean DEFAULT false NOT NULL,
    metadata jsonb,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: scheduled_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    scope_type text DEFAULT 'tenant'::text NOT NULL,
    name text NOT NULL,
    description text,
    schedule_type text NOT NULL,
    schedule_value text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    target_type text NOT NULL,
    target_queue text,
    target_command text,
    target_payload jsonb,
    require_feature text,
    is_enabled boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    source_type text DEFAULT 'user'::text NOT NULL,
    source_module text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by_user_id uuid,
    updated_by_user_id uuid
);


--
-- Name: search_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    organization_id uuid,
    tenant_id uuid,
    field text NOT NULL,
    token_hash text NOT NULL,
    token text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: sidebar_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sidebar_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    locale text NOT NULL,
    name text NOT NULL,
    settings_json jsonb,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: staff_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    member_id uuid NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    timezone text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    unavailability_reason_entry_id uuid,
    unavailability_reason_value text,
    note text,
    decision_comment text,
    submitted_by_user_id uuid,
    decided_by_user_id uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT staff_leave_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: staff_team_member_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_team_member_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    activity_type text NOT NULL,
    subject text,
    body text,
    occurred_at timestamp with time zone,
    author_user_id uuid,
    appearance_icon text,
    appearance_color text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    member_id uuid NOT NULL
);


--
-- Name: staff_team_member_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_team_member_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text,
    purpose text,
    company_name text,
    address_line1 text NOT NULL,
    address_line2 text,
    city text,
    region text,
    postal_code text,
    country text,
    building_number text,
    flat_number text,
    latitude real,
    longitude real,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    member_id uuid NOT NULL
);


--
-- Name: staff_team_member_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_team_member_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    body text NOT NULL,
    author_user_id uuid,
    appearance_icon text,
    appearance_color text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    member_id uuid NOT NULL
);


--
-- Name: staff_team_member_job_histories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_team_member_job_histories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    company_name text,
    description text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    member_id uuid NOT NULL
);


--
-- Name: staff_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    team_id uuid,
    display_name text NOT NULL,
    description text,
    user_id uuid,
    role_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    availability_rule_set_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: staff_team_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_team_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    team_id uuid,
    name text NOT NULL,
    description text,
    appearance_icon text,
    appearance_color text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: staff_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: staff_time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    staff_member_id uuid NOT NULL,
    date date NOT NULL,
    duration_minutes integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    notes text,
    time_project_id uuid,
    customer_id uuid,
    deal_id uuid,
    order_id uuid,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT staff_time_entries_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'timer'::text, 'kiosk'::text, 'mobile'::text])))
);


--
-- Name: staff_time_entry_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_time_entry_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    time_entry_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    segment_type text DEFAULT 'work'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT staff_time_entry_segments_segment_type_check CHECK ((segment_type = ANY (ARRAY['work'::text, 'break'::text])))
);


--
-- Name: staff_time_project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_time_project_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    time_project_id uuid NOT NULL,
    staff_member_id uuid NOT NULL,
    role text,
    status text DEFAULT 'active'::text NOT NULL,
    assigned_start_date date NOT NULL,
    assigned_end_date date,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    show_in_grid boolean DEFAULT false NOT NULL,
    CONSTRAINT staff_time_project_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: staff_time_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_time_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    customer_id uuid,
    code text NOT NULL,
    description text,
    project_type text,
    status text DEFAULT 'active'::text NOT NULL,
    owner_user_id uuid,
    cost_center text,
    start_date date,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    color character varying(20),
    CONSTRAINT staff_time_projects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'on_hold'::text, 'completed'::text])))
);


--
-- Name: step_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.step_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_instance_id uuid NOT NULL,
    step_id character varying(100) NOT NULL,
    step_name character varying(255) NOT NULL,
    step_type character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    input_data jsonb,
    output_data jsonb,
    error_data jsonb,
    entered_at timestamp with time zone,
    exited_at timestamp with time zone,
    execution_time_ms integer,
    retry_count integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    branch_instance_id uuid
);


--
-- Name: sync_cursors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_cursors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    entity_type text NOT NULL,
    direction text NOT NULL,
    cursor text,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: sync_excel_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_excel_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attachment_id uuid NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    file_size integer NOT NULL,
    entity_type text NOT NULL,
    delimiter text,
    encoding text,
    headers jsonb NOT NULL,
    sample_rows jsonb NOT NULL,
    total_rows integer NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    sync_run_id uuid,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: sync_external_id_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_external_id_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    internal_entity_type text NOT NULL,
    internal_entity_id uuid NOT NULL,
    external_id text NOT NULL,
    sync_status text DEFAULT 'not_synced'::text NOT NULL,
    last_synced_at timestamp with time zone,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: sync_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    entity_type text NOT NULL,
    mapping jsonb NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    entity_type text NOT NULL,
    direction text NOT NULL,
    status text NOT NULL,
    cursor text,
    initial_cursor text,
    created_count integer DEFAULT 0 NOT NULL,
    updated_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    batches_completed integer DEFAULT 0 NOT NULL,
    last_error text,
    progress_job_id uuid,
    job_id text,
    triggered_by text,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    parameters jsonb
);


--
-- Name: sync_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id text NOT NULL,
    entity_type text NOT NULL,
    direction text NOT NULL,
    schedule_type text NOT NULL,
    schedule_value text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    full_sync boolean DEFAULT false NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    scheduled_job_id uuid,
    last_run_at timestamp with time zone,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: todos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.todos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    is_done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    notes text
);


--
-- Name: upgrade_action_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upgrade_action_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    action_id text NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: user_acls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_acls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    features_json jsonb,
    is_super_admin boolean DEFAULT false NOT NULL,
    organizations_json jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: user_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    consent_type text NOT NULL,
    is_granted boolean DEFAULT false NOT NULL,
    granted_at timestamp with time zone,
    withdrawn_at timestamp with time zone,
    source text,
    ip_address text,
    integrity_hash text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: user_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    user_id uuid NOT NULL,
    device_id text NOT NULL,
    platform text NOT NULL,
    client_app_version text,
    os_version text,
    push_token text,
    push_provider text,
    push_token_updated_at timestamp with time zone,
    last_seen_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    locale text
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: user_sidebar_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sidebar_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    locale text NOT NULL,
    settings_json jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: user_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_instance_id uuid NOT NULL,
    step_instance_id uuid NOT NULL,
    task_name character varying(255) NOT NULL,
    description text,
    status character varying(20) NOT NULL,
    form_schema jsonb,
    form_data jsonb,
    assigned_to character varying(255),
    assigned_to_roles text[],
    claimed_by character varying(255),
    claimed_at timestamp with time zone,
    due_date timestamp with time zone,
    escalated_at timestamp with time zone,
    escalated_to character varying(255),
    completed_by character varying(255),
    completed_at timestamp with time zone,
    comments text,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    branch_instance_id uuid
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    organization_id uuid,
    email text NOT NULL,
    name text,
    password_hash text,
    is_confirmed boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    email_hash text,
    updated_at timestamp with time zone
);


--
-- Name: warranty_claim_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    kind text NOT NULL,
    visibility text DEFAULT 'internal'::text NOT NULL,
    body text,
    payload jsonb,
    actor_user_id uuid,
    actor_customer_id uuid,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: warranty_claim_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    line_no integer NOT NULL,
    product_id uuid,
    variant_id uuid,
    sku text,
    product_name text,
    order_line_id uuid,
    serial_number text,
    lot_number text,
    purchase_date timestamp with time zone,
    warranty_months integer,
    warranty_expires_at timestamp with time zone,
    warranty_status text DEFAULT 'unknown'::text NOT NULL,
    fault_code text,
    fault_description text,
    qty_claimed numeric(18,4) DEFAULT '1'::numeric NOT NULL,
    qty_approved numeric(18,4),
    qty_received numeric(18,4),
    condition_on_receipt text,
    inspection_notes text,
    disposition text,
    line_status text DEFAULT 'pending'::text NOT NULL,
    credit_amount numeric(18,4),
    restocking_fee numeric(18,4),
    core_charge_amount numeric(18,4),
    core_credit_amount numeric(18,4),
    vendor_claim_line_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    condition_grade text,
    quarantine_status text DEFAULT 'none'::text NOT NULL,
    assessment_payload jsonb,
    vendor_name text
);


--
-- Name: warranty_claim_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    serial_number text,
    product_id uuid,
    variant_id uuid,
    sku text,
    product_name text,
    customer_id uuid,
    order_id uuid,
    purchase_date timestamp with time zone,
    warranty_months integer,
    warranty_expires_at timestamp with time zone,
    coverage_type text,
    source text,
    proof_attachment_id uuid,
    notes text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: warranty_claim_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    claim_type text NOT NULL,
    next_number integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: warranty_claim_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    sla_hours integer DEFAULT 48 NOT NULL,
    sla_pause_on_info_requested boolean DEFAULT true NOT NULL,
    sla_at_risk_threshold_pct integer DEFAULT 75 NOT NULL,
    auto_approve_enabled boolean DEFAULT false NOT NULL,
    auto_approve_max_amount numeric(18,4),
    auto_approve_currency_code text,
    auto_approve_require_in_warranty boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    default_warranty_months integer,
    business_hours jsonb,
    escalation_tiers jsonb,
    adjudication_use_rules boolean DEFAULT false NOT NULL,
    quarantine_grades jsonb,
    return_label_provider text,
    return_window_days integer
);


--
-- Name: warranty_claim_sla_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_sla_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    claim_id uuid NOT NULL,
    event_id text NOT NULL,
    cycle_key text NOT NULL,
    payload jsonb NOT NULL,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    published_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: warranty_claim_troubleshooting_guides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_troubleshooting_guides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    claim_type text,
    reason_code text,
    title text NOT NULL,
    steps jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: warranty_claim_vendor_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claim_vendor_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    vendor_name text NOT NULL,
    vendor_ref text,
    coverage_months integer,
    claimable_reason_codes jsonb,
    recovery_rate_pct numeric(5,2),
    contact_email text,
    auto_generate_recovery boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: warranty_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    claim_number text NOT NULL,
    claim_type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    channel text DEFAULT 'staff'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    customer_id uuid,
    customer_name text,
    vendor_name text,
    vendor_ref text,
    order_id uuid,
    sales_return_id uuid,
    replacement_order_id uuid,
    source_claim_id uuid,
    advance_replacement boolean DEFAULT false NOT NULL,
    advance_shipped_at timestamp with time zone,
    reason_code text,
    rejection_reason_code text,
    resolution_summary text,
    notes text,
    currency_code text,
    total_claimed_amount numeric(18,4),
    total_approved_amount numeric(18,4),
    total_recovered_amount numeric(18,4),
    sla_due_at timestamp with time zone,
    submitted_at timestamp with time zone,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    assignee_user_id uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    sla_paused_at timestamp with time zone,
    external_ref text,
    contact_email text,
    return_label_url text,
    return_tracking_number text,
    return_carrier text,
    escalation_level integer DEFAULT 0 NOT NULL,
    escalated_at timestamp with time zone,
    intake_message_ref text,
    entitlement_source text,
    order_number text,
    awaiting_staff_reply boolean DEFAULT false NOT NULL,
    sla_at_risk_notified_at timestamp with time zone,
    sla_breached_notified_at timestamp with time zone,
    credit_memo_id uuid
);


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    event_type text NOT NULL,
    message_id text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    response_status integer,
    response_body text,
    response_headers jsonb,
    error_message text,
    attempt_number integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 10 NOT NULL,
    next_retry_at timestamp with time zone,
    duration_ms integer,
    target_url text NOT NULL,
    enqueued_at timestamp with time zone NOT NULL,
    last_attempt_at timestamp with time zone,
    delivered_at timestamp with time zone,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: webhook_inbound_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_inbound_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    integration_id text,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: webhook_inbound_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_inbound_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endpoint_id text NOT NULL,
    message_id text NOT NULL,
    provider_key text NOT NULL,
    event_type text,
    organization_id uuid,
    tenant_id uuid,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: webhook_ingestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_ingestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_key text NOT NULL,
    event_type text NOT NULL,
    external_message_id text,
    payload jsonb NOT NULL,
    headers jsonb,
    status text DEFAULT 'received'::text NOT NULL,
    error_message text,
    processed_at timestamp with time zone,
    handler_count integer DEFAULT 0 NOT NULL,
    handler_results jsonb,
    duration_ms integer,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    url text NOT NULL,
    secret text NOT NULL,
    previous_secret text,
    previous_secret_set_at timestamp with time zone,
    subscribed_events jsonb NOT NULL,
    http_method text DEFAULT 'POST'::text NOT NULL,
    custom_headers jsonb,
    is_active boolean DEFAULT true NOT NULL,
    delivery_strategy text DEFAULT 'http'::text NOT NULL,
    strategy_config jsonb,
    max_retries integer DEFAULT 10 NOT NULL,
    timeout_ms integer DEFAULT 15000 NOT NULL,
    rate_limit_per_minute integer DEFAULT 0 NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    auto_disable_threshold integer DEFAULT 100 NOT NULL,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    integration_id text,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: wms_inventory_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_inventory_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    warehouse_id uuid NOT NULL,
    location_id uuid NOT NULL,
    catalog_variant_id uuid NOT NULL,
    lot_id uuid,
    serial_number text,
    quantity_on_hand numeric(16,4) DEFAULT '0'::numeric NOT NULL,
    quantity_reserved numeric(16,4) DEFAULT '0'::numeric NOT NULL,
    quantity_allocated numeric(16,4) DEFAULT '0'::numeric NOT NULL,
    quantity_available numeric(16,4) GENERATED ALWAYS AS (((quantity_on_hand - quantity_reserved) - quantity_allocated)) STORED NOT NULL
);


--
-- Name: wms_inventory_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_inventory_lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    catalog_variant_id uuid NOT NULL,
    sku text NOT NULL,
    lot_number text NOT NULL,
    batch_number text,
    manufactured_at timestamp with time zone,
    best_before_at timestamp with time zone,
    expires_at timestamp with time zone,
    status text DEFAULT 'available'::text NOT NULL
);


--
-- Name: wms_inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    warehouse_id uuid NOT NULL,
    location_from_id uuid,
    location_to_id uuid,
    catalog_variant_id uuid NOT NULL,
    lot_id uuid,
    serial_number text,
    quantity numeric(16,4) NOT NULL,
    type text NOT NULL,
    reference_type text NOT NULL,
    reference_id uuid NOT NULL,
    performed_by uuid NOT NULL,
    performed_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone NOT NULL,
    reason text,
    idempotency_key text,
    reason_code text
);


--
-- Name: wms_inventory_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_inventory_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    warehouse_id uuid NOT NULL,
    catalog_variant_id uuid NOT NULL,
    lot_id uuid,
    serial_number text,
    quantity numeric(16,4) NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    expires_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    idempotency_key text
);


--
-- Name: wms_product_inventory_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_product_inventory_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    catalog_product_id uuid NOT NULL,
    catalog_variant_id uuid,
    default_uom text NOT NULL,
    track_lot boolean DEFAULT false NOT NULL,
    track_serial boolean DEFAULT false NOT NULL,
    track_expiration boolean DEFAULT false NOT NULL,
    default_strategy text NOT NULL,
    reorder_point numeric(16,4) DEFAULT '0'::numeric NOT NULL,
    safety_stock numeric(16,4) DEFAULT '0'::numeric NOT NULL
);


--
-- Name: wms_sales_order_warehouse_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_sales_order_warehouse_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    sales_order_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    assigned_by uuid,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: wms_stock_valuations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_stock_valuations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    catalog_variant_id uuid NOT NULL,
    lot_id uuid,
    quantity_on_hand numeric(16,4) DEFAULT '0'::numeric NOT NULL,
    unit_cost_cents bigint DEFAULT '0'::bigint NOT NULL,
    total_value_cents bigint DEFAULT '0'::bigint NOT NULL,
    valuation_method text DEFAULT 'weighted_average'::text NOT NULL,
    last_purchase_cost_cents bigint,
    standard_cost_cents bigint,
    currency_code text DEFAULT 'INR'::text NOT NULL,
    last_valued_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: wms_warehouse_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_warehouse_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    warehouse_id uuid NOT NULL,
    code text NOT NULL,
    type text NOT NULL,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    capacity_units numeric(16,4),
    capacity_weight numeric(16,4),
    constraints jsonb
);


--
-- Name: wms_warehouse_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_warehouse_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    warehouse_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    priority integer DEFAULT 0 NOT NULL
);


--
-- Name: wms_warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wms_warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    name text NOT NULL,
    code text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    address_line1 text,
    city text,
    postal_code text,
    country text,
    timezone text,
    is_primary boolean DEFAULT false NOT NULL
);


--
-- Name: workflow_branch_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_branch_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_instance_id uuid NOT NULL,
    fork_step_id character varying(100) NOT NULL,
    join_step_id character varying(100) NOT NULL,
    branch_key character varying(100) NOT NULL,
    parent_branch_id uuid,
    current_step_id character varying(100) NOT NULL,
    status character varying(30) NOT NULL,
    context_namespace jsonb NOT NULL,
    pending_transition jsonb,
    error_message text,
    error_details jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


--
-- Name: workflow_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id character varying(100) NOT NULL,
    workflow_name character varying(255) NOT NULL,
    description text,
    version integer DEFAULT 1 NOT NULL,
    definition jsonb NOT NULL,
    metadata jsonb,
    enabled boolean DEFAULT true NOT NULL,
    effective_from timestamp with time zone,
    effective_to timestamp with time zone,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    code_workflow_id character varying(100)
);


--
-- Name: workflow_event_triggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_event_triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    workflow_definition_id uuid NOT NULL,
    event_pattern character varying(255) NOT NULL,
    config jsonb,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp(6) with time zone NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    deleted_at timestamp(6) with time zone
);


--
-- Name: workflow_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_events (
    id bigint NOT NULL,
    workflow_instance_id uuid NOT NULL,
    step_instance_id uuid,
    event_type character varying(50) NOT NULL,
    event_data jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    user_id character varying(255),
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    branch_instance_id uuid
);


--
-- Name: workflow_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_events_id_seq OWNED BY public.workflow_events.id;


--
-- Name: workflow_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    definition_id uuid NOT NULL,
    workflow_id character varying(100) NOT NULL,
    version integer NOT NULL,
    status character varying(30) NOT NULL,
    current_step_id character varying(100) NOT NULL,
    context jsonb NOT NULL,
    correlation_key character varying(255),
    metadata jsonb,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    paused_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    error_message text,
    error_details jsonb,
    retry_count integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    pending_transition jsonb,
    active_fork_step_id character varying(100)
);


--
-- Name: mikro_orm_migrations_ai_assistant id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_ai_assistant ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_ai_assistant_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_api_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_api_keys ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_api_keys_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_attachments ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_attachments_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_audit_logs_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_auth id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_auth ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_auth_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_business_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_business_rules ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_business_rules_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_catalog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_catalog ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_catalog_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_checkout id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_checkout ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_checkout_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_communication_channels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_communication_channels ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_communication_channels_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_configs ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_configs_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_currencies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_currencies ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_currencies_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_customer_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_customer_accounts ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_customer_accounts_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_customers ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_customers_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dashboards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dashboards ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dashboards_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_data_sync id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_data_sync ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_data_sync_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_accounts ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_accounts_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_bom id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_bom ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_bom_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_boms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_boms ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_boms_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_customers ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_customers_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_departments ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_departments_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_lists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_lists ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_lists_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_orders ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_orders_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_planning id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_planning ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_planning_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_pm_master id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_pm_master ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_pm_master_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_production id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_production ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_production_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_purchase id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_purchase ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_purchase_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_purchase_orders_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_qc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_qc ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_qc_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_quality id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_quality ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_quality_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_rm_master id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_rm_master ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_rm_master_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_rnd id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_rnd ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_rnd_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_sampling id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_sampling ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_sampling_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_store id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_store ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_store_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_vendors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_vendors ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_vendors_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dermat_workflow id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_workflow ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dermat_workflow_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_devices ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_devices_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_dictionaries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dictionaries ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_dictionaries_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_directory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_directory ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_directory_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_entities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_entities ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_entities_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_eudr id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_eudr ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_eudr_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_example id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_example ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_example_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_example_customers_sync id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_example_customers_sync ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_example_customers_sync_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_feature_toggles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_feature_toggles ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_feature_toggles_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_inbox_ops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_inbox_ops ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_inbox_ops_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_integrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_integrations ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_integrations_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_manufacturing id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_manufacturing ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_manufacturing_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_messages ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_messages_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_notifications ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_notifications_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_onboarding id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_onboarding ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_onboarding_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_payment_gateways id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_payment_gateways ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_payment_gateways_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_perspectives id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_perspectives ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_perspectives_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_planner id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_planner ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_planner_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_progress id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_progress ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_progress_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_purchasing id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_purchasing ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_purchasing_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_push_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_push_notifications ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_push_notifications_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_query_index id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_query_index ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_query_index_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_resources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_resources ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_resources_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_sales ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_sales_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_scheduler id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_scheduler ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_scheduler_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_shipping_carriers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_shipping_carriers ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_shipping_carriers_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_staff id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_staff ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_staff_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_sync_excel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_sync_excel ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_sync_excel_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_translations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_translations ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_translations_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_warranty_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_warranty_claims ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_warranty_claims_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_webhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_webhooks ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_webhooks_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_wms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_wms ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_wms_id_seq'::regclass);


--
-- Name: mikro_orm_migrations_workflows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_workflows ALTER COLUMN id SET DEFAULT nextval('public.mikro_orm_migrations_workflows_id_seq'::regclass);


--
-- Name: rule_execution_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_execution_logs ALTER COLUMN id SET DEFAULT nextval('public.rule_execution_logs_id_seq'::regclass);


--
-- Name: workflow_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_events ALTER COLUMN id SET DEFAULT nextval('public.workflow_events_id_seq'::regclass);


--
-- Name: access_logs access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_logs
    ADD CONSTRAINT access_logs_pkey PRIMARY KEY (id);


--
-- Name: action_logs action_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_logs
    ADD CONSTRAINT action_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_mutation_policy_overrides ai_agent_mutation_policy_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_mutation_policy_overrides
    ADD CONSTRAINT ai_agent_mutation_policy_overrides_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_prompt_overrides ai_agent_prompt_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_prompt_overrides
    ADD CONSTRAINT ai_agent_prompt_overrides_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_runtime_overrides ai_agent_runtime_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_runtime_overrides
    ADD CONSTRAINT ai_agent_runtime_overrides_pkey PRIMARY KEY (id);


--
-- Name: ai_chat_conversation_participants ai_chat_conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_conversation_participants
    ADD CONSTRAINT ai_chat_conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: ai_chat_conversations ai_chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_conversations
    ADD CONSTRAINT ai_chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_chat_messages ai_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chat_messages
    ADD CONSTRAINT ai_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: ai_moderation_flags ai_moderation_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_moderation_flags
    ADD CONSTRAINT ai_moderation_flags_pkey PRIMARY KEY (id);


--
-- Name: ai_pending_actions ai_pending_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_pending_actions
    ADD CONSTRAINT ai_pending_actions_pkey PRIMARY KEY (id);


--
-- Name: ai_tenant_model_allowlists ai_tenant_model_allowlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tenant_model_allowlists
    ADD CONSTRAINT ai_tenant_model_allowlists_pkey PRIMARY KEY (id);


--
-- Name: ai_token_usage_daily ai_token_usage_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_token_usage_daily
    ADD CONSTRAINT ai_token_usage_daily_pkey PRIMARY KEY (id);


--
-- Name: ai_token_usage_events ai_token_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_token_usage_events
    ADD CONSTRAINT ai_token_usage_events_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_prefix_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_prefix_unique UNIQUE (key_prefix);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: attachment_partitions attachment_partitions_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachment_partitions
    ADD CONSTRAINT attachment_partitions_code_unique UNIQUE (code);


--
-- Name: attachment_partitions attachment_partitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachment_partitions
    ADD CONSTRAINT attachment_partitions_pkey PRIMARY KEY (id);


--
-- Name: attachment_quota_reservations attachment_quota_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachment_quota_reservations
    ADD CONSTRAINT attachment_quota_reservations_pkey PRIMARY KEY (id);


--
-- Name: attachment_quota_reservations attachment_quota_reservations_scope_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachment_quota_reservations
    ADD CONSTRAINT attachment_quota_reservations_scope_path_unique UNIQUE (tenant_id, storage_driver, storage_path);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: business_rules business_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_rules
    ADD CONSTRAINT business_rules_pkey PRIMARY KEY (id);


--
-- Name: business_rules business_rules_rule_id_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_rules
    ADD CONSTRAINT business_rules_rule_id_tenant_id_unique UNIQUE (rule_id, tenant_id);


--
-- Name: carrier_shipment_idempotency_keys carrier_shipment_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipment_idempotency_keys
    ADD CONSTRAINT carrier_shipment_idempotency_keys_pkey PRIMARY KEY (id);


--
-- Name: carrier_shipment_idempotency_keys carrier_shipment_idempotency_keys_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipment_idempotency_keys
    ADD CONSTRAINT carrier_shipment_idempotency_keys_unique UNIQUE (idempotency_key, provider_key, organization_id, tenant_id);


--
-- Name: carrier_shipments carrier_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_shipments
    ADD CONSTRAINT carrier_shipments_pkey PRIMARY KEY (id);


--
-- Name: carrier_webhook_events carrier_webhook_events_idempotency_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_webhook_events
    ADD CONSTRAINT carrier_webhook_events_idempotency_unique UNIQUE (idempotency_key, provider_key, organization_id, tenant_id);


--
-- Name: carrier_webhook_events carrier_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_webhook_events
    ADD CONSTRAINT carrier_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: catalog_price_kinds catalog_price_kinds_code_tenant_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_price_kinds
    ADD CONSTRAINT catalog_price_kinds_code_tenant_unique UNIQUE (tenant_id, code);


--
-- Name: catalog_price_kinds catalog_price_kinds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_price_kinds
    ADD CONSTRAINT catalog_price_kinds_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_categories catalog_product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_categories
    ADD CONSTRAINT catalog_product_categories_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_categories catalog_product_categories_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_categories
    ADD CONSTRAINT catalog_product_categories_slug_unique UNIQUE (organization_id, tenant_id, slug);


--
-- Name: catalog_product_category_assignments catalog_product_category_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_category_assignments
    ADD CONSTRAINT catalog_product_category_assignments_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_category_assignments catalog_product_category_assignments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_category_assignments
    ADD CONSTRAINT catalog_product_category_assignments_unique UNIQUE (product_id, category_id);


--
-- Name: catalog_product_offers catalog_product_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_offers
    ADD CONSTRAINT catalog_product_offers_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_offers catalog_product_offers_product_channel_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_offers
    ADD CONSTRAINT catalog_product_offers_product_channel_unique UNIQUE (product_id, organization_id, tenant_id, channel_id);


--
-- Name: catalog_product_option_schemas catalog_product_option_schemas_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_option_schemas
    ADD CONSTRAINT catalog_product_option_schemas_code_unique UNIQUE (organization_id, tenant_id, code);


--
-- Name: catalog_product_option_schemas catalog_product_option_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_option_schemas
    ADD CONSTRAINT catalog_product_option_schemas_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_option_values catalog_product_option_values_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_option_values
    ADD CONSTRAINT catalog_product_option_values_code_unique UNIQUE (organization_id, tenant_id, option_id, code);


--
-- Name: catalog_product_option_values catalog_product_option_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_option_values
    ADD CONSTRAINT catalog_product_option_values_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_options catalog_product_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_options
    ADD CONSTRAINT catalog_product_options_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_relations catalog_product_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_relations
    ADD CONSTRAINT catalog_product_relations_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_relations catalog_product_relations_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_relations
    ADD CONSTRAINT catalog_product_relations_unique UNIQUE (parent_product_id, child_product_id, relation_type);


--
-- Name: catalog_product_tag_assignments catalog_product_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_tag_assignments
    ADD CONSTRAINT catalog_product_tag_assignments_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_tag_assignments catalog_product_tag_assignments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_tag_assignments
    ADD CONSTRAINT catalog_product_tag_assignments_unique UNIQUE (product_id, tag_id);


--
-- Name: catalog_product_tags catalog_product_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_tags
    ADD CONSTRAINT catalog_product_tags_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_tags catalog_product_tags_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_tags
    ADD CONSTRAINT catalog_product_tags_slug_unique UNIQUE (organization_id, tenant_id, slug);


--
-- Name: catalog_product_unit_conversions catalog_product_unit_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_unit_conversions
    ADD CONSTRAINT catalog_product_unit_conversions_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_unit_conversions catalog_product_unit_conversions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_unit_conversions
    ADD CONSTRAINT catalog_product_unit_conversions_unique UNIQUE (product_id, unit_code);


--
-- Name: catalog_product_variant_option_values catalog_product_variant_option_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_variant_option_values
    ADD CONSTRAINT catalog_product_variant_option_values_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_variant_option_values catalog_product_variant_option_values_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_variant_option_values
    ADD CONSTRAINT catalog_product_variant_option_values_unique UNIQUE (variant_id, option_value_id);


--
-- Name: catalog_product_variant_prices catalog_product_variant_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_variant_prices
    ADD CONSTRAINT catalog_product_variant_prices_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_variant_relations catalog_product_variant_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_variant_relations
    ADD CONSTRAINT catalog_product_variant_relations_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_variants catalog_product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_variants
    ADD CONSTRAINT catalog_product_variants_pkey PRIMARY KEY (id);


--
-- Name: catalog_product_variants catalog_product_variants_sku_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_variants
    ADD CONSTRAINT catalog_product_variants_sku_unique UNIQUE (organization_id, tenant_id, sku);


--
-- Name: catalog_products catalog_products_handle_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_products
    ADD CONSTRAINT catalog_products_handle_scope_unique UNIQUE (organization_id, tenant_id, handle);


--
-- Name: catalog_products catalog_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_products
    ADD CONSTRAINT catalog_products_pkey PRIMARY KEY (id);


--
-- Name: catalog_products catalog_products_sku_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_products
    ADD CONSTRAINT catalog_products_sku_scope_unique UNIQUE (organization_id, tenant_id, sku);


--
-- Name: channel_ingest_dead_letters channel_ingest_dead_letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_ingest_dead_letters
    ADD CONSTRAINT channel_ingest_dead_letters_pkey PRIMARY KEY (id);


--
-- Name: channel_thread_mappings channel_thread_mappings_ext_conv_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_thread_mappings
    ADD CONSTRAINT channel_thread_mappings_ext_conv_uq UNIQUE (external_conversation_id, tenant_id);


--
-- Name: channel_thread_mappings channel_thread_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_thread_mappings
    ADD CONSTRAINT channel_thread_mappings_pkey PRIMARY KEY (id);


--
-- Name: channel_thread_tokens channel_thread_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_thread_tokens
    ADD CONSTRAINT channel_thread_tokens_pkey PRIMARY KEY (id);


--
-- Name: channel_thread_tokens channel_thread_tokens_thread_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_thread_tokens
    ADD CONSTRAINT channel_thread_tokens_thread_uq UNIQUE (tenant_id, message_thread_id);


--
-- Name: channel_thread_tokens channel_thread_tokens_token_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_thread_tokens
    ADD CONSTRAINT channel_thread_tokens_token_uq UNIQUE (tenant_id, token);


--
-- Name: checkout_link_templates checkout_link_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_link_templates
    ADD CONSTRAINT checkout_link_templates_pkey PRIMARY KEY (id);


--
-- Name: checkout_links checkout_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_links
    ADD CONSTRAINT checkout_links_pkey PRIMARY KEY (id);


--
-- Name: checkout_transactions checkout_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkout_transactions
    ADD CONSTRAINT checkout_transactions_pkey PRIMARY KEY (id);


--
-- Name: communication_channels communication_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communication_channels
    ADD CONSTRAINT communication_channels_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_code_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_code_scope_unique UNIQUE (organization_id, tenant_id, code);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: currency_fetch_configs currency_fetch_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_fetch_configs
    ADD CONSTRAINT currency_fetch_configs_pkey PRIMARY KEY (id);


--
-- Name: currency_fetch_configs currency_fetch_configs_provider_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency_fetch_configs
    ADD CONSTRAINT currency_fetch_configs_provider_scope_unique UNIQUE (organization_id, tenant_id, provider);


--
-- Name: custom_entities custom_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_entities
    ADD CONSTRAINT custom_entities_pkey PRIMARY KEY (id);


--
-- Name: custom_entities_storage custom_entities_storage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_entities_storage
    ADD CONSTRAINT custom_entities_storage_pkey PRIMARY KEY (id);


--
-- Name: custom_field_defs custom_field_defs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_defs
    ADD CONSTRAINT custom_field_defs_pkey PRIMARY KEY (id);


--
-- Name: custom_field_entity_configs custom_field_entity_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_entity_configs
    ADD CONSTRAINT custom_field_entity_configs_pkey PRIMARY KEY (id);


--
-- Name: custom_field_values custom_field_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_field_values
    ADD CONSTRAINT custom_field_values_pkey PRIMARY KEY (id);


--
-- Name: customer_activities customer_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_activities
    ADD CONSTRAINT customer_activities_pkey PRIMARY KEY (id);


--
-- Name: customer_addresses customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: customer_comments customer_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_comments
    ADD CONSTRAINT customer_comments_pkey PRIMARY KEY (id);


--
-- Name: customer_companies customer_companies_entity_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_companies
    ADD CONSTRAINT customer_companies_entity_id_unique UNIQUE (entity_id);


--
-- Name: customer_companies customer_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_companies
    ADD CONSTRAINT customer_companies_pkey PRIMARY KEY (id);


--
-- Name: customer_company_billing customer_company_billing_entity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_company_billing
    ADD CONSTRAINT customer_company_billing_entity_unique UNIQUE (entity_id);


--
-- Name: customer_company_billing customer_company_billing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_company_billing
    ADD CONSTRAINT customer_company_billing_pkey PRIMARY KEY (id);


--
-- Name: customer_contacts customer_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_pkey PRIMARY KEY (id);


--
-- Name: customer_deal_companies customer_deal_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deal_companies
    ADD CONSTRAINT customer_deal_companies_pkey PRIMARY KEY (id);


--
-- Name: customer_deal_companies customer_deal_companies_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deal_companies
    ADD CONSTRAINT customer_deal_companies_unique UNIQUE (deal_id, company_entity_id);


--
-- Name: customer_deal_people customer_deal_people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deal_people
    ADD CONSTRAINT customer_deal_people_pkey PRIMARY KEY (id);


--
-- Name: customer_deal_people customer_deal_people_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deal_people
    ADD CONSTRAINT customer_deal_people_unique UNIQUE (deal_id, person_entity_id);


--
-- Name: customer_deal_stage_transitions customer_deal_stage_transitions_deal_stage_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deal_stage_transitions
    ADD CONSTRAINT customer_deal_stage_transitions_deal_stage_uq UNIQUE (deal_id, stage_id);


--
-- Name: customer_deal_stage_transitions customer_deal_stage_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deal_stage_transitions
    ADD CONSTRAINT customer_deal_stage_transitions_pkey PRIMARY KEY (id);


--
-- Name: customer_deals customer_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deals
    ADD CONSTRAINT customer_deals_pkey PRIMARY KEY (id);


--
-- Name: customer_dictionary_kind_settings customer_dict_kind_settings_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_dictionary_kind_settings
    ADD CONSTRAINT customer_dict_kind_settings_unique UNIQUE (organization_id, tenant_id, kind);


--
-- Name: customer_dictionary_entries customer_dictionary_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_dictionary_entries
    ADD CONSTRAINT customer_dictionary_entries_pkey PRIMARY KEY (id);


--
-- Name: customer_dictionary_entries customer_dictionary_entries_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_dictionary_entries
    ADD CONSTRAINT customer_dictionary_entries_unique UNIQUE (organization_id, tenant_id, kind, normalized_value);


--
-- Name: customer_dictionary_kind_settings customer_dictionary_kind_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_dictionary_kind_settings
    ADD CONSTRAINT customer_dictionary_kind_settings_pkey PRIMARY KEY (id);


--
-- Name: customer_entities customer_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_entities
    ADD CONSTRAINT customer_entities_pkey PRIMARY KEY (id);


--
-- Name: customer_entity_roles customer_entity_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_entity_roles
    ADD CONSTRAINT customer_entity_roles_pkey PRIMARY KEY (id);


--
-- Name: customer_interactions customer_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_interactions
    ADD CONSTRAINT customer_interactions_pkey PRIMARY KEY (id);


--
-- Name: customer_label_assignments customer_label_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_label_assignments
    ADD CONSTRAINT customer_label_assignments_pkey PRIMARY KEY (id);


--
-- Name: customer_label_assignments customer_label_assignments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_label_assignments
    ADD CONSTRAINT customer_label_assignments_unique UNIQUE (label_id, entity_id);


--
-- Name: customer_labels customer_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_labels
    ADD CONSTRAINT customer_labels_pkey PRIMARY KEY (id);


--
-- Name: customer_labels customer_labels_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_labels
    ADD CONSTRAINT customer_labels_unique UNIQUE (user_id, tenant_id, organization_id, slug);


--
-- Name: customer_person_company_roles customer_pcr_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_person_company_roles
    ADD CONSTRAINT customer_pcr_unique UNIQUE (person_entity_id, company_entity_id, role_value);


--
-- Name: customer_people customer_people_entity_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_people
    ADD CONSTRAINT customer_people_entity_id_unique UNIQUE (entity_id);


--
-- Name: customer_people customer_people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_people
    ADD CONSTRAINT customer_people_pkey PRIMARY KEY (id);


--
-- Name: customer_person_company_links customer_person_company_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_person_company_links
    ADD CONSTRAINT customer_person_company_links_pkey PRIMARY KEY (id);


--
-- Name: customer_person_company_roles customer_person_company_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_person_company_roles
    ADD CONSTRAINT customer_person_company_roles_pkey PRIMARY KEY (id);


--
-- Name: customer_pipeline_stages customer_pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pipeline_stages
    ADD CONSTRAINT customer_pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: customer_pipelines customer_pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_pipelines
    ADD CONSTRAINT customer_pipelines_pkey PRIMARY KEY (id);


--
-- Name: customer_role_acls customer_role_acls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_role_acls
    ADD CONSTRAINT customer_role_acls_pkey PRIMARY KEY (id);


--
-- Name: customer_role_acls customer_role_acls_role_tenant_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_role_acls
    ADD CONSTRAINT customer_role_acls_role_tenant_uniq UNIQUE (role_id, tenant_id);


--
-- Name: customer_roles customer_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_roles
    ADD CONSTRAINT customer_roles_pkey PRIMARY KEY (id);


--
-- Name: customer_roles customer_roles_tenant_slug_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_roles
    ADD CONSTRAINT customer_roles_tenant_slug_uniq UNIQUE (tenant_id, slug);


--
-- Name: customer_settings customer_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_settings
    ADD CONSTRAINT customer_settings_pkey PRIMARY KEY (id);


--
-- Name: customer_settings customer_settings_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_settings
    ADD CONSTRAINT customer_settings_scope_unique UNIQUE (organization_id, tenant_id);


--
-- Name: customer_tag_assignments customer_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tag_assignments
    ADD CONSTRAINT customer_tag_assignments_pkey PRIMARY KEY (id);


--
-- Name: customer_tag_assignments customer_tag_assignments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tag_assignments
    ADD CONSTRAINT customer_tag_assignments_unique UNIQUE (tag_id, entity_id);


--
-- Name: customer_tags customer_tags_org_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_org_slug_unique UNIQUE (organization_id, tenant_id, slug);


--
-- Name: customer_tags customer_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_pkey PRIMARY KEY (id);


--
-- Name: customer_todo_links customer_todo_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_todo_links
    ADD CONSTRAINT customer_todo_links_pkey PRIMARY KEY (id);


--
-- Name: customer_todo_links customer_todo_links_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_todo_links
    ADD CONSTRAINT customer_todo_links_unique UNIQUE (entity_id, todo_id, todo_source);


--
-- Name: customer_user_acls customer_user_acls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_user_acls
    ADD CONSTRAINT customer_user_acls_pkey PRIMARY KEY (id);


--
-- Name: customer_user_acls customer_user_acls_user_tenant_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_user_acls
    ADD CONSTRAINT customer_user_acls_user_tenant_uniq UNIQUE (user_id, tenant_id);


--
-- Name: customer_user_email_verifications customer_user_email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_user_email_verifications
    ADD CONSTRAINT customer_user_email_verifications_pkey PRIMARY KEY (id);


--
-- Name: customer_user_invitations customer_user_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_user_invitations
    ADD CONSTRAINT customer_user_invitations_pkey PRIMARY KEY (id);


--
-- Name: customer_user_password_resets customer_user_password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_user_password_resets
    ADD CONSTRAINT customer_user_password_resets_pkey PRIMARY KEY (id);


--
-- Name: customer_user_roles customer_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_user_roles
    ADD CONSTRAINT customer_user_roles_pkey PRIMARY KEY (id);


--
-- Name: customer_user_roles customer_user_roles_user_role_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_user_roles
    ADD CONSTRAINT customer_user_roles_user_role_uniq UNIQUE (user_id, role_id);


--
-- Name: customer_user_sessions customer_user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_user_sessions
    ADD CONSTRAINT customer_user_sessions_pkey PRIMARY KEY (id);


--
-- Name: customer_users customer_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_users
    ADD CONSTRAINT customer_users_pkey PRIMARY KEY (id);


--
-- Name: customer_users customer_users_tenant_email_hash_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_users
    ADD CONSTRAINT customer_users_tenant_email_hash_uniq UNIQUE (tenant_id, email_hash);


--
-- Name: dashboard_layouts dashboard_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_layouts
    ADD CONSTRAINT dashboard_layouts_pkey PRIMARY KEY (id);


--
-- Name: dashboard_layouts dashboard_layouts_user_id_tenant_id_organization_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_layouts
    ADD CONSTRAINT dashboard_layouts_user_id_tenant_id_organization_id_unique UNIQUE (user_id, tenant_id, organization_id);


--
-- Name: dashboard_role_widgets dashboard_role_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_role_widgets
    ADD CONSTRAINT dashboard_role_widgets_pkey PRIMARY KEY (id);


--
-- Name: dashboard_role_widgets dashboard_role_widgets_role_id_tenant_id_organization_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_role_widgets
    ADD CONSTRAINT dashboard_role_widgets_role_id_tenant_id_organization_id_unique UNIQUE (role_id, tenant_id, organization_id);


--
-- Name: dashboard_user_widgets dashboard_user_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_user_widgets
    ADD CONSTRAINT dashboard_user_widgets_pkey PRIMARY KEY (id);


--
-- Name: dashboard_user_widgets dashboard_user_widgets_user_id_tenant_id_organization_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_user_widgets
    ADD CONSTRAINT dashboard_user_widgets_user_id_tenant_id_organization_id_unique UNIQUE (user_id, tenant_id, organization_id);


--
-- Name: dermat_batch_stages dermat_batch_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_batch_stages
    ADD CONSTRAINT dermat_batch_stages_pkey PRIMARY KEY (id);


--
-- Name: dermat_bom_headers dermat_bom_headers_org_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_bom_headers
    ADD CONSTRAINT dermat_bom_headers_org_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_bom_headers dermat_bom_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_bom_headers
    ADD CONSTRAINT dermat_bom_headers_pkey PRIMARY KEY (id);


--
-- Name: dermat_bom_items dermat_bom_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_bom_items
    ADD CONSTRAINT dermat_bom_items_pkey PRIMARY KEY (id);


--
-- Name: dermat_bom_lines dermat_bom_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_bom_lines
    ADD CONSTRAINT dermat_bom_lines_pkey PRIMARY KEY (id);


--
-- Name: dermat_boms dermat_boms_org_tenant_name_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_boms
    ADD CONSTRAINT dermat_boms_org_tenant_name_uq UNIQUE (organization_id, tenant_id, bom_name);


--
-- Name: dermat_boms dermat_boms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_boms
    ADD CONSTRAINT dermat_boms_pkey PRIMARY KEY (id);


--
-- Name: dermat_company_profiles dermat_company_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_company_profiles
    ADD CONSTRAINT dermat_company_profiles_pkey PRIMARY KEY (id);


--
-- Name: dermat_customers dermat_customers_org_tenant_name_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_customers
    ADD CONSTRAINT dermat_customers_org_tenant_name_uq UNIQUE (organization_id, tenant_id, name);


--
-- Name: dermat_customers dermat_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_customers
    ADD CONSTRAINT dermat_customers_pkey PRIMARY KEY (id);


--
-- Name: dermat_departments dermat_departments_org_tenant_name_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_departments
    ADD CONSTRAINT dermat_departments_org_tenant_name_uq UNIQUE (organization_id, tenant_id, name);


--
-- Name: dermat_departments dermat_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_departments
    ADD CONSTRAINT dermat_departments_pkey PRIMARY KEY (id);


--
-- Name: dermat_grn_lines dermat_grn_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_grn_lines
    ADD CONSTRAINT dermat_grn_lines_pkey PRIMARY KEY (id);


--
-- Name: dermat_grns dermat_grns_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_grns
    ADD CONSTRAINT dermat_grns_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_grns dermat_grns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_grns
    ADD CONSTRAINT dermat_grns_pkey PRIMARY KEY (id);


--
-- Name: dermat_list_options dermat_list_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_list_options
    ADD CONSTRAINT dermat_list_options_pkey PRIMARY KEY (id);


--
-- Name: dermat_material_plan_items dermat_material_plan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_material_plan_items
    ADD CONSTRAINT dermat_material_plan_items_pkey PRIMARY KEY (id);


--
-- Name: dermat_material_plans dermat_material_plans_number_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_material_plans
    ADD CONSTRAINT dermat_material_plans_number_uq UNIQUE (organization_id, tenant_id, plan_number);


--
-- Name: dermat_material_plans dermat_material_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_material_plans
    ADD CONSTRAINT dermat_material_plans_pkey PRIMARY KEY (id);


--
-- Name: dermat_material_request_lines dermat_material_request_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_material_request_lines
    ADD CONSTRAINT dermat_material_request_lines_pkey PRIMARY KEY (id);


--
-- Name: dermat_material_requests dermat_material_requests_number_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_material_requests
    ADD CONSTRAINT dermat_material_requests_number_uq UNIQUE (organization_id, tenant_id, request_number);


--
-- Name: dermat_material_requests dermat_material_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_material_requests
    ADD CONSTRAINT dermat_material_requests_pkey PRIMARY KEY (id);


--
-- Name: dermat_order_events dermat_order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_order_events
    ADD CONSTRAINT dermat_order_events_pkey PRIMARY KEY (id);


--
-- Name: dermat_order_lines dermat_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_order_lines
    ADD CONSTRAINT dermat_order_lines_pkey PRIMARY KEY (id);


--
-- Name: dermat_order_payments dermat_order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_order_payments
    ADD CONSTRAINT dermat_order_payments_pkey PRIMARY KEY (id);


--
-- Name: dermat_order_stages dermat_order_stages_order_key_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_order_stages
    ADD CONSTRAINT dermat_order_stages_order_key_uq UNIQUE (order_id, stage_key);


--
-- Name: dermat_order_stages dermat_order_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_order_stages
    ADD CONSTRAINT dermat_order_stages_pkey PRIMARY KEY (id);


--
-- Name: dermat_orders dermat_orders_org_no_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_orders
    ADD CONSTRAINT dermat_orders_org_no_uq UNIQUE (organization_id, tenant_id, order_no);


--
-- Name: dermat_orders dermat_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_orders
    ADD CONSTRAINT dermat_orders_pkey PRIMARY KEY (id);


--
-- Name: dermat_planning_log dermat_planning_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_planning_log
    ADD CONSTRAINT dermat_planning_log_pkey PRIMARY KEY (id);


--
-- Name: dermat_planning_plans dermat_planning_plans_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_planning_plans
    ADD CONSTRAINT dermat_planning_plans_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_planning_plans dermat_planning_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_planning_plans
    ADD CONSTRAINT dermat_planning_plans_pkey PRIMARY KEY (id);


--
-- Name: dermat_planning_reservations dermat_planning_reservations_order_product_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_planning_reservations
    ADD CONSTRAINT dermat_planning_reservations_order_product_uq UNIQUE (organization_id, tenant_id, order_id, product_id);


--
-- Name: dermat_planning_reservations dermat_planning_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_planning_reservations
    ADD CONSTRAINT dermat_planning_reservations_pkey PRIMARY KEY (id);


--
-- Name: dermat_pm_master dermat_pm_master_org_tenant_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_pm_master
    ADD CONSTRAINT dermat_pm_master_org_tenant_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_pm_master dermat_pm_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_pm_master
    ADD CONSTRAINT dermat_pm_master_pkey PRIMARY KEY (id);


--
-- Name: dermat_po_lines dermat_po_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_po_lines
    ADD CONSTRAINT dermat_po_lines_pkey PRIMARY KEY (id);


--
-- Name: dermat_purchase_order_sequences dermat_po_sequences_org_tenant_fy_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_purchase_order_sequences
    ADD CONSTRAINT dermat_po_sequences_org_tenant_fy_uq UNIQUE (organization_id, tenant_id, financial_year);


--
-- Name: dermat_pos dermat_pos_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_pos
    ADD CONSTRAINT dermat_pos_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_pos dermat_pos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_pos
    ADD CONSTRAINT dermat_pos_pkey PRIMARY KEY (id);


--
-- Name: dermat_production_batches dermat_production_batches_org_tenant_number_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_production_batches
    ADD CONSTRAINT dermat_production_batches_org_tenant_number_uq UNIQUE (organization_id, tenant_id, batch_number);


--
-- Name: dermat_production_batches dermat_production_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_production_batches
    ADD CONSTRAINT dermat_production_batches_pkey PRIMARY KEY (id);


--
-- Name: dermat_proforma_invoices dermat_proforma_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_proforma_invoices
    ADD CONSTRAINT dermat_proforma_invoices_pkey PRIMARY KEY (id);


--
-- Name: dermat_purchase_indents dermat_purchase_indents_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_purchase_indents
    ADD CONSTRAINT dermat_purchase_indents_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_purchase_indents dermat_purchase_indents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_purchase_indents
    ADD CONSTRAINT dermat_purchase_indents_pkey PRIMARY KEY (id);


--
-- Name: dermat_purchase_order_lines dermat_purchase_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_purchase_order_lines
    ADD CONSTRAINT dermat_purchase_order_lines_pkey PRIMARY KEY (id);


--
-- Name: dermat_purchase_order_sequences dermat_purchase_order_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_purchase_order_sequences
    ADD CONSTRAINT dermat_purchase_order_sequences_pkey PRIMARY KEY (id);


--
-- Name: dermat_purchase_orders dermat_purchase_orders_org_tenant_number_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_purchase_orders
    ADD CONSTRAINT dermat_purchase_orders_org_tenant_number_uq UNIQUE (organization_id, tenant_id, po_number);


--
-- Name: dermat_purchase_orders dermat_purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_purchase_orders
    ADD CONSTRAINT dermat_purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: dermat_qa_documents dermat_qa_documents_no_version_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_qa_documents
    ADD CONSTRAINT dermat_qa_documents_no_version_uq UNIQUE (organization_id, tenant_id, doc_no, version);


--
-- Name: dermat_qa_documents dermat_qa_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_qa_documents
    ADD CONSTRAINT dermat_qa_documents_pkey PRIMARY KEY (id);


--
-- Name: dermat_qc_policies dermat_qc_policies_org_tenant_applies_to_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_qc_policies
    ADD CONSTRAINT dermat_qc_policies_org_tenant_applies_to_uq UNIQUE (organization_id, tenant_id, applies_to);


--
-- Name: dermat_qc_policies dermat_qc_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_qc_policies
    ADD CONSTRAINT dermat_qc_policies_pkey PRIMARY KEY (id);


--
-- Name: dermat_qc_tests dermat_qc_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_qc_tests
    ADD CONSTRAINT dermat_qc_tests_pkey PRIMARY KEY (id);


--
-- Name: dermat_quality_checks dermat_quality_checks_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_quality_checks
    ADD CONSTRAINT dermat_quality_checks_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_quality_checks dermat_quality_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_quality_checks
    ADD CONSTRAINT dermat_quality_checks_pkey PRIMARY KEY (id);


--
-- Name: dermat_quality_rules dermat_quality_rules_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_quality_rules
    ADD CONSTRAINT dermat_quality_rules_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_quality_rules dermat_quality_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_quality_rules
    ADD CONSTRAINT dermat_quality_rules_pkey PRIMARY KEY (id);


--
-- Name: dermat_rm_master dermat_rm_master_org_tenant_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_rm_master
    ADD CONSTRAINT dermat_rm_master_org_tenant_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_rm_master dermat_rm_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_rm_master
    ADD CONSTRAINT dermat_rm_master_pkey PRIMARY KEY (id);


--
-- Name: dermat_rnd_requests dermat_rnd_requests_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_rnd_requests
    ADD CONSTRAINT dermat_rnd_requests_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_rnd_requests dermat_rnd_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_rnd_requests
    ADD CONSTRAINT dermat_rnd_requests_pkey PRIMARY KEY (id);


--
-- Name: dermat_samples dermat_samples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_samples
    ADD CONSTRAINT dermat_samples_pkey PRIMARY KEY (id);


--
-- Name: dermat_stage_definitions dermat_stage_definitions_org_tenant_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_stage_definitions
    ADD CONSTRAINT dermat_stage_definitions_org_tenant_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_stage_definitions dermat_stage_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_stage_definitions
    ADD CONSTRAINT dermat_stage_definitions_pkey PRIMARY KEY (id);


--
-- Name: dermat_stage_runs dermat_stage_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_stage_runs
    ADD CONSTRAINT dermat_stage_runs_pkey PRIMARY KEY (id);


--
-- Name: dermat_stage_settings dermat_stage_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_stage_settings
    ADD CONSTRAINT dermat_stage_settings_pkey PRIMARY KEY (id);


--
-- Name: dermat_stage_settings dermat_stage_settings_scope_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_stage_settings
    ADD CONSTRAINT dermat_stage_settings_scope_uq UNIQUE (organization_id, tenant_id, stage_key);


--
-- Name: dermat_stock_reservations dermat_stock_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_stock_reservations
    ADD CONSTRAINT dermat_stock_reservations_pkey PRIMARY KEY (id);


--
-- Name: dermat_store_request_lines dermat_store_request_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_store_request_lines
    ADD CONSTRAINT dermat_store_request_lines_pkey PRIMARY KEY (id);


--
-- Name: dermat_store_requests dermat_store_requests_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_store_requests
    ADD CONSTRAINT dermat_store_requests_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_store_requests dermat_store_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_store_requests
    ADD CONSTRAINT dermat_store_requests_pkey PRIMARY KEY (id);


--
-- Name: dermat_tax_invoices dermat_tax_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_tax_invoices
    ADD CONSTRAINT dermat_tax_invoices_pkey PRIMARY KEY (id);


--
-- Name: dermat_vendor_bills dermat_vendor_bills_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_vendor_bills
    ADD CONSTRAINT dermat_vendor_bills_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_vendor_bills dermat_vendor_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_vendor_bills
    ADD CONSTRAINT dermat_vendor_bills_pkey PRIMARY KEY (id);


--
-- Name: dermat_vendors dermat_vendors_org_tenant_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_vendors
    ADD CONSTRAINT dermat_vendors_org_tenant_code_uq UNIQUE (organization_id, tenant_id, code);


--
-- Name: dermat_vendors dermat_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermat_vendors
    ADD CONSTRAINT dermat_vendors_pkey PRIMARY KEY (id);


--
-- Name: dictionaries dictionaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionaries
    ADD CONSTRAINT dictionaries_pkey PRIMARY KEY (id);


--
-- Name: dictionaries dictionaries_scope_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionaries
    ADD CONSTRAINT dictionaries_scope_key_unique UNIQUE (organization_id, tenant_id, key);


--
-- Name: dictionary_entries dictionary_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionary_entries
    ADD CONSTRAINT dictionary_entries_pkey PRIMARY KEY (id);


--
-- Name: dictionary_entries dictionary_entries_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dictionary_entries
    ADD CONSTRAINT dictionary_entries_unique UNIQUE (dictionary_id, organization_id, tenant_id, normalized_value);


--
-- Name: domain_mappings domain_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_mappings
    ADD CONSTRAINT domain_mappings_pkey PRIMARY KEY (id);


--
-- Name: encryption_maps encryption_maps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encryption_maps
    ADD CONSTRAINT encryption_maps_pkey PRIMARY KEY (id);


--
-- Name: entity_index_coverage entity_index_coverage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_index_coverage
    ADD CONSTRAINT entity_index_coverage_pkey PRIMARY KEY (id);


--
-- Name: entity_index_coverage entity_index_coverage_scope_idx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_index_coverage
    ADD CONSTRAINT entity_index_coverage_scope_idx UNIQUE (entity_type, tenant_id, organization_id, with_deleted);


--
-- Name: entity_index_jobs entity_index_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_index_jobs
    ADD CONSTRAINT entity_index_jobs_pkey PRIMARY KEY (id);


--
-- Name: entity_indexes entity_indexes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_indexes
    ADD CONSTRAINT entity_indexes_pkey PRIMARY KEY (id);


--
-- Name: entity_indexes entity_indexes_type_entity_org_coalesced_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_indexes
    ADD CONSTRAINT entity_indexes_type_entity_org_coalesced_unique UNIQUE (entity_type, entity_id, organization_id_coalesced);


--
-- Name: entity_translations entity_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_translations
    ADD CONSTRAINT entity_translations_pkey PRIMARY KEY (id);


--
-- Name: eudr_due_diligence_statements eudr_due_diligence_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eudr_due_diligence_statements
    ADD CONSTRAINT eudr_due_diligence_statements_pkey PRIMARY KEY (id);


--
-- Name: eudr_evidence_submissions eudr_evidence_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eudr_evidence_submissions
    ADD CONSTRAINT eudr_evidence_submissions_pkey PRIMARY KEY (id);


--
-- Name: eudr_mitigation_actions eudr_mitigation_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eudr_mitigation_actions
    ADD CONSTRAINT eudr_mitigation_actions_pkey PRIMARY KEY (id);


--
-- Name: eudr_plots eudr_plots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eudr_plots
    ADD CONSTRAINT eudr_plots_pkey PRIMARY KEY (id);


--
-- Name: eudr_product_mappings eudr_product_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eudr_product_mappings
    ADD CONSTRAINT eudr_product_mappings_pkey PRIMARY KEY (id);


--
-- Name: eudr_risk_assessments eudr_risk_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eudr_risk_assessments
    ADD CONSTRAINT eudr_risk_assessments_pkey PRIMARY KEY (id);


--
-- Name: example_customer_interaction_mappings example_customer_interaction_mappings_interaction_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_customer_interaction_mappings
    ADD CONSTRAINT example_customer_interaction_mappings_interaction_unique UNIQUE (organization_id, tenant_id, interaction_id);


--
-- Name: example_customer_interaction_mappings example_customer_interaction_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_customer_interaction_mappings
    ADD CONSTRAINT example_customer_interaction_mappings_pkey PRIMARY KEY (id);


--
-- Name: example_customer_interaction_mappings example_customer_interaction_mappings_todo_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_customer_interaction_mappings
    ADD CONSTRAINT example_customer_interaction_mappings_todo_unique UNIQUE (organization_id, tenant_id, todo_id);


--
-- Name: example_customer_priorities example_customer_priorities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_customer_priorities
    ADD CONSTRAINT example_customer_priorities_pkey PRIMARY KEY (id);


--
-- Name: example_items example_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_items
    ADD CONSTRAINT example_items_pkey PRIMARY KEY (id);


--
-- Name: example_todo_bulk_operations example_todo_bulk_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_todo_bulk_operations
    ADD CONSTRAINT example_todo_bulk_operations_pkey PRIMARY KEY (id);


--
-- Name: example_todo_bulk_operations example_todo_bulk_operations_tenant_id_organizati_e950a_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_todo_bulk_operations
    ADD CONSTRAINT example_todo_bulk_operations_tenant_id_organizati_e950a_unique UNIQUE (tenant_id, organization_id, user_id, idempotency_key);


--
-- Name: exchange_rates exchange_rates_pair_datetime_source_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pair_datetime_source_unique UNIQUE (organization_id, tenant_id, from_currency_code, to_currency_code, date, source);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: external_conversations external_conversations_channel_external_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_conversations
    ADD CONSTRAINT external_conversations_channel_external_uq UNIQUE (channel_id, external_conversation_id);


--
-- Name: external_conversations external_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_conversations
    ADD CONSTRAINT external_conversations_pkey PRIMARY KEY (id);


--
-- Name: external_messages external_messages_channel_external_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_messages
    ADD CONSTRAINT external_messages_channel_external_uq UNIQUE (channel_id, external_message_id);


--
-- Name: external_messages external_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_messages
    ADD CONSTRAINT external_messages_pkey PRIMARY KEY (id);


--
-- Name: feature_toggle_audit_logs feature_toggle_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_toggle_audit_logs
    ADD CONSTRAINT feature_toggle_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: feature_toggle_overrides feature_toggle_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_toggle_overrides
    ADD CONSTRAINT feature_toggle_overrides_pkey PRIMARY KEY (id);


--
-- Name: feature_toggle_overrides feature_toggle_overrides_toggle_tenant_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_toggle_overrides
    ADD CONSTRAINT feature_toggle_overrides_toggle_tenant_unique UNIQUE (toggle_id, tenant_id);


--
-- Name: feature_toggles feature_toggles_identifier_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_toggles
    ADD CONSTRAINT feature_toggles_identifier_unique UNIQUE (identifier);


--
-- Name: feature_toggles feature_toggles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_toggles
    ADD CONSTRAINT feature_toggles_pkey PRIMARY KEY (id);


--
-- Name: gateway_payment_operations gateway_payment_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_payment_operations
    ADD CONSTRAINT gateway_payment_operations_pkey PRIMARY KEY (id);


--
-- Name: gateway_payment_operations gateway_payment_operations_scope_operation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_payment_operations
    ADD CONSTRAINT gateway_payment_operations_scope_operation_unique UNIQUE (operation_id, organization_id, tenant_id);


--
-- Name: gateway_session_initializations gateway_session_initializations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_session_initializations
    ADD CONSTRAINT gateway_session_initializations_pkey PRIMARY KEY (id);


--
-- Name: gateway_session_initializations gateway_session_initializations_scope_operation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_session_initializations
    ADD CONSTRAINT gateway_session_initializations_scope_operation_unique UNIQUE (operation_key, provider_key, organization_id, tenant_id);


--
-- Name: gateway_transactions gateway_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_transactions
    ADD CONSTRAINT gateway_transactions_pkey PRIMARY KEY (id);


--
-- Name: gateway_webhook_events gateway_webhook_events_idempotency_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_webhook_events
    ADD CONSTRAINT gateway_webhook_events_idempotency_unique UNIQUE (idempotency_key, provider_key, organization_id, tenant_id);


--
-- Name: gateway_webhook_events gateway_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gateway_webhook_events
    ADD CONSTRAINT gateway_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: inbox_discrepancies inbox_discrepancies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_discrepancies
    ADD CONSTRAINT inbox_discrepancies_pkey PRIMARY KEY (id);


--
-- Name: inbox_emails inbox_emails_organization_id_tenant_id_content_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_emails
    ADD CONSTRAINT inbox_emails_organization_id_tenant_id_content_hash_unique UNIQUE (organization_id, tenant_id, content_hash);


--
-- Name: inbox_emails inbox_emails_organization_id_tenant_id_message_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_emails
    ADD CONSTRAINT inbox_emails_organization_id_tenant_id_message_id_unique UNIQUE (organization_id, tenant_id, message_id);


--
-- Name: inbox_emails inbox_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_emails
    ADD CONSTRAINT inbox_emails_pkey PRIMARY KEY (id);


--
-- Name: inbox_proposal_actions inbox_proposal_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_proposal_actions
    ADD CONSTRAINT inbox_proposal_actions_pkey PRIMARY KEY (id);


--
-- Name: inbox_proposals inbox_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_proposals
    ADD CONSTRAINT inbox_proposals_pkey PRIMARY KEY (id);


--
-- Name: inbox_settings inbox_settings_inbox_address_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_settings
    ADD CONSTRAINT inbox_settings_inbox_address_unique UNIQUE (inbox_address);


--
-- Name: inbox_settings inbox_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_settings
    ADD CONSTRAINT inbox_settings_pkey PRIMARY KEY (id);


--
-- Name: indexer_error_logs indexer_error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indexer_error_logs
    ADD CONSTRAINT indexer_error_logs_pkey PRIMARY KEY (id);


--
-- Name: indexer_status_logs indexer_status_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indexer_status_logs
    ADD CONSTRAINT indexer_status_logs_pkey PRIMARY KEY (id);


--
-- Name: integration_credentials integration_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_credentials
    ADD CONSTRAINT integration_credentials_pkey PRIMARY KEY (id);


--
-- Name: integration_logs integration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_pkey PRIMARY KEY (id);


--
-- Name: integration_states integration_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_states
    ADD CONSTRAINT integration_states_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_bom_lines manufacturing_bom_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_bom_lines
    ADD CONSTRAINT manufacturing_bom_lines_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_bom_operations manufacturing_bom_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_bom_operations
    ADD CONSTRAINT manufacturing_bom_operations_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_bill_of_materials manufacturing_bom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_bill_of_materials
    ADD CONSTRAINT manufacturing_bom_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_boms manufacturing_boms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_boms
    ADD CONSTRAINT manufacturing_boms_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_machines manufacturing_machines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_machines
    ADD CONSTRAINT manufacturing_machines_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_material_consumptions manufacturing_material_consumptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_material_consumptions
    ADD CONSTRAINT manufacturing_material_consumptions_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_production_orders manufacturing_production_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_production_orders
    ADD CONSTRAINT manufacturing_production_orders_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_production_stage_templates manufacturing_production_stage_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_production_stage_templates
    ADD CONSTRAINT manufacturing_production_stage_templates_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_production_stages manufacturing_production_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_production_stages
    ADD CONSTRAINT manufacturing_production_stages_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_quality_check_items manufacturing_quality_check_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_quality_check_items
    ADD CONSTRAINT manufacturing_quality_check_items_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_quality_inspections manufacturing_quality_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_quality_inspections
    ADD CONSTRAINT manufacturing_quality_inspections_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_work_centers manufacturing_work_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_work_centers
    ADD CONSTRAINT manufacturing_work_centers_pkey PRIMARY KEY (id);


--
-- Name: message_access_tokens message_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_access_tokens
    ADD CONSTRAINT message_access_tokens_pkey PRIMARY KEY (id);


--
-- Name: message_access_tokens message_access_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_access_tokens
    ADD CONSTRAINT message_access_tokens_token_unique UNIQUE (token);


--
-- Name: message_channel_links message_channel_links_message_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_channel_links
    ADD CONSTRAINT message_channel_links_message_uq UNIQUE (message_id);


--
-- Name: message_channel_links message_channel_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_channel_links
    ADD CONSTRAINT message_channel_links_pkey PRIMARY KEY (id);


--
-- Name: message_confirmations message_confirmations_message_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_confirmations
    ADD CONSTRAINT message_confirmations_message_unique UNIQUE (message_id);


--
-- Name: message_confirmations message_confirmations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_confirmations
    ADD CONSTRAINT message_confirmations_pkey PRIMARY KEY (id);


--
-- Name: message_objects message_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_objects
    ADD CONSTRAINT message_objects_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: message_recipients message_recipients_message_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipients
    ADD CONSTRAINT message_recipients_message_user_unique UNIQUE (message_id, recipient_user_id);


--
-- Name: message_recipients message_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_recipients
    ADD CONSTRAINT message_recipients_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_ai_assistant mikro_orm_migrations_ai_assistant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_ai_assistant
    ADD CONSTRAINT mikro_orm_migrations_ai_assistant_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_api_keys mikro_orm_migrations_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_api_keys
    ADD CONSTRAINT mikro_orm_migrations_api_keys_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_attachments mikro_orm_migrations_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_attachments
    ADD CONSTRAINT mikro_orm_migrations_attachments_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_audit_logs mikro_orm_migrations_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_audit_logs
    ADD CONSTRAINT mikro_orm_migrations_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_auth mikro_orm_migrations_auth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_auth
    ADD CONSTRAINT mikro_orm_migrations_auth_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_business_rules mikro_orm_migrations_business_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_business_rules
    ADD CONSTRAINT mikro_orm_migrations_business_rules_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_catalog mikro_orm_migrations_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_catalog
    ADD CONSTRAINT mikro_orm_migrations_catalog_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_checkout mikro_orm_migrations_checkout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_checkout
    ADD CONSTRAINT mikro_orm_migrations_checkout_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_communication_channels mikro_orm_migrations_communication_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_communication_channels
    ADD CONSTRAINT mikro_orm_migrations_communication_channels_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_configs mikro_orm_migrations_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_configs
    ADD CONSTRAINT mikro_orm_migrations_configs_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_currencies mikro_orm_migrations_currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_currencies
    ADD CONSTRAINT mikro_orm_migrations_currencies_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_customer_accounts mikro_orm_migrations_customer_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_customer_accounts
    ADD CONSTRAINT mikro_orm_migrations_customer_accounts_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_customers mikro_orm_migrations_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_customers
    ADD CONSTRAINT mikro_orm_migrations_customers_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dashboards mikro_orm_migrations_dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dashboards
    ADD CONSTRAINT mikro_orm_migrations_dashboards_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_data_sync mikro_orm_migrations_data_sync_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_data_sync
    ADD CONSTRAINT mikro_orm_migrations_data_sync_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_accounts mikro_orm_migrations_dermat_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_accounts
    ADD CONSTRAINT mikro_orm_migrations_dermat_accounts_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_bom mikro_orm_migrations_dermat_bom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_bom
    ADD CONSTRAINT mikro_orm_migrations_dermat_bom_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_boms mikro_orm_migrations_dermat_boms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_boms
    ADD CONSTRAINT mikro_orm_migrations_dermat_boms_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_customers mikro_orm_migrations_dermat_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_customers
    ADD CONSTRAINT mikro_orm_migrations_dermat_customers_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_departments mikro_orm_migrations_dermat_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_departments
    ADD CONSTRAINT mikro_orm_migrations_dermat_departments_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_lists mikro_orm_migrations_dermat_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_lists
    ADD CONSTRAINT mikro_orm_migrations_dermat_lists_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_orders mikro_orm_migrations_dermat_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_orders
    ADD CONSTRAINT mikro_orm_migrations_dermat_orders_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_planning mikro_orm_migrations_dermat_planning_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_planning
    ADD CONSTRAINT mikro_orm_migrations_dermat_planning_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_pm_master mikro_orm_migrations_dermat_pm_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_pm_master
    ADD CONSTRAINT mikro_orm_migrations_dermat_pm_master_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_production mikro_orm_migrations_dermat_production_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_production
    ADD CONSTRAINT mikro_orm_migrations_dermat_production_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_purchase_orders mikro_orm_migrations_dermat_purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_purchase_orders
    ADD CONSTRAINT mikro_orm_migrations_dermat_purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_purchase mikro_orm_migrations_dermat_purchase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_purchase
    ADD CONSTRAINT mikro_orm_migrations_dermat_purchase_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_qc mikro_orm_migrations_dermat_qc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_qc
    ADD CONSTRAINT mikro_orm_migrations_dermat_qc_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_quality mikro_orm_migrations_dermat_quality_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_quality
    ADD CONSTRAINT mikro_orm_migrations_dermat_quality_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_rm_master mikro_orm_migrations_dermat_rm_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_rm_master
    ADD CONSTRAINT mikro_orm_migrations_dermat_rm_master_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_rnd mikro_orm_migrations_dermat_rnd_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_rnd
    ADD CONSTRAINT mikro_orm_migrations_dermat_rnd_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_sampling mikro_orm_migrations_dermat_sampling_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_sampling
    ADD CONSTRAINT mikro_orm_migrations_dermat_sampling_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_store mikro_orm_migrations_dermat_store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_store
    ADD CONSTRAINT mikro_orm_migrations_dermat_store_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_vendors mikro_orm_migrations_dermat_vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_vendors
    ADD CONSTRAINT mikro_orm_migrations_dermat_vendors_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dermat_workflow mikro_orm_migrations_dermat_workflow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dermat_workflow
    ADD CONSTRAINT mikro_orm_migrations_dermat_workflow_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_devices mikro_orm_migrations_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_devices
    ADD CONSTRAINT mikro_orm_migrations_devices_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_dictionaries mikro_orm_migrations_dictionaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_dictionaries
    ADD CONSTRAINT mikro_orm_migrations_dictionaries_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_directory mikro_orm_migrations_directory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_directory
    ADD CONSTRAINT mikro_orm_migrations_directory_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_entities mikro_orm_migrations_entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_entities
    ADD CONSTRAINT mikro_orm_migrations_entities_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_eudr mikro_orm_migrations_eudr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_eudr
    ADD CONSTRAINT mikro_orm_migrations_eudr_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_example_customers_sync mikro_orm_migrations_example_customers_sync_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_example_customers_sync
    ADD CONSTRAINT mikro_orm_migrations_example_customers_sync_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_example mikro_orm_migrations_example_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_example
    ADD CONSTRAINT mikro_orm_migrations_example_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_feature_toggles mikro_orm_migrations_feature_toggles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_feature_toggles
    ADD CONSTRAINT mikro_orm_migrations_feature_toggles_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_inbox_ops mikro_orm_migrations_inbox_ops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_inbox_ops
    ADD CONSTRAINT mikro_orm_migrations_inbox_ops_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_integrations mikro_orm_migrations_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_integrations
    ADD CONSTRAINT mikro_orm_migrations_integrations_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_manufacturing mikro_orm_migrations_manufacturing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_manufacturing
    ADD CONSTRAINT mikro_orm_migrations_manufacturing_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_messages mikro_orm_migrations_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_messages
    ADD CONSTRAINT mikro_orm_migrations_messages_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_notifications mikro_orm_migrations_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_notifications
    ADD CONSTRAINT mikro_orm_migrations_notifications_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_onboarding mikro_orm_migrations_onboarding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_onboarding
    ADD CONSTRAINT mikro_orm_migrations_onboarding_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_payment_gateways mikro_orm_migrations_payment_gateways_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_payment_gateways
    ADD CONSTRAINT mikro_orm_migrations_payment_gateways_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_perspectives mikro_orm_migrations_perspectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_perspectives
    ADD CONSTRAINT mikro_orm_migrations_perspectives_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_planner mikro_orm_migrations_planner_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_planner
    ADD CONSTRAINT mikro_orm_migrations_planner_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_progress mikro_orm_migrations_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_progress
    ADD CONSTRAINT mikro_orm_migrations_progress_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_purchasing mikro_orm_migrations_purchasing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_purchasing
    ADD CONSTRAINT mikro_orm_migrations_purchasing_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_push_notifications mikro_orm_migrations_push_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_push_notifications
    ADD CONSTRAINT mikro_orm_migrations_push_notifications_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_query_index mikro_orm_migrations_query_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_query_index
    ADD CONSTRAINT mikro_orm_migrations_query_index_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_resources mikro_orm_migrations_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_resources
    ADD CONSTRAINT mikro_orm_migrations_resources_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_sales mikro_orm_migrations_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_sales
    ADD CONSTRAINT mikro_orm_migrations_sales_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_scheduler mikro_orm_migrations_scheduler_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_scheduler
    ADD CONSTRAINT mikro_orm_migrations_scheduler_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_shipping_carriers mikro_orm_migrations_shipping_carriers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_shipping_carriers
    ADD CONSTRAINT mikro_orm_migrations_shipping_carriers_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_staff mikro_orm_migrations_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_staff
    ADD CONSTRAINT mikro_orm_migrations_staff_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_sync_excel mikro_orm_migrations_sync_excel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_sync_excel
    ADD CONSTRAINT mikro_orm_migrations_sync_excel_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_translations mikro_orm_migrations_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_translations
    ADD CONSTRAINT mikro_orm_migrations_translations_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_warranty_claims mikro_orm_migrations_warranty_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_warranty_claims
    ADD CONSTRAINT mikro_orm_migrations_warranty_claims_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_webhooks mikro_orm_migrations_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_webhooks
    ADD CONSTRAINT mikro_orm_migrations_webhooks_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_wms mikro_orm_migrations_wms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_wms
    ADD CONSTRAINT mikro_orm_migrations_wms_pkey PRIMARY KEY (id);


--
-- Name: mikro_orm_migrations_workflows mikro_orm_migrations_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mikro_orm_migrations_workflows
    ADD CONSTRAINT mikro_orm_migrations_workflows_pkey PRIMARY KEY (id);


--
-- Name: module_configs module_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_configs
    ADD CONSTRAINT module_configs_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_type_overrides notification_type_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_type_overrides
    ADD CONSTRAINT notification_type_overrides_pkey PRIMARY KEY (id);


--
-- Name: notification_types notification_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_types
    ADD CONSTRAINT notification_types_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: onboarding_requests onboarding_requests_email_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_requests
    ADD CONSTRAINT onboarding_requests_email_hash_unique UNIQUE (email_hash);


--
-- Name: onboarding_requests onboarding_requests_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_requests
    ADD CONSTRAINT onboarding_requests_email_unique UNIQUE (email);


--
-- Name: onboarding_requests onboarding_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_requests
    ADD CONSTRAINT onboarding_requests_pkey PRIMARY KEY (id);


--
-- Name: onboarding_requests onboarding_requests_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_requests
    ADD CONSTRAINT onboarding_requests_token_hash_unique UNIQUE (token_hash);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_tenant_slug_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_tenant_slug_uniq UNIQUE (tenant_id, slug);


--
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_token_unique UNIQUE (token);


--
-- Name: perspectives perspectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perspectives
    ADD CONSTRAINT perspectives_pkey PRIMARY KEY (id);


--
-- Name: planner_availability_rule_sets planner_availability_rule_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planner_availability_rule_sets
    ADD CONSTRAINT planner_availability_rule_sets_pkey PRIMARY KEY (id);


--
-- Name: planner_availability_rules planner_availability_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planner_availability_rules
    ADD CONSTRAINT planner_availability_rules_pkey PRIMARY KEY (id);


--
-- Name: progress_jobs progress_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_jobs
    ADD CONSTRAINT progress_jobs_pkey PRIMARY KEY (id);


--
-- Name: purchasing_goods_receipt_lines purchasing_goods_receipt_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchasing_goods_receipt_lines
    ADD CONSTRAINT purchasing_goods_receipt_lines_pkey PRIMARY KEY (id);


--
-- Name: purchasing_goods_receipts purchasing_goods_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchasing_goods_receipts
    ADD CONSTRAINT purchasing_goods_receipts_pkey PRIMARY KEY (id);


--
-- Name: purchasing_purchase_invoice_lines purchasing_purchase_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchasing_purchase_invoice_lines
    ADD CONSTRAINT purchasing_purchase_invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: purchasing_purchase_invoices purchasing_purchase_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchasing_purchase_invoices
    ADD CONSTRAINT purchasing_purchase_invoices_pkey PRIMARY KEY (id);


--
-- Name: purchasing_purchase_order_lines purchasing_purchase_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchasing_purchase_order_lines
    ADD CONSTRAINT purchasing_purchase_order_lines_pkey PRIMARY KEY (id);


--
-- Name: purchasing_purchase_orders purchasing_purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchasing_purchase_orders
    ADD CONSTRAINT purchasing_purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchasing_supplier_pricing purchasing_supplier_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchasing_supplier_pricing
    ADD CONSTRAINT purchasing_supplier_pricing_pkey PRIMARY KEY (id);


--
-- Name: purchasing_suppliers purchasing_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchasing_suppliers
    ADD CONSTRAINT purchasing_suppliers_pkey PRIMARY KEY (id);


--
-- Name: push_notification_deliveries push_notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_notification_deliveries
    ADD CONSTRAINT push_notification_deliveries_pkey PRIMARY KEY (id);


--
-- Name: resources_resource_activities resources_resource_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources_resource_activities
    ADD CONSTRAINT resources_resource_activities_pkey PRIMARY KEY (id);


--
-- Name: resources_resource_comments resources_resource_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources_resource_comments
    ADD CONSTRAINT resources_resource_comments_pkey PRIMARY KEY (id);


--
-- Name: resources_resource_tag_assignments resources_resource_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources_resource_tag_assignments
    ADD CONSTRAINT resources_resource_tag_assignments_pkey PRIMARY KEY (id);


--
-- Name: resources_resource_tag_assignments resources_resource_tag_assignments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources_resource_tag_assignments
    ADD CONSTRAINT resources_resource_tag_assignments_unique UNIQUE (tag_id, resource_id);


--
-- Name: resources_resource_tags resources_resource_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources_resource_tags
    ADD CONSTRAINT resources_resource_tags_pkey PRIMARY KEY (id);


--
-- Name: resources_resource_tags resources_resource_tags_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources_resource_tags
    ADD CONSTRAINT resources_resource_tags_slug_unique UNIQUE (organization_id, tenant_id, slug);


--
-- Name: resources_resource_types resources_resource_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources_resource_types
    ADD CONSTRAINT resources_resource_types_pkey PRIMARY KEY (id);


--
-- Name: resources_resources resources_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources_resources
    ADD CONSTRAINT resources_resources_pkey PRIMARY KEY (id);


--
-- Name: role_acls role_acls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_acls
    ADD CONSTRAINT role_acls_pkey PRIMARY KEY (id);


--
-- Name: role_perspectives role_perspectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_perspectives
    ADD CONSTRAINT role_perspectives_pkey PRIMARY KEY (id);


--
-- Name: role_sidebar_preferences role_sidebar_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_sidebar_preferences
    ADD CONSTRAINT role_sidebar_preferences_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_tenant_id_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_tenant_id_name_unique UNIQUE (tenant_id, name);


--
-- Name: rule_execution_logs rule_execution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_execution_logs
    ADD CONSTRAINT rule_execution_logs_pkey PRIMARY KEY (id);


--
-- Name: rule_set_members rule_set_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_set_members
    ADD CONSTRAINT rule_set_members_pkey PRIMARY KEY (id);


--
-- Name: rule_set_members rule_set_members_rule_set_id_rule_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_set_members
    ADD CONSTRAINT rule_set_members_rule_set_id_rule_id_unique UNIQUE (rule_set_id, rule_id);


--
-- Name: rule_sets rule_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_sets
    ADD CONSTRAINT rule_sets_pkey PRIMARY KEY (id);


--
-- Name: rule_sets rule_sets_set_id_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_sets
    ADD CONSTRAINT rule_sets_set_id_tenant_id_unique UNIQUE (set_id, tenant_id);


--
-- Name: sales_channels sales_channels_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_code_unique UNIQUE (organization_id, tenant_id, code);


--
-- Name: sales_channels sales_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_pkey PRIMARY KEY (id);


--
-- Name: sales_credit_memo_lines sales_credit_memo_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_credit_memo_lines
    ADD CONSTRAINT sales_credit_memo_lines_pkey PRIMARY KEY (id);


--
-- Name: sales_credit_memos sales_credit_memos_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_credit_memos
    ADD CONSTRAINT sales_credit_memos_number_unique UNIQUE (organization_id, tenant_id, credit_memo_number);


--
-- Name: sales_credit_memos sales_credit_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_credit_memos
    ADD CONSTRAINT sales_credit_memos_pkey PRIMARY KEY (id);


--
-- Name: sales_delivery_windows sales_delivery_windows_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_delivery_windows
    ADD CONSTRAINT sales_delivery_windows_code_unique UNIQUE (organization_id, tenant_id, code);


--
-- Name: sales_delivery_windows sales_delivery_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_delivery_windows
    ADD CONSTRAINT sales_delivery_windows_pkey PRIMARY KEY (id);


--
-- Name: sales_document_addresses sales_document_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_document_addresses
    ADD CONSTRAINT sales_document_addresses_pkey PRIMARY KEY (id);


--
-- Name: sales_document_sequences sales_document_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_document_sequences
    ADD CONSTRAINT sales_document_sequences_pkey PRIMARY KEY (id);


--
-- Name: sales_document_sequences sales_document_sequences_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_document_sequences
    ADD CONSTRAINT sales_document_sequences_scope_unique UNIQUE (organization_id, tenant_id, document_kind);


--
-- Name: sales_document_tag_assignments sales_document_tag_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_document_tag_assignments
    ADD CONSTRAINT sales_document_tag_assignments_pkey PRIMARY KEY (id);


--
-- Name: sales_document_tag_assignments sales_document_tag_assignments_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_document_tag_assignments
    ADD CONSTRAINT sales_document_tag_assignments_unique UNIQUE (tag_id, document_id, document_kind);


--
-- Name: sales_document_tags sales_document_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_document_tags
    ADD CONSTRAINT sales_document_tags_pkey PRIMARY KEY (id);


--
-- Name: sales_document_tags sales_document_tags_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_document_tags
    ADD CONSTRAINT sales_document_tags_slug_unique UNIQUE (organization_id, tenant_id, slug);


--
-- Name: sales_invoice_lines sales_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: sales_invoices sales_invoices_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_number_unique UNIQUE (organization_id, tenant_id, invoice_number);


--
-- Name: sales_invoices sales_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_pkey PRIMARY KEY (id);


--
-- Name: sales_notes sales_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_notes
    ADD CONSTRAINT sales_notes_pkey PRIMARY KEY (id);


--
-- Name: sales_order_adjustments sales_order_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_adjustments
    ADD CONSTRAINT sales_order_adjustments_pkey PRIMARY KEY (id);


--
-- Name: sales_order_lines sales_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_order_lines
    ADD CONSTRAINT sales_order_lines_pkey PRIMARY KEY (id);


--
-- Name: sales_orders sales_orders_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_number_unique UNIQUE (organization_id, tenant_id, order_number);


--
-- Name: sales_orders sales_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_orders
    ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);


--
-- Name: sales_payment_allocations sales_payment_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_payment_allocations
    ADD CONSTRAINT sales_payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: sales_payment_methods sales_payment_methods_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_payment_methods
    ADD CONSTRAINT sales_payment_methods_code_unique UNIQUE (organization_id, tenant_id, code);


--
-- Name: sales_payment_methods sales_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_payment_methods
    ADD CONSTRAINT sales_payment_methods_pkey PRIMARY KEY (id);


--
-- Name: sales_payments sales_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_payments
    ADD CONSTRAINT sales_payments_pkey PRIMARY KEY (id);


--
-- Name: sales_quote_adjustments sales_quote_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quote_adjustments
    ADD CONSTRAINT sales_quote_adjustments_pkey PRIMARY KEY (id);


--
-- Name: sales_quote_lines sales_quote_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quote_lines
    ADD CONSTRAINT sales_quote_lines_pkey PRIMARY KEY (id);


--
-- Name: sales_quotes sales_quotes_acceptance_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotes
    ADD CONSTRAINT sales_quotes_acceptance_token_unique UNIQUE (acceptance_token);


--
-- Name: sales_quotes sales_quotes_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotes
    ADD CONSTRAINT sales_quotes_number_unique UNIQUE (organization_id, tenant_id, quote_number);


--
-- Name: sales_quotes sales_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotes
    ADD CONSTRAINT sales_quotes_pkey PRIMARY KEY (id);


--
-- Name: sales_return_lines sales_return_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_return_lines
    ADD CONSTRAINT sales_return_lines_pkey PRIMARY KEY (id);


--
-- Name: sales_returns sales_returns_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns
    ADD CONSTRAINT sales_returns_number_unique UNIQUE (organization_id, tenant_id, return_number);


--
-- Name: sales_returns sales_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_returns
    ADD CONSTRAINT sales_returns_pkey PRIMARY KEY (id);


--
-- Name: sales_settings sales_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_settings
    ADD CONSTRAINT sales_settings_pkey PRIMARY KEY (id);


--
-- Name: sales_settings sales_settings_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_settings
    ADD CONSTRAINT sales_settings_scope_unique UNIQUE (organization_id, tenant_id);


--
-- Name: sales_shipment_items sales_shipment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_shipment_items
    ADD CONSTRAINT sales_shipment_items_pkey PRIMARY KEY (id);


--
-- Name: sales_shipments sales_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_shipments
    ADD CONSTRAINT sales_shipments_pkey PRIMARY KEY (id);


--
-- Name: sales_shipping_methods sales_shipping_methods_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_shipping_methods
    ADD CONSTRAINT sales_shipping_methods_code_unique UNIQUE (organization_id, tenant_id, code);


--
-- Name: sales_shipping_methods sales_shipping_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_shipping_methods
    ADD CONSTRAINT sales_shipping_methods_pkey PRIMARY KEY (id);


--
-- Name: sales_tax_rates sales_tax_rates_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_rates
    ADD CONSTRAINT sales_tax_rates_code_unique UNIQUE (organization_id, tenant_id, code);


--
-- Name: sales_tax_rates sales_tax_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_tax_rates
    ADD CONSTRAINT sales_tax_rates_pkey PRIMARY KEY (id);


--
-- Name: scheduled_jobs scheduled_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_jobs
    ADD CONSTRAINT scheduled_jobs_pkey PRIMARY KEY (id);


--
-- Name: search_tokens search_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_tokens
    ADD CONSTRAINT search_tokens_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_unique UNIQUE (token);


--
-- Name: sidebar_variants sidebar_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sidebar_variants
    ADD CONSTRAINT sidebar_variants_pkey PRIMARY KEY (id);


--
-- Name: staff_leave_requests staff_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave_requests
    ADD CONSTRAINT staff_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: staff_team_member_activities staff_team_member_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_team_member_activities
    ADD CONSTRAINT staff_team_member_activities_pkey PRIMARY KEY (id);


--
-- Name: staff_team_member_addresses staff_team_member_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_team_member_addresses
    ADD CONSTRAINT staff_team_member_addresses_pkey PRIMARY KEY (id);


--
-- Name: staff_team_member_comments staff_team_member_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_team_member_comments
    ADD CONSTRAINT staff_team_member_comments_pkey PRIMARY KEY (id);


--
-- Name: staff_team_member_job_histories staff_team_member_job_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_team_member_job_histories
    ADD CONSTRAINT staff_team_member_job_histories_pkey PRIMARY KEY (id);


--
-- Name: staff_team_members staff_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_team_members
    ADD CONSTRAINT staff_team_members_pkey PRIMARY KEY (id);


--
-- Name: staff_team_roles staff_team_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_team_roles
    ADD CONSTRAINT staff_team_roles_pkey PRIMARY KEY (id);


--
-- Name: staff_teams staff_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_teams
    ADD CONSTRAINT staff_teams_pkey PRIMARY KEY (id);


--
-- Name: staff_time_entries staff_time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_time_entries
    ADD CONSTRAINT staff_time_entries_pkey PRIMARY KEY (id);


--
-- Name: staff_time_entry_segments staff_time_entry_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_time_entry_segments
    ADD CONSTRAINT staff_time_entry_segments_pkey PRIMARY KEY (id);


--
-- Name: staff_time_project_members staff_time_project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_time_project_members
    ADD CONSTRAINT staff_time_project_members_pkey PRIMARY KEY (id);


--
-- Name: staff_time_projects staff_time_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_time_projects
    ADD CONSTRAINT staff_time_projects_pkey PRIMARY KEY (id);


--
-- Name: step_instances step_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.step_instances
    ADD CONSTRAINT step_instances_pkey PRIMARY KEY (id);


--
-- Name: sync_cursors sync_cursors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_cursors
    ADD CONSTRAINT sync_cursors_pkey PRIMARY KEY (id);


--
-- Name: sync_excel_uploads sync_excel_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_excel_uploads
    ADD CONSTRAINT sync_excel_uploads_pkey PRIMARY KEY (id);


--
-- Name: sync_external_id_mappings sync_external_id_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_external_id_mappings
    ADD CONSTRAINT sync_external_id_mappings_pkey PRIMARY KEY (id);


--
-- Name: sync_mappings sync_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_mappings
    ADD CONSTRAINT sync_mappings_pkey PRIMARY KEY (id);


--
-- Name: sync_runs sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_runs
    ADD CONSTRAINT sync_runs_pkey PRIMARY KEY (id);


--
-- Name: sync_schedules sync_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_schedules
    ADD CONSTRAINT sync_schedules_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: todos todos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_pkey PRIMARY KEY (id);


--
-- Name: upgrade_action_runs upgrade_action_runs_action_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upgrade_action_runs
    ADD CONSTRAINT upgrade_action_runs_action_scope_unique UNIQUE (version, action_id, organization_id, tenant_id);


--
-- Name: upgrade_action_runs upgrade_action_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upgrade_action_runs
    ADD CONSTRAINT upgrade_action_runs_pkey PRIMARY KEY (id);


--
-- Name: user_acls user_acls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_acls
    ADD CONSTRAINT user_acls_pkey PRIMARY KEY (id);


--
-- Name: user_consents user_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_pkey PRIMARY KEY (id);


--
-- Name: user_consents user_consents_user_id_tenant_id_consent_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_consents
    ADD CONSTRAINT user_consents_user_id_tenant_id_consent_type_unique UNIQUE (user_id, tenant_id, consent_type);


--
-- Name: user_devices user_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_sidebar_preferences user_sidebar_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sidebar_preferences
    ADD CONSTRAINT user_sidebar_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_tasks user_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tasks
    ADD CONSTRAINT user_tasks_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warranty_claim_events warranty_claim_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_events
    ADD CONSTRAINT warranty_claim_events_pkey PRIMARY KEY (id);


--
-- Name: warranty_claim_lines warranty_claim_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_lines
    ADD CONSTRAINT warranty_claim_lines_pkey PRIMARY KEY (id);


--
-- Name: warranty_claim_registrations warranty_claim_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_registrations
    ADD CONSTRAINT warranty_claim_registrations_pkey PRIMARY KEY (id);


--
-- Name: warranty_claim_sequences warranty_claim_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_sequences
    ADD CONSTRAINT warranty_claim_sequences_pkey PRIMARY KEY (id);


--
-- Name: warranty_claim_sequences warranty_claim_sequences_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_sequences
    ADD CONSTRAINT warranty_claim_sequences_type_unique UNIQUE (tenant_id, organization_id, claim_type);


--
-- Name: warranty_claim_settings warranty_claim_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_settings
    ADD CONSTRAINT warranty_claim_settings_pkey PRIMARY KEY (id);


--
-- Name: warranty_claim_settings warranty_claim_settings_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_settings
    ADD CONSTRAINT warranty_claim_settings_scope_unique UNIQUE (organization_id, tenant_id);


--
-- Name: warranty_claim_sla_signals warranty_claim_sla_signals_claim_event_cycle_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_sla_signals
    ADD CONSTRAINT warranty_claim_sla_signals_claim_event_cycle_unique UNIQUE (tenant_id, organization_id, claim_id, event_id, cycle_key);


--
-- Name: warranty_claim_sla_signals warranty_claim_sla_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_sla_signals
    ADD CONSTRAINT warranty_claim_sla_signals_pkey PRIMARY KEY (id);


--
-- Name: warranty_claim_troubleshooting_guides warranty_claim_troubleshooting_guides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_troubleshooting_guides
    ADD CONSTRAINT warranty_claim_troubleshooting_guides_pkey PRIMARY KEY (id);


--
-- Name: warranty_claim_vendor_policies warranty_claim_vendor_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claim_vendor_policies
    ADD CONSTRAINT warranty_claim_vendor_policies_pkey PRIMARY KEY (id);


--
-- Name: warranty_claims warranty_claims_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_number_unique UNIQUE (tenant_id, organization_id, claim_number);


--
-- Name: warranty_claims warranty_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhook_inbound_configs webhook_inbound_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_inbound_configs
    ADD CONSTRAINT webhook_inbound_configs_pkey PRIMARY KEY (id);


--
-- Name: webhook_inbound_configs webhook_inbound_configs_source_scope_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_inbound_configs
    ADD CONSTRAINT webhook_inbound_configs_source_scope_unique UNIQUE (source_key, organization_id, tenant_id);


--
-- Name: webhook_inbound_receipts webhook_inbound_receipts_endpoint_message_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_inbound_receipts
    ADD CONSTRAINT webhook_inbound_receipts_endpoint_message_unique UNIQUE (endpoint_id, message_id);


--
-- Name: webhook_inbound_receipts webhook_inbound_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_inbound_receipts
    ADD CONSTRAINT webhook_inbound_receipts_pkey PRIMARY KEY (id);


--
-- Name: webhook_ingestions webhook_ingestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_ingestions
    ADD CONSTRAINT webhook_ingestions_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: wms_inventory_balances wms_inventory_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_inventory_balances
    ADD CONSTRAINT wms_inventory_balances_pkey PRIMARY KEY (id);


--
-- Name: wms_inventory_lots wms_inventory_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_inventory_lots
    ADD CONSTRAINT wms_inventory_lots_pkey PRIMARY KEY (id);


--
-- Name: wms_inventory_movements wms_inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_inventory_movements
    ADD CONSTRAINT wms_inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: wms_inventory_reservations wms_inventory_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_inventory_reservations
    ADD CONSTRAINT wms_inventory_reservations_pkey PRIMARY KEY (id);


--
-- Name: wms_product_inventory_profiles wms_product_inventory_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_product_inventory_profiles
    ADD CONSTRAINT wms_product_inventory_profiles_pkey PRIMARY KEY (id);


--
-- Name: wms_sales_order_warehouse_assignments wms_sowa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_sales_order_warehouse_assignments
    ADD CONSTRAINT wms_sowa_pkey PRIMARY KEY (id);


--
-- Name: wms_stock_valuations wms_stock_valuations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_valuations
    ADD CONSTRAINT wms_stock_valuations_pkey PRIMARY KEY (id);


--
-- Name: wms_warehouse_locations wms_warehouse_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_warehouse_locations
    ADD CONSTRAINT wms_warehouse_locations_pkey PRIMARY KEY (id);


--
-- Name: wms_warehouse_zones wms_warehouse_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_warehouse_zones
    ADD CONSTRAINT wms_warehouse_zones_pkey PRIMARY KEY (id);


--
-- Name: wms_warehouses wms_warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_warehouses
    ADD CONSTRAINT wms_warehouses_pkey PRIMARY KEY (id);


--
-- Name: workflow_branch_instances workflow_branch_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_branch_instances
    ADD CONSTRAINT workflow_branch_instances_pkey PRIMARY KEY (id);


--
-- Name: workflow_definitions workflow_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id);


--
-- Name: workflow_definitions workflow_definitions_workflow_id_tenant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_workflow_id_tenant_id_unique UNIQUE (workflow_id, tenant_id);


--
-- Name: workflow_event_triggers workflow_event_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_event_triggers
    ADD CONSTRAINT workflow_event_triggers_pkey PRIMARY KEY (id);


--
-- Name: workflow_events workflow_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_events
    ADD CONSTRAINT workflow_events_pkey PRIMARY KEY (id);


--
-- Name: workflow_instances workflow_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_pkey PRIMARY KEY (id);


--
-- Name: access_logs_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_logs_actor_idx ON public.access_logs USING btree (actor_user_id, created_at);


--
-- Name: access_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_logs_created_at_idx ON public.access_logs USING btree (created_at);


--
-- Name: access_logs_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_logs_tenant_idx ON public.access_logs USING btree (tenant_id, created_at);


--
-- Name: action_logs_action_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_action_type_idx ON public.action_logs USING btree (tenant_id, organization_id, action_type, created_at);


--
-- Name: action_logs_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_actor_idx ON public.action_logs USING btree (actor_user_id, created_at);


--
-- Name: action_logs_changed_fields_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_changed_fields_idx ON public.action_logs USING gin (changed_fields);


--
-- Name: action_logs_parent_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_parent_resource_idx ON public.action_logs USING btree (tenant_id, parent_resource_kind, parent_resource_id, created_at);


--
-- Name: action_logs_primary_changed_field_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_primary_changed_field_idx ON public.action_logs USING btree (tenant_id, organization_id, primary_changed_field, created_at);


--
-- Name: action_logs_related_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_related_resource_idx ON public.action_logs USING btree (tenant_id, related_resource_kind, related_resource_id, created_at);


--
-- Name: action_logs_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_resource_idx ON public.action_logs USING btree (tenant_id, resource_kind, resource_id, created_at);


--
-- Name: action_logs_source_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_source_key_idx ON public.action_logs USING btree (tenant_id, organization_id, source_key, created_at);


--
-- Name: action_logs_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX action_logs_tenant_idx ON public.action_logs USING btree (tenant_id, created_at);


--
-- Name: ai_agent_mutation_policy_overrides_tenant_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_agent_mutation_policy_overrides_tenant_agent_idx ON public.ai_agent_mutation_policy_overrides USING btree (tenant_id, agent_id);


--
-- Name: ai_agent_mutation_policy_overrides_tenant_agent_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_agent_mutation_policy_overrides_tenant_agent_null_org_uq ON public.ai_agent_mutation_policy_overrides USING btree (tenant_id, agent_id) WHERE (organization_id IS NULL);


--
-- Name: ai_agent_mutation_policy_overrides_tenant_org_agent_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_agent_mutation_policy_overrides_tenant_org_agent_uq ON public.ai_agent_mutation_policy_overrides USING btree (tenant_id, organization_id, agent_id) WHERE (organization_id IS NOT NULL);


--
-- Name: ai_agent_prompt_overrides_tenant_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_agent_prompt_overrides_tenant_agent_idx ON public.ai_agent_prompt_overrides USING btree (tenant_id, agent_id);


--
-- Name: ai_agent_prompt_overrides_tenant_agent_version_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_agent_prompt_overrides_tenant_agent_version_null_org_uq ON public.ai_agent_prompt_overrides USING btree (tenant_id, agent_id, version) WHERE (organization_id IS NULL);


--
-- Name: ai_agent_prompt_overrides_tenant_org_agent_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_agent_prompt_overrides_tenant_org_agent_version_idx ON public.ai_agent_prompt_overrides USING btree (tenant_id, organization_id, agent_id, version DESC);


--
-- Name: ai_agent_prompt_overrides_tenant_org_agent_version_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_agent_prompt_overrides_tenant_org_agent_version_uq ON public.ai_agent_prompt_overrides USING btree (tenant_id, organization_id, agent_id, version) WHERE (organization_id IS NOT NULL);


--
-- Name: ai_agent_runtime_overrides_tenant_agent_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_agent_runtime_overrides_tenant_agent_null_org_uq ON public.ai_agent_runtime_overrides USING btree (tenant_id, agent_id) WHERE ((deleted_at IS NULL) AND (organization_id IS NULL) AND (agent_id IS NOT NULL));


--
-- Name: ai_agent_runtime_overrides_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_agent_runtime_overrides_tenant_idx ON public.ai_agent_runtime_overrides USING btree (tenant_id);


--
-- Name: ai_agent_runtime_overrides_tenant_null_agent_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_agent_runtime_overrides_tenant_null_agent_null_org_uq ON public.ai_agent_runtime_overrides USING btree (tenant_id) WHERE ((deleted_at IS NULL) AND (organization_id IS NULL) AND (agent_id IS NULL));


--
-- Name: ai_agent_runtime_overrides_tenant_org_agent_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_agent_runtime_overrides_tenant_org_agent_uq ON public.ai_agent_runtime_overrides USING btree (tenant_id, organization_id, agent_id) WHERE ((deleted_at IS NULL) AND (organization_id IS NOT NULL) AND (agent_id IS NOT NULL));


--
-- Name: ai_agent_runtime_overrides_tenant_org_null_agent_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_agent_runtime_overrides_tenant_org_null_agent_uq ON public.ai_agent_runtime_overrides USING btree (tenant_id, organization_id) WHERE ((deleted_at IS NULL) AND (organization_id IS NOT NULL) AND (agent_id IS NULL));


--
-- Name: ai_chat_conv_participants_active_conv_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_chat_conv_participants_active_conv_user_idx ON public.ai_chat_conversation_participants USING btree (tenant_id, organization_id, conversation_id, user_id) WHERE (deleted_at IS NULL);


--
-- Name: ai_chat_conv_participants_tenant_conv_user_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_chat_conv_participants_tenant_conv_user_null_org_uq ON public.ai_chat_conversation_participants USING btree (tenant_id, conversation_id, user_id) WHERE (organization_id IS NULL);


--
-- Name: ai_chat_conv_participants_tenant_org_conv_user_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_chat_conv_participants_tenant_org_conv_user_uq ON public.ai_chat_conversation_participants USING btree (tenant_id, organization_id, conversation_id, user_id) WHERE (organization_id IS NOT NULL);


--
-- Name: ai_chat_conv_participants_tenant_org_user_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_chat_conv_participants_tenant_org_user_conv_idx ON public.ai_chat_conversation_participants USING btree (tenant_id, organization_id, user_id, conversation_id);


--
-- Name: ai_chat_conversations_tenant_conv_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_chat_conversations_tenant_conv_null_org_uq ON public.ai_chat_conversations USING btree (tenant_id, conversation_id) WHERE ((organization_id IS NULL) AND (deleted_at IS NULL));


--
-- Name: ai_chat_conversations_tenant_org_conv_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_chat_conversations_tenant_org_conv_uq ON public.ai_chat_conversations USING btree (tenant_id, organization_id, conversation_id) WHERE ((organization_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: ai_chat_conversations_tenant_org_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_chat_conversations_tenant_org_deleted_idx ON public.ai_chat_conversations USING btree (tenant_id, organization_id, deleted_at);


--
-- Name: ai_chat_conversations_tenant_org_owner_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_chat_conversations_tenant_org_owner_agent_idx ON public.ai_chat_conversations USING btree (tenant_id, organization_id, owner_user_id, agent_id, status, last_message_at);


--
-- Name: ai_chat_messages_tenant_conv_client_id_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_chat_messages_tenant_conv_client_id_null_org_uq ON public.ai_chat_messages USING btree (tenant_id, conversation_id, client_message_id) WHERE ((organization_id IS NULL) AND (client_message_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: ai_chat_messages_tenant_org_conv_client_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_chat_messages_tenant_org_conv_client_id_uq ON public.ai_chat_messages USING btree (tenant_id, organization_id, conversation_id, client_message_id) WHERE ((organization_id IS NOT NULL) AND (client_message_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: ai_chat_messages_tenant_org_conv_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_chat_messages_tenant_org_conv_created_idx ON public.ai_chat_messages USING btree (tenant_id, organization_id, conversation_id, created_at);


--
-- Name: ai_chat_messages_tenant_org_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_chat_messages_tenant_org_deleted_idx ON public.ai_chat_messages USING btree (tenant_id, organization_id, deleted_at);


--
-- Name: ai_moderation_flags_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_moderation_flags_tenant_created_idx ON public.ai_moderation_flags USING btree (tenant_id, created_at);


--
-- Name: ai_moderation_flags_tenant_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_moderation_flags_tenant_user_idx ON public.ai_moderation_flags USING btree (tenant_id, user_id);


--
-- Name: ai_pending_actions_tenant_idem_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_pending_actions_tenant_idem_null_org_uq ON public.ai_pending_actions USING btree (tenant_id, idempotency_key) WHERE (organization_id IS NULL);


--
-- Name: ai_pending_actions_tenant_org_agent_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_pending_actions_tenant_org_agent_status_idx ON public.ai_pending_actions USING btree (tenant_id, organization_id, agent_id, status);


--
-- Name: ai_pending_actions_tenant_org_idempotency_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_pending_actions_tenant_org_idempotency_uq ON public.ai_pending_actions USING btree (tenant_id, organization_id, idempotency_key) WHERE (organization_id IS NOT NULL);


--
-- Name: ai_pending_actions_tenant_org_status_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_pending_actions_tenant_org_status_expires_idx ON public.ai_pending_actions USING btree (tenant_id, organization_id, status, expires_at);


--
-- Name: ai_tenant_model_allowlists_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_tenant_model_allowlists_tenant_idx ON public.ai_tenant_model_allowlists USING btree (tenant_id);


--
-- Name: ai_tenant_model_allowlists_tenant_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_tenant_model_allowlists_tenant_null_org_uq ON public.ai_tenant_model_allowlists USING btree (tenant_id) WHERE ((deleted_at IS NULL) AND (organization_id IS NULL));


--
-- Name: ai_tenant_model_allowlists_tenant_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_tenant_model_allowlists_tenant_org_uq ON public.ai_tenant_model_allowlists USING btree (tenant_id, organization_id) WHERE ((deleted_at IS NULL) AND (organization_id IS NOT NULL));


--
-- Name: ai_token_usage_daily_tenant_day_agent_model_null_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_token_usage_daily_tenant_day_agent_model_null_org_uq ON public.ai_token_usage_daily USING btree (tenant_id, day, agent_id, model_id) WHERE (organization_id IS NULL);


--
-- Name: ai_token_usage_daily_tenant_day_agent_model_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_token_usage_daily_tenant_day_agent_model_org_uq ON public.ai_token_usage_daily USING btree (tenant_id, day, agent_id, model_id, organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: ai_token_usage_daily_tenant_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_token_usage_daily_tenant_day_idx ON public.ai_token_usage_daily USING btree (tenant_id, day);


--
-- Name: ai_token_usage_events_tenant_agent_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_token_usage_events_tenant_agent_created_idx ON public.ai_token_usage_events USING btree (tenant_id, agent_id, created_at);


--
-- Name: ai_token_usage_events_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_token_usage_events_tenant_created_idx ON public.ai_token_usage_events USING btree (tenant_id, created_at);


--
-- Name: ai_token_usage_events_tenant_model_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_token_usage_events_tenant_model_created_idx ON public.ai_token_usage_events USING btree (tenant_id, model_id, created_at);


--
-- Name: ai_token_usage_events_tenant_session_turn_step_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_token_usage_events_tenant_session_turn_step_idx ON public.ai_token_usage_events USING btree (tenant_id, session_id, turn_id, step_index);


--
-- Name: api_keys_opencode_session_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX api_keys_opencode_session_id_uq ON public.api_keys USING btree (opencode_session_id) WHERE ((opencode_session_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: attachment_partitions_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachment_partitions_tenant_idx ON public.attachment_partitions USING btree (tenant_id);


--
-- Name: attachment_quota_reservations_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachment_quota_reservations_expires_idx ON public.attachment_quota_reservations USING btree (expires_at);


--
-- Name: attachment_quota_reservations_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachment_quota_reservations_tenant_status_idx ON public.attachment_quota_reservations USING btree (tenant_id, status);


--
-- Name: attachments_entity_record_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_entity_record_idx ON public.attachments USING btree (record_id);


--
-- Name: attachments_partition_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_partition_code_idx ON public.attachments USING btree (partition_code);


--
-- Name: business_rules_entity_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_rules_entity_event_idx ON public.business_rules USING btree (entity_type, event_type, enabled);


--
-- Name: business_rules_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_rules_tenant_org_idx ON public.business_rules USING btree (tenant_id, organization_id);


--
-- Name: business_rules_type_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_rules_type_enabled_idx ON public.business_rules USING btree (rule_type, enabled, priority);


--
-- Name: carrier_shipments_order_id_organization_id_tenant_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carrier_shipments_order_id_organization_id_tenant_id_index ON public.carrier_shipments USING btree (order_id, organization_id, tenant_id);


--
-- Name: carrier_shipments_organization_id_tenant_id_unifie_47ae1_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carrier_shipments_organization_id_tenant_id_unifie_47ae1_index ON public.carrier_shipments USING btree (organization_id, tenant_id, unified_status);


--
-- Name: carrier_shipments_provider_key_carrier_shipment_id_f580a_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carrier_shipments_provider_key_carrier_shipment_id_f580a_index ON public.carrier_shipments USING btree (provider_key, carrier_shipment_id, organization_id);


--
-- Name: catalog_price_kinds_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_price_kinds_tenant_idx ON public.catalog_price_kinds USING btree (tenant_id);


--
-- Name: catalog_product_categories_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_categories_scope_idx ON public.catalog_product_categories USING btree (organization_id, tenant_id);


--
-- Name: catalog_product_category_assignments_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_category_assignments_scope_idx ON public.catalog_product_category_assignments USING btree (organization_id, tenant_id);


--
-- Name: catalog_product_offers_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_offers_scope_idx ON public.catalog_product_offers USING btree (organization_id, tenant_id);


--
-- Name: catalog_product_option_schemas_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_option_schemas_scope_idx ON public.catalog_product_option_schemas USING btree (organization_id, tenant_id);


--
-- Name: catalog_product_option_values_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_option_values_scope_idx ON public.catalog_product_option_values USING btree (option_id, organization_id, tenant_id);


--
-- Name: catalog_product_options_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_options_scope_idx ON public.catalog_product_options USING btree (product_id, organization_id, tenant_id);


--
-- Name: catalog_product_relations_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_relations_child_idx ON public.catalog_product_relations USING btree (child_product_id, organization_id, tenant_id);


--
-- Name: catalog_product_relations_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_relations_parent_idx ON public.catalog_product_relations USING btree (parent_product_id, organization_id, tenant_id);


--
-- Name: catalog_product_tag_assignments_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_tag_assignments_scope_idx ON public.catalog_product_tag_assignments USING btree (organization_id, tenant_id);


--
-- Name: catalog_product_tags_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_tags_scope_idx ON public.catalog_product_tags USING btree (organization_id, tenant_id);


--
-- Name: catalog_product_unit_conversions_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_unit_conversions_scope_idx ON public.catalog_product_unit_conversions USING btree (organization_id, tenant_id, product_id);


--
-- Name: catalog_product_variant_prices_product_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_variant_prices_product_scope_idx ON public.catalog_product_variant_prices USING btree (product_id, organization_id, tenant_id);


--
-- Name: catalog_product_variant_prices_variant_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_variant_prices_variant_scope_idx ON public.catalog_product_variant_prices USING btree (variant_id, organization_id, tenant_id);


--
-- Name: catalog_product_variant_relations_child_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_variant_relations_child_idx ON public.catalog_product_variant_relations USING btree (child_variant_id, organization_id, tenant_id);


--
-- Name: catalog_product_variant_relations_child_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_variant_relations_child_product_idx ON public.catalog_product_variant_relations USING btree (child_product_id, organization_id, tenant_id);


--
-- Name: catalog_product_variant_relations_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_variant_relations_parent_idx ON public.catalog_product_variant_relations USING btree (parent_variant_id, organization_id, tenant_id);


--
-- Name: catalog_product_variants_gtin_scope_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX catalog_product_variants_gtin_scope_unique ON public.catalog_product_variants USING btree (tenant_id, organization_id, gtin_type, barcode) WHERE ((deleted_at IS NULL) AND (gtin_type IS NOT NULL) AND (barcode IS NOT NULL));


--
-- Name: catalog_product_variants_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_product_variants_scope_idx ON public.catalog_product_variants USING btree (product_id, organization_id, tenant_id);


--
-- Name: catalog_products_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX catalog_products_org_tenant_idx ON public.catalog_products USING btree (organization_id, tenant_id);


--
-- Name: cf_defs_entity_global_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_defs_entity_global_idx ON public.custom_field_defs USING btree (entity_id);


--
-- Name: cf_defs_entity_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_defs_entity_key_idx ON public.custom_field_defs USING btree (key);


--
-- Name: cf_defs_entity_key_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_defs_entity_key_scope_idx ON public.custom_field_defs USING btree (entity_id, key, tenant_id, organization_id);


--
-- Name: cf_defs_entity_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_defs_entity_org_idx ON public.custom_field_defs USING btree (entity_id, organization_id);


--
-- Name: cf_defs_entity_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_defs_entity_tenant_idx ON public.custom_field_defs USING btree (entity_id, tenant_id);


--
-- Name: cf_defs_entity_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_defs_entity_tenant_org_idx ON public.custom_field_defs USING btree (entity_id, tenant_id, organization_id);


--
-- Name: cf_entity_cfgs_entity_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_entity_cfgs_entity_org_idx ON public.custom_field_entity_configs USING btree (entity_id, organization_id);


--
-- Name: cf_entity_cfgs_entity_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_entity_cfgs_entity_scope_idx ON public.custom_field_entity_configs USING btree (entity_id, tenant_id, organization_id);


--
-- Name: cf_entity_cfgs_entity_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_entity_cfgs_entity_tenant_idx ON public.custom_field_entity_configs USING btree (entity_id, tenant_id);


--
-- Name: cf_values_entity_record_field_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_values_entity_record_field_idx ON public.custom_field_values USING btree (field_key);


--
-- Name: cf_values_entity_record_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cf_values_entity_record_tenant_idx ON public.custom_field_values USING btree (entity_id, record_id, tenant_id);


--
-- Name: channel_ingest_dead_letters_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_ingest_dead_letters_channel_idx ON public.channel_ingest_dead_letters USING btree (channel_id, tenant_id);


--
-- Name: channel_ingest_dead_letters_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_ingest_dead_letters_created_idx ON public.channel_ingest_dead_letters USING btree (tenant_id, created_at);


--
-- Name: channel_thread_mappings_ext_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_thread_mappings_ext_conv_idx ON public.channel_thread_mappings USING btree (external_conversation_id, tenant_id);


--
-- Name: channel_thread_mappings_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_thread_mappings_thread_idx ON public.channel_thread_mappings USING btree (message_thread_id, tenant_id);


--
-- Name: checkout_link_templates_organization_id_tenant_id__49503_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_link_templates_organization_id_tenant_id__49503_index ON public.checkout_link_templates USING btree (organization_id, tenant_id, deleted_at);


--
-- Name: checkout_links_organization_id_tenant_id_deleted_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_links_organization_id_tenant_id_deleted_at_index ON public.checkout_links USING btree (organization_id, tenant_id, deleted_at);


--
-- Name: checkout_links_organization_id_tenant_id_status_de_98718_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_links_organization_id_tenant_id_status_de_98718_index ON public.checkout_links USING btree (organization_id, tenant_id, status, deleted_at);


--
-- Name: checkout_links_slug_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_links_slug_index ON public.checkout_links USING btree (slug);


--
-- Name: checkout_transactions_gateway_transaction_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_transactions_gateway_transaction_id_index ON public.checkout_transactions USING btree (gateway_transaction_id);


--
-- Name: checkout_transactions_organization_id_tenant_id_cr_acbc1_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_transactions_organization_id_tenant_id_cr_acbc1_index ON public.checkout_transactions USING btree (organization_id, tenant_id, created_at);


--
-- Name: checkout_transactions_organization_id_tenant_id_li_93a69_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_transactions_organization_id_tenant_id_li_93a69_index ON public.checkout_transactions USING btree (organization_id, tenant_id, link_id, idempotency_key);


--
-- Name: checkout_transactions_organization_id_tenant_id_li_fec94_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkout_transactions_organization_id_tenant_id_li_fec94_index ON public.checkout_transactions USING btree (organization_id, tenant_id, link_id, status);


--
-- Name: communication_channels_one_primary_per_user_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX communication_channels_one_primary_per_user_uq ON public.communication_channels USING btree (user_id) WHERE (is_primary AND (user_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: communication_channels_poll_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communication_channels_poll_due_idx ON public.communication_channels USING btree (is_active, last_polled_at) WHERE (deleted_at IS NULL);


--
-- Name: communication_channels_provider_external_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communication_channels_provider_external_idx ON public.communication_channels USING btree (provider_key, external_identifier) WHERE (deleted_at IS NULL);


--
-- Name: communication_channels_tenant_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communication_channels_tenant_provider_idx ON public.communication_channels USING btree (tenant_id, provider_key);


--
-- Name: communication_channels_tenant_push_provider_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX communication_channels_tenant_push_provider_uq ON public.communication_channels USING btree (tenant_id, provider_key) WHERE ((channel_type = 'push'::text) AND (user_id IS NULL) AND (deleted_at IS NULL));


--
-- Name: communication_channels_tenant_type_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communication_channels_tenant_type_active_idx ON public.communication_channels USING btree (tenant_id, channel_type, is_active);


--
-- Name: communication_channels_user_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communication_channels_user_lookup_idx ON public.communication_channels USING btree (user_id, channel_type, deleted_at);


--
-- Name: communication_channels_user_provider_external_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX communication_channels_user_provider_external_uq ON public.communication_channels USING btree (tenant_id, user_id, provider_key, external_identifier) WHERE ((deleted_at IS NULL) AND (user_id IS NOT NULL) AND (external_identifier IS NOT NULL));


--
-- Name: currencies_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currencies_scope_idx ON public.currencies USING btree (organization_id, tenant_id);


--
-- Name: currency_fetch_configs_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currency_fetch_configs_enabled_idx ON public.currency_fetch_configs USING btree (is_enabled, sync_time);


--
-- Name: currency_fetch_configs_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX currency_fetch_configs_scope_idx ON public.currency_fetch_configs USING btree (organization_id, tenant_id);


--
-- Name: custom_entities_storage_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_entities_storage_unique_idx ON public.custom_entities_storage USING btree (entity_type, entity_id, organization_id);


--
-- Name: custom_entities_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX custom_entities_unique_idx ON public.custom_entities USING btree (entity_id, organization_id, tenant_id);


--
-- Name: customer_activities_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_activities_entity_idx ON public.customer_activities USING btree (entity_id);


--
-- Name: customer_activities_entity_occurred_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_activities_entity_occurred_created_idx ON public.customer_activities USING btree (entity_id, occurred_at, created_at);


--
-- Name: customer_activities_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_activities_org_tenant_idx ON public.customer_activities USING btree (organization_id, tenant_id);


--
-- Name: customer_addresses_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_addresses_entity_idx ON public.customer_addresses USING btree (entity_id);


--
-- Name: customer_comments_entity_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_comments_entity_created_idx ON public.customer_comments USING btree (entity_id, created_at);


--
-- Name: customer_comments_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_comments_entity_idx ON public.customer_comments USING btree (entity_id);


--
-- Name: customer_companies_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_companies_org_tenant_idx ON public.customer_companies USING btree (organization_id, tenant_id);


--
-- Name: customer_company_billing_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_company_billing_scope_idx ON public.customer_company_billing USING btree (organization_id, tenant_id);


--
-- Name: customer_contacts_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_contacts_entity_idx ON public.customer_contacts USING btree (entity_id);


--
-- Name: customer_deal_companies_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_deal_companies_company_idx ON public.customer_deal_companies USING btree (company_entity_id);


--
-- Name: customer_deal_companies_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_deal_companies_deal_idx ON public.customer_deal_companies USING btree (deal_id);


--
-- Name: customer_deal_people_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_deal_people_deal_idx ON public.customer_deal_people USING btree (deal_id);


--
-- Name: customer_deal_people_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_deal_people_person_idx ON public.customer_deal_people USING btree (person_entity_id);


--
-- Name: customer_deal_people_primary_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_deal_people_primary_uq ON public.customer_deal_people USING btree (deal_id) WHERE is_primary;


--
-- Name: customer_deal_stage_transitions_deal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_deal_stage_transitions_deal_idx ON public.customer_deal_stage_transitions USING btree (deal_id);


--
-- Name: customer_deal_stage_transitions_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_deal_stage_transitions_org_tenant_idx ON public.customer_deal_stage_transitions USING btree (organization_id, tenant_id);


--
-- Name: customer_deals_closure_stats_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_deals_closure_stats_idx ON public.customer_deals USING btree (organization_id, tenant_id, closure_outcome, updated_at);


--
-- Name: customer_deals_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_deals_org_tenant_idx ON public.customer_deals USING btree (organization_id, tenant_id);


--
-- Name: customer_dict_kind_settings_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_dict_kind_settings_scope_idx ON public.customer_dictionary_kind_settings USING btree (organization_id, tenant_id);


--
-- Name: customer_dictionary_entries_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_dictionary_entries_scope_idx ON public.customer_dictionary_entries USING btree (organization_id, tenant_id, kind);


--
-- Name: customer_entities_org_tenant_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_entities_org_tenant_kind_idx ON public.customer_entities USING btree (organization_id, tenant_id, kind);


--
-- Name: customer_entity_roles_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_entity_roles_active_unique ON public.customer_entity_roles USING btree (entity_type, entity_id, role_type) WHERE (deleted_at IS NULL);


--
-- Name: customer_entity_roles_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_entity_roles_entity_idx ON public.customer_entity_roles USING btree (entity_type, entity_id);


--
-- Name: customer_entity_roles_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_entity_roles_scope_idx ON public.customer_entity_roles USING btree (organization_id, tenant_id);


--
-- Name: customer_interactions_email_dedupe_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_interactions_email_dedupe_uq ON public.customer_interactions USING btree (entity_id, external_message_id) WHERE ((external_message_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: customer_interactions_email_visibility_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_interactions_email_visibility_idx ON public.customer_interactions USING btree (entity_id, interaction_type, visibility, author_user_id) WHERE ((interaction_type = 'email'::text) AND (deleted_at IS NULL));


--
-- Name: customer_interactions_entity_status_scheduled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_interactions_entity_status_scheduled_idx ON public.customer_interactions USING btree (entity_id, status, scheduled_at, created_at);


--
-- Name: customer_interactions_external_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_interactions_external_msg_idx ON public.customer_interactions USING btree (external_message_id) WHERE (external_message_id IS NOT NULL);


--
-- Name: customer_interactions_org_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_interactions_org_tenant_status_idx ON public.customer_interactions USING btree (organization_id, tenant_id, status, scheduled_at);


--
-- Name: customer_interactions_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_interactions_type_idx ON public.customer_interactions USING btree (tenant_id, organization_id, interaction_type);


--
-- Name: customer_label_assignments_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_label_assignments_entity_idx ON public.customer_label_assignments USING btree (entity_id);


--
-- Name: customer_labels_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_labels_scope_idx ON public.customer_labels USING btree (organization_id, tenant_id, user_id);


--
-- Name: customer_pcr_person_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_pcr_person_company_idx ON public.customer_person_company_roles USING btree (person_entity_id, company_entity_id);


--
-- Name: customer_pcr_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_pcr_scope_idx ON public.customer_person_company_roles USING btree (organization_id, tenant_id);


--
-- Name: customer_people_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_people_org_tenant_idx ON public.customer_people USING btree (organization_id, tenant_id);


--
-- Name: customer_person_company_links_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX customer_person_company_links_active_unique ON public.customer_person_company_links USING btree (person_entity_id, company_entity_id) WHERE (deleted_at IS NULL);


--
-- Name: customer_person_company_links_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_person_company_links_company_idx ON public.customer_person_company_links USING btree (company_entity_id);


--
-- Name: customer_person_company_links_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_person_company_links_person_idx ON public.customer_person_company_links USING btree (person_entity_id);


--
-- Name: customer_person_company_links_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_person_company_links_scope_idx ON public.customer_person_company_links USING btree (organization_id, tenant_id);


--
-- Name: customer_pipeline_stages_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_pipeline_stages_org_tenant_idx ON public.customer_pipeline_stages USING btree (organization_id, tenant_id);


--
-- Name: customer_pipeline_stages_pipeline_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_pipeline_stages_pipeline_position_idx ON public.customer_pipeline_stages USING btree (pipeline_id, "position");


--
-- Name: customer_pipelines_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_pipelines_org_tenant_idx ON public.customer_pipelines USING btree (organization_id, tenant_id);


--
-- Name: customer_tag_assignments_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_tag_assignments_entity_idx ON public.customer_tag_assignments USING btree (entity_id);


--
-- Name: customer_tags_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_tags_org_tenant_idx ON public.customer_tags USING btree (organization_id, tenant_id);


--
-- Name: customer_todo_links_entity_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_todo_links_entity_created_idx ON public.customer_todo_links USING btree (entity_id, created_at);


--
-- Name: customer_todo_links_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_todo_links_entity_idx ON public.customer_todo_links USING btree (entity_id);


--
-- Name: customer_user_email_verifications_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_user_email_verifications_token_idx ON public.customer_user_email_verifications USING btree (token);


--
-- Name: customer_user_invitations_tenant_email_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_user_invitations_tenant_email_hash_idx ON public.customer_user_invitations USING btree (tenant_id, email_hash);


--
-- Name: customer_user_invitations_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_user_invitations_token_idx ON public.customer_user_invitations USING btree (token);


--
-- Name: customer_user_password_resets_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_user_password_resets_token_idx ON public.customer_user_password_resets USING btree (token);


--
-- Name: customer_user_sessions_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_user_sessions_token_hash_idx ON public.customer_user_sessions USING btree (token_hash);


--
-- Name: customer_users_customer_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_users_customer_entity_idx ON public.customer_users USING btree (customer_entity_id);


--
-- Name: customer_users_email_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_users_email_hash_idx ON public.customer_users USING btree (email_hash);


--
-- Name: customer_users_person_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_users_person_entity_idx ON public.customer_users USING btree (person_entity_id);


--
-- Name: dermat_batch_stages_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_batch_stages_batch_idx ON public.dermat_batch_stages USING btree (production_batch_id);


--
-- Name: dermat_batch_stages_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_batch_stages_org_tenant_idx ON public.dermat_batch_stages USING btree (organization_id, tenant_id);


--
-- Name: dermat_bom_headers_one_draft_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dermat_bom_headers_one_draft_uq ON public.dermat_bom_headers USING btree (product_id, COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE ((status = 'draft'::text) AND (deleted_at IS NULL));


--
-- Name: dermat_bom_headers_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_bom_headers_order_idx ON public.dermat_bom_headers USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- Name: dermat_bom_headers_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_bom_headers_org_tenant_idx ON public.dermat_bom_headers USING btree (organization_id, tenant_id);


--
-- Name: dermat_bom_headers_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_bom_headers_product_idx ON public.dermat_bom_headers USING btree (product_id);


--
-- Name: dermat_bom_items_bom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_bom_items_bom_idx ON public.dermat_bom_items USING btree (bom_id);


--
-- Name: dermat_bom_items_component_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_bom_items_component_idx ON public.dermat_bom_items USING btree (component_product_id);


--
-- Name: dermat_bom_lines_bom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_bom_lines_bom_idx ON public.dermat_bom_lines USING btree (bom_id);


--
-- Name: dermat_bom_lines_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_bom_lines_org_tenant_idx ON public.dermat_bom_lines USING btree (organization_id, tenant_id);


--
-- Name: dermat_boms_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_boms_org_tenant_idx ON public.dermat_boms USING btree (organization_id, tenant_id);


--
-- Name: dermat_company_profiles_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_company_profiles_scope_idx ON public.dermat_company_profiles USING btree (organization_id, tenant_id);


--
-- Name: dermat_customers_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_customers_org_tenant_idx ON public.dermat_customers USING btree (organization_id, tenant_id);


--
-- Name: dermat_departments_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_departments_org_tenant_idx ON public.dermat_departments USING btree (organization_id, tenant_id);


--
-- Name: dermat_grn_lines_check_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_grn_lines_check_idx ON public.dermat_grn_lines USING btree (qc_check_id);


--
-- Name: dermat_grn_lines_grn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_grn_lines_grn_idx ON public.dermat_grn_lines USING btree (grn_id);


--
-- Name: dermat_grns_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_grns_po_idx ON public.dermat_grns USING btree (po_id);


--
-- Name: dermat_grns_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_grns_scope_idx ON public.dermat_grns USING btree (organization_id, tenant_id, status);


--
-- Name: dermat_list_options_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_list_options_scope_idx ON public.dermat_list_options USING btree (organization_id, tenant_id, list_key);


--
-- Name: dermat_material_plan_items_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_material_plan_items_plan_idx ON public.dermat_material_plan_items USING btree (plan_id);


--
-- Name: dermat_material_plans_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_material_plans_org_tenant_idx ON public.dermat_material_plans USING btree (organization_id, tenant_id);


--
-- Name: dermat_material_request_lines_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_material_request_lines_request_idx ON public.dermat_material_request_lines USING btree (request_id);


--
-- Name: dermat_material_requests_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_material_requests_org_tenant_idx ON public.dermat_material_requests USING btree (organization_id, tenant_id);


--
-- Name: dermat_material_requests_plan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_material_requests_plan_idx ON public.dermat_material_requests USING btree (plan_id);


--
-- Name: dermat_order_events_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_order_events_order_idx ON public.dermat_order_events USING btree (order_id);


--
-- Name: dermat_order_lines_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_order_lines_order_idx ON public.dermat_order_lines USING btree (order_id);


--
-- Name: dermat_order_lines_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_order_lines_product_idx ON public.dermat_order_lines USING btree (product_id);


--
-- Name: dermat_order_payments_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_order_payments_order_idx ON public.dermat_order_payments USING btree (organization_id, tenant_id, order_id);


--
-- Name: dermat_order_stages_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_order_stages_open_idx ON public.dermat_order_stages USING btree (tenant_id, organization_id, status);


--
-- Name: dermat_order_stages_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_order_stages_order_idx ON public.dermat_order_stages USING btree (order_id);


--
-- Name: dermat_orders_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_orders_customer_idx ON public.dermat_orders USING btree (customer_id);


--
-- Name: dermat_orders_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_orders_org_tenant_idx ON public.dermat_orders USING btree (organization_id, tenant_id);


--
-- Name: dermat_planning_log_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_planning_log_order_idx ON public.dermat_planning_log USING btree (organization_id, tenant_id, order_id);


--
-- Name: dermat_planning_log_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_planning_log_product_idx ON public.dermat_planning_log USING btree (organization_id, tenant_id, product_id);


--
-- Name: dermat_planning_plans_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_planning_plans_scope_idx ON public.dermat_planning_plans USING btree (organization_id, tenant_id);


--
-- Name: dermat_planning_reservations_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_planning_reservations_product_idx ON public.dermat_planning_reservations USING btree (organization_id, tenant_id, product_id);


--
-- Name: dermat_pm_master_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_pm_master_org_tenant_idx ON public.dermat_pm_master USING btree (organization_id, tenant_id);


--
-- Name: dermat_po_lines_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_po_lines_po_idx ON public.dermat_po_lines USING btree (po_id);


--
-- Name: dermat_po_lines_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_po_lines_product_idx ON public.dermat_po_lines USING btree (organization_id, tenant_id, product_id);


--
-- Name: dermat_pos_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_pos_scope_idx ON public.dermat_pos USING btree (organization_id, tenant_id, status);


--
-- Name: dermat_production_batches_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_production_batches_org_tenant_idx ON public.dermat_production_batches USING btree (organization_id, tenant_id);


--
-- Name: dermat_proforma_invoices_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_proforma_invoices_order_idx ON public.dermat_proforma_invoices USING btree (organization_id, tenant_id, order_id);


--
-- Name: dermat_purchase_indents_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_purchase_indents_scope_idx ON public.dermat_purchase_indents USING btree (organization_id, tenant_id, status);


--
-- Name: dermat_purchase_order_lines_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_purchase_order_lines_org_tenant_idx ON public.dermat_purchase_order_lines USING btree (organization_id, tenant_id);


--
-- Name: dermat_purchase_order_lines_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_purchase_order_lines_po_idx ON public.dermat_purchase_order_lines USING btree (purchase_order_id);


--
-- Name: dermat_purchase_orders_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_purchase_orders_org_tenant_idx ON public.dermat_purchase_orders USING btree (organization_id, tenant_id);


--
-- Name: dermat_qa_documents_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_qa_documents_scope_idx ON public.dermat_qa_documents USING btree (organization_id, tenant_id, status);


--
-- Name: dermat_qc_policies_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_qc_policies_org_tenant_idx ON public.dermat_qc_policies USING btree (organization_id, tenant_id);


--
-- Name: dermat_qc_tests_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_qc_tests_org_tenant_idx ON public.dermat_qc_tests USING btree (organization_id, tenant_id);


--
-- Name: dermat_qc_tests_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_qc_tests_reference_idx ON public.dermat_qc_tests USING btree (reference_type, reference_id);


--
-- Name: dermat_quality_checks_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_quality_checks_order_idx ON public.dermat_quality_checks USING btree (order_id, stage_key);


--
-- Name: dermat_quality_checks_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_quality_checks_scope_idx ON public.dermat_quality_checks USING btree (organization_id, tenant_id, status);


--
-- Name: dermat_quality_rules_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_quality_rules_scope_idx ON public.dermat_quality_rules USING btree (organization_id, tenant_id, operation);


--
-- Name: dermat_rm_master_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_rm_master_org_tenant_idx ON public.dermat_rm_master USING btree (organization_id, tenant_id);


--
-- Name: dermat_rnd_requests_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_rnd_requests_scope_idx ON public.dermat_rnd_requests USING btree (organization_id, tenant_id, status);


--
-- Name: dermat_samples_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_samples_order_idx ON public.dermat_samples USING btree (order_id);


--
-- Name: dermat_samples_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_samples_org_tenant_idx ON public.dermat_samples USING btree (organization_id, tenant_id);


--
-- Name: dermat_stage_definitions_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_stage_definitions_org_tenant_idx ON public.dermat_stage_definitions USING btree (organization_id, tenant_id);


--
-- Name: dermat_stage_runs_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_stage_runs_order_idx ON public.dermat_stage_runs USING btree (order_id);


--
-- Name: dermat_stage_runs_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_stage_runs_org_tenant_idx ON public.dermat_stage_runs USING btree (organization_id, tenant_id);


--
-- Name: dermat_stage_runs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_stage_runs_status_idx ON public.dermat_stage_runs USING btree (organization_id, status, stage_code);


--
-- Name: dermat_stage_runs_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_stage_runs_subject_idx ON public.dermat_stage_runs USING btree (subject_type, subject_id, stage_code);


--
-- Name: dermat_stock_reservations_material_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_stock_reservations_material_idx ON public.dermat_stock_reservations USING btree (material_kind, material_id, status);


--
-- Name: dermat_stock_reservations_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_stock_reservations_order_idx ON public.dermat_stock_reservations USING btree (order_id, status);


--
-- Name: dermat_stock_reservations_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_stock_reservations_org_tenant_idx ON public.dermat_stock_reservations USING btree (organization_id, tenant_id);


--
-- Name: dermat_store_request_lines_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_store_request_lines_product_idx ON public.dermat_store_request_lines USING btree (organization_id, tenant_id, product_id);


--
-- Name: dermat_store_request_lines_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_store_request_lines_request_idx ON public.dermat_store_request_lines USING btree (request_id);


--
-- Name: dermat_store_requests_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_store_requests_order_idx ON public.dermat_store_requests USING btree (order_id, stage_key);


--
-- Name: dermat_store_requests_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_store_requests_scope_idx ON public.dermat_store_requests USING btree (organization_id, tenant_id, status);


--
-- Name: dermat_tax_invoices_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_tax_invoices_order_idx ON public.dermat_tax_invoices USING btree (organization_id, tenant_id, order_id);


--
-- Name: dermat_vendor_bills_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_vendor_bills_scope_idx ON public.dermat_vendor_bills USING btree (organization_id, tenant_id, status);


--
-- Name: dermat_vendor_bills_vendor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_vendor_bills_vendor_idx ON public.dermat_vendor_bills USING btree (vendor_id);


--
-- Name: dermat_vendors_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dermat_vendors_org_tenant_idx ON public.dermat_vendors USING btree (organization_id, tenant_id);


--
-- Name: dictionary_entries_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dictionary_entries_scope_idx ON public.dictionary_entries USING btree (dictionary_id, organization_id, tenant_id);


--
-- Name: domain_mappings_hostname_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX domain_mappings_hostname_unique ON public.domain_mappings USING btree (hostname);


--
-- Name: domain_mappings_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX domain_mappings_organization_id_idx ON public.domain_mappings USING btree (organization_id);


--
-- Name: domain_mappings_pending_tls_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX domain_mappings_pending_tls_idx ON public.domain_mappings USING btree (status, updated_at) WHERE (status = ANY (ARRAY['verified'::text, 'tls_failed'::text]));


--
-- Name: domain_mappings_pending_verification_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX domain_mappings_pending_verification_idx ON public.domain_mappings USING btree (status, last_dns_check_at) WHERE (status = ANY (ARRAY['pending'::text, 'dns_failed'::text]));


--
-- Name: domain_mappings_replaces_domain_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX domain_mappings_replaces_domain_id_unique ON public.domain_mappings USING btree (replaces_domain_id) WHERE (replaces_domain_id IS NOT NULL);


--
-- Name: domain_mappings_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX domain_mappings_tenant_id_idx ON public.domain_mappings USING btree (tenant_id);


--
-- Name: encryption_maps_entity_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX encryption_maps_entity_scope_idx ON public.encryption_maps USING btree (entity_id, tenant_id, organization_id);


--
-- Name: entity_index_jobs_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_index_jobs_org_idx ON public.entity_index_jobs USING btree (organization_id);


--
-- Name: entity_index_jobs_scope_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entity_index_jobs_scope_unique ON public.entity_index_jobs USING btree (entity_type, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(partition_index, '-1'::integer), COALESCE(partition_count, '-1'::integer));


--
-- Name: entity_index_jobs_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_index_jobs_type_idx ON public.entity_index_jobs USING btree (entity_type);


--
-- Name: entity_indexes_customer_company_profile_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_customer_company_profile_doc_idx ON public.entity_indexes USING btree (entity_id, organization_id, tenant_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_company_profile'::text) AND (organization_id IS NOT NULL) AND (tenant_id IS NOT NULL));


--
-- Name: entity_indexes_customer_company_profile_tenant_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_customer_company_profile_tenant_doc_idx ON public.entity_indexes USING btree (tenant_id, entity_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_company_profile'::text) AND (organization_id IS NULL) AND (tenant_id IS NOT NULL));


--
-- Name: entity_indexes_customer_entity_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_customer_entity_doc_idx ON public.entity_indexes USING btree (entity_id, organization_id, tenant_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_entity'::text) AND (organization_id IS NOT NULL) AND (tenant_id IS NOT NULL));


--
-- Name: entity_indexes_customer_entity_tenant_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_customer_entity_tenant_doc_idx ON public.entity_indexes USING btree (tenant_id, entity_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_entity'::text) AND (organization_id IS NULL) AND (tenant_id IS NOT NULL));


--
-- Name: entity_indexes_customer_person_profile_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_customer_person_profile_doc_idx ON public.entity_indexes USING btree (entity_id, organization_id, tenant_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_person_profile'::text) AND (organization_id IS NOT NULL) AND (tenant_id IS NOT NULL));


--
-- Name: entity_indexes_customer_person_profile_tenant_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_customer_person_profile_tenant_doc_idx ON public.entity_indexes USING btree (tenant_id, entity_id) INCLUDE (doc) WHERE ((deleted_at IS NULL) AND (entity_type = 'customers:customer_person_profile'::text) AND (organization_id IS NULL) AND (tenant_id IS NOT NULL));


--
-- Name: entity_indexes_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_entity_idx ON public.entity_indexes USING btree (entity_id);


--
-- Name: entity_indexes_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_org_idx ON public.entity_indexes USING btree (organization_id);


--
-- Name: entity_indexes_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_type_idx ON public.entity_indexes USING btree (entity_type);


--
-- Name: entity_indexes_type_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_indexes_type_tenant_idx ON public.entity_indexes USING btree (entity_type, tenant_id);


--
-- Name: entity_translations_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_translations_entity_idx ON public.entity_translations USING btree (entity_id);


--
-- Name: entity_translations_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_translations_type_idx ON public.entity_translations USING btree (entity_type);


--
-- Name: entity_translations_type_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_translations_type_tenant_idx ON public.entity_translations USING btree (entity_type, tenant_id);


--
-- Name: eudr_dds_tenant_org_submitted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eudr_dds_tenant_org_submitted_idx ON public.eudr_due_diligence_statements USING btree (tenant_id, organization_id, submitted_at) WHERE (deleted_at IS NULL);


--
-- Name: example_customer_interaction_mappings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX example_customer_interaction_mappings_status_idx ON public.example_customer_interaction_mappings USING btree (organization_id, tenant_id, sync_status, updated_at);


--
-- Name: exchange_rates_pair_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rates_pair_idx ON public.exchange_rates USING btree (from_currency_code, to_currency_code, date);


--
-- Name: exchange_rates_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exchange_rates_scope_idx ON public.exchange_rates USING btree (organization_id, tenant_id);


--
-- Name: external_conversations_assigned_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_conversations_assigned_user_idx ON public.external_conversations USING btree (assigned_user_id);


--
-- Name: external_conversations_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_conversations_channel_idx ON public.external_conversations USING btree (channel_id, external_conversation_id);


--
-- Name: external_conversations_contact_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_conversations_contact_person_idx ON public.external_conversations USING btree (contact_person_id);


--
-- Name: external_messages_channel_external_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_messages_channel_external_idx ON public.external_messages USING btree (channel_id, external_message_id);


--
-- Name: external_messages_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_messages_conversation_idx ON public.external_messages USING btree (conversation_id);


--
-- Name: feature_toggle_audit_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_toggle_audit_action_idx ON public.feature_toggle_audit_logs USING btree (action, created_at);


--
-- Name: feature_toggle_audit_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_toggle_audit_actor_idx ON public.feature_toggle_audit_logs USING btree (actor_user_id, created_at);


--
-- Name: feature_toggle_audit_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_toggle_audit_org_idx ON public.feature_toggle_audit_logs USING btree (organization_id, created_at);


--
-- Name: feature_toggle_audit_toggle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_toggle_audit_toggle_idx ON public.feature_toggle_audit_logs USING btree (toggle_id, created_at);


--
-- Name: feature_toggle_overrides_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_toggle_overrides_tenant_idx ON public.feature_toggle_overrides USING btree (tenant_id);


--
-- Name: feature_toggle_overrides_toggle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_toggle_overrides_toggle_idx ON public.feature_toggle_overrides USING btree (toggle_id);


--
-- Name: feature_toggles_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_toggles_category_idx ON public.feature_toggles USING btree (category);


--
-- Name: feature_toggles_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_toggles_name_idx ON public.feature_toggles USING btree (name);


--
-- Name: gateway_payment_operations_status_lease_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gateway_payment_operations_status_lease_expires_at_index ON public.gateway_payment_operations USING btree (status, lease_expires_at);


--
-- Name: gateway_payment_operations_transaction_id_operatio_615c8_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gateway_payment_operations_transaction_id_operatio_615c8_index ON public.gateway_payment_operations USING btree (transaction_id, operation_type, organization_id, tenant_id);


--
-- Name: gateway_session_initializations_prune_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gateway_session_initializations_prune_idx ON public.gateway_session_initializations USING btree (tenant_id, organization_id, updated_at) WHERE (gateway_transaction_id IS NOT NULL);


--
-- Name: gateway_transactions_organization_id_tenant_id_uni_358ac_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gateway_transactions_organization_id_tenant_id_uni_358ac_index ON public.gateway_transactions USING btree (organization_id, tenant_id, unified_status);


--
-- Name: gateway_transactions_payment_id_organization_id_tenant_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gateway_transactions_payment_id_organization_id_tenant_id_index ON public.gateway_transactions USING btree (payment_id, organization_id, tenant_id);


--
-- Name: gateway_transactions_provider_key_provider_session_750f8_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gateway_transactions_provider_key_provider_session_750f8_index ON public.gateway_transactions USING btree (provider_key, provider_session_id, organization_id);


--
-- Name: idx_ce_tenant_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ce_tenant_company_id ON public.customer_entities USING btree (tenant_id, id);


--
-- Name: idx_ce_tenant_org_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ce_tenant_org_company_id ON public.customer_entities USING btree (tenant_id, organization_id, id);


--
-- Name: idx_ce_tenant_org_person_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ce_tenant_org_person_id ON public.customer_entities USING btree (tenant_id, organization_id, id);


--
-- Name: idx_ce_tenant_person_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ce_tenant_person_id ON public.customer_entities USING btree (tenant_id, id);


--
-- Name: idx_customer_companies_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_companies_entity_id ON public.customer_companies USING btree (entity_id);


--
-- Name: idx_customer_people_entity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_people_entity_id ON public.customer_people USING btree (entity_id);


--
-- Name: idx_eudr_mappings_org_product_commodity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_eudr_mappings_org_product_commodity_unique ON public.eudr_product_mappings USING btree (organization_id, product_id, commodity) WHERE (deleted_at IS NULL);


--
-- Name: idx_eudr_mitigation_actions_risk_assessment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eudr_mitigation_actions_risk_assessment ON public.eudr_mitigation_actions USING btree (risk_assessment_id);


--
-- Name: idx_eudr_plots_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eudr_plots_supplier ON public.eudr_plots USING btree (supplier_entity_id);


--
-- Name: idx_eudr_risk_assessments_statement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eudr_risk_assessments_statement ON public.eudr_risk_assessments USING btree (statement_id);


--
-- Name: idx_eudr_submissions_statement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eudr_submissions_statement ON public.eudr_evidence_submissions USING btree (statement_id);


--
-- Name: idx_eudr_submissions_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eudr_submissions_supplier ON public.eudr_evidence_submissions USING btree (supplier_entity_id);


--
-- Name: idx_mfg_bom_code_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mfg_bom_code_org ON public.manufacturing_bill_of_materials USING btree (organization_id, code) WHERE (deleted_at IS NULL);


--
-- Name: idx_mfg_bom_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_bom_product ON public.manufacturing_bill_of_materials USING btree (product_variant_id);


--
-- Name: idx_mfg_bom_tenant_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mfg_bom_tenant_org ON public.manufacturing_bill_of_materials USING btree (tenant_id, organization_id);


--
-- Name: inbox_discrepancies_organization_id_tenant_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_discrepancies_organization_id_tenant_id_index ON public.inbox_discrepancies USING btree (organization_id, tenant_id);


--
-- Name: inbox_discrepancies_proposal_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_discrepancies_proposal_id_index ON public.inbox_discrepancies USING btree (proposal_id);


--
-- Name: inbox_emails_organization_id_tenant_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_emails_organization_id_tenant_id_index ON public.inbox_emails USING btree (organization_id, tenant_id);


--
-- Name: inbox_emails_organization_id_tenant_id_received_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_emails_organization_id_tenant_id_received_at_index ON public.inbox_emails USING btree (organization_id, tenant_id, received_at);


--
-- Name: inbox_emails_organization_id_tenant_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_emails_organization_id_tenant_id_status_index ON public.inbox_emails USING btree (organization_id, tenant_id, status);


--
-- Name: inbox_proposal_actions_organization_id_tenant_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_proposal_actions_organization_id_tenant_id_status_index ON public.inbox_proposal_actions USING btree (organization_id, tenant_id, status);


--
-- Name: inbox_proposal_actions_proposal_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_proposal_actions_proposal_id_index ON public.inbox_proposal_actions USING btree (proposal_id);


--
-- Name: inbox_proposals_inbox_email_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_proposals_inbox_email_id_index ON public.inbox_proposals USING btree (inbox_email_id);


--
-- Name: inbox_proposals_organization_id_tenant_id_category_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_proposals_organization_id_tenant_id_category_index ON public.inbox_proposals USING btree (organization_id, tenant_id, category);


--
-- Name: inbox_proposals_organization_id_tenant_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_proposals_organization_id_tenant_id_index ON public.inbox_proposals USING btree (organization_id, tenant_id);


--
-- Name: inbox_proposals_organization_id_tenant_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_proposals_organization_id_tenant_id_status_index ON public.inbox_proposals USING btree (organization_id, tenant_id, status);


--
-- Name: inbox_settings_organization_id_tenant_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_settings_organization_id_tenant_id_index ON public.inbox_settings USING btree (organization_id, tenant_id);


--
-- Name: indexer_error_logs_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX indexer_error_logs_occurred_idx ON public.indexer_error_logs USING btree (occurred_at);


--
-- Name: indexer_error_logs_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX indexer_error_logs_source_idx ON public.indexer_error_logs USING btree (source);


--
-- Name: indexer_status_logs_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX indexer_status_logs_occurred_idx ON public.indexer_status_logs USING btree (occurred_at);


--
-- Name: indexer_status_logs_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX indexer_status_logs_source_idx ON public.indexer_status_logs USING btree (source);


--
-- Name: integration_credentials_integration_id_organizatio_58963_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_credentials_integration_id_organizatio_58963_index ON public.integration_credentials USING btree (integration_id, organization_id, tenant_id);


--
-- Name: integration_credentials_user_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX integration_credentials_user_lookup_idx ON public.integration_credentials USING btree (integration_id, organization_id, tenant_id, user_id) WHERE ((user_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: integration_logs_integration_id_organization_id_te_41dbc_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_logs_integration_id_organization_id_te_41dbc_index ON public.integration_logs USING btree (integration_id, organization_id, tenant_id, created_at);


--
-- Name: integration_logs_level_organization_id_tenant_id_c_af75d_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_logs_level_organization_id_tenant_id_c_af75d_index ON public.integration_logs USING btree (level, organization_id, tenant_id, created_at);


--
-- Name: integration_states_integration_id_organization_id__8b1c1_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_states_integration_id_organization_id__8b1c1_index ON public.integration_states USING btree (integration_id, organization_id, tenant_id);


--
-- Name: message_access_tokens_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_access_tokens_message_idx ON public.message_access_tokens USING btree (message_id);


--
-- Name: message_access_tokens_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_access_tokens_token_idx ON public.message_access_tokens USING btree (token);


--
-- Name: message_channel_links_ext_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_channel_links_ext_conv_idx ON public.message_channel_links USING btree (external_conversation_id);


--
-- Name: message_channel_links_ext_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_channel_links_ext_msg_idx ON public.message_channel_links USING btree (external_message_id);


--
-- Name: message_channel_links_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_channel_links_message_idx ON public.message_channel_links USING btree (message_id);


--
-- Name: message_confirmations_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_confirmations_message_idx ON public.message_confirmations USING btree (message_id);


--
-- Name: message_confirmations_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_confirmations_scope_idx ON public.message_confirmations USING btree (tenant_id, organization_id);


--
-- Name: message_objects_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_objects_entity_idx ON public.message_objects USING btree (entity_type, entity_id);


--
-- Name: message_objects_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_objects_message_idx ON public.message_objects USING btree (message_id);


--
-- Name: message_reactions_external_actor_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX message_reactions_external_actor_uq ON public.message_reactions USING btree (tenant_id, message_id, emoji, reacted_by_external_id) WHERE (reacted_by_external_id IS NOT NULL);


--
-- Name: message_reactions_internal_actor_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX message_reactions_internal_actor_uq ON public.message_reactions USING btree (tenant_id, message_id, emoji, reacted_by_user_id) WHERE (reacted_by_user_id IS NOT NULL);


--
-- Name: message_reactions_message_emoji_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_reactions_message_emoji_idx ON public.message_reactions USING btree (message_id, emoji);


--
-- Name: message_reactions_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_reactions_message_idx ON public.message_reactions USING btree (message_id);


--
-- Name: message_recipients_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_recipients_message_idx ON public.message_recipients USING btree (message_id);


--
-- Name: message_recipients_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX message_recipients_user_idx ON public.message_recipients USING btree (recipient_user_id, status);


--
-- Name: messages_external_email_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_external_email_hash_idx ON public.messages USING btree (external_email_hash);


--
-- Name: messages_idempotency_key_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX messages_idempotency_key_uq ON public.messages USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: messages_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_sender_idx ON public.messages USING btree (sender_user_id, sent_at);


--
-- Name: messages_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_tenant_idx ON public.messages USING btree (tenant_id, organization_id);


--
-- Name: messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_thread_idx ON public.messages USING btree (thread_id);


--
-- Name: messages_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_type_idx ON public.messages USING btree (type, tenant_id);


--
-- Name: mfg_bl_bom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_bl_bom_idx ON public.manufacturing_bom_lines USING btree (bom_id);


--
-- Name: mfg_bl_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_bl_org_tenant_idx ON public.manufacturing_bom_lines USING btree (organization_id, tenant_id);


--
-- Name: mfg_bl_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_bl_product_idx ON public.manufacturing_bom_lines USING btree (organization_id, product_variant_id);


--
-- Name: mfg_bo_bom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_bo_bom_idx ON public.manufacturing_bom_operations USING btree (bom_id);


--
-- Name: mfg_bo_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_bo_org_tenant_idx ON public.manufacturing_bom_operations USING btree (organization_id, tenant_id);


--
-- Name: mfg_bo_wc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_bo_wc_idx ON public.manufacturing_bom_operations USING btree (work_center_id);


--
-- Name: mfg_bom_org_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mfg_bom_org_code_unique_idx ON public.manufacturing_boms USING btree (organization_id, code) WHERE (deleted_at IS NULL);


--
-- Name: mfg_bom_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_bom_org_tenant_idx ON public.manufacturing_boms USING btree (organization_id, tenant_id);


--
-- Name: mfg_bom_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_bom_product_idx ON public.manufacturing_boms USING btree (organization_id, product_variant_id);


--
-- Name: mfg_mc_org_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mfg_mc_org_code_unique_idx ON public.manufacturing_machines USING btree (organization_id, code) WHERE (deleted_at IS NULL);


--
-- Name: mfg_mc_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_mc_org_tenant_idx ON public.manufacturing_machines USING btree (organization_id, tenant_id);


--
-- Name: mfg_mc_org_tenant_idx2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_mc_org_tenant_idx2 ON public.manufacturing_material_consumptions USING btree (organization_id, tenant_id);


--
-- Name: mfg_mc_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_mc_po_idx ON public.manufacturing_material_consumptions USING btree (production_order_id);


--
-- Name: mfg_mc_wc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_mc_wc_idx ON public.manufacturing_machines USING btree (work_center_id);


--
-- Name: mfg_po_bom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_po_bom_idx ON public.manufacturing_production_orders USING btree (bom_id);


--
-- Name: mfg_po_order_number_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mfg_po_order_number_unique_idx ON public.manufacturing_production_orders USING btree (organization_id, order_number) WHERE (deleted_at IS NULL);


--
-- Name: mfg_po_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_po_org_tenant_idx ON public.manufacturing_production_orders USING btree (organization_id, tenant_id);


--
-- Name: mfg_po_sales_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_po_sales_order_idx ON public.manufacturing_production_orders USING btree (sales_order_id);


--
-- Name: mfg_ps_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_ps_org_tenant_idx ON public.manufacturing_production_stages USING btree (organization_id, tenant_id);


--
-- Name: mfg_ps_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_ps_po_idx ON public.manufacturing_production_stages USING btree (production_order_id);


--
-- Name: mfg_pst_org_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mfg_pst_org_code_unique_idx ON public.manufacturing_production_stage_templates USING btree (organization_id, code) WHERE (deleted_at IS NULL);


--
-- Name: mfg_pst_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_pst_org_tenant_idx ON public.manufacturing_production_stage_templates USING btree (organization_id, tenant_id);


--
-- Name: mfg_qci_inspection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_qci_inspection_idx ON public.manufacturing_quality_check_items USING btree (inspection_id);


--
-- Name: mfg_qci_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_qci_org_tenant_idx ON public.manufacturing_quality_check_items USING btree (organization_id, tenant_id);


--
-- Name: mfg_qi_number_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mfg_qi_number_unique_idx ON public.manufacturing_quality_inspections USING btree (organization_id, inspection_number) WHERE (deleted_at IS NULL);


--
-- Name: mfg_qi_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_qi_org_tenant_idx ON public.manufacturing_quality_inspections USING btree (organization_id, tenant_id);


--
-- Name: mfg_wc_org_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mfg_wc_org_code_unique_idx ON public.manufacturing_work_centers USING btree (organization_id, code) WHERE (deleted_at IS NULL);


--
-- Name: mfg_wc_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfg_wc_org_tenant_idx ON public.manufacturing_work_centers USING btree (organization_id, tenant_id);


--
-- Name: module_configs_global_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX module_configs_global_unique ON public.module_configs USING btree (module_id, name) WHERE (tenant_id IS NULL);


--
-- Name: module_configs_module_name_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX module_configs_module_name_tenant_idx ON public.module_configs USING btree (module_id, name, tenant_id);


--
-- Name: module_configs_scoped_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX module_configs_scoped_unique ON public.module_configs USING btree (module_id, name, tenant_id) WHERE (tenant_id IS NOT NULL);


--
-- Name: notification_preferences_tenant_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_preferences_tenant_user_idx ON public.notification_preferences USING btree (tenant_id, user_id);


--
-- Name: notification_preferences_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_preferences_unique ON public.notification_preferences USING btree (tenant_id, user_id, notification_type_id, channel);


--
-- Name: notification_type_overrides_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_type_overrides_unique ON public.notification_type_overrides USING btree (tenant_id, notification_type_id);


--
-- Name: notification_types_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_types_tenant_idx ON public.notification_types USING btree (tenant_id);


--
-- Name: notifications_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_expires_idx ON public.notifications USING btree (expires_at);


--
-- Name: notifications_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_group_idx ON public.notifications USING btree (group_key, recipient_user_id);


--
-- Name: notifications_recipient_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_status_idx ON public.notifications USING btree (recipient_user_id, status, created_at);


--
-- Name: notifications_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_source_idx ON public.notifications USING btree (source_entity_type, source_entity_id);


--
-- Name: notifications_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_tenant_idx ON public.notifications USING btree (tenant_id, organization_id);


--
-- Name: perspectives_live_user_global_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perspectives_live_user_global_uq ON public.perspectives USING btree (user_id, table_id, name) WHERE ((deleted_at IS NULL) AND (tenant_id IS NULL) AND (organization_id IS NULL));


--
-- Name: perspectives_live_user_org_only_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perspectives_live_user_org_only_uq ON public.perspectives USING btree (user_id, organization_id, table_id, name) WHERE ((deleted_at IS NULL) AND (tenant_id IS NULL) AND (organization_id IS NOT NULL));


--
-- Name: perspectives_live_user_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perspectives_live_user_org_uq ON public.perspectives USING btree (user_id, tenant_id, organization_id, table_id, name) WHERE ((deleted_at IS NULL) AND (tenant_id IS NOT NULL) AND (organization_id IS NOT NULL));


--
-- Name: perspectives_live_user_tenant_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX perspectives_live_user_tenant_uq ON public.perspectives USING btree (user_id, tenant_id, table_id, name) WHERE ((deleted_at IS NULL) AND (tenant_id IS NOT NULL) AND (organization_id IS NULL));


--
-- Name: perspectives_user_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perspectives_user_scope_idx ON public.perspectives USING btree (user_id, tenant_id, organization_id, table_id);


--
-- Name: planner_availability_rule_sets_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX planner_availability_rule_sets_tenant_org_idx ON public.planner_availability_rule_sets USING btree (tenant_id, organization_id);


--
-- Name: planner_availability_rules_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX planner_availability_rules_subject_idx ON public.planner_availability_rules USING btree (subject_type, subject_id, tenant_id, organization_id);


--
-- Name: planner_availability_rules_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX planner_availability_rules_tenant_org_idx ON public.planner_availability_rules USING btree (tenant_id, organization_id);


--
-- Name: progress_jobs_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX progress_jobs_parent_idx ON public.progress_jobs USING btree (parent_job_id);


--
-- Name: progress_jobs_status_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX progress_jobs_status_tenant_idx ON public.progress_jobs USING btree (status, tenant_id);


--
-- Name: progress_jobs_type_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX progress_jobs_type_tenant_idx ON public.progress_jobs USING btree (job_type, tenant_id);


--
-- Name: purchasing_gr_org_number_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchasing_gr_org_number_unique_idx ON public.purchasing_goods_receipts USING btree (organization_id, receipt_number) WHERE (deleted_at IS NULL);


--
-- Name: purchasing_gr_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_gr_org_tenant_idx ON public.purchasing_goods_receipts USING btree (organization_id, tenant_id);


--
-- Name: purchasing_gr_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_gr_po_idx ON public.purchasing_goods_receipts USING btree (purchase_order_id);


--
-- Name: purchasing_grl_gr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_grl_gr_idx ON public.purchasing_goods_receipt_lines USING btree (goods_receipt_id);


--
-- Name: purchasing_grl_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_grl_org_tenant_idx ON public.purchasing_goods_receipt_lines USING btree (organization_id, tenant_id);


--
-- Name: purchasing_grl_pol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_grl_pol_idx ON public.purchasing_goods_receipt_lines USING btree (purchase_order_line_id);


--
-- Name: purchasing_pi_org_number_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchasing_pi_org_number_unique_idx ON public.purchasing_purchase_invoices USING btree (organization_id, invoice_number) WHERE (deleted_at IS NULL);


--
-- Name: purchasing_pi_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_pi_org_tenant_idx ON public.purchasing_purchase_invoices USING btree (organization_id, tenant_id);


--
-- Name: purchasing_pi_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_pi_po_idx ON public.purchasing_purchase_invoices USING btree (purchase_order_id);


--
-- Name: purchasing_pi_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_pi_supplier_idx ON public.purchasing_purchase_invoices USING btree (supplier_id);


--
-- Name: purchasing_pil_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_pil_org_tenant_idx ON public.purchasing_purchase_invoice_lines USING btree (organization_id, tenant_id);


--
-- Name: purchasing_pil_pi_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_pil_pi_idx ON public.purchasing_purchase_invoice_lines USING btree (purchase_invoice_id);


--
-- Name: purchasing_po_org_number_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchasing_po_org_number_unique_idx ON public.purchasing_purchase_orders USING btree (organization_id, order_number) WHERE (deleted_at IS NULL);


--
-- Name: purchasing_po_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_po_org_tenant_idx ON public.purchasing_purchase_orders USING btree (organization_id, tenant_id);


--
-- Name: purchasing_po_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_po_status_idx ON public.purchasing_purchase_orders USING btree (organization_id, status);


--
-- Name: purchasing_po_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_po_supplier_idx ON public.purchasing_purchase_orders USING btree (supplier_id);


--
-- Name: purchasing_pol_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_pol_org_tenant_idx ON public.purchasing_purchase_order_lines USING btree (organization_id, tenant_id);


--
-- Name: purchasing_pol_po_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_pol_po_idx ON public.purchasing_purchase_order_lines USING btree (purchase_order_id);


--
-- Name: purchasing_pol_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_pol_product_idx ON public.purchasing_purchase_order_lines USING btree (organization_id, product_variant_id);


--
-- Name: purchasing_sp_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_sp_org_tenant_idx ON public.purchasing_supplier_pricing USING btree (organization_id, tenant_id);


--
-- Name: purchasing_sp_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_sp_product_idx ON public.purchasing_supplier_pricing USING btree (organization_id, product_variant_id);


--
-- Name: purchasing_sp_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_sp_supplier_idx ON public.purchasing_supplier_pricing USING btree (supplier_id);


--
-- Name: purchasing_suppliers_org_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchasing_suppliers_org_code_unique_idx ON public.purchasing_suppliers USING btree (organization_id, code) WHERE (deleted_at IS NULL);


--
-- Name: purchasing_suppliers_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchasing_suppliers_org_tenant_idx ON public.purchasing_suppliers USING btree (organization_id, tenant_id);


--
-- Name: push_notification_deliveries_notif_device_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX push_notification_deliveries_notif_device_unique ON public.push_notification_deliveries USING btree (notification_id, user_device_id) WHERE (notification_id IS NOT NULL);


--
-- Name: push_notification_deliveries_notification_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_notification_deliveries_notification_idx ON public.push_notification_deliveries USING btree (notification_id);


--
-- Name: push_notification_deliveries_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_notification_deliveries_tenant_status_idx ON public.push_notification_deliveries USING btree (tenant_id, status, created_at);


--
-- Name: resources_resource_activities_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resource_activities_resource_idx ON public.resources_resource_activities USING btree (resource_id);


--
-- Name: resources_resource_activities_resource_occurred_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resource_activities_resource_occurred_created_idx ON public.resources_resource_activities USING btree (resource_id, occurred_at, created_at);


--
-- Name: resources_resource_activities_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resource_activities_tenant_org_idx ON public.resources_resource_activities USING btree (tenant_id, organization_id);


--
-- Name: resources_resource_comments_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resource_comments_resource_idx ON public.resources_resource_comments USING btree (resource_id);


--
-- Name: resources_resource_comments_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resource_comments_tenant_org_idx ON public.resources_resource_comments USING btree (tenant_id, organization_id);


--
-- Name: resources_resource_tag_assignments_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resource_tag_assignments_scope_idx ON public.resources_resource_tag_assignments USING btree (organization_id, tenant_id);


--
-- Name: resources_resource_tags_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resource_tags_scope_idx ON public.resources_resource_tags USING btree (organization_id, tenant_id);


--
-- Name: resources_resource_types_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resource_types_tenant_org_idx ON public.resources_resource_types USING btree (tenant_id, organization_id);


--
-- Name: resources_resources_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resources_resources_tenant_org_idx ON public.resources_resources USING btree (tenant_id, organization_id);


--
-- Name: role_perspectives_live_role_global_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_perspectives_live_role_global_uq ON public.role_perspectives USING btree (role_id, table_id, name) WHERE ((deleted_at IS NULL) AND (tenant_id IS NULL) AND (organization_id IS NULL));


--
-- Name: role_perspectives_live_role_org_only_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_perspectives_live_role_org_only_uq ON public.role_perspectives USING btree (role_id, organization_id, table_id, name) WHERE ((deleted_at IS NULL) AND (tenant_id IS NULL) AND (organization_id IS NOT NULL));


--
-- Name: role_perspectives_live_role_org_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_perspectives_live_role_org_uq ON public.role_perspectives USING btree (role_id, tenant_id, organization_id, table_id, name) WHERE ((deleted_at IS NULL) AND (tenant_id IS NOT NULL) AND (organization_id IS NOT NULL));


--
-- Name: role_perspectives_live_role_tenant_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_perspectives_live_role_tenant_uq ON public.role_perspectives USING btree (role_id, tenant_id, table_id, name) WHERE ((deleted_at IS NULL) AND (tenant_id IS NOT NULL) AND (organization_id IS NULL));


--
-- Name: role_perspectives_role_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX role_perspectives_role_scope_idx ON public.role_perspectives USING btree (role_id, tenant_id, organization_id, table_id);


--
-- Name: rule_execution_logs_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_execution_logs_entity_idx ON public.rule_execution_logs USING btree (entity_type, entity_id);


--
-- Name: rule_execution_logs_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_execution_logs_result_idx ON public.rule_execution_logs USING btree (execution_result, executed_at);


--
-- Name: rule_execution_logs_rule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_execution_logs_rule_idx ON public.rule_execution_logs USING btree (rule_id);


--
-- Name: rule_execution_logs_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_execution_logs_tenant_org_idx ON public.rule_execution_logs USING btree (tenant_id, organization_id);


--
-- Name: rule_set_members_rule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_set_members_rule_idx ON public.rule_set_members USING btree (rule_id);


--
-- Name: rule_set_members_set_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_set_members_set_idx ON public.rule_set_members USING btree (rule_set_id, sequence);


--
-- Name: rule_set_members_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_set_members_tenant_org_idx ON public.rule_set_members USING btree (tenant_id, organization_id);


--
-- Name: rule_sets_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_sets_enabled_idx ON public.rule_sets USING btree (enabled);


--
-- Name: rule_sets_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_sets_tenant_org_idx ON public.rule_sets USING btree (tenant_id, organization_id);


--
-- Name: sales_channels_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_channels_org_tenant_idx ON public.sales_channels USING btree (organization_id, tenant_id);


--
-- Name: sales_channels_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_channels_status_idx ON public.sales_channels USING btree (organization_id, tenant_id, status);


--
-- Name: sales_credit_memo_lines_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_credit_memo_lines_normalized_idx ON public.sales_credit_memo_lines USING btree (organization_id, tenant_id, normalized_unit, normalized_quantity);


--
-- Name: sales_credit_memo_lines_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_credit_memo_lines_scope_idx ON public.sales_credit_memo_lines USING btree (credit_memo_id, organization_id, tenant_id);


--
-- Name: sales_credit_memos_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_credit_memos_scope_idx ON public.sales_credit_memos USING btree (order_id, organization_id, tenant_id);


--
-- Name: sales_credit_memos_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_credit_memos_status_idx ON public.sales_credit_memos USING btree (organization_id, tenant_id, status);


--
-- Name: sales_delivery_windows_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_delivery_windows_scope_idx ON public.sales_delivery_windows USING btree (organization_id, tenant_id);


--
-- Name: sales_document_addresses_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_document_addresses_scope_idx ON public.sales_document_addresses USING btree (organization_id, tenant_id);


--
-- Name: sales_document_tag_assignments_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_document_tag_assignments_document_idx ON public.sales_document_tag_assignments USING btree (document_id);


--
-- Name: sales_document_tag_assignments_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_document_tag_assignments_scope_idx ON public.sales_document_tag_assignments USING btree (organization_id, tenant_id);


--
-- Name: sales_document_tags_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_document_tags_scope_idx ON public.sales_document_tags USING btree (organization_id, tenant_id);


--
-- Name: sales_invoice_lines_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_invoice_lines_normalized_idx ON public.sales_invoice_lines USING btree (organization_id, tenant_id, normalized_unit, normalized_quantity);


--
-- Name: sales_invoice_lines_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_invoice_lines_scope_idx ON public.sales_invoice_lines USING btree (invoice_id, organization_id, tenant_id);


--
-- Name: sales_invoices_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_invoices_scope_idx ON public.sales_invoices USING btree (order_id, organization_id, tenant_id);


--
-- Name: sales_invoices_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_invoices_status_idx ON public.sales_invoices USING btree (organization_id, tenant_id, status);


--
-- Name: sales_notes_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_notes_scope_idx ON public.sales_notes USING btree (organization_id, tenant_id);


--
-- Name: sales_order_adjustments_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_order_adjustments_scope_idx ON public.sales_order_adjustments USING btree (order_id, organization_id, tenant_id);


--
-- Name: sales_order_lines_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_order_lines_normalized_idx ON public.sales_order_lines USING btree (organization_id, tenant_id, normalized_unit, normalized_quantity);


--
-- Name: sales_order_lines_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_order_lines_scope_idx ON public.sales_order_lines USING btree (order_id, organization_id, tenant_id);


--
-- Name: sales_order_lines_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_order_lines_status_idx ON public.sales_order_lines USING btree (organization_id, tenant_id, status);


--
-- Name: sales_orders_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_customer_idx ON public.sales_orders USING btree (customer_entity_id, organization_id, tenant_id);


--
-- Name: sales_orders_fulfillment_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_fulfillment_status_idx ON public.sales_orders USING btree (organization_id, tenant_id, fulfillment_status);


--
-- Name: sales_orders_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_org_tenant_idx ON public.sales_orders USING btree (organization_id, tenant_id);


--
-- Name: sales_orders_payment_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_payment_status_idx ON public.sales_orders USING btree (organization_id, tenant_id, payment_status);


--
-- Name: sales_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_orders_status_idx ON public.sales_orders USING btree (organization_id, tenant_id, status);


--
-- Name: sales_payment_allocations_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_payment_allocations_scope_idx ON public.sales_payment_allocations USING btree (payment_id, organization_id, tenant_id);


--
-- Name: sales_payment_methods_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_payment_methods_scope_idx ON public.sales_payment_methods USING btree (organization_id, tenant_id);


--
-- Name: sales_payments_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_payments_scope_idx ON public.sales_payments USING btree (order_id, organization_id, tenant_id);


--
-- Name: sales_payments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_payments_status_idx ON public.sales_payments USING btree (organization_id, tenant_id, status);


--
-- Name: sales_quote_adjustments_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_quote_adjustments_scope_idx ON public.sales_quote_adjustments USING btree (quote_id, organization_id, tenant_id);


--
-- Name: sales_quote_lines_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_quote_lines_normalized_idx ON public.sales_quote_lines USING btree (organization_id, tenant_id, normalized_unit, normalized_quantity);


--
-- Name: sales_quote_lines_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_quote_lines_scope_idx ON public.sales_quote_lines USING btree (quote_id, organization_id, tenant_id);


--
-- Name: sales_quote_lines_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_quote_lines_status_idx ON public.sales_quote_lines USING btree (organization_id, tenant_id, status);


--
-- Name: sales_quotes_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_quotes_scope_idx ON public.sales_quotes USING btree (organization_id, tenant_id);


--
-- Name: sales_quotes_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_quotes_status_idx ON public.sales_quotes USING btree (organization_id, tenant_id, status);


--
-- Name: sales_return_lines_order_line_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_return_lines_order_line_idx ON public.sales_return_lines USING btree (order_line_id, organization_id, tenant_id);


--
-- Name: sales_return_lines_return_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_return_lines_return_idx ON public.sales_return_lines USING btree (return_id, organization_id, tenant_id);


--
-- Name: sales_returns_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_returns_scope_idx ON public.sales_returns USING btree (order_id, organization_id, tenant_id);


--
-- Name: sales_returns_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_returns_status_idx ON public.sales_returns USING btree (organization_id, tenant_id, status);


--
-- Name: sales_shipment_items_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_shipment_items_scope_idx ON public.sales_shipment_items USING btree (shipment_id, organization_id, tenant_id);


--
-- Name: sales_shipments_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_shipments_scope_idx ON public.sales_shipments USING btree (order_id, organization_id, tenant_id);


--
-- Name: sales_shipments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_shipments_status_idx ON public.sales_shipments USING btree (organization_id, tenant_id, status);


--
-- Name: sales_shipping_methods_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_shipping_methods_scope_idx ON public.sales_shipping_methods USING btree (organization_id, tenant_id);


--
-- Name: sales_tax_rates_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_tax_rates_scope_idx ON public.sales_tax_rates USING btree (organization_id, tenant_id);


--
-- Name: scheduled_jobs_next_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduled_jobs_next_run_idx ON public.scheduled_jobs USING btree (next_run_at);


--
-- Name: scheduled_jobs_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduled_jobs_org_tenant_idx ON public.scheduled_jobs USING btree (organization_id, tenant_id);


--
-- Name: scheduled_jobs_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scheduled_jobs_scope_idx ON public.scheduled_jobs USING btree (scope_type, is_enabled);


--
-- Name: search_tokens_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_tokens_entity_idx ON public.search_tokens USING btree (entity_type, entity_id);


--
-- Name: search_tokens_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_tokens_lookup_idx ON public.search_tokens USING btree (entity_type, field, token_hash, tenant_id, organization_id);


--
-- Name: search_tokens_presence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_tokens_presence_idx ON public.search_tokens USING btree (entity_type, tenant_id, organization_id);


--
-- Name: search_tokens_tenant_token_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_tokens_tenant_token_hash_idx ON public.search_tokens USING btree (tenant_id, token_hash);


--
-- Name: staff_leave_requests_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_leave_requests_member_idx ON public.staff_leave_requests USING btree (member_id);


--
-- Name: staff_leave_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_leave_requests_status_idx ON public.staff_leave_requests USING btree (status, tenant_id, organization_id);


--
-- Name: staff_leave_requests_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_leave_requests_tenant_org_idx ON public.staff_leave_requests USING btree (tenant_id, organization_id);


--
-- Name: staff_team_member_activities_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_activities_member_idx ON public.staff_team_member_activities USING btree (member_id);


--
-- Name: staff_team_member_activities_member_occurred_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_activities_member_occurred_created_idx ON public.staff_team_member_activities USING btree (member_id, occurred_at, created_at);


--
-- Name: staff_team_member_activities_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_activities_tenant_org_idx ON public.staff_team_member_activities USING btree (tenant_id, organization_id);


--
-- Name: staff_team_member_addresses_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_addresses_member_idx ON public.staff_team_member_addresses USING btree (member_id);


--
-- Name: staff_team_member_addresses_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_addresses_tenant_org_idx ON public.staff_team_member_addresses USING btree (tenant_id, organization_id);


--
-- Name: staff_team_member_comments_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_comments_member_idx ON public.staff_team_member_comments USING btree (member_id);


--
-- Name: staff_team_member_comments_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_comments_tenant_org_idx ON public.staff_team_member_comments USING btree (tenant_id, organization_id);


--
-- Name: staff_team_member_job_histories_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_job_histories_member_idx ON public.staff_team_member_job_histories USING btree (member_id);


--
-- Name: staff_team_member_job_histories_member_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_job_histories_member_start_idx ON public.staff_team_member_job_histories USING btree (member_id, start_date);


--
-- Name: staff_team_member_job_histories_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_member_job_histories_tenant_org_idx ON public.staff_team_member_job_histories USING btree (tenant_id, organization_id);


--
-- Name: staff_team_members_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_members_tenant_org_idx ON public.staff_team_members USING btree (tenant_id, organization_id);


--
-- Name: staff_team_roles_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_team_roles_tenant_org_idx ON public.staff_team_roles USING btree (tenant_id, organization_id);


--
-- Name: staff_teams_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_teams_tenant_org_idx ON public.staff_teams USING btree (tenant_id, organization_id);


--
-- Name: staff_time_entries_member_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_entries_member_date_idx ON public.staff_time_entries USING btree (organization_id, staff_member_id, date);


--
-- Name: staff_time_entries_project_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_entries_project_date_idx ON public.staff_time_entries USING btree (organization_id, time_project_id, date);


--
-- Name: staff_time_entries_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_entries_tenant_org_idx ON public.staff_time_entries USING btree (tenant_id, organization_id);


--
-- Name: staff_time_entry_segments_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_entry_segments_entry_idx ON public.staff_time_entry_segments USING btree (time_entry_id);


--
-- Name: staff_time_entry_segments_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_entry_segments_tenant_org_idx ON public.staff_time_entry_segments USING btree (tenant_id, organization_id);


--
-- Name: staff_time_project_members_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_project_members_member_idx ON public.staff_time_project_members USING btree (organization_id, staff_member_id);


--
-- Name: staff_time_project_members_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_project_members_project_idx ON public.staff_time_project_members USING btree (organization_id, time_project_id);


--
-- Name: staff_time_project_members_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_project_members_tenant_org_idx ON public.staff_time_project_members USING btree (tenant_id, organization_id);


--
-- Name: staff_time_project_members_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_project_members_unique_idx ON public.staff_time_project_members USING btree (organization_id, tenant_id, time_project_id, staff_member_id);


--
-- Name: staff_time_projects_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_projects_code_unique_idx ON public.staff_time_projects USING btree (organization_id, tenant_id, code);


--
-- Name: staff_time_projects_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_time_projects_tenant_org_idx ON public.staff_time_projects USING btree (tenant_id, organization_id);


--
-- Name: step_instances_step_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_instances_step_id_idx ON public.step_instances USING btree (step_id, status);


--
-- Name: step_instances_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_instances_tenant_org_idx ON public.step_instances USING btree (tenant_id, organization_id);


--
-- Name: step_instances_workflow_instance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_instances_workflow_instance_idx ON public.step_instances USING btree (workflow_instance_id, status);


--
-- Name: sync_cursors_integration_id_entity_type_direction__255ea_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sync_cursors_integration_id_entity_type_direction__255ea_index ON public.sync_cursors USING btree (integration_id, entity_type, direction, organization_id, tenant_id);


--
-- Name: sync_excel_uploads_organization_id_tenant_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sync_excel_uploads_organization_id_tenant_id_status_index ON public.sync_excel_uploads USING btree (organization_id, tenant_id, status);


--
-- Name: sync_external_id_mappings_integration_id_external__063e8_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sync_external_id_mappings_integration_id_external__063e8_index ON public.sync_external_id_mappings USING btree (integration_id, external_id, organization_id);


--
-- Name: sync_external_id_mappings_internal_entity_type_int_7f84a_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sync_external_id_mappings_internal_entity_type_int_7f84a_index ON public.sync_external_id_mappings USING btree (internal_entity_type, internal_entity_id, organization_id);


--
-- Name: sync_mappings_integration_id_entity_type_organizat_7aa92_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sync_mappings_integration_id_entity_type_organizat_7aa92_index ON public.sync_mappings USING btree (integration_id, entity_type, organization_id, tenant_id);


--
-- Name: sync_runs_integration_id_entity_type_status_organi_43560_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sync_runs_integration_id_entity_type_status_organi_43560_index ON public.sync_runs USING btree (integration_id, entity_type, status, organization_id, tenant_id);


--
-- Name: sync_schedules_integration_id_entity_type_directio_fe28d_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sync_schedules_integration_id_entity_type_directio_fe28d_index ON public.sync_schedules USING btree (integration_id, entity_type, direction, organization_id, tenant_id);


--
-- Name: upgrade_action_runs_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX upgrade_action_runs_scope_idx ON public.upgrade_action_runs USING btree (organization_id, tenant_id);


--
-- Name: user_devices_tenant_org_user_device_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_devices_tenant_org_user_device_active_unique ON public.user_devices USING btree (tenant_id, organization_id, user_id, device_id) NULLS NOT DISTINCT WHERE (deleted_at IS NULL);


--
-- Name: user_devices_tenant_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_devices_tenant_user_idx ON public.user_devices USING btree (tenant_id, user_id);


--
-- Name: user_roles_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_roles_role_id_idx ON public.user_roles USING btree (role_id);


--
-- Name: user_roles_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_roles_user_id_idx ON public.user_roles USING btree (user_id);


--
-- Name: user_tasks_status_assigned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_tasks_status_assigned_idx ON public.user_tasks USING btree (status, assigned_to);


--
-- Name: user_tasks_status_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_tasks_status_due_date_idx ON public.user_tasks USING btree (status, due_date);


--
-- Name: user_tasks_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_tasks_tenant_org_idx ON public.user_tasks USING btree (tenant_id, organization_id);


--
-- Name: user_tasks_workflow_instance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_tasks_workflow_instance_idx ON public.user_tasks USING btree (workflow_instance_id);


--
-- Name: users_email_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_hash_idx ON public.users USING btree (email_hash);


--
-- Name: warranty_claim_events_claim_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_events_claim_created_idx ON public.warranty_claim_events USING btree (claim_id, created_at);


--
-- Name: warranty_claim_lines_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_lines_claim_idx ON public.warranty_claim_lines USING btree (claim_id, organization_id, tenant_id);


--
-- Name: warranty_claim_lines_order_line_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_lines_order_line_idx ON public.warranty_claim_lines USING btree (order_line_id, organization_id, tenant_id);


--
-- Name: warranty_claim_lines_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_lines_product_idx ON public.warranty_claim_lines USING btree (product_id, organization_id, tenant_id);


--
-- Name: warranty_claim_lines_serial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_lines_serial_idx ON public.warranty_claim_lines USING btree (tenant_id, organization_id, serial_number);


--
-- Name: warranty_claim_registrations_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_registrations_customer_idx ON public.warranty_claim_registrations USING btree (tenant_id, organization_id, customer_id);


--
-- Name: warranty_claim_registrations_serial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_registrations_serial_idx ON public.warranty_claim_registrations USING btree (tenant_id, organization_id, serial_number);


--
-- Name: warranty_claim_sla_signals_pending_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_sla_signals_pending_scope_idx ON public.warranty_claim_sla_signals USING btree (tenant_id, organization_id, published_at, created_at);


--
-- Name: warranty_claim_troubleshooting_guides_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_troubleshooting_guides_lookup_idx ON public.warranty_claim_troubleshooting_guides USING btree (tenant_id, organization_id, claim_type, reason_code);


--
-- Name: warranty_claim_vendor_policies_vendor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claim_vendor_policies_vendor_idx ON public.warranty_claim_vendor_policies USING btree (tenant_id, organization_id, vendor_name);


--
-- Name: warranty_claims_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claims_customer_idx ON public.warranty_claims USING btree (customer_id, organization_id, tenant_id);


--
-- Name: warranty_claims_external_ref_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warranty_claims_external_ref_unique ON public.warranty_claims USING btree (tenant_id, organization_id, external_ref) WHERE ((external_ref IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: warranty_claims_intake_message_ref_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warranty_claims_intake_message_ref_unique ON public.warranty_claims USING btree (tenant_id, organization_id, intake_message_ref) WHERE ((intake_message_ref IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: warranty_claims_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claims_order_idx ON public.warranty_claims USING btree (order_id, organization_id, tenant_id);


--
-- Name: warranty_claims_return_tracking_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claims_return_tracking_idx ON public.warranty_claims USING btree (tenant_id, organization_id, return_tracking_number) WHERE ((return_tracking_number IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: warranty_claims_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warranty_claims_status_idx ON public.warranty_claims USING btree (organization_id, tenant_id, status);


--
-- Name: webhook_deliveries_event_type_organization_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_event_type_organization_id_index ON public.webhook_deliveries USING btree (event_type, organization_id);


--
-- Name: webhook_deliveries_organization_id_tenant_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_organization_id_tenant_id_created_at_index ON public.webhook_deliveries USING btree (organization_id, tenant_id, created_at);


--
-- Name: webhook_deliveries_webhook_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_webhook_id_created_at_index ON public.webhook_deliveries USING btree (webhook_id, created_at);


--
-- Name: webhook_deliveries_webhook_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_webhook_id_status_index ON public.webhook_deliveries USING btree (webhook_id, status);


--
-- Name: webhook_inbound_configs_source_key_is_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_inbound_configs_source_key_is_active_index ON public.webhook_inbound_configs USING btree (source_key, is_active);


--
-- Name: webhook_inbound_receipts_provider_key_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_inbound_receipts_provider_key_created_at_index ON public.webhook_inbound_receipts USING btree (provider_key, created_at);


--
-- Name: webhook_ingestions_external_message_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_ingestions_external_message_id_index ON public.webhook_ingestions USING btree (external_message_id);


--
-- Name: webhook_ingestions_organization_id_tenant_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_ingestions_organization_id_tenant_id_created_at_index ON public.webhook_ingestions USING btree (organization_id, tenant_id, created_at);


--
-- Name: webhook_ingestions_source_key_status_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_ingestions_source_key_status_created_at_index ON public.webhook_ingestions USING btree (source_key, status, created_at);


--
-- Name: webhooks_organization_id_tenant_id_deleted_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhooks_organization_id_tenant_id_deleted_at_index ON public.webhooks USING btree (organization_id, tenant_id, deleted_at);


--
-- Name: webhooks_organization_id_tenant_id_is_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhooks_organization_id_tenant_id_is_active_index ON public.webhooks USING btree (organization_id, tenant_id, is_active);


--
-- Name: wms_inventory_balances_org_location_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_balances_org_location_variant_idx ON public.wms_inventory_balances USING btree (organization_id, location_id, catalog_variant_id);


--
-- Name: wms_inventory_balances_org_lot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_balances_org_lot_idx ON public.wms_inventory_balances USING btree (organization_id, lot_id) WHERE ((lot_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: wms_inventory_balances_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_balances_org_tenant_idx ON public.wms_inventory_balances USING btree (organization_id, tenant_id);


--
-- Name: wms_inventory_balances_org_warehouse_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_balances_org_warehouse_variant_idx ON public.wms_inventory_balances USING btree (organization_id, warehouse_id, catalog_variant_id);


--
-- Name: wms_inventory_balances_serial_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_inventory_balances_serial_unique_idx ON public.wms_inventory_balances USING btree (organization_id, warehouse_id, location_id, catalog_variant_id, serial_number) WHERE ((serial_number IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: wms_inventory_lots_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_lots_org_tenant_idx ON public.wms_inventory_lots USING btree (organization_id, tenant_id);


--
-- Name: wms_inventory_lots_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_lots_variant_idx ON public.wms_inventory_lots USING btree (catalog_variant_id);


--
-- Name: wms_inventory_lots_variant_lot_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_inventory_lots_variant_lot_unique_idx ON public.wms_inventory_lots USING btree (organization_id, catalog_variant_id, lot_number) WHERE (deleted_at IS NULL);


--
-- Name: wms_inventory_movements_idempotency_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_inventory_movements_idempotency_unique_idx ON public.wms_inventory_movements USING btree (organization_id, idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: wms_inventory_movements_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_movements_org_tenant_idx ON public.wms_inventory_movements USING btree (organization_id, tenant_id);


--
-- Name: wms_inventory_movements_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_movements_reference_idx ON public.wms_inventory_movements USING btree (organization_id, reference_type, reference_id);


--
-- Name: wms_inventory_movements_variant_received_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_movements_variant_received_at_idx ON public.wms_inventory_movements USING btree (organization_id, catalog_variant_id, received_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: wms_inventory_movements_warehouse_performed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_movements_warehouse_performed_at_idx ON public.wms_inventory_movements USING btree (organization_id, warehouse_id, performed_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: wms_inventory_profiles_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_profiles_org_tenant_idx ON public.wms_product_inventory_profiles USING btree (organization_id, tenant_id);


--
-- Name: wms_inventory_profiles_product_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_inventory_profiles_product_unique_idx ON public.wms_product_inventory_profiles USING btree (organization_id, catalog_product_id) WHERE ((deleted_at IS NULL) AND (catalog_variant_id IS NULL));


--
-- Name: wms_inventory_profiles_variant_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_inventory_profiles_variant_unique_idx ON public.wms_product_inventory_profiles USING btree (organization_id, catalog_variant_id) WHERE ((deleted_at IS NULL) AND (catalog_variant_id IS NOT NULL));


--
-- Name: wms_inventory_reservations_idempotency_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_inventory_reservations_idempotency_unique_idx ON public.wms_inventory_reservations USING btree (organization_id, idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (deleted_at IS NULL) AND (status = 'active'::text));


--
-- Name: wms_inventory_reservations_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_reservations_org_tenant_idx ON public.wms_inventory_reservations USING btree (organization_id, tenant_id);


--
-- Name: wms_inventory_reservations_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_reservations_source_idx ON public.wms_inventory_reservations USING btree (organization_id, source_type, source_id);


--
-- Name: wms_inventory_reservations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_inventory_reservations_status_idx ON public.wms_inventory_reservations USING btree (organization_id, warehouse_id, catalog_variant_id, status);


--
-- Name: wms_sowa_org_order_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_sowa_org_order_unique_idx ON public.wms_sales_order_warehouse_assignments USING btree (organization_id, sales_order_id) WHERE (deleted_at IS NULL);


--
-- Name: wms_sowa_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_sowa_org_tenant_idx ON public.wms_sales_order_warehouse_assignments USING btree (organization_id, tenant_id);


--
-- Name: wms_sowa_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_sowa_warehouse_idx ON public.wms_sales_order_warehouse_assignments USING btree (warehouse_id);


--
-- Name: wms_stock_valuations_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_stock_valuations_org_tenant_idx ON public.wms_stock_valuations USING btree (organization_id, tenant_id);


--
-- Name: wms_stock_valuations_variant_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_stock_valuations_variant_warehouse_idx ON public.wms_stock_valuations USING btree (organization_id, catalog_variant_id, warehouse_id) WHERE (deleted_at IS NULL);


--
-- Name: wms_warehouse_locations_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_warehouse_locations_org_tenant_idx ON public.wms_warehouse_locations USING btree (organization_id, tenant_id);


--
-- Name: wms_warehouse_locations_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_warehouse_locations_parent_idx ON public.wms_warehouse_locations USING btree (parent_id);


--
-- Name: wms_warehouse_locations_warehouse_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_warehouse_locations_warehouse_code_unique_idx ON public.wms_warehouse_locations USING btree (warehouse_id, code) WHERE (deleted_at IS NULL);


--
-- Name: wms_warehouse_locations_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_warehouse_locations_warehouse_idx ON public.wms_warehouse_locations USING btree (warehouse_id);


--
-- Name: wms_warehouse_zones_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_warehouse_zones_org_tenant_idx ON public.wms_warehouse_zones USING btree (organization_id, tenant_id);


--
-- Name: wms_warehouse_zones_warehouse_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_warehouse_zones_warehouse_code_unique_idx ON public.wms_warehouse_zones USING btree (warehouse_id, code) WHERE (deleted_at IS NULL);


--
-- Name: wms_warehouse_zones_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_warehouse_zones_warehouse_idx ON public.wms_warehouse_zones USING btree (warehouse_id);


--
-- Name: wms_warehouses_org_code_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_warehouses_org_code_unique_idx ON public.wms_warehouses USING btree (organization_id, code) WHERE (deleted_at IS NULL);


--
-- Name: wms_warehouses_org_primary_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wms_warehouses_org_primary_unique_idx ON public.wms_warehouses USING btree (organization_id) WHERE ((deleted_at IS NULL) AND (is_primary = true));


--
-- Name: wms_warehouses_org_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wms_warehouses_org_tenant_idx ON public.wms_warehouses USING btree (organization_id, tenant_id);


--
-- Name: workflow_branch_instances_instance_fork_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_branch_instances_instance_fork_idx ON public.workflow_branch_instances USING btree (workflow_instance_id, fork_step_id);


--
-- Name: workflow_branch_instances_instance_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_branch_instances_instance_status_idx ON public.workflow_branch_instances USING btree (workflow_instance_id, status);


--
-- Name: workflow_branch_instances_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_branch_instances_tenant_org_idx ON public.workflow_branch_instances USING btree (tenant_id, organization_id);


--
-- Name: workflow_definitions_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_definitions_enabled_idx ON public.workflow_definitions USING btree (enabled);


--
-- Name: workflow_definitions_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_definitions_tenant_org_idx ON public.workflow_definitions USING btree (tenant_id, organization_id);


--
-- Name: workflow_definitions_workflow_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_definitions_workflow_id_idx ON public.workflow_definitions USING btree (workflow_id);


--
-- Name: workflow_event_triggers_definition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_event_triggers_definition_idx ON public.workflow_event_triggers USING btree (workflow_definition_id);


--
-- Name: workflow_event_triggers_enabled_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_event_triggers_enabled_priority_idx ON public.workflow_event_triggers USING btree (enabled, priority);


--
-- Name: workflow_event_triggers_event_pattern_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_event_triggers_event_pattern_idx ON public.workflow_event_triggers USING btree (event_pattern, enabled);


--
-- Name: workflow_event_triggers_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_event_triggers_tenant_org_idx ON public.workflow_event_triggers USING btree (tenant_id, organization_id);


--
-- Name: workflow_events_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_events_event_type_idx ON public.workflow_events USING btree (event_type, occurred_at);


--
-- Name: workflow_events_instance_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_events_instance_occurred_idx ON public.workflow_events USING btree (workflow_instance_id, occurred_at);


--
-- Name: workflow_events_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_events_tenant_org_idx ON public.workflow_events USING btree (tenant_id, organization_id);


--
-- Name: workflow_instances_correlation_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_instances_correlation_key_idx ON public.workflow_instances USING btree (correlation_key);


--
-- Name: workflow_instances_current_step_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_instances_current_step_idx ON public.workflow_instances USING btree (current_step_id, status);


--
-- Name: workflow_instances_definition_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_instances_definition_status_idx ON public.workflow_instances USING btree (definition_id, status);


--
-- Name: workflow_instances_status_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_instances_status_tenant_idx ON public.workflow_instances USING btree (status, tenant_id);


--
-- Name: workflow_instances_tenant_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_instances_tenant_org_idx ON public.workflow_instances USING btree (tenant_id, organization_id);


--
-- Name: catalog_product_variant_relations catalog_product_variant_relations_child_product_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_product_variant_relations
    ADD CONSTRAINT catalog_product_variant_relations_child_product_id_foreign FOREIGN KEY (child_product_id) REFERENCES public.catalog_products(id) ON DELETE CASCADE;


--
-- Name: customer_contacts customer_contacts_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.customer_entities(id) ON DELETE CASCADE;


--
-- Name: customer_contacts customer_contacts_entity_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_entity_id_foreign FOREIGN KEY (entity_id) REFERENCES public.customer_entities(id);


--
-- Name: manufacturing_bom_lines manufacturing_bom_lines_bom_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_bom_lines
    ADD CONSTRAINT manufacturing_bom_lines_bom_id_foreign FOREIGN KEY (bom_id) REFERENCES public.manufacturing_boms(id);


--
-- Name: manufacturing_bom_operations manufacturing_bom_operations_bom_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_bom_operations
    ADD CONSTRAINT manufacturing_bom_operations_bom_id_foreign FOREIGN KEY (bom_id) REFERENCES public.manufacturing_boms(id);


--
-- Name: manufacturing_machines manufacturing_machines_work_center_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_machines
    ADD CONSTRAINT manufacturing_machines_work_center_id_foreign FOREIGN KEY (work_center_id) REFERENCES public.manufacturing_work_centers(id) ON DELETE SET NULL;


--
-- Name: manufacturing_material_consumptions manufacturing_material_consumptions_production_order_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_material_consumptions
    ADD CONSTRAINT manufacturing_material_consumptions_production_order_id_foreign FOREIGN KEY (production_order_id) REFERENCES public.manufacturing_production_orders(id);


--
-- Name: manufacturing_production_stages manufacturing_production_stages_production_order_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_production_stages
    ADD CONSTRAINT manufacturing_production_stages_production_order_id_foreign FOREIGN KEY (production_order_id) REFERENCES public.manufacturing_production_orders(id);


--
-- Name: manufacturing_quality_check_items manufacturing_quality_check_items_inspection_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_quality_check_items
    ADD CONSTRAINT manufacturing_quality_check_items_inspection_id_foreign FOREIGN KEY (inspection_id) REFERENCES public.manufacturing_quality_inspections(id);


--
-- Name: wms_sales_order_warehouse_assignments wms_sales_order_warehouse_assignments_warehouse_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_sales_order_warehouse_assignments
    ADD CONSTRAINT wms_sales_order_warehouse_assignments_warehouse_id_foreign FOREIGN KEY (warehouse_id) REFERENCES public.wms_warehouses(id);


--
-- Name: wms_stock_valuations wms_stock_valuations_lot_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_valuations
    ADD CONSTRAINT wms_stock_valuations_lot_id_foreign FOREIGN KEY (lot_id) REFERENCES public.wms_inventory_lots(id) ON DELETE SET NULL;


--
-- Name: wms_stock_valuations wms_stock_valuations_warehouse_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wms_stock_valuations
    ADD CONSTRAINT wms_stock_valuations_warehouse_id_foreign FOREIGN KEY (warehouse_id) REFERENCES public.wms_warehouses(id);


--
-- PostgreSQL database dump complete
--

\unrestrict uozjfPuOsaIx2wv7tB9Yp7ENZ0vlMYGHRhFaqrXAvpzOfiol8xQvzggNoYMKrbe

