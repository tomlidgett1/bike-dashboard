import type { SupabaseClient } from '@supabase/supabase-js';

export interface AutoAssignProduct {
  id: string;
  display_name: string | null;
  description: string;
  category_name: string | null;
  lightspeed_category_id: string | null;
  manufacturer_name: string | null;
  uber_delivery_enabled: boolean | null;
}

export interface AutoAssignCarousel {
  id: string;
  name: string;
  source: string;
  lightspeed_category_id: string | null;
  brand_name: string | null;
  product_ids: string[];
  display_order: number;
}

export interface AutoAssignProductPreview {
  id: string;
  name: string;
}

export type AutoAssignAction =
  | {
      type: 'create';
      name: string;
      source: 'lightspeed' | 'brand' | 'custom';
      lightspeed_category_id?: string;
      brand_name?: string;
      product_ids: string[];
      product_count: number;
      products: AutoAssignProductPreview[];
    }
  | {
      type: 'update';
      carousel_id: string;
      carousel_name: string;
      source: string;
      add_product_ids: string[];
      product_count: number;
      products: AutoAssignProductPreview[];
    };

/** Editable review row shown in the approval dialog. */
export interface AutoAssignReviewDraft {
  id: string;
  approved: boolean;
  name: string;
  action: AutoAssignAction;
  products: AutoAssignProductPreview[];
  selectedProductIds: string[];
}

export interface AutoAssignProposal {
  uncategorised_count: number;
  total_products: number;
  carousel_count: number;
  actions: AutoAssignAction[];
}

const UNCATEGORISED_LABELS = new Set(['uncategorised', 'uncategorized', 'other']);

function productLabel(p: AutoAssignProduct): string {
  return (p.display_name || p.description || 'Product').trim();
}

function mapProducts(products: AutoAssignProduct[]): AutoAssignProductPreview[] {
  return products.map((p) => ({ id: p.id, name: productLabel(p) }));
}

/** Custom carousels and add-to-existing use explicit product picks. */
export function actionAllowsProductPick(action: AutoAssignAction): boolean {
  if (action.type === 'update') return true;
  return action.source === 'custom';
}

export function getDefaultSelectedProductIds(action: AutoAssignAction): string[] {
  if (action.type === 'update') return [...action.add_product_ids];
  if (action.source === 'brand') return action.products.map((p) => p.id);
  return [...action.product_ids];
}

export function createReviewDrafts(actions: AutoAssignAction[]): AutoAssignReviewDraft[] {
  return actions.map((action, index) => ({
    id:
      action.type === 'update'
        ? `update-${action.carousel_id}`
        : `create-${action.source}-${index}-${action.name}`,
    approved: true,
    name: action.type === 'create' ? action.name : action.carousel_name,
    action,
    products: action.products,
    selectedProductIds: getDefaultSelectedProductIds(action),
  }));
}

export function draftToApprovedAction(draft: AutoAssignReviewDraft): AutoAssignAction | null {
  if (!draft.approved) return null;

  const name = draft.name.trim();
  const selected = draft.selectedProductIds;
  const selectedProducts = draft.products.filter((p) => selected.includes(p.id));

  if (draft.action.type === 'update') {
    if (selected.length === 0) return null;
    return {
      ...draft.action,
      carousel_name: name || draft.action.carousel_name,
      add_product_ids: selected,
      product_count: selected.length,
      products: selectedProducts,
    };
  }

  if (draft.action.source === 'brand') {
    return {
      ...draft.action,
      name: name || draft.action.name,
      product_ids: [],
      product_count: selected.length,
      products: selectedProducts,
    };
  }

  if (selected.length === 0) return null;

  return {
    ...draft.action,
    name: name || draft.action.name,
    product_ids: selected,
    product_count: selected.length,
    products: selectedProducts,
  };
}

export function isProductInCarousel(
  product: AutoAssignProduct,
  carousel: AutoAssignCarousel
): boolean {
  if (carousel.source === 'lightspeed' && carousel.lightspeed_category_id) {
    return product.lightspeed_category_id === carousel.lightspeed_category_id;
  }
  if (carousel.source === 'brand' && carousel.brand_name) {
    return (product.manufacturer_name ?? '').toLowerCase() === carousel.brand_name.toLowerCase();
  }
  if (carousel.source === 'uber') {
    return product.uber_delivery_enabled === true;
  }
  if (carousel.source === 'custom') {
    return (carousel.product_ids ?? []).includes(product.id);
  }
  return false;
}

function getUncategorisedProducts(
  products: AutoAssignProduct[],
  carousels: AutoAssignCarousel[]
): AutoAssignProduct[] {
  return products.filter(
    (product) => !carousels.some((carousel) => isProductInCarousel(product, carousel))
  );
}

interface ProductGroup {
  key: string;
  name: string;
  kind: 'lightspeed' | 'brand' | 'category' | 'other';
  lightspeed_category_id?: string;
  brand_name?: string;
  products: AutoAssignProduct[];
}

function groupUncategorisedProducts(products: AutoAssignProduct[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();

  for (const product of products) {
    let group: ProductGroup;

    if (product.lightspeed_category_id) {
      const key = `ls:${product.lightspeed_category_id}`;
      group = map.get(key) ?? {
        key,
        name: (product.category_name ?? 'Lightspeed category').trim() || 'Lightspeed category',
        kind: 'lightspeed',
        lightspeed_category_id: product.lightspeed_category_id,
        products: [],
      };
    } else if (
      product.category_name &&
      !UNCATEGORISED_LABELS.has(product.category_name.toLowerCase())
    ) {
      const key = `cat:${product.category_name.toLowerCase()}`;
      group = map.get(key) ?? {
        key,
        name: product.category_name.trim(),
        kind: 'category',
        products: [],
      };
    } else if (product.manufacturer_name?.trim()) {
      const brand = product.manufacturer_name.trim();
      const key = `brand:${brand.toLowerCase()}`;
      group = map.get(key) ?? {
        key,
        name: brand,
        kind: 'brand',
        brand_name: brand,
        products: [],
      };
    } else {
      group = map.get('other') ?? {
        key: 'other',
        name: 'Other',
        kind: 'other',
        products: [],
      };
    }

    group.products.push(product);
    map.set(group.key, group);
  }

  return Array.from(map.values()).sort((a, b) => b.products.length - a.products.length);
}

function findCustomCarouselByName(
  carousels: AutoAssignCarousel[],
  name: string
): AutoAssignCarousel | undefined {
  const target = name.toLowerCase();
  return carousels.find(
    (c) => c.source === 'custom' && c.name.toLowerCase() === target
  );
}

function findLightspeedCarousel(
  carousels: AutoAssignCarousel[],
  lightspeedCategoryId: string
): AutoAssignCarousel | undefined {
  return carousels.find(
    (c) => c.source === 'lightspeed' && c.lightspeed_category_id === lightspeedCategoryId
  );
}

function findBrandCarousel(
  carousels: AutoAssignCarousel[],
  brandName: string
): AutoAssignCarousel | undefined {
  const target = brandName.toLowerCase();
  return carousels.find(
    (c) => c.source === 'brand' && (c.brand_name ?? '').toLowerCase() === target
  );
}

function mergeActionUpdate(
  actions: AutoAssignAction[],
  carousel: AutoAssignCarousel,
  addIds: string[],
  products: AutoAssignProduct[]
): void {
  if (addIds.length === 0) return;

  const existing = actions.find(
    (a): a is Extract<AutoAssignAction, { type: 'update' }> =>
      a.type === 'update' && a.carousel_id === carousel.id
  );

  if (existing) {
    const merged = new Set([...existing.add_product_ids, ...addIds]);
    existing.add_product_ids = Array.from(merged);
    existing.product_count = existing.add_product_ids.length;
    existing.products = mapProducts(products.filter((p) => merged.has(p.id)));
    return;
  }

  const matched = products.filter((p) => addIds.includes(p.id));
  actions.push({
    type: 'update',
    carousel_id: carousel.id,
    carousel_name: carousel.name,
    source: carousel.source,
    add_product_ids: addIds,
    product_count: addIds.length,
    products: mapProducts(matched),
  });
}

function mergeActionCreate(
  actions: AutoAssignAction[],
  draft: Extract<AutoAssignAction, { type: 'create' }>
): void {
  const existing = actions.find(
    (a): a is Extract<AutoAssignAction, { type: 'create' }> =>
      a.type === 'create' &&
      a.source === draft.source &&
      a.name.toLowerCase() === draft.name.toLowerCase() &&
      (draft.source !== 'lightspeed' || a.lightspeed_category_id === draft.lightspeed_category_id) &&
      (draft.source !== 'brand' || a.brand_name?.toLowerCase() === draft.brand_name?.toLowerCase())
  );

  if (existing) {
    const merged = new Set([...existing.product_ids, ...draft.product_ids]);
    existing.product_ids = Array.from(merged);
    existing.product_count = existing.product_ids.length;
    existing.products = [
      ...existing.products,
      ...draft.products.filter((p) => !existing.products.some((e) => e.id === p.id)),
    ];
    return;
  }

  actions.push(draft);
}

export function buildAutoAssignProposal(
  products: AutoAssignProduct[],
  carousels: AutoAssignCarousel[]
): AutoAssignProposal {
  const uncategorised = getUncategorisedProducts(products, carousels);
  const groups = groupUncategorisedProducts(uncategorised);
  const actions: AutoAssignAction[] = [];

  for (const group of groups) {
    const productIds = group.products.map((p) => p.id);

    if (group.kind === 'lightspeed' && group.lightspeed_category_id) {
      const existing = findLightspeedCarousel(carousels, group.lightspeed_category_id);
      if (existing) {
        // Dynamic match — should not happen; refresh is a no-op for assignment.
        continue;
      }
      mergeActionCreate(actions, {
        type: 'create',
        name: group.name,
        source: 'lightspeed',
        lightspeed_category_id: group.lightspeed_category_id,
        product_ids: productIds,
        product_count: productIds.length,
        products: mapProducts(group.products),
      });
      continue;
    }

    if (group.kind === 'brand' && group.brand_name) {
      const existing = findBrandCarousel(carousels, group.brand_name);
      if (existing) {
        continue;
      }
      mergeActionCreate(actions, {
        type: 'create',
        name: group.name,
        source: 'brand',
        brand_name: group.brand_name,
        product_ids: [],
        product_count: productIds.length,
        products: mapProducts(group.products),
      });
      continue;
    }

    const customMatch = findCustomCarouselByName(carousels, group.name);
    if (customMatch) {
      const missingIds = productIds.filter((id) => !(customMatch.product_ids ?? []).includes(id));
      mergeActionUpdate(actions, customMatch, missingIds, group.products);
      continue;
    }

    mergeActionCreate(actions, {
      type: 'create',
      name: group.name,
      source: 'custom',
      product_ids: productIds,
      product_count: productIds.length,
      products: mapProducts(group.products),
    });
  }

  return {
    uncategorised_count: uncategorised.length,
    total_products: products.length,
    carousel_count: carousels.length,
    actions,
  };
}

/** Only marketplace-visible products (approved images, active listing, stock rules). */
export async function fetchAutoAssignContext(
  supabase: SupabaseClient,
  userId: string
): Promise<{ products: AutoAssignProduct[]; carousels: AutoAssignCarousel[] }> {
  const [productsResult, carouselsResult] = await Promise.all([
    supabase
      .from('marketplace_ready_products')
      .select(
        'id, display_name, description, category_name, lightspeed_category_id, manufacturer_name, uber_delivery_enabled'
      )
      .eq('user_id', userId),
    supabase
      .from('store_categories')
      .select('id, name, source, lightspeed_category_id, brand_name, product_ids, display_order')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('source', 'display_override')
      .order('display_order', { ascending: true }),
  ]);

  return {
    products: (productsResult.data ?? []) as AutoAssignProduct[],
    carousels: (carouselsResult.data ?? []).map((c) => ({
      ...c,
      product_ids: Array.isArray(c.product_ids) ? c.product_ids : [],
    })) as AutoAssignCarousel[],
  };
}

export async function applyAutoAssignActions(
  supabase: SupabaseClient,
  userId: string,
  actions: AutoAssignAction[],
  carousels: AutoAssignCarousel[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  const carouselById = new Map(carousels.map((c) => [c.id, c]));
  let nextDisplayOrder =
    carousels.reduce((max, c) => Math.max(max, c.display_order ?? 0), -1) + 1;

  for (const action of actions) {
    if (action.type === 'create') {
      const { error } = await supabase.from('store_categories').insert({
        user_id: userId,
        name: action.name,
        source: action.source,
        lightspeed_category_id: action.lightspeed_category_id ?? null,
        brand_name: action.brand_name ?? null,
        product_ids: action.product_ids,
        display_order: nextDisplayOrder++,
        is_active: true,
      });
      if (error) throw error;
      created += 1;
      continue;
    }

    const carousel = carouselById.get(action.carousel_id);
    if (!carousel) continue;

    const mergedIds = Array.from(
      new Set([...(carousel.product_ids ?? []), ...action.add_product_ids])
    );

    const updatePayload: { product_ids: string[]; name?: string } = {
      product_ids: mergedIds,
    };
    if (action.carousel_name.trim() && action.carousel_name !== carousel.name) {
      updatePayload.name = action.carousel_name.trim();
    }

    const { error } = await supabase
      .from('store_categories')
      .update(updatePayload)
      .eq('id', action.carousel_id)
      .eq('user_id', userId);

    if (error) throw error;
    carousel.product_ids = mergedIds;
    updated += 1;
  }

  return { created, updated };
}
