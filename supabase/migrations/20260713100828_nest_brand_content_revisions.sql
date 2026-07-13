-- Durable, service-role-only history for owner-managed Nest facts and knowledge.
CREATE TABLE IF NOT EXISTS public.nest_brand_content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_key text NOT NULL,
  actor_user_id uuid,
  actor_role text NOT NULL DEFAULT 'staff',
  source text NOT NULL,
  target_type text NOT NULL,
  target_key text NOT NULL,
  operation text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  restored_from_revision_id uuid REFERENCES public.nest_brand_content_revisions(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nest_brand_content_revisions_source_check
    CHECK (source = ANY (ARRAY['manual'::text, 'coach'::text, 'restore'::text])),
  CONSTRAINT nest_brand_content_revisions_target_type_check
    CHECK (target_type = ANY (ARRAY['config'::text, 'knowledge'::text])),
  CONSTRAINT nest_brand_content_revisions_operation_check
    CHECK (operation = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'restore'::text]))
);

CREATE INDEX IF NOT EXISTS idx_nest_brand_content_revisions_brand_created
  ON public.nest_brand_content_revisions (brand_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nest_brand_content_revisions_target
  ON public.nest_brand_content_revisions (brand_key, target_type, target_key, created_at DESC);

ALTER TABLE public.nest_brand_content_revisions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prevent_nest_brand_content_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'nest_brand_content_revisions is append-only';
END;
$$;

DROP TRIGGER IF EXISTS nest_brand_content_revisions_append_only
  ON public.nest_brand_content_revisions;
CREATE TRIGGER nest_brand_content_revisions_append_only
  BEFORE UPDATE OR DELETE ON public.nest_brand_content_revisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_nest_brand_content_revision_mutation();

REVOKE ALL ON TABLE public.nest_brand_content_revisions FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.nest_brand_content_revisions TO service_role;
REVOKE ALL ON FUNCTION public.prevent_nest_brand_content_revision_mutation()
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_nest_brand_content_revision_mutation()
  TO service_role;

COMMENT ON TABLE public.nest_brand_content_revisions IS
  'Append-only audit and restore history for store-managed Nest configuration and knowledge. Service role only.';

-- Align the existing knowledge tables with the explicit service-role boundary
-- used by chat config and trace data.
ALTER TABLE public.nest_brand_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nest_brand_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nest_brand_knowledge_items_deny_client_access
  ON public.nest_brand_knowledge_items;
CREATE POLICY nest_brand_knowledge_items_deny_client_access
  ON public.nest_brand_knowledge_items
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS nest_brand_knowledge_chunks_deny_client_access
  ON public.nest_brand_knowledge_chunks;
CREATE POLICY nest_brand_knowledge_chunks_deny_client_access
  ON public.nest_brand_knowledge_chunks
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.nest_brand_knowledge_items
  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.nest_brand_knowledge_chunks
  FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.nest_brand_knowledge_items TO service_role;
GRANT ALL ON TABLE public.nest_brand_knowledge_chunks TO service_role;
