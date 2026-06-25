import type { SupabaseClient } from '@supabase/supabase-js';
import type { SpecialsConfig } from '@/lib/types/specials';

/** Mirrors the column defaults in the store_specials_config migration. */
export const DEFAULT_SPECIALS_CONFIG: Omit<SpecialsConfig, 'user_id'> = {
  is_enabled: false,
  cadence: 'weekly',
  rotation_hour: 3,
  rotation_weekday: 0,
  timezone: 'Australia/Melbourne',
  strategy: 'random',
  selection_mode: 'auto',
  products_per_cycle: 5,
  category_count: 5,
  min_discount_percent: 10,
  max_discount_percent: 50,
  min_margin_floor_percent: 15,
  discount_aggressiveness: 0.5,
  stale_days_threshold: 90,
  min_cooldown_cycles: 4,
  ai_enabled: true,
  carousel_title: "Today's specials",
  carousel_subtitle: null,
  carousel_category_id: null,
  last_rotated_at: null,
};

export function withConfigDefaults(
  userId: string,
  row: Partial<SpecialsConfig> | null,
): SpecialsConfig {
  return { user_id: userId, ...DEFAULT_SPECIALS_CONFIG, ...(row ?? {}) };
}

/** Load a store's specials config, returning defaults when no row exists yet. */
export async function loadSpecialsConfig(
  supabase: SupabaseClient,
  userId: string,
): Promise<SpecialsConfig> {
  const { data, error } = await supabase
    .from('store_specials_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[specials/config] load failed:', error.message);
  }
  return withConfigDefaults(userId, data as Partial<SpecialsConfig> | null);
}

/**
 * Ensure the storefront carousel anchor exists for this store.
 *
 * The specials carousel renders through the normal carousel system: a single
 * store_categories row (source='specials') so it is reorderable on the
 * Carousels page and positionable on the homepage. Its product_ids are synced
 * to the active cycle on rotation. Returns the carousel id.
 */
export async function ensureSpecialsCarousel(
  supabase: SupabaseClient,
  userId: string,
  config: SpecialsConfig,
): Promise<string | null> {
  // Existing anchor still valid?
  if (config.carousel_category_id) {
    const { data } = await supabase
      .from('store_categories')
      .select('id')
      .eq('id', config.carousel_category_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      // Keep the title in sync with config.
      await supabase
        .from('store_categories')
        .update({
          name: config.carousel_title,
          subtitle: config.carousel_subtitle,
        })
        .eq('id', config.carousel_category_id)
        .eq('user_id', userId);
      return config.carousel_category_id;
    }
  }

  // Reuse a stray specials row if one exists (e.g. config row was reset).
  const { data: existing } = await supabase
    .from('store_categories')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'specials')
    .limit(1)
    .maybeSingle();

  let carouselId = (existing as { id: string } | null)?.id ?? null;

  if (!carouselId) {
    const { data: maxOrder } = await supabase
      .from('store_categories')
      .select('display_order')
      .eq('user_id', userId)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const displayOrder = ((maxOrder as { display_order: number } | null)?.display_order ?? -1) + 1;

    const { data: created, error } = await supabase
      .from('store_categories')
      .insert({
        user_id: userId,
        name: config.carousel_title,
        subtitle: config.carousel_subtitle,
        source: 'specials',
        product_ids: [],
        display_order: displayOrder,
        is_active: true,
        store_page: 'products',
        carousel_size: 'normal',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[specials/config] failed to create carousel anchor:', error.message);
      return null;
    }
    carouselId = (created as { id: string }).id;
  }

  if (carouselId && carouselId !== config.carousel_category_id) {
    await supabase
      .from('store_specials_config')
      .update({ carousel_category_id: carouselId })
      .eq('user_id', userId);
  }
  return carouselId;
}
