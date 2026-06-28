export interface BlogImage {
  url: string;
  credit: string;
  caption?: string;
}

export interface BlogSection {
  type: 'paragraph' | 'heading' | 'subheading' | 'image' | 'quote' | 'list';
  content?: string;
  items?: string[];
  image?: BlogImage;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  meta_description: string | null;
  topic: string | null;
  body: BlogSection[];
  hero_image_url: string | null;
  hero_image_credit: string | null;
  hero_image_caption: string | null;
  tags: string[];
  reading_time_minutes: number;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogAgentRun {
  id: string;
  status: 'running' | 'completed' | 'error';
  trigger_source: 'cron' | 'manual';
  custom_topic: string | null;
  resolved_topic: string | null;
  post_id: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface GeneratedBlogPost {
  title: string;
  excerpt: string;
  meta_description: string;
  topic: string;
  reading_time_minutes: number;
  tags: string[];
  hero_image: BlogImage;
  sections: BlogSection[];
}
