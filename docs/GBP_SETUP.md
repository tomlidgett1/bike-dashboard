# Google Business Profile — setup runbook (Ashburton Cycles)

GBP is the single biggest lever for "bike service near me" map-pack rankings.
Once connected, the SEO agent's `business-profile-sync` handler keeps the
listing in lockstep with the live store data automatically:

- **websiteUri** → the Ashburton storefront (or `GBP_WEBSITE_URI` override)
- **regularHours** → from the store profile's opening hours
- **serviceItems** → the live service menu (`store_services`: Basic $129, Pro
  $169, Full $249, Gold from $399) with descriptions
- **reviews** → total + average surfaced in `/admin/seo` every run

Writes are **dry-run by default**: the handler reports the exact diff in
`/admin/seo` and touches nothing until `GBP_APPLY=true` is set.

## One-time setup (owner)

### 1. Claim / confirm the listing
Sign in at [business.google.com](https://business.google.com) with the Google
account that owns (or should own) the **Ashburton Cycles** listing at
277 High Street, Ashburton VIC 3147. If the listing is unclaimed, claim and
verify it (postcard/phone/video — Google chooses).

> Even before any API work, do these in the GBP dashboard — they matter more
> than anything else on this page:
> - Primary category: **Bicycle repair shop** (secondary: Bicycle shop)
> - Services: add the four service tiers with prices
> - Hours: Mon–Fri 9–6, Sat 9–4, Sun 10–3
> - Website: the storefront URL
> - Photos of the workshop; reply to every review

### 2. Get API access approved (Google gates this)
1. In [Google Cloud Console](https://console.cloud.google.com), use the same
   project as the existing service account (`GOOGLE_SERVICE_ACCOUNT_JSON`).
2. Request Business Profile API access:
   [https://developers.google.com/my-business/content/prereqs](https://developers.google.com/my-business/content/prereqs)
   — fill in the access-request form for the project. Approval usually takes a
   few days.
3. Once approved, enable these APIs on the project:
   - **My Business Business Information API**
   - **My Business Account Management API**
   - (legacy) **Google My Business API** — still needed for reviews

### 3. Give the service account access to the listing
In [business.google.com](https://business.google.com) → the Ashburton Cycles
location → **Users** → invite the service-account email (from the key JSON,
`client_email`) as a **Manager**. Accept happens automatically for service
accounts.

### 4. Find the two IDs
With the service account authorised, list the accounts/locations:

```bash
TOKEN=$(gcloud auth print-access-token --impersonate-service-account=<sa-email> \
  --scopes=https://www.googleapis.com/auth/business.manage)
curl -H "Authorization: Bearer $TOKEN" \
  https://mybusinessaccountmanagement.googleapis.com/v1/accounts
# → accounts/1234567890  → GBP_ACCOUNT_ID=1234567890
curl -H "Authorization: Bearer $TOKEN" \
  "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/1234567890/locations?readMask=name,title"
# → locations/9876543210 → GBP_LOCATION_ID=9876543210
```

### 5. Set the secrets (dry-run first)
```bash
supabase secrets set GBP_ACCOUNT_ID=1234567890 GBP_LOCATION_ID=9876543210 \
  --project-ref frjcluhuictnbimitvrm
```

### 6. Dry-run, review, apply
1. Open `/admin/seo` → **Run agent now**.
2. The **Business Profile** stage line shows `dry-run — would sync …` with the
   exact fields that differ, plus the current review count/rating.
3. Happy with the diff? Flip the switch:
   ```bash
   supabase secrets set GBP_APPLY=true --project-ref frjcluhuictnbimitvrm
   ```
4. Next run pushes the changes and reports `synced websiteUri, regularHours,
   serviceItems`. From then on the listing self-heals whenever store data
   changes (price updates, new hours, new services).

## Notes
- `GBP_WEBSITE_URI` overrides the website link (e.g. to use
  `https://www.ashburtoncycles.com.au` once that domain serves the storefront).
- The handler never touches: name, address, categories, photos, posts, reviews.
- Unset `GBP_APPLY` (or set anything ≠ `true`) to fall back to dry-run at any
  time.
