import { createClient } from '@supabase/supabase-js'
import { listGmailConnections, searchGmailEmails } from '../src/lib/composio/gmail'
import {
  emailLooksLowValue,
  hasBikeShopSignal,
  hasInquirySubjectSignal,
  parseGmailSender,
} from '../src/lib/composio/gmail-response-suggestions'
import { refreshCustomerInquiriesForUser } from '../src/lib/customer-inquiries/sync'
import { createServiceRoleClient } from '../src/lib/supabase/server'

const INBOX_QUERY = 'in:inbox newer_than:14d -category:promotions -category:social'
const TOM_QUERY = 'in:inbox newer_than:14d from:tom@lidgett.net'

const STORE_IDS: Array<[string, string]> = [
  ['Ashburton Cycles', '3acef09d-8b28-46e8-a0c3-45ce59c61972'],
  ['Mercedes', '0a773f17-15a3-47d5-9fa2-bddf903c5eab'],
  ['Dummy Bike Store', '00000000-0000-4000-8000-000000000101'],
]

function isLikelyCustomerInquiry(email: Parameters<typeof emailLooksLowValue>[0]) {
  if (emailLooksLowValue(email)) return { pass: false, reason: 'low_value' }
  if (!parseGmailSender(email.from).email) return { pass: false, reason: 'no_sender_email' }
  const bike = hasBikeShopSignal(email)
  const inquirySubject = hasInquirySubjectSignal(email.subject)
  const question = email.snippet.includes('?') || /\?/.test(email.subject)
  if (bike || inquirySubject || question) {
    return {
      pass: true,
      reason: bike ? 'bike_signal' : inquirySubject ? 'inquiry_subject' : 'question_mark',
    }
  }
  return { pass: false, reason: 'no_bike_signal_or_question' }
}

async function main() {
  const supabase = createServiceRoleClient()

  for (const [name, userId] of STORE_IDS) {
    console.log(`\n=== ${name} (${userId}) ===`)
    try {
      const connections = await listGmailConnections(userId)
      console.log(`Gmail connections: ${connections.length}`)
      for (const connection of connections) {
        console.log(`  - ${connection.email_address ?? connection.label} (${connection.status})`)
      }
      if (connections.length === 0) continue

      const tomSearch = await searchGmailEmails(userId, {
        query: TOM_QUERY,
        max_results: 10,
        scan_depth: 'quick',
      })
      console.log(`Emails from tom@lidgett.net: ${tomSearch.emails.length}`)
      for (const email of tomSearch.emails) {
        console.log(
          JSON.stringify(
            {
              subject: email.subject,
              from: email.from,
              snippet: email.snippet.slice(0, 200),
              date: email.date_label,
              filter: isLikelyCustomerInquiry(email),
            },
            null,
            2,
          ),
        )
      }

      const inbox = await searchGmailEmails(userId, {
        query: INBOX_QUERY,
        max_results: 20,
        scan_depth: 'quick',
      })
      const tomInInbox = inbox.emails.filter((email) => /tom@lidgett\.net/i.test(email.from))
      console.log(`Tom emails in standard inbox scan: ${tomInInbox.length} / ${inbox.emails.length}`)
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const ashburtonId = '3acef09d-8b28-46e8-a0c3-45ce59c61972'
  console.log(`\n=== Running refresh for Ashburton Cycles ===`)
  const summary = await refreshCustomerInquiriesForUser(supabase, ashburtonId, 'Ashburton Cycles')
  console.log(JSON.stringify(summary, null, 2))

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env')
  const sb = createClient(url, key)
  const { data: rows } = await sb
    .from('store_customer_inquiries')
    .select('id,subject,sender_email,status,snippet,created_at')
    .eq('user_id', ashburtonId)
    .ilike('sender_email', '%tom@lidgett.net%')
    .order('created_at', { ascending: false })
  console.log('\nDB rows after refresh:', JSON.stringify(rows, null, 2))

  const { readGmailMessages } = await import('../src/lib/composio/gmail')
  const customerQuestion = await searchGmailEmails(ashburtonId, {
    query: 'in:inbox from:tom@lidgett.net subject:"Customer Question"',
    max_results: 1,
    scan_depth: 'quick',
  })
  const preview = customerQuestion.emails[0]
  if (preview) {
    const bodies = await readGmailMessages(ashburtonId, {
      message_ids: [preview.message_id],
      max_body_chars: 800,
    })
    console.log('\nCustomer Question body preview:')
    console.log(bodies[0]?.body_text?.slice(0, 500) ?? '(empty)')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
