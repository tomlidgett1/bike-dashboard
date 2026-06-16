# Nest business portal → Yellow Jersey: cutover runbook

This migrates the Nest **business/brand portal** into YJ's own Supabase project + app so YJ
no longer calls `nest.expert` or the Nest Supabase project. Staged: nest.expert stays live as
fallback until verified. Nothing is deleted from Nest.

## Status (what's already built & verified, no prod changes yet)
- ✅ Schema migration `supabase/migrations/20260616090000_nest_business_portal_schema.sql`
  (65 business tables + `full_review`/`private` schemas + pgmq queue). Verified to apply cleanly
  on a throwaway `supabase/postgres` container.
- ✅ Code ported to `src/lib/nest-portal/**` + routes under `src/app/api/nest-portal/**`;
  type-checks clean. `src/lib/nest/brand-portal-client.ts` repointed to call the handler in-process.
- ✅ Data-copy script `scripts/nest-portal/copy-data.ts`.
- ✅ 7/15 business secrets in `.env.local`.

## Prerequisites before cutover
1. Provide the 8 prod-only secrets (pull from the Nest Vercel/Supabase project):
   `ELEVENLABS_API_KEY`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_BUNDLE_SID`,
   `LINQ_AGENT_BOT_NUMBERS`, `LINQ_AGENT_FROM`, `LINQ_VOICE_FROM` (LINQ_API_BASE_URL has a default).
   `cd ~/Desktop/'Nest V3'/website && vercel env pull /tmp/nest.env` then copy the values.
2. Finish edge-function migration (Phase 2b) if voice/inbound-automation parity is needed at launch
   (the inbox list/send path does NOT require them).

## Cutover steps (each is reversible until the final webhook/env flip)
1. **Snapshot** the YJ database (Supabase dashboard → Database → Backups, or `pg_dump`).
2. **Apply schema:** `cd bike-dashboard && supabase db push` (applies the new migration to prod YJ).
   Enable `pg_cron` in the Supabase dashboard first if not already on.
3. **Copy data:**
   ```
   NEST_SUPABASE_URL=… NEST_SUPABASE_SECRET_KEY=… \
   YJ_SUPABASE_URL=… YJ_SUPABASE_SERVICE_ROLE_KEY=… \
   npx tsx scripts/nest-portal/copy-data.ts --dry-run   # review counts, then drop --dry-run
   ```
4. **Edge functions** (if migrated): `supabase functions deploy <names>` + `supabase secrets set …`.
5. **Vercel env:** add the 15 business secrets to the YJ Vercel project; deploy.
6. **Repoint webhooks** (LINQ, Twilio, ElevenLabs) from `nest.expert/...` to the YJ function URLs —
   one provider at a time, watching for inbound traffic.
7. **Flip Supabase env to YJ's own** (the final cutover): set in YJ env
   `NEST_SUPABASE_URL = <YJ SUPABASE_URL>` and `NEST_SUPABASE_SECRET_KEY = <YJ service role key>`.
   This repoints the remaining direct-`NEST_SUPABASE_*` consumers (text-upload routes,
   cloudinary-listing-images, the `group-photos-ai`/`analyze-listing-ai`/`upload-to-cloudinary`
   edge fns) to YJ. The brand-portal path is already internal regardless of this.

## Verify (Phase 6)
- Parity smoke: for brand `ash`, call the internal path and diff against live nest.expert:
  conversations list, a thread, suggestions, customerSearch, homeSummary, start/send message.
- Dashboard inbox loads + a thread opens + a test message sends (preview server, port 3100).
- Inbound webhook → row lands in YJ `conversation_messages` (if edge fns deployed).
- Row-count parity per table (copy-data summary vs source).

## Rollback
- Before step 6/7: revert by leaving `NEST_*` env pointing at the Nest project — YJ falls back to
  nest.expert (still live). The new YJ tables are additive and can be dropped if needed
  (`drop schema full_review cascade; drop schema private cascade;` + the 65 `nest_*`/business tables).
