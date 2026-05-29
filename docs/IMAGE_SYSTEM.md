# Image System — Source of Truth

> Last updated: 2026-05-29  
> Project: bike-dashboard (Supabase ref `frjcluhuictnbimitvrm`)

This document describes how product images work end-to-end: where they come from, how they're stored, how they're served, and how every layer of the system connects. Read this before touching any image-related code.

---

## Why we built it this way

The old system stored five derived URL columns per image row in `product_images`:

```
card_url | mobile_card_url | thumbnail_url | gallery_url | detail_url
```

These were computed once at upload time and stored. This caused:

- **Inconsistency** — the stored URL might use `f_webp` while a newer component wanted `f_auto` (AVIF). You'd have to re-upload or backfill to change the format.
- **Redundancy** — 5 columns of data that were 100% derivable from a single string (`cloudinary_public_id`) at render time.
- **Dead data** — after migrating to a different crop shape or quality setting, all stored URLs were stale.
- **Trigger failures** — when the columns were dropped, 3 trigger functions broke silently (see the [Trigger Gotchas](#trigger-gotchas) section).

We rebuilt to the model that **Shopify and Airbnb use**: store **one canonical identifier** (`cloudinary_public_id`), compute every display variant at render time. The CDN caches the computed result, so there's no performance cost.

---

## The single source of truth

```
product_images.cloudinary_public_id
```

Everything else is derived from this. A `public_id` looks like:

```
bike-marketplace/canonical/abc123-uuid/1748392043-0
```

From this one string you can compute any size, format, crop, or quality on the fly.

---

## Where images come from

### 1. Canonical product images (the main path for store inventory)

**Lightspeed store products carry NO images of their own.** In production data, every Lightspeed product has `primary_image_url = null` and `images = []`. All marketplace images come from `canonical_products` via the AI discovery pipeline.

The flow:
```
Lightspeed sync → canonical_products row created
        ↓
ai_image_discovery_queue row inserted (status = 'pending')
        ↓
process-ai-auto-approve-queue edge function runs
        ↓
  1. Serper image search (finds 20–40 candidate URLs)
  2. GPT-4o Vision screens candidates (triage pass, low detail)
  3. GPT-4o Vision selects best 1–6 (selection pass, high detail)
  4. Images uploaded to Cloudinary → cloudinary_public_id saved
  5. product_images rows inserted (approval_status = 'approved')
        ↓
marketplace_ready_products view now includes these products
```

### 2. Admin image workbench (manual QA)

When the AI output needs human review, admins use `/admin/image-qa`:

- **Rapid Review** — batch of 15 products, each pre-loaded with Serper results; approve with keyboard shortcuts.
- **Auto-Pilot** — pick a category and count; AI runs the full search+select loop, operator clicks Approve.
- **Workbench** — one product at a time, manual search, fine-grained control.

All three write through the same `/api/admin/images/approve-candidates` endpoint.

### 3. Private listings (user-uploaded)

Private listings (for-sale posts by individual users) use the `upload-to-cloudinary` edge function directly. Images are uploaded from the browser, converted to Cloudinary, and the `cloudinary_public_id` is saved. These products use `listing_type = 'private_listing'` and store a JSONB `images` array for backward compatibility.

### 4. External URLs (fallback)

Some images come from third-party retailer sites (e.g. a bike brand's website). These are stored as `external_url` in `product_images`. If the source site 403s during Cloudinary upload, the image stays as `external_url` only — no `cloudinary_public_id`. The render pipeline handles this gracefully (see below).

---

## The database schema

### `product_images` table — the image store

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `canonical_product_id` | UUID | Links to canonical product (main path) |
| `product_id` | UUID | Links to specific product (private listings) |
| `cloudinary_public_id` | TEXT | **The source of truth.** Derive all URLs from this. |
| `cloudinary_url` | TEXT | The raw Cloudinary URL (format + transforms not applied) |
| `external_url` | TEXT | Original web URL (fallback when Cloudinary upload fails) |
| `is_primary` | BOOLEAN | Whether this is the hero image for the product |
| `sort_order` | INT | Display order |
| `approval_status` | TEXT | `'approved'`, `'pending'`, `'rejected'` |
| `source` | TEXT | Where the image came from (`'serper_workbench'`, `'ai_discovery'`, etc.) |
| `is_downloaded` | BOOLEAN | Whether Cloudinary upload is complete |
| `width`, `height` | INT | Original dimensions |
| `uploaded_by` | UUID | User who approved the image |

> **⚠️ The 5 dead columns are gone.** `card_url`, `mobile_card_url`, `thumbnail_url`, `gallery_url`, `detail_url` were dropped in migration `20260528230000`. Do not add them back. Do not try to SELECT them. All variant URLs are computed from `cloudinary_public_id` at render time.

### `canonical_products` table

One row per canonical product (e.g. "Trek Domane AL 3"). Multiple store products (`products` rows) can link to the same canonical. The canonical is where images live.

### `products` table — cached columns

| Column | Purpose |
|--------|---------|
| `canonical_product_id` | Links to the canonical (and thus to images) |
| `cached_image_url` | Denormalised from product_images by DB trigger |
| `cached_thumbnail_url` | Same |
| `has_displayable_image` | Boolean cache |
| `primary_image_url` | Synced by sync functions |
| `images` | Legacy JSONB array (used only by private listings) |

These cached columns are maintained by DB triggers — you should never write to them directly from application code.

---

## The render pipeline

### Step 1: DB view resolves the image identity

The `marketplace_ready_products` view joins `products` to `product_images` using a 4-level priority LATERAL chain:

```sql
COALESCE(
  selected_image.id,     -- admin has hand-picked a specific image
  product_image.id,      -- image attached directly to this product_id
  canonical_primary.id,  -- primary image on the canonical product
  canonical_any.id       -- any approved image on the canonical product
) AS resolved_image_id
```

It also exposes:
- `resolved_cloudinary_public_id`
- `resolved_cloudinary_url`
- `resolved_external_url`

**The view only returns products where `resolved_image_id IS NOT NULL`.** A product with no approved image is invisible on the marketplace. This is intentional — don't remove that filter.

### Step 2: API route selects the 3 resolved fields

Every marketplace API route (`/api/marketplace/products`, `/api/marketplace/search`, etc.) selects only these 3 fields from the view:

```typescript
resolved_cloudinary_public_id,
resolved_cloudinary_url,
resolved_external_url,
```

**Do not select `resolved_card_url` or other old variant columns — they don't exist.** 

### Step 3: `resolveProductImage()` computes all slots

```typescript
import { resolveProductImage } from '@/lib/services/image-resolver';

const resolved = resolveProductImage({
  cloudinary_public_id: p.resolved_cloudinary_public_id,
  cloudinary_url: p.resolved_cloudinary_url,
  external_url: p.resolved_external_url,
});
// resolved.card_url      → 640px square, AVIF
// resolved.thumbnail_url → 120px, AVIF
// resolved.gallery_url   → 1600px 4:3, white-padded, AVIF
// resolved.detail_url    → 2000px, AVIF
```

`resolveProductImage` calls `getProductImageSlotUrl` for each slot, which works like this:

```typescript
const publicId = image.cloudinary_public_id
  ?? extractCloudinaryPublicId(image.cloudinary_url);

const generated = buildCloudinaryImageUrl(publicId, slot);
if (generated) return generated;

// fallback for external-url-only images
return image.external_url ?? image.cloudinary_url ?? null;
```

**This is the only place variant URLs are computed. Never call `buildCloudinaryImageUrl` in random places — go through `resolveProductImage` or `getProductImageSlotUrl`.**

### Step 4: `ProductCard` renders AVIF with DPR awareness

When a product has a `cloudinary_public_id`, the card uses `next/image` with a custom Cloudinary loader:

```typescript
import { cloudinaryCardLoader } from '@/lib/utils/cloudinary-transforms';

// src = the public_id, not a URL
<Image
  loader={cloudinaryCardLoader}
  src={cardPublicId}
  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
  fill
  alt={name}
/>
```

`cloudinaryCardLoader` receives `{ src: publicId, width: 320 }` (or whatever breakpoint `next/image` is evaluating) and returns:
```
https://res.cloudinary.com/{cloud}/image/upload/c_fill,g_center,ar_1:1,w_320,q_auto,f_auto/{publicId}
```

Next.js generates a full `srcset` — the browser picks the right size for the device pixel ratio. Cloudinary delivers AVIF to browsers that support it, WebP to others, JPEG as a last resort. You don't hardcode any format.

---

## Image slots and transforms

All transforms are defined in one place:

```typescript
// src/lib/utils/cloudinary-transforms.ts
export const CLOUDINARY_IMAGE_TRANSFORMS = {
  thumbnail:   "w_120,c_limit,q_auto:low,f_auto",     // search chips, avatars
  mobile_card: "w_320,ar_1:1,c_fill,g_center,q_auto:good,f_auto",   // mobile grid
  grid_card:   "w_640,ar_1:1,c_fill,g_center,q_auto:good,f_auto",   // desktop grid
  mobile_hero: "w_1000,ar_1:1,c_pad,b_white,q_auto:best,f_auto",    // mobile PDP hero
  web_hero:    "w_1600,ar_4:3,c_pad,b_white,q_auto:best,f_auto",    // desktop PDP hero
  zoom:        "w_2000,c_limit,q_auto:best,f_auto",                  // lightbox / zoom
};
```

The **same transforms** are defined in `supabase/functions/_shared/cloudinary-transforms.ts` for edge functions. Keep these two files in sync if you ever change a transform.

When Cloudinary uploads happen (via `upload-to-cloudinary` edge function), the `CLOUDINARY_EAGER_TRANSFORMS` string pre-warms all 6 slots on Cloudinary's CDN so the first visitor doesn't pay a cold-start latency penalty.

**`f_auto`** is critical. It lets Cloudinary negotiate the best format per browser (AVIF → WebP → JPEG). Never hardcode `f_webp` or `f_jpg`.

---

## DB triggers

Three trigger functions fire on `product_images` changes. All have been updated to use `cloudinary_url / external_url` (not the dropped variant columns):

| Trigger name | Fires on | Calls | Effect |
|---|---|---|---|
| `trigger_marketplace_refresh_images` | AFTER INSERT/UPDATE/DELETE on `product_images` | `refresh_product_cached_image()` | Updates `products.cached_image_url`, `cached_thumbnail_url`, `has_displayable_image` |
| `trg_update_products_on_image_change` | AFTER INSERT/UPDATE/DELETE on `product_images` | `update_products_on_image_change()` | Updates cached columns for products linked to the canonical |

One trigger fires on `products` changes:

| Trigger name | Fires on | Calls | Effect |
|---|---|---|---|
| `trg_update_product_cached_images` | BEFORE UPDATE OF `images, use_custom_image, custom_image_url, canonical_product_id, listing_type` on `products` | `update_product_cached_images()` | Recomputes `cached_image_url` from whichever source is authoritative (JSONB / custom / canonical) |

> **Never add a trigger function that references `product_images.card_url` or any other dropped column.** All trigger functions must use `COALESCE(pi.cloudinary_url, pi.external_url)`.

---

## The admin image QA tooling

### `/admin/image-qa` — three modes

**Rapid Review** (`ImageQaSpeedPanel`)
- Loads a batch of N products with `needs_work` status
- Pre-fetches Serper results in parallel for all N
- Operator reviews one product at a time: click images to select, star for primary, press Enter/Approve
- Save calls `/api/admin/images/approve-candidates` with `quickMode: true`
- Background Cloudinary upload happens after approval (non-blocking)

**Auto-Pilot** (`ImageQaAutoPanel`)
- Operator picks category + count (1–5)
- AI runs the full loop: Serper search → GPT-4o triage → GPT-4o selection
- Operator sees the AI's picks and reasoning, then clicks Approve
- Same save path as Rapid Review

**Workbench** (inline in `page.tsx`)
- One product at a time
- Manual Serper search
- Full Cloudinary upload happens synchronously (blocks until Cloudinary responds)

### `/api/admin/images/approve-candidates`

The single save endpoint for all QA modes. Key behaviour:

- **`quickMode: true`** (Rapid Review + Auto-Pilot): inserts `external_url` immediately so images appear at once, then fires background Cloudinary upload via `scheduleCloudinaryUpload`. The image is visible on the marketplace from the moment of insert (via `external_url` fallback). Cloudinary backfills `cloudinary_url` and `cloudinary_public_id` within seconds.
- **`quickMode: false`** (Workbench): runs Cloudinary upload synchronously; only inserts once Cloudinary confirms. Slower but image is immediately Cloudinary-backed.
- Sets `is_primary`, rejects other pending images (`rejectPending: true`), marks canonical + linked products as `image_review_status = 'ready'`.

### `image_workbench_products` view

The admin QA page reads from this view (not from `marketplace_ready_products`). It joins `canonical_products` to aggregated image counts and the primary image's `cloudinary_url / cloudinary_public_id / external_url`. No variant columns.

---

## The AI discovery pipeline

### Edge function: `process-ai-auto-approve-queue`

Drains the `ai_image_discovery_queue` table. For each pending item:

1. Serper image search (uses the product's `image_review_search_query` or constructs one from UPC/brand/name)
2. GPT-4o Vision triage pass (`detail: 'low'`) — screens ~40 candidates, keeps exact-match only
3. GPT-4o Vision selection pass (`detail: 'high'`) — picks 1 primary + up to 5 supporting from the shortlist
4. Calls `upload-to-cloudinary` for each selected image
5. Inserts approved rows into `product_images`
6. Marks queue item as complete

**This runs without human review.** Use it for bulk backfill. For anything customer-facing where image accuracy matters, use the Admin QA workbench instead.

### Edge function: `upload-to-cloudinary`

Called from both the admin API and the discovery queue. Given an image URL:
1. Downloads the image with browser-like headers (to avoid 403s)
2. Uploads to Cloudinary with a deterministic `public_id`:
   - For canonical images: `bike-marketplace/listings/{userId}/canonical-{canonicalId}/{timestamp}-{index}`
   - For private listings: `bike-marketplace/listings/{userId}/{listingId}/{timestamp}-{index}`
3. Passes `CLOUDINARY_EAGER_TRANSFORMS` so all 6 slots are pre-warmed at upload time
4. Returns `{ url, publicId, width, height, cardUrl, … }` — callers should only use `url` and `publicId`; the returned variant URLs are legacy/informational

---

## Writing to `product_images` — rules

When inserting or updating `product_images` rows, use **only these columns**:

```typescript
{
  canonical_product_id,   // or product_id for private listings
  cloudinary_public_id,   // from Cloudinary upload result
  cloudinary_url,         // raw Cloudinary URL
  external_url,           // original source URL
  is_primary,
  sort_order,
  approval_status,
  source,
  uploaded_by,
  width, height,
  is_downloaded,
}
```

**Never include `card_url`, `mobile_card_url`, `thumbnail_url`, `gallery_url`, or `detail_url` in inserts or updates.** These columns no longer exist. If you add them you'll get a Postgres error.

---

## Reading from `product_images` — rules

In SELECT queries (Supabase client or raw SQL), always use explicit column names. **Never use `SELECT *` from `product_images` in a view or trigger** — Postgres pins a dependency on every column at parse time, which would break the next time a column is added or dropped.

Bad:
```sql
LEFT JOIN LATERAL (SELECT pi.* FROM product_images pi WHERE …) x ON TRUE
```

Good:
```sql
LEFT JOIN LATERAL (
  SELECT pi.id, pi.cloudinary_public_id, pi.cloudinary_url, pi.external_url
  FROM product_images pi WHERE …
) x ON TRUE
```

---

## Trigger gotchas

When you drop a column from `product_images`, every trigger function that fires on that table must be updated first. PostgreSQL does NOT validate field names in PL/pgSQL functions at `CREATE FUNCTION` time — it validates at runtime. So a dropped column in `NEW.card_url` will silently compile but crash every INSERT until you fix the function.

Migrations that define trigger functions on `product_images` (all must be reviewed when schema changes):

| Function | Trigger | Migration that last updated it |
|---|---|---|
| `refresh_product_cached_image()` | `trigger_marketplace_refresh_images` | `20260528230000` |
| `update_products_on_image_change()` | `trg_update_products_on_image_change` | `20260529000000` |
| `update_product_cached_images()` | `trg_update_product_cached_images` (on `products`) | `20260529010000` |
| `refresh_all_cached_images()` | batch utility, no trigger | `20260529010000` |
| `sync_product_images_to_jsonb()` | called by RPC | `20260528230000` |
| `sync_canonical_images_to_products()` | called by RPC | `20260528230000` |

---

## Adding a new image slot

If you need a new transform (e.g. a square 1:1 hero at 1200px):

1. Add it to `CLOUDINARY_IMAGE_TRANSFORMS` in `src/lib/utils/cloudinary-transforms.ts`
2. Add the same transform to `supabase/functions/_shared/cloudinary-transforms.ts`
3. The `CLOUDINARY_EAGER_TRANSFORMS` export picks it up automatically — new uploads will pre-warm it
4. Use it via `getProductImageSlotUrl(image, 'your_new_slot')` or `buildCloudinaryImageUrl(publicId, 'your_new_slot')`
5. **Do not add a new column to `product_images` for it.** Compute it at render time.

---

## Adding a new marketplace API route

Template for any route that returns products with images:

```typescript
const { data } = await supabase
  .from('marketplace_ready_products')
  .select(`
    id, price, description,
    resolved_cloudinary_public_id,
    resolved_cloudinary_url,
    resolved_external_url,
    …
  `);

// In the map:
const resolved = resolveProductImage({
  cloudinary_public_id: p.resolved_cloudinary_public_id,
  cloudinary_url:       p.resolved_cloudinary_url,
  external_url:         p.resolved_external_url,
});

return {
  ...p,
  primary_image_url: resolved?.card_url ?? resolved?.original_url ?? null,
  thumbnail_url:     resolved?.thumbnail_url ?? null,
};
```

Do NOT select `resolved_card_url` or `resolved_thumbnail_url` — they don't exist on the view.

---

## Backfill / ops

### Run the AI discovery queue
```bash
# Invoke via Supabase dashboard or curl with service key
supabase functions invoke process-ai-auto-approve-queue --project-ref frjcluhuictnbimitvrm
```

### Backfill cloudinary_public_id from cloudinary_url
Migration `20260528190000_backfill_cloudinary_public_id.sql` runs a regex UPDATE. Safe to run multiple times (idempotent).

### Refresh all cached image columns
```sql
SELECT refresh_all_cached_images();
```
Returns the count of products updated.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Next.js client + server | Cloud name for URL construction |
| `CLOUDINARY_CLOUD_NAME` | Edge functions | Same |
| `CLOUDINARY_API_KEY` | Edge function secrets | Upload auth |
| `CLOUDINARY_API_SECRET` | Edge function secrets | Upload auth signature |
| `OPENAI_API_KEY` | Next.js server | AI candidate selection |
| `SERPER_API_KEY` | Next.js server | Image search |

---

## File map

```
src/lib/utils/cloudinary-transforms.ts   ← Transforms, buildCloudinaryImageUrl, cloudinaryCardLoader
src/lib/services/image-resolver.ts       ← resolveProductImage, getProductImageSlotUrl, pickPrimaryImage
src/lib/services/product-images.ts       ← DB helpers for reading/writing product_images rows
src/components/marketplace/product-card.tsx  ← ProductCard with cloudinaryCardLoader
src/app/api/marketplace/products/        ← Main marketplace list API
src/app/api/marketplace/search/          ← Search API
src/app/api/admin/images/                ← All admin image APIs
src/app/admin/image-qa/                  ← Admin image QA page (Rapid/Auto-Pilot/Workbench)
supabase/functions/upload-to-cloudinary/ ← Upload edge function
supabase/functions/process-ai-auto-approve-queue/ ← AI discovery queue drain
supabase/functions/ai-auto-approve-images/        ← Single-item AI approval
supabase/functions/_shared/cloudinary-transforms.ts ← Transforms for edge functions
supabase/migrations/20260528230000_…     ← Column drop + view rewrites
supabase/migrations/20260529000000_…     ← update_products_on_image_change fix
supabase/migrations/20260529010000_…     ← update_product_cached_images + batch refresh fix
```
