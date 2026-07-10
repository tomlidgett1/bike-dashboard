# Yellow Jersey — Search Dominance Agent

An hourly, quality-gated SEO operating system. It turns **Google Search Console
data + real Yellow Jersey inventory** into indexable, locally-relevant cycling
pages — and never mass-produces thin doorway pages, because every page must pass
hard supply/quality gates before it can be indexed.

The loop: **Google data → identify demand → match to real supply → build/refresh
page → validate quality → publish → sitemap → inspect → measure → improve → prune.**

---

## What runs today vs. what needs credentials

The agent is split so it delivers value immediately and lights up more as you
connect Google.

| Capability | Works now? | Needs |
|---|---|---|
| Inventory-driven page factory (category × city/suburb, brand, store directory, owned store) | ✅ Yes | nothing — uses your own Supabase data |
| Quality gates / scoring / noindex of thin pages | ✅ Yes | nothing |
| Sharded sitemap incl. published pages | ✅ Yes | nothing |
| Admin cockpit + manual “Run agent now” | ✅ Yes | nothing |
| GLM-polished copy (titles/meta/FAQs) | ⚙️ Optional | `SEO_LLM_API_KEY` (OpenRouter) — falls back to templates |
| Search Console ingestion (demand, positions, CTR) | 🔌 Gated | Google service account + `GSC_SITE_URL` |
| URL Inspection (Google’s index view) | 🔌 Gated | same Google service account |
| Sitemap submit to GSC | 🔌 Gated | same |
| Merchant Center / free listings feed | 🔌 Gated | `MERCHANT_ID` + `content` scope |
| Business Profile (Ashburton Cycles) | 🔌 Gated | `GBP_ACCOUNT_ID` / `GBP_LOCATION_ID` + approval |

Every gated handler **no-ops cleanly** (returns `{skipped: …}`) when its
credentials are absent — the run still succeeds.

---

## Architecture

**Database** (`supabase/migrations/20260626140000_seo_agent_schema.sql`)
- `seo_runs` — one row per hourly run
- `seo_tasks` — the work queue (SKIP-LOCKED claim via `claim_seo_tasks()`)
- `seo_keywords` — the keyword universe (GSC demand + inventory supply)
- `seo_pages` — every page the agent owns (candidate → draft → published → retired)
- `gsc_query_page_daily` — Search Console performance by day
- `url_inspections` — Google’s per-URL view
- Read-only supply RPCs: `seo_category_supply`, `seo_brand_supply`,
  `seo_store_directory`, `seo_suburb_supply_matrix`, `seo_gsc_query_rollup`
- RLS: control plane is **service-role only**; `seo_pages` rows that are
  `status='published'` are publicly readable (the storefront renders them).

**Edge functions** (`supabase/functions/`)
- `seo-orchestrator` — hourly: takes a lock, opens a run, seeds the queue.
- `seo-worker` — drains the queue, dispatching to handlers in
  `seo-worker/handlers/`: `gsc-sync`, `inventory-sync`, `keyword-engine`,
  `page-planner`, `page-generator`, `page-validator`, `sitemap`,
  `url-inspection`, `merchant-sync`, `business-profile-sync`, `internal-links`,
  `alerts`.
- Shared libs in `_shared/`: `seo-scoring.ts` (the anti-spam gate),
  `seo-llm.ts` (GLM via OpenRouter), `google-auth.ts` (service-account → token),
  `seo-geo.ts` (Melbourne suburbs), `seo-slug.ts`, `seo-types.ts`, `seo-db.ts`.

**Storefront routes** (`src/app/`) — render only **published** pages, else 404:
- `/bikes/[category]/[place]` · `/bike-shops/[place]` · `/bike-service/[place]`
- `/brands/[brand]/[place]` · `/stores/[slug]`
- Shared UI: `src/components/seo/seo-landing.tsx`; loaders:
  `src/lib/seo/agent-pages.ts`. Sitemap: `src/app/sitemap.ts` — single file
  (≤50k URLs, ample headroom) that now also lists every published SEO page.

**Cockpit** — `/admin/seo` (admin only). Stats, recent runs, opportunity queue,
page inventory, URL inspections, and a manual trigger.

---

## The quality gates (why it won’t poison the domain)

`seo-scoring.ts` scores each candidate; **supply depth dominates**. A page can
only be `index` when it clears the bar AND has real supply
(`≥5 live listings`, or `≥1` store for directory/owned pages). The validator
(`page-validator`) re-checks before publish: unique title/H1, real intro +
blocks, canonical present, schema present, supply present. Anything that fails
stays `draft`/`noindex`. Pages whose supply dries up are auto-`retired`. GLM
never writes facts — counts/prices/stores come from the DB; GLM only rewrites.

---

## Deploy

1. **Apply the schema** (safe, no secrets):
   ```bash
   supabase db push          # applies 20260626140000_seo_agent_schema.sql
   ```
2. **Deploy the functions:**
   ```bash
   supabase functions deploy seo-orchestrator
   supabase functions deploy seo-worker
   ```
3. **Set function secrets** (only the ones you want active):
   ```bash
   # Optional — GLM copy polish:
   supabase secrets set SEO_LLM_API_KEY=or-xxxxx           # OpenRouter key
   supabase secrets set SEO_LLM_MODEL=z-ai/glm-4.6         # or your GLM-5.2 id
   # Gated — Google Search Console / URL Inspection / sitemap submit:
   supabase secrets set GSC_SITE_URL='sc-domain:yellowjersey.store'
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat sa.json)"
   # Gated — Merchant Center:
   supabase secrets set MERCHANT_ID=1234567
   # Gated — Business Profile (see docs/GBP_SETUP.md for the full runbook):
   supabase secrets set GBP_ACCOUNT_ID=… GBP_LOCATION_ID=…
   # optional — override the website link pushed to the listing:
   supabase secrets set GBP_WEBSITE_URI=https://yellowjersey.store/marketplace/store/ashburton-cycles
   # GBP writes are DRY-RUN by default; flip on only after eyeballing the diff
   # in /admin/seo:
   supabase secrets set GBP_APPLY=true
   supabase secrets set SITE_URL=https://yellowjersey.store
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.
   The Google service account must be added as a **full user** on the GSC
   property and the Merchant account.
4. **Smoke test without cron** — open `/admin/seo` and click **Run agent now**
   (or `POST /api/admin/seo/run`). Watch runs/pages populate.

## Activate (gated — turns it on hourly)

1. Store the two cron secrets in Vault:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'seo_project_url');
   select vault.create_secret('<service_role_key>',                'seo_service_key');
   ```
2. Apply the cron migration:
   ```bash
   supabase db push          # applies 20260626140100_seo_agent_cron.sql
   ```
   Pause anytime: `select cron.unschedule('yj-seo-orchestrator-hourly');`

---

## Verify

- `/admin/seo` shows indexable-page count climbing as drafts pass validation.
- A published page, e.g. `https://yellowjersey.store/bikes/road-bikes/melbourne`,
  returns 200 with `index` robots, live listings, JSON-LD (`ItemList`,
  `BreadcrumbList`, `FAQPage`). Before any page is published the same URL 404s.
- `https://yellowjersey.store/sitemap.xml` lists static routes, storefronts,
  listings (with image entries) **and** every published SEO page.

## Costs

- GLM (OpenRouter) ≈ \$0.95/1M in, \$3/1M out — only on page (re)generation,
  capped by the 7-day refresh window.
- URL Inspection ≈ 40 URLs/run (~960/day, under the 2,000/day quota).
- GSC/Merchant/Business Profile reads are free within Google’s quotas.

## Hardcoded rules (from the brief)

1. Never publish just because a keyword exists. 2. Publish only with real supply
/ local data / expertise. 3. Sitemaps contain canonical, indexable URLs only.
4. Never use the Indexing API for normal pages (sitemaps only). 5. Never invent
store/product/review facts. 6. Prefer improving a ranking page over duplicating
it. 7. Noindex thin combinations. 8. Every page connects to a commercial action.
9. Everything is measurable in GSC.
