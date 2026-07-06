# CRM Email Engine

Internal tool for importing Lightspeed customer emails, composing template-based
HTML campaigns, and sending them from the Yellow Jersey email address — with
opt-outs enforced end to end. Lives at **/settings/store/crm** (store owners
only). No open/click/pixel tracking, by design.

## Sending architecture

Campaign sending runs through the **`crm-send-campaign-emails` Supabase edge
function** (deployed), which shares `RESEND_API_KEY` and `FROM_EMAIL` with the
transactional emails — those secrets live in Supabase edge secrets, not in the
Next.js environment. The Next send route renders the per-recipient HTML and
posts finished messages to the edge function; the edge function authenticates,
batches (50/call via Resend's batch API, individual fallback), and sends.

Auth between Next and the edge function is the repo-standard
`x-internal-secret: INTERNAL_EDGE_SHARED_SECRET` header (user/anon JWTs are
rejected — the function can send arbitrary email).

**Replies**: every campaign (and test send) sets `Reply-To` to the store's own
email address (`public.users.email`, normalized) — replies from customers land
in the shop's inbox, not the shared Yellow Jersey sending address. The Review
step shows this as "Replies go to" before sending.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Supabase edge secrets (set) | Resend API key, shared with transactional email. |
| `FROM_EMAIL` | Supabase edge secrets (set) | Campaign sender — currently `Yellow Jersey <notifications@yellowjersey.store>`. `CRM_FROM_EMAIL` (edge secret) overrides it for campaigns only. |
| `INTERNAL_EDGE_SHARED_SECRET` | both (set) | Authorises Next → edge function calls. |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Next env (set) | Edge function calls + the public unsubscribe endpoint's service-role update. |
| `RESEND_API_KEY` + `CRM_FROM_EMAIL` | Next env (optional) | Escape hatch: when both are set, sending bypasses the edge function and goes direct from the Next server. |

Unsubscribe links always point at the production origin (`SITE_URL` from
`src/lib/seo/site.ts`), so emails sent from any environment unsubscribe against
production.

Provider abstraction: `src/lib/crm/email-provider.ts`. To switch to SendGrid /
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
templates (new arrivals, featured bikes, store announcement, service reminder,
newsletter) rendered by one shared renderer that matches the design system of
the transactional emails in `supabase/functions/_shared/email-templates/` —
dark `#0a0a0a` hero, 900-weight uppercase headline, `#F5C518` yellow accents,
square yellow CTA, dark footer. Branding is the **store's** (logo + name from
`public.users.business_name`/`logo_url`); Yellow Jersey appears only as
"Powered by Yellow Jersey" in the footer. Campaign history stores the template
key + content, so every send is replayable.

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
