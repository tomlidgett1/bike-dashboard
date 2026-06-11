// Upload a supplier invoice PDF (dragged into the Genie) so the agent can
// extract it and stage a Lightspeed purchase order.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SUPPLIER_INVOICE_BUCKET } from '@/lib/genie/supplier-invoices'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PDF_BYTES = 15 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profile?.account_type !== 'bicycle_store' || profile?.bicycle_store !== true) {
      return NextResponse.json({ error: 'Store access required.' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Attach a PDF file as "file".' }, { status: 400 })
    }

    const filename = (file.name || 'invoice.pdf').replace(/[^\w.\- ]+/g, '_')
    const isPdf = file.type === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      return NextResponse.json({ error: 'Only PDF invoices are supported.' }, { status: 400 })
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF is too large (15MB max).' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const storagePath = `${user.id}/${Date.now()}-${filename}`

    const { error: uploadError } = await supabase.storage
      .from(SUPPLIER_INVOICE_BUCKET)
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })
    if (uploadError) {
      console.error('[supplier-invoices/upload] storage upload failed:', uploadError)
      return NextResponse.json({ error: 'Could not store the PDF.' }, { status: 500 })
    }

    const { data: inserted, error: insertError } = await supabase
      .from('store_supplier_invoices')
      .insert({
        user_id: user.id,
        source: 'upload',
        attachment_filename: filename,
        storage_path: storagePath,
        status: 'detected',
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error('[supplier-invoices/upload] insert failed:', insertError)
      return NextResponse.json({ error: 'Could not record the invoice.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, invoice_id: inserted.id as string, filename })
  } catch (error) {
    console.error('[supplier-invoices/upload] failed:', error)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }
}
