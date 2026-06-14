import type { SupabaseClient } from '@supabase/supabase-js'
import type { CustomerInquiryEventType } from '@/lib/customer-inquiries/types'

export async function recordInquiryEvent(
  supabase: SupabaseClient,
  args: {
    inquiryId: string
    userId: string
    eventType: CustomerInquiryEventType
    payload?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await supabase.from('store_customer_inquiry_events').insert({
    inquiry_id: args.inquiryId,
    user_id: args.userId,
    event_type: args.eventType,
    payload: args.payload ?? {},
  })

  if (error) {
    console.warn('[customer-inquiries] event insert failed:', error.message)
  }
}
