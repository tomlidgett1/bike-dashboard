-- ============================================================================
-- Nest BUSINESS portal -> Yellow Jersey (single Supabase project)
-- (function-body validation off: some retained helper functions reference
--  intentionally-excluded individual tables; bodies are valid in production.)
-- ============================================================================
SET check_function_bodies = false;
-- ============================================================================
-- Schema lifted from the live Nest "Nest Chat" project (oypzijwqmkxktvgtsqkp),
-- filtered to the business/brand-portal subset (65 tables). Individual/personal
-- assistant tables (moments, quid, hey_comp, bank, entities, memory, etc.) are
-- intentionally excluded. `conversations` is excluded to avoid colliding with
-- YJ's existing marketplace-messaging table (the portal uses conversation_messages).
-- Additive only: no existing YJ object is modified or dropped.
-- ============================================================================

-- Required extensions (no-op if already enabled on this project)
create extension if not exists "vector" with schema "extensions";
create extension if not exists "pg_net" with schema "extensions";
create extension if not exists "pgmq";

-- pg_cron powers the brand reporting/automation schedules (functions call cron.schedule).
-- On Supabase this is normally enabled via the dashboard; create resiliently so the
-- migration still applies where pg_cron is not preloaded (functions create either way).
do $$
begin
  create extension if not exists "pg_cron";
exception when others then
  raise notice 'pg_cron not enabled in this environment; enable via Supabase dashboard before relying on scheduled automations';
end $$;

-- Business helper schemas (full_review jobs, private analytics views) are created by the
-- body below; ensure they exist defensively.
create schema if not exists "full_review";
create schema if not exists "private";

-- pgmq queue used by the inbound message pipeline (process-inbound-queue)
do $$
begin
  perform pgmq.create('inbound_events');
exception when others then null;  -- already exists / version differences
end $$;


CREATE SCHEMA IF NOT EXISTS "full_review";
CREATE SCHEMA IF NOT EXISTS "private";
CREATE TYPE "public"."moment_action_type" AS ENUM (
    'send_message',
    'run_agentic_task',
    'create_reminder',
    'trigger_morning_brief'
);
CREATE TYPE "public"."moment_exec_status" AS ENUM (
    'pending',
    'executing',
    'sent',
    'failed',
    'skipped',
    'deduplicated',
    'cooldown_blocked',
    'frequency_capped',
    'suppressed',
    'dry_run'
);
CREATE TYPE "public"."moment_status" AS ENUM (
    'draft',
    'active',
    'paused',
    'archived'
);
CREATE TYPE "public"."moment_trigger_type" AS ENUM (
    'relative_time',
    'inactivity',
    'event',
    'scheduled',
    'table_condition',
    'opt_in'
);
CREATE OR REPLACE FUNCTION "full_review"."configure_dispatcher_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text" DEFAULT '* * * * *'::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'full_review', 'public', 'cron', 'net'
    AS $_$
declare
  v_job_id bigint;
begin
  begin
    perform cron.unschedule('full-review-dispatcher');
  exception
    when others then null;
  end;

  select cron.schedule(
    'full-review-dispatcher',
    p_schedule,
    format(
      $schedule$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      ) as request_id;
      $schedule$,
      rtrim(p_project_url, '/') || '/functions/v1/full-review-dispatcher',
      p_bearer_token
    )
  ) into v_job_id;

  return v_job_id;
end;
$_$;
CREATE OR REPLACE FUNCTION "full_review"."disable_dispatcher_cron"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'full_review', 'public', 'cron'
    AS $$
begin
  begin
    perform cron.unschedule('full-review-dispatcher');
  exception
    when others then null;
  end;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."NESTV3_claim_scheduled_run"("p_automation_id" "uuid", "p_run_key" "text", "p_scheduled_for" timestamp with time zone, "p_input_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_lock_seconds" integer DEFAULT 900) RETURNS TABLE("run_id" "uuid", "claimed" boolean, "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_run_id uuid;
  v_status text;
begin
  insert into public."NESTV3_automation_runs" (
    automation_id,
    run_key,
    scheduled_for,
    input_payload
  )
  values (
    p_automation_id,
    p_run_key,
    p_scheduled_for,
    coalesce(p_input_payload, '{}'::jsonb)
  )
  on conflict (automation_id, run_key) do nothing;

  update public."NESTV3_automation_runs" r
  set status = 'locked',
      locked_at = now(),
      locked_by = 'NESTV3_automation-runner',
      input_payload = coalesce(p_input_payload, r.input_payload, '{}'::jsonb),
      error = null,
      updated_at = now()
  where r.automation_id = p_automation_id
    and r.run_key = p_run_key
    and (
      r.status in ('pending', 'failed')
      or (
        r.status in ('locked', 'running')
        and coalesce(r.locked_at, r.started_at, r.created_at) < now() - make_interval(secs => greatest(p_lock_seconds, 60))
      )
    )
  returning r.id, r.status into v_run_id, v_status;

  if v_run_id is not null then
    return query select v_run_id, true, v_status;
    return;
  end if;

  select r.id, r.status into v_run_id, v_status
  from public."NESTV3_automation_runs" r
  where r.automation_id = p_automation_id
    and r.run_key = p_run_key
  limit 1;

  return query select v_run_id, false, coalesce(v_status, 'missing');
end;
$$;
CREATE OR REPLACE FUNCTION "public"."NESTV3_touch_automation"("p_automation_id" "uuid", "p_next_run_at" timestamp with time zone, "p_last_error" "text" DEFAULT NULL::"text", "p_success" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public."NESTV3_automations"
  set last_run_at = now(),
      next_run_at = coalesce(p_next_run_at, now() + interval '5 minutes'),
      failure_count = case when p_success then 0 else failure_count + 1 end,
      last_error = p_last_error,
      status = case
        when not p_success and failure_count + 1 >= 5 then 'failed'
        else status
      end,
      updated_at = now()
  where id = p_automation_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."_jsonb_repair_string_scalar"("m" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  parsed jsonb;
begin
  if m is null then return m; end if;
  if jsonb_typeof(m) <> 'string' then return m; end if;
  begin
    parsed := (m #>> '{}')::jsonb;
  exception when others then
    return m;
  end;
  if jsonb_typeof(parsed) = 'object' then
    return parsed;
  end if;
  return m;
end;
$$;
COMMENT ON FUNCTION "public"."_jsonb_repair_string_scalar"("m" "jsonb") IS 'Coerce a JSONB string scalar that wraps an object back to the object. Idempotent and safe to re-run.';
CREATE OR REPLACE FUNCTION "public"."activate_nest_user"("p_token" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_handle text;
begin
  update public.user_profiles up
    set status = 'active'
  where up.onboarding_token = p_token
    and up.status != 'active'
  returning up.handle into v_handle;

  return v_handle;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."add_user_fact_atomic"("p_handle" "text", "p_fact" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now bigint := extract(epoch from now())::bigint;
  v_existing jsonb := '[]'::jsonb;
begin
  insert into public.user_profiles (handle, name, facts, first_seen, last_seen)
  values (p_handle, null, '[]'::jsonb, v_now, v_now)
  on conflict (handle) do nothing;

  select facts
    into v_existing
  from public.user_profiles
  where handle = p_handle
  for update;

  if exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_existing, '[]'::jsonb)) as fact(value)
    where fact.value = p_fact
  ) then
    update public.user_profiles
      set last_seen = v_now
      where handle = p_handle;
    return false;
  end if;

  update public.user_profiles
    set facts = coalesce(v_existing, '[]'::jsonb) || to_jsonb(array[p_fact]::text[]),
        last_seen = v_now
    where handle = p_handle;

  return true;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."admin_apply_automation_change"("p_actor_email" "text", "p_actor_uuid" "uuid", "p_target_user" "uuid", "p_target_handle" "text", "p_type" "text", "p_active" boolean, "p_config" "jsonb", "p_next_run_at" timestamp with time zone, "p_action" "text", "p_source_env" "text", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_paused_during_active_send" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before        jsonb;
  v_before_id     uuid;
  v_before_updated timestamptz;
  v_after         jsonb;
  v_after_id      uuid;
begin
  -- snapshot before
  select to_jsonb(ua.*), ua.id, ua.updated_at
    into v_before, v_before_id, v_before_updated
  from public.user_automations ua
  where ua.user_id = p_target_user
    and ua.automation_type = p_type;

  -- optimistic concurrency check
  if p_expected_updated_at is not null
     and v_before_updated is not null
     and v_before_updated is distinct from p_expected_updated_at then
    raise exception 'concurrent_update'
      using errcode = '40001',
            hint = 'Another admin updated this row; reload required';
  end if;

  if v_before_id is null then
    -- insert new
    insert into public.user_automations (
      user_id, automation_type, active, config, next_run_at,
      last_admin_modified_at, last_admin_modified_by_email, last_admin_modified_action
    )
    values (
      p_target_user, p_type, p_active, p_config, p_next_run_at,
      now(), p_actor_email, p_action
    )
    returning to_jsonb(user_automations.*), user_automations.id
    into v_after, v_after_id;
  else
    -- update existing
    update public.user_automations
       set active                       = p_active,
           config                       = p_config,
           next_run_at                  = p_next_run_at,
           last_admin_modified_at       = now(),
           last_admin_modified_by_email = p_actor_email,
           last_admin_modified_action   = p_action,
           updated_at                   = now()
     where id = v_before_id
    returning to_jsonb(user_automations.*), user_automations.id
    into v_after, v_after_id;
  end if;

  -- audit
  insert into public.moment_admin_audit_log (
    actor_email, actor_user_id, target_user_id, target_handle,
    automation_id, automation_type, action,
    before_jsonb, after_jsonb, source_env,
    paused_during_active_send
  ) values (
    p_actor_email, p_actor_uuid, p_target_user, p_target_handle,
    v_after_id, p_type, p_action,
    v_before, v_after, p_source_env,
    p_paused_during_active_send
  );

  return v_after;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."admin_unenrol_automation"("p_actor_email" "text", "p_actor_uuid" "uuid", "p_target_user" "uuid", "p_target_handle" "text", "p_type" "text", "p_source_env" "text", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before  jsonb;
  v_before_id uuid;
  v_before_updated timestamptz;
  v_after   jsonb;
  v_after_id uuid;
begin
  select to_jsonb(ua.*), ua.id, ua.updated_at
    into v_before, v_before_id, v_before_updated
  from public.user_automations ua
  where ua.user_id = p_target_user
    and ua.automation_type = p_type;

  if v_before_id is null then
    return null;
  end if;

  if p_expected_updated_at is not null
     and v_before_updated is distinct from p_expected_updated_at then
    raise exception 'concurrent_update'
      using errcode = '40001',
            hint = 'Another admin updated this row; reload required';
  end if;

  update public.user_automations
     set active                       = false,
         next_run_at                  = null,
         last_admin_modified_at       = now(),
         last_admin_modified_by_email = p_actor_email,
         last_admin_modified_action   = 'unenrol',
         updated_at                   = now()
   where id = v_before_id
  returning to_jsonb(user_automations.*), user_automations.id
  into v_after, v_after_id;

  insert into public.moment_admin_audit_log (
    actor_email, actor_user_id, target_user_id, target_handle,
    automation_id, automation_type, action,
    before_jsonb, after_jsonb, source_env
  ) values (
    p_actor_email, p_actor_uuid, p_target_user, p_target_handle,
    v_after_id, p_type, 'unenrol',
    v_before, v_after, p_source_env
  );

  return v_after;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."advance_user_automation"("p_automation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_config jsonb;
  v_type text;
  v_tz text;
  v_time text;
  v_day text;
  v_frequency text;
  v_next timestamptz;
  v_hour int;
  v_minute int;
begin
  select config, automation_type into v_config, v_type
  from public.user_automations
  where id = p_automation_id;

  if not found then return; end if;

  v_tz := coalesce(v_config->>'timezone', 'Australia/Sydney');
  v_time := v_config->>'time';
  v_day := v_config->>'day';
  v_frequency := coalesce(v_config->>'frequency', 'daily');

  if v_frequency = 'one_shot' then
    update public.user_automations
    set last_run_at = now(),
        next_run_at = null,
        active = false,
        updated_at = now()
    where id = p_automation_id;
    return;
  end if;

  if v_time is not null then
    v_hour := split_part(v_time, ':', 1)::int;
    v_minute := split_part(v_time, ':', 2)::int;
  else
    v_hour := 8;
    v_minute := 0;
  end if;

  if v_frequency = 'minutely' then
    v_next := now() + interval '1 minute';
  elsif v_frequency = 'weekly' or v_day is not null then
    select next_run_at + interval '7 days' into v_next
    from public.user_automations where id = p_automation_id;
  elsif v_frequency = 'weekday' then
    select next_run_at + interval '1 day' into v_next
    from public.user_automations where id = p_automation_id;
    while extract(dow from v_next) in (0, 6) loop
      v_next := v_next + interval '1 day';
    end loop;
  elsif v_frequency = 'hourly' then
    v_next := now() + interval '1 hour';
  else
    select next_run_at + interval '1 day' into v_next
    from public.user_automations where id = p_automation_id;
  end if;

  while v_next <= now() loop
    if v_frequency = 'minutely' then
      v_next := v_next + interval '1 minute';
    elsif v_frequency = 'weekly' or v_day is not null then
      v_next := v_next + interval '7 days';
    elsif v_frequency = 'weekday' then
      v_next := v_next + interval '1 day';
      while extract(dow from v_next) in (0, 6) loop
        v_next := v_next + interval '1 day';
      end loop;
    elsif v_frequency = 'hourly' then
      v_next := v_next + interval '1 hour';
    else
      v_next := v_next + interval '1 day';
    end if;
  end loop;

  update public.user_automations
  set last_run_at = now(),
      next_run_at = v_next,
      updated_at = now()
  where id = p_automation_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."analytics_message_daypart"("p_hour" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_hour BETWEEN 0 AND 5 THEN 'overnight'
    WHEN p_hour BETWEEN 6 AND 11 THEN 'morning'
    WHEN p_hour BETWEEN 12 AND 16 THEN 'afternoon'
    ELSE 'evening'
  END
$$;
CREATE OR REPLACE FUNCTION "public"."analytics_message_fact_after_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM public.sync_analytics_message_fact(NEW.id);
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."append_conversation_message"("p_chat_id" "text", "p_role" "text", "p_content" "text", "p_handle" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_is_group_chat" boolean DEFAULT false, "p_chat_name" "text" DEFAULT NULL::"text", "p_participant_names" "jsonb" DEFAULT '[]'::"jsonb", "p_service" "text" DEFAULT NULL::"text", "p_engagement_scope" "text" DEFAULT 'nest'::"text", "p_engagement_brand_key" "text" DEFAULT NULL::"text", "p_provider_message_id" "text" DEFAULT NULL::"text", "p_reply_to_provider_message_id" "text" DEFAULT NULL::"text", "p_provider_part_index" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := now();
  v_expires_at timestamptz := now() + interval '24 hours';
  v_scope text := coalesce(p_engagement_scope, 'nest');
  v_brand_key text := nullif(lower(trim(coalesce(p_engagement_brand_key, ''))), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'is_group_chat', p_is_group_chat,
      'participant_names',
      case
        when jsonb_typeof(coalesce(p_participant_names, '[]'::jsonb)) = 'array'
          then coalesce(p_participant_names, '[]'::jsonb)
        else '[]'::jsonb
      end
    )
    || jsonb_strip_nulls(jsonb_build_object(
      'chat_name', p_chat_name,
      'service', p_service
    ));
begin
  if v_scope not in ('nest', 'brand') then
    raise exception 'invalid engagement scope: %', v_scope;
  end if;

  if v_scope = 'brand' and v_brand_key is null then
    raise exception 'brand engagement requires p_engagement_brand_key';
  end if;

  if v_scope = 'nest' then
    v_brand_key := null;
  end if;

  insert into public.conversations (
    chat_id,
    messages,
    last_active,
    expires_at
  )
  values (
    p_chat_id,
    '[]'::jsonb,
    extract(epoch from v_now)::bigint,
    v_expires_at
  )
  on conflict (chat_id) do update
    set last_active = excluded.last_active,
        expires_at = excluded.expires_at;

  insert into public.conversation_messages (
    chat_id,
    role,
    content,
    handle,
    metadata,
    created_at,
    expires_at,
    engagement_scope,
    engagement_brand_key,
    provider_message_id,
    reply_to_provider_message_id,
    provider_part_index
  )
  values (
    p_chat_id,
    p_role,
    p_content,
    p_handle,
    v_metadata,
    v_now,
    v_expires_at,
    v_scope,
    v_brand_key,
    nullif(trim(coalesce(p_provider_message_id, '')), ''),
    nullif(trim(coalesce(p_reply_to_provider_message_id, '')), ''),
    p_provider_part_index
  );
end;
$$;
CREATE OR REPLACE FUNCTION "public"."append_entity_timeline"("p_entity_id" bigint, "p_handle" "text", "p_event_text" "text", "p_event_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_source_kind" "text" DEFAULT 'background_extraction'::"text", "p_source_message_ids" "jsonb" DEFAULT '[]'::"jsonb", "p_source_summary_id" bigint DEFAULT NULL::bigint, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
  v_event_at timestamptz := coalesce(p_event_at, now());
begin
  insert into public.entity_timeline (
    entity_id, handle, event_text, event_at,
    source_kind, source_message_ids, source_summary_id, metadata
  )
  values (
    p_entity_id, p_handle, p_event_text, v_event_at,
    p_source_kind,
    coalesce(p_source_message_ids, '[]'::jsonb),
    p_source_summary_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  update public.entities
     set last_mentioned_at = greatest(last_mentioned_at, v_event_at),
         updated_at = now()
   where id = p_entity_id;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."archive_queue_message"("p_queue_name" "text", "p_message_id" bigint) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
  select pgmq.archive(p_queue_name, p_message_id);
$$;
CREATE OR REPLACE FUNCTION "public"."assign_experiment"("p_handle" "text", "p_experiment_name" "text", "p_variants" "text"[]) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_variant text;
  v_existing text;
begin
  select variant into v_existing
  from public.experiment_assignments
  where handle = p_handle and experiment_name = p_experiment_name;

  if v_existing is not null then
    return v_existing;
  end if;

  v_variant := p_variants[1 + floor(random() * array_length(p_variants, 1))::integer];

  insert into public.experiment_assignments (handle, experiment_name, variant)
  values (p_handle, p_experiment_name, v_variant)
  on conflict (handle, experiment_name) do nothing;

  select variant into v_variant
  from public.experiment_assignments
  where handle = p_handle and experiment_name = p_experiment_name;

  return v_variant;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."automation_count_in_window"("p_handle" "text", "p_automation_type" "text", "p_hours" integer DEFAULT 24) RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from public.automation_runs
  where handle = p_handle
    and automation_type = p_automation_type
    and sent_at > now() - make_interval(hours => p_hours);
$$;
CREATE OR REPLACE FUNCTION "public"."automations_sent_today"("p_handle" "text") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from public.automation_runs
  where handle = p_handle
    and sent_at > now() - interval '24 hours';
$$;
CREATE OR REPLACE FUNCTION "public"."build_or_tsquery"("query_text" "text") RETURNS "tsquery"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    string_agg(plainto_tsquery('english', word)::text, ' | ')::tsquery,
    plainto_tsquery('english', query_text)
  )
  FROM unnest(regexp_split_to_array(trim(query_text), '\s+')) AS word
  WHERE length(word) > 1
    AND plainto_tsquery('english', word)::text != '';
$$;
CREATE TABLE IF NOT EXISTS "public"."message_buffer" (
    "id" bigint NOT NULL,
    "chat_id" "text" NOT NULL,
    "message_id" "text" NOT NULL,
    "normalized_message" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone
);
CREATE OR REPLACE FUNCTION "public"."claim_buffered_messages"("p_chat_id" "text", "p_my_buffer_id" bigint) RETURNS SETOF "public"."message_buffer"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  UPDATE message_buffer
  SET    claimed_at = NOW()
  WHERE  chat_id    = p_chat_id
    AND  claimed_at IS NULL
    AND  (SELECT MAX(id)
          FROM   message_buffer
          WHERE  chat_id    = p_chat_id
            AND  claimed_at IS NULL) = p_my_buffer_id
  RETURNING *;
$$;
CREATE OR REPLACE FUNCTION "public"."claim_customer_automation_send"("p_handle" "text", "p_rule_key" "text", "p_metric_value" bigint DEFAULT NULL::bigint, "p_reason" "text" DEFAULT NULL::"text", "p_profile_snapshot" "jsonb" DEFAULT '{}'::"jsonb", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_triggered_by" "text" DEFAULT 'system'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_claimed boolean := false;
begin
  with claimed as (
    insert into public.customer_automation_rule_state (
      handle,
      rule_key,
      last_evaluated_at,
      last_outcome,
      last_reason,
      last_metric_value,
      last_profile_snapshot,
      last_metadata,
      first_eligible_at,
      send_in_progress_at,
      last_triggered_by,
      created_at,
      updated_at
    )
    values (
      p_handle,
      p_rule_key,
      now(),
      'eligible',
      p_reason,
      p_metric_value,
      coalesce(p_profile_snapshot, '{}'::jsonb),
      coalesce(p_metadata, '{}'::jsonb),
      now(),
      now(),
      p_triggered_by,
      now(),
      now()
    )
    on conflict (handle, rule_key) do update
    set
      last_evaluated_at = now(),
      last_outcome = 'eligible',
      last_reason = p_reason,
      last_metric_value = p_metric_value,
      last_profile_snapshot = coalesce(p_profile_snapshot, '{}'::jsonb),
      last_metadata = coalesce(p_metadata, '{}'::jsonb),
      first_eligible_at = coalesce(public.customer_automation_rule_state.first_eligible_at, now()),
      send_in_progress_at = now(),
      last_triggered_by = p_triggered_by,
      updated_at = now()
    where public.customer_automation_rule_state.sent_count = 0
      and not exists (
        select 1
        from public.automation_runs ar
        where ar.handle = p_handle
          and ar.automation_type = p_rule_key
      )
      and (
        public.customer_automation_rule_state.send_in_progress_at is null
        or public.customer_automation_rule_state.send_in_progress_at < now() - interval '5 minutes'
      )
    returning 1
  )
  select exists(select 1 from claimed) into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;
CREATE OR REPLACE FUNCTION "public"."claim_pending_webhook_events"("p_limit" integer DEFAULT 10) RETURNS TABLE("id" bigint, "provider" "text", "account_email" "text", "subscription_id" "uuid", "history_id" "text", "resource_data" "jsonb", "change_type" "text", "source_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with claimed as (
    select e.id
    from public.notification_webhook_events e
    where e.status = 'pending'
    order by e.created_at asc
    limit p_limit
    for update skip locked
  )
  update public.notification_webhook_events e
  set status = 'processing'
  from claimed
  where e.id = claimed.id
  returning
    e.id,
    e.provider,
    e.account_email,
    e.subscription_id,
    e.history_id,
    e.resource_data,
    e.change_type,
    e.source_type;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."claim_pending_webhook_events_for_handle"("p_handle" "text", "p_limit" integer DEFAULT 10) RETURNS TABLE("id" bigint, "provider" "text", "account_email" "text", "subscription_id" "uuid", "history_id" "text", "resource_data" "jsonb", "change_type" "text", "source_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with claimed as (
    select e.id
    from public.notification_webhook_events e
    join public.notification_webhook_subscriptions s
      on s.id = e.subscription_id
    where e.status = 'pending'
      and s.handle = p_handle
    order by e.created_at asc
    limit p_limit
    for update of e skip locked
  )
  update public.notification_webhook_events e
  set status = 'processing'
  from claimed
  where e.id = claimed.id
  returning
    e.id,
    e.provider,
    e.account_email,
    e.subscription_id,
    e.history_id,
    e.resource_data,
    e.change_type,
    e.source_type;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."claim_user_automation"("p_automation_id" "uuid", "p_expected_next_run_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
declare
  v_config jsonb;
  v_type text;
  v_active boolean;
  v_current_next timestamptz;
  v_tz text;
  v_time text;
  v_day text;
  v_frequency text;
  v_next timestamptz;
  v_hour int;
  v_minute int;
begin
  select config, automation_type, active, next_run_at
    into v_config, v_type, v_active, v_current_next
  from public.user_automations
  where id = p_automation_id
  for update;

  if not found then
    return false;
  end if;

  if not v_active
    or v_current_next is null
    or v_current_next > now()
    or v_current_next is distinct from p_expected_next_run_at then
    return false;
  end if;

  v_tz := coalesce(v_config->>'timezone', 'Australia/Sydney');
  v_time := v_config->>'time';
  v_day := v_config->>'day';
  v_frequency := coalesce(v_config->>'frequency', 'daily');

  if v_frequency = 'one_shot' then
    update public.user_automations
    set last_run_at = now(),
        next_run_at = null,
        active = false,
        updated_at = now()
    where id = p_automation_id;
    return true;
  end if;

  if v_time is not null then
    v_hour := split_part(v_time, ':', 1)::int;
    v_minute := split_part(v_time, ':', 2)::int;
  else
    v_hour := 8;
    v_minute := 0;
  end if;

  if v_frequency = 'minutely' then
    v_next := now() + interval '1 minute';
  elsif v_frequency = 'weekly' or v_day is not null then
    v_next := v_current_next + interval '7 days';
  elsif v_frequency = 'weekday' then
    v_next := v_current_next + interval '1 day';
    while extract(dow from v_next) in (0, 6) loop
      v_next := v_next + interval '1 day';
    end loop;
  elsif v_frequency = 'hourly' then
    v_next := now() + interval '1 hour';
  else
    v_next := v_current_next + interval '1 day';
  end if;

  while v_next <= now() loop
    if v_frequency = 'minutely' then
      v_next := v_next + interval '1 minute';
    elsif v_frequency = 'weekly' or v_day is not null then
      v_next := v_next + interval '7 days';
    elsif v_frequency = 'weekday' then
      v_next := v_next + interval '1 day';
      while extract(dow from v_next) in (0, 6) loop
        v_next := v_next + interval '1 day';
      end loop;
    elsif v_frequency = 'hourly' then
      v_next := v_next + interval '1 hour';
    else
      v_next := v_next + interval '1 day';
    end if;
  end loop;

  update public.user_automations
  set last_run_at = now(),
      next_run_at = v_next,
      updated_at = now()
  where id = p_automation_id;

  return true;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."cleanup_message_buffer"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM message_buffer
  WHERE claimed_at IS NOT NULL
    AND claimed_at < NOW() - INTERVAL '1 hour';
$$;
CREATE OR REPLACE FUNCTION "public"."clear_conversation_history"("p_chat_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.conversation_messages where chat_id = p_chat_id;
  delete from public.conversations where chat_id = p_chat_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."complete_customer_automation_send"("p_handle" "text", "p_rule_key" "text", "p_success" boolean, "p_reason" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_automation_run_id" bigint DEFAULT NULL::bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.customer_automation_rule_state
  set
    last_evaluated_at = now(),
    last_outcome = case when p_success then 'sent' else 'error' end,
    last_reason = p_reason,
    last_metadata = coalesce(public.customer_automation_rule_state.last_metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
    send_in_progress_at = null,
    last_sent_at = case when p_success then now() else public.customer_automation_rule_state.last_sent_at end,
    sent_count = case when p_success then greatest(public.customer_automation_rule_state.sent_count, 1) else public.customer_automation_rule_state.sent_count end,
    last_automation_run_id = case
      when p_success and p_automation_run_id is not null then p_automation_run_id
      else public.customer_automation_rule_state.last_automation_run_id
    end,
    updated_at = now()
  where handle = p_handle
    and rule_key = p_rule_key;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."complete_webhook_event"("p_id" bigint, "p_status" "text" DEFAULT 'completed'::"text", "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.notification_webhook_events
  set status = p_status,
      processed_at = now(),
      error = p_error
  where id = p_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."composio_advance_automation"("p_automation_id" "uuid", "p_success" boolean DEFAULT true, "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_spec     jsonb;
  v_status   text;
  v_freq     text;
  v_next     timestamptz;
  v_failures integer;
begin
  select spec, status, consecutive_failures
  into v_spec, v_status, v_failures
  from public.composio_automations
  where id = p_automation_id;

  if not found then return; end if;

  v_freq := v_spec->'trigger'->'schedule'->>'frequency';

  if v_spec->>'trigger_kind' = 'schedule' then
    if v_freq = 'minutely' then
      v_next := now() + interval '1 minute';
    elsif v_freq = 'hourly' then
      v_next := now() + interval '1 hour';
    elsif v_freq = 'weekly' then
      v_next := coalesce(
        (select next_run_at + interval '7 days' from public.composio_automations where id = p_automation_id),
        now() + interval '7 days'
      );
    elsif v_freq = 'monthly' then
      v_next := coalesce(
        (select next_run_at + interval '1 month' from public.composio_automations where id = p_automation_id),
        now() + interval '1 month'
      );
    else
      v_next := coalesce(
        (select next_run_at + interval '1 day' from public.composio_automations where id = p_automation_id),
        now() + interval '1 day'
      );
    end if;

    while v_next is not null and v_next <= now() loop
      if v_freq = 'minutely' then
        v_next := v_next + interval '1 minute';
      elsif v_freq = 'hourly' then
        v_next := v_next + interval '1 hour';
      elsif v_freq = 'weekly' then
        v_next := v_next + interval '7 days';
      elsif v_freq = 'monthly' then
        v_next := v_next + interval '1 month';
      else
        v_next := v_next + interval '1 day';
      end if;
    end loop;
  end if;

  if not p_success then
    v_failures := coalesce(v_failures, 0) + 1;
    if v_failures >= 3 then
      v_status := 'error';
    end if;
  else
    v_failures := 0;
  end if;

  update public.composio_automations
  set last_run_at          = now(),
      next_run_at          = case
        when v_spec->>'trigger_kind' = 'schedule' then v_next
        else next_run_at
      end,
      execution_lock       = null,
      execution_lock_at    = null,
      consecutive_failures = v_failures,
      last_error           = p_error,
      status               = case
        when v_status = 'error' then 'error'
        else status
      end,
      updated_at           = now()
  where id = p_automation_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."composio_claim_due_automations"("p_limit" integer DEFAULT 50) RETURNS TABLE("automation_id" "uuid", "user_id" "uuid", "handle" "text", "spec" "jsonb", "trust_state" "jsonb", "risk_level" "text", "next_run_at" timestamp with time zone, "consecutive_failures" integer)
    LANGUAGE "plpgsql"
    AS $$
declare
  v_lock uuid := gen_random_uuid();
begin
  return query
  with claimed as (
    select ca.id
    from public.composio_automations ca
    where ca.status = 'active'
      and ca.next_run_at is not null
      and ca.next_run_at <= now()
      and (
        ca.execution_lock is null
        or ca.execution_lock_at < now() - interval '5 minutes'
      )
    order by ca.next_run_at asc
    limit p_limit
    for update skip locked
  )
  update public.composio_automations ca
  set execution_lock = v_lock,
      execution_lock_at = now()
  from claimed
  where ca.id = claimed.id
  returning ca.id, ca.user_id, ca.handle, ca.spec, ca.trust_state,
            ca.risk_level, ca.next_run_at, ca.consecutive_failures;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."composio_record_webhook_event"("p_composio_trigger_id" "text", "p_composio_event_id" "text", "p_payload_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into public.composio_webhook_events (
    composio_trigger_id, composio_event_id, payload_hash
  ) values (
    p_composio_trigger_id, p_composio_event_id, p_payload_hash
  )
  on conflict (composio_trigger_id, composio_event_id) do nothing;

  return found;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."composio_release_lock"("p_automation_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update public.composio_automations
  set execution_lock = null,
      execution_lock_at = null
  where id = p_automation_id;
$$;
CREATE OR REPLACE FUNCTION "public"."composio_set_trust_auto_approve"("p_automation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_existing jsonb;
  v_count    integer;
  v_last     text;
begin
  select trust_state into v_existing
  from public.composio_automations
  where id = p_automation_id;

  if not found then return; end if;

  v_count := coalesce((v_existing->>'confirmed_run_count')::integer, 0);
  v_last := v_existing->>'last_confirmed_at';

  update public.composio_automations
  set trust_state = jsonb_build_object(
        'auto_approve', true,
        'confirmed_run_count', v_count,
        'last_confirmed_at', coalesce(v_last, now()::text)
      ),
      updated_at = now()
  where id = p_automation_id;
end;
$$;
COMMENT ON FUNCTION "public"."composio_set_trust_auto_approve"("p_automation_id" "uuid") IS 'Flip auto_approve=true on a Composio automation, preserving existing trust counters.';
CREATE OR REPLACE FUNCTION "public"."configure_automation_engine_cron"("p_project_url" "text", "p_bearer_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
begin
  begin perform cron.unschedule('proactive-orchestrator'); exception when others then null; end;
  begin perform cron.unschedule('automation-engine'); exception when others then null; end;
  begin perform cron.unschedule('moment-engine'); exception when others then null; end;

  perform cron.schedule(
    'moment-engine',
    '* * * * *',
    $cmd$
    select net.http_post(
      url := rtrim((select supabase_url from public.nest_pg_net_edge_settings where id = 1), '/') || '/functions/v1/moment-engine',
      headers := jsonb_build_object(
        'x-internal-secret', (select internal_shared_secret from public.nest_pg_net_edge_settings where id = 1),
        'Content-Type', 'application/json'
      ),
      body := '{"limit":50}'::jsonb
    );
    $cmd$
  );
exception
  when others then
    raise notice 'Cron configuration skipped (pg_cron may not be available): %', sqlerrm;
end;
$_$;
COMMENT ON FUNCTION "public"."configure_automation_engine_cron"("p_project_url" "text", "p_bearer_token" "text") IS 'Unschedules legacy automation/proactive jobs; schedules moment-engine via nest_pg_net + x-internal-secret. URL/token args ignored.';
CREATE OR REPLACE FUNCTION "public"."configure_email_webhook_cron"("p_project_url" "text", "p_bearer_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
declare
  v_process_job_id bigint;
  v_renew_job_id bigint;
begin
  begin perform cron.unschedule('process-email-webhooks'); exception when others then null; end;
  begin perform cron.unschedule('renew-email-webhooks'); exception when others then null; end;

  select cron.schedule(
    'process-email-webhooks',
    '* * * * *',
    $cmd$
    select net.http_post(
      url := rtrim((select supabase_url from public.nest_pg_net_edge_settings where id = 1), '/') || '/functions/v1/email-webhook-cron',
      headers := jsonb_build_object(
        'x-internal-secret', (select internal_shared_secret from public.nest_pg_net_edge_settings where id = 1),
        'Content-Type', 'application/json'
      ),
      body := '{"mode":"process"}'::jsonb
    );
    $cmd$
  ) into v_process_job_id;

  select cron.schedule(
    'renew-email-webhooks',
    '0 */6 * * *',
    $cmd$
    select net.http_post(
      url := rtrim((select supabase_url from public.nest_pg_net_edge_settings where id = 1), '/') || '/functions/v1/email-webhook-cron',
      headers := jsonb_build_object(
        'x-internal-secret', (select internal_shared_secret from public.nest_pg_net_edge_settings where id = 1),
        'Content-Type', 'application/json'
      ),
      body := '{"mode":"renew"}'::jsonb
    );
    $cmd$
  ) into v_renew_job_id;

  return jsonb_build_object('process_job_id', v_process_job_id, 'renew_job_id', v_renew_job_id);
end;
$_$;
COMMENT ON FUNCTION "public"."configure_email_webhook_cron"("p_project_url" "text", "p_bearer_token" "text") IS 'Schedules email-webhook-cron via nest_pg_net_edge_settings + x-internal-secret. URL/token args ignored.';
CREATE OR REPLACE FUNCTION "public"."configure_entity_cron_jobs"("p_project_url" "text", "p_bearer_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
begin
  begin
    perform cron.unschedule('consolidate-entities');
  exception
    when others then null;
  end;

  perform cron.schedule(
    'consolidate-entities',
    '*/5 * * * *',
    format(
      $schedule$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body := '{"batchSize":25}'::jsonb
      ) as request_id;
      $schedule$,
      rtrim(p_project_url, '/') || '/functions/v1/consolidate-entities',
      p_bearer_token
    )
  );
end;
$_$;
CREATE OR REPLACE FUNCTION "public"."configure_inbound_queue_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text" DEFAULT '* * * * *'::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
declare
  v_job_id bigint;
begin
  begin
    perform cron.unschedule('drain-inbound-events');
  exception when others then null;
  end;

  select cron.schedule(
    'drain-inbound-events',
    p_schedule,
    $cmd$
    select net.http_post(
      url := rtrim((select supabase_url from public.nest_pg_net_edge_settings where id = 1), '/') || '/functions/v1/process-inbound-queue',
      headers := jsonb_build_object(
        'x-internal-secret', (select internal_shared_secret from public.nest_pg_net_edge_settings where id = 1),
        'Content-Type', 'application/json'
      ),
      body := '{"batchSize":3}'::jsonb
    );
    $cmd$
  ) into v_job_id;
  return v_job_id;
end;
$_$;
COMMENT ON FUNCTION "public"."configure_inbound_queue_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text") IS 'Schedules process-inbound-queue via nest_pg_net_edge_settings + x-internal-secret. URL/token args ignored.';
CREATE OR REPLACE FUNCTION "public"."configure_keep_warm_cron"("p_project_url" "text", "p_service_role_key" "text", "p_schedule" "text" DEFAULT '* * * * *'::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
declare
  v_job_id bigint;
begin
  begin perform cron.unschedule('keep-warm-webhook'); exception when others then null; end;

  select cron.schedule(
    'keep-warm-webhook',
    p_schedule,
    $cmd$
    select net.http_post(
      url := rtrim((select supabase_url from public.nest_pg_net_edge_settings where id = 1), '/') || '/functions/v1/linq-webhook',
      headers := jsonb_build_object(
        'x-internal-secret', (select internal_shared_secret from public.nest_pg_net_edge_settings where id = 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cmd$
  ) into v_job_id;

  return v_job_id;
end;
$_$;
COMMENT ON FUNCTION "public"."configure_keep_warm_cron"("p_project_url" "text", "p_service_role_key" "text", "p_schedule" "text") IS 'Schedules keep-warm POST to linq-webhook (warm path returns 200 for empty JSON). URL/key args ignored.';
CREATE OR REPLACE FUNCTION "public"."configure_memory_cron_jobs"("p_project_url" "text", "p_bearer_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
begin
  begin perform cron.unschedule('summarise-idle-conversations'); exception when others then null; end;

  perform cron.schedule(
    'summarise-idle-conversations',
    '*/5 * * * *',
    $cmd$
    select net.http_post(
      url := rtrim((select supabase_url from public.nest_pg_net_edge_settings where id = 1), '/') || '/functions/v1/summarise-conversations',
      headers := jsonb_build_object(
        'x-internal-secret', (select internal_shared_secret from public.nest_pg_net_edge_settings where id = 1),
        'Content-Type', 'application/json'
      ),
      body := '{"batchSize":10}'::jsonb
    );
    $cmd$
  );

  begin perform cron.unschedule('expire-stale-memories'); exception when others then null; end;
  perform cron.schedule(
    'expire-stale-memories',
    '0 * * * *',
    $expire$select public.expire_stale_memory_items();$expire$
  );
end;
$_$;
COMMENT ON FUNCTION "public"."configure_memory_cron_jobs"("p_project_url" "text", "p_bearer_token" "text") IS 'Schedules summarise-conversations via nest_pg_net_edge_settings + x-internal-secret. URL/token args ignored.';
CREATE OR REPLACE FUNCTION "public"."configure_moment_engine_cron"("p_project_url" "text", "p_bearer_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
begin
  begin perform cron.unschedule('automation-engine'); exception when others then null; end;
  begin perform cron.unschedule('moment-engine'); exception when others then null; end;

  perform cron.schedule(
    'moment-engine',
    '* * * * *',
    $cmd$
    select net.http_post(
      url := rtrim((select supabase_url from public.nest_pg_net_edge_settings where id = 1), '/') || '/functions/v1/moment-engine',
      headers := jsonb_build_object(
        'x-internal-secret', (select internal_shared_secret from public.nest_pg_net_edge_settings where id = 1),
        'Content-Type', 'application/json'
      ),
      body := '{"limit":50}'::jsonb
    );
    $cmd$
  );
exception
  when others then
    raise notice 'Cron configuration skipped (pg_cron may not be available): %', sqlerrm;
end;
$_$;
COMMENT ON FUNCTION "public"."configure_moment_engine_cron"("p_project_url" "text", "p_bearer_token" "text") IS 'Schedules moment-engine via nest_pg_net_edge_settings + x-internal-secret. URL/token args ignored.';
CREATE OR REPLACE FUNCTION "public"."configure_pipedream_automation_cron"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
declare
  v_url    text;
  v_secret text;
begin
  -- Pull canonical settings from the edge-settings row populated at the
  -- same time the other crons were configured. If the row is missing,
  -- fail loudly — silently no-oping would leave the user thinking the
  -- cron was registered when it wasn't.
  select supabase_url, internal_shared_secret
    into v_url, v_secret
    from public.nest_pg_net_edge_settings
   where id = 1;

  if v_url is null or v_secret is null then
    raise exception 'nest_pg_net_edge_settings row 1 is missing supabase_url or internal_shared_secret. Configure that row first.';
  end if;

  begin perform cron.unschedule('pipedream-automation-cron'); exception when others then null; end;

  perform cron.schedule(
    'pipedream-automation-cron',
    '* * * * *',
    format($schedule$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'x-internal-secret', %L,
          'Content-Type', 'application/json'
        ),
        body := '{"limit":50}'::jsonb
      ) as request_id;
    $schedule$,
      rtrim(v_url, '/') || '/functions/v1/pipedream-automation-cron',
      v_secret
    )
  );

  begin perform cron.unschedule('pipedream-expire-approvals'); exception when others then null; end;

  perform cron.schedule(
    'pipedream-expire-approvals',
    '*/15 * * * *',
    $expire$
      update public.pipedream_pending_approvals
      set status = 'expired', resolved_at = now()
      where status = 'awaiting_confirmation'
        and expires_at < now();
    $expire$
  );

exception
  when undefined_function then
    raise notice 'pg_cron extension not present; pipedream cron registration skipped.';
  when others then
    raise notice 'pipedream cron registration failed: %', sqlerrm;
end;
$_$;
COMMENT ON FUNCTION "public"."configure_pipedream_automation_cron"() IS 'Idempotently (re)installs pipedream-automation-cron (every minute) and pipedream-expire-approvals (every 15 minutes). Reads URL + internal secret from nest_pg_net_edge_settings.';
CREATE OR REPLACE FUNCTION "public"."configure_proactive_cron"("p_project_url" "text", "p_bearer_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $$
begin
  begin perform cron.unschedule('proactive-orchestrator'); exception when others then null; end;
  raise notice 'proactive-orchestrator superseded by moment-engine; URL/token args ignored.';
end;
$$;
COMMENT ON FUNCTION "public"."configure_proactive_cron"("p_project_url" "text", "p_bearer_token" "text") IS 'Unschedules proactive-orchestrator only (superseded by moment-engine). URL/token args ignored.';
CREATE OR REPLACE FUNCTION "public"."configure_reminders_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text" DEFAULT '* * * * *'::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron', 'net'
    AS $_$
declare
  v_job_id bigint;
begin
  begin
    perform cron.unschedule('fire-reminders');
  exception when others then null;
  end;

  select cron.schedule(
    'fire-reminders',
    p_schedule,
    $cmd$
    select net.http_post(
      url := rtrim((select supabase_url from public.nest_pg_net_edge_settings where id = 1), '/') || '/functions/v1/reminder-cron',
      headers := jsonb_build_object(
        'x-internal-secret', (select internal_shared_secret from public.nest_pg_net_edge_settings where id = 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cmd$
  ) into v_job_id;
  return v_job_id;
end;
$_$;
COMMENT ON FUNCTION "public"."configure_reminders_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text") IS 'Schedules reminder-cron via nest_pg_net_edge_settings + x-internal-secret. URL/token args ignored.';
CREATE OR REPLACE FUNCTION "public"."confirm_memory_item"("p_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.memory_items
    set last_confirmed_at = now(),
        last_seen_at = now(),
        updated_at = now()
    where id = p_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."consume_edge_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_limit" integer) RETURNS TABLE("allowed" boolean, "current_count" integer, "resets_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_window_seconds integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_limit integer := greatest(coalesce(p_limit, 1), 1);
  v_bucket_start timestamptz;
  v_count integer;
begin
  v_bucket_start :=
    to_timestamp(
      floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds
    );

  delete from public.edge_request_rate_limits
  where updated_at < now() - interval '1 day';

  insert into public.edge_request_rate_limits (bucket_key, bucket_start, hit_count, updated_at)
  values (p_bucket_key, v_bucket_start, 1, now())
  on conflict (bucket_key, bucket_start)
  do update set
    hit_count = public.edge_request_rate_limits.hit_count + 1,
    updated_at = now()
  returning hit_count into v_count;

  return query
  select
    v_count <= v_limit,
    v_count,
    v_bucket_start + make_interval(secs => v_window_seconds);
end;
$$;
CREATE TABLE IF NOT EXISTS "full_review"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "current_stage" "text",
    "current_chunk_id" "uuid",
    "total_chunks_estimated" integer,
    "total_chunks_completed" integer DEFAULT 0 NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "last_heartbeat_at" timestamp with time zone,
    "total_cost_usd" numeric(10,4) DEFAULT 0 NOT NULL,
    "budget_cap_usd" numeric(10,4) DEFAULT 30 NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "jsonb",
    "output_summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'paused'::"text", 'complete'::"text", 'failed'::"text"])))
);
CREATE OR REPLACE FUNCTION "public"."create_full_review_job"("p_user_id" "uuid" DEFAULT NULL::"uuid", "p_handle" "text" DEFAULT NULL::"text", "p_config" "jsonb" DEFAULT '{}'::"jsonb", "p_budget_cap_usd" numeric DEFAULT 30) RETURNS "full_review"."jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'full_review', 'public', 'pg_catalog'
    AS $$
declare
  v_user_id uuid;
  v_job full_review.jobs;
begin
  if p_user_id is not null then
    v_user_id := p_user_id;
  elsif p_handle is not null then
    select auth_user_id into v_user_id
    from public.user_profiles
    where handle = p_handle;
    if v_user_id is null then
      raise exception 'no user_profile for handle %', p_handle;
    end if;
  else
    raise exception 'user_id or handle required';
  end if;

  insert into full_review.jobs (user_id, status, config, budget_cap_usd)
  values (v_user_id, 'queued', coalesce(p_config, '{}'::jsonb), p_budget_cap_usd)
  returning * into v_job;

  return v_job;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."delete_email_watch_trigger"("p_id" bigint, "p_handle" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.delete_notification_watch_trigger(p_id, p_handle);
$$;
CREATE OR REPLACE FUNCTION "public"."delete_notification_watch_trigger"("p_id" bigint, "p_handle" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.notification_watch_triggers
  set active = false, updated_at = now()
  where id = p_id and handle = p_handle and active = true;

  return found;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."delete_queue_message"("p_queue_name" "text", "p_message_id" bigint) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
  select pgmq.delete(p_queue_name, p_message_id);
$$;
CREATE OR REPLACE FUNCTION "public"."delete_reminder"("p_id" bigint, "p_handle" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.reminders
  set active = false, updated_at = now()
  where id = p_id and handle = p_handle and active = true;

  return found;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."edit_reminder"("p_id" bigint, "p_handle" "text", "p_action_description" "text" DEFAULT NULL::"text", "p_cron_expression" "text" DEFAULT NULL::"text", "p_next_fire_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_repeating" boolean DEFAULT NULL::boolean, "p_active" boolean DEFAULT NULL::boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.reminders
  set
    action_description = coalesce(p_action_description, action_description),
    cron_expression = coalesce(p_cron_expression, cron_expression),
    next_fire_at = coalesce(p_next_fire_at, next_fire_at),
    repeating = coalesce(p_repeating, repeating),
    active = coalesce(p_active, active),
    updated_at = now()
  where id = p_id and handle = p_handle;

  return found;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."emit_onboarding_event"("p_handle" "text", "p_chat_id" "text", "p_event_type" "text", "p_message_turn_index" integer DEFAULT NULL::integer, "p_entry_state" "text" DEFAULT NULL::"text", "p_value_wedge" "text" DEFAULT NULL::"text", "p_current_state" "text" DEFAULT NULL::"text", "p_experiment_variant_ids" "jsonb" DEFAULT '[]'::"jsonb", "p_confidence_scores" "jsonb" DEFAULT NULL::"jsonb", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.onboarding_events (
    handle, chat_id, event_type, message_turn_index,
    entry_state, value_wedge, current_state,
    experiment_variant_ids, confidence_scores, payload
  )
  values (
    p_handle, p_chat_id, p_event_type, p_message_turn_index,
    p_entry_state, p_value_wedge, p_current_state,
    coalesce(p_experiment_variant_ids, '[]'::jsonb),
    p_confidence_scores,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."enqueue_webhook_event"("p_provider" "text", "p_provider_message_id" "text", "p_chat_id" "text", "p_sender_handle" "text", "p_bot_number" "text", "p_raw_payload" "jsonb", "p_normalized_payload" "jsonb") RETURNS TABLE("event_id" bigint, "created" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
declare
  v_event_id bigint;
begin
  select id
    into v_event_id
  from public.webhook_events
  where provider = p_provider
    and provider_message_id = p_provider_message_id;

  if v_event_id is not null then
    return query select v_event_id, false;
    return;
  end if;

  insert into public.webhook_events (
    provider,
    provider_message_id,
    chat_id,
    sender_handle,
    bot_number,
    raw_payload,
    normalized_payload
  )
  values (
    p_provider,
    p_provider_message_id,
    p_chat_id,
    p_sender_handle,
    p_bot_number,
    p_raw_payload,
    p_normalized_payload
  )
  returning id into v_event_id;

  perform * from pgmq.send(
    'inbound_events',
    jsonb_build_object(
      'event_id', v_event_id,
      'provider', p_provider,
      'provider_message_id', p_provider_message_id
    ),
    0
  );

  return query select v_event_id, true;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."ensure_nest_user"("p_handle" "text", "p_bot_number" "text") RETURNS TABLE("out_handle" "text", "out_name" "text", "out_status" "text", "out_onboarding_token" "uuid", "out_onboard_messages" "jsonb", "out_onboard_count" integer, "out_bot_number" "text", "out_pdl_profile" "jsonb", "out_auth_user_id" "uuid", "out_onboard_state" "text", "out_entry_state" "text", "out_first_value_wedge" "text", "out_first_value_delivered_at" timestamp with time zone, "out_second_engagement_at" timestamp with time zone, "out_checkin_opt_in" boolean, "out_activation_score" integer, "out_capability_categories_used" "text"[], "out_last_proactive_sent_at" timestamp with time zone, "out_last_proactive_ignored" boolean, "out_proactive_ignore_count" integer, "out_recovery_nudge_sent_at" timestamp with time zone, "out_timezone" "text", "out_first_seen" bigint, "out_last_seen" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now bigint := extract(epoch from now())::bigint;
begin
  insert into public.user_profiles (handle, first_seen, last_seen, bot_number)
  values (p_handle, v_now, v_now, p_bot_number)
  on conflict (handle) do update
    set last_seen = v_now,
        bot_number = coalesce(user_profiles.bot_number, excluded.bot_number);

  return query
    select up.handle, up.name, up.status,
           up.onboarding_token, up.onboard_messages,
           up.onboard_count, up.bot_number, up.pdl_profile,
           up.auth_user_id,
           up.onboard_state, up.entry_state,
           up.first_value_wedge, up.first_value_delivered_at,
           up.second_engagement_at, up.checkin_opt_in,
           up.activation_score, up.capability_categories_used,
           up.last_proactive_sent_at, up.last_proactive_ignored,
           up.proactive_ignore_count, up.recovery_nudge_sent_at,
           up.timezone,
           up.first_seen, up.last_seen
    from public.user_profiles up
    where up.handle = p_handle;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."expire_stale_memory_items"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  update public.memory_items
    set status = 'expired',
        updated_at = now()
    where status = 'active'
      and expiry_at is not null
      and expiry_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."expire_temporal_memory_items"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rec record;
  v_updated integer := 0;
  v_row_count integer := 0;
  v_timezone text;
  v_anchor_local timestamp;
  v_candidate_expiry timestamptz;
  v_weekday_match text[];
  v_iso_match text[];
  v_month_match text[];
  v_target_weekday integer;
  v_current_weekday integer;
  v_base_delta integer;
  v_month integer;
  v_day integer;
  v_year integer;
begin
  for rec in
    select
      mi.id,
      mi.value_text,
      mi.expiry_at,
      coalesce(mi.first_seen_at, mi.created_at, now()) as anchor_at,
      coalesce(nullif(trim(up.timezone), ''), 'Australia/Melbourne') as timezone
    from public.memory_items mi
    left join public.user_profiles up on up.handle = mi.handle
    where mi.status = 'active'
      and mi.memory_type in ('plan', 'task_commitment', 'emotional_context', 'contextual_note')
  loop
    v_candidate_expiry := null;
    v_timezone := rec.timezone;

    begin
      v_anchor_local := rec.anchor_at at time zone v_timezone;
    exception
      when others then
        v_timezone := 'Australia/Melbourne';
        v_anchor_local := rec.anchor_at at time zone v_timezone;
    end;

    if rec.value_text ~* '\m(today|tonight|later today|this morning|this afternoon|this evening)\M' then
      v_candidate_expiry := (
        (date_trunc('day', v_anchor_local) + interval '1 day' - interval '1 second')
        at time zone v_timezone
      );
    elsif rec.value_text ~* '\m(tomorrow|tomorrow morning|tomorrow afternoon|tomorrow evening|tomorrow night)\M' then
      v_candidate_expiry := (
        (date_trunc('day', v_anchor_local) + interval '2 day' - interval '1 second')
        at time zone v_timezone
      );
    else
      v_weekday_match := regexp_match(
        lower(rec.value_text),
        '\m(this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\M'
      );

      if v_weekday_match is not null then
        v_target_weekday := case v_weekday_match[2]
          when 'sunday' then 0
          when 'monday' then 1
          when 'tuesday' then 2
          when 'wednesday' then 3
          when 'thursday' then 4
          when 'friday' then 5
          when 'saturday' then 6
          else null
        end;
        v_current_weekday := extract(dow from v_anchor_local)::integer;
        v_base_delta := mod(v_target_weekday - v_current_weekday + 7, 7);

        if v_weekday_match[1] = 'next' then
          v_base_delta := case
            when v_base_delta = 0 then 7
            else v_base_delta + 7
          end;
        end if;

        v_candidate_expiry := (
          (date_trunc('day', v_anchor_local) + make_interval(days => v_base_delta + 1) - interval '1 second')
          at time zone v_timezone
        );
      end if;
    end if;

    if v_candidate_expiry is null then
      v_iso_match := regexp_match(rec.value_text, '\m([0-9]{4}-[0-9]{2}-[0-9]{2})\M');
      if v_iso_match is not null then
        v_candidate_expiry := (
          ((to_date(v_iso_match[1], 'YYYY-MM-DD')::timestamp) + interval '1 day' - interval '1 second')
          at time zone v_timezone
        );
      end if;
    end if;

    if v_candidate_expiry is null then
      v_month_match := regexp_match(
        lower(rec.value_text),
        '\m(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+([0-9]{1,2})(st|nd|rd|th)?(,\s*([0-9]{4}))?\M'
      );

      if v_month_match is not null then
        v_month := case v_month_match[1]
          when 'january' then 1
          when 'jan' then 1
          when 'february' then 2
          when 'feb' then 2
          when 'march' then 3
          when 'mar' then 3
          when 'april' then 4
          when 'apr' then 4
          when 'may' then 5
          when 'june' then 6
          when 'jun' then 6
          when 'july' then 7
          when 'jul' then 7
          when 'august' then 8
          when 'aug' then 8
          when 'september' then 9
          when 'sep' then 9
          when 'sept' then 9
          when 'october' then 10
          when 'oct' then 10
          when 'november' then 11
          when 'nov' then 11
          when 'december' then 12
          when 'dec' then 12
          else null
        end;
        v_day := v_month_match[2]::integer;
        v_year := coalesce(nullif(v_month_match[5], ''), extract(year from v_anchor_local)::text)::integer;

        begin
          v_candidate_expiry := (
            ((make_date(v_year, v_month, v_day)::timestamp) + interval '1 day' - interval '1 second')
            at time zone v_timezone
          );
        exception
          when others then
            v_candidate_expiry := null;
        end;
      end if;
    end if;

    if v_candidate_expiry is null
      and rec.value_text ~* '\m(at|from)\s+[0-9]{1,2}(:[0-9]{2})?\s*(am|pm)\M|\m[0-9]{1,2}(:[0-9]{2})?\s*(am|pm)\M'
      and rec.value_text !~* '\m(today|tonight|later today|this morning|this afternoon|this evening|tomorrow|tomorrow morning|tomorrow afternoon|tomorrow evening|tomorrow night)\M'
      and rec.value_text !~* '\m(this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\M'
      and rec.value_text !~* '\m[0-9]{4}-[0-9]{2}-[0-9]{2}\M'
      and rec.value_text !~* '\m(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+[0-9]{1,2}\M'
    then
      v_candidate_expiry := (
        (date_trunc('day', v_anchor_local) + interval '1 day' - interval '1 second')
        at time zone v_timezone
      );
    end if;

    if v_candidate_expiry is not null then
      update public.memory_items
         set expiry_at = least(coalesce(expiry_at, 'infinity'::timestamptz), v_candidate_expiry),
             updated_at = now()
       where id = rec.id
         and (expiry_at is null or v_candidate_expiry < expiry_at);

      get diagnostics v_row_count = row_count;
      v_updated := v_updated + v_row_count;
    end if;
  end loop;

  return v_updated;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."fin_describe_fiskil_transactions"() RETURNS TABLE("column_name" "text", "data_type" "text", "is_nullable" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    column_name::text,
    data_type::text,
    is_nullable::text
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'fiskil_transactions'
  order by ordinal_position;
$$;
CREATE OR REPLACE FUNCTION "public"."fin_describe_live_fiskil"() RETURNS TABLE("column_name" "text", "data_type" "text", "is_nullable" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    column_name::text,
    data_type::text,
    is_nullable::text
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'live_fiskil'
    and column_name not in ('id', 'created_at', 'quid_user_id', 'fiskil_connection_id', 'raw')
  order by ordinal_position;
$$;
CREATE OR REPLACE FUNCTION "public"."fin_run_select"("p_sql" "text", "p_max_rows" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_clean text;
  v_lower text;
  v_final text;
  v_result jsonb;
  v_limit int;
begin
  if p_sql is null or btrim(p_sql) = '' then
    raise exception 'SQL is required';
  end if;

  v_clean := btrim(regexp_replace(p_sql, ';\s*$', ''));
  v_lower := lower(v_clean);

  if position(';' in v_clean) > 0 then
    raise exception 'Multiple statements are not allowed';
  end if;

  if v_lower !~ '^\s*(with|select)\y' then
    raise exception 'Only SELECT statements are allowed';
  end if;

  if v_lower ~ '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|comment|vacuum|analyze|merge|call|reindex|cluster|listen|notify|lock)\y' then
    raise exception 'Statement contains a forbidden keyword';
  end if;

  if v_lower ~ '\yset\s+role\y' or v_lower ~ '\yreset\s+role\y' then
    raise exception 'Role changes are not allowed';
  end if;

  if v_lower !~ '\yfiskil_transactions\y' then
    raise exception 'Query must reference fiskil_transactions';
  end if;

  v_limit := greatest(1, least(coalesce(p_max_rows, 200), 500));

  if v_lower ~ '\ylimit\s+\d+' then
    v_final := v_clean;
  else
    v_final := v_clean || ' limit ' || v_limit::text;
  end if;

  set local statement_timeout = '5s';

  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || v_final || ') t'
  into v_result;

  return v_result;
end;
$_$;
CREATE OR REPLACE FUNCTION "public"."fin_run_select_live"("p_sql" "text", "p_user_id" "uuid", "p_max_rows" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_clean text;
  v_lower text;
  v_final text;
  v_result jsonb;
  v_limit int;
begin
  if p_sql is null or btrim(p_sql) = '' then
    raise exception 'SQL is required';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  v_clean := btrim(regexp_replace(p_sql, ';\s*$', ''));
  v_lower := lower(v_clean);

  if position(';' in v_clean) > 0 then
    raise exception 'Multiple statements are not allowed';
  end if;

  -- \y is PostgreSQL's word-boundary; \b is the backspace character.
  if v_lower !~ '^\s*(with|select)\y' then
    raise exception 'Only SELECT statements are allowed';
  end if;

  if v_lower ~ '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|comment|vacuum|analyze|merge|call|do|reindex|cluster|listen|notify|lock|set\s+role|reset\s+role)\y' then
    raise exception 'Statement contains a forbidden keyword';
  end if;

  if v_lower !~ '\y(live_fiskil|fiskil_accounts)\y' then
    raise exception 'Query must reference live_fiskil or fiskil_accounts';
  end if;

  v_limit := greatest(1, least(coalesce(p_max_rows, 200), 500));

  if v_lower ~ '\ylimit\s+\d+' then
    v_final := v_clean;
  else
    v_final := v_clean || ' limit ' || v_limit::text;
  end if;

  perform set_config('row_security', 'on', true);
  perform set_config('app.current_quid_user_id', p_user_id::text, true);
  perform set_config('statement_timeout', '5000', true);

  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || v_final || ') t'
  into v_result;

  return v_result;
end;
$_$;
CREATE OR REPLACE FUNCTION "public"."find_entities_by_names"("p_handle" "text", "p_names" "text"[]) RETURNS TABLE("id" bigint, "handle" "text", "entity_type" "text", "canonical_name" "text", "aliases" "text"[], "compiled_truth" "text", "is_core" boolean, "importance_score" numeric, "mention_count" integer, "status" "text", "metadata" "jsonb", "first_mentioned_at" timestamp with time zone, "last_mentioned_at" timestamp with time zone, "compiled_truth_updated_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with lowered as (
    select array(select lower(unnest(coalesce(p_names, '{}'::text[])))) as needles
  )
  select
    e.id, e.handle, e.entity_type, e.canonical_name, e.aliases,
    e.compiled_truth, e.is_core, e.importance_score, e.mention_count,
    e.status, e.metadata, e.first_mentioned_at, e.last_mentioned_at,
    e.compiled_truth_updated_at, e.created_at
  from public.entities e, lowered l
  where e.handle = p_handle
    and e.status = 'active'
    and (
      lower(e.canonical_name) = any(l.needles)
      or exists (
        select 1
        from unnest(e.aliases) a
        where lower(a) = any(l.needles)
      )
    )
  order by e.importance_score desc nulls last, e.last_mentioned_at desc;
$$;
CREATE OR REPLACE FUNCTION "public"."get_active_memory_items"("p_handle" "text", "p_limit" integer DEFAULT 30) RETURNS TABLE("id" bigint, "handle" "text", "chat_id" "text", "memory_type" "text", "category" "text", "value_text" "text", "normalized_value" "text", "confidence" numeric, "status" "text", "scope" "text", "source_kind" "text", "first_seen_at" timestamp with time zone, "last_seen_at" timestamp with time zone, "last_confirmed_at" timestamp with time zone, "expiry_at" timestamp with time zone, "metadata" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    mi.id, mi.handle, mi.chat_id, mi.memory_type, mi.category,
    mi.value_text, mi.normalized_value, mi.confidence, mi.status,
    mi.scope, mi.source_kind, mi.first_seen_at, mi.last_seen_at,
    mi.last_confirmed_at, mi.expiry_at, mi.metadata, mi.created_at
  from public.memory_items mi
  where mi.handle = p_handle
    and mi.status = 'active'
    and (mi.expiry_at is null or mi.expiry_at > now())
  order by mi.last_seen_at desc
  limit greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_active_triggers_for_handle"("p_handle" "text", "p_source_type" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "account_email" "text", "provider" "text", "name" "text", "description" "text", "trigger_type" "text", "match_sender" "text", "match_subject_pattern" "text", "match_labels" "text"[], "use_ai_matching" boolean, "ai_prompt" "text", "delivery_method" "text", "source_type" "text", "time_constraint" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    t.id, t.account_email, t.provider, t.name, t.description,
    t.trigger_type, t.match_sender, t.match_subject_pattern,
    t.match_labels, t.use_ai_matching, t.ai_prompt, t.delivery_method,
    t.source_type, t.time_constraint
  from public.notification_watch_triggers t
  where t.handle = p_handle
    and t.active = true
    and (p_source_type is null or t.source_type in (p_source_type, 'any'))
  order by t.created_at desc;
$$;
CREATE OR REPLACE FUNCTION "public"."get_all_entities_with_timeline"("p_limit" integer DEFAULT 200, "p_after_id" bigint DEFAULT 0) RETURNS TABLE("id" bigint, "handle" "text", "pending_event_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    e.id,
    e.handle,
    count(t.id) as pending_event_count
  from public.entities e
  join public.entity_timeline t on t.entity_id = e.id
  where e.status = 'active'
    and e.id > p_after_id
  group by e.id, e.handle
  order by e.id asc
  limit greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_all_users_with_automation_status"() RETURNS TABLE("handle" "text", "name" "text", "status" "text", "first_seen" bigint, "last_seen" bigint, "timezone" "text", "onboard_state" "text", "activation_score" integer, "bot_number" "text", "proactive_ignore_count" integer, "last_proactive_sent_at" timestamp with time zone, "auth_user_id" "uuid", "total_automations_sent" bigint, "last_automation_at" timestamp with time zone, "last_automation_type" "text", "automations_replied" bigint, "automations_ignored" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    up.handle,
    up.name,
    up.status,
    up.first_seen,
    up.last_seen,
    up.timezone,
    coalesce(up.onboard_state, 'new_user_unclassified'),
    coalesce(up.activation_score, 0),
    up.bot_number,
    coalesce(up.proactive_ignore_count, 0),
    up.last_proactive_sent_at,
    up.auth_user_id,
    coalesce(stats.total_sent, 0),
    stats.last_sent_at,
    stats.last_type,
    coalesce(stats.total_replied, 0),
    coalesce(stats.total_ignored, 0)
  from public.user_profiles up
  left join lateral (
    select
      count(*) as total_sent,
      max(ar.sent_at) as last_sent_at,
      (select ar2.automation_type from public.automation_runs ar2 where ar2.handle = up.handle order by ar2.sent_at desc limit 1) as last_type,
      count(*) filter (where ar.replied_at is not null) as total_replied,
      count(*) filter (where ar.ignored = true) as total_ignored
    from public.automation_runs ar
    where ar.handle = up.handle
  ) stats on true
  where up.status = 'active'
  order by up.last_seen desc;
$$;
CREATE OR REPLACE FUNCTION "public"."get_automation_eligible_users"("p_limit" integer DEFAULT 50) RETURNS TABLE("handle" "text", "name" "text", "onboard_state" "text", "entry_state" "text", "first_value_wedge" "text", "first_value_delivered_at" timestamp with time zone, "follow_through_delivered_at" timestamp with time zone, "second_engagement_at" timestamp with time zone, "memory_moment_delivered_at" timestamp with time zone, "activated_at" timestamp with time zone, "at_risk_at" timestamp with time zone, "last_proactive_sent_at" timestamp with time zone, "last_proactive_ignored" boolean, "proactive_ignore_count" integer, "activation_score" integer, "capability_categories_used" "text"[], "bot_number" "text", "first_seen" bigint, "last_seen" bigint, "onboard_count" integer, "timezone" "text", "auth_user_id" "uuid", "status" "text", "deep_profile_snapshot" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    up.handle,
    up.name,
    coalesce(up.onboard_state, 'new_user_unclassified'),
    up.entry_state,
    up.first_value_wedge,
    up.first_value_delivered_at,
    up.follow_through_delivered_at,
    up.second_engagement_at,
    up.memory_moment_delivered_at,
    up.activated_at,
    up.at_risk_at,
    up.last_proactive_sent_at,
    coalesce(up.last_proactive_ignored, false),
    coalesce(up.proactive_ignore_count, 0),
    coalesce(up.activation_score, 0),
    coalesce(up.capability_categories_used, '{}'::text[]),
    up.bot_number,
    up.first_seen,
    up.last_seen,
    coalesce(up.onboard_count, 0),
    up.timezone,
    up.auth_user_id,
    up.status,
    up.deep_profile_snapshot
  from public.user_profiles up
  where up.status = 'active'
    and up.bot_number is not null
    -- Minimum gap between proactive messages: 2 hours
    and (
      up.last_proactive_sent_at is null
      or up.last_proactive_sent_at < now() - interval '2 hours'
    )
    -- Stop after 3 consecutive ignores
    and coalesce(up.proactive_ignore_count, 0) < 3
  order by up.last_seen asc
  limit p_limit;
$$;
CREATE OR REPLACE FUNCTION "public"."get_automation_preferences"("p_handle" "text") RETURNS TABLE("automation_type" "text", "enabled" boolean, "schedule_override" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select ap.automation_type, ap.enabled, ap.schedule_override
  from public.automation_preferences ap
  where ap.handle = p_handle;
$$;
CREATE OR REPLACE FUNCTION "public"."get_conversation_summaries"("p_chat_id" "text", "p_limit" integer DEFAULT 5, "p_engagement_scope" "text" DEFAULT NULL::"text", "p_engagement_brand_key" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "chat_id" "text", "sender_handle" "text", "engagement_scope" "text", "engagement_brand_key" "text", "summary" "text", "topics" "text"[], "open_loops" "text"[], "summary_kind" "text", "first_message_at" timestamp with time zone, "last_message_at" timestamp with time zone, "message_count" integer, "confidence" numeric, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    cs.id,
    cs.chat_id,
    cs.sender_handle,
    cs.engagement_scope,
    cs.engagement_brand_key,
    cs.summary,
    cs.topics,
    cs.open_loops,
    cs.summary_kind,
    cs.first_message_at,
    cs.last_message_at,
    cs.message_count,
    cs.confidence,
    cs.created_at
  FROM public.conversation_summaries cs
  WHERE cs.chat_id = p_chat_id
    AND (p_engagement_scope IS NULL OR cs.engagement_scope = p_engagement_scope)
    AND (
      p_engagement_scope IS DISTINCT FROM 'brand'
      OR cs.engagement_brand_key = lower(trim(coalesce(p_engagement_brand_key, '')))
    )
  ORDER BY cs.last_message_at DESC
  LIMIT greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_conversation_window"("p_chat_id" "text", "p_limit" integer DEFAULT 20, "p_engagement_scope" "text" DEFAULT NULL::"text", "p_engagement_brand_key" "text" DEFAULT NULL::"text") RETURNS TABLE("role" "text", "content" "text", "handle" "text", "metadata" "jsonb", "created_at" timestamp with time zone, "engagement_scope" "text", "engagement_brand_key" "text", "provider_message_id" "text", "reply_to_provider_message_id" "text", "provider_part_index" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    recent.role,
    recent.content,
    recent.handle,
    recent.metadata,
    recent.created_at,
    recent.engagement_scope,
    recent.engagement_brand_key,
    recent.provider_message_id,
    recent.reply_to_provider_message_id,
    recent.provider_part_index
  from (
    select
      cm.role,
      cm.content,
      cm.handle,
      cm.metadata,
      cm.created_at,
      cm.engagement_scope,
      cm.engagement_brand_key,
      cm.provider_message_id,
      cm.reply_to_provider_message_id,
      cm.provider_part_index
    from public.conversation_messages cm
    where cm.chat_id = p_chat_id
      and (
        p_engagement_scope is null
        or (
          p_engagement_scope = 'nest'
          and cm.engagement_scope = 'nest'
        )
        or (
          p_engagement_scope = 'brand'
          and cm.engagement_scope = 'brand'
          and cm.engagement_brand_key = nullif(lower(trim(coalesce(p_engagement_brand_key, ''))), '')
        )
      )
    order by cm.created_at desc
    limit greatest(coalesce(p_limit, 20), 1)
  ) recent
  order by recent.created_at asc;
$$;
CREATE OR REPLACE FUNCTION "public"."get_core_entities"("p_handle" "text", "p_limit" integer DEFAULT 8) RETURNS TABLE("id" bigint, "handle" "text", "entity_type" "text", "canonical_name" "text", "aliases" "text"[], "compiled_truth" "text", "is_core" boolean, "importance_score" numeric, "mention_count" integer, "status" "text", "metadata" "jsonb", "first_mentioned_at" timestamp with time zone, "last_mentioned_at" timestamp with time zone, "compiled_truth_updated_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    e.id, e.handle, e.entity_type, e.canonical_name, e.aliases,
    e.compiled_truth, e.is_core, e.importance_score, e.mention_count,
    e.status, e.metadata, e.first_mentioned_at, e.last_mentioned_at,
    e.compiled_truth_updated_at, e.created_at
  from public.entities e
  where e.handle = p_handle
    and e.status = 'active'
    and e.is_core = true
  order by e.importance_score desc nulls last, e.last_mentioned_at desc
  limit greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_due_reminders"() RETURNS TABLE("id" bigint, "handle" "text", "chat_id" "text", "action_description" "text", "cron_expression" "text", "repeating" boolean, "timezone" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    r.id,
    r.handle,
    r.chat_id,
    r.action_description,
    r.cron_expression,
    r.repeating,
    r.timezone
  from public.reminders r
  where r.active = true
    and r.next_fire_at <= now()
  order by r.next_fire_at asc
  limit 50;
$$;
CREATE OR REPLACE FUNCTION "public"."get_due_user_automations"("p_limit" integer DEFAULT 50) RETURNS TABLE("automation_id" "uuid", "user_id" "uuid", "automation_type" "text", "config" "jsonb", "label" "text", "next_run_at" timestamp with time zone, "handle" "text", "name" "text", "greeting_name" "text", "bot_number" "text", "timezone" "text", "auth_user_id" "uuid", "status" "text", "onboard_count" integer, "activation_score" integer, "last_seen" bigint, "first_seen" bigint, "deep_profile_snapshot" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    ua.id,
    ua.user_id,
    ua.automation_type,
    ua.config,
    ua.label,
    ua.next_run_at,
    up.handle,
    up.name,
    coalesce(nullif(trim(up.display_name), ''), nullif(trim(up.name), '')) as greeting_name,
    up.bot_number,
    up.timezone,
    up.auth_user_id,
    up.status,
    coalesce(up.onboard_count, 0),
    coalesce(up.activation_score, 0),
    up.last_seen,
    up.first_seen,
    up.deep_profile_snapshot
  from public.user_automations ua
  join public.user_profiles up on up.auth_user_id = ua.user_id
  where ua.active = true
    and ua.automation_type <> 'bill_reminders'
    and ua.next_run_at is not null
    and ua.next_run_at <= now()
    and up.status = 'active'
    and up.bot_number is not null
  order by ua.next_run_at asc
  limit p_limit;
$$;
CREATE OR REPLACE FUNCTION "public"."get_entities_by_ids"("p_handle" "text", "p_ids" bigint[]) RETURNS TABLE("id" bigint, "handle" "text", "entity_type" "text", "canonical_name" "text", "aliases" "text"[], "compiled_truth" "text", "is_core" boolean, "importance_score" numeric, "mention_count" integer, "status" "text", "metadata" "jsonb", "first_mentioned_at" timestamp with time zone, "last_mentioned_at" timestamp with time zone, "compiled_truth_updated_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    e.id, e.handle, e.entity_type, e.canonical_name, e.aliases,
    e.compiled_truth, e.is_core, e.importance_score, e.mention_count,
    e.status, e.metadata, e.first_mentioned_at, e.last_mentioned_at,
    e.compiled_truth_updated_at, e.created_at
  from public.entities e
  where e.handle = p_handle
    and e.status = 'active'
    and e.id = any(coalesce(p_ids, '{}'::bigint[]))
  order by e.importance_score desc nulls last, e.last_mentioned_at desc;
$$;
CREATE OR REPLACE FUNCTION "public"."get_entities_needing_consolidation"("p_limit" integer DEFAULT 25, "p_max_idle_minutes" integer DEFAULT 5) RETURNS TABLE("id" bigint, "handle" "text", "pending_event_count" bigint, "last_event_at" timestamp with time zone, "compiled_truth_updated_at" timestamp with time zone, "importance_score" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with recent_events as (
    select
      t.entity_id,
      count(*) as event_count,
      max(t.created_at) as last_event_at,
      min(t.created_at) as first_event_at
    from public.entity_timeline t
    join public.entities e on e.id = t.entity_id
    where e.status = 'active'
    group by t.entity_id
  )
  select
    e.id,
    e.handle,
    re.event_count as pending_event_count,
    re.last_event_at,
    e.compiled_truth_updated_at,
    e.importance_score
  from public.entities e
  join recent_events re on re.entity_id = e.id
  where e.status = 'active'
    -- Either: never consolidated, OR new events since last consolidation
    and (
      e.compiled_truth_updated_at is null
      or re.last_event_at > e.compiled_truth_updated_at
    )
    -- Don't pick up entities that are still actively receiving events right
    -- now (avoid racing with extraction). Wait for a quiet window.
    and re.last_event_at < now() - make_interval(mins => greatest(p_max_idle_minutes, 0))
  order by
    -- Prioritise: never-consolidated, then high-importance, then most pending
    case when e.compiled_truth_updated_at is null then 0 else 1 end,
    e.importance_score desc nulls last,
    re.event_count desc,
    re.last_event_at asc
  limit greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_entity_timeline"("p_entity_id" bigint, "p_limit" integer DEFAULT 20) RETURNS TABLE("id" bigint, "entity_id" bigint, "handle" "text", "event_text" "text", "event_at" timestamp with time zone, "source_kind" "text", "source_message_ids" "jsonb", "source_summary_id" bigint, "metadata" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    t.id, t.entity_id, t.handle, t.event_text, t.event_at,
    t.source_kind, t.source_message_ids, t.source_summary_id,
    t.metadata, t.created_at
  from public.entity_timeline t
  where t.entity_id = p_entity_id
  order by t.event_at desc
  limit greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_expiring_subscriptions"("p_within_hours" integer DEFAULT 48) RETURNS TABLE("id" "uuid", "handle" "text", "provider" "text", "account_email" "text", "history_id" "text", "subscription_id" "text", "expiration" timestamp with time zone, "error_count" integer, "resource_type" "text", "channel_id" "text", "resource_id" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    s.id, s.handle, s.provider, s.account_email,
    s.history_id, s.subscription_id, s.expiration, s.error_count,
    s.resource_type, s.channel_id, s.resource_id
  from public.notification_webhook_subscriptions s
  where s.active = true
    and s.expiration <= now() + (p_within_hours || ' hours')::interval
  order by s.expiration asc;
$$;
CREATE OR REPLACE FUNCTION "public"."get_global_moment_stats"() RETURNS TABLE("total_moments" bigint, "active_moments" bigint, "paused_moments" bigint, "draft_moments" bigint, "total_sent_24h" bigint, "total_sent_7d" bigint, "unique_users_24h" bigint, "unique_users_7d" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    (select count(*) from moments),
    (select count(*) from moments where status = 'active'),
    (select count(*) from moments where status = 'paused'),
    (select count(*) from moments where status = 'draft'),
    (select count(*) from moment_executions where status = 'sent' and sent_at > now() - interval '24 hours'),
    (select count(*) from moment_executions where status = 'sent' and sent_at > now() - interval '7 days'),
    (select count(distinct handle) from moment_executions where status = 'sent' and sent_at > now() - interval '24 hours'),
    (select count(distinct handle) from moment_executions where status = 'sent' and sent_at > now() - interval '7 days');
$$;
CREATE OR REPLACE FUNCTION "public"."get_idle_conversations_needing_summary"("p_idle_minutes" integer DEFAULT 15, "p_limit" integer DEFAULT 10) RETURNS TABLE("chat_id" "text", "engagement_scope" "text", "engagement_brand_key" "text", "message_count" bigint, "first_message_at" timestamp with time zone, "last_message_at" timestamp with time zone, "since_ts" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH latest_messages AS (
    SELECT
      cm.chat_id,
      cm.engagement_scope,
      cm.engagement_brand_key,
      count(*) AS message_count,
      min(cm.created_at) AS first_message_at,
      max(cm.created_at) AS last_message_at
    FROM public.conversation_messages cm
    WHERE cm.expires_at > now()
    GROUP BY cm.chat_id, cm.engagement_scope, cm.engagement_brand_key
    HAVING max(cm.created_at) < now() - make_interval(mins => p_idle_minutes)
  ),
  latest_summaries AS (
    SELECT
      cs.chat_id,
      cs.engagement_scope,
      cs.engagement_brand_key,
      max(cs.last_message_at) AS last_summarised_at
    FROM public.conversation_summaries cs
    GROUP BY cs.chat_id, cs.engagement_scope, cs.engagement_brand_key
  )
  SELECT
    lm.chat_id,
    lm.engagement_scope,
    lm.engagement_brand_key,
    lm.message_count,
    lm.first_message_at,
    lm.last_message_at,
    coalesce(ls.last_summarised_at, '1970-01-01T00:00:00Z'::timestamptz) AS since_ts
  FROM latest_messages lm
  LEFT JOIN latest_summaries ls
    ON ls.chat_id = lm.chat_id
   AND ls.engagement_scope = lm.engagement_scope
   AND ls.engagement_brand_key IS NOT DISTINCT FROM lm.engagement_brand_key
  WHERE lm.last_message_at > coalesce(ls.last_summarised_at, '1970-01-01T00:00:00Z'::timestamptz)
  ORDER BY lm.last_message_at ASC
  LIMIT greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_moment_config"("p_key" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select value from moment_global_config where key = p_key;
$$;
CREATE OR REPLACE FUNCTION "public"."get_moment_executions"("p_moment_id" "uuid", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" bigint, "moment_version" integer, "handle" "text", "chat_id" "text", "status" "public"."moment_exec_status", "skip_reason" "text", "rendered_content" "text", "prompt_used" "text", "sent_at" timestamp with time zone, "replied_at" timestamp with time zone, "ignored" boolean, "metadata" "jsonb", "error_message" "text", "execution_ms" integer, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    me.id, me.moment_version, me.handle, me.chat_id,
    me.status, me.skip_reason, me.rendered_content, me.prompt_used,
    me.sent_at, me.replied_at, me.ignored,
    me.metadata, me.error_message, me.execution_ms, me.created_at
  from moment_executions me
  where me.moment_id = p_moment_id
  order by me.created_at desc
  limit p_limit offset p_offset;
$$;
CREATE OR REPLACE FUNCTION "public"."get_moment_stats"("p_moment_id" "uuid") RETURNS TABLE("total_sent" bigint, "total_skipped" bigint, "total_failed" bigint, "total_deduplicated" bigint, "total_cooldown" bigint, "total_suppressed" bigint, "total_dry_run" bigint, "unique_users" bigint, "replied_count" bigint, "ignored_count" bigint, "avg_execution_ms" numeric, "last_sent_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    count(*) filter (where status = 'sent'),
    count(*) filter (where status = 'skipped'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'deduplicated'),
    count(*) filter (where status = 'cooldown_blocked'),
    count(*) filter (where status = 'suppressed'),
    count(*) filter (where status = 'dry_run'),
    count(distinct handle) filter (where status = 'sent'),
    count(*) filter (where replied_at is not null),
    count(*) filter (where ignored = true),
    avg(execution_ms) filter (where execution_ms is not null),
    max(sent_at)
  from moment_executions
  where moment_id = p_moment_id;
$$;
CREATE OR REPLACE FUNCTION "public"."get_proactive_eligible_users"("p_limit" integer DEFAULT 20) RETURNS TABLE("handle" "text", "name" "text", "onboard_state" "text", "entry_state" "text", "first_value_wedge" "text", "first_value_delivered_at" timestamp with time zone, "follow_through_delivered_at" timestamp with time zone, "second_engagement_at" timestamp with time zone, "checkin_opt_in" boolean, "checkin_decline_at" timestamp with time zone, "memory_moment_delivered_at" timestamp with time zone, "activated_at" timestamp with time zone, "last_proactive_sent_at" timestamp with time zone, "last_proactive_ignored" boolean, "proactive_ignore_count" integer, "recovery_nudge_sent_at" timestamp with time zone, "activation_score" integer, "capability_categories_used" "text"[], "bot_number" "text", "first_seen" bigint, "last_seen" bigint, "onboard_count" integer, "timezone" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    up.handle, up.name, up.onboard_state, up.entry_state,
    up.first_value_wedge, up.first_value_delivered_at,
    up.follow_through_delivered_at, up.second_engagement_at,
    up.checkin_opt_in, up.checkin_decline_at,
    up.memory_moment_delivered_at, up.activated_at,
    up.last_proactive_sent_at, up.last_proactive_ignored,
    up.proactive_ignore_count, up.recovery_nudge_sent_at,
    up.activation_score, up.capability_categories_used,
    up.bot_number, up.first_seen, up.last_seen,
    up.onboard_count, up.timezone
  from public.user_profiles up
  where up.status = 'active'
    and up.activated_at is null
    and up.first_seen > extract(epoch from now() - interval '48 hours')::bigint
    and (
      up.last_proactive_sent_at is null
      or up.last_proactive_sent_at < now() - interval '4 hours'
    )
    and up.proactive_ignore_count < 2
  order by up.last_seen asc
  limit greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_recent_tool_traces"("p_chat_id" "text", "p_limit" integer DEFAULT 5, "p_engagement_scope" "text" DEFAULT NULL::"text", "p_engagement_brand_key" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "chat_id" "text", "engagement_scope" "text", "engagement_brand_key" "text", "tool_name" "text", "outcome" "text", "safe_summary" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    tt.id,
    tt.chat_id,
    tt.engagement_scope,
    tt.engagement_brand_key,
    tt.tool_name,
    tt.outcome,
    tt.safe_summary,
    tt.created_at
  FROM public.tool_traces tt
  WHERE tt.chat_id = p_chat_id
    AND (p_engagement_scope IS NULL OR tt.engagement_scope = p_engagement_scope)
    AND (
      p_engagement_scope IS DISTINCT FROM 'brand'
      OR tt.engagement_brand_key = lower(trim(coalesce(p_engagement_brand_key, '')))
    )
  ORDER BY tt.created_at DESC
  LIMIT greatest(p_limit, 1);
$$;
CREATE OR REPLACE FUNCTION "public"."get_unsummarised_messages"("p_chat_id" "text", "p_since" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone, "p_engagement_scope" "text" DEFAULT NULL::"text", "p_engagement_brand_key" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "role" "text", "content" "text", "handle" "text", "metadata" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    cm.id,
    cm.role,
    cm.content,
    cm.handle,
    cm.metadata,
    cm.created_at
  FROM public.conversation_messages cm
  WHERE cm.chat_id = p_chat_id
    AND cm.created_at > p_since
    AND (p_engagement_scope IS NULL OR cm.engagement_scope = p_engagement_scope)
    AND (
      p_engagement_scope IS DISTINCT FROM 'brand'
      OR cm.engagement_brand_key = lower(trim(coalesce(p_engagement_brand_key, '')))
    )
  ORDER BY cm.created_at ASC;
$$;
CREATE OR REPLACE FUNCTION "public"."get_user_automation_counts_by_type"() RETURNS TABLE("automation_type" "text", "total_count" bigint, "active_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  select
    automation_type,
    count(*)::bigint                                  as total_count,
    count(*) filter (where active = true)::bigint     as active_count
  from public.user_automations
  group by automation_type;
$$;
CREATE OR REPLACE FUNCTION "public"."get_user_automation_history"("p_handle" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 200) RETURNS TABLE("id" bigint, "handle" "text", "chat_id" "text", "automation_type" "text", "content" "text", "sent_at" timestamp with time zone, "delivered_at" timestamp with time zone, "replied_at" timestamp with time zone, "ignored" boolean, "metadata" "jsonb", "manual_trigger" boolean, "triggered_by" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    ar.id, ar.handle, ar.chat_id, ar.automation_type, ar.content,
    ar.sent_at, ar.delivered_at, ar.replied_at, ar.ignored,
    ar.metadata, ar.manual_trigger, ar.triggered_by
  from public.automation_runs ar
  where (p_handle is null or ar.handle = p_handle)
  order by ar.sent_at desc
  limit p_limit;
$$;
CREATE OR REPLACE FUNCTION "public"."get_user_email_watch_triggers"("p_handle" "text") RETURNS TABLE("id" bigint, "name" "text", "description" "text", "trigger_type" "text", "account_email" "text", "provider" "text", "match_sender" "text", "match_subject_pattern" "text", "use_ai_matching" boolean, "delivery_method" "text", "fire_count" integer, "last_fired_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    t.id, t.name, t.description, t.trigger_type,
    t.account_email, t.provider, t.match_sender,
    t.match_subject_pattern, t.use_ai_matching,
    t.delivery_method, t.fire_count, t.last_fired_at, t.created_at
  from public.notification_watch_triggers t
  where t.handle = p_handle
    and t.active = true
    and t.source_type in ('email', 'any')
  order by t.created_at desc;
$$;
CREATE OR REPLACE FUNCTION "public"."get_user_moment_history"("p_handle" "text", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" bigint, "moment_id" "uuid", "moment_name" "text", "moment_version" integer, "status" "public"."moment_exec_status", "rendered_content" "text", "sent_at" timestamp with time zone, "replied_at" timestamp with time zone, "ignored" boolean, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    me.id, me.moment_id, m.name, me.moment_version,
    me.status, me.rendered_content,
    me.sent_at, me.replied_at, me.ignored, me.created_at
  from moment_executions me
  join moments m on m.id = me.moment_id
  where me.handle = p_handle
  order by me.created_at desc
  limit p_limit;
$$;
CREATE OR REPLACE FUNCTION "public"."get_user_notification_watch_triggers"("p_handle" "text") RETURNS TABLE("id" bigint, "name" "text", "description" "text", "trigger_type" "text", "source_type" "text", "account_email" "text", "provider" "text", "match_sender" "text", "match_subject_pattern" "text", "use_ai_matching" boolean, "ai_prompt" "text", "delivery_method" "text", "time_constraint" "jsonb", "fire_count" integer, "last_fired_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    t.id, t.name, t.description, t.trigger_type, t.source_type,
    t.account_email, t.provider, t.match_sender,
    t.match_subject_pattern, t.use_ai_matching, t.ai_prompt,
    t.delivery_method, t.time_constraint,
    t.fire_count, t.last_fired_at, t.created_at
  from public.notification_watch_triggers t
  where t.handle = p_handle
    and t.active = true
  order by t.created_at desc;
$$;
CREATE OR REPLACE FUNCTION "public"."get_user_reminders"("p_handle" "text") RETURNS TABLE("id" bigint, "action_description" "text", "cron_expression" "text", "repeating" boolean, "next_fire_at" timestamp with time zone, "last_fired_at" timestamp with time zone, "timezone" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    r.id,
    r.action_description,
    r.cron_expression,
    r.repeating,
    r.next_fire_at,
    r.last_fired_at,
    r.timezone,
    r.created_at
  from public.reminders r
  where r.handle = p_handle
    and r.active = true
  order by r.created_at desc;
$$;
CREATE OR REPLACE FUNCTION "public"."hey_comp_claim_scheduled_run"("p_job_id" "uuid", "p_run_key" "text", "p_event_key" "text", "p_scheduled_for" timestamp with time zone, "p_input_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_lock_seconds" integer DEFAULT 900) RETURNS TABLE("run_id" "uuid", "claimed" boolean, "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_run_id uuid;
  v_status text;
begin
  insert into public.hey_comp_scheduled_runs (
    job_id,
    run_key,
    event_key,
    scheduled_for,
    input_payload
  )
  values (
    p_job_id,
    p_run_key,
    p_event_key,
    p_scheduled_for,
    coalesce(p_input_payload, '{}'::jsonb)
  )
  on conflict (job_id, run_key) do nothing;

  update public.hey_comp_scheduled_runs r
  set status = 'locked',
      locked_at = now(),
      locked_by = 'hey-comp-scheduler',
      input_payload = coalesce(p_input_payload, r.input_payload, '{}'::jsonb),
      error = null,
      updated_at = now()
  where r.job_id = p_job_id
    and r.run_key = p_run_key
    and (
      r.status in ('pending', 'failed')
      or (
        r.status in ('locked', 'running')
        and coalesce(r.locked_at, r.started_at, r.created_at) < now() - make_interval(secs => greatest(p_lock_seconds, 60))
      )
    )
  returning r.id, r.status into v_run_id, v_status;

  if v_run_id is not null then
    return query select v_run_id, true, v_status;
    return;
  end if;

  select r.id, r.status into v_run_id, v_status
  from public.hey_comp_scheduled_runs r
  where r.job_id = p_job_id
    and r.run_key = p_run_key
  limit 1;

  return query select v_run_id, false, coalesce(v_status, 'missing');
end;
$$;
CREATE OR REPLACE FUNCTION "public"."hey_comp_touch_scheduled_job"("p_job_id" "uuid", "p_next_check_at" timestamp with time zone, "p_last_error" "text" DEFAULT NULL::"text", "p_success" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.hey_comp_scheduled_jobs
  set last_checked_at = now(),
      next_check_at = coalesce(p_next_check_at, now() + interval '5 minutes'),
      failure_count = case when p_success then 0 else failure_count + 1 end,
      last_error = p_last_error,
      status = case
        when not p_success and failure_count + 1 >= 5 then 'failed'
        else status
      end,
      updated_at = now()
  where id = p_job_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."hybrid_search_documents"("p_handle" "text", "query_text" "text", "query_embedding" "extensions"."halfvec", "match_count" integer DEFAULT 30, "source_filters" "text"[] DEFAULT NULL::"text"[], "min_semantic_score" double precision DEFAULT 0.28) RETURNS TABLE("document_id" "uuid", "source_type" "text", "source_id" "text", "title" "text", "summary_text" "text", "chunk_text" "text", "metadata" "jsonb", "semantic_score" double precision, "lexical_score" double precision, "fused_score" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    SET "statement_timeout" TO '12s'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id AS document_id,
        d.source_type,
        d.source_id,
        d.title,
        d.summary_text,
        d.chunk_text,
        d.metadata,
        (1 - (e.embedding <=> query_embedding))::float AS semantic_score,
        0::float AS lexical_score,
        (
            (1 - (e.embedding <=> query_embedding))
            * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - d.created_at)) / 86400.0 * 0.003))
        )::float AS fused_score
    FROM public.search_embeddings e
    JOIN public.search_documents d ON d.id = e.document_id
    WHERE d.handle = p_handle
      AND e.handle = p_handle
      AND d.is_deleted = FALSE
      AND e.embedding_model = 'text-embedding-3-large'
      AND (source_filters IS NULL OR d.source_type = ANY(source_filters))
      AND (1 - (e.embedding <=> query_embedding)) >= min_semantic_score
    ORDER BY fused_score DESC
    LIMIT match_count;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."increment_group_messages_since_link"("p_chat_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.group_chats
  SET
    messages_since_link = messages_since_link + 1,
    last_activity_at = now(),
    updated_at = now()
  WHERE chat_id = p_chat_id;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."insert_email_watch_trigger"("p_handle" "text", "p_name" "text", "p_description" "text", "p_trigger_type" "text", "p_account_email" "text" DEFAULT NULL::"text", "p_provider" "text" DEFAULT NULL::"text", "p_match_sender" "text" DEFAULT NULL::"text", "p_match_subject_pattern" "text" DEFAULT NULL::"text", "p_match_labels" "text"[] DEFAULT NULL::"text"[], "p_use_ai_matching" boolean DEFAULT true, "p_ai_prompt" "text" DEFAULT NULL::"text", "p_delivery_method" "text" DEFAULT 'message'::"text") RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.insert_notification_watch_trigger(
    p_handle, p_name, p_description, p_trigger_type, 'email',
    p_account_email, p_provider, p_match_sender, p_match_subject_pattern,
    p_match_labels, p_use_ai_matching, p_ai_prompt, p_delivery_method, null
  );
$$;
CREATE OR REPLACE FUNCTION "public"."insert_memory_item"("p_handle" "text", "p_chat_id" "text", "p_memory_type" "text", "p_category" "text", "p_value_text" "text", "p_normalized_value" "text", "p_confidence" numeric, "p_status" "text", "p_scope" "text", "p_source_kind" "text", "p_source_message_ids" "jsonb", "p_source_summary_id" bigint DEFAULT NULL::bigint, "p_extractor_version" "text" DEFAULT NULL::"text", "p_expiry_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_supersedes_memory_id" bigint DEFAULT NULL::bigint, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.memory_items (
    handle, chat_id, memory_type, category, value_text, normalized_value,
    confidence, status, scope, source_kind, source_message_ids,
    source_summary_id, extractor_version, expiry_at,
    supersedes_memory_id, metadata, last_confirmed_at
  )
  values (
    p_handle, p_chat_id, p_memory_type, p_category, p_value_text,
    p_normalized_value, p_confidence, p_status, p_scope, p_source_kind,
    coalesce(p_source_message_ids, '[]'::jsonb),
    p_source_summary_id, p_extractor_version, p_expiry_at,
    p_supersedes_memory_id, coalesce(p_metadata, '{}'::jsonb),
    case when p_status = 'active' then now() else null end
  )
  returning id into v_id;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."insert_notification_watch_trigger"("p_handle" "text", "p_name" "text", "p_description" "text", "p_trigger_type" "text", "p_source_type" "text" DEFAULT 'email'::"text", "p_account_email" "text" DEFAULT NULL::"text", "p_provider" "text" DEFAULT NULL::"text", "p_match_sender" "text" DEFAULT NULL::"text", "p_match_subject_pattern" "text" DEFAULT NULL::"text", "p_match_labels" "text"[] DEFAULT NULL::"text"[], "p_use_ai_matching" boolean DEFAULT true, "p_ai_prompt" "text" DEFAULT NULL::"text", "p_delivery_method" "text" DEFAULT 'message'::"text", "p_time_constraint" "jsonb" DEFAULT NULL::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.notification_watch_triggers (
    handle, account_email, provider, name, description,
    trigger_type, source_type, match_sender, match_subject_pattern,
    match_labels, use_ai_matching, ai_prompt, delivery_method,
    time_constraint
  )
  values (
    p_handle, p_account_email, p_provider, p_name, p_description,
    p_trigger_type, p_source_type, p_match_sender, p_match_subject_pattern,
    p_match_labels, p_use_ai_matching, p_ai_prompt,
    coalesce(p_delivery_method, 'message'), p_time_constraint
  )
  returning id into v_id;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."insert_reminder"("p_handle" "text", "p_chat_id" "text", "p_action_description" "text", "p_cron_expression" "text", "p_repeating" boolean, "p_next_fire_at" timestamp with time zone, "p_timezone" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.reminders (
    handle, chat_id, action_description, cron_expression,
    repeating, next_fire_at, active, timezone
  )
  values (
    p_handle, p_chat_id, p_action_description, p_cron_expression,
    p_repeating, p_next_fire_at, true, coalesce(p_timezone, 'UTC')
  )
  returning id into v_id;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."insert_tool_trace"("p_chat_id" "text", "p_message_id" bigint, "p_engagement_scope" "text", "p_engagement_brand_key" "text", "p_tool_name" "text", "p_outcome" "text", "p_safe_summary" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id bigint;
  v_scope text := coalesce(p_engagement_scope, 'nest');
  v_brand_key text := nullif(lower(trim(coalesce(p_engagement_brand_key, ''))), '');
BEGIN
  IF v_scope NOT IN ('nest', 'brand') THEN
    RAISE EXCEPTION 'invalid engagement scope: %', v_scope;
  END IF;

  IF v_scope = 'brand' AND v_brand_key IS NULL THEN
    RAISE EXCEPTION 'brand engagement requires p_engagement_brand_key';
  END IF;

  IF v_scope = 'nest' THEN
    v_brand_key := null;
  END IF;

  INSERT INTO public.tool_traces (
    chat_id,
    message_id,
    engagement_scope,
    engagement_brand_key,
    tool_name,
    outcome,
    safe_summary,
    metadata
  )
  VALUES (
    p_chat_id,
    p_message_id,
    v_scope,
    v_brand_key,
    p_tool_name,
    p_outcome,
    p_safe_summary,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."is_latest_buffered_message"("p_chat_id" "text", "p_my_buffer_id" bigint) RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT MAX(id) FROM message_buffer
     WHERE chat_id = p_chat_id AND claimed_at IS NULL) = p_my_buffer_id,
    FALSE
  );
$$;
CREATE OR REPLACE FUNCTION "public"."is_moment_suppressed"("p_handle" "text", "p_moment_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select exists(
    select 1 from moment_user_suppressions
    where handle = p_handle
      and (moment_id = p_moment_id or scope = 'all')
  );
$$;
CREATE OR REPLACE FUNCTION "public"."last_automation_of_type"("p_handle" "text", "p_automation_type" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select max(sent_at)
  from public.automation_runs
  where handle = p_handle
    and automation_type = p_automation_type;
$$;
CREATE OR REPLACE FUNCTION "public"."mark_automation_replied"("p_handle" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- Mark the most recent unreplied automation as replied
  update public.automation_runs
  set replied_at = now(),
      ignored = false
  where id = (
    select id from public.automation_runs
    where handle = p_handle
      and replied_at is null
    order by sent_at desc
    limit 1
  );

  -- Reset ignore flag on profile
  update public.user_profiles
  set last_proactive_ignored = false
  where handle = p_handle;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."mark_memory_item_status"("p_id" bigint, "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.memory_items
    set status = p_status,
        updated_at = now(),
        last_confirmed_at = case
          when p_status = 'active' then now()
          else last_confirmed_at
        end
    where id = p_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."mark_moment_replied"("p_handle" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  update moment_executions
  set replied_at = now(), ignored = false
  where id = (
    select id from moment_executions
    where handle = p_handle
      and status = 'sent'
      and replied_at is null
    order by sent_at desc
    limit 1
  );

  update user_profiles
  set last_proactive_ignored = false,
      proactive_ignore_count = 0
  where handle = p_handle;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."mark_proactive_replied"("p_handle" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.proactive_messages
  set replied_at = now()
  where handle = p_handle
    and replied_at is null
    and sent_at = (
      select max(sent_at) from public.proactive_messages
      where handle = p_handle and replied_at is null
    );

  update public.user_profiles
  set last_proactive_ignored = false
  where handle = p_handle;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."mark_reminder_fired"("p_id" bigint, "p_next_fire_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_next_fire_at is null then
    -- One-shot reminder: deactivate
    update public.reminders
    set last_fired_at = now(),
        active = false,
        updated_at = now()
    where id = p_id;
  else
    -- Repeating: advance to next fire time
    update public.reminders
    set last_fired_at = now(),
        next_fire_at = p_next_fire_at,
        updated_at = now()
    where id = p_id;
  end if;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."mark_trigger_fired"("p_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.notification_watch_triggers
  set fire_count = fire_count + 1,
      last_fired_at = now(),
      updated_at = now()
  where id = p_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."match_brand_knowledge_chunks"("p_brand_key" "text", "p_query_embedding" "extensions"."vector", "p_match_count" integer DEFAULT 8) RETURNS TABLE("knowledge_item_id" "uuid", "chunk_index" integer, "content_text" "text", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT
    c.knowledge_item_id,
    c.chunk_index,
    c.content_text,
    (1 - (c.embedding <=> p_query_embedding))::float AS similarity
  FROM public.nest_brand_knowledge_chunks c
  INNER JOIN public.nest_brand_knowledge_items i ON i.id = c.knowledge_item_id
  WHERE c.brand_key = p_brand_key
    AND i.deleted_at IS NULL
    AND i.status = 'ready'
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 24));
$$;
CREATE OR REPLACE FUNCTION "public"."match_search_documents"("p_handle" "text", "query_embedding" "extensions"."halfvec", "match_count" integer DEFAULT 30, "source_filters" "text"[] DEFAULT NULL::"text"[], "min_score" double precision DEFAULT 0.28) RETURNS TABLE("document_id" "uuid", "source_type" "text", "source_id" "text", "title" "text", "summary_text" "text", "chunk_text" "text", "metadata" "jsonb", "semantic_score" double precision)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
    SELECT
        d.id AS document_id,
        d.source_type,
        d.source_id,
        d.title,
        d.summary_text,
        d.chunk_text,
        d.metadata,
        (1 - (e.embedding <=> query_embedding))::float AS semantic_score
    FROM public.search_embeddings e
    JOIN public.search_documents d ON d.id = e.document_id
    WHERE d.handle = p_handle
      AND e.handle = p_handle
      AND d.is_deleted = FALSE
      AND e.embedding_model = 'text-embedding-3-large'
      AND (source_filters IS NULL OR d.source_type = ANY(source_filters))
      AND (1 - (e.embedding <=> query_embedding)) >= min_score
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
$$;
CREATE OR REPLACE FUNCTION "public"."match_user_document_chunks"("p_user_id" "uuid", "query_embedding" "extensions"."halfvec", "match_count" integer DEFAULT 20, "min_score" double precision DEFAULT 0.30) RETURNS TABLE("chunk_id" "uuid", "upload_id" "uuid", "chunk_index" integer, "source_type" "text", "content_text" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT
        c.id AS chunk_id,
        c.upload_id,
        c.chunk_index,
        c.source_type,
        c.content_text,
        c.metadata,
        (1 - (c.embedding <=> query_embedding))::float AS similarity
    FROM public.user_document_chunks c
    WHERE c.user_id = p_user_id
      AND (1 - (c.embedding <=> query_embedding)) >= min_score
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;
CREATE OR REPLACE FUNCTION "public"."moment_execution_exists"("p_idempotency_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select exists(
    select 1 from moment_executions where idempotency_key = p_idempotency_key
  );
$$;
CREATE OR REPLACE FUNCTION "public"."moment_last_sent"("p_moment_id" "uuid", "p_handle" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select max(sent_at)
  from moment_executions
  where moment_id = p_moment_id
    and handle = p_handle
    and status = 'sent';
$$;
CREATE OR REPLACE FUNCTION "public"."moment_last_sent_any"("p_handle" "text") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select max(sent_at)
  from moment_executions
  where handle = p_handle and status = 'sent';
$$;
CREATE OR REPLACE FUNCTION "public"."moment_sends_today"("p_handle" "text") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from moment_executions
  where handle = p_handle
    and status = 'sent'
    and sent_at > now() - interval '24 hours';
$$;
CREATE OR REPLACE FUNCTION "public"."moment_total_sends"("p_moment_id" "uuid", "p_handle" "text") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select count(*)::integer
  from moment_executions
  where moment_id = p_moment_id
    and handle = p_handle
    and status = 'sent';
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_inventory_search"("p_brand_key" "text", "p_query" "text", "p_limit" integer DEFAULT 40) RETURNS TABLE("item_id" bigint, "description" "text", "custom_sku" "text", "upc" "text", "ean" "text", "item_type" "text", "default_price" numeric, "default_cost" numeric, "qoh" integer, "rank_score" real, "synced_at" timestamp with time zone, "synced_at_melbourne" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with needle as (
    select
      trim(p_query) as q,
      websearch_to_tsquery('simple', trim(p_query)) as tsq
  )
  select
    i.item_id,
    i.description,
    i.custom_sku,
    i.upc,
    i.ean,
    i.item_type,
    i.default_price,
    i.default_cost,
    i.qoh,
    ts_rank(
      to_tsvector(
        'simple',
        coalesce(i.description, '') || ' ' ||
        coalesce(i.custom_sku, '') || ' ' ||
        coalesce(i.upc, '') || ' ' ||
        coalesce(i.ean, '')
      ),
      n.tsq
    ) as rank_score,
    i.synced_at,
    i.synced_at_melbourne
  from private.nest_brand_lightspeed_inventory_v i
  cross join needle n
  where i.brand_key = p_brand_key
    and i.archived is false
    and (
      to_tsvector(
        'simple',
        coalesce(i.description, '') || ' ' ||
        coalesce(i.custom_sku, '') || ' ' ||
        coalesce(i.upc, '') || ' ' ||
        coalesce(i.ean, '')
      ) @@ n.tsq
      or lower(coalesce(i.description, '')) like '%' || lower(n.q) || '%'
      or lower(coalesce(i.custom_sku, '')) like '%' || lower(n.q) || '%'
      or lower(coalesce(i.upc, '')) like '%' || lower(n.q) || '%'
      or lower(coalesce(i.ean, '')) like '%' || lower(n.q) || '%'
    )
  order by
    rank_score desc,
    coalesce(i.qoh, -1) desc,
    coalesce(i.default_price, 0) asc,
    i.description asc
  limit greatest(coalesce(p_limit, 40), 1);
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_item_sales_by_weekday"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_query" "text") RETURNS TABLE("isodow" integer, "day_name" "text", "trading_days" integer, "total_units_sold" numeric, "total_revenue" numeric, "avg_units_per_day" numeric, "avg_revenue_per_day" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with matching_items as (
    select i.item_id
    from public.nest_brand_lightspeed_item i
    where i.brand_key = p_brand_key
      and i.archived is not true
      and to_tsvector(
        'simple',
        coalesce(i.description, '') || ' ' ||
        coalesce(i.custom_sku, '') || ' ' ||
        coalesce(i.upc, '') || ' ' ||
        coalesce(i.ean, '')
      ) @@ websearch_to_tsquery('simple', p_query)
  ),
  filtered_lines as (
    select l.*
    from private.nest_brand_lightspeed_sale_line_analytics_v l
    join matching_items mi on mi.item_id = l.item_id
    where l.brand_key = p_brand_key
      and l.complete_date_melbourne >= p_from_date
      and l.complete_date_melbourne <= p_to_date
      and l.is_layaway is false
  ),
  daily as (
    select
      l.complete_date_melbourne,
      l.complete_isodow_melbourne as isodow,
      l.complete_weekday_melbourne as day_name,
      sum(abs(l.unit_quantity))::numeric as day_units,
      sum(l.calc_line_total)::numeric as day_revenue
    from filtered_lines l
    group by l.complete_date_melbourne, l.complete_isodow_melbourne, l.complete_weekday_melbourne
  )
  select
    d.isodow,
    d.day_name,
    count(*)::int as trading_days,
    coalesce(sum(d.day_units), 0)::numeric as total_units_sold,
    coalesce(sum(d.day_revenue), 0)::numeric as total_revenue,
    coalesce(avg(d.day_units), 0)::numeric as avg_units_per_day,
    coalesce(avg(d.day_revenue), 0)::numeric as avg_revenue_per_day
  from daily d
  group by d.isodow, d.day_name
  order by d.isodow;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_item_sales_summary"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_query" "text") RETURNS TABLE("mirror_start_date" "date", "mirror_end_date" "date", "matched_item_count" integer, "total_units_sold" numeric, "total_revenue" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with coverage as (
    select
      min(s.complete_date_melbourne) as mirror_start_date,
      max(s.complete_date_melbourne) as mirror_end_date
    from private.nest_brand_lightspeed_sale_analytics_v s
    where s.brand_key = p_brand_key
      and s.completed is true
      and s.voided is false
      and s.archived is false
  ),
  matching_items as (
    select i.item_id
    from public.nest_brand_lightspeed_item i
    where i.brand_key = p_brand_key
      and i.archived is not true
      and to_tsvector(
        'simple',
        coalesce(i.description, '') || ' ' ||
        coalesce(i.custom_sku, '') || ' ' ||
        coalesce(i.upc, '') || ' ' ||
        coalesce(i.ean, '')
      ) @@ websearch_to_tsquery('simple', p_query)
  ),
  filtered_lines as (
    select l.*
    from private.nest_brand_lightspeed_sale_line_analytics_v l
    join matching_items mi on mi.item_id = l.item_id
    where l.brand_key = p_brand_key
      and l.complete_date_melbourne >= p_from_date
      and l.complete_date_melbourne <= p_to_date
      and l.is_layaway is false
  )
  select
    c.mirror_start_date,
    c.mirror_end_date,
    (select count(*)::int from matching_items),
    coalesce(sum(abs(fl.unit_quantity)), 0)::numeric as total_units_sold,
    coalesce(sum(fl.calc_line_total), 0)::numeric as total_revenue
  from coverage c
  left join filtered_lines fl on true
  group by c.mirror_start_date, c.mirror_end_date;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_item_set_melbourne"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.synced_at_melbourne := CASE WHEN NEW.synced_at IS NULL THEN NULL
    ELSE to_char(NEW.synced_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  NEW.updated_at_melbourne := CASE WHEN NEW.updated_at IS NULL THEN NULL
    ELSE to_char(NEW.updated_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_sale_line_set_melbourne"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at_melbourne := CASE WHEN NEW.updated_at IS NULL THEN NULL
    ELSE to_char(NEW.updated_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_sale_set_melbourne"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.create_time_melbourne := CASE WHEN NEW.create_time IS NULL THEN NULL
    ELSE to_char(NEW.create_time AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  NEW.complete_time_melbourne := CASE WHEN NEW.complete_time IS NULL THEN NULL
    ELSE to_char(NEW.complete_time AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  NEW.time_stamp_melbourne := CASE WHEN NEW.time_stamp IS NULL THEN NULL
    ELSE to_char(NEW.time_stamp AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  NEW.updated_at_melbourne := CASE WHEN NEW.updated_at IS NULL THEN NULL
    ELSE to_char(NEW.updated_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_sales_by_weekday"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date") RETURNS TABLE("isodow" integer, "day_name" "text", "trading_days" integer, "total_revenue" numeric, "avg_revenue" numeric, "total_profit" numeric, "avg_profit" numeric, "margin_pct" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with filtered_sales as (
    select *
    from private.nest_brand_lightspeed_sale_analytics_v s
    where s.brand_key = p_brand_key
      and s.completed is true
      and s.voided is false
      and s.archived is false
      and s.complete_date_melbourne >= p_from_date
      and s.complete_date_melbourne <= p_to_date
  ),
  daily as (
    select
      s.complete_date_melbourne,
      s.complete_isodow_melbourne as isodow,
      s.complete_weekday_melbourne as day_name,
      sum(s.calc_total) as day_revenue,
      sum(case when s.calc_avg_cost > 0 then s.calc_avg_cost else s.calc_fifo_cost end) as day_cogs
    from filtered_sales s
    group by s.complete_date_melbourne, s.complete_isodow_melbourne, s.complete_weekday_melbourne
  )
  select
    d.isodow,
    d.day_name,
    count(*)::int as trading_days,
    coalesce(sum(d.day_revenue), 0) as total_revenue,
    coalesce(avg(d.day_revenue), 0) as avg_revenue,
    coalesce(sum(d.day_revenue - d.day_cogs), 0) as total_profit,
    coalesce(avg(d.day_revenue - d.day_cogs), 0) as avg_profit,
    case
      when coalesce(sum(d.day_revenue), 0) > 0
        then round((coalesce(sum(d.day_revenue - d.day_cogs), 0) / sum(d.day_revenue)) * 100, 1)
      else 0
    end as margin_pct
  from daily d
  group by d.isodow, d.day_name
  order by d.isodow;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_sales_summary"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date") RETURNS TABLE("mirror_start_date" "date", "mirror_end_date" "date", "completed_sales" bigint, "total_revenue" numeric, "total_subtotal" numeric, "total_discount" numeric, "total_tax" numeric, "total_avg_cost" numeric, "total_fifo_cost" numeric, "total_cogs" numeric, "gross_profit" numeric, "gross_margin_pct" numeric, "total_items_sold" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with coverage as (
    select
      min(s.complete_date_melbourne) as mirror_start_date,
      max(s.complete_date_melbourne) as mirror_end_date
    from private.nest_brand_lightspeed_sale_analytics_v s
    where s.brand_key = p_brand_key
      and s.completed is true
      and s.voided is false
      and s.archived is false
  ),
  filtered_sales as (
    select *
    from private.nest_brand_lightspeed_sale_analytics_v s
    where s.brand_key = p_brand_key
      and s.completed is true
      and s.voided is false
      and s.archived is false
      and s.complete_date_melbourne >= p_from_date
      and s.complete_date_melbourne <= p_to_date
  ),
  item_stats as (
    select coalesce(sum(abs(l.unit_quantity)), 0)::numeric as total_items_sold
    from private.nest_brand_lightspeed_sale_line_analytics_v l
    join filtered_sales s
      on s.brand_key = l.brand_key
     and s.sale_id = l.sale_id
    where l.is_layaway is false
  )
  select
    c.mirror_start_date,
    c.mirror_end_date,
    count(fs.*)::bigint as completed_sales,
    coalesce(sum(fs.calc_total), 0) as total_revenue,
    coalesce(sum(fs.calc_subtotal), 0) as total_subtotal,
    coalesce(sum(fs.calc_discount), 0) as total_discount,
    coalesce(sum(fs.calc_tax1 + fs.calc_tax2), 0) as total_tax,
    coalesce(sum(fs.calc_avg_cost), 0) as total_avg_cost,
    coalesce(sum(fs.calc_fifo_cost), 0) as total_fifo_cost,
    coalesce(sum(case when fs.calc_avg_cost > 0 then fs.calc_avg_cost else fs.calc_fifo_cost end), 0) as total_cogs,
    coalesce(sum(fs.calc_total - case when fs.calc_avg_cost > 0 then fs.calc_avg_cost else fs.calc_fifo_cost end), 0) as gross_profit,
    case
      when coalesce(sum(fs.calc_total), 0) > 0
        then round(
          (
            coalesce(sum(fs.calc_total - case when fs.calc_avg_cost > 0 then fs.calc_avg_cost else fs.calc_fifo_cost end), 0)
            / sum(fs.calc_total)
          ) * 100,
          1
        )
      else 0
    end as gross_margin_pct,
    i.total_items_sold
  from coverage c
  left join filtered_sales fs on true
  cross join item_stats i
  group by c.mirror_start_date, c.mirror_end_date, i.total_items_sold;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_sales_top_items"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_limit" integer DEFAULT 15) RETURNS TABLE("item_id" bigint, "item_description" "text", "qty_sold" numeric, "total_revenue" numeric, "total_cost" numeric, "margin_pct" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with filtered_lines as (
    select l.*
    from private.nest_brand_lightspeed_sale_line_analytics_v l
    where l.brand_key = p_brand_key
      and l.complete_date_melbourne >= p_from_date
      and l.complete_date_melbourne <= p_to_date
      and l.is_layaway is false
      and l.item_id is not null
  ),
  grouped as (
    select
      l.item_id,
      max(coalesce(nullif(l.item_description, ''), nullif(l.custom_sku, ''), 'Item #' || l.item_id::text)) as item_description,
      sum(abs(l.unit_quantity))::numeric as qty_sold,
      sum(l.calc_line_total)::numeric as total_revenue,
      sum((case when l.avg_cost > 0 then l.avg_cost else l.fifo_cost end) * abs(l.unit_quantity))::numeric as total_cost
    from filtered_lines l
    group by l.item_id
  )
  select
    g.item_id,
    g.item_description,
    g.qty_sold,
    g.total_revenue,
    g.total_cost,
    case
      when g.total_revenue > 0 and g.total_cost > 0
        then round(((g.total_revenue - g.total_cost) / g.total_revenue) * 100, 1)
      else 0
    end as margin_pct
  from grouped g
  order by g.total_revenue desc, g.qty_sold desc
  limit greatest(coalesce(p_limit, 15), 1);
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_sql_query"("p_brand_key" "text", "p_sql" "text", "p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $_$
declare
  raw_sql text := btrim(coalesce(p_sql, ''), E' \n\r\t');
  lowered text;
  safe_sql text;
  result jsonb;
  row_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if raw_sql = '' then
    raise exception 'SQL query is required';
  end if;

  lowered := lower(raw_sql);

  if not (lowered like 'select%' or lowered like 'with%') then
    raise exception 'Only SELECT/CTE queries are allowed';
  end if;

  if position(';' in raw_sql) > 0 then
    raise exception 'Semicolons are not allowed';
  end if;

  if position('--' in raw_sql) > 0 or position('/*' in raw_sql) > 0 or position('*/' in raw_sql) > 0 then
    raise exception 'SQL comments are not allowed';
  end if;

  if position('{{brand_key}}' in raw_sql) = 0 then
    raise exception 'Query must include the {{brand_key}} placeholder';
  end if;

  if lowered ~ '(^|[^a-z_])(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|comment|analyze|vacuum|refresh|notify|listen|unlisten|execute|prepare|deallocate|merge|do|call)([^a-z_]|$)' then
    raise exception 'Only read-only analytics queries are allowed';
  end if;

  if position('pg_catalog' in lowered) > 0
     or position('information_schema' in lowered) > 0
     or position('auth.' in lowered) > 0
     or position('storage.' in lowered) > 0
     or position('graphql' in lowered) > 0
     or position('cron.' in lowered) > 0
     or position('net.' in lowered) > 0 then
    raise exception 'System schemas are not allowed';
  end if;

  if position('public.' in lowered) > 0 then
    raise exception 'Queries must use private analytics views only';
  end if;

  if lowered ~ '(^|[^a-z_])nest_brand_lightspeed_sale([^a-z_]|$)' and position('nest_brand_lightspeed_sale_analytics_v' in lowered) = 0 then
    raise exception 'Operational Lightspeed sale table is not allowed; use analytics views only';
  end if;
  if lowered ~ '(^|[^a-z_])nest_brand_lightspeed_sale_line([^a-z_]|$)' and position('nest_brand_lightspeed_sale_line_analytics_v' in lowered) = 0 then
    raise exception 'Operational Lightspeed sale line table is not allowed; use analytics views only';
  end if;
  if lowered ~ '(^|[^a-z_])nest_brand_lightspeed_item([^a-z_]|$)' and position('nest_brand_lightspeed_inventory_v' in lowered) = 0 then
    raise exception 'Operational Lightspeed item table is not allowed; use analytics views only';
  end if;
  if lowered ~ '(^|[^a-z_])nest_brand_lightspeed_workorder([^a-z_]|$)' and position('nest_brand_lightspeed_workorder_analytics_v' in lowered) = 0 then
    raise exception 'Operational Lightspeed workorder table is not allowed; use analytics views only';
  end if;

  if position('private.nest_brand_lightspeed_sale_analytics_v' in lowered) = 0
     and position('private.nest_brand_lightspeed_sale_line_analytics_v' in lowered) = 0
     and position('private.nest_brand_lightspeed_inventory_v' in lowered) = 0
     and position('private.nest_brand_lightspeed_workorder_analytics_v' in lowered) = 0 then
    raise exception 'Query must reference an approved private Lightspeed analytics view';
  end if;

  safe_sql := replace(raw_sql, '{{brand_key}}', quote_literal(p_brand_key));
  safe_sql := replace(safe_sql, '{{limit}}', row_limit::text);

  execute format(
    'select jsonb_build_object(
       ''rows'', coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb),
       ''row_count'', count(*),
       ''limit_applied'', %s
     )
     from (
       select *
       from (%s) as inner_q
       limit %s
     ) q',
    row_limit,
    safe_sql,
    row_limit
  )
  into result;

  insert into public.nest_brand_lightspeed_sql_query_log (
    brand_key, query_sql, row_limit, row_count, duration_ms, error
  ) values (
    p_brand_key,
    raw_sql,
    row_limit,
    coalesce((result->>'row_count')::integer, 0),
    0,
    null
  );

  return result;
end;
$_$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_workorder_lookup"("p_brand_key" "text", "p_customer_phone_e164" "text" DEFAULT NULL::"text", "p_customer_name" "text" DEFAULT NULL::"text", "p_from_date" "date" DEFAULT NULL::"date", "p_to_date" "date" DEFAULT NULL::"date", "p_status_ids" bigint[] DEFAULT NULL::bigint[], "p_limit" integer DEFAULT 100) RETURNS TABLE("workorder_id" bigint, "workorder_status_id" bigint, "customer_name" "text", "customer_phone" "text", "customer_phone_e164" "text", "notes" "text", "time_in_melbourne" "text", "eta_out_melbourne" "text", "time_stamp_melbourne" "text", "sale_id" bigint, "sale_total" numeric, "sale_balance" numeric, "workorder_line_items" "jsonb", "anchor_date_melbourne" "date")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with needle as (
    select nullif(trim(p_customer_name), '') as q
  )
  select
    w.workorder_id,
    w.workorder_status_id,
    w.customer_name,
    w.customer_phone,
    w.customer_phone_e164,
    w.notes,
    w.time_in_melbourne,
    w.eta_out_melbourne,
    w.time_stamp_melbourne,
    w.sale_id,
    w.sale_total,
    w.sale_balance,
    w.workorder_line_items,
    w.anchor_date_melbourne
  from private.nest_brand_lightspeed_workorder_analytics_v w
  cross join needle n
  where w.brand_key = p_brand_key
    and w.archived is false
    and (
      p_customer_phone_e164 is null
      or w.customer_phone_e164 = p_customer_phone_e164
    )
    and (
      p_status_ids is null
      or cardinality(p_status_ids) = 0
      or w.workorder_status_id = any(p_status_ids)
    )
    and (
      p_from_date is null
      or w.anchor_date_melbourne >= p_from_date
    )
    and (
      p_to_date is null
      or w.anchor_date_melbourne <= p_to_date
    )
    and (
      n.q is null
      or to_tsvector('simple', coalesce(w.customer_name, '') || ' ' || coalesce(w.notes, '')) @@ websearch_to_tsquery('simple', n.q)
      or lower(coalesce(w.customer_name, '')) like '%' || lower(n.q) || '%'
    )
  order by
    w.anchor_date_melbourne asc nulls last,
    w.time_stamp desc nulls last
  limit greatest(coalesce(p_limit, 100), 1);
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_lightspeed_workorder_set_melbourne"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.time_in_melbourne := CASE WHEN NEW.time_in IS NULL THEN NULL
    ELSE to_char(NEW.time_in AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  NEW.eta_out_melbourne := CASE WHEN NEW.eta_out IS NULL THEN NULL
    ELSE to_char(NEW.eta_out AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  NEW.time_stamp_melbourne := CASE WHEN NEW.time_stamp IS NULL THEN NULL
    ELSE to_char(NEW.time_stamp AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  NEW.updated_at_melbourne := CASE WHEN NEW.updated_at IS NULL THEN NULL
    ELSE to_char(NEW.updated_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI:SS') END;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_brand_portal_conversation_list"("p_brand_key" "text", "p_now" timestamp with time zone DEFAULT "now"(), "p_chat_limit" integer DEFAULT 250) RETURNS TABLE("chat_id" "text", "last_message_at" timestamp with time zone, "preview_role" "text", "preview_content" "text", "last_customer_message_at" timestamp with time zone, "participant_handle" "text", "is_portal_test" boolean, "profile_display_name" "text", "profile_last_seen" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH matching_chat_ids AS (
    SELECT
      m.chat_id,
      bool_or(m.handle = ('portal-test@' || lower(trim(p_brand_key)))) AS is_portal_test,
      max(m.created_at) AS last_brand_message_at
    FROM public.conversation_messages m
    WHERE m.expires_at > p_now
      AND (
        (m.engagement_scope = 'brand' AND m.engagement_brand_key = lower(trim(p_brand_key)))
        OR m.handle = ('portal-test@' || lower(trim(p_brand_key)))
      )
    GROUP BY m.chat_id
    ORDER BY max(m.created_at) DESC
    LIMIT greatest(1, least(p_chat_limit, 500))
  ),
  latest AS (
    SELECT DISTINCT ON (m.chat_id)
      m.chat_id,
      m.role AS preview_role,
      m.content AS preview_content,
      m.created_at AS last_message_at
    FROM public.conversation_messages m
    JOIN matching_chat_ids mc ON mc.chat_id = m.chat_id
    WHERE m.expires_at > p_now
      AND (
        (m.engagement_scope = 'brand' AND m.engagement_brand_key = lower(trim(p_brand_key)))
        OR m.handle = ('portal-test@' || lower(trim(p_brand_key)))
      )
    ORDER BY m.chat_id, m.created_at DESC
  ),
  last_user AS (
    SELECT DISTINCT ON (m.chat_id)
      m.chat_id,
      m.created_at AS last_customer_message_at
    FROM public.conversation_messages m
    JOIN matching_chat_ids mc ON mc.chat_id = m.chat_id
    WHERE m.expires_at > p_now
      AND m.role = 'user'
      AND (
        (m.engagement_scope = 'brand' AND m.engagement_brand_key = lower(trim(p_brand_key)))
        OR m.handle = ('portal-test@' || lower(trim(p_brand_key)))
      )
    ORDER BY m.chat_id, m.created_at DESC
  ),
  user_handle AS (
    SELECT DISTINCT ON (m.chat_id)
      m.chat_id,
      m.handle AS participant_handle
    FROM public.conversation_messages m
    JOIN matching_chat_ids mc ON mc.chat_id = m.chat_id
    WHERE m.expires_at > p_now
      AND m.role = 'user'
      AND m.handle IS NOT NULL
      AND length(trim(m.handle)) > 0
      AND (
        (m.engagement_scope = 'brand' AND m.engagement_brand_key = lower(trim(p_brand_key)))
        OR m.handle = ('portal-test@' || lower(trim(p_brand_key)))
      )
    ORDER BY m.chat_id, m.created_at DESC
  )
  SELECT
    l.chat_id,
    l.last_message_at,
    l.preview_role,
    l.preview_content,
    u.last_customer_message_at,
    uh.participant_handle,
    mc.is_portal_test,
    nullif(trim(coalesce(up.display_name, up.name)), '') AS profile_display_name,
    up.last_seen AS profile_last_seen
  FROM latest l
  JOIN matching_chat_ids mc ON mc.chat_id = l.chat_id
  LEFT JOIN last_user u ON u.chat_id = l.chat_id
  LEFT JOIN user_handle uh ON uh.chat_id = l.chat_id
  LEFT JOIN public.user_profiles up ON up.handle = uh.participant_handle
  ORDER BY l.last_message_at DESC;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_debug_lightspeed_cron_jobs"() RETURNS TABLE("jobid" bigint, "jobname" "text", "schedule" "text", "command" "text", "active" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'cron', 'public'
    AS $$
  SELECT j.jobid, j.jobname, j.schedule, j.command::text, j.active
  FROM cron.job j
  WHERE j.jobname LIKE '%lightspeed%'
  ORDER BY j.jobname;
$$;
CREATE OR REPLACE FUNCTION "public"."nest_pg_net_lightspeed_sales_ping"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select net.http_post(
    url := rtrim(s.supabase_url, '/') || '/functions/v1/lightspeed-sync-sales-workorders',
    headers := jsonb_build_object(
      'x-internal-secret', s.internal_shared_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  from public.nest_pg_net_edge_settings s
  where s.id = 1;
$$;
COMMENT ON FUNCTION "public"."nest_pg_net_lightspeed_sales_ping"() IS 'Returns pg_net request id; verifies nest_pg_net_edge_settings + x-internal-secret scheduled auth path.';
CREATE OR REPLACE FUNCTION "public"."pipedream_advance_automation"("p_automation_id" "uuid", "p_success" boolean DEFAULT true, "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_spec     jsonb;
  v_status   text;
  v_freq     text;
  v_tz       text;
  v_time     text;
  v_day      text;
  v_cron     text;
  v_next     timestamptz;
  v_failures integer;
begin
  select spec, status, consecutive_failures
  into v_spec, v_status, v_failures
  from public.pipedream_automations
  where id = p_automation_id;

  if not found then return; end if;

  v_freq := v_spec->'trigger'->'schedule'->>'frequency';
  v_tz   := coalesce(v_spec->'trigger'->'schedule'->>'timezone', 'Australia/Sydney');
  v_time := v_spec->'trigger'->'schedule'->>'time';
  v_day  := v_spec->'trigger'->'schedule'->>'day';
  v_cron := v_spec->'trigger'->'schedule'->>'cron';

  -- Compute next_run_at (only for schedule-driven; event-driven leaves it null)
  if v_spec->>'trigger_kind' = 'schedule' then
    if v_freq = 'minutely' then
      v_next := now() + interval '1 minute';
    elsif v_freq = 'hourly' then
      v_next := now() + interval '1 hour';
    elsif v_freq = 'weekly' then
      v_next := coalesce(
        (select next_run_at + interval '7 days' from public.pipedream_automations where id = p_automation_id),
        now() + interval '7 days');
    elsif v_freq = 'monthly' then
      v_next := coalesce(
        (select next_run_at + interval '1 month' from public.pipedream_automations where id = p_automation_id),
        now() + interval '1 month');
    else
      -- daily fallback
      v_next := coalesce(
        (select next_run_at + interval '1 day' from public.pipedream_automations where id = p_automation_id),
        now() + interval '1 day');
    end if;

    -- Leap forward if we're behind (cron was down)
    while v_next is not null and v_next <= now() loop
      if v_freq = 'minutely' then v_next := v_next + interval '1 minute';
      elsif v_freq = 'hourly' then v_next := v_next + interval '1 hour';
      elsif v_freq = 'weekly' then v_next := v_next + interval '7 days';
      elsif v_freq = 'monthly' then v_next := v_next + interval '1 month';
      else v_next := v_next + interval '1 day';
      end if;
    end loop;
  end if;

  -- Failure handling: pause after 3 consecutive failures
  if not p_success then
    v_failures := coalesce(v_failures, 0) + 1;
    if v_failures >= 3 then
      v_status := 'error';
    end if;
  else
    v_failures := 0;
  end if;

  update public.pipedream_automations
  set last_run_at          = now(),
      next_run_at          = case
        when v_spec->>'trigger_kind' = 'schedule' then v_next
        else next_run_at
      end,
      execution_lock       = null,
      execution_lock_at    = null,
      consecutive_failures = v_failures,
      last_error           = p_error,
      status               = case
        when v_status = 'error' then 'error'
        else status
      end,
      updated_at           = now()
  where id = p_automation_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."pipedream_claim_due_automations"("p_limit" integer DEFAULT 50) RETURNS TABLE("automation_id" "uuid", "user_id" "uuid", "handle" "text", "spec" "jsonb", "trust_state" "jsonb", "risk_level" "text", "next_run_at" timestamp with time zone, "consecutive_failures" integer)
    LANGUAGE "plpgsql"
    AS $$
declare
  v_lock uuid := gen_random_uuid();
begin
  return query
  with claimed as (
    select pa.id
    from public.pipedream_automations pa
    where pa.status = 'active'
      and pa.next_run_at is not null
      and pa.next_run_at <= now()
      and (pa.execution_lock is null
           or pa.execution_lock_at < now() - interval '5 minutes')
    order by pa.next_run_at asc
    limit p_limit
    for update skip locked
  )
  update public.pipedream_automations pa
  set execution_lock = v_lock,
      execution_lock_at = now()
  from claimed
  where pa.id = claimed.id
  returning pa.id, pa.user_id, pa.handle, pa.spec, pa.trust_state,
            pa.risk_level, pa.next_run_at, pa.consecutive_failures;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."pipedream_record_webhook_event"("p_pd_deployed_trigger_id" "text", "p_pd_event_id" "text", "p_payload_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into public.pipedream_webhook_events (
    pd_deployed_trigger_id, pd_event_id, payload_hash
  ) values (
    p_pd_deployed_trigger_id, p_pd_event_id, p_payload_hash
  )
  on conflict (pd_deployed_trigger_id, pd_event_id) do nothing;

  -- A row was inserted (returning xmax = 0) iff this is the first time we
  -- saw this event. We don't strictly need that level of nicety; the
  -- presence of an existing row means duplicate.
  return found;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."pipedream_release_lock"("p_automation_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update public.pipedream_automations
  set execution_lock = null,
      execution_lock_at = null
  where id = p_automation_id;
$$;
CREATE OR REPLACE FUNCTION "public"."pipedream_send_gate"("p_user_id" "uuid", "p_kind" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_runs_24h    integer;
  v_last_proact timestamptz;
  v_handle      text;
begin
  -- Hard cap: 100 runs / 24h
  select count(*) into v_runs_24h
  from public.pipedream_automation_runs
  where user_id = p_user_id
    and started_at > now() - interval '24 hours'
    and outcome in ('success', 'partial');
  if v_runs_24h >= 100 then return false; end if;

  -- Schedule-driven respects the existing 2h proactive gap
  if p_kind = 'schedule' then
    select up.handle, up.last_proactive_sent_at
    into v_handle, v_last_proact
    from public.user_profiles up
    where up.auth_user_id = p_user_id
    limit 1;

    if v_last_proact is not null
       and v_last_proact > now() - interval '2 hours' then
      return false;
    end if;
  end if;

  return true;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."pipedream_set_trust_auto_approve"("p_automation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_existing jsonb;
  v_count    integer;
  v_last     text;
begin
  select trust_state into v_existing
  from public.pipedream_automations
  where id = p_automation_id;

  if not found then return; end if;

  -- Preserve the count + last_confirmed_at, just flip auto_approve.
  v_count := coalesce((v_existing->>'confirmed_run_count')::integer, 0);
  v_last  := v_existing->>'last_confirmed_at';

  update public.pipedream_automations
  set trust_state = jsonb_build_object(
        'auto_approve', true,
        'confirmed_run_count', v_count,
        'last_confirmed_at', coalesce(v_last, now()::text)
      ),
      updated_at = now()
  where id = p_automation_id;
end;
$$;
COMMENT ON FUNCTION "public"."pipedream_set_trust_auto_approve"("p_automation_id" "uuid") IS 'Flip auto_approve=true on a Pipedream automation, preserving existing trust counters. Called from the orchestrator hook when the user replies "always" to a high-risk approval.';
CREATE OR REPLACE FUNCTION "public"."quid_active_connection_fingerprint"("p_quid_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    md5(string_agg(c.id::text, ',' order by c.id::text)),
    md5('no-active-connections')
  )
  from public.fiskil_connections c
  where c.quid_user_id = p_quid_user_id
    and c.status = 'active';
$$;
CREATE OR REPLACE FUNCTION "public"."quid_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."read_queue_messages"("p_queue_name" "text", "p_sleep_seconds" integer, "p_n" integer) RETURNS TABLE("msg_id" bigint, "read_ct" bigint, "enqueued_at" timestamp with time zone, "vt" timestamp with time zone, "message" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pgmq'
    AS $$
  select msg_id, read_ct, enqueued_at, vt, message
  from pgmq.read(p_queue_name, p_sleep_seconds, p_n);
$$;
CREATE OR REPLACE FUNCTION "public"."record_automation_run"("p_handle" "text", "p_chat_id" "text", "p_automation_type" "text", "p_content" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_manual_trigger" boolean DEFAULT false, "p_triggered_by" "text" DEFAULT 'system'::"text") RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.automation_runs (handle, chat_id, automation_type, content, metadata, manual_trigger, triggered_by)
  values (p_handle, p_chat_id, p_automation_type, p_content, p_metadata, p_manual_trigger, p_triggered_by)
  returning id into v_id;

  -- Update last proactive sent timestamp on user profile
  update public.user_profiles
  set last_proactive_sent_at = now()
  where handle = p_handle;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."record_customer_automation_evaluation"("p_handle" "text", "p_rule_key" "text", "p_outcome" "text", "p_reason" "text" DEFAULT NULL::"text", "p_metric_value" bigint DEFAULT NULL::bigint, "p_profile_snapshot" "jsonb" DEFAULT '{}'::"jsonb", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_triggered_by" "text" DEFAULT 'system'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.customer_automation_rule_state (
    handle,
    rule_key,
    last_evaluated_at,
    last_outcome,
    last_reason,
    last_metric_value,
    last_profile_snapshot,
    last_metadata,
    first_eligible_at,
    last_triggered_by,
    created_at,
    updated_at
  )
  values (
    p_handle,
    p_rule_key,
    now(),
    p_outcome,
    p_reason,
    p_metric_value,
    coalesce(p_profile_snapshot, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb),
    case when p_outcome = 'eligible' then now() else null end,
    p_triggered_by,
    now(),
    now()
  )
  on conflict (handle, rule_key) do update
  set
    last_evaluated_at = now(),
    last_outcome = p_outcome,
    last_reason = p_reason,
    last_metric_value = p_metric_value,
    last_profile_snapshot = coalesce(p_profile_snapshot, '{}'::jsonb),
    last_metadata = coalesce(p_metadata, '{}'::jsonb),
    first_eligible_at = case
      when p_outcome = 'eligible'
        then coalesce(public.customer_automation_rule_state.first_eligible_at, now())
      else public.customer_automation_rule_state.first_eligible_at
    end,
    last_triggered_by = p_triggered_by,
    updated_at = now();
end;
$$;
CREATE OR REPLACE FUNCTION "public"."record_moment_execution"("p_moment_id" "uuid", "p_moment_version" integer, "p_handle" "text", "p_chat_id" "text", "p_status" "public"."moment_exec_status", "p_skip_reason" "text" DEFAULT NULL::"text", "p_rendered_content" "text" DEFAULT NULL::"text", "p_prompt_used" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_error_message" "text" DEFAULT NULL::"text", "p_execution_ms" integer DEFAULT NULL::integer, "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.moment_executions (
    moment_id, moment_version, handle, chat_id,
    status, skip_reason, rendered_content, prompt_used,
    sent_at, metadata, error_message, execution_ms, idempotency_key
  )
  values (
    p_moment_id, p_moment_version, p_handle, p_chat_id,
    p_status, p_skip_reason, p_rendered_content, p_prompt_used,
    case when p_status = 'sent' then now() else null end,
    p_metadata, p_error_message, p_execution_ms,
    coalesce(p_idempotency_key, p_moment_id::text || ':' || p_handle || ':' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null and p_status = 'sent' then
    update public.user_profiles
    set last_proactive_sent_at = now()
    where handle = p_handle;
  end if;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."record_proactive_message"("p_handle" "text", "p_chat_id" "text", "p_message_type" "text", "p_content" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.proactive_messages (
    handle, chat_id, message_type, content, metadata
  )
  values (
    p_handle, p_chat_id, p_message_type, p_content,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  update public.user_profiles
  set last_proactive_sent_at = now()
  where handle = p_handle;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."record_webhook_event"("p_provider" "text", "p_account_email" "text", "p_subscription_id" "uuid", "p_history_id" "text" DEFAULT NULL::"text", "p_resource_data" "jsonb" DEFAULT NULL::"jsonb", "p_change_type" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.email_webhook_events (
    provider, account_email, subscription_id,
    history_id, resource_data, change_type
  )
  values (
    p_provider, p_account_email, p_subscription_id,
    p_history_id, p_resource_data, p_change_type
  )
  returning id into v_id;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."record_webhook_event"("p_provider" "text", "p_account_email" "text", "p_subscription_id" "uuid", "p_history_id" "text" DEFAULT NULL::"text", "p_resource_data" "jsonb" DEFAULT NULL::"jsonb", "p_change_type" "text" DEFAULT NULL::"text", "p_source_type" "text" DEFAULT 'email'::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
begin
  insert into public.notification_webhook_events (
    provider, account_email, subscription_id,
    history_id, resource_data, change_type, source_type
  )
  values (
    p_provider, p_account_email, p_subscription_id,
    p_history_id, p_resource_data, p_change_type, p_source_type
  )
  returning id into v_id;

  return v_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."save_conversation_summary"("p_chat_id" "text", "p_sender_handle" "text", "p_engagement_scope" "text", "p_engagement_brand_key" "text", "p_summary" "text", "p_topics" "text"[], "p_open_loops" "text"[], "p_summary_kind" "text", "p_first_message_at" timestamp with time zone, "p_last_message_at" timestamp with time zone, "p_message_count" integer, "p_confidence" numeric, "p_source_message_ids" "jsonb", "p_extractor_version" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id bigint;
  v_scope text := coalesce(p_engagement_scope, 'nest');
  v_brand_key text := nullif(lower(trim(coalesce(p_engagement_brand_key, ''))), '');
BEGIN
  IF v_scope NOT IN ('nest', 'brand') THEN
    RAISE EXCEPTION 'invalid engagement scope: %', v_scope;
  END IF;

  IF v_scope = 'brand' AND v_brand_key IS NULL THEN
    RAISE EXCEPTION 'brand engagement requires p_engagement_brand_key';
  END IF;

  IF v_scope = 'nest' THEN
    v_brand_key := null;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversation_summaries
    WHERE chat_id = p_chat_id
      AND engagement_scope = v_scope
      AND engagement_brand_key IS NOT DISTINCT FROM v_brand_key
      AND last_message_at >= p_last_message_at
  ) THEN
    RETURN null;
  END IF;

  INSERT INTO public.conversation_summaries (
    chat_id,
    sender_handle,
    engagement_scope,
    engagement_brand_key,
    summary,
    topics,
    open_loops,
    summary_kind,
    first_message_at,
    last_message_at,
    message_count,
    confidence,
    source_message_ids,
    extractor_version
  )
  VALUES (
    p_chat_id,
    p_sender_handle,
    v_scope,
    v_brand_key,
    p_summary,
    coalesce(p_topics, '{}'),
    coalesce(p_open_loops, '{}'),
    p_summary_kind,
    p_first_message_at,
    p_last_message_at,
    p_message_count,
    p_confidence,
    coalesce(p_source_message_ids, '[]'::jsonb),
    p_extractor_version
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."save_moment_version"("p_moment_id" "uuid", "p_changed_by" "text", "p_change_summary" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_version integer;
  v_snapshot jsonb;
begin
  select version into v_version from moments where id = p_moment_id;
  select to_jsonb(m) into v_snapshot from moments m where m.id = p_moment_id;

  insert into moment_versions (moment_id, version, snapshot, changed_by, change_summary)
  values (p_moment_id, v_version, v_snapshot, p_changed_by, p_change_summary)
  on conflict (moment_id, version) do update
    set snapshot = excluded.snapshot,
        changed_by = excluded.changed_by,
        change_summary = excluded.change_summary,
        created_at = now();

  return v_version;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."set_entity_core"("p_entity_id" bigint, "p_is_core" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.entities
     set is_core = p_is_core,
         updated_at = now()
   where id = p_entity_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."set_user_name_atomic"("p_handle" "text", "p_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now bigint := extract(epoch from now())::bigint;
  v_existing_name text;
begin
  insert into public.user_profiles (handle, name, facts, first_seen, last_seen)
  values (p_handle, null, '[]'::jsonb, v_now, v_now)
  on conflict (handle) do nothing;

  select name
    into v_existing_name
  from public.user_profiles
  where handle = p_handle
  for update;

  if v_existing_name = p_name then
    update public.user_profiles
      set last_seen = v_now
      where handle = p_handle;
    return false;
  end if;

  update public.user_profiles
    set name = p_name,
        last_seen = v_now
    where handle = p_handle;

  return true;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."supersede_memory_item"("p_old_id" bigint, "p_new_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.memory_items
    set status = 'superseded',
        updated_at = now()
    where id = p_old_id
      and status = 'active';

  update public.memory_items
    set supersedes_memory_id = p_old_id,
        updated_at = now()
    where id = p_new_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."sync_analytics_message_fact"("p_message_id" bigint) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  INSERT INTO public.analytics_message_facts (
    source_message_id,
    chat_id,
    sender_handle,
    role,
    message_direction,
    engagement_scope,
    engagement_brand_key,
    created_at,
    created_day_mel,
    created_week_monday_mel,
    created_hour_mel,
    created_dow_mel,
    daypart,
    is_group_chat,
    service,
    chat_name,
    participant_count,
    is_portal_test,
    message_length,
    word_count,
    content_preview,
    metadata
  )
  SELECT
    m.id,
    m.chat_id,
    nullif(trim(m.handle), '') AS sender_handle,
    m.role,
    CASE WHEN m.role = 'user' THEN 'inbound' ELSE 'outbound' END AS message_direction,
    m.engagement_scope,
    m.engagement_brand_key,
    m.created_at,
    (m.created_at AT TIME ZONE 'Australia/Melbourne')::date AS created_day_mel,
    (
      date_trunc('week', (m.created_at AT TIME ZONE 'Australia/Melbourne')::timestamp)
    )::date AS created_week_monday_mel,
    extract(hour FROM (m.created_at AT TIME ZONE 'Australia/Melbourne'))::smallint AS created_hour_mel,
    extract(isodow FROM (m.created_at AT TIME ZONE 'Australia/Melbourne'))::smallint AS created_dow_mel,
    public.analytics_message_daypart(extract(hour FROM (m.created_at AT TIME ZONE 'Australia/Melbourne'))::integer) AS daypart,
    coalesce((m.metadata->>'is_group_chat')::boolean, false) AS is_group_chat,
    nullif(trim(m.metadata->>'service'), '') AS service,
    nullif(trim(m.metadata->>'chat_name'), '') AS chat_name,
    CASE
      WHEN jsonb_typeof(m.metadata->'participant_names') = 'array'
        THEN jsonb_array_length(m.metadata->'participant_names')
      ELSE 0
    END AS participant_count,
    (
      m.chat_id LIKE 'portal-test#%'
      OR coalesce(m.handle, '') LIKE 'portal-test@%'
    ) AS is_portal_test,
    char_length(coalesce(m.content, '')) AS message_length,
    CASE
      WHEN length(trim(coalesce(m.content, ''))) = 0 THEN 0
      ELSE cardinality(regexp_split_to_array(trim(m.content), '\s+'))
    END AS word_count,
    left(regexp_replace(coalesce(m.content, ''), '\s+', ' ', 'g'), 280) AS content_preview,
    coalesce(m.metadata, '{}'::jsonb) AS metadata
  FROM public.conversation_messages m
  WHERE m.id = p_message_id
  ON CONFLICT (source_message_id) DO UPDATE
    SET chat_id = excluded.chat_id,
        sender_handle = excluded.sender_handle,
        role = excluded.role,
        message_direction = excluded.message_direction,
        engagement_scope = excluded.engagement_scope,
        engagement_brand_key = excluded.engagement_brand_key,
        created_at = excluded.created_at,
        created_day_mel = excluded.created_day_mel,
        created_week_monday_mel = excluded.created_week_monday_mel,
        created_hour_mel = excluded.created_hour_mel,
        created_dow_mel = excluded.created_dow_mel,
        daypart = excluded.daypart,
        is_group_chat = excluded.is_group_chat,
        service = excluded.service,
        chat_name = excluded.chat_name,
        participant_count = excluded.participant_count,
        is_portal_test = excluded.is_portal_test,
        message_length = excluded.message_length,
        word_count = excluded.word_count,
        content_preview = excluded.content_preview,
        metadata = excluded.metadata;
$$;
CREATE OR REPLACE FUNCTION "public"."touch_bill_reminder_automation_after_send"("p_trigger_id" bigint) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.user_automations
  set last_run_at = now(),
      updated_at = now()
  where active = true
    and automation_type = 'bill_reminders'
    and coalesce((config->>'bill_trigger_id')::bigint, 0) = p_trigger_id;
$$;
CREATE OR REPLACE FUNCTION "public"."trigger_upsert_api_daily_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only aggregate successful calls with a non-null user
  if NEW.status = 'success' and NEW.user_id is not null then
    -- Main daily rollup
    perform upsert_api_daily_usage(
      NEW.user_id,
      NEW.cost_usd,
      NEW.cost_usd_no_cache,
      NEW.tokens_in,
      NEW.tokens_out,
      NEW.tokens_in_cached,
      NEW.tokens_reasoning
    );

    -- Provider-level rollup
    perform upsert_api_daily_usage_by_provider(
      NEW.user_id,
      NEW.provider,
      NEW.cost_usd,
      NEW.cost_usd_no_cache,
      NEW.tokens_in,
      NEW.tokens_out,
      NEW.tokens_in_cached,
      NEW.tokens_reasoning
    );

    -- Message-type rollup
    perform upsert_api_daily_usage_by_message_type(
      NEW.user_id,
      NEW.message_type,
      NEW.cost_usd,
      NEW.tokens_in,
      NEW.tokens_out
    );
  end if;
  return NEW;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."try_claim_email_watch_delivery"("p_trigger_id" bigint, "p_provider" "text", "p_provider_message_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inserted int;
begin
  if p_provider is null or p_provider not in ('google', 'microsoft') then
    return true;
  end if;
  if p_provider_message_id is null or length(trim(p_provider_message_id)) = 0 then
    return true;
  end if;

  insert into public.email_watch_trigger_deliveries (trigger_id, provider, provider_message_id)
  values (p_trigger_id, p_provider, trim(p_provider_message_id))
  on conflict (trigger_id, provider, provider_message_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted > 0;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."update_entity_compiled_truth"("p_entity_id" bigint, "p_compiled_truth" "text", "p_importance_score" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.entities
     set compiled_truth = p_compiled_truth,
         compiled_truth_updated_at = now(),
         importance_score = coalesce(p_importance_score, importance_score),
         updated_at = now()
   where id = p_entity_id;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."update_onboard_state_machine"("p_handle" "text", "p_new_state" "text", "p_entry_state" "text" DEFAULT NULL::"text", "p_first_value_wedge" "text" DEFAULT NULL::"text", "p_first_value_delivered" boolean DEFAULT false, "p_follow_through_delivered" boolean DEFAULT false, "p_second_engagement" boolean DEFAULT false, "p_checkin_opt_in" boolean DEFAULT NULL::boolean, "p_memory_moment_delivered" boolean DEFAULT false, "p_activated" boolean DEFAULT false, "p_at_risk" boolean DEFAULT false, "p_capability_category" "text" DEFAULT NULL::"text", "p_timezone" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old_state text;
  v_now timestamptz := now();
  v_categories text[];
  v_score integer;
begin
  select onboard_state into v_old_state
  from public.user_profiles
  where handle = p_handle;

  if v_old_state is null then
    return null;
  end if;

  update public.user_profiles
  set
    onboard_state = p_new_state,
    entry_state = coalesce(p_entry_state, entry_state),
    first_value_wedge = coalesce(p_first_value_wedge, first_value_wedge),
    first_value_delivered_at = case when p_first_value_delivered and first_value_delivered_at is null then v_now else first_value_delivered_at end,
    follow_through_delivered_at = case when p_follow_through_delivered and follow_through_delivered_at is null then v_now else follow_through_delivered_at end,
    second_engagement_at = case when p_second_engagement and second_engagement_at is null then v_now else second_engagement_at end,
    checkin_opt_in = coalesce(p_checkin_opt_in, checkin_opt_in),
    checkin_decline_at = case when p_checkin_opt_in = false then v_now else checkin_decline_at end,
    checkin_last_permission_at = case when p_checkin_opt_in is not null then v_now else checkin_last_permission_at end,
    memory_moment_delivered_at = case when p_memory_moment_delivered and memory_moment_delivered_at is null then v_now else memory_moment_delivered_at end,
    activated_at = case when p_activated and activated_at is null then v_now else activated_at end,
    at_risk_at = case when p_at_risk and at_risk_at is null then v_now else at_risk_at end,
    timezone = coalesce(p_timezone, timezone),
    capability_categories_used = case
      when p_capability_category is not null and not (capability_categories_used @> array[p_capability_category])
      then capability_categories_used || array[p_capability_category]
      else capability_categories_used
    end
  where handle = p_handle;

  -- Recompute activation score
  select capability_categories_used into v_categories
  from public.user_profiles where handle = p_handle;

  v_score := 0;
  -- Criterion 1: 2+ meaningful inbound messages (onboard_count >= 3 means at least 2 after opener)
  if (select onboard_count from public.user_profiles where handle = p_handle) >= 3 then
    v_score := v_score + 1;
  end if;
  -- Criterion 2: successful follow-through
  if (select follow_through_delivered_at from public.user_profiles where handle = p_handle) is not null then
    v_score := v_score + 1;
  end if;
  -- Criterion 3: check-in opt-in
  if (select checkin_opt_in from public.user_profiles where handle = p_handle) = true then
    v_score := v_score + 1;
  end if;
  -- Criterion 4: day-2 return (first_seen + 24h < second_engagement)
  if (select second_engagement_at from public.user_profiles where handle = p_handle) is not null
     and (select second_engagement_at from public.user_profiles where handle = p_handle)
         > to_timestamp((select first_seen from public.user_profiles where handle = p_handle)) + interval '20 hours' then
    v_score := v_score + 1;
  end if;
  -- Criterion 5: memory moment delivered
  if (select memory_moment_delivered_at from public.user_profiles where handle = p_handle) is not null then
    v_score := v_score + 1;
  end if;
  -- Criterion 6: second capability category used
  if array_length(v_categories, 1) >= 2 then
    v_score := v_score + 1;
  end if;

  update public.user_profiles
  set activation_score = v_score
  where handle = p_handle;

  return v_old_state;
end;
$$;
CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."upsert_api_daily_usage"("p_user_id" "uuid", "p_cost_usd" numeric, "p_cost_usd_no_cache" numeric, "p_tokens_in" integer, "p_tokens_out" integer, "p_tokens_cached" integer, "p_tokens_reasoning" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into api_daily_usage (
    date, user_id,
    daily_cost_usd, cost_usd_no_cache, cache_savings_usd,
    tokens_in, tokens_out, tokens_total,
    tokens_cached, tokens_reasoning,
    request_count, updated_at
  )
  values (
    current_date, p_user_id,
    p_cost_usd, p_cost_usd_no_cache, p_cost_usd_no_cache - p_cost_usd,
    p_tokens_in, p_tokens_out, p_tokens_in + p_tokens_out,
    p_tokens_cached, p_tokens_reasoning,
    1, now()
  )
  on conflict (date, user_id)
  do update set
    daily_cost_usd    = api_daily_usage.daily_cost_usd    + excluded.daily_cost_usd,
    cost_usd_no_cache = api_daily_usage.cost_usd_no_cache + excluded.cost_usd_no_cache,
    cache_savings_usd = api_daily_usage.cache_savings_usd + (excluded.cost_usd_no_cache - excluded.daily_cost_usd),
    tokens_in         = api_daily_usage.tokens_in         + excluded.tokens_in,
    tokens_out        = api_daily_usage.tokens_out        + excluded.tokens_out,
    tokens_total      = api_daily_usage.tokens_total      + excluded.tokens_total,
    tokens_cached     = api_daily_usage.tokens_cached     + excluded.tokens_cached,
    tokens_reasoning  = api_daily_usage.tokens_reasoning  + excluded.tokens_reasoning,
    request_count     = api_daily_usage.request_count     + 1,
    updated_at        = now();
$$;
CREATE OR REPLACE FUNCTION "public"."upsert_api_daily_usage_by_message_type"("p_user_id" "uuid", "p_message_type" "text", "p_cost_usd" numeric, "p_tokens_in" integer, "p_tokens_out" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into api_daily_usage_by_message_type (
    date, user_id, message_type,
    daily_cost_usd,
    tokens_in, tokens_out, tokens_total,
    request_count, updated_at
  )
  values (
    current_date, p_user_id, p_message_type,
    p_cost_usd,
    p_tokens_in, p_tokens_out, p_tokens_in + p_tokens_out,
    1, now()
  )
  on conflict (date, user_id, message_type)
  do update set
    daily_cost_usd = api_daily_usage_by_message_type.daily_cost_usd + excluded.daily_cost_usd,
    tokens_in      = api_daily_usage_by_message_type.tokens_in      + excluded.tokens_in,
    tokens_out     = api_daily_usage_by_message_type.tokens_out     + excluded.tokens_out,
    tokens_total   = api_daily_usage_by_message_type.tokens_total   + excluded.tokens_total,
    request_count  = api_daily_usage_by_message_type.request_count  + 1,
    updated_at     = now();
$$;
CREATE OR REPLACE FUNCTION "public"."upsert_api_daily_usage_by_provider"("p_user_id" "uuid", "p_provider" "text", "p_cost_usd" numeric, "p_cost_usd_no_cache" numeric, "p_tokens_in" integer, "p_tokens_out" integer, "p_tokens_cached" integer, "p_tokens_reasoning" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into api_daily_usage_by_provider (
    date, user_id, provider,
    daily_cost_usd, cost_usd_no_cache, cache_savings_usd,
    tokens_in, tokens_out, tokens_total,
    tokens_cached, tokens_reasoning,
    request_count, updated_at
  )
  values (
    current_date, p_user_id, p_provider,
    p_cost_usd, p_cost_usd_no_cache, p_cost_usd_no_cache - p_cost_usd,
    p_tokens_in, p_tokens_out, p_tokens_in + p_tokens_out,
    p_tokens_cached, p_tokens_reasoning,
    1, now()
  )
  on conflict (date, user_id, provider)
  do update set
    daily_cost_usd    = api_daily_usage_by_provider.daily_cost_usd    + excluded.daily_cost_usd,
    cost_usd_no_cache = api_daily_usage_by_provider.cost_usd_no_cache + excluded.cost_usd_no_cache,
    cache_savings_usd = api_daily_usage_by_provider.cache_savings_usd + (excluded.cost_usd_no_cache - excluded.daily_cost_usd),
    tokens_in         = api_daily_usage_by_provider.tokens_in         + excluded.tokens_in,
    tokens_out        = api_daily_usage_by_provider.tokens_out        + excluded.tokens_out,
    tokens_total      = api_daily_usage_by_provider.tokens_total      + excluded.tokens_total,
    tokens_cached     = api_daily_usage_by_provider.tokens_cached     + excluded.tokens_cached,
    tokens_reasoning  = api_daily_usage_by_provider.tokens_reasoning  + excluded.tokens_reasoning,
    request_count     = api_daily_usage_by_provider.request_count     + 1,
    updated_at        = now();
$$;
CREATE OR REPLACE FUNCTION "public"."upsert_entity"("p_handle" "text", "p_entity_type" "text", "p_canonical_name" "text", "p_aliases" "text"[] DEFAULT '{}'::"text"[], "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id bigint;
  v_existing_aliases text[];
begin
  select id, aliases into v_id, v_existing_aliases
  from public.entities
  where handle = p_handle
    and status = 'active'
    and lower(canonical_name) = lower(p_canonical_name)
    and entity_type = p_entity_type
  limit 1;

  if v_id is not null then
    update public.entities
       set aliases = (
             select array(
               select distinct unnest(coalesce(v_existing_aliases, '{}') || coalesce(p_aliases, '{}'))
             )
           ),
           mention_count = mention_count + 1,
           last_mentioned_at = now(),
           updated_at = now(),
           metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
     where id = v_id;
    return v_id;
  end if;

  insert into public.entities (
    handle, entity_type, canonical_name, aliases,
    mention_count, metadata
  )
  values (
    p_handle, p_entity_type, p_canonical_name,
    coalesce(p_aliases, '{}'),
    1, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;
CREATE TABLE IF NOT EXISTS "full_review"."affect_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "window_start" timestamp with time zone,
    "window_end" timestamp with time zone,
    "mood_summary" "jsonb",
    "energy_summary" "jsonb",
    "per_person_health" "jsonb",
    "confidence" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "full_review"."candidate_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "raw_event_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "surface_form" "text" NOT NULL,
    "normalized_name" "text",
    "identifiers" "jsonb",
    "context_hints" "text"[],
    "relationship_hint" "text",
    "confidence" numeric,
    "resolved_entity_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "full_review"."chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "stage" "text" NOT NULL,
    "sequence" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "input" "jsonb",
    "output" "jsonb",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "cost_usd" numeric(10,4) DEFAULT 0 NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone,
    "error" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chunks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'done'::"text", 'failed'::"text"])))
);
CREATE TABLE IF NOT EXISTS "full_review"."claim_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "claim_id" "uuid" NOT NULL,
    "corrected_by" "text",
    "correction" "jsonb" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "full_review"."claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "subject_entity_id" "uuid",
    "predicate" "text" NOT NULL,
    "object_entity_id" "uuid",
    "object_literal" "jsonb",
    "confidence" numeric NOT NULL,
    "authored_at" timestamp with time zone,
    "ingested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_id" "uuid",
    "derivation" "uuid"[],
    "supersedes" "uuid",
    "superseded_by" "uuid",
    "contradicts" "uuid"[],
    "perspective_holder" "uuid",
    "zone" "text" DEFAULT 'personal'::"text" NOT NULL,
    "visibility" "jsonb",
    "affect_tag" "jsonb",
    "forget_after" timestamp with time zone,
    "forgotten" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "claims_zone_check" CHECK (("zone" = ANY (ARRAY['personal'::"text", 'work'::"text", 'mixed'::"text"])))
);
CREATE TABLE IF NOT EXISTS "full_review"."entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "importance_tier" "text",
    "first_seen_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "entities_importance_tier_check" CHECK (("importance_tier" = ANY (ARRAY['self'::"text", 'close'::"text", 'friend'::"text", 'colleague'::"text", 'acquaintance'::"text", 'background'::"text"]))),
    CONSTRAINT "entities_type_check" CHECK (("type" = ANY (ARRAY['person'::"text", 'org'::"text", 'place'::"text", 'project'::"text", 'event'::"text", 'pet'::"text", 'possession'::"text", 'commitment'::"text", 'topic'::"text"])))
);
CREATE TABLE IF NOT EXISTS "full_review"."entity_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "alias_type" "text" NOT NULL,
    "alias_value" "text" NOT NULL,
    "confidence" numeric DEFAULT 1.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "entity_aliases_alias_type_check" CHECK (("alias_type" = ANY (ARRAY['email'::"text", 'phone'::"text", 'handle'::"text", 'display_name'::"text"])))
);
CREATE TABLE IF NOT EXISTS "full_review"."open_loops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "kind" "text",
    "description" "text",
    "due_at" timestamp with time zone,
    "priority" integer,
    "source_claim_ids" "uuid"[],
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "open_loops_kind_check" CHECK (("kind" = ANY (ARRAY['commitment'::"text", 'deadline'::"text", 'overdue'::"text", 'recurring_slip'::"text", 'pending_decision'::"text", 'unanswered_inbound'::"text"]))),
    CONSTRAINT "open_loops_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);
CREATE TABLE IF NOT EXISTS "full_review"."raw_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_ref" "text" NOT NULL,
    "author_hint" "text",
    "counterparty_hints" "text"[],
    "occurred_at" timestamp with time zone,
    "ingested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "channel" "text",
    "payload_text" "text",
    "payload_structured" "jsonb",
    "attachments" "jsonb",
    "location" "jsonb",
    "zone" "text",
    "sensitivity" "text",
    "classifier_confidence" numeric,
    "qualifies_for_extraction" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "raw_events_sensitivity_check" CHECK (("sensitivity" = ANY (ARRAY['general'::"text", 'medical'::"text", 'financial'::"text", 'intimate'::"text"]))),
    CONSTRAINT "raw_events_source_type_check" CHECK (("source_type" = ANY (ARRAY['gmail'::"text", 'outlook'::"text", 'gcal'::"text", 'mscal'::"text", 'contacts'::"text", 'nest'::"text"]))),
    CONSTRAINT "raw_events_zone_check" CHECK (("zone" = ANY (ARRAY['personal'::"text", 'work'::"text", 'mixed'::"text", 'unknown'::"text"])))
);
CREATE TABLE IF NOT EXISTS "full_review"."rendered_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "path" "text" NOT NULL,
    "frontmatter" "jsonb",
    "body_markdown" "text",
    "word_count" integer,
    "claim_refs" "uuid"[],
    "zone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "full_review"."sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "raw_event_id" "uuid",
    "source_type" "text" NOT NULL,
    "source_modality" "text",
    "url" "text",
    "captured_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sources_source_modality_check" CHECK (("source_modality" = ANY (ARRAY['receipt'::"text", 'confirmation'::"text", 'statement'::"text", 'behavior'::"text", 'inference'::"text", 'user_override'::"text"])))
);
CREATE TABLE IF NOT EXISTS "full_review"."user_snapshots" (
    "user_id" "uuid" NOT NULL,
    "current_job_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."api_cost_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "chat_id" "text",
    "sender_handle" "text",
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "endpoint" "text" DEFAULT 'chat'::"text" NOT NULL,
    "description" "text",
    "agent_name" "text",
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "tokens_in" integer DEFAULT 0 NOT NULL,
    "tokens_out" integer DEFAULT 0 NOT NULL,
    "tokens_total" integer GENERATED ALWAYS AS (("tokens_in" + "tokens_out")) STORED,
    "tokens_in_cached" integer DEFAULT 0 NOT NULL,
    "tokens_reasoning" integer DEFAULT 0 NOT NULL,
    "tokens_in_fresh" integer GENERATED ALWAYS AS (("tokens_in" - "tokens_in_cached")) STORED,
    "cost_usd" numeric(12,8) DEFAULT 0 NOT NULL,
    "cost_usd_no_cache" numeric(12,8) DEFAULT 0 NOT NULL,
    "cache_savings_usd" numeric(12,8) GENERATED ALWAYS AS (("cost_usd_no_cache" - "cost_usd")) STORED,
    "latency_ms" integer,
    "agent_loop_round" integer,
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "error_message" "text",
    "metadata" "jsonb"
);
CREATE OR REPLACE VIEW "private"."api_usage_by_agent" AS
 SELECT ("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date" AS "date",
    "user_id",
    "agent_name",
    "model",
    "count"(*) AS "request_count",
    "sum"("tokens_in") AS "tokens_in",
    "sum"("tokens_out") AS "tokens_out",
    "sum"("tokens_in_cached") AS "tokens_cached",
    "sum"("tokens_reasoning") AS "tokens_reasoning",
    "round"("sum"("cost_usd"), 8) AS "cost_usd",
    "round"("sum"("cost_usd_no_cache"), 8) AS "cost_usd_no_cache",
    "round"("avg"("latency_ms")) AS "avg_latency_ms"
   FROM "public"."api_cost_logs"
  WHERE ("status" = 'success'::"text")
  GROUP BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date"), "user_id", "agent_name", "model"
  ORDER BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date") DESC, ("round"("sum"("cost_usd"), 8)) DESC;
CREATE OR REPLACE VIEW "private"."api_usage_by_chat" AS
 SELECT "chat_id",
    "user_id",
    "min"("created_at") AS "first_call",
    "max"("created_at") AS "last_call",
    "count"(*) AS "request_count",
    "sum"("tokens_in") AS "tokens_in",
    "sum"("tokens_out") AS "tokens_out",
    "round"("sum"("cost_usd"), 8) AS "total_cost_usd",
    "round"("avg"("cost_usd"), 8) AS "avg_cost_per_call",
    "round"("avg"("latency_ms")) AS "avg_latency_ms"
   FROM "public"."api_cost_logs"
  WHERE (("status" = 'success'::"text") AND ("chat_id" IS NOT NULL))
  GROUP BY "chat_id", "user_id"
  ORDER BY ("round"("sum"("cost_usd"), 8)) DESC;
CREATE OR REPLACE VIEW "private"."api_usage_by_endpoint" AS
 SELECT ("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date" AS "date",
    "user_id",
    "provider",
    "endpoint",
    "model",
    "count"(*) AS "request_count",
    "sum"("tokens_in") AS "tokens_in",
    "sum"("tokens_out") AS "tokens_out",
    "sum"("tokens_in_cached") AS "tokens_cached",
    "sum"("tokens_reasoning") AS "tokens_reasoning",
    "round"("sum"("cost_usd"), 8) AS "cost_usd",
    "round"("sum"("cost_usd_no_cache"), 8) AS "cost_usd_no_cache",
    "round"("sum"("cache_savings_usd"), 8) AS "cache_savings_usd",
    "round"("avg"("latency_ms")) AS "avg_latency_ms",
    "round"(
        CASE
            WHEN ("sum"("tokens_in") > 0) THEN ((("sum"("tokens_in_cached"))::numeric / ("sum"("tokens_in"))::numeric) * (100)::numeric)
            ELSE (0)::numeric
        END, 1) AS "cache_hit_pct"
   FROM "public"."api_cost_logs"
  WHERE ("status" = 'success'::"text")
  GROUP BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date"), "user_id", "provider", "endpoint", "model"
  ORDER BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date") DESC, ("round"("sum"("cost_usd"), 8)) DESC;
CREATE OR REPLACE VIEW "private"."api_usage_by_message_type" AS
 SELECT ("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date" AS "date",
    "user_id",
    "message_type",
    "count"(*) AS "request_count",
    "sum"("tokens_in") AS "tokens_in",
    "sum"("tokens_out") AS "tokens_out",
    "round"("sum"("cost_usd"), 8) AS "cost_usd",
    "round"("avg"("latency_ms")) AS "avg_latency_ms"
   FROM "public"."api_cost_logs"
  WHERE ("status" = 'success'::"text")
  GROUP BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date"), "user_id", "message_type"
  ORDER BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date") DESC, ("round"("sum"("cost_usd"), 8)) DESC;
CREATE OR REPLACE VIEW "private"."api_usage_by_model" AS
 SELECT ("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date" AS "date",
    "user_id",
    "provider",
    "model",
    "count"(*) AS "request_count",
    "sum"("tokens_in") AS "tokens_in",
    "sum"("tokens_out") AS "tokens_out",
    "sum"("tokens_in_cached") AS "tokens_cached",
    "sum"("tokens_reasoning") AS "tokens_reasoning",
    "round"("sum"("cost_usd"), 8) AS "cost_usd",
    "round"("sum"("cost_usd_no_cache"), 8) AS "cost_usd_no_cache",
    "round"("sum"("cache_savings_usd"), 8) AS "cache_savings_usd",
    "round"("avg"("latency_ms")) AS "avg_latency_ms",
    "round"(
        CASE
            WHEN ("sum"("tokens_in") > 0) THEN ((("sum"("tokens_in_cached"))::numeric / ("sum"("tokens_in"))::numeric) * (100)::numeric)
            ELSE (0)::numeric
        END, 1) AS "cache_hit_pct"
   FROM "public"."api_cost_logs"
  WHERE ("status" = 'success'::"text")
  GROUP BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date"), "user_id", "provider", "model"
  ORDER BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date") DESC, ("round"("sum"("cost_usd"), 8)) DESC;
CREATE OR REPLACE VIEW "private"."api_usage_by_provider" AS
 SELECT ("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date" AS "date",
    "user_id",
    "provider",
    "count"(*) AS "request_count",
    "sum"("tokens_in") AS "tokens_in",
    "sum"("tokens_out") AS "tokens_out",
    "sum"("tokens_in_cached") AS "tokens_cached",
    "sum"("tokens_reasoning") AS "tokens_reasoning",
    "round"("sum"("cost_usd"), 8) AS "cost_usd",
    "round"("sum"("cost_usd_no_cache"), 8) AS "cost_usd_no_cache",
    "round"("sum"("cache_savings_usd"), 8) AS "cache_savings_usd",
    "round"("avg"("latency_ms")) AS "avg_latency_ms"
   FROM "public"."api_cost_logs"
  WHERE ("status" = 'success'::"text")
  GROUP BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date"), "user_id", "provider"
  ORDER BY (("date_trunc"('day'::"text", ("created_at" AT TIME ZONE 'utc'::"text")))::"date") DESC, ("round"("sum"("cost_usd"), 8)) DESC;
CREATE OR REPLACE VIEW "private"."api_usage_by_sender" AS
 SELECT "sender_handle",
    "user_id",
    "count"(*) AS "request_count",
    "min"("created_at") AS "first_call",
    "max"("created_at") AS "last_call",
    "sum"("tokens_in") AS "tokens_in",
    "sum"("tokens_out") AS "tokens_out",
    "round"("sum"("cost_usd"), 8) AS "total_cost_usd",
    "round"("avg"("cost_usd"), 8) AS "avg_cost_per_call",
    "round"("avg"("latency_ms")) AS "avg_latency_ms"
   FROM "public"."api_cost_logs"
  WHERE (("status" = 'success'::"text") AND ("sender_handle" IS NOT NULL))
  GROUP BY "sender_handle", "user_id"
  ORDER BY ("round"("sum"("cost_usd"), 8)) DESC;
CREATE TABLE IF NOT EXISTS "public"."api_daily_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "user_id" "uuid",
    "daily_cost_usd" numeric(12,8) DEFAULT 0 NOT NULL,
    "cost_usd_no_cache" numeric(12,8) DEFAULT 0 NOT NULL,
    "cache_savings_usd" numeric(12,8) DEFAULT 0 NOT NULL,
    "tokens_in" integer DEFAULT 0 NOT NULL,
    "tokens_out" integer DEFAULT 0 NOT NULL,
    "tokens_total" integer DEFAULT 0 NOT NULL,
    "tokens_cached" integer DEFAULT 0 NOT NULL,
    "tokens_reasoning" integer DEFAULT 0 NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);
CREATE OR REPLACE VIEW "private"."api_usage_running_total" AS
 SELECT "d"."date",
    "d"."user_id",
    "u"."email",
    "d"."daily_cost_usd",
    "d"."cost_usd_no_cache",
    "d"."cache_savings_usd",
    "round"(
        CASE
            WHEN ("d"."cost_usd_no_cache" > (0)::numeric) THEN (("d"."cache_savings_usd" / "d"."cost_usd_no_cache") * (100)::numeric)
            ELSE (0)::numeric
        END, 1) AS "cache_hit_pct",
    "round"("sum"("d"."daily_cost_usd") OVER (PARTITION BY "d"."user_id" ORDER BY "d"."date" ROWS UNBOUNDED PRECEDING), 8) AS "running_total_usd",
    "round"("sum"("d"."cache_savings_usd") OVER (PARTITION BY "d"."user_id" ORDER BY "d"."date" ROWS UNBOUNDED PRECEDING), 8) AS "running_savings_usd",
    "d"."tokens_in",
    "d"."tokens_out",
    "d"."tokens_total",
    "d"."tokens_cached",
    "d"."tokens_reasoning",
    "d"."request_count",
    "d"."updated_at"
   FROM ("public"."api_daily_usage" "d"
     LEFT JOIN "auth"."users" "u" ON (("u"."id" = "d"."user_id")))
  ORDER BY "d"."date" DESC, "d"."daily_cost_usd" DESC;
CREATE OR REPLACE VIEW "private"."api_usage_summary" AS
 SELECT "d"."user_id",
    "u"."email",
    "sum"("d"."daily_cost_usd") AS "total_cost_usd",
    "sum"("d"."cost_usd_no_cache") AS "total_cost_no_cache_usd",
    "sum"("d"."cache_savings_usd") AS "total_cache_savings_usd",
    "round"(
        CASE
            WHEN ("sum"("d"."cost_usd_no_cache") > (0)::numeric) THEN (("sum"("d"."cache_savings_usd") / "sum"("d"."cost_usd_no_cache")) * (100)::numeric)
            ELSE (0)::numeric
        END, 1) AS "overall_cache_hit_pct",
    "sum"("d"."request_count") AS "total_requests",
    "sum"("d"."tokens_total") AS "total_tokens",
    "sum"("d"."tokens_cached") AS "total_tokens_cached",
    "sum"("d"."tokens_reasoning") AS "total_tokens_reasoning",
    "min"("d"."date") AS "first_call_date",
    "max"("d"."date") AS "last_call_date",
    "round"(
        CASE
            WHEN ("max"("d"."date") > "min"("d"."date")) THEN ("sum"("d"."daily_cost_usd") / ((("max"("d"."date") - "min"("d"."date")) + 1))::numeric)
            ELSE "sum"("d"."daily_cost_usd")
        END, 8) AS "avg_daily_cost_usd"
   FROM ("public"."api_daily_usage" "d"
     LEFT JOIN "auth"."users" "u" ON (("u"."id" = "d"."user_id")))
  GROUP BY "d"."user_id", "u"."email";
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_item" (
    "brand_key" "text" NOT NULL,
    "item_id" bigint NOT NULL,
    "synced_at" timestamp with time zone NOT NULL,
    "description" "text",
    "custom_sku" "text",
    "upc" "text",
    "ean" "text",
    "archived" boolean,
    "item_type" "text",
    "category_id" bigint,
    "manufacturer_id" bigint,
    "default_cost" double precision,
    "item_shops" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "synced_at_melbourne" "text",
    "updated_at_melbourne" "text",
    "default_price" double precision,
    "qoh" integer
);
CREATE OR REPLACE VIEW "private"."nest_brand_lightspeed_inventory_v" AS
 SELECT "brand_key",
    "item_id",
    COALESCE("archived", false) AS "archived",
    "description",
    "custom_sku",
    "upc",
    "ean",
    "item_type",
    "category_id",
    "manufacturer_id",
    ("default_cost")::numeric AS "default_cost",
    ("default_price")::numeric AS "default_price",
    "qoh",
    "synced_at",
    "synced_at_melbourne",
    "updated_at"
   FROM "public"."nest_brand_lightspeed_item" "i";
COMMENT ON VIEW "private"."nest_brand_lightspeed_inventory_v" IS 'Typed Lightspeed inventory projection for SQL-backed search and stock answers.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_sale" (
    "brand_key" "text" NOT NULL,
    "sale_id" bigint NOT NULL,
    "completed" boolean,
    "voided" boolean,
    "archived" boolean,
    "shop_id" bigint,
    "customer_id" bigint,
    "employee_id" bigint,
    "create_time" timestamp with time zone,
    "complete_time" timestamp with time zone,
    "time_stamp" timestamp with time zone,
    "calc_total" double precision,
    "total" double precision,
    "balance" double precision,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "complete_local_time" "date",
    "complete_time_melb" timestamp with time zone GENERATED ALWAYS AS ((("complete_time" AT TIME ZONE 'UTC'::"text") AT TIME ZONE 'Australia/Melbourne'::"text")) STORED,
    "create_time_melbourne" "text",
    "complete_time_melbourne" "text",
    "time_stamp_melbourne" "text",
    "updated_at_melbourne" "text"
);
COMMENT ON COLUMN "public"."nest_brand_lightspeed_sale"."complete_local_time" IS 'complete_local_time';
CREATE OR REPLACE VIEW "private"."nest_brand_lightspeed_sale_analytics_v" AS
 SELECT "brand_key",
    "sale_id",
    COALESCE("completed", false) AS "completed",
    COALESCE("voided", false) AS "voided",
    COALESCE("archived", false) AS "archived",
    "shop_id",
    "customer_id",
    "employee_id",
    "create_time",
    "complete_time",
    "time_stamp",
    (NULLIF("left"("complete_time_melbourne", 10), ''::"text"))::"date" AS "complete_date_melbourne",
    (EXTRACT(isodow FROM (NULLIF("left"("complete_time_melbourne", 10), ''::"text"))::"date"))::integer AS "complete_isodow_melbourne",
    TRIM(BOTH FROM "to_char"(((NULLIF("left"("complete_time_melbourne", 10), ''::"text"))::"date")::timestamp with time zone, 'Day'::"text")) AS "complete_weekday_melbourne",
    COALESCE(("calc_total")::numeric, (0)::numeric) AS "calc_total",
    COALESCE(("total")::numeric, (0)::numeric) AS "total",
    COALESCE(("balance")::numeric, (0)::numeric) AS "balance",
    COALESCE((NULLIF(("raw" ->> 'calcSubtotal'::"text"), ''::"text"))::numeric, (0)::numeric) AS "calc_subtotal",
    COALESCE((NULLIF(("raw" ->> 'calcDiscount'::"text"), ''::"text"))::numeric, (0)::numeric) AS "calc_discount",
    COALESCE((NULLIF(("raw" ->> 'calcTax1'::"text"), ''::"text"))::numeric, (0)::numeric) AS "calc_tax1",
    COALESCE((NULLIF(("raw" ->> 'calcTax2'::"text"), ''::"text"))::numeric, (0)::numeric) AS "calc_tax2",
    COALESCE((NULLIF(("raw" ->> 'calcAvgCost'::"text"), ''::"text"))::numeric, (0)::numeric) AS "calc_avg_cost",
    COALESCE((NULLIF(("raw" ->> 'calcFIFOCost'::"text"), ''::"text"))::numeric, (0)::numeric) AS "calc_fifo_cost"
   FROM "public"."nest_brand_lightspeed_sale" "s";
COMMENT ON VIEW "private"."nest_brand_lightspeed_sale_analytics_v" IS 'Typed Lightspeed sales analytics fields extracted from mirrored sales raw JSON.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_sale_line" (
    "brand_key" "text" NOT NULL,
    "sale_line_id" bigint NOT NULL,
    "sale_id" bigint NOT NULL,
    "item_id" bigint,
    "unit_quantity" double precision,
    "unit_price" double precision,
    "calc_line_total" double precision,
    "note" "text",
    "is_layaway" boolean,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at_melbourne" "text"
);
CREATE OR REPLACE VIEW "private"."nest_brand_lightspeed_sale_line_analytics_v" AS
 SELECT "l"."brand_key",
    "l"."sale_line_id",
    "l"."sale_id",
    "l"."item_id",
    COALESCE(("l"."unit_quantity")::numeric, (0)::numeric) AS "unit_quantity",
    COALESCE(("l"."unit_price")::numeric, (0)::numeric) AS "unit_price",
    COALESCE(("l"."calc_line_total")::numeric, (0)::numeric) AS "calc_line_total",
    "l"."note",
    COALESCE("l"."is_layaway", false) AS "is_layaway",
    COALESCE((NULLIF(("l"."raw" ->> 'avgCost'::"text"), ''::"text"))::numeric, (0)::numeric) AS "avg_cost",
    COALESCE((NULLIF(("l"."raw" ->> 'fifoCost'::"text"), ''::"text"))::numeric, (0)::numeric) AS "fifo_cost",
    COALESCE((NULLIF(("l"."raw" ->> 'discountAmount'::"text"), ''::"text"))::numeric, (0)::numeric) AS "discount_amount",
    COALESCE((NULLIF(("l"."raw" ->> 'discountPercent'::"text"), ''::"text"))::numeric, (0)::numeric) AS "discount_percent",
    "s"."complete_date_melbourne",
    "s"."complete_isodow_melbourne",
    "s"."complete_weekday_melbourne",
    "i"."description" AS "item_description",
    "i"."custom_sku",
    "i"."upc",
    "i"."ean",
    "i"."default_price",
    "i"."qoh",
    "i"."item_type",
    "i"."category_id",
    "i"."manufacturer_id"
   FROM (("public"."nest_brand_lightspeed_sale_line" "l"
     JOIN "private"."nest_brand_lightspeed_sale_analytics_v" "s" ON ((("s"."brand_key" = "l"."brand_key") AND ("s"."sale_id" = "l"."sale_id"))))
     LEFT JOIN "public"."nest_brand_lightspeed_item" "i" ON ((("i"."brand_key" = "l"."brand_key") AND ("i"."item_id" = "l"."item_id"))));
COMMENT ON VIEW "private"."nest_brand_lightspeed_sale_line_analytics_v" IS 'Typed Lightspeed sale line analytics joined to mirrored sale dates and item metadata.';
CREATE OR REPLACE VIEW "private"."nest_brand_lightspeed_sale_v" AS
 SELECT "brand_key",
    "sale_id",
    "completed",
    "voided",
    "archived",
    "shop_id",
    "customer_id",
    "employee_id",
    "create_time",
    "complete_time",
    "time_stamp",
    "calc_total",
    "total",
    "balance",
    "raw",
    "updated_at",
    "complete_local_time",
    "complete_time_melb",
    ("complete_time" AT TIME ZONE 'Australia/Melbourne'::"text") AS "complete_time_melbs"
   FROM "public"."nest_brand_lightspeed_sale";
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_workorder" (
    "brand_key" "text" NOT NULL,
    "workorder_id" bigint NOT NULL,
    "time_in" timestamp with time zone,
    "eta_out" timestamp with time zone,
    "archived" boolean,
    "warranty" boolean,
    "workorder_status_id" bigint,
    "customer_id" bigint,
    "employee_id" bigint,
    "shop_id" bigint,
    "serialized_id" bigint,
    "sale_id" bigint,
    "system_sku" "text",
    "time_stamp" timestamp with time zone,
    "notes" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_name" "text",
    "workorder_line_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "time_in_melbourne" "text",
    "eta_out_melbourne" "text",
    "time_stamp_melbourne" "text",
    "updated_at_melbourne" "text",
    "customer_phone" "text",
    "customer_phone_e164" "text",
    "sale_total" double precision,
    "sale_balance" double precision
);
COMMENT ON COLUMN "public"."nest_brand_lightspeed_workorder"."customer_phone" IS 'Raw best-effort customer phone number lifted from Lightspeed Customer.Contact.Phones during sync.';
COMMENT ON COLUMN "public"."nest_brand_lightspeed_workorder"."customer_phone_e164" IS 'Same number normalised to E.164 (Australia default) so the chat handler can match against the senders mobile.';
COMMENT ON COLUMN "public"."nest_brand_lightspeed_workorder"."sale_total" IS 'Total of the linked Lightspeed sale (filled at sync time when the workorder has a saleID).';
COMMENT ON COLUMN "public"."nest_brand_lightspeed_workorder"."sale_balance" IS 'Outstanding balance on the linked sale. 0/null = paid in full so the bot can quote the final price.';
CREATE OR REPLACE VIEW "private"."nest_brand_lightspeed_workorder_analytics_v" AS
 SELECT "brand_key",
    "workorder_id",
    COALESCE("archived", false) AS "archived",
    COALESCE("warranty", false) AS "warranty",
    "workorder_status_id",
    "customer_id",
    "customer_name",
    "customer_phone",
    "customer_phone_e164",
    "employee_id",
    "shop_id",
    "serialized_id",
    "sale_id",
    "system_sku",
    "time_in",
    "eta_out",
    "time_stamp",
    "time_in_melbourne",
    "eta_out_melbourne",
    "time_stamp_melbourne",
    (NULLIF("left"("time_in_melbourne", 10), ''::"text"))::"date" AS "time_in_date_melbourne",
    (NULLIF("left"("eta_out_melbourne", 10), ''::"text"))::"date" AS "eta_out_date_melbourne",
    COALESCE((NULLIF("left"("eta_out_melbourne", 10), ''::"text"))::"date", (NULLIF("left"("time_in_melbourne", 10), ''::"text"))::"date") AS "anchor_date_melbourne",
    (EXTRACT(isodow FROM COALESCE((NULLIF("left"("eta_out_melbourne", 10), ''::"text"))::"date", (NULLIF("left"("time_in_melbourne", 10), ''::"text"))::"date")))::integer AS "anchor_isodow_melbourne",
    "notes",
    "workorder_line_items",
    ("sale_total")::numeric AS "sale_total",
    ("sale_balance")::numeric AS "sale_balance",
    "updated_at"
   FROM "public"."nest_brand_lightspeed_workorder" "w";
COMMENT ON VIEW "private"."nest_brand_lightspeed_workorder_analytics_v" IS 'Typed Lightspeed workorder projection for SQL-only internal/customer lookup paths.';
CREATE TABLE IF NOT EXISTS "public"."admin_onboarding_prompts" (
    "prompt_key" "text" NOT NULL,
    "body" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
COMMENT ON TABLE "public"."admin_onboarding_prompts" IS 'Optional overrides for onboarding prompt sections. Empty/missing keys use edge-function defaults.';
CREATE TABLE IF NOT EXISTS "public"."analytics_message_facts" (
    "id" bigint NOT NULL,
    "source_message_id" bigint NOT NULL,
    "chat_id" "text" NOT NULL,
    "sender_handle" "text",
    "role" "text" NOT NULL,
    "message_direction" "text" NOT NULL,
    "engagement_scope" "text" NOT NULL,
    "engagement_brand_key" "text",
    "created_at" timestamp with time zone NOT NULL,
    "created_day_mel" "date" NOT NULL,
    "created_week_monday_mel" "date" NOT NULL,
    "created_hour_mel" smallint NOT NULL,
    "created_dow_mel" smallint NOT NULL,
    "daypart" "text" NOT NULL,
    "is_group_chat" boolean DEFAULT false NOT NULL,
    "service" "text",
    "chat_name" "text",
    "participant_count" integer DEFAULT 0 NOT NULL,
    "is_portal_test" boolean DEFAULT false NOT NULL,
    "message_length" integer DEFAULT 0 NOT NULL,
    "word_count" integer DEFAULT 0 NOT NULL,
    "content_preview" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "inserted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_message_facts_brand_key_check" CHECK (((("engagement_scope" = 'nest'::"text") AND ("engagement_brand_key" IS NULL)) OR (("engagement_scope" = 'brand'::"text") AND ("engagement_brand_key" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "engagement_brand_key")) > 0)))),
    CONSTRAINT "analytics_message_facts_daypart_check" CHECK (("daypart" = ANY (ARRAY['overnight'::"text", 'morning'::"text", 'afternoon'::"text", 'evening'::"text"]))),
    CONSTRAINT "analytics_message_facts_direction_check" CHECK (("message_direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "analytics_message_facts_dow_check" CHECK ((("created_dow_mel" >= 1) AND ("created_dow_mel" <= 7))),
    CONSTRAINT "analytics_message_facts_hour_check" CHECK ((("created_hour_mel" >= 0) AND ("created_hour_mel" <= 23))),
    CONSTRAINT "analytics_message_facts_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"]))),
    CONSTRAINT "analytics_message_facts_scope_check" CHECK (("engagement_scope" = ANY (ARRAY['nest'::"text", 'brand'::"text"])))
);
ALTER TABLE "public"."analytics_message_facts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."analytics_message_facts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."api_daily_usage_by_message_type" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "user_id" "uuid",
    "message_type" "text" NOT NULL,
    "daily_cost_usd" numeric(12,8) DEFAULT 0 NOT NULL,
    "tokens_in" integer DEFAULT 0 NOT NULL,
    "tokens_out" integer DEFAULT 0 NOT NULL,
    "tokens_total" integer DEFAULT 0 NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);
CREATE TABLE IF NOT EXISTS "public"."api_daily_usage_by_provider" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "user_id" "uuid",
    "provider" "text" NOT NULL,
    "daily_cost_usd" numeric(12,8) DEFAULT 0 NOT NULL,
    "cost_usd_no_cache" numeric(12,8) DEFAULT 0 NOT NULL,
    "cache_savings_usd" numeric(12,8) DEFAULT 0 NOT NULL,
    "tokens_in" integer DEFAULT 0 NOT NULL,
    "tokens_out" integer DEFAULT 0 NOT NULL,
    "tokens_total" integer DEFAULT 0 NOT NULL,
    "tokens_cached" integer DEFAULT 0 NOT NULL,
    "tokens_reasoning" integer DEFAULT 0 NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_report_sale_line" (
    "brand_key" "text" NOT NULL,
    "sale_id" bigint NOT NULL,
    "sale_line_id" bigint NOT NULL,
    "complete_time" timestamp with time zone,
    "line_time" timestamp with time zone,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "retail" numeric DEFAULT 0 NOT NULL,
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "discount" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "customer_full_name" "text",
    "employee_name" "text",
    "category" "text",
    "cost" numeric DEFAULT 0 NOT NULL,
    "profit" numeric DEFAULT 0 NOT NULL,
    "margin_pct" numeric,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
COMMENT ON TABLE "public"."nest_brand_lightspeed_report_sale_line" IS 'Portal Reports sale lines (typed). Backfilled from 2016 via lightspeed-transaction-export-backfill; incremental sync from Lightspeed API.';
CREATE OR REPLACE VIEW "public"."ashycycles" AS
 SELECT "sale_id",
    "sale_line_id",
    "complete_time",
    "line_time",
    "description",
    "quantity",
    "retail",
    "subtotal",
    "discount",
    "total",
    "customer_full_name",
    "employee_name",
    "category",
    "cost",
    "profit",
    "margin_pct",
    "synced_at"
   FROM "public"."nest_brand_lightspeed_report_sale_line"
  WHERE ("brand_key" = 'ash'::"text");
COMMENT ON VIEW "public"."ashycycles" IS 'Ashburton Cycles report sale lines (brand_key ash).';
CREATE TABLE IF NOT EXISTS "public"."automation_preferences" (
    "handle" "text" NOT NULL,
    "automation_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "schedule_override" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."automation_runs" (
    "id" bigint NOT NULL,
    "handle" "text" NOT NULL,
    "chat_id" "text",
    "automation_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "replied_at" timestamp with time zone,
    "ignored" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "manual_trigger" boolean DEFAULT false NOT NULL,
    "triggered_by" "text"
);
ALTER TABLE "public"."automation_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."automation_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."brand_sessions" (
    "chat_id" "text" NOT NULL,
    "brand_key" "text" NOT NULL,
    "activated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_mode_exited" boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."buzz_call_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "chat_id" "text" NOT NULL,
    "user_handle" "text" NOT NULL,
    "bot_number" "text" NOT NULL,
    "request_text" "text" NOT NULL,
    "merchant_query" "text",
    "merchant_name" "text",
    "merchant_phone" "text",
    "merchant_address" "text",
    "google_place_id" "text",
    "google_maps_uri" "text",
    "goal_prompt" "text",
    "approval_message_id" "text",
    "status" "text" DEFAULT 'drafted'::"text" NOT NULL,
    "elevenlabs_conversation_id" "text",
    "twilio_call_sid" "text",
    "connected_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "failure_reason" "text",
    "summary" "jsonb",
    "recording_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "buzz_call_jobs_status_check" CHECK (("status" = ANY (ARRAY['drafted'::"text", 'awaiting_like'::"text", 'approved'::"text", 'calling'::"text", 'connected'::"text", 'no_answer'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text", 'expired'::"text"])))
);
COMMENT ON TABLE "public"."buzz_call_jobs" IS 'Buzz merchant call plans, approvals, ElevenLabs call IDs, and final outcomes.';
CREATE TABLE IF NOT EXISTS "public"."buzz_events" (
    "id" bigint NOT NULL,
    "session_id" "uuid",
    "call_job_id" "uuid",
    "chat_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
COMMENT ON TABLE "public"."buzz_events" IS 'Append-only audit log for Buzz mode state transitions.';
ALTER TABLE "public"."buzz_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."buzz_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."buzz_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "text" NOT NULL,
    "user_handle" "text" NOT NULL,
    "bot_number" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "buzz_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'ended'::"text", 'expired'::"text"])))
);
COMMENT ON TABLE "public"."buzz_sessions" IS 'Per-chat Buzz mode sessions for iMessage initiated call orchestration.';
CREATE TABLE IF NOT EXISTS "public"."conversation_messages" (
    "id" bigint NOT NULL,
    "chat_id" "text" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "handle" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "engagement_scope" "text" DEFAULT 'nest'::"text" NOT NULL,
    "engagement_brand_key" "text",
    "provider_message_id" "text",
    "reply_to_provider_message_id" "text",
    "provider_part_index" integer,
    CONSTRAINT "conversation_messages_engagement_brand_key_check" CHECK (((("engagement_scope" = 'nest'::"text") AND ("engagement_brand_key" IS NULL)) OR (("engagement_scope" = 'brand'::"text") AND ("engagement_brand_key" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "engagement_brand_key")) > 0)))),
    CONSTRAINT "conversation_messages_engagement_scope_check" CHECK (("engagement_scope" = ANY (ARRAY['nest'::"text", 'brand'::"text"])))
);
ALTER TABLE "public"."conversation_messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."conversation_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."conversation_summaries" (
    "id" bigint NOT NULL,
    "chat_id" "text" NOT NULL,
    "sender_handle" "text",
    "summary" "text" NOT NULL,
    "topics" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "open_loops" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "summary_kind" "text" DEFAULT 'segment'::"text" NOT NULL,
    "first_message_at" timestamp with time zone NOT NULL,
    "last_message_at" timestamp with time zone NOT NULL,
    "message_count" integer NOT NULL,
    "confidence" numeric DEFAULT 0.8 NOT NULL,
    "source_message_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "extractor_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "engagement_scope" "text" DEFAULT 'nest'::"text" NOT NULL,
    "engagement_brand_key" "text",
    CONSTRAINT "conversation_summaries_engagement_brand_key_check" CHECK (((("engagement_scope" = 'nest'::"text") AND ("engagement_brand_key" IS NULL)) OR (("engagement_scope" = 'brand'::"text") AND ("engagement_brand_key" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "engagement_brand_key")) > 0)))),
    CONSTRAINT "conversation_summaries_engagement_scope_check" CHECK (("engagement_scope" = ANY (ARRAY['nest'::"text", 'brand'::"text"])))
);
ALTER TABLE "public"."conversation_summaries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."conversation_summaries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."customer_automation_rule_state" (
    "id" bigint NOT NULL,
    "handle" "text" NOT NULL,
    "rule_key" "text" NOT NULL,
    "last_evaluated_at" timestamp with time zone,
    "last_outcome" "text",
    "last_reason" "text",
    "last_metric_value" bigint,
    "last_profile_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "first_eligible_at" timestamp with time zone,
    "send_in_progress_at" timestamp with time zone,
    "last_sent_at" timestamp with time zone,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "last_triggered_by" "text",
    "last_automation_run_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
COMMENT ON TABLE "public"."customer_automation_rule_state" IS 'Durable evaluation and send state for the customer automation engine.';
COMMENT ON COLUMN "public"."customer_automation_rule_state"."last_profile_snapshot" IS 'Compact traits snapshot used to explain why the latest evaluation ran.';
COMMENT ON COLUMN "public"."customer_automation_rule_state"."send_in_progress_at" IS 'Transient claim marker used to prevent duplicate sends across overlapping cron/manual runs.';
ALTER TABLE "public"."customer_automation_rule_state" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."customer_automation_rule_state_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."edge_request_rate_limits" (
    "bucket_key" "text" NOT NULL,
    "bucket_start" timestamp with time zone NOT NULL,
    "hit_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."notification_webhook_events" (
    "id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "account_email" "text" NOT NULL,
    "subscription_id" "uuid",
    "history_id" "text",
    "resource_data" "jsonb",
    "change_type" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "processed_at" timestamp with time zone,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_type" "text" DEFAULT 'email'::"text" NOT NULL,
    CONSTRAINT "email_webhook_events_provider_check" CHECK (("provider" = ANY (ARRAY['google'::"text", 'microsoft'::"text"]))),
    CONSTRAINT "email_webhook_events_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "notification_webhook_events_source_type_check" CHECK (("source_type" = ANY (ARRAY['email'::"text", 'calendar'::"text"])))
);
ALTER TABLE "public"."notification_webhook_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."email_webhook_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."experiment_assignments" (
    "id" bigint NOT NULL,
    "handle" "text" NOT NULL,
    "experiment_name" "text" NOT NULL,
    "variant" "text" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."experiment_assignments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."experiment_assignments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."job_failures" (
    "id" bigint NOT NULL,
    "queue_name" "text" NOT NULL,
    "queue_message_id" bigint NOT NULL,
    "webhook_event_id" bigint,
    "attempt_number" integer NOT NULL,
    "error" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."job_failures" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."job_failures_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."linq_human_mode_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "text" NOT NULL,
    "recipient_handle" "text" NOT NULL,
    "bot_number" "text" NOT NULL,
    "brand_key" "text" NOT NULL,
    "source" "text" NOT NULL,
    "activated_by" "text",
    "activated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_staff_message_at" timestamp with time zone,
    "last_inbound_at" timestamp with time zone,
    "released_at" timestamp with time zone,
    "released_reason" "text",
    "release_route" "text",
    "release_brand_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "linq_human_mode_threads_brand_key_check" CHECK (("length"(TRIM(BOTH FROM "brand_key")) > 0)),
    CONSTRAINT "linq_human_mode_threads_source_check" CHECK (("source" = ANY (ARRAY['brand_portal_manual_reply'::"text", 'brand_portal_start_message'::"text", 'linq_human_mode_bypass'::"text", 'system'::"text"])))
);
COMMENT ON TABLE "public"."linq_human_mode_threads" IS 'Active human-only Linq threads started by brand portal manual messaging. Active rows suppress AI replies until route-switch or store-call re-entry.';
COMMENT ON COLUMN "public"."linq_human_mode_threads"."recipient_handle" IS 'Recipient phone/handle that replies to the shared Linq bot number.';
COMMENT ON COLUMN "public"."linq_human_mode_threads"."bot_number" IS 'Linq sender/bot number used for the manual brand message.';
CREATE TABLE IF NOT EXISTS "public"."linq_send_failures" (
    "id" bigint NOT NULL,
    "chat_id" "text",
    "purpose" "text" NOT NULL,
    "text" "text" NOT NULL,
    "error" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS "public"."linq_send_failures_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."linq_send_failures_id_seq" OWNED BY "public"."linq_send_failures"."id";
CREATE SEQUENCE IF NOT EXISTS "public"."message_buffer_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."message_buffer_id_seq" OWNED BY "public"."message_buffer"."id";
CREATE TABLE IF NOT EXISTS "public"."nest_brand_chat_config" (
    "brand_key" "text" NOT NULL,
    "business_display_name" "text" DEFAULT ''::"text" NOT NULL,
    "opening_line" "text" DEFAULT ''::"text" NOT NULL,
    "hours_text" "text" DEFAULT ''::"text" NOT NULL,
    "prices_text" "text" DEFAULT ''::"text" NOT NULL,
    "services_products_text" "text" DEFAULT ''::"text" NOT NULL,
    "policies_text" "text" DEFAULT ''::"text" NOT NULL,
    "contact_text" "text" DEFAULT ''::"text" NOT NULL,
    "booking_info_text" "text" DEFAULT ''::"text" NOT NULL,
    "extra_knowledge" "text" DEFAULT ''::"text" NOT NULL,
    "style_template" "text" DEFAULT 'warm_local'::"text" NOT NULL,
    "style_notes" "text" DEFAULT ''::"text" NOT NULL,
    "topics_to_avoid" "text" DEFAULT ''::"text" NOT NULL,
    "escalation_text" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "core_system_prompt" "text" DEFAULT ''::"text" NOT NULL,
    "activation_aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "internal_admin_phone_e164s" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "business_timezone" "text" DEFAULT 'Australia/Melbourne'::"text" NOT NULL,
    "opening_schedule" "jsonb" DEFAULT '{"rules": [], "enabled": false}'::"jsonb" NOT NULL,
    "business_raw_prompt" "text" DEFAULT ''::"text" NOT NULL,
    "twilio_phone_number_e164" "text",
    "twilio_phone_number_sid" "text",
    "twilio_phone_status" "text" DEFAULT ''::"text" NOT NULL,
    "twilio_phone_purchased_at" timestamp with time zone,
    "twilio_phone_error" "text" DEFAULT ''::"text" NOT NULL,
    "lightspeed_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "voicemail_audio_url" "text",
    "handoff_phone_e164" "text",
    "reporting_automations" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "elevenlabs_voice_agent_id" "text",
    "knowledge_base_seeded_at" timestamp with time zone
);
COMMENT ON COLUMN "public"."nest_brand_chat_config"."core_system_prompt" IS 'Full baseline instructions for the brand chatbot. When non-empty, replaces the in-repo registry prompt; portal section fields still append as LIVE BUSINESS CONFIG.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."activation_aliases" IS 'Additional activation words for parseHeyBrand (lowercase). Primary trigger is always brand_key.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."internal_admin_phone_e164s" IS 'E.164 numbers allowed internal operational answers (rosters, timesheets). Empty = all senders treated as customers for internal data.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."business_timezone" IS 'IANA timezone used to resolve business-local opening message schedules.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."opening_schedule" IS 'Structured opening-message schedule for new customer greetings. Format: { enabled: boolean, rules: [{ id, days, startMinute, endMinute, message }] }.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."business_raw_prompt" IS 'Business-owned raw prompt body shown in the Nest portal. Hidden Nest system rules are applied separately at runtime.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."twilio_phone_number_e164" IS 'Active Twilio phone number attached to this brand in E.164 format.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."twilio_phone_number_sid" IS 'Twilio IncomingPhoneNumber SID for the active brand phone number.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."twilio_phone_status" IS 'Provisioning status for the active Twilio phone number: empty, active, or error.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."twilio_phone_purchased_at" IS 'When the current active Twilio phone number was purchased.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."twilio_phone_error" IS 'Last provisioning or webhook sync error for the active Twilio phone number.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."lightspeed_settings" IS 'Business-controlled Lightspeed access toggles (workorder lookup, inventory, pricing, booking). Edited via the brand portal Connections tab.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."voicemail_audio_url" IS 'Optional public URL of an MP3 played by Twilio when a caller rings the Nest Catch number. If null, falls back to Polly.Nicole TTS.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."handoff_phone_e164" IS 'Optional E.164 mobile. When set, Nest texts this number via Linq with a short summary when the customer requests a human/callback (brand chat).';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."reporting_automations" IS 'Owner-facing Team Hub reporting automation schedules and recipient numbers for Lightspeed / Deputy digests.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."elevenlabs_voice_agent_id" IS 'Optional ElevenLabs ConvAI agent ID linked to this brand for Phone Assistant knowledge sync.';
COMMENT ON COLUMN "public"."nest_brand_chat_config"."knowledge_base_seeded_at" IS 'When legacy nest_brand_chat_config text fields were imported into nest_brand_knowledge_items.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_deputy_pending_actions" (
    "chat_id" "text" NOT NULL,
    "brand_key" "text" NOT NULL,
    "action" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    CONSTRAINT "nest_brand_deputy_pending_actions_action_check" CHECK (("action" = ANY (ARRAY['roster_discard'::"text", 'roster_add'::"text"])))
);
COMMENT ON TABLE "public"."nest_brand_deputy_pending_actions" IS 'Service-role only: pending Deputy roster add/discard until user sends CONFIRM ADD / CONFIRM DELETE.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_key" "text" NOT NULL,
    "url" "text" NOT NULL,
    "alt" "text" DEFAULT ''::"text" NOT NULL,
    "page_title" "text" DEFAULT ''::"text" NOT NULL,
    "page_url" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);
CREATE TABLE IF NOT EXISTS "public"."nest_brand_knowledge_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_key" "text" NOT NULL,
    "knowledge_item_id" "uuid" NOT NULL,
    "chunk_index" integer DEFAULT 0 NOT NULL,
    "content_text" "text",
    "embedding" "extensions"."vector"(3072),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fts_vector" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", COALESCE("content_text", ''::"text"))) STORED
);
CREATE TABLE IF NOT EXISTS "public"."nest_brand_knowledge_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_key" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "source_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "content_text" "text" DEFAULT ''::"text" NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "assigned_products" "text"[] DEFAULT ARRAY['nest_chat'::"text", 'phone_assistant'::"text", 'nest_outbound'::"text"] NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "legacy_field_key" "text",
    "file_name" "text",
    "file_mime_type" "text",
    "file_size_bytes" bigint,
    "storage_bucket" "text",
    "storage_path" "text",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "nest_brand_knowledge_items_products_check" CHECK ((("assigned_products" <@ ARRAY['nest_chat'::"text", 'phone_assistant'::"text", 'nest_outbound'::"text"]) AND ("cardinality"("assigned_products") >= 1))),
    CONSTRAINT "nest_brand_knowledge_items_source_type_check" CHECK (("source_type" = ANY (ARRAY['text'::"text", 'pdf'::"text", 'file'::"text", 'legacy_field'::"text"]))),
    CONSTRAINT "nest_brand_knowledge_items_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'ready'::"text", 'failed'::"text", 'archived'::"text"])))
);
COMMENT ON TABLE "public"."nest_brand_knowledge_items" IS 'Brand-scoped knowledge entries for Nest Chat, Phone Assistant, and Outbound.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_backfill_state" (
    "brand_key" "text" NOT NULL,
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "phase" "text" DEFAULT 'sales'::"text" NOT NULL,
    "requested_start_date" "date" DEFAULT '2017-01-01'::"date" NOT NULL,
    "requested_end_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "sales_cursor_date" "date",
    "sales_next_page_url" "text",
    "sales_months_completed" integer DEFAULT 0 NOT NULL,
    "sales_pages_completed" integer DEFAULT 0 NOT NULL,
    "workorders_cursor_date" "date",
    "workorders_next_page_url" "text",
    "workorders_months_completed" integer DEFAULT 0 NOT NULL,
    "workorders_pages_completed" integer DEFAULT 0 NOT NULL,
    "total_months" integer DEFAULT 0 NOT NULL,
    "current_window_start" "date",
    "current_window_end" "date",
    "sales_upserted" bigint DEFAULT 0 NOT NULL,
    "sale_lines_upserted" bigint DEFAULT 0 NOT NULL,
    "workorders_upserted" bigint DEFAULT 0 NOT NULL,
    "last_message" "text",
    "last_error" "text",
    "last_error_at" timestamp with time zone,
    "latest_events" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cancel_requested" boolean DEFAULT false NOT NULL,
    "lease_owner" "uuid",
    "lease_expires_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "last_heartbeat_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nest_brand_lightspeed_backfill_state_phase_check" CHECK (("phase" = ANY (ARRAY['sales'::"text", 'workorders'::"text", 'finalising'::"text", 'completed'::"text"]))),
    CONSTRAINT "nest_brand_lightspeed_backfill_state_status_check" CHECK (("status" = ANY (ARRAY['idle'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelling'::"text", 'cancelled'::"text"])))
);
COMMENT ON TABLE "public"."nest_brand_lightspeed_backfill_state" IS 'Durable resumable Lightspeed historical backfill progress for the Nest business portal.';
COMMENT ON COLUMN "public"."nest_brand_lightspeed_backfill_state"."latest_events" IS 'Newest-first bounded event timeline for Team Hub progress UI.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_booking_state" (
    "brand_key" "text" NOT NULL,
    "chat_id" "text" NOT NULL,
    "status" "text" DEFAULT 'collecting'::"text" NOT NULL,
    "sender_handle" "text" NOT NULL,
    "sender_phone_e164" "text",
    "customer_name" "text",
    "comments" "text",
    "drop_off_date" "date",
    "workorder_id" bigint,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bike" "text"
);
COMMENT ON TABLE "public"."nest_brand_lightspeed_booking_state" IS 'Per-chat booking-in-progress state for the customer-facing Lightspeed booking flow.';
COMMENT ON COLUMN "public"."nest_brand_lightspeed_booking_state"."status" IS 'collecting | awaiting_confirm | created';
COMMENT ON COLUMN "public"."nest_brand_lightspeed_booking_state"."bike" IS 'Customer-supplied bike description (make/model/year) collected during booking flow.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_lookup_cache" (
    "brand_key" "text" NOT NULL,
    "employee_names" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "category_names" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
COMMENT ON TABLE "public"."nest_brand_lightspeed_lookup_cache" IS 'Cached Lightspeed employee/category name maps for resumable report backfills.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_sql_query_log" (
    "id" bigint NOT NULL,
    "brand_key" "text" NOT NULL,
    "query_sql" "text" NOT NULL,
    "row_limit" integer DEFAULT 50 NOT NULL,
    "row_count" integer,
    "duration_ms" integer,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
COMMENT ON TABLE "public"."nest_brand_lightspeed_sql_query_log" IS 'Audit log for AI-generated read-only Lightspeed analytics SQL queries.';
CREATE SEQUENCE IF NOT EXISTS "public"."nest_brand_lightspeed_sql_query_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."nest_brand_lightspeed_sql_query_log_id_seq" OWNED BY "public"."nest_brand_lightspeed_sql_query_log"."id";
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_sync_state" (
    "brand_key" "text" NOT NULL,
    "resource" "text" NOT NULL,
    "last_time_stamp" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_run_synced_at" timestamp with time zone,
    "inventory_next_page_url" "text",
    "inventory_last_completed_at" timestamp with time zone,
    CONSTRAINT "nest_brand_lightspeed_sync_state_resource_check" CHECK (("resource" = ANY (ARRAY['sale'::"text", 'workorder'::"text", 'item'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_transaction_export_state" (
    "brand_key" "text" NOT NULL,
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "requested_start_date" "date" DEFAULT '2015-01-01'::"date" NOT NULL,
    "requested_end_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "next_page_url" "text",
    "last_complete_time" timestamp with time zone,
    "sales_processed" bigint DEFAULT 0 NOT NULL,
    "lines_upserted" bigint DEFAULT 0 NOT NULL,
    "pages_completed" bigint DEFAULT 0 NOT NULL,
    "last_message" "text",
    "last_error" "text",
    "last_error_at" timestamp with time zone,
    "latest_events" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cancel_requested" boolean DEFAULT false NOT NULL,
    "lease_owner" "uuid",
    "lease_expires_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "last_heartbeat_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "report_last_synced_at" timestamp with time zone,
    "report_last_complete_time" timestamp with time zone,
    "report_lines_upserted" bigint DEFAULT 0 NOT NULL,
    "report_only" boolean DEFAULT false NOT NULL,
    CONSTRAINT "nest_brand_lightspeed_transaction_export_state_status_check" CHECK (("status" = ANY (ARRAY['idle'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelling'::"text", 'cancelled'::"text"])))
);
COMMENT ON TABLE "public"."nest_brand_lightspeed_transaction_export_state" IS 'Resumable Lightspeed transaction export backfill progress for the Nest business portal.';
COMMENT ON COLUMN "public"."nest_brand_lightspeed_transaction_export_state"."report_only" IS 'When true, export job only upserts nest_brand_lightspeed_report_sale_line (ashycycles), not wide transaction lines.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_lightspeed_transaction_line" (
    "brand_key" "text" NOT NULL,
    "sale_id" bigint NOT NULL,
    "sale_line_id" bigint NOT NULL,
    "complete_time" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "line_avgCost" "text",
    "line_calcLineDiscount" "text",
    "line_calcSubtotal" "text",
    "line_calcTax1" "text",
    "line_calcTax2" "text",
    "line_calcTotal" "text",
    "line_calcTransactionDiscount" "text",
    "line_createTime" "text",
    "line_customerID" "text",
    "line_discountAmount" "text",
    "line_discountID" "text",
    "line_discountPercent" "text",
    "line_displayableSubtotal" "text",
    "line_displayableUnitPrice" "text",
    "line_employeeID" "text",
    "line_fifoCost" "text",
    "line_isLayaway" "text",
    "line_isSpecialOrder" "text",
    "line_isWorkorder" "text",
    "line_itemFeeID" "text",
    "line_itemID" "text",
    "line_item_Prices_ItemPrice_0_amount" "text",
    "line_item_Prices_ItemPrice_0_useType" "text",
    "line_item_Prices_ItemPrice_0_useTypeID" "text",
    "line_item_Prices_ItemPrice_1_amount" "text",
    "line_item_Prices_ItemPrice_1_useType" "text",
    "line_item_Prices_ItemPrice_1_useTypeID" "text",
    "line_item_Prices_ItemPrice_2_amount" "text",
    "line_item_Prices_ItemPrice_2_useType" "text",
    "line_item_Prices_ItemPrice_2_useTypeID" "text",
    "line_item_archived" "text",
    "line_item_avgCost" "text",
    "line_item_categoryID" "text",
    "line_item_createTime" "text",
    "line_item_customSku" "text",
    "line_item_defaultCost" "text",
    "line_item_defaultVendorID" "text",
    "line_item_departmentID" "text",
    "line_item_description" "text",
    "line_item_discountable" "text",
    "line_item_ean" "text",
    "line_item_itemAttributesID" "text",
    "line_item_itemID" "text",
    "line_item_itemMatrixID" "text",
    "line_item_itemType" "text",
    "line_item_laborDurationMinutes" "text",
    "line_item_manufacturerID" "text",
    "line_item_manufacturerSku" "text",
    "line_item_modelYear" "text",
    "line_item_noteID" "text",
    "line_item_publishToEcom" "text",
    "line_item_seasonID" "text",
    "line_item_serialized" "text",
    "line_item_systemSku" "text",
    "line_item_tax" "text",
    "line_item_taxClassID" "text",
    "line_item_timeStamp" "text",
    "line_item_upc" "text",
    "line_lineType" "text",
    "line_normalUnitPrice" "text",
    "line_noteID" "text",
    "line_note_isPublic" "text",
    "line_note_note" "text",
    "line_note_noteID" "text",
    "line_note_timeStamp" "text",
    "line_parentSaleLineID" "text",
    "line_saleID" "text",
    "line_saleLineID" "text",
    "line_shopID" "text",
    "line_tax" "text",
    "line_tax1Rate" "text",
    "line_tax2Rate" "text",
    "line_taxClassID" "text",
    "line_taxClass_classType" "text",
    "line_taxClass_name" "text",
    "line_taxClass_taxClassID" "text",
    "line_taxClass_timeStamp" "text",
    "line_timeStamp" "text",
    "line_unitPrice" "text",
    "line_unitQuantity" "text",
    "line_workOrder_workOrderId" "text",
    "line_workOrder_workOrderType" "text",
    "sale_Customer_Contact_Addresses" "text",
    "sale_Customer_Contact_Addresses_ContactAddress_address1" "text",
    "sale_Customer_Contact_Addresses_ContactAddress_address2" "text",
    "sale_Customer_Contact_Addresses_ContactAddress_city" "text",
    "sale_Customer_Contact_Addresses_ContactAddress_country" "text",
    "sale_Customer_Contact_Addresses_ContactAddress_countryCode" "text",
    "sale_Customer_Contact_Addresses_ContactAddress_state" "text",
    "sale_Customer_Contact_Addresses_ContactAddress_zip" "text",
    "sale_Customer_Contact_Emails" "text",
    "sale_Customer_Contact_Emails_ContactEmail_0_address" "text",
    "sale_Customer_Contact_Emails_ContactEmail_0_useType" "text",
    "sale_Customer_Contact_Emails_ContactEmail_1_address" "text",
    "sale_Customer_Contact_Emails_ContactEmail_1_useType" "text",
    "sale_Customer_Contact_Emails_ContactEmail_address" "text",
    "sale_Customer_Contact_Emails_ContactEmail_useType" "text",
    "sale_Customer_Contact_Phones" "text",
    "sale_Customer_Contact_Phones_ContactPhone_0_number" "text",
    "sale_Customer_Contact_Phones_ContactPhone_0_useType" "text",
    "sale_Customer_Contact_Phones_ContactPhone_1_number" "text",
    "sale_Customer_Contact_Phones_ContactPhone_1_useType" "text",
    "sale_Customer_Contact_Phones_ContactPhone_number" "text",
    "sale_Customer_Contact_Phones_ContactPhone_useType" "text",
    "sale_Customer_Contact_Websites" "text",
    "sale_Customer_Contact_contactID" "text",
    "sale_Customer_Contact_custom" "text",
    "sale_Customer_Contact_noEmail" "text",
    "sale_Customer_Contact_noMail" "text",
    "sale_Customer_Contact_noPhone" "text",
    "sale_Customer_Contact_timeStamp" "text",
    "sale_Customer_archived" "text",
    "sale_Customer_company" "text",
    "sale_Customer_companyRegistrationNumber" "text",
    "sale_Customer_contactID" "text",
    "sale_Customer_createTime" "text",
    "sale_Customer_creditAccountID" "text",
    "sale_Customer_customerID" "text",
    "sale_Customer_customerTypeID" "text",
    "sale_Customer_discountID" "text",
    "sale_Customer_dob" "text",
    "sale_Customer_employeeID" "text",
    "sale_Customer_firstName" "text",
    "sale_Customer_lastName" "text",
    "sale_Customer_measurementID" "text",
    "sale_Customer_noteID" "text",
    "sale_Customer_taxCategoryID" "text",
    "sale_Customer_timeStamp" "text",
    "sale_Customer_title" "text",
    "sale_Customer_vatNumber" "text",
    "sale_Quote_archived" "text",
    "sale_Quote_employeeID" "text",
    "sale_Quote_issueDate" "text",
    "sale_Quote_notes" "text",
    "sale_Quote_quoteID" "text",
    "sale_Quote_saleID" "text",
    "sale_SalePayments_SalePayment_0_PaymentType_archived" "text",
    "sale_SalePayments_SalePayment_0_PaymentType_channel" "text",
    "sale_SalePayments_SalePayment_0_PaymentType_code" "text",
    "sale_SalePayments_SalePayment_0_PaymentType_internalReserved" "text",
    "sale_SalePayments_SalePayment_0_PaymentType_name" "text",
    "sale_SalePayments_SalePayment_0_PaymentType_paymentTypeID" "text",
    "sale_SP0_PT_refundAsPaymentTypeID" "text",
    "sale_SalePayments_SalePayment_0_PaymentType_requireCustomer" "text",
    "sale_SalePayments_SalePayment_0_PaymentType_type" "text",
    "sale_SP0_SA_creditAccountID" "text",
    "sale_SP0_SA_saleAccountID" "text",
    "sale_SP0_SA_saleLineID" "text",
    "sale_SP0_SA_salePaymentID" "text",
    "sale_SalePayments_SalePayment_0_amount" "text",
    "sale_SalePayments_SalePayment_0_archived" "text",
    "sale_SalePayments_SalePayment_0_cashRoundingDelta" "text",
    "sale_SalePayments_SalePayment_0_ccChargeID" "text",
    "sale_SalePayments_SalePayment_0_createTime" "text",
    "sale_SalePayments_SalePayment_0_creditAccountID" "text",
    "sale_SalePayments_SalePayment_0_employeeID" "text",
    "sale_SalePayments_SalePayment_0_paymentID" "text",
    "sale_SalePayments_SalePayment_0_paymentTypeID" "text",
    "sale_SalePayments_SalePayment_0_refPaymentID" "text",
    "sale_SalePayments_SalePayment_0_registerID" "text",
    "sale_SalePayments_SalePayment_0_remoteReference" "text",
    "sale_SalePayments_SalePayment_0_saleID" "text",
    "sale_SalePayments_SalePayment_0_salePaymentID" "text",
    "sale_SalePayments_SalePayment_0_surchargeAmount" "text",
    "sale_SalePayments_SalePayment_1_PaymentType_archived" "text",
    "sale_SalePayments_SalePayment_1_PaymentType_channel" "text",
    "sale_SalePayments_SalePayment_1_PaymentType_code" "text",
    "sale_SalePayments_SalePayment_1_PaymentType_internalReserved" "text",
    "sale_SalePayments_SalePayment_1_PaymentType_name" "text",
    "sale_SalePayments_SalePayment_1_PaymentType_paymentTypeID" "text",
    "sale_SP1_PT_refundAsPaymentTypeID" "text",
    "sale_SalePayments_SalePayment_1_PaymentType_requireCustomer" "text",
    "sale_SalePayments_SalePayment_1_PaymentType_type" "text",
    "sale_SalePayments_SalePayment_1_amount" "text",
    "sale_SalePayments_SalePayment_1_archived" "text",
    "sale_SalePayments_SalePayment_1_cashRoundingDelta" "text",
    "sale_SalePayments_SalePayment_1_ccChargeID" "text",
    "sale_SalePayments_SalePayment_1_createTime" "text",
    "sale_SalePayments_SalePayment_1_creditAccountID" "text",
    "sale_SalePayments_SalePayment_1_employeeID" "text",
    "sale_SalePayments_SalePayment_1_paymentID" "text",
    "sale_SalePayments_SalePayment_1_paymentTypeID" "text",
    "sale_SalePayments_SalePayment_1_refPaymentID" "text",
    "sale_SalePayments_SalePayment_1_registerID" "text",
    "sale_SalePayments_SalePayment_1_remoteReference" "text",
    "sale_SalePayments_SalePayment_1_saleID" "text",
    "sale_SalePayments_SalePayment_1_salePaymentID" "text",
    "sale_SalePayments_SalePayment_1_surchargeAmount" "text",
    "sale_SalePayments_SalePayment_2_PaymentType_archived" "text",
    "sale_SalePayments_SalePayment_2_PaymentType_channel" "text",
    "sale_SalePayments_SalePayment_2_PaymentType_code" "text",
    "sale_SalePayments_SalePayment_2_PaymentType_internalReserved" "text",
    "sale_SalePayments_SalePayment_2_PaymentType_name" "text",
    "sale_SalePayments_SalePayment_2_PaymentType_paymentTypeID" "text",
    "sale_SP2_PT_refundAsPaymentTypeID" "text",
    "sale_SalePayments_SalePayment_2_PaymentType_requireCustomer" "text",
    "sale_SalePayments_SalePayment_2_PaymentType_type" "text",
    "sale_SalePayments_SalePayment_2_amount" "text",
    "sale_SalePayments_SalePayment_2_archived" "text",
    "sale_SalePayments_SalePayment_2_cashRoundingDelta" "text",
    "sale_SalePayments_SalePayment_2_ccChargeID" "text",
    "sale_SalePayments_SalePayment_2_createTime" "text",
    "sale_SalePayments_SalePayment_2_creditAccountID" "text",
    "sale_SalePayments_SalePayment_2_employeeID" "text",
    "sale_SalePayments_SalePayment_2_paymentID" "text",
    "sale_SalePayments_SalePayment_2_paymentTypeID" "text",
    "sale_SalePayments_SalePayment_2_refPaymentID" "text",
    "sale_SalePayments_SalePayment_2_registerID" "text",
    "sale_SalePayments_SalePayment_2_remoteReference" "text",
    "sale_SalePayments_SalePayment_2_saleID" "text",
    "sale_SalePayments_SalePayment_2_salePaymentID" "text",
    "sale_SalePayments_SalePayment_2_surchargeAmount" "text",
    "sale_SalePayments_SalePayment_3_PaymentType_archived" "text",
    "sale_SalePayments_SalePayment_3_PaymentType_channel" "text",
    "sale_SalePayments_SalePayment_3_PaymentType_code" "text",
    "sale_SalePayments_SalePayment_3_PaymentType_internalReserved" "text",
    "sale_SalePayments_SalePayment_3_PaymentType_name" "text",
    "sale_SalePayments_SalePayment_3_PaymentType_paymentTypeID" "text",
    "sale_SP3_PT_refundAsPaymentTypeID" "text",
    "sale_SalePayments_SalePayment_3_PaymentType_requireCustomer" "text",
    "sale_SalePayments_SalePayment_3_PaymentType_type" "text",
    "sale_SalePayments_SalePayment_3_amount" "text",
    "sale_SalePayments_SalePayment_3_archived" "text",
    "sale_SalePayments_SalePayment_3_cashRoundingDelta" "text",
    "sale_SalePayments_SalePayment_3_ccChargeID" "text",
    "sale_SalePayments_SalePayment_3_createTime" "text",
    "sale_SalePayments_SalePayment_3_creditAccountID" "text",
    "sale_SalePayments_SalePayment_3_employeeID" "text",
    "sale_SalePayments_SalePayment_3_paymentID" "text",
    "sale_SalePayments_SalePayment_3_paymentTypeID" "text",
    "sale_SalePayments_SalePayment_3_refPaymentID" "text",
    "sale_SalePayments_SalePayment_3_registerID" "text",
    "sale_SalePayments_SalePayment_3_remoteReference" "text",
    "sale_SalePayments_SalePayment_3_saleID" "text",
    "sale_SalePayments_SalePayment_3_salePaymentID" "text",
    "sale_SalePayments_SalePayment_3_surchargeAmount" "text",
    "sale_SalePayments_SalePayment_4_PaymentType_archived" "text",
    "sale_SalePayments_SalePayment_4_PaymentType_channel" "text",
    "sale_SalePayments_SalePayment_4_PaymentType_code" "text",
    "sale_SalePayments_SalePayment_4_PaymentType_internalReserved" "text",
    "sale_SalePayments_SalePayment_4_PaymentType_name" "text",
    "sale_SalePayments_SalePayment_4_PaymentType_paymentTypeID" "text",
    "sale_SP4_PT_refundAsPaymentTypeID" "text",
    "sale_SalePayments_SalePayment_4_PaymentType_requireCustomer" "text",
    "sale_SalePayments_SalePayment_4_PaymentType_type" "text",
    "sale_SalePayments_SalePayment_4_amount" "text",
    "sale_SalePayments_SalePayment_4_archived" "text",
    "sale_SalePayments_SalePayment_4_cashRoundingDelta" "text",
    "sale_SalePayments_SalePayment_4_ccChargeID" "text",
    "sale_SalePayments_SalePayment_4_createTime" "text",
    "sale_SalePayments_SalePayment_4_creditAccountID" "text",
    "sale_SalePayments_SalePayment_4_employeeID" "text",
    "sale_SalePayments_SalePayment_4_paymentID" "text",
    "sale_SalePayments_SalePayment_4_paymentTypeID" "text",
    "sale_SalePayments_SalePayment_4_refPaymentID" "text",
    "sale_SalePayments_SalePayment_4_registerID" "text",
    "sale_SalePayments_SalePayment_4_remoteReference" "text",
    "sale_SalePayments_SalePayment_4_saleID" "text",
    "sale_SalePayments_SalePayment_4_salePaymentID" "text",
    "sale_SalePayments_SalePayment_4_surchargeAmount" "text",
    "sale_SalePayments_SalePayment_5_PaymentType_archived" "text",
    "sale_SalePayments_SalePayment_5_PaymentType_code" "text",
    "sale_SalePayments_SalePayment_5_PaymentType_internalReserved" "text",
    "sale_SalePayments_SalePayment_5_PaymentType_name" "text",
    "sale_SalePayments_SalePayment_5_PaymentType_paymentTypeID" "text",
    "sale_SP5_PT_refundAsPaymentTypeID" "text",
    "sale_SalePayments_SalePayment_5_PaymentType_requireCustomer" "text",
    "sale_SalePayments_SalePayment_5_PaymentType_type" "text",
    "sale_SalePayments_SalePayment_5_amount" "text",
    "sale_SalePayments_SalePayment_5_archived" "text",
    "sale_SalePayments_SalePayment_5_cashRoundingDelta" "text",
    "sale_SalePayments_SalePayment_5_ccChargeID" "text",
    "sale_SalePayments_SalePayment_5_createTime" "text",
    "sale_SalePayments_SalePayment_5_creditAccountID" "text",
    "sale_SalePayments_SalePayment_5_employeeID" "text",
    "sale_SalePayments_SalePayment_5_paymentID" "text",
    "sale_SalePayments_SalePayment_5_paymentTypeID" "text",
    "sale_SalePayments_SalePayment_5_refPaymentID" "text",
    "sale_SalePayments_SalePayment_5_registerID" "text",
    "sale_SalePayments_SalePayment_5_remoteReference" "text",
    "sale_SalePayments_SalePayment_5_saleID" "text",
    "sale_SalePayments_SalePayment_5_salePaymentID" "text",
    "sale_SalePayments_SalePayment_5_surchargeAmount" "text",
    "sale_SalePayments_SalePayment_PaymentType_archived" "text",
    "sale_SalePayments_SalePayment_PaymentType_channel" "text",
    "sale_SalePayments_SalePayment_PaymentType_code" "text",
    "sale_SalePayments_SalePayment_PaymentType_internalReserved" "text",
    "sale_SalePayments_SalePayment_PaymentType_name" "text",
    "sale_SalePayments_SalePayment_PaymentType_paymentTypeID" "text",
    "sale_SalePayments_SalePayment_PaymentType_refundAsPaymentTypeID" "text",
    "sale_SalePayments_SalePayment_PaymentType_requireCustomer" "text",
    "sale_SalePayments_SalePayment_PaymentType_type" "text",
    "sale_SalePayments_SalePayment_amount" "text",
    "sale_SalePayments_SalePayment_archived" "text",
    "sale_SalePayments_SalePayment_cashRoundingDelta" "text",
    "sale_SalePayments_SalePayment_ccChargeID" "text",
    "sale_SalePayments_SalePayment_createTime" "text",
    "sale_SalePayments_SalePayment_creditAccountID" "text",
    "sale_SalePayments_SalePayment_employeeID" "text",
    "sale_SalePayments_SalePayment_paymentID" "text",
    "sale_SalePayments_SalePayment_paymentTypeID" "text",
    "sale_SalePayments_SalePayment_refPaymentID" "text",
    "sale_SalePayments_SalePayment_registerID" "text",
    "sale_SalePayments_SalePayment_remoteReference" "text",
    "sale_SalePayments_SalePayment_saleID" "text",
    "sale_SalePayments_SalePayment_salePaymentID" "text",
    "sale_SalePayments_SalePayment_surchargeAmount" "text",
    "sale_TaxCategory_TaxCategoryClasses_TaxCategoryClass_tax1Rate" "text",
    "sale_TaxCategory_TaxCategoryClasses_TaxCategoryClass_tax2Rate" "text",
    "sale_TCC_taxCategoryClassID" "text",
    "sale_TCC_taxCategoryID" "text",
    "sale_TaxCategory_TaxCategoryClasses_TaxCategoryClass_taxClassID" "text",
    "sale_TaxCategory_TaxCategoryClasses_TaxCategoryClass_timeStamp" "text",
    "sale_TaxCategory_isTaxInclusive" "text",
    "sale_TaxCategory_tax1Name" "text",
    "sale_TaxCategory_tax1Rate" "text",
    "sale_TaxCategory_tax2Name" "text",
    "sale_TaxCategory_tax2Rate" "text",
    "sale_TaxCategory_taxCategoryID" "text",
    "sale_TaxCategory_timeStamp" "text",
    "sale_TaxClassTotals_Tax_0_amount" "text",
    "sale_TaxClassTotals_Tax_0_id" "text",
    "sale_TaxClassTotals_Tax_0_name" "text",
    "sale_TaxClassTotals_Tax_0_rate" "text",
    "sale_TaxClassTotals_Tax_0_subtotal" "text",
    "sale_TaxClassTotals_Tax_0_taxable" "text",
    "sale_TaxClassTotals_Tax_0_taxname" "text",
    "sale_TaxClassTotals_Tax_1_amount" "text",
    "sale_TaxClassTotals_Tax_1_id" "text",
    "sale_TaxClassTotals_Tax_1_name" "text",
    "sale_TaxClassTotals_Tax_1_rate" "text",
    "sale_TaxClassTotals_Tax_1_subtotal" "text",
    "sale_TaxClassTotals_Tax_1_taxable" "text",
    "sale_TaxClassTotals_Tax_1_taxname" "text",
    "sale_TaxClassTotals_Tax_2_amount" "text",
    "sale_TaxClassTotals_Tax_2_id" "text",
    "sale_TaxClassTotals_Tax_2_name" "text",
    "sale_TaxClassTotals_Tax_2_rate" "text",
    "sale_TaxClassTotals_Tax_2_subtotal" "text",
    "sale_TaxClassTotals_Tax_2_taxable" "text",
    "sale_TaxClassTotals_Tax_2_taxname" "text",
    "sale_TaxClassTotals_Tax_amount" "text",
    "sale_TaxClassTotals_Tax_id" "text",
    "sale_TaxClassTotals_Tax_name" "text",
    "sale_TaxClassTotals_Tax_rate" "text",
    "sale_TaxClassTotals_Tax_subtotal" "text",
    "sale_TaxClassTotals_Tax_taxable" "text",
    "sale_TaxClassTotals_Tax_taxname" "text",
    "sale_archived" "text",
    "sale_balance" "text",
    "sale_calcAvgCost" "text",
    "sale_calcDiscount" "text",
    "sale_calcFIFOCost" "text",
    "sale_calcItemFees" "text",
    "sale_calcNonTaxable" "text",
    "sale_calcPayments" "text",
    "sale_calcSubtotal" "text",
    "sale_calcSurcharges" "text",
    "sale_calcTax1" "text",
    "sale_calcTax2" "text",
    "sale_calcTaxable" "text",
    "sale_calcTotal" "text",
    "sale_cashRoundedBalance" "text",
    "sale_cashRoundingDelta" "text",
    "sale_change" "text",
    "sale_completeTime" "text",
    "sale_completed" "text",
    "sale_createTime" "text",
    "sale_customerID" "text",
    "sale_discountID" "text",
    "sale_discountPercent" "text",
    "sale_displayableSubtotal" "text",
    "sale_displayableTotal" "text",
    "sale_employeeID" "text",
    "sale_enablePromotions" "text",
    "sale_isTaxInclusive" "text",
    "sale_quoteID" "text",
    "sale_receiptPreference" "text",
    "sale_referenceNumber" "text",
    "sale_referenceNumberSource" "text",
    "sale_registerID" "text",
    "sale_saleID" "text",
    "sale_shipToID" "text",
    "sale_shopID" "text",
    "sale_tax1Rate" "text",
    "sale_tax2Rate" "text",
    "sale_taxCategoryID" "text",
    "sale_taxTotal" "text",
    "sale_ticketNumber" "text",
    "sale_timeStamp" "text",
    "sale_tippableAmount" "text",
    "sale_total" "text",
    "sale_totalDue" "text",
    "sale_updateTime" "text",
    "sale_voided" "text"
);
COMMENT ON TABLE "public"."nest_brand_lightspeed_transaction_line" IS 'Flattened Lightspeed sale line export — one column per CSV field, one row per sale line.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_oauth_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_key" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."nest_brand_onboard_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_key" "text" NOT NULL,
    "business_name" "text" NOT NULL,
    "website_url" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "pages_found" integer DEFAULT 0 NOT NULL,
    "pages_scraped" integer DEFAULT 0 NOT NULL,
    "scraped_content" "text" DEFAULT ''::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_cost" "jsonb",
    "crawl_state" "jsonb"
);
CREATE TABLE IF NOT EXISTS "public"."nest_brand_portal_connections" (
    "brand_key" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "api_endpoint" "text" NOT NULL,
    "access_expires_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lightspeed_oauth_handshake_at" timestamp with time zone
);
COMMENT ON COLUMN "public"."nest_brand_portal_connections"."lightspeed_oauth_handshake_at" IS 'Set only by the Lightspeed OAuth callback. Used to trigger one-shot initial sync without firing on token refresh.';
CREATE TABLE IF NOT EXISTS "public"."nest_brand_portal_secrets" (
    "brand_key" "text" NOT NULL,
    "portal_password" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."nest_brand_portal_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_key" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."nest_brand_reporting_automation_runs" (
    "id" bigint NOT NULL,
    "brand_key" "text" NOT NULL,
    "preset_key" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "run_kind" "text" NOT NULL,
    "slot_key" "text" NOT NULL,
    "timezone" "text" NOT NULL,
    "local_label" "text",
    "recipient_mobile_e164s" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "message_text" "text",
    "error" "text",
    "triggered_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    CONSTRAINT "nest_brand_reporting_automation_runs_frequency_check" CHECK (("frequency" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "nest_brand_reporting_automation_runs_run_kind_check" CHECK (("run_kind" = ANY (ARRAY['scheduled'::"text", 'manual'::"text"]))),
    CONSTRAINT "nest_brand_reporting_automation_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);
COMMENT ON TABLE "public"."nest_brand_reporting_automation_runs" IS 'Delivery log for Team Hub owner reporting automations and manual digest sends.';
ALTER TABLE "public"."nest_brand_reporting_automation_runs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."nest_brand_reporting_automation_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."nest_outbound_call_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_key" "text" NOT NULL,
    "workorder_id" bigint NOT NULL,
    "customer_name" "text",
    "customer_phone_e164" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "trigger_source" "text" DEFAULT 'portal_manual'::"text" NOT NULL,
    "triggered_by_session_id" "uuid",
    "elevenlabs_agent_id" "text",
    "elevenlabs_phone_number_id" "text",
    "elevenlabs_conversation_id" "text",
    "twilio_call_sid" "text",
    "goal_prompt" "text",
    "dynamic_vars" "jsonb",
    "initiated_at" timestamp with time zone,
    "connected_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_seconds" integer,
    "answered" boolean,
    "failure_reason" "text",
    "summary" "jsonb",
    "recording_available" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nest_outbound_call_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'calling'::"text", 'connected'::"text", 'no_answer'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);
COMMENT ON TABLE "public"."nest_outbound_call_jobs" IS 'Portal-triggered outbound work-order completion calls via ElevenLabs + Twilio.';
CREATE TABLE IF NOT EXISTS "public"."nest_pg_net_edge_settings" (
    "id" smallint DEFAULT 1 NOT NULL,
    "supabase_url" "text" NOT NULL,
    "service_role_key" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "internal_shared_secret" "text",
    CONSTRAINT "nest_pg_net_edge_settings_id_check" CHECK (("id" = 1))
);
COMMENT ON TABLE "public"."nest_pg_net_edge_settings" IS 'Singleton pg_net settings for scheduled Edge Function calls. Stores project URL, legacy service_role key for transitional tooling, and a dedicated internal shared secret for machine-to-machine auth.';
COMMENT ON COLUMN "public"."nest_pg_net_edge_settings"."service_role_key" IS 'Legacy transitional column. No longer used by scheduled Edge Function calls after the internal shared secret cutover.';
COMMENT ON COLUMN "public"."nest_pg_net_edge_settings"."internal_shared_secret" IS 'Dedicated shared secret for pg_net -> Edge Function auth. Seed separately from Supabase API keys.';
CREATE TABLE IF NOT EXISTS "public"."notification_webhook_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "handle" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "account_email" "text" NOT NULL,
    "history_id" "text",
    "subscription_id" "text",
    "client_state" "text",
    "resource" "text",
    "expiration" timestamp with time zone NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "last_renewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resource_type" "text" DEFAULT 'email'::"text" NOT NULL,
    "channel_id" "text",
    "resource_id" "text",
    CONSTRAINT "email_webhook_subscriptions_provider_check" CHECK (("provider" = ANY (ARRAY['google'::"text", 'microsoft'::"text"]))),
    CONSTRAINT "notification_webhook_subs_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['email'::"text", 'calendar'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."oauth_link_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "original_refresh_token" "text",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "oauth_link_states_provider_check" CHECK (("provider" = ANY (ARRAY['google'::"text", 'microsoft'::"text", 'granola'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."onboarding_events" (
    "id" bigint NOT NULL,
    "handle" "text" NOT NULL,
    "chat_id" "text",
    "event_type" "text" NOT NULL,
    "message_turn_index" integer,
    "entry_state" "text",
    "value_wedge" "text",
    "current_state" "text",
    "experiment_variant_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "confidence_scores" "jsonb",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."onboarding_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."onboarding_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."outbound_messages" (
    "id" bigint NOT NULL,
    "chat_id" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "provider_message_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone
);
ALTER TABLE "public"."outbound_messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."outbound_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."pending_inbound_images" (
    "chat_id" "text" NOT NULL,
    "sender_handle" "text" NOT NULL,
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."polling_cursors" (
    "id" "text" NOT NULL,
    "last_value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."reported_bugs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reported_date" "date" GENERATED ALWAYS AS ((("created_at" AT TIME ZONE 'utc'::"text"))::"date") STORED,
    "reported_time" time without time zone GENERATED ALWAYS AS ((("created_at" AT TIME ZONE 'utc'::"text"))::time without time zone) STORED,
    "auth_user_id" "uuid",
    "sender_handle" "text",
    "chat_id" "text" NOT NULL,
    "provider" "text",
    "service" "text",
    "message_text" "text" NOT NULL,
    "bug_text" "text" NOT NULL,
    "prior_messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS "public"."reported_bugs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE "public"."reported_bugs_id_seq" OWNED BY "public"."reported_bugs"."id";
CREATE TABLE IF NOT EXISTS "public"."twilio_voice_welcome_rate" (
    "brand_key" "text" NOT NULL,
    "caller_e164" "text" NOT NULL,
    "last_sent_at" timestamp with time zone NOT NULL
);
COMMENT ON TABLE "public"."twilio_voice_welcome_rate" IS 'Last time a Twilio→Linq missed-call welcome was sent per brand + caller; used for cooldown.';
CREATE TABLE IF NOT EXISTS "public"."user_automations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "automation_type" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "label" "text",
    "last_run_at" timestamp with time zone,
    "next_run_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_admin_modified_at" timestamp with time zone,
    "last_admin_modified_by_email" "text",
    "last_admin_modified_action" "text"
);
CREATE TABLE IF NOT EXISTS "public"."user_google_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "google_email" "text" NOT NULL,
    "google_name" "text",
    "google_avatar_url" "text",
    "refresh_token" "text" NOT NULL,
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "timezone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
CREATE TABLE IF NOT EXISTS "public"."user_granola_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granola_email" "text" NOT NULL,
    "granola_name" "text",
    "access_token" "text" NOT NULL,
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "is_primary" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_id" "text",
    "client_secret" "text"
);
CREATE TABLE IF NOT EXISTS "public"."user_microsoft_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "microsoft_email" "text" NOT NULL,
    "microsoft_name" "text",
    "microsoft_avatar_url" "text",
    "refresh_token" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text"
);
CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "handle" "text" NOT NULL,
    "name" "text",
    "facts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "first_seen" bigint NOT NULL,
    "last_seen" bigint NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "onboarding_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "onboard_messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "onboard_count" integer DEFAULT 0 NOT NULL,
    "bot_number" "text",
    "pdl_profile" "jsonb",
    "onboard_state" "text" DEFAULT 'new_user_unclassified'::"text" NOT NULL,
    "entry_state" "text",
    "first_value_wedge" "text",
    "first_value_delivered_at" timestamp with time zone,
    "follow_through_delivered_at" timestamp with time zone,
    "second_engagement_at" timestamp with time zone,
    "checkin_opt_in" boolean,
    "checkin_decline_at" timestamp with time zone,
    "checkin_last_permission_at" timestamp with time zone,
    "memory_moment_delivered_at" timestamp with time zone,
    "activated_at" timestamp with time zone,
    "at_risk_at" timestamp with time zone,
    "last_proactive_sent_at" timestamp with time zone,
    "last_proactive_ignored" boolean DEFAULT false NOT NULL,
    "proactive_ignore_count" integer DEFAULT 0 NOT NULL,
    "recovery_nudge_sent_at" timestamp with time zone,
    "timezone" "text",
    "activation_score" integer DEFAULT 0 NOT NULL,
    "capability_categories_used" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "auth_user_id" "uuid",
    "use_linq" boolean DEFAULT false NOT NULL,
    "deep_profile_snapshot" "jsonb",
    "deep_profile_built_at" timestamp with time zone,
    "context_profile" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "test_route_llm" boolean DEFAULT false NOT NULL,
    "display_name" "text",
    "age_group" "text",
    "new_router" boolean DEFAULT false NOT NULL,
    "new_deepdive" "text",
    "new_deepdive_built_at" timestamp with time zone,
    "new_deepdive_status" "text",
    "new_deepdive_job" "jsonb",
    "new_deepdive_summary" "text",
    "new_deepdive_tldr" "text",
    "genz" boolean DEFAULT false NOT NULL,
    "pipedream" boolean DEFAULT false NOT NULL,
    "composio" boolean DEFAULT false NOT NULL,
    "composio_recommendations" "jsonb",
    "route" "text",
    "route_brand_key" "text",
    CONSTRAINT "user_profiles_route_check" CHECK ((("route" IS NULL) OR ("route" = ANY (ARRAY['nest'::"text", 'brand'::"text", 'quid'::"text", 'ash-internal'::"text", 'ash-brand'::"text", 'ash'::"text"]))))
);
COMMENT ON COLUMN "public"."user_profiles"."deep_profile_snapshot" IS 'LLM-synthesised profile snapshot built from ingested emails, calendar, contacts. Used for instant deep profile responses.';
COMMENT ON COLUMN "public"."user_profiles"."deep_profile_built_at" IS 'When the deep profile snapshot was last built/refreshed.';
COMMENT ON COLUMN "public"."user_profiles"."display_name" IS 'Preferred name for greetings; coalesced with name when null.';
COMMENT ON COLUMN "public"."user_profiles"."new_deepdive" IS 'Markdown deep-dive profile built by the deep-dive edge function from emails, calendar, memories and entities.';
COMMENT ON COLUMN "public"."user_profiles"."new_deepdive_built_at" IS 'When the new_deepdive markdown was last written.';
COMMENT ON COLUMN "public"."user_profiles"."new_deepdive_status" IS 'Current job status: queued, gathering, synthesising, assembling, completed, failed.';
COMMENT ON COLUMN "public"."user_profiles"."new_deepdive_job" IS 'Working state for the deep-dive job: stage, section_drafts, error, etc.';
COMMENT ON COLUMN "public"."user_profiles"."new_deepdive_summary" IS 'Compressed (~1500 char) markdown summary of new_deepdive for system-prompt injection and UI.';
COMMENT ON COLUMN "public"."user_profiles"."new_deepdive_tldr" IS 'One- or two-sentence (~280 char) TL;DR of new_deepdive for SMS / single-line UI surfaces.';
COMMENT ON COLUMN "public"."user_profiles"."genz" IS 'When true, Nest uses Gen Z personality prompt layers (same architecture and tools).';
COMMENT ON COLUMN "public"."user_profiles"."pipedream" IS 'Feature flag: when true, this user gets the Pipedream automation layer (long-tail integration via NL from iMessage). Controlled rollout. Default false.';
COMMENT ON COLUMN "public"."user_profiles"."composio" IS 'Feature flag: when true, this user gets the Composio integration stack. Controlled rollout. Default false.';
COMMENT ON COLUMN "public"."user_profiles"."route" IS 'Current product route for direct Linq/iMessage chats: nest, brand, quid, or ash-internal.';
COMMENT ON COLUMN "public"."user_profiles"."route_brand_key" IS 'Brand key used when route=brand. Defaults to ash when omitted.';
CREATE TABLE IF NOT EXISTS "public"."user_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "chunk_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mime_type" "text",
    "file_size_bytes" bigint,
    "storage_bucket" "text",
    "storage_path" "text",
    "binary_sha256" "text",
    "scan_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "scan_provider" "text",
    "scan_reference" "text",
    "scan_completed_at" timestamp with time zone,
    CONSTRAINT "user_uploads_file_type_check" CHECK (("file_type" = ANY (ARRAY['pdf'::"text", 'image'::"text", 'text'::"text"]))),
    CONSTRAINT "user_uploads_scan_status_check" CHECK (("scan_status" = ANY (ARRAY['not_required'::"text", 'pending'::"text", 'clean'::"text", 'rejected'::"text", 'failed'::"text", 'legacy_unscanned'::"text"]))),
    CONSTRAINT "user_uploads_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'failed'::"text", 'needs_reupload'::"text", 'scanning'::"text", 'rejected'::"text"])))
);
CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "provider_message_id" "text" NOT NULL,
    "chat_id" "text" NOT NULL,
    "sender_handle" "text" NOT NULL,
    "bot_number" "text" NOT NULL,
    "event_type" "text" DEFAULT 'message.received'::"text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "raw_payload" "jsonb" NOT NULL,
    "normalized_payload" "jsonb" NOT NULL,
    "last_error" "text",
    "processing_started_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
ALTER TABLE "public"."webhook_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."webhook_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE IF NOT EXISTS "public"."yellow_jersey_ash_phone_routes" (
    "phone_e164" "text" NOT NULL,
    "brand_key" "text" DEFAULT 'ash'::"text" NOT NULL,
    "raw_phone" "text",
    "source" "text" DEFAULT 'yellow_jersey'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "yellow_jersey_ash_phone_routes_brand_key_check" CHECK (("brand_key" = 'ash'::"text")),
    CONSTRAINT "yellow_jersey_ash_phone_routes_phone_e164_check" CHECK (("phone_e164" ~ '^\+[1-9][0-9]{8,14}$'::"text"))
);
COMMENT ON TABLE "public"."yellow_jersey_ash_phone_routes" IS 'Ashburton Cycles phone numbers captured by Yellow Jersey so Nest can route matching inbound messages to Hey Ash.';
COMMENT ON COLUMN "public"."yellow_jersey_ash_phone_routes"."phone_e164" IS 'Customer phone number normalised to E.164 for exact inbound sender matching.';
COMMENT ON COLUMN "public"."yellow_jersey_ash_phone_routes"."brand_key" IS 'Hardcoded route target for this MVP. Must remain ash.';
CREATE TABLE IF NOT EXISTS "public"."yellow_jersey_upload_phone_routes" (
    "phone_e164" "text" NOT NULL,
    "raw_phone" "text",
    "source" "text" DEFAULT 'yellow_jersey'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT "yellow_jersey_upload_phone_routes_phone_e164_check" CHECK (("phone_e164" ~ '^\+[1-9][0-9]{8,14}$'::"text")),
    CONSTRAINT "yellow_jersey_upload_phone_routes_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'disabled'::"text"])))
);
COMMENT ON TABLE "public"."yellow_jersey_upload_phone_routes" IS 'Yellow Jersey customer numbers captured for the text-upload flow so Nest can route matching inbound messages to upload mode.';
COMMENT ON COLUMN "public"."yellow_jersey_upload_phone_routes"."phone_e164" IS 'Customer phone number normalised to E.164 for exact inbound sender matching.';
CREATE TABLE IF NOT EXISTS "public"."yellow_jersey_upload_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone_e164" "text" NOT NULL,
    "chat_id" "text" NOT NULL,
    "bot_number" "text" NOT NULL,
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "handoff_url" "text",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT "yellow_jersey_upload_sessions_images_array_check" CHECK (("jsonb_typeof"("images") = 'array'::"text")),
    CONSTRAINT "yellow_jersey_upload_sessions_phone_e164_check" CHECK (("phone_e164" ~ '^\+[1-9][0-9]{8,14}$'::"text")),
    CONSTRAINT "yellow_jersey_upload_sessions_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'processing'::"text", 'ready'::"text", 'failed'::"text", 'cancelled'::"text"])))
);
COMMENT ON TABLE "public"."yellow_jersey_upload_sessions" IS 'Nest-side staging sessions for Yellow Jersey text uploads before a one-time marketplace handoff link is generated.';
ALTER TABLE ONLY "public"."linq_send_failures" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."linq_send_failures_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."message_buffer" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."message_buffer_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_sql_query_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."nest_brand_lightspeed_sql_query_log_id_seq"'::"regclass");
ALTER TABLE ONLY "public"."reported_bugs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reported_bugs_id_seq"'::"regclass");
ALTER TABLE ONLY "full_review"."affect_snapshots"
    ADD CONSTRAINT "affect_snapshots_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."candidate_mentions"
    ADD CONSTRAINT "candidate_mentions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."chunks"
    ADD CONSTRAINT "chunks_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."claim_corrections"
    ADD CONSTRAINT "claim_corrections_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."entities"
    ADD CONSTRAINT "entities_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."entity_aliases"
    ADD CONSTRAINT "entity_aliases_entity_id_alias_type_alias_value_key" UNIQUE ("entity_id", "alias_type", "alias_value");
ALTER TABLE ONLY "full_review"."entity_aliases"
    ADD CONSTRAINT "entity_aliases_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."open_loops"
    ADD CONSTRAINT "open_loops_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."raw_events"
    ADD CONSTRAINT "raw_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."raw_events"
    ADD CONSTRAINT "raw_events_user_id_source_type_source_ref_key" UNIQUE ("user_id", "source_type", "source_ref");
ALTER TABLE ONLY "full_review"."rendered_files"
    ADD CONSTRAINT "rendered_files_job_id_path_key" UNIQUE ("job_id", "path");
ALTER TABLE ONLY "full_review"."rendered_files"
    ADD CONSTRAINT "rendered_files_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."sources"
    ADD CONSTRAINT "sources_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "full_review"."user_snapshots"
    ADD CONSTRAINT "user_snapshots_pkey" PRIMARY KEY ("user_id");
ALTER TABLE ONLY "public"."admin_onboarding_prompts"
    ADD CONSTRAINT "admin_onboarding_prompts_pkey" PRIMARY KEY ("prompt_key");
ALTER TABLE ONLY "public"."analytics_message_facts"
    ADD CONSTRAINT "analytics_message_facts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."analytics_message_facts"
    ADD CONSTRAINT "analytics_message_facts_source_message_id_key" UNIQUE ("source_message_id");
ALTER TABLE ONLY "public"."api_cost_logs"
    ADD CONSTRAINT "api_cost_logs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."api_daily_usage_by_message_type"
    ADD CONSTRAINT "api_daily_usage_by_message_type_date_user_id_message_type_key" UNIQUE ("date", "user_id", "message_type");
ALTER TABLE ONLY "public"."api_daily_usage_by_message_type"
    ADD CONSTRAINT "api_daily_usage_by_message_type_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."api_daily_usage_by_provider"
    ADD CONSTRAINT "api_daily_usage_by_provider_date_user_id_provider_key" UNIQUE ("date", "user_id", "provider");
ALTER TABLE ONLY "public"."api_daily_usage_by_provider"
    ADD CONSTRAINT "api_daily_usage_by_provider_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."api_daily_usage"
    ADD CONSTRAINT "api_daily_usage_date_user_id_key" UNIQUE ("date", "user_id");
ALTER TABLE ONLY "public"."api_daily_usage"
    ADD CONSTRAINT "api_daily_usage_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."automation_preferences"
    ADD CONSTRAINT "automation_preferences_pkey" PRIMARY KEY ("handle", "automation_type");
ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."brand_sessions"
    ADD CONSTRAINT "brand_sessions_pkey" PRIMARY KEY ("chat_id");
ALTER TABLE ONLY "public"."buzz_call_jobs"
    ADD CONSTRAINT "buzz_call_jobs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."buzz_events"
    ADD CONSTRAINT "buzz_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."buzz_sessions"
    ADD CONSTRAINT "buzz_sessions_chat_user_bot_unique" UNIQUE ("chat_id", "user_handle", "bot_number");
ALTER TABLE ONLY "public"."buzz_sessions"
    ADD CONSTRAINT "buzz_sessions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."conversation_summaries"
    ADD CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."customer_automation_rule_state"
    ADD CONSTRAINT "customer_automation_rule_state_handle_rule_key_key" UNIQUE ("handle", "rule_key");
ALTER TABLE ONLY "public"."customer_automation_rule_state"
    ADD CONSTRAINT "customer_automation_rule_state_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."edge_request_rate_limits"
    ADD CONSTRAINT "edge_request_rate_limits_pkey" PRIMARY KEY ("bucket_key", "bucket_start");
ALTER TABLE ONLY "public"."notification_webhook_events"
    ADD CONSTRAINT "email_webhook_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."notification_webhook_subscriptions"
    ADD CONSTRAINT "email_webhook_subscriptions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."experiment_assignments"
    ADD CONSTRAINT "experiment_assignments_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."experiment_assignments"
    ADD CONSTRAINT "experiment_assignments_unique" UNIQUE ("handle", "experiment_name");
ALTER TABLE ONLY "public"."job_failures"
    ADD CONSTRAINT "job_failures_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."linq_human_mode_threads"
    ADD CONSTRAINT "linq_human_mode_threads_chat_id_key" UNIQUE ("chat_id");
ALTER TABLE ONLY "public"."linq_human_mode_threads"
    ADD CONSTRAINT "linq_human_mode_threads_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."linq_human_mode_threads"
    ADD CONSTRAINT "linq_human_mode_threads_recipient_handle_bot_number_key" UNIQUE ("recipient_handle", "bot_number");
ALTER TABLE ONLY "public"."linq_send_failures"
    ADD CONSTRAINT "linq_send_failures_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."message_buffer"
    ADD CONSTRAINT "message_buffer_message_id_key" UNIQUE ("message_id");
ALTER TABLE ONLY "public"."message_buffer"
    ADD CONSTRAINT "message_buffer_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_brand_chat_config"
    ADD CONSTRAINT "nest_brand_chat_config_pkey" PRIMARY KEY ("brand_key");
ALTER TABLE ONLY "public"."nest_brand_deputy_pending_actions"
    ADD CONSTRAINT "nest_brand_deputy_pending_actions_pkey" PRIMARY KEY ("chat_id");
ALTER TABLE ONLY "public"."nest_brand_images"
    ADD CONSTRAINT "nest_brand_images_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_brand_knowledge_chunks"
    ADD CONSTRAINT "nest_brand_knowledge_chunks_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_brand_knowledge_items"
    ADD CONSTRAINT "nest_brand_knowledge_items_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_backfill_state"
    ADD CONSTRAINT "nest_brand_lightspeed_backfill_state_pkey" PRIMARY KEY ("brand_key");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_booking_state"
    ADD CONSTRAINT "nest_brand_lightspeed_booking_state_pkey" PRIMARY KEY ("brand_key", "chat_id");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_item"
    ADD CONSTRAINT "nest_brand_lightspeed_item_pkey" PRIMARY KEY ("brand_key", "item_id");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_lookup_cache"
    ADD CONSTRAINT "nest_brand_lightspeed_lookup_cache_pkey" PRIMARY KEY ("brand_key");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_report_sale_line"
    ADD CONSTRAINT "nest_brand_lightspeed_report_sale_line_pkey" PRIMARY KEY ("brand_key", "sale_id", "sale_line_id");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_sale_line"
    ADD CONSTRAINT "nest_brand_lightspeed_sale_line_pkey" PRIMARY KEY ("brand_key", "sale_line_id");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_sale"
    ADD CONSTRAINT "nest_brand_lightspeed_sale_pkey" PRIMARY KEY ("brand_key", "sale_id");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_sql_query_log"
    ADD CONSTRAINT "nest_brand_lightspeed_sql_query_log_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_sync_state"
    ADD CONSTRAINT "nest_brand_lightspeed_sync_state_pkey" PRIMARY KEY ("brand_key", "resource");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_transaction_export_state"
    ADD CONSTRAINT "nest_brand_lightspeed_transaction_export_state_pkey" PRIMARY KEY ("brand_key");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_transaction_line"
    ADD CONSTRAINT "nest_brand_lightspeed_transaction_line_pkey" PRIMARY KEY ("brand_key", "sale_id", "sale_line_id");
ALTER TABLE ONLY "public"."nest_brand_lightspeed_workorder"
    ADD CONSTRAINT "nest_brand_lightspeed_workorder_pkey" PRIMARY KEY ("brand_key", "workorder_id");
ALTER TABLE ONLY "public"."nest_brand_oauth_states"
    ADD CONSTRAINT "nest_brand_oauth_states_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_brand_onboard_jobs"
    ADD CONSTRAINT "nest_brand_onboard_jobs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_brand_portal_connections"
    ADD CONSTRAINT "nest_brand_portal_connections_pkey" PRIMARY KEY ("brand_key", "provider");
ALTER TABLE ONLY "public"."nest_brand_portal_secrets"
    ADD CONSTRAINT "nest_brand_portal_secrets_pkey" PRIMARY KEY ("brand_key");
ALTER TABLE ONLY "public"."nest_brand_portal_sessions"
    ADD CONSTRAINT "nest_brand_portal_sessions_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_brand_reporting_automation_runs"
    ADD CONSTRAINT "nest_brand_reporting_automation_runs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_outbound_call_jobs"
    ADD CONSTRAINT "nest_outbound_call_jobs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."nest_pg_net_edge_settings"
    ADD CONSTRAINT "nest_pg_net_edge_settings_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."oauth_link_states"
    ADD CONSTRAINT "oauth_link_states_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."onboarding_events"
    ADD CONSTRAINT "onboarding_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."outbound_messages"
    ADD CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."pending_inbound_images"
    ADD CONSTRAINT "pending_inbound_images_pkey" PRIMARY KEY ("chat_id", "sender_handle");
ALTER TABLE ONLY "public"."polling_cursors"
    ADD CONSTRAINT "polling_cursors_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."reported_bugs"
    ADD CONSTRAINT "reported_bugs_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."twilio_voice_welcome_rate"
    ADD CONSTRAINT "twilio_voice_welcome_rate_pkey" PRIMARY KEY ("brand_key", "caller_e164");
ALTER TABLE ONLY "public"."user_automations"
    ADD CONSTRAINT "user_automations_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_google_accounts"
    ADD CONSTRAINT "user_google_accounts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_google_accounts"
    ADD CONSTRAINT "user_google_accounts_user_id_google_email_key" UNIQUE ("user_id", "google_email");
ALTER TABLE ONLY "public"."user_granola_accounts"
    ADD CONSTRAINT "user_granola_accounts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_granola_accounts"
    ADD CONSTRAINT "user_granola_accounts_user_id_granola_email_key" UNIQUE ("user_id", "granola_email");
ALTER TABLE ONLY "public"."user_microsoft_accounts"
    ADD CONSTRAINT "user_microsoft_accounts_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."user_microsoft_accounts"
    ADD CONSTRAINT "user_microsoft_accounts_user_id_microsoft_email_key" UNIQUE ("user_id", "microsoft_email");
ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("handle");
ALTER TABLE ONLY "public"."user_uploads"
    ADD CONSTRAINT "user_uploads_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_provider_provider_message_id_key" UNIQUE ("provider", "provider_message_id");
ALTER TABLE ONLY "public"."yellow_jersey_ash_phone_routes"
    ADD CONSTRAINT "yellow_jersey_ash_phone_routes_pkey" PRIMARY KEY ("phone_e164");
ALTER TABLE ONLY "public"."yellow_jersey_upload_phone_routes"
    ADD CONSTRAINT "yellow_jersey_upload_phone_routes_pkey" PRIMARY KEY ("phone_e164");
ALTER TABLE ONLY "public"."yellow_jersey_upload_sessions"
    ADD CONSTRAINT "yellow_jersey_upload_sessions_pkey" PRIMARY KEY ("id");
CREATE INDEX "affect_snapshots_job_idx" ON "full_review"."affect_snapshots" USING "btree" ("job_id");
CREATE INDEX "candidate_mentions_job_idx" ON "full_review"."candidate_mentions" USING "btree" ("job_id");
CREATE INDEX "candidate_mentions_unresolved_idx" ON "full_review"."candidate_mentions" USING "btree" ("job_id") WHERE ("resolved_entity_id" IS NULL);
CREATE INDEX "chunks_job_sequence_idx" ON "full_review"."chunks" USING "btree" ("job_id", "sequence");
CREATE INDEX "chunks_job_stage_status_idx" ON "full_review"."chunks" USING "btree" ("job_id", "stage", "status");
CREATE INDEX "chunks_ready_idx" ON "full_review"."chunks" USING "btree" ("next_retry_at" NULLS FIRST) WHERE ("status" = 'pending'::"text");
CREATE INDEX "claims_job_idx" ON "full_review"."claims" USING "btree" ("job_id");
CREATE INDEX "claims_live_idx" ON "full_review"."claims" USING "btree" ("user_id", "subject_entity_id") WHERE ((NOT "forgotten") AND ("superseded_by" IS NULL));
CREATE INDEX "claims_subject_predicate_idx" ON "full_review"."claims" USING "btree" ("user_id", "subject_entity_id", "predicate") WHERE (NOT "forgotten");
CREATE INDEX "claims_zone_idx" ON "full_review"."claims" USING "btree" ("user_id", "zone") WHERE (NOT "forgotten");
CREATE INDEX "entities_job_idx" ON "full_review"."entities" USING "btree" ("job_id");
CREATE INDEX "entities_user_type_tier_idx" ON "full_review"."entities" USING "btree" ("user_id", "type", "importance_tier");
CREATE INDEX "entity_aliases_lookup_idx" ON "full_review"."entity_aliases" USING "btree" ("alias_type", "alias_value");
CREATE INDEX "jobs_status_heartbeat_idx" ON "full_review"."jobs" USING "btree" ("status", "last_heartbeat_at") WHERE ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"]));
CREATE INDEX "jobs_user_created_idx" ON "full_review"."jobs" USING "btree" ("user_id", "created_at" DESC);
CREATE INDEX "open_loops_job_idx" ON "full_review"."open_loops" USING "btree" ("job_id");
CREATE INDEX "open_loops_user_status_idx" ON "full_review"."open_loops" USING "btree" ("user_id", "status", "due_at");
CREATE INDEX "raw_events_job_zone_idx" ON "full_review"."raw_events" USING "btree" ("job_id", "zone");
CREATE INDEX "raw_events_qualifies_idx" ON "full_review"."raw_events" USING "btree" ("job_id", "qualifies_for_extraction") WHERE "qualifies_for_extraction";
CREATE INDEX "raw_events_user_occurred_idx" ON "full_review"."raw_events" USING "btree" ("user_id", "occurred_at" DESC);
CREATE INDEX "rendered_files_user_path_idx" ON "full_review"."rendered_files" USING "btree" ("user_id", "path");
CREATE INDEX "sources_raw_event_idx" ON "full_review"."sources" USING "btree" ("raw_event_id");
CREATE INDEX "admin_onboarding_prompts_updated_at_idx" ON "public"."admin_onboarding_prompts" USING "btree" ("updated_at" DESC);
CREATE INDEX "analytics_message_facts_brand_created_at_idx" ON "public"."analytics_message_facts" USING "btree" ("engagement_brand_key", "created_at" DESC) WHERE ("engagement_scope" = 'brand'::"text");
CREATE INDEX "analytics_message_facts_created_at_idx" ON "public"."analytics_message_facts" USING "btree" ("created_at" DESC);
CREATE INDEX "analytics_message_facts_day_scope_idx" ON "public"."analytics_message_facts" USING "btree" ("created_day_mel" DESC, "engagement_scope", "engagement_brand_key");
CREATE INDEX "analytics_message_facts_sender_created_at_idx" ON "public"."analytics_message_facts" USING "btree" ("sender_handle", "created_at" DESC);
CREATE INDEX "api_cost_logs_agent" ON "public"."api_cost_logs" USING "btree" ("agent_name", "created_at" DESC);
CREATE INDEX "api_cost_logs_chat_id" ON "public"."api_cost_logs" USING "btree" ("chat_id", "created_at" DESC);
CREATE INDEX "api_cost_logs_created" ON "public"."api_cost_logs" USING "btree" ("created_at" DESC);
CREATE INDEX "api_cost_logs_message_type" ON "public"."api_cost_logs" USING "btree" ("message_type", "created_at" DESC);
CREATE INDEX "api_cost_logs_provider" ON "public"."api_cost_logs" USING "btree" ("provider", "created_at" DESC);
CREATE INDEX "api_cost_logs_sender" ON "public"."api_cost_logs" USING "btree" ("sender_handle", "created_at" DESC);
CREATE INDEX "api_cost_logs_user_created" ON "public"."api_cost_logs" USING "btree" ("user_id", "created_at" DESC);
CREATE INDEX "api_daily_msgtype_user_date" ON "public"."api_daily_usage_by_message_type" USING "btree" ("user_id", "date" DESC);
CREATE INDEX "api_daily_provider_user_date" ON "public"."api_daily_usage_by_provider" USING "btree" ("user_id", "date" DESC);
CREATE INDEX "api_daily_usage_user_date" ON "public"."api_daily_usage" USING "btree" ("user_id", "date" DESC);
CREATE INDEX "automation_runs_handle_sent_idx" ON "public"."automation_runs" USING "btree" ("handle", "sent_at" DESC);
CREATE INDEX "automation_runs_handle_type_idx" ON "public"."automation_runs" USING "btree" ("handle", "automation_type", "sent_at" DESC);
CREATE INDEX "automation_runs_type_sent_idx" ON "public"."automation_runs" USING "btree" ("automation_type", "sent_at" DESC);
CREATE INDEX "brand_sessions_brand_key_activated_at_idx" ON "public"."brand_sessions" USING "btree" ("brand_key", "activated_at" DESC);
CREATE INDEX "buzz_call_jobs_approval_idx" ON "public"."buzz_call_jobs" USING "btree" ("approval_message_id") WHERE ("approval_message_id" IS NOT NULL);
CREATE INDEX "buzz_call_jobs_chat_created_idx" ON "public"."buzz_call_jobs" USING "btree" ("chat_id", "created_at" DESC);
CREATE INDEX "buzz_call_jobs_elevenlabs_conversation_idx" ON "public"."buzz_call_jobs" USING "btree" ("elevenlabs_conversation_id") WHERE ("elevenlabs_conversation_id" IS NOT NULL);
CREATE INDEX "buzz_call_jobs_status_idx" ON "public"."buzz_call_jobs" USING "btree" ("status", "updated_at" DESC);
CREATE INDEX "buzz_call_jobs_twilio_call_idx" ON "public"."buzz_call_jobs" USING "btree" ("twilio_call_sid") WHERE ("twilio_call_sid" IS NOT NULL);
CREATE INDEX "buzz_events_chat_created_idx" ON "public"."buzz_events" USING "btree" ("chat_id", "created_at" DESC);
CREATE INDEX "buzz_events_job_created_idx" ON "public"."buzz_events" USING "btree" ("call_job_id", "created_at" DESC) WHERE ("call_job_id" IS NOT NULL);
CREATE INDEX "buzz_sessions_active_chat_idx" ON "public"."buzz_sessions" USING "btree" ("chat_id", "user_handle", "bot_number") WHERE ("status" = 'active'::"text");
CREATE INDEX "buzz_sessions_expires_idx" ON "public"."buzz_sessions" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);
CREATE INDEX "conversation_messages_brand_key_chat_created_at_idx" ON "public"."conversation_messages" USING "btree" ("engagement_brand_key", "chat_id", "created_at" DESC) WHERE ("engagement_scope" = 'brand'::"text");
CREATE INDEX "conversation_messages_chat_id_created_at_idx" ON "public"."conversation_messages" USING "btree" ("chat_id", "created_at" DESC);
CREATE INDEX "conversation_messages_chat_provider_message_idx" ON "public"."conversation_messages" USING "btree" ("chat_id", "provider_message_id") WHERE ("provider_message_id" IS NOT NULL);
CREATE INDEX "conversation_messages_chat_scope_created_at_idx" ON "public"."conversation_messages" USING "btree" ("chat_id", "engagement_scope", "created_at" DESC);
CREATE INDEX "conversation_messages_expires_at_idx" ON "public"."conversation_messages" USING "btree" ("expires_at");
CREATE INDEX "conversation_messages_reply_to_provider_message_idx" ON "public"."conversation_messages" USING "btree" ("reply_to_provider_message_id") WHERE ("reply_to_provider_message_id" IS NOT NULL);
CREATE INDEX "conversation_messages_user_chat_created_idx" ON "public"."conversation_messages" USING "btree" ("chat_id", "created_at" DESC) WHERE ("role" = 'user'::"text");
CREATE INDEX "conversation_summaries_chat_id_last_msg_idx" ON "public"."conversation_summaries" USING "btree" ("chat_id", "last_message_at" DESC);
CREATE INDEX "conversation_summaries_chat_scope_last_msg_idx" ON "public"."conversation_summaries" USING "btree" ("chat_id", "engagement_scope", "engagement_brand_key", "last_message_at" DESC);
CREATE INDEX "conversation_summaries_sender_handle_idx" ON "public"."conversation_summaries" USING "btree" ("sender_handle", "last_message_at" DESC);
CREATE INDEX "conversation_summaries_topics_gin_idx" ON "public"."conversation_summaries" USING "gin" ("topics");
CREATE INDEX "customer_automation_rule_state_handle_idx" ON "public"."customer_automation_rule_state" USING "btree" ("handle", "updated_at" DESC);
CREATE INDEX "customer_automation_rule_state_rule_idx" ON "public"."customer_automation_rule_state" USING "btree" ("rule_key", "updated_at" DESC);
CREATE INDEX "edge_request_rate_limits_updated_at_idx" ON "public"."edge_request_rate_limits" USING "btree" ("updated_at" DESC);
CREATE INDEX "email_webhook_events_pending_idx" ON "public"."notification_webhook_events" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");
CREATE INDEX "email_webhook_events_sub_idx" ON "public"."notification_webhook_events" USING "btree" ("subscription_id", "created_at" DESC);
CREATE INDEX "email_webhook_subs_active_exp_idx" ON "public"."notification_webhook_subscriptions" USING "btree" ("expiration") WHERE ("active" = true);
CREATE INDEX "email_webhook_subs_handle_idx" ON "public"."notification_webhook_subscriptions" USING "btree" ("handle");
CREATE INDEX "email_webhook_subs_provider_email_idx" ON "public"."notification_webhook_subscriptions" USING "btree" ("provider", "account_email");
CREATE INDEX "experiment_assignments_handle_idx" ON "public"."experiment_assignments" USING "btree" ("handle");
CREATE INDEX "idx_brand_images_key" ON "public"."nest_brand_images" USING "btree" ("brand_key");
CREATE INDEX "idx_brand_reporting_automation_runs_brand_created" ON "public"."nest_brand_reporting_automation_runs" USING "btree" ("brand_key", "created_at" DESC);
CREATE UNIQUE INDEX "idx_brand_reporting_automation_runs_slot" ON "public"."nest_brand_reporting_automation_runs" USING "btree" ("brand_key", "preset_key", "slot_key");
CREATE INDEX "idx_message_buffer_pending" ON "public"."message_buffer" USING "btree" ("chat_id", "id") WHERE ("claimed_at" IS NULL);
CREATE INDEX "idx_nest_brand_chat_config_activation_aliases" ON "public"."nest_brand_chat_config" USING "gin" ("activation_aliases");
CREATE UNIQUE INDEX "idx_nest_brand_chat_config_twilio_phone_number_e164" ON "public"."nest_brand_chat_config" USING "btree" ("twilio_phone_number_e164") WHERE (("twilio_phone_number_e164" IS NOT NULL) AND ("twilio_phone_number_e164" <> ''::"text"));
CREATE INDEX "idx_nest_brand_deputy_pending_expires" ON "public"."nest_brand_deputy_pending_actions" USING "btree" ("expires_at");
CREATE INDEX "idx_nest_brand_knowledge_chunks_brand" ON "public"."nest_brand_knowledge_chunks" USING "btree" ("brand_key");
CREATE INDEX "idx_nest_brand_knowledge_chunks_fts" ON "public"."nest_brand_knowledge_chunks" USING "gin" ("fts_vector");
CREATE INDEX "idx_nest_brand_knowledge_chunks_item" ON "public"."nest_brand_knowledge_chunks" USING "btree" ("knowledge_item_id", "chunk_index");
CREATE INDEX "idx_nest_brand_knowledge_items_brand_active" ON "public"."nest_brand_knowledge_items" USING "btree" ("brand_key", "updated_at" DESC) WHERE ("deleted_at" IS NULL);
CREATE INDEX "idx_nest_brand_knowledge_items_brand_legacy" ON "public"."nest_brand_knowledge_items" USING "btree" ("brand_key", "legacy_field_key") WHERE (("legacy_field_key" IS NOT NULL) AND ("deleted_at" IS NULL));
CREATE INDEX "idx_nest_brand_lightspeed_backfill_lease" ON "public"."nest_brand_lightspeed_backfill_state" USING "btree" ("lease_expires_at");
CREATE INDEX "idx_nest_brand_lightspeed_backfill_status" ON "public"."nest_brand_lightspeed_backfill_state" USING "btree" ("status", "updated_at" DESC);
CREATE INDEX "idx_nest_brand_lightspeed_booking_state_last_msg" ON "public"."nest_brand_lightspeed_booking_state" USING "btree" ("last_message_at" DESC);
CREATE INDEX "idx_nest_brand_lightspeed_item_brand_qoh" ON "public"."nest_brand_lightspeed_item" USING "btree" ("brand_key", "qoh" DESC NULLS LAST);
CREATE INDEX "idx_nest_brand_lightspeed_item_brand_synced" ON "public"."nest_brand_lightspeed_item" USING "btree" ("brand_key", "synced_at" DESC);
CREATE INDEX "idx_nest_brand_lightspeed_item_search_fts" ON "public"."nest_brand_lightspeed_item" USING "gin" ("to_tsvector"('"simple"'::"regconfig", ((((((COALESCE("description", ''::"text") || ' '::"text") || COALESCE("custom_sku", ''::"text")) || ' '::"text") || COALESCE("upc", ''::"text")) || ' '::"text") || COALESCE("ean", ''::"text"))));
CREATE INDEX "idx_nest_brand_lightspeed_report_sale_line_brand_complete" ON "public"."nest_brand_lightspeed_report_sale_line" USING "btree" ("brand_key", "complete_time" DESC NULLS LAST);
CREATE INDEX "idx_nest_brand_lightspeed_report_sale_line_brand_line_time" ON "public"."nest_brand_lightspeed_report_sale_line" USING "btree" ("brand_key", "line_time" DESC NULLS LAST);
CREATE INDEX "idx_nest_brand_lightspeed_sale_brand_complete" ON "public"."nest_brand_lightspeed_sale" USING "btree" ("brand_key", "complete_time" DESC NULLS LAST);
CREATE INDEX "idx_nest_brand_lightspeed_sale_brand_complete_date_text" ON "public"."nest_brand_lightspeed_sale" USING "btree" ("brand_key", "left"("complete_time_melbourne", 10)) WHERE ("complete_time_melbourne" IS NOT NULL);
CREATE INDEX "idx_nest_brand_lightspeed_sale_brand_time" ON "public"."nest_brand_lightspeed_sale" USING "btree" ("brand_key", "time_stamp" DESC NULLS LAST);
CREATE INDEX "idx_nest_brand_lightspeed_sale_line_brand_item_sale" ON "public"."nest_brand_lightspeed_sale_line" USING "btree" ("brand_key", "item_id", "sale_id");
CREATE INDEX "idx_nest_brand_lightspeed_sale_line_sale" ON "public"."nest_brand_lightspeed_sale_line" USING "btree" ("brand_key", "sale_id");
CREATE INDEX "idx_nest_brand_lightspeed_sql_query_log_brand_created" ON "public"."nest_brand_lightspeed_sql_query_log" USING "btree" ("brand_key", "created_at" DESC);
CREATE INDEX "idx_nest_brand_lightspeed_sync_state_updated" ON "public"."nest_brand_lightspeed_sync_state" USING "btree" ("updated_at" DESC);
CREATE INDEX "idx_nest_brand_lightspeed_transaction_export_lease" ON "public"."nest_brand_lightspeed_transaction_export_state" USING "btree" ("lease_expires_at");
CREATE INDEX "idx_nest_brand_lightspeed_transaction_export_status" ON "public"."nest_brand_lightspeed_transaction_export_state" USING "btree" ("status", "updated_at" DESC);
CREATE INDEX "idx_nest_brand_lightspeed_transaction_line_brand_complete" ON "public"."nest_brand_lightspeed_transaction_line" USING "btree" ("brand_key", "complete_time" DESC NULLS LAST);
CREATE INDEX "idx_nest_brand_lightspeed_transaction_line_brand_item_desc" ON "public"."nest_brand_lightspeed_transaction_line" USING "btree" ("brand_key", "line_item_description");
CREATE INDEX "idx_nest_brand_lightspeed_transaction_line_brand_sale" ON "public"."nest_brand_lightspeed_transaction_line" USING "btree" ("brand_key", "sale_id");
CREATE INDEX "idx_nest_brand_lightspeed_workorder_brand_status_eta_text" ON "public"."nest_brand_lightspeed_workorder" USING "btree" ("brand_key", "workorder_status_id", "left"("eta_out_melbourne", 10)) WHERE ("eta_out_melbourne" IS NOT NULL);
CREATE INDEX "idx_nest_brand_lightspeed_workorder_brand_time" ON "public"."nest_brand_lightspeed_workorder" USING "btree" ("brand_key", "time_stamp" DESC NULLS LAST);
CREATE INDEX "idx_nest_brand_lightspeed_workorder_brand_time_in" ON "public"."nest_brand_lightspeed_workorder" USING "btree" ("brand_key", "time_in" DESC NULLS LAST);
CREATE INDEX "idx_nest_brand_lightspeed_workorder_customer_phone_e164" ON "public"."nest_brand_lightspeed_workorder" USING "btree" ("brand_key", "customer_phone_e164") WHERE ("customer_phone_e164" IS NOT NULL);
CREATE INDEX "idx_nest_brand_lightspeed_workorder_search_fts" ON "public"."nest_brand_lightspeed_workorder" USING "gin" ("to_tsvector"('"simple"'::"regconfig", ((COALESCE("customer_name", ''::"text") || ' '::"text") || COALESCE("notes", ''::"text"))));
CREATE INDEX "idx_nest_brand_oauth_states_expires" ON "public"."nest_brand_oauth_states" USING "btree" ("expires_at");
CREATE INDEX "idx_nest_brand_onboard_jobs_brand" ON "public"."nest_brand_onboard_jobs" USING "btree" ("brand_key");
CREATE INDEX "idx_nest_brand_onboard_jobs_status" ON "public"."nest_brand_onboard_jobs" USING "btree" ("status");
CREATE INDEX "idx_nest_brand_portal_sessions_expires" ON "public"."nest_brand_portal_sessions" USING "btree" ("expires_at");
CREATE INDEX "idx_user_uploads_user_id" ON "public"."user_uploads" USING "btree" ("user_id");
CREATE INDEX "job_failures_queue_message_id_idx" ON "public"."job_failures" USING "btree" ("queue_name", "queue_message_id", "created_at" DESC);
CREATE INDEX "linq_human_mode_threads_active_chat_idx" ON "public"."linq_human_mode_threads" USING "btree" ("chat_id") WHERE ("released_at" IS NULL);
CREATE INDEX "linq_human_mode_threads_active_recipient_idx" ON "public"."linq_human_mode_threads" USING "btree" ("recipient_handle", "bot_number") WHERE ("released_at" IS NULL);
CREATE INDEX "linq_human_mode_threads_brand_active_idx" ON "public"."linq_human_mode_threads" USING "btree" ("brand_key", "updated_at" DESC) WHERE ("released_at" IS NULL);
CREATE INDEX "linq_send_failures_chat_id_idx" ON "public"."linq_send_failures" USING "btree" ("chat_id", "created_at" DESC);
CREATE INDEX "nest_outbound_call_jobs_active_workorder_idx" ON "public"."nest_outbound_call_jobs" USING "btree" ("brand_key", "workorder_id") WHERE ("status" = ANY (ARRAY['queued'::"text", 'calling'::"text", 'connected'::"text"]));
CREATE INDEX "nest_outbound_call_jobs_brand_created_idx" ON "public"."nest_outbound_call_jobs" USING "btree" ("brand_key", "created_at" DESC);
CREATE INDEX "nest_outbound_call_jobs_elevenlabs_conversation_idx" ON "public"."nest_outbound_call_jobs" USING "btree" ("elevenlabs_conversation_id") WHERE ("elevenlabs_conversation_id" IS NOT NULL);
CREATE INDEX "nest_outbound_call_jobs_twilio_call_idx" ON "public"."nest_outbound_call_jobs" USING "btree" ("twilio_call_sid") WHERE ("twilio_call_sid" IS NOT NULL);
CREATE INDEX "nest_outbound_call_jobs_workorder_idx" ON "public"."nest_outbound_call_jobs" USING "btree" ("brand_key", "workorder_id", "created_at" DESC);
CREATE UNIQUE INDEX "notification_webhook_subs_unique_idx" ON "public"."notification_webhook_subscriptions" USING "btree" ("provider", "account_email", "resource_type");
CREATE INDEX "oauth_link_states_auth_user_id_idx" ON "public"."oauth_link_states" USING "btree" ("auth_user_id");
CREATE INDEX "oauth_link_states_expires_at_idx" ON "public"."oauth_link_states" USING "btree" ("expires_at");
CREATE INDEX "onboarding_events_handle_idx" ON "public"."onboarding_events" USING "btree" ("handle", "created_at" DESC);
CREATE INDEX "onboarding_events_type_idx" ON "public"."onboarding_events" USING "btree" ("event_type", "created_at" DESC);
CREATE INDEX "outbound_messages_chat_id_created_at_idx" ON "public"."outbound_messages" USING "btree" ("chat_id", "created_at" DESC);
CREATE UNIQUE INDEX "outbound_messages_provider_message_id_uidx" ON "public"."outbound_messages" USING "btree" ("provider_message_id");
CREATE INDEX "pending_inbound_images_expires_at_idx" ON "public"."pending_inbound_images" USING "btree" ("expires_at");
CREATE INDEX "reported_bugs_auth_user_id_idx" ON "public"."reported_bugs" USING "btree" ("auth_user_id");
CREATE INDEX "reported_bugs_chat_id_idx" ON "public"."reported_bugs" USING "btree" ("chat_id");
CREATE INDEX "reported_bugs_created_at_idx" ON "public"."reported_bugs" USING "btree" ("created_at" DESC);
CREATE INDEX "twilio_voice_welcome_rate_last_sent_at_idx" ON "public"."twilio_voice_welcome_rate" USING "btree" ("last_sent_at" DESC);
CREATE INDEX "user_automations_due_idx" ON "public"."user_automations" USING "btree" ("next_run_at") WHERE (("active" = true) AND ("next_run_at" IS NOT NULL));
CREATE INDEX "user_automations_type_active_idx" ON "public"."user_automations" USING "btree" ("automation_type", "active", "next_run_at");
CREATE UNIQUE INDEX "user_automations_unique_builtin" ON "public"."user_automations" USING "btree" ("user_id", "automation_type") WHERE ("automation_type" <> 'custom'::"text");
CREATE INDEX "user_automations_user_idx" ON "public"."user_automations" USING "btree" ("user_id");
CREATE INDEX "user_google_accounts_user_id_idx" ON "public"."user_google_accounts" USING "btree" ("user_id");
CREATE INDEX "user_granola_accounts_user_id_idx" ON "public"."user_granola_accounts" USING "btree" ("user_id");
CREATE INDEX "user_microsoft_accounts_user_id_idx" ON "public"."user_microsoft_accounts" USING "btree" ("user_id");
CREATE INDEX "user_profiles_auth_user_id_idx" ON "public"."user_profiles" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);
CREATE INDEX "user_profiles_onboard_state_idx" ON "public"."user_profiles" USING "btree" ("onboard_state") WHERE (("status" = 'active'::"text") OR ("status" = 'pending'::"text"));
CREATE UNIQUE INDEX "user_profiles_onboarding_token_idx" ON "public"."user_profiles" USING "btree" ("onboarding_token");
CREATE INDEX "user_profiles_proactive_eligible_idx" ON "public"."user_profiles" USING "btree" ("onboard_state", "last_proactive_sent_at") WHERE ("status" = 'active'::"text");
CREATE INDEX "user_profiles_route_idx" ON "public"."user_profiles" USING "btree" ("route");
CREATE INDEX "webhook_events_status_idx" ON "public"."webhook_events" USING "btree" ("status", "created_at" DESC);
CREATE INDEX "yellow_jersey_upload_phone_routes_status_expires_idx" ON "public"."yellow_jersey_upload_phone_routes" USING "btree" ("status", "expires_at");
CREATE INDEX "yellow_jersey_upload_sessions_chat_status_idx" ON "public"."yellow_jersey_upload_sessions" USING "btree" ("chat_id", "status", "created_at" DESC);
CREATE INDEX "yellow_jersey_upload_sessions_phone_status_idx" ON "public"."yellow_jersey_upload_sessions" USING "btree" ("phone_e164", "status", "created_at" DESC);
CREATE OR REPLACE TRIGGER "analytics_message_fact_after_insert" AFTER INSERT ON "public"."conversation_messages" FOR EACH ROW EXECUTE FUNCTION "public"."analytics_message_fact_after_insert"();
CREATE OR REPLACE TRIGGER "buzz_call_jobs_set_updated_at" BEFORE UPDATE ON "public"."buzz_call_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "buzz_sessions_set_updated_at" BEFORE UPDATE ON "public"."buzz_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "linq_human_mode_threads_set_updated_at" BEFORE UPDATE ON "public"."linq_human_mode_threads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "nest_brand_knowledge_items_set_updated_at" BEFORE UPDATE ON "public"."nest_brand_knowledge_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "nest_brand_lightspeed_item_melbourne_biub" BEFORE INSERT OR UPDATE ON "public"."nest_brand_lightspeed_item" FOR EACH ROW EXECUTE FUNCTION "public"."nest_brand_lightspeed_item_set_melbourne"();
CREATE OR REPLACE TRIGGER "nest_brand_lightspeed_sale_line_melbourne_biub" BEFORE INSERT OR UPDATE ON "public"."nest_brand_lightspeed_sale_line" FOR EACH ROW EXECUTE FUNCTION "public"."nest_brand_lightspeed_sale_line_set_melbourne"();
CREATE OR REPLACE TRIGGER "nest_brand_lightspeed_sale_melbourne_biub" BEFORE INSERT OR UPDATE ON "public"."nest_brand_lightspeed_sale" FOR EACH ROW EXECUTE FUNCTION "public"."nest_brand_lightspeed_sale_set_melbourne"();
CREATE OR REPLACE TRIGGER "nest_brand_lightspeed_workorder_melbourne_biub" BEFORE INSERT OR UPDATE ON "public"."nest_brand_lightspeed_workorder" FOR EACH ROW EXECUTE FUNCTION "public"."nest_brand_lightspeed_workorder_set_melbourne"();
CREATE OR REPLACE TRIGGER "nest_outbound_call_jobs_set_updated_at" BEFORE UPDATE ON "public"."nest_outbound_call_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "on_api_cost_log_insert" AFTER INSERT ON "public"."api_cost_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_upsert_api_daily_usage"();
CREATE OR REPLACE TRIGGER "pending_inbound_images_set_updated_at" BEFORE UPDATE ON "public"."pending_inbound_images" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
CREATE OR REPLACE TRIGGER "webhook_events_set_updated_at" BEFORE UPDATE ON "public"."webhook_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
ALTER TABLE ONLY "full_review"."affect_snapshots"
    ADD CONSTRAINT "affect_snapshots_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "full_review"."jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."affect_snapshots"
    ADD CONSTRAINT "affect_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."candidate_mentions"
    ADD CONSTRAINT "candidate_mentions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "full_review"."jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."candidate_mentions"
    ADD CONSTRAINT "candidate_mentions_raw_event_id_fkey" FOREIGN KEY ("raw_event_id") REFERENCES "full_review"."raw_events"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."candidate_mentions"
    ADD CONSTRAINT "candidate_mentions_resolved_entity_id_fkey" FOREIGN KEY ("resolved_entity_id") REFERENCES "full_review"."entities"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "full_review"."chunks"
    ADD CONSTRAINT "chunks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "full_review"."jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."claim_corrections"
    ADD CONSTRAINT "claim_corrections_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "full_review"."claims"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."claim_corrections"
    ADD CONSTRAINT "claim_corrections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "full_review"."jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_object_entity_id_fkey" FOREIGN KEY ("object_entity_id") REFERENCES "full_review"."entities"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_perspective_holder_fkey" FOREIGN KEY ("perspective_holder") REFERENCES "full_review"."entities"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "full_review"."sources"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_subject_entity_id_fkey" FOREIGN KEY ("subject_entity_id") REFERENCES "full_review"."entities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "full_review"."claims"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "full_review"."claims"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "full_review"."claims"
    ADD CONSTRAINT "claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."entities"
    ADD CONSTRAINT "entities_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "full_review"."jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."entities"
    ADD CONSTRAINT "entities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."entity_aliases"
    ADD CONSTRAINT "entity_aliases_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "full_review"."entities"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."jobs"
    ADD CONSTRAINT "jobs_current_chunk_fk" FOREIGN KEY ("current_chunk_id") REFERENCES "full_review"."chunks"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "full_review"."jobs"
    ADD CONSTRAINT "jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."open_loops"
    ADD CONSTRAINT "open_loops_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "full_review"."jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."open_loops"
    ADD CONSTRAINT "open_loops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."raw_events"
    ADD CONSTRAINT "raw_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "full_review"."jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."raw_events"
    ADD CONSTRAINT "raw_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."rendered_files"
    ADD CONSTRAINT "rendered_files_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "full_review"."jobs"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."rendered_files"
    ADD CONSTRAINT "rendered_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."sources"
    ADD CONSTRAINT "sources_raw_event_id_fkey" FOREIGN KEY ("raw_event_id") REFERENCES "full_review"."raw_events"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."sources"
    ADD CONSTRAINT "sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "full_review"."user_snapshots"
    ADD CONSTRAINT "user_snapshots_current_job_id_fkey" FOREIGN KEY ("current_job_id") REFERENCES "full_review"."jobs"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "full_review"."user_snapshots"
    ADD CONSTRAINT "user_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."analytics_message_facts"
    ADD CONSTRAINT "analytics_message_facts_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."api_cost_logs"
    ADD CONSTRAINT "api_cost_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."api_daily_usage_by_message_type"
    ADD CONSTRAINT "api_daily_usage_by_message_type_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."api_daily_usage_by_provider"
    ADD CONSTRAINT "api_daily_usage_by_provider_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."api_daily_usage"
    ADD CONSTRAINT "api_daily_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."buzz_call_jobs"
    ADD CONSTRAINT "buzz_call_jobs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."buzz_sessions"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."buzz_events"
    ADD CONSTRAINT "buzz_events_call_job_id_fkey" FOREIGN KEY ("call_job_id") REFERENCES "public"."buzz_call_jobs"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."buzz_events"
    ADD CONSTRAINT "buzz_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."buzz_sessions"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."customer_automation_rule_state"
    ADD CONSTRAINT "customer_automation_rule_state_last_automation_run_id_fkey" FOREIGN KEY ("last_automation_run_id") REFERENCES "public"."automation_runs"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."notification_webhook_events"
    ADD CONSTRAINT "email_webhook_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."notification_webhook_subscriptions"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."nest_brand_lightspeed_sale_line"
    ADD CONSTRAINT "fk_nest_brand_lightspeed_sale_line_sale" FOREIGN KEY ("brand_key", "sale_id") REFERENCES "public"."nest_brand_lightspeed_sale"("brand_key", "sale_id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."job_failures"
    ADD CONSTRAINT "job_failures_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."nest_brand_knowledge_chunks"
    ADD CONSTRAINT "nest_brand_knowledge_chunks_knowledge_item_id_fkey" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."nest_brand_knowledge_items"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."oauth_link_states"
    ADD CONSTRAINT "oauth_link_states_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."reported_bugs"
    ADD CONSTRAINT "reported_bugs_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."user_automations"
    ADD CONSTRAINT "user_automations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_google_accounts"
    ADD CONSTRAINT "user_google_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_granola_accounts"
    ADD CONSTRAINT "user_granola_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_microsoft_accounts"
    ADD CONSTRAINT "user_microsoft_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."user_uploads"
    ADD CONSTRAINT "user_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE "full_review"."affect_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."candidate_mentions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."claim_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."entity_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."open_loops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."raw_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."rendered_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "full_review"."user_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to Linq human mode threads" ON "public"."linq_human_mode_threads" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));
CREATE POLICY "Service role full access to customer automation state" ON "public"."customer_automation_rule_state" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));
ALTER TABLE "public"."admin_onboarding_prompts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_onboarding_prompts_deny_client_access" ON "public"."admin_onboarding_prompts" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."api_cost_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_cost_logs_deny_client_access" ON "public"."api_cost_logs" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."api_daily_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."api_daily_usage_by_message_type" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_daily_usage_by_message_type_deny_client_access" ON "public"."api_daily_usage_by_message_type" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."api_daily_usage_by_provider" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_daily_usage_by_provider_deny_client_access" ON "public"."api_daily_usage_by_provider" TO "authenticated", "anon" USING (false) WITH CHECK (false);
CREATE POLICY "api_daily_usage_deny_client_access" ON "public"."api_daily_usage" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."automation_preferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation_preferences_deny_client_access" ON "public"."automation_preferences" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."automation_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation_runs_deny_client_access" ON "public"."automation_runs" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."brand_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_sessions_deny_client_access" ON "public"."brand_sessions" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."buzz_call_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."buzz_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."buzz_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversation_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversation_messages_deny_client_access" ON "public"."conversation_messages" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."conversation_summaries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversation_summaries_deny_client_access" ON "public"."conversation_summaries" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."customer_automation_rule_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."edge_request_rate_limits" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edge_request_rate_limits_deny_client_access" ON "public"."edge_request_rate_limits" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."experiment_assignments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "experiment_assignments_deny_client_access" ON "public"."experiment_assignments" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."job_failures" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_failures_deny_client_access" ON "public"."job_failures" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."linq_human_mode_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."linq_send_failures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."message_buffer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_buffer_deny_client_access" ON "public"."message_buffer" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_chat_config" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_chat_config_deny_client_access" ON "public"."nest_brand_chat_config" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_deputy_pending_actions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_deputy_pending_actions_deny_client_access" ON "public"."nest_brand_deputy_pending_actions" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_images" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_images_deny_client_access" ON "public"."nest_brand_images" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_knowledge_chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_brand_knowledge_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_brand_lightspeed_backfill_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_brand_lightspeed_item" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_lightspeed_item_deny_client_access" ON "public"."nest_brand_lightspeed_item" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_lightspeed_lookup_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_brand_lightspeed_report_sale_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_brand_lightspeed_sale" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_lightspeed_sale_deny_client_access" ON "public"."nest_brand_lightspeed_sale" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_lightspeed_sale_line" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_lightspeed_sale_line_deny_client_access" ON "public"."nest_brand_lightspeed_sale_line" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_lightspeed_sql_query_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_brand_lightspeed_sync_state" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_lightspeed_sync_state_deny_client_access" ON "public"."nest_brand_lightspeed_sync_state" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_lightspeed_transaction_export_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_brand_lightspeed_transaction_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_brand_lightspeed_workorder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_lightspeed_workorder_deny_client_access" ON "public"."nest_brand_lightspeed_workorder" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_oauth_states" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_oauth_states_deny_client_access" ON "public"."nest_brand_oauth_states" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_onboard_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_onboard_jobs_deny_client_access" ON "public"."nest_brand_onboard_jobs" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_portal_connections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_portal_connections_deny_client_access" ON "public"."nest_brand_portal_connections" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_portal_secrets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_portal_secrets_deny_client_access" ON "public"."nest_brand_portal_secrets" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_brand_portal_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_brand_portal_sessions_deny_client_access" ON "public"."nest_brand_portal_sessions" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."nest_outbound_call_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nest_pg_net_edge_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nest_pg_net_edge_settings_deny_client_access" ON "public"."nest_pg_net_edge_settings" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."notification_webhook_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_webhook_events_deny_client_access" ON "public"."notification_webhook_events" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."notification_webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_webhook_subscriptions_deny_client_access" ON "public"."notification_webhook_subscriptions" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."oauth_link_states" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oauth_link_states_deny_client_access" ON "public"."oauth_link_states" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."onboarding_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_events_deny_client_access" ON "public"."onboarding_events" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."outbound_messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbound_messages_deny_client_access" ON "public"."outbound_messages" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."pending_inbound_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."polling_cursors" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polling_cursors_deny_client_access" ON "public"."polling_cursors" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."reported_bugs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reported_bugs_deny_client_access" ON "public"."reported_bugs" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."twilio_voice_welcome_rate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_automations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_automations_deny_client_access" ON "public"."user_automations" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."user_google_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_google_accounts_deny_client_access" ON "public"."user_google_accounts" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."user_granola_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_granola_accounts_deny_client_access" ON "public"."user_granola_accounts" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."user_microsoft_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_microsoft_accounts_deny_client_access" ON "public"."user_microsoft_accounts" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_profiles_deny_client_access" ON "public"."user_profiles" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."user_uploads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_uploads_delete_own" ON "public"."user_uploads" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));
CREATE POLICY "user_uploads_select_own" ON "public"."user_uploads" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));
ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events_deny_client_access" ON "public"."webhook_events" TO "authenticated", "anon" USING (false) WITH CHECK (false);
ALTER TABLE "public"."yellow_jersey_ash_phone_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."yellow_jersey_upload_phone_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."yellow_jersey_upload_sessions" ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA "full_review" TO "service_role";
GRANT USAGE ON SCHEMA "full_review" TO "anon";
GRANT USAGE ON SCHEMA "full_review" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
REVOKE ALL ON FUNCTION "full_review"."configure_dispatcher_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "full_review"."configure_dispatcher_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text") TO "service_role";
REVOKE ALL ON FUNCTION "full_review"."disable_dispatcher_cron"() FROM PUBLIC;
GRANT ALL ON FUNCTION "full_review"."disable_dispatcher_cron"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."NESTV3_claim_scheduled_run"("p_automation_id" "uuid", "p_run_key" "text", "p_scheduled_for" timestamp with time zone, "p_input_payload" "jsonb", "p_lock_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."NESTV3_claim_scheduled_run"("p_automation_id" "uuid", "p_run_key" "text", "p_scheduled_for" timestamp with time zone, "p_input_payload" "jsonb", "p_lock_seconds" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."NESTV3_touch_automation"("p_automation_id" "uuid", "p_next_run_at" timestamp with time zone, "p_last_error" "text", "p_success" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."NESTV3_touch_automation"("p_automation_id" "uuid", "p_next_run_at" timestamp with time zone, "p_last_error" "text", "p_success" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."_jsonb_repair_string_scalar"("m" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."activate_nest_user"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_nest_user"("p_token" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."add_user_fact_atomic"("p_handle" "text", "p_fact" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_user_fact_atomic"("p_handle" "text", "p_fact" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_apply_automation_change"("p_actor_email" "text", "p_actor_uuid" "uuid", "p_target_user" "uuid", "p_target_handle" "text", "p_type" "text", "p_active" boolean, "p_config" "jsonb", "p_next_run_at" timestamp with time zone, "p_action" "text", "p_source_env" "text", "p_expected_updated_at" timestamp with time zone, "p_paused_during_active_send" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_unenrol_automation"("p_actor_email" "text", "p_actor_uuid" "uuid", "p_target_user" "uuid", "p_target_handle" "text", "p_type" "text", "p_source_env" "text", "p_expected_updated_at" timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION "public"."advance_user_automation"("p_automation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_user_automation"("p_automation_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."analytics_message_daypart"("p_hour" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."analytics_message_fact_after_insert"() TO "service_role";
GRANT ALL ON FUNCTION "public"."append_conversation_message"("p_chat_id" "text", "p_role" "text", "p_content" "text", "p_handle" "text", "p_metadata" "jsonb", "p_is_group_chat" boolean, "p_chat_name" "text", "p_participant_names" "jsonb", "p_service" "text", "p_engagement_scope" "text", "p_engagement_brand_key" "text", "p_provider_message_id" "text", "p_reply_to_provider_message_id" "text", "p_provider_part_index" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."append_entity_timeline"("p_entity_id" bigint, "p_handle" "text", "p_event_text" "text", "p_event_at" timestamp with time zone, "p_source_kind" "text", "p_source_message_ids" "jsonb", "p_source_summary_id" bigint, "p_metadata" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."archive_queue_message"("p_queue_name" "text", "p_message_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_queue_message"("p_queue_name" "text", "p_message_id" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."assign_experiment"("p_handle" "text", "p_experiment_name" "text", "p_variants" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_experiment"("p_handle" "text", "p_experiment_name" "text", "p_variants" "text"[]) TO "service_role";
REVOKE ALL ON FUNCTION "public"."automation_count_in_window"("p_handle" "text", "p_automation_type" "text", "p_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."automation_count_in_window"("p_handle" "text", "p_automation_type" "text", "p_hours" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."automations_sent_today"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."automations_sent_today"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."build_or_tsquery"("query_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."build_or_tsquery"("query_text" "text") TO "service_role";
GRANT ALL ON TABLE "public"."message_buffer" TO "service_role";
REVOKE ALL ON FUNCTION "public"."claim_buffered_messages"("p_chat_id" "text", "p_my_buffer_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_buffered_messages"("p_chat_id" "text", "p_my_buffer_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_customer_automation_send"("p_handle" "text", "p_rule_key" "text", "p_metric_value" bigint, "p_reason" "text", "p_profile_snapshot" "jsonb", "p_metadata" "jsonb", "p_triggered_by" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."claim_pending_webhook_events"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_pending_webhook_events"("p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_pending_webhook_events_for_handle"("p_handle" "text", "p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_user_automation"("p_automation_id" "uuid", "p_expected_next_run_at" timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION "public"."cleanup_message_buffer"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_message_buffer"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."clear_conversation_history"("p_chat_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_conversation_history"("p_chat_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."complete_customer_automation_send"("p_handle" "text", "p_rule_key" "text", "p_success" boolean, "p_reason" "text", "p_metadata" "jsonb", "p_automation_run_id" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."complete_webhook_event"("p_id" bigint, "p_status" "text", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_webhook_event"("p_id" bigint, "p_status" "text", "p_error" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."composio_advance_automation"("p_automation_id" "uuid", "p_success" boolean, "p_error" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."composio_claim_due_automations"("p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."composio_record_webhook_event"("p_composio_trigger_id" "text", "p_composio_event_id" "text", "p_payload_hash" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."composio_release_lock"("p_automation_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."composio_set_trust_auto_approve"("p_automation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_automation_engine_cron"("p_project_url" "text", "p_bearer_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_automation_engine_cron"("p_project_url" "text", "p_bearer_token" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_email_webhook_cron"("p_project_url" "text", "p_bearer_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_email_webhook_cron"("p_project_url" "text", "p_bearer_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."configure_entity_cron_jobs"("p_project_url" "text", "p_bearer_token" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_inbound_queue_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_inbound_queue_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_keep_warm_cron"("p_project_url" "text", "p_service_role_key" "text", "p_schedule" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_keep_warm_cron"("p_project_url" "text", "p_service_role_key" "text", "p_schedule" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_memory_cron_jobs"("p_project_url" "text", "p_bearer_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_memory_cron_jobs"("p_project_url" "text", "p_bearer_token" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_moment_engine_cron"("p_project_url" "text", "p_bearer_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_moment_engine_cron"("p_project_url" "text", "p_bearer_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."configure_pipedream_automation_cron"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_proactive_cron"("p_project_url" "text", "p_bearer_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_proactive_cron"("p_project_url" "text", "p_bearer_token" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_reminders_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_reminders_cron"("p_project_url" "text", "p_bearer_token" "text", "p_schedule" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."confirm_memory_item"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_memory_item"("p_id" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."consume_edge_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_edge_rate_limit"("p_bucket_key" "text", "p_window_seconds" integer, "p_limit" integer) TO "service_role";
GRANT ALL ON TABLE "full_review"."jobs" TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_full_review_job"("p_user_id" "uuid", "p_handle" "text", "p_config" "jsonb", "p_budget_cap_usd" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_full_review_job"("p_user_id" "uuid", "p_handle" "text", "p_config" "jsonb", "p_budget_cap_usd" numeric) TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_email_watch_trigger"("p_id" bigint, "p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_email_watch_trigger"("p_id" bigint, "p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_notification_watch_trigger"("p_id" bigint, "p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_notification_watch_trigger"("p_id" bigint, "p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_queue_message"("p_queue_name" "text", "p_message_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_queue_message"("p_queue_name" "text", "p_message_id" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."delete_reminder"("p_id" bigint, "p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_reminder"("p_id" bigint, "p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."edit_reminder"("p_id" bigint, "p_handle" "text", "p_action_description" "text", "p_cron_expression" "text", "p_next_fire_at" timestamp with time zone, "p_repeating" boolean, "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_reminder"("p_id" bigint, "p_handle" "text", "p_action_description" "text", "p_cron_expression" "text", "p_next_fire_at" timestamp with time zone, "p_repeating" boolean, "p_active" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."emit_onboarding_event"("p_handle" "text", "p_chat_id" "text", "p_event_type" "text", "p_message_turn_index" integer, "p_entry_state" "text", "p_value_wedge" "text", "p_current_state" "text", "p_experiment_variant_ids" "jsonb", "p_confidence_scores" "jsonb", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."emit_onboarding_event"("p_handle" "text", "p_chat_id" "text", "p_event_type" "text", "p_message_turn_index" integer, "p_entry_state" "text", "p_value_wedge" "text", "p_current_state" "text", "p_experiment_variant_ids" "jsonb", "p_confidence_scores" "jsonb", "p_payload" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."enqueue_webhook_event"("p_provider" "text", "p_provider_message_id" "text", "p_chat_id" "text", "p_sender_handle" "text", "p_bot_number" "text", "p_raw_payload" "jsonb", "p_normalized_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_webhook_event"("p_provider" "text", "p_provider_message_id" "text", "p_chat_id" "text", "p_sender_handle" "text", "p_bot_number" "text", "p_raw_payload" "jsonb", "p_normalized_payload" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."ensure_nest_user"("p_handle" "text", "p_bot_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_nest_user"("p_handle" "text", "p_bot_number" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."expire_stale_memory_items"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_memory_items"() TO "service_role";
GRANT ALL ON FUNCTION "public"."expire_temporal_memory_items"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."fin_describe_fiskil_transactions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fin_describe_fiskil_transactions"() TO "service_role";
GRANT ALL ON FUNCTION "public"."fin_describe_fiskil_transactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."fin_describe_fiskil_transactions"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."fin_describe_live_fiskil"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fin_describe_live_fiskil"() TO "service_role";
GRANT ALL ON FUNCTION "public"."fin_describe_live_fiskil"() TO "anon";
GRANT ALL ON FUNCTION "public"."fin_describe_live_fiskil"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."fin_run_select"("p_sql" "text", "p_max_rows" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fin_run_select"("p_sql" "text", "p_max_rows" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."fin_run_select"("p_sql" "text", "p_max_rows" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fin_run_select"("p_sql" "text", "p_max_rows" integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."fin_run_select_live"("p_sql" "text", "p_user_id" "uuid", "p_max_rows" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fin_run_select_live"("p_sql" "text", "p_user_id" "uuid", "p_max_rows" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."fin_run_select_live"("p_sql" "text", "p_user_id" "uuid", "p_max_rows" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fin_run_select_live"("p_sql" "text", "p_user_id" "uuid", "p_max_rows" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_entities_by_names"("p_handle" "text", "p_names" "text"[]) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_active_memory_items"("p_handle" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_memory_items"("p_handle" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_active_triggers_for_handle"("p_handle" "text", "p_source_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_active_triggers_for_handle"("p_handle" "text", "p_source_type" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_all_entities_with_timeline"("p_limit" integer, "p_after_id" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_all_users_with_automation_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_all_users_with_automation_status"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_automation_eligible_users"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_automation_eligible_users"("p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_automation_preferences"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_automation_preferences"("p_handle" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_conversation_summaries"("p_chat_id" "text", "p_limit" integer, "p_engagement_scope" "text", "p_engagement_brand_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_conversation_window"("p_chat_id" "text", "p_limit" integer, "p_engagement_scope" "text", "p_engagement_brand_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_core_entities"("p_handle" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_due_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_due_reminders"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_due_user_automations"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_due_user_automations"("p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_entities_by_ids"("p_handle" "text", "p_ids" bigint[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_entities_needing_consolidation"("p_limit" integer, "p_max_idle_minutes" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_entity_timeline"("p_entity_id" bigint, "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_expiring_subscriptions"("p_within_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_expiring_subscriptions"("p_within_hours" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_global_moment_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_global_moment_stats"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_idle_conversations_needing_summary"("p_idle_minutes" integer, "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_moment_config"("p_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_moment_config"("p_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_moment_executions"("p_moment_id" "uuid", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_moment_executions"("p_moment_id" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_moment_stats"("p_moment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_moment_stats"("p_moment_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_proactive_eligible_users"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_proactive_eligible_users"("p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_recent_tool_traces"("p_chat_id" "text", "p_limit" integer, "p_engagement_scope" "text", "p_engagement_brand_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_unsummarised_messages"("p_chat_id" "text", "p_since" timestamp with time zone, "p_engagement_scope" "text", "p_engagement_brand_key" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_automation_counts_by_type"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_user_automation_history"("p_handle" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_automation_history"("p_handle" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_user_email_watch_triggers"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_email_watch_triggers"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_user_moment_history"("p_handle" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_moment_history"("p_handle" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_user_notification_watch_triggers"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_notification_watch_triggers"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_user_reminders"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_reminders"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."hey_comp_claim_scheduled_run"("p_job_id" "uuid", "p_run_key" "text", "p_event_key" "text", "p_scheduled_for" timestamp with time zone, "p_input_payload" "jsonb", "p_lock_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hey_comp_claim_scheduled_run"("p_job_id" "uuid", "p_run_key" "text", "p_event_key" "text", "p_scheduled_for" timestamp with time zone, "p_input_payload" "jsonb", "p_lock_seconds" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."hey_comp_touch_scheduled_job"("p_job_id" "uuid", "p_next_check_at" timestamp with time zone, "p_last_error" "text", "p_success" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hey_comp_touch_scheduled_job"("p_job_id" "uuid", "p_next_check_at" timestamp with time zone, "p_last_error" "text", "p_success" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."hybrid_search_documents"("p_handle" "text", "query_text" "text", "query_embedding" "extensions"."halfvec", "match_count" integer, "source_filters" "text"[], "min_semantic_score" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hybrid_search_documents"("p_handle" "text", "query_text" "text", "query_embedding" "extensions"."halfvec", "match_count" integer, "source_filters" "text"[], "min_semantic_score" double precision) TO "service_role";
REVOKE ALL ON FUNCTION "public"."increment_group_messages_since_link"("p_chat_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_group_messages_since_link"("p_chat_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."insert_email_watch_trigger"("p_handle" "text", "p_name" "text", "p_description" "text", "p_trigger_type" "text", "p_account_email" "text", "p_provider" "text", "p_match_sender" "text", "p_match_subject_pattern" "text", "p_match_labels" "text"[], "p_use_ai_matching" boolean, "p_ai_prompt" "text", "p_delivery_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_email_watch_trigger"("p_handle" "text", "p_name" "text", "p_description" "text", "p_trigger_type" "text", "p_account_email" "text", "p_provider" "text", "p_match_sender" "text", "p_match_subject_pattern" "text", "p_match_labels" "text"[], "p_use_ai_matching" boolean, "p_ai_prompt" "text", "p_delivery_method" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."insert_memory_item"("p_handle" "text", "p_chat_id" "text", "p_memory_type" "text", "p_category" "text", "p_value_text" "text", "p_normalized_value" "text", "p_confidence" numeric, "p_status" "text", "p_scope" "text", "p_source_kind" "text", "p_source_message_ids" "jsonb", "p_source_summary_id" bigint, "p_extractor_version" "text", "p_expiry_at" timestamp with time zone, "p_supersedes_memory_id" bigint, "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_memory_item"("p_handle" "text", "p_chat_id" "text", "p_memory_type" "text", "p_category" "text", "p_value_text" "text", "p_normalized_value" "text", "p_confidence" numeric, "p_status" "text", "p_scope" "text", "p_source_kind" "text", "p_source_message_ids" "jsonb", "p_source_summary_id" bigint, "p_extractor_version" "text", "p_expiry_at" timestamp with time zone, "p_supersedes_memory_id" bigint, "p_metadata" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."insert_notification_watch_trigger"("p_handle" "text", "p_name" "text", "p_description" "text", "p_trigger_type" "text", "p_source_type" "text", "p_account_email" "text", "p_provider" "text", "p_match_sender" "text", "p_match_subject_pattern" "text", "p_match_labels" "text"[], "p_use_ai_matching" boolean, "p_ai_prompt" "text", "p_delivery_method" "text", "p_time_constraint" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_notification_watch_trigger"("p_handle" "text", "p_name" "text", "p_description" "text", "p_trigger_type" "text", "p_source_type" "text", "p_account_email" "text", "p_provider" "text", "p_match_sender" "text", "p_match_subject_pattern" "text", "p_match_labels" "text"[], "p_use_ai_matching" boolean, "p_ai_prompt" "text", "p_delivery_method" "text", "p_time_constraint" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."insert_reminder"("p_handle" "text", "p_chat_id" "text", "p_action_description" "text", "p_cron_expression" "text", "p_repeating" boolean, "p_next_fire_at" timestamp with time zone, "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."insert_reminder"("p_handle" "text", "p_chat_id" "text", "p_action_description" "text", "p_cron_expression" "text", "p_repeating" boolean, "p_next_fire_at" timestamp with time zone, "p_timezone" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."insert_tool_trace"("p_chat_id" "text", "p_message_id" bigint, "p_engagement_scope" "text", "p_engagement_brand_key" "text", "p_tool_name" "text", "p_outcome" "text", "p_safe_summary" "text", "p_metadata" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_latest_buffered_message"("p_chat_id" "text", "p_my_buffer_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_latest_buffered_message"("p_chat_id" "text", "p_my_buffer_id" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_moment_suppressed"("p_handle" "text", "p_moment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_moment_suppressed"("p_handle" "text", "p_moment_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."last_automation_of_type"("p_handle" "text", "p_automation_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."last_automation_of_type"("p_handle" "text", "p_automation_type" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_automation_replied"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_automation_replied"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_memory_item_status"("p_id" bigint, "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_memory_item_status"("p_id" bigint, "p_status" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_moment_replied"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_moment_replied"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_proactive_replied"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_proactive_replied"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_reminder_fired"("p_id" bigint, "p_next_fire_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_reminder_fired"("p_id" bigint, "p_next_fire_at" timestamp with time zone) TO "service_role";
REVOKE ALL ON FUNCTION "public"."mark_trigger_fired"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_trigger_fired"("p_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."match_brand_knowledge_chunks"("p_brand_key" "text", "p_query_embedding" "extensions"."vector", "p_match_count" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."match_search_documents"("p_handle" "text", "query_embedding" "extensions"."halfvec", "match_count" integer, "source_filters" "text"[], "min_score" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_search_documents"("p_handle" "text", "query_embedding" "extensions"."halfvec", "match_count" integer, "source_filters" "text"[], "min_score" double precision) TO "service_role";
REVOKE ALL ON FUNCTION "public"."match_user_document_chunks"("p_user_id" "uuid", "query_embedding" "extensions"."halfvec", "match_count" integer, "min_score" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_user_document_chunks"("p_user_id" "uuid", "query_embedding" "extensions"."halfvec", "match_count" integer, "min_score" double precision) TO "service_role";
REVOKE ALL ON FUNCTION "public"."moment_execution_exists"("p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moment_execution_exists"("p_idempotency_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."moment_last_sent"("p_moment_id" "uuid", "p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moment_last_sent"("p_moment_id" "uuid", "p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."moment_last_sent_any"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moment_last_sent_any"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."moment_sends_today"("p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moment_sends_today"("p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."moment_total_sends"("p_moment_id" "uuid", "p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moment_total_sends"("p_moment_id" "uuid", "p_handle" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_inventory_search"("p_brand_key" "text", "p_query" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_inventory_search"("p_brand_key" "text", "p_query" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_item_sales_by_weekday"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_item_sales_by_weekday"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_query" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_item_sales_summary"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_item_sales_summary"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_query" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_item_set_melbourne"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_item_set_melbourne"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_sale_line_set_melbourne"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_sale_line_set_melbourne"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_sale_set_melbourne"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_sale_set_melbourne"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_sales_by_weekday"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_sales_by_weekday"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date") TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_sales_summary"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_sales_summary"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date") TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_sales_top_items"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_sales_top_items"("p_brand_key" "text", "p_from_date" "date", "p_to_date" "date", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_sql_query"("p_brand_key" "text", "p_sql" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_sql_query"("p_brand_key" "text", "p_sql" "text", "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_workorder_lookup"("p_brand_key" "text", "p_customer_phone_e164" "text", "p_customer_name" "text", "p_from_date" "date", "p_to_date" "date", "p_status_ids" bigint[], "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_workorder_lookup"("p_brand_key" "text", "p_customer_phone_e164" "text", "p_customer_name" "text", "p_from_date" "date", "p_to_date" "date", "p_status_ids" bigint[], "p_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_lightspeed_workorder_set_melbourne"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_lightspeed_workorder_set_melbourne"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_brand_portal_conversation_list"("p_brand_key" "text", "p_now" timestamp with time zone, "p_chat_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_brand_portal_conversation_list"("p_brand_key" "text", "p_now" timestamp with time zone, "p_chat_limit" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_debug_lightspeed_cron_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_debug_lightspeed_cron_jobs"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."nest_pg_net_lightspeed_sales_ping"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nest_pg_net_lightspeed_sales_ping"() TO "service_role";
GRANT ALL ON FUNCTION "public"."pipedream_advance_automation"("p_automation_id" "uuid", "p_success" boolean, "p_error" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."pipedream_claim_due_automations"("p_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."pipedream_record_webhook_event"("p_pd_deployed_trigger_id" "text", "p_pd_event_id" "text", "p_payload_hash" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."pipedream_release_lock"("p_automation_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."pipedream_send_gate"("p_user_id" "uuid", "p_kind" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."pipedream_set_trust_auto_approve"("p_automation_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."quid_active_connection_fingerprint"("p_quid_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quid_active_connection_fingerprint"("p_quid_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."quid_set_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."read_queue_messages"("p_queue_name" "text", "p_sleep_seconds" integer, "p_n" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."read_queue_messages"("p_queue_name" "text", "p_sleep_seconds" integer, "p_n" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_automation_run"("p_handle" "text", "p_chat_id" "text", "p_automation_type" "text", "p_content" "text", "p_metadata" "jsonb", "p_manual_trigger" boolean, "p_triggered_by" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_automation_run"("p_handle" "text", "p_chat_id" "text", "p_automation_type" "text", "p_content" "text", "p_metadata" "jsonb", "p_manual_trigger" boolean, "p_triggered_by" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."record_customer_automation_evaluation"("p_handle" "text", "p_rule_key" "text", "p_outcome" "text", "p_reason" "text", "p_metric_value" bigint, "p_profile_snapshot" "jsonb", "p_metadata" "jsonb", "p_triggered_by" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_moment_execution"("p_moment_id" "uuid", "p_moment_version" integer, "p_handle" "text", "p_chat_id" "text", "p_status" "public"."moment_exec_status", "p_skip_reason" "text", "p_rendered_content" "text", "p_prompt_used" "text", "p_metadata" "jsonb", "p_error_message" "text", "p_execution_ms" integer, "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_moment_execution"("p_moment_id" "uuid", "p_moment_version" integer, "p_handle" "text", "p_chat_id" "text", "p_status" "public"."moment_exec_status", "p_skip_reason" "text", "p_rendered_content" "text", "p_prompt_used" "text", "p_metadata" "jsonb", "p_error_message" "text", "p_execution_ms" integer, "p_idempotency_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_proactive_message"("p_handle" "text", "p_chat_id" "text", "p_message_type" "text", "p_content" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_proactive_message"("p_handle" "text", "p_chat_id" "text", "p_message_type" "text", "p_content" "text", "p_metadata" "jsonb") TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_webhook_event"("p_provider" "text", "p_account_email" "text", "p_subscription_id" "uuid", "p_history_id" "text", "p_resource_data" "jsonb", "p_change_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_webhook_event"("p_provider" "text", "p_account_email" "text", "p_subscription_id" "uuid", "p_history_id" "text", "p_resource_data" "jsonb", "p_change_type" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."record_webhook_event"("p_provider" "text", "p_account_email" "text", "p_subscription_id" "uuid", "p_history_id" "text", "p_resource_data" "jsonb", "p_change_type" "text", "p_source_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_webhook_event"("p_provider" "text", "p_account_email" "text", "p_subscription_id" "uuid", "p_history_id" "text", "p_resource_data" "jsonb", "p_change_type" "text", "p_source_type" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."save_conversation_summary"("p_chat_id" "text", "p_sender_handle" "text", "p_engagement_scope" "text", "p_engagement_brand_key" "text", "p_summary" "text", "p_topics" "text"[], "p_open_loops" "text"[], "p_summary_kind" "text", "p_first_message_at" timestamp with time zone, "p_last_message_at" timestamp with time zone, "p_message_count" integer, "p_confidence" numeric, "p_source_message_ids" "jsonb", "p_extractor_version" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."save_moment_version"("p_moment_id" "uuid", "p_changed_by" "text", "p_change_summary" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_moment_version"("p_moment_id" "uuid", "p_changed_by" "text", "p_change_summary" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_entity_core"("p_entity_id" bigint, "p_is_core" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_user_name_atomic"("p_handle" "text", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_name_atomic"("p_handle" "text", "p_name" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."supersede_memory_item"("p_old_id" bigint, "p_new_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supersede_memory_item"("p_old_id" bigint, "p_new_id" bigint) TO "service_role";
GRANT ALL ON FUNCTION "public"."sync_analytics_message_fact"("p_message_id" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."touch_bill_reminder_automation_after_send"("p_trigger_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_bill_reminder_automation_after_send"("p_trigger_id" bigint) TO "service_role";
REVOKE ALL ON FUNCTION "public"."trigger_upsert_api_daily_usage"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_upsert_api_daily_usage"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."try_claim_email_watch_delivery"("p_trigger_id" bigint, "p_provider" "text", "p_provider_message_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."try_claim_email_watch_delivery"("p_trigger_id" bigint, "p_provider" "text", "p_provider_message_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_entity_compiled_truth"("p_entity_id" bigint, "p_compiled_truth" "text", "p_importance_score" numeric) TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_onboard_state_machine"("p_handle" "text", "p_new_state" "text", "p_entry_state" "text", "p_first_value_wedge" "text", "p_first_value_delivered" boolean, "p_follow_through_delivered" boolean, "p_second_engagement" boolean, "p_checkin_opt_in" boolean, "p_memory_moment_delivered" boolean, "p_activated" boolean, "p_at_risk" boolean, "p_capability_category" "text", "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_onboard_state_machine"("p_handle" "text", "p_new_state" "text", "p_entry_state" "text", "p_first_value_wedge" "text", "p_first_value_delivered" boolean, "p_follow_through_delivered" boolean, "p_second_engagement" boolean, "p_checkin_opt_in" boolean, "p_memory_moment_delivered" boolean, "p_activated" boolean, "p_at_risk" boolean, "p_capability_category" "text", "p_timezone" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_api_daily_usage"("p_user_id" "uuid", "p_cost_usd" numeric, "p_cost_usd_no_cache" numeric, "p_tokens_in" integer, "p_tokens_out" integer, "p_tokens_cached" integer, "p_tokens_reasoning" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_api_daily_usage"("p_user_id" "uuid", "p_cost_usd" numeric, "p_cost_usd_no_cache" numeric, "p_tokens_in" integer, "p_tokens_out" integer, "p_tokens_cached" integer, "p_tokens_reasoning" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_api_daily_usage_by_message_type"("p_user_id" "uuid", "p_message_type" "text", "p_cost_usd" numeric, "p_tokens_in" integer, "p_tokens_out" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_api_daily_usage_by_message_type"("p_user_id" "uuid", "p_message_type" "text", "p_cost_usd" numeric, "p_tokens_in" integer, "p_tokens_out" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."upsert_api_daily_usage_by_provider"("p_user_id" "uuid", "p_provider" "text", "p_cost_usd" numeric, "p_cost_usd_no_cache" numeric, "p_tokens_in" integer, "p_tokens_out" integer, "p_tokens_cached" integer, "p_tokens_reasoning" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_api_daily_usage_by_provider"("p_user_id" "uuid", "p_provider" "text", "p_cost_usd" numeric, "p_cost_usd_no_cache" numeric, "p_tokens_in" integer, "p_tokens_out" integer, "p_tokens_cached" integer, "p_tokens_reasoning" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."upsert_entity"("p_handle" "text", "p_entity_type" "text", "p_canonical_name" "text", "p_aliases" "text"[], "p_metadata" "jsonb") TO "service_role";
GRANT ALL ON TABLE "full_review"."affect_snapshots" TO "service_role";
GRANT ALL ON TABLE "full_review"."candidate_mentions" TO "service_role";
GRANT ALL ON TABLE "full_review"."chunks" TO "service_role";
GRANT ALL ON TABLE "full_review"."claim_corrections" TO "service_role";
GRANT ALL ON TABLE "full_review"."claims" TO "service_role";
GRANT ALL ON TABLE "full_review"."entities" TO "service_role";
GRANT ALL ON TABLE "full_review"."entity_aliases" TO "service_role";
GRANT ALL ON TABLE "full_review"."open_loops" TO "service_role";
GRANT ALL ON TABLE "full_review"."raw_events" TO "service_role";
GRANT ALL ON TABLE "full_review"."rendered_files" TO "service_role";
GRANT ALL ON TABLE "full_review"."sources" TO "service_role";
GRANT ALL ON TABLE "full_review"."user_snapshots" TO "service_role";
GRANT ALL ON TABLE "public"."api_cost_logs" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_by_agent" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_by_agent" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_by_agent" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_by_chat" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_by_chat" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_by_chat" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_by_endpoint" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_by_endpoint" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_by_endpoint" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_by_message_type" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_by_message_type" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_by_message_type" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_by_model" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_by_model" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_by_model" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_by_provider" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_by_provider" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_by_provider" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_by_sender" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_by_sender" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_by_sender" TO "service_role";
GRANT ALL ON TABLE "public"."api_daily_usage" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_running_total" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_running_total" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_running_total" TO "service_role";
GRANT ALL ON TABLE "private"."api_usage_summary" TO "anon";
GRANT ALL ON TABLE "private"."api_usage_summary" TO "authenticated";
GRANT ALL ON TABLE "private"."api_usage_summary" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_item" TO "service_role";
GRANT SELECT ON TABLE "private"."nest_brand_lightspeed_inventory_v" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_sale" TO "service_role";
GRANT SELECT ON TABLE "private"."nest_brand_lightspeed_sale_analytics_v" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_sale_line" TO "service_role";
GRANT SELECT ON TABLE "private"."nest_brand_lightspeed_sale_line_analytics_v" TO "service_role";
GRANT ALL ON TABLE "private"."nest_brand_lightspeed_sale_v" TO "anon";
GRANT ALL ON TABLE "private"."nest_brand_lightspeed_sale_v" TO "authenticated";
GRANT ALL ON TABLE "private"."nest_brand_lightspeed_sale_v" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_workorder" TO "service_role";
GRANT SELECT ON TABLE "private"."nest_brand_lightspeed_workorder_analytics_v" TO "service_role";
GRANT ALL ON TABLE "public"."admin_onboarding_prompts" TO "service_role";
GRANT ALL ON TABLE "public"."analytics_message_facts" TO "service_role";
GRANT ALL ON SEQUENCE "public"."analytics_message_facts_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."api_daily_usage_by_message_type" TO "service_role";
GRANT ALL ON TABLE "public"."api_daily_usage_by_provider" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_report_sale_line" TO "service_role";
GRANT ALL ON TABLE "public"."ashycycles" TO "service_role";
GRANT ALL ON TABLE "public"."automation_preferences" TO "service_role";
GRANT ALL ON TABLE "public"."automation_runs" TO "service_role";
GRANT ALL ON SEQUENCE "public"."automation_runs_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."brand_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."buzz_call_jobs" TO "service_role";
GRANT ALL ON TABLE "public"."buzz_events" TO "service_role";
GRANT ALL ON SEQUENCE "public"."buzz_events_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."buzz_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."conversation_messages" TO "service_role";
GRANT ALL ON SEQUENCE "public"."conversation_messages_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."conversation_summaries" TO "service_role";
GRANT ALL ON SEQUENCE "public"."conversation_summaries_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."customer_automation_rule_state" TO "service_role";
GRANT ALL ON SEQUENCE "public"."customer_automation_rule_state_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."edge_request_rate_limits" TO "service_role";
GRANT ALL ON TABLE "public"."notification_webhook_events" TO "service_role";
GRANT ALL ON SEQUENCE "public"."email_webhook_events_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."experiment_assignments" TO "service_role";
GRANT ALL ON SEQUENCE "public"."experiment_assignments_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."job_failures" TO "service_role";
GRANT ALL ON SEQUENCE "public"."job_failures_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."linq_human_mode_threads" TO "service_role";
GRANT ALL ON TABLE "public"."linq_send_failures" TO "service_role";
GRANT ALL ON SEQUENCE "public"."linq_send_failures_id_seq" TO "service_role";
GRANT ALL ON SEQUENCE "public"."message_buffer_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_chat_config" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_deputy_pending_actions" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_images" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_knowledge_chunks" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_knowledge_items" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_backfill_state" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_booking_state" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_lookup_cache" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_sql_query_log" TO "service_role";
GRANT ALL ON SEQUENCE "public"."nest_brand_lightspeed_sql_query_log_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_sync_state" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_transaction_export_state" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_lightspeed_transaction_line" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_oauth_states" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_onboard_jobs" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_portal_connections" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_portal_secrets" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_portal_sessions" TO "service_role";
GRANT ALL ON TABLE "public"."nest_brand_reporting_automation_runs" TO "service_role";
GRANT ALL ON SEQUENCE "public"."nest_brand_reporting_automation_runs_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."nest_outbound_call_jobs" TO "service_role";
GRANT ALL ON TABLE "public"."nest_pg_net_edge_settings" TO "service_role";
GRANT ALL ON TABLE "public"."notification_webhook_subscriptions" TO "service_role";
GRANT ALL ON TABLE "public"."oauth_link_states" TO "service_role";
GRANT ALL ON TABLE "public"."onboarding_events" TO "service_role";
GRANT ALL ON SEQUENCE "public"."onboarding_events_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."outbound_messages" TO "service_role";
GRANT ALL ON SEQUENCE "public"."outbound_messages_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."pending_inbound_images" TO "service_role";
GRANT ALL ON TABLE "public"."polling_cursors" TO "service_role";
GRANT ALL ON TABLE "public"."reported_bugs" TO "service_role";
GRANT ALL ON SEQUENCE "public"."reported_bugs_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."twilio_voice_welcome_rate" TO "service_role";
GRANT ALL ON TABLE "public"."user_automations" TO "service_role";
GRANT ALL ON TABLE "public"."user_google_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."user_granola_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."user_microsoft_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";
GRANT ALL ON TABLE "public"."user_uploads" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."user_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";
GRANT ALL ON SEQUENCE "public"."webhook_events_id_seq" TO "service_role";
GRANT ALL ON TABLE "public"."yellow_jersey_ash_phone_routes" TO "service_role";
GRANT ALL ON TABLE "public"."yellow_jersey_upload_phone_routes" TO "service_role";
GRANT ALL ON TABLE "public"."yellow_jersey_upload_sessions" TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "full_review" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "full_review" GRANT ALL ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "private" GRANT SELECT ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
