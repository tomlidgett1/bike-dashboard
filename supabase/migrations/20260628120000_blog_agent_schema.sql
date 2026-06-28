-- Autonomous cycling blog: posts + agent run history

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug                  text        NOT NULL UNIQUE,
  title                 text        NOT NULL,
  excerpt               text        NOT NULL,
  meta_description      text,
  topic                 text,
  body                  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  hero_image_url        text,
  hero_image_credit     text,
  hero_image_caption    text,
  tags                  text[]      NOT NULL DEFAULT '{}',
  reading_time_minutes  integer     NOT NULL DEFAULT 5,
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'published', 'archived')),
  published_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blog_agent_runs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  status          text        NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running', 'completed', 'error')),
  trigger_source  text        NOT NULL DEFAULT 'manual'
                              CHECK (trigger_source IN ('cron', 'manual')),
  custom_topic    text,
  resolved_topic  text,
  post_id         uuid        REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  error_message   text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  duration_ms     integer
);

CREATE INDEX IF NOT EXISTS blog_posts_status_published_idx
  ON public.blog_posts (status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS blog_posts_slug_idx
  ON public.blog_posts (slug);

CREATE INDEX IF NOT EXISTS blog_agent_runs_started_idx
  ON public.blog_agent_runs (started_at DESC);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_agent_runs ENABLE ROW LEVEL SECURITY;

-- Public read for published posts
CREATE POLICY "Anyone can read published blog posts"
  ON public.blog_posts FOR SELECT
  USING (status = 'published');

-- Service role handles writes; no public write policies

CREATE OR REPLACE FUNCTION public.blog_posts_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.blog_posts_set_updated_at();
