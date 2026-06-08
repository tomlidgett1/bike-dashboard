/** Agent-facing guidance for answering arbitrary email questions via search_gmail. */
export const GMAIL_SEARCH_PLAYBOOK = `
GMAIL SEARCH PLAYBOOK (use search_gmail before answering ANY email question when Gmail is connected)

Always search first — never guess inbox contents, dates, senders, or counts from memory.

Tool parameters:
- query: Gmail search syntax (compose a precise query for the question)
- connected_account_id: optional — search one mailbox only; omit to search ALL connected Gmail accounts (merged results include mailbox_label on each email)
- scan_depth "quick": one page — recent mail, quick previews, narrow date windows already in the query
- scan_depth "full": paginates the ENTIRE matching history (years of mail) — use for earliest/latest-ever, totals, rep/contact history, "have we ever", "how many", or when quick results look incomplete
- sort_order "newest" | "oldest": sort the returned set after scanning
- max_results: emails shown in the UI card only (default 8); does NOT limit full scans

Gmail query operators (combine as needed):
- from:someone@domain.com · to: · cc: · subject:phrase · "exact phrase"
- after:YYYY/MM/DD · before:YYYY/MM/DD (UTC calendar days; before is exclusive)
- newer_than:7d · older_than:1y · has:attachment · filename:pdf
- in:inbox · in:sent · in:anywhere · is:unread · is:starred · label:Name
- OR / - (NOT): from:supplier.com OR from:other.com · -from:warranty · -from:support
- For reply/respond tasks ALWAYS include sent context: run a second pass with in:sent to:person (or in:sent "Name") after the inbox/anywhere thread pass — match our prior tone and promises before drafting

Question → query + scan pattern:
- Latest/recent from someone → from:domain sort newest, scan_depth quick
- How many emails / volume → narrow with from:/after:/before:, scan_depth full, read scan_stats.total_matched
- Supplier/vendor correspondence (Apollo, Shimano, etc.) → from:domain OR brand keyword; scan_depth full if history matters
- Invoices/orders/attachments → from:supplier has:attachment OR subject:invoice, add date filters if asked
- Person by name → from:"First Last" OR from:email if known
- Date range → always add after:/before: to the query AND use scan_depth full if the range may span many pages
- Summarise a thread/topic → subject:keyword or quoted phrase, scan_depth quick unless user wants everything
- Issue/warranty/fault/what happened → search to find the thread, then read_gmail_messages (or use message_bodies from search) for body_text — answer from the body, not subjects alone

REPLY / RESPOND / DRAFT / SEND (CRITICAL — includes "respond to Tom", "reply to sarah@…", "get back to Joel"):
These are Gmail tasks even when the user does not say "email" or "Gmail". Treat them as high-priority compose workflows.
1. Parse who they mean (name or email from the user message). If unclear after one search pass, ask one sharp question — do not refuse.
2. Thread pass: (from:person OR to:person) OR from:email OR to:email — scan_depth quick, sort_order newest — find the message to reply to.
3. Sent pass (REQUIRED): in:sent to:person OR in:sent "Name" — scan_depth quick — read what we already promised/said; mirror tone and do not contradict prior outbound mail.
4. read_gmail_messages on the best incoming message_id (and optionally the latest matching sent message_id) — body_text is mandatory before drafting.
5. propose_gmail_email with action draft (default) or send only if the user explicitly asked to send now:
   - recipient_email from the incoming From/To fields (reply to the external sender, not our mailbox)
   - subject: Re: {original subject} (strip duplicate Re:)
   - body: professional reply grounded in body_text; reference specifics from their mail and our sent history when relevant
   - connected_account_id from the mailbox that received/sent the thread
6. If the user said "respond/reply/draft" you MUST reach propose_gmail_email — searching alone is not enough.
7. Follow-ups in chat: reuse private Gmail agent_context message_bodies; only re-search if the person/thread changed.

When search_gmail returns suggested_reply_passes, run any pass not yet executed before drafting.

REPS / ACCOUNT MANAGERS / "first contact" / "who was our rep" (CRITICAL — multi-pass):
A single from:domain scan is NOT enough. warranty@, support@, and noreply@ are often the earliest emails but are NOT sales reps.
Run 2–4 search_gmail calls and synthesise before answering:
1. Broad history: from:supplier-domain scan_depth full sort_order oldest → read contact_analysis (not just the first email in the list)
2. Exclude support: from:domain -from:warranty -from:support -from:noreply -from:no-reply scan_depth full sort_order oldest
3. Sales-related mail: from:domain (quote OR order OR pricing OR account OR rep OR dealer OR purchase OR invoice OR catalogue OR stock) scan_depth full sort_order oldest
4. If names emerge (e.g. Joel Pearson): from:"Joel Pearson" OR from:joel@domain scan_depth full sort_order oldest

Answer rules for rep/contact questions:
- Use contact_analysis.earliest_likely_sales_contact as the primary answer (name, email, first_seen_label, sample_subjects)
- If earliest_any_contact is warranty/support/automated and differs, say so explicitly — do not call warranty the "rep"
- Cross-check passes 2–3; prefer a named person with a personal email over shared inboxes
- Cite the date from first_seen_label on the chosen contact, not from memory or unrelated senders

Reading results:
- message_bodies (search_gmail tool return) = auto-fetched full text for issue/warranty/content questions on the top matches — read body_text first
- read_gmail_messages = fetch body_text for specific message_ids when you need more messages or auto-hydration missed them
- contact_analysis.earliest_likely_sales_contact = best answer for "first rep" / sales contact questions
- contact_analysis.likely_sales_contacts = ranked human/sales-looking senders by first seen
- contact_analysis.support_or_automated_senders = warranty/support — usually NOT the rep
- contact_analysis.analysis_notes = pre-written caveats — read and reflect in your answer
- scan_stats.total_matched = total emails matching the query across all pages scanned
- sender_summary = per-sender first/last seen, role_hint, sample_subjects
- internal_date_ms / date_label on each email — always use these for chronology
- If scan_stats.capped is true, say history may extend further and suggest narrowing the query

If Gmail is not connected, call get_gmail_connection_status and point to the in-chat Connect card.

After planned searches, check answer_readiness.gaps on each search_gmail result. If any gaps remain, run record_answer_recheck and the next search pass — do not answer yet. Before the final reply, call verify_question_answered with remaining_gaps=[] only when the draft truly answers the user question.
`.trim()
