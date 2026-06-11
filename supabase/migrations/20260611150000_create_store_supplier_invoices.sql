-- Supplier invoices detected in the connected Gmail inbox (or uploaded as PDFs)
-- that the Genie turns into Lightspeed purchase orders.
CREATE TABLE IF NOT EXISTS public.store_supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source TEXT NOT NULL CHECK (source IN ('gmail', 'upload')),

  -- Gmail-sourced invoices
  gmail_message_id TEXT,
  gmail_attachment_id TEXT,
  gmail_connected_account_id TEXT,
  attachment_filename TEXT,
  email_subject TEXT,
  email_from TEXT,
  email_date TIMESTAMPTZ,

  -- Uploaded invoices (Supabase storage)
  storage_path TEXT,

  status TEXT NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'processing', 'po_created', 'dismissed', 'failed')),

  -- Structured extraction result (supplier, lines, totals) once processed.
  extracted JSONB,
  lightspeed_order_id TEXT,
  lightspeed_order_url TEXT,
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per Gmail attachment per user (uploads get NULL message ids, so use
-- a partial unique index instead of a table constraint).
CREATE UNIQUE INDEX IF NOT EXISTS store_supplier_invoices_gmail_key
  ON public.store_supplier_invoices(user_id, gmail_message_id, gmail_attachment_id)
  WHERE gmail_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS store_supplier_invoices_user_status_idx
  ON public.store_supplier_invoices(user_id, status, created_at DESC);

ALTER TABLE public.store_supplier_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_supplier_invoices_select_own" ON public.store_supplier_invoices;
CREATE POLICY "store_supplier_invoices_select_own"
  ON public.store_supplier_invoices FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "store_supplier_invoices_insert_own" ON public.store_supplier_invoices;
CREATE POLICY "store_supplier_invoices_insert_own"
  ON public.store_supplier_invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "store_supplier_invoices_update_own" ON public.store_supplier_invoices;
CREATE POLICY "store_supplier_invoices_update_own"
  ON public.store_supplier_invoices FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "store_supplier_invoices_delete_own" ON public.store_supplier_invoices;
CREATE POLICY "store_supplier_invoices_delete_own"
  ON public.store_supplier_invoices FOR DELETE
  USING (auth.uid() = user_id);

-- Private bucket for uploaded supplier invoice PDFs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-invoices', 'supplier-invoices', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "supplier_invoices_storage_select_own" ON storage.objects;
CREATE POLICY "supplier_invoices_storage_select_own"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'supplier-invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "supplier_invoices_storage_insert_own" ON storage.objects;
CREATE POLICY "supplier_invoices_storage_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'supplier-invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "supplier_invoices_storage_delete_own" ON storage.objects;
CREATE POLICY "supplier_invoices_storage_delete_own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'supplier-invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

COMMENT ON TABLE public.store_supplier_invoices IS
  'Supplier PDF invoices detected in Gmail or uploaded by the store, tracked through Genie purchase-order creation in Lightspeed.';
