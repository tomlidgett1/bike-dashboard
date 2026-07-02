# CRM Email Engine

Internal tool for importing Lightspeed customer emails, composing template-based
HTML campaigns, and sending them from the Yellow Jersey email address — with
opt-outs enforced end to end. Lives at **/settings/store/crm** (store owners
only). No open/click/pixel tracking, by design.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | to send | Resend API key. Without it the UI works, but sending is blocked with a clear error. |
| `CRM_FROM_EMAIL` | to send | Campaign sender, e.g. `Yellow Jersey <hello@yellowjersey.store>`. The domain must be verified in Resend. Falls back to `FROM_EMAIL` if unset. |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | yes (already set) | The public unsubscribe endpoint updates opt-out state via the service-role client after token lookup. |

Unsubscribe links always point at the production origin (`SITE_URL` from
`src/lib/seo/site.ts`), so emails sent from any environment unsubscribe against
production.

Provider abstraction: `src/lib/crm/email-provider.ts`. Resend is the default
(the app's transactional email already runs on it). To switch to SendGrid /
Postmark / SES, implement `CrmEmailProvider` and return it from
`getCrmEmailProvider()` — nothing else changes.

## Data model (migration `20260702120000_crm_email_engine.sql`)

- `crm_contacts` — one row per (store, lowercase-trimmed email). Holds name,
  phone, `lightspeed_customer_id`, `source`, opt-out state
  (`opted_out`, `opted_out_at`, `opt_out_reason`) and a per-contact
  `unsubscribe_token` (unguessable UUID).
- `crm_campaigns` — subject, `template_key`, customised `content` JSON, sender,
  status (`draft → sending → sent | failed`), intended/sent/failed counts.
- `crm_campaign_recipients` — one row per recipient per campaign
  (`pending | sent | failed | skipped_opted_out | skipped_invalid`), so we know
  exactly who was sent what.

All three tables have owner-scoped RLS (`auth.uid() = user_id`); the only
service-role writer is the unsubscribe flow.

Email templates are **code, not rows** (`src/lib/crm/templates.ts`): five
polished responsive templates (new arrivals, featured bikes, store
announcement, service reminder, newsletter) rendered by one shared renderer.
Campaign history stores the template key + content, so every send is
replayable.

## Import (Lightspeed → crm_contacts)

`POST /api/store/crm/import` → `src/lib/crm/import-lightspeed.ts`. Pulls all
non-archived customers with `Contact` relations via the existing rate-limited
`LightspeedClient`, takes the primary email, normalizes (lowercase + trim +
format check), dedupes by email, and merges metadata into existing rows.
Rules:

- an existing opt-out is **never** cleared by an import
- customers flagged `noEmail` at the Lightspeed POS are imported already
  opted out (`opt_out_reason = lightspeed_no_email`)
- rows without a valid email are skipped

## Unsubscribe

Every campaign email contains a footer link to
`/unsubscribe?token=<uuid>` (public page, no login, idempotent) plus
RFC 8058 one-click headers pointing at `POST /api/crm/unsubscribe`. Both paths
mark the contact opted out immediately; the page shows a clean confirmation.

## Send guardrails (enforced server-side)

- sender must be configured, subject/title/body must be non-empty
- opted-out and invalid contacts are re-checked and skipped **at send time**
- the `draft → sending` transition is a conditional update, so a campaign can
  only ever be sent once; resending means duplicating into a new campaign
