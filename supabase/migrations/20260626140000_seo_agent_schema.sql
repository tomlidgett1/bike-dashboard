-- ============================================================================
-- Yellow Jersey Search Dominance Agent — core schema
-- ============================================================================
-- The "brain + job system" for the hourly SEO operating loop:
--   Google data -> identify demand -> match to real supply -> build/refresh
--   page -> validate quality -> publish -> sitemap -> inspect -> measure.
--
-- Six tables (runs, tasks, keywords, pages, GSC daily, URL inspections) plus a
-- SKIP-LOCKED task-claim RPC so many worker invocations can drain the queue
-- without double-processing. All tables are service-role only (RLS on, no anon
-- policy) — the agent and the admin cockpit run server-side with the service key.
-- ============================================================================

-- updated_at touch trigger (shared) ---------------------------------------------
create or replace function public.seo_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. seo_runs — one row per orchestrator invocation -----------------------------
create table if not exists public.seo_runs (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'running'
               check (status in ('running', 'completed', 'failed')),
  source       text not null default 'cron',
  cadence      text not null default 'hourly',
  stats        jsonb not null default '{}'::jsonb,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists seo_runs_started_idx on public.seo_runs (started_at desc);
create index if not exists seo_runs_status_idx  on public.seo_runs (status);

-- 2. seo_tasks — the work queue the orchestrator fills, workers drain -----------
create table if not exists public.seo_tasks (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid references public.seo_runs (id) on delete set null,
  task_type    text not null,
  status       text not null default 'queued'
               check (status in ('queued', 'running', 'done', 'error', 'skipped')),
  priority     int  not null default 100,           -- lower = sooner
  payload      jsonb not null default '{}'::jsonb,
  result       jsonb,
  attempts     int  not null default 0,
  max_attempts int  not null default 3,
  last_error   text,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Hot path: "give me the next runnable queued tasks, best priority first".
create index if not exists seo_tasks_runnable_idx
  on public.seo_tasks (status, run_after, priority, created_at);
create index if not exists seo_tasks_run_idx on public.seo_tasks (run_id);
create index if not exists seo_tasks_type_idx on public.seo_tasks (task_type, status);
drop trigger if exists seo_tasks_touch on public.seo_tasks;
create trigger seo_tasks_touch before update on public.seo_tasks
  for each row execute function public.seo_touch_updated_at();

-- 3. seo_keywords — the keyword universe (GSC + inventory + intents) ------------
create table if not exists public.seo_keywords (
  id             uuid primary key default gen_random_uuid(),
  keyword        text not null unique,
  intent         text,            -- transactional_local | local_store | service | product | guide
  location       text,            -- suburb or city, normalised lowercase
  category       text,            -- bike type / part type
  brand          text,
  priority_score numeric not null default 0,
  demand         jsonb not null default '{}'::jsonb, -- {impressions, clicks, position, supply_count}
  source         text,            -- gsc | inventory | seed | internal_search
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists seo_keywords_priority_idx on public.seo_keywords (priority_score desc);
create index if not exists seo_keywords_intent_idx   on public.seo_keywords (intent);
create index if not exists seo_keywords_location_idx on public.seo_keywords (location);
drop trigger if exists seo_keywords_touch on public.seo_keywords;
create trigger seo_keywords_touch before update on public.seo_keywords
  for each row execute function public.seo_touch_updated_at();

-- 4. seo_pages — every candidate/published SEO surface the agent owns ----------
create table if not exists public.seo_pages (
  id                uuid primary key default gen_random_uuid(),
  url               text not null unique,          -- site-relative path, e.g. /bikes/road-bikes/melbourne
  page_type         text not null,                 -- marketplace_category | suburb_category | store_directory | owned_store | guide | brand_city
  target_keyword    text,
  title             text,
  meta_description  text,
  h1                text,
  status            text not null default 'candidate'
                    check (status in ('candidate', 'draft', 'published', 'retired')),
  indexability      text not null default 'noindex'
                    check (indexability in ('index', 'noindex')),
  canonical_url     text,
  quality_score     numeric not null default 0,
  spam_risk_score   numeric not null default 0,
  supply_count      int not null default 0,        -- live listings / stores backing the page
  params            jsonb not null default '{}'::jsonb, -- {city, suburb, category, brand, ...}
  content           jsonb not null default '{}'::jsonb, -- generated brief: blocks, faqs, internal_links, schema[]
  last_published_at timestamptz,
  last_refreshed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists seo_pages_status_idx on public.seo_pages (status, indexability);
create index if not exists seo_pages_type_idx   on public.seo_pages (page_type);
create index if not exists seo_pages_refresh_idx on public.seo_pages (last_refreshed_at);
drop trigger if exists seo_pages_touch on public.seo_pages;
create trigger seo_pages_touch before update on public.seo_pages
  for each row execute function public.seo_touch_updated_at();

-- 5. gsc_query_page_daily — Search Console performance, by day ----------------
-- country/device/search_appearance default '' so the natural key has no NULLs
-- (NULLs would defeat the unique upsert key).
create table if not exists public.gsc_query_page_daily (
  id                 uuid primary key default gen_random_uuid(),
  date               date not null,
  query              text not null,
  page               text not null,
  country            text not null default '',
  device             text not null default '',
  search_appearance  text not null default '',
  clicks             int not null default 0,
  impressions        int not null default 0,
  ctr                numeric not null default 0,
  position           numeric not null default 0,
  created_at         timestamptz not null default now(),
  unique (date, query, page, country, device, search_appearance)
);
create index if not exists gsc_qpd_query_idx on public.gsc_query_page_daily (query);
create index if not exists gsc_qpd_page_idx  on public.gsc_query_page_daily (page);
create index if not exists gsc_qpd_date_idx  on public.gsc_query_page_daily (date desc);

-- 6. url_inspections — Google's own view of a URL (URL Inspection API) ---------
create table if not exists public.url_inspections (
  id                uuid primary key default gen_random_uuid(),
  url               text not null,
  verdict           text,
  coverage_state    text,
  indexing_state    text,
  robots_txt_state  text,
  google_canonical  text,
  user_canonical    text,
  last_crawl_time   timestamptz,
  rich_results      jsonb,
  raw               jsonb,
  inspected_at      timestamptz not null default now()
);
create index if not exists url_inspections_url_idx on public.url_inspections (url, inspected_at desc);

-- ----------------------------------------------------------------------------
-- claim_seo_tasks — atomically lease the next runnable tasks to one worker.
-- FOR UPDATE SKIP LOCKED lets multiple concurrent worker invocations pull
-- disjoint task sets without blocking or double-processing.
-- ----------------------------------------------------------------------------
create or replace function public.claim_seo_tasks(p_worker text, p_limit int default 5)
returns setof public.seo_tasks
language plpgsql
as $$
begin
  return query
  with next as (
    select t.id
    from public.seo_tasks t
    where t.status = 'queued'
      and t.run_after <= now()
    order by t.priority asc, t.created_at asc
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.seo_tasks t
     set status    = 'running',
         attempts  = t.attempts + 1,
         locked_at = now(),
         locked_by = p_worker
    from next
   where t.id = next.id
  returning t.*;
end;
$$;

-- ----------------------------------------------------------------------------
-- Row-level security: agent + cockpit are server-side (service role bypasses
-- RLS). Enable RLS with no anon/auth policy so the public client can never read
-- the SEO control plane.
-- ----------------------------------------------------------------------------
alter table public.seo_runs            enable row level security;
alter table public.seo_tasks           enable row level security;
alter table public.seo_keywords        enable row level security;
alter table public.seo_pages           enable row level security;
alter table public.gsc_query_page_daily enable row level security;
alter table public.url_inspections     enable row level security;

-- Published SEO pages are public content — let the storefront read them (and
-- only them). Everything else stays service-role only. The control plane
-- (runs/tasks/keywords/inspections) is never exposed to the public client.
drop policy if exists "seo_pages public read published" on public.seo_pages;
create policy "seo_pages public read published"
  on public.seo_pages for select
  to anon, authenticated
  using (status = 'published');

comment on table public.seo_pages is
  'Every SEO surface the Search Dominance Agent owns. A page is only indexable when it passes the quality gates (real supply / local data / unique content); thin candidates stay status=candidate, indexability=noindex until they earn it.';

-- ----------------------------------------------------------------------------
-- Supply aggregation (read-only) — feed the keyword universe + page scoring
-- from real live inventory in public_marketplace_cards. SECURITY DEFINER so the
-- agent reads the matview regardless of grants; STABLE + only SELECTs.
-- ----------------------------------------------------------------------------
create or replace function public.seo_category_supply()
returns table (category text, n bigint)
language sql stable security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(marketplace_category), ''), 'uncategorised') as category, count(*)::bigint
  from public.public_marketplace_cards
  group by 1
  order by 2 desc;
$$;

create or replace function public.seo_brand_supply(p_min int default 3)
returns table (brand text, n bigint)
language sql stable security definer
set search_path = public
as $$
  select btrim(brand) as brand, count(*)::bigint
  from public.public_marketplace_cards
  where brand is not null and btrim(brand) <> ''
  group by 1
  having count(*) >= greatest(p_min, 1)
  order by 2 desc;
$$;

-- Verified bike stores with their live product counts — the store-directory feed.
create or replace function public.seo_store_directory()
returns table (
  user_id uuid,
  store_slug text,
  business_name text,
  address text,
  phone text,
  website text,
  product_count bigint
)
language sql stable security definer
set search_path = public
as $$
  select u.user_id, u.store_slug, u.business_name, u.address, u.phone, u.website,
         count(c.id)::bigint as product_count
  from public.users u
  left join public.public_marketplace_cards c on c.user_id = u.user_id
  where u.account_type = 'bicycle_store' and u.bicycle_store = true
  group by u.user_id, u.store_slug, u.business_name, u.address, u.phone, u.website
  order by product_count desc;
$$;

-- Live supply for a suburb+category guess (pickup_location is free text).
create or replace function public.seo_suburb_category_supply(p_suburb text, p_category text default null)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.public_marketplace_cards
  where pickup_location ilike '%' || p_suburb || '%'
    and (p_category is null or marketplace_category = p_category);
$$;

-- Suburb x category live-supply matrix in one round-trip (pickup_location is
-- free text; suburb slugs use hyphens, so we space them for the ILIKE).
create or replace function public.seo_suburb_supply_matrix(p_suburbs text[])
returns table (suburb text, category text, n bigint)
language sql stable security definer
set search_path = public
as $$
  select s.suburb,
         coalesce(nullif(btrim(c.marketplace_category, ''), ''), 'uncategorised') as category,
         count(*)::bigint
  from unnest(p_suburbs) as s(suburb)
  join public.public_marketplace_cards c
    on c.pickup_location ilike '%' || replace(s.suburb, '-', ' ') || '%'
  group by 1, 2;
$$;

-- Aggregate Search Console performance per query over a window (impression-
-- weighted average position + the page that earns the most impressions).
create or replace function public.seo_gsc_query_rollup(p_days int default 28)
returns table (query text, impressions bigint, clicks bigint, avg_position numeric, top_page text)
language sql stable
as $$
  with agg as (
    select query,
           sum(impressions)::bigint as impressions,
           sum(clicks)::bigint as clicks,
           case when sum(impressions) > 0
                then sum(position * impressions) / sum(impressions)
                else avg(position) end as avg_position
    from public.gsc_query_page_daily
    where date >= (current_date - p_days)
    group by query
  ),
  top as (
    select distinct on (query) query, page as top_page
    from public.gsc_query_page_daily
    where date >= (current_date - p_days)
    order by query, impressions desc
  )
  select a.query, a.impressions, a.clicks, round(a.avg_position, 1) as avg_position, t.top_page
  from agg a left join top t using (query)
  order by a.impressions desc
  limit 2000;
$$;
