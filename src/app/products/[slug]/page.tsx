import { permanentRedirect } from 'next/navigation'
import { resolveLegacyShopifyProduct } from '@/lib/seo/resolve-legacy-shopify-product'
import { ASHBURTON_STORE_SLUG } from '@/lib/seo/legacy-ashburton-domain'
import { absoluteUrl, productPath, productSlugId, storePath } from '@/lib/seo/site'

/**
 * Old Shopify URLs (`/products/{handle}`) from ashburtoncycles.com.au and
 * anywhere else Google still links. Permanently redirect to Yellow Jersey —
 * to the exact product when we can match it, otherwise to the storefront.
 * This must never 404 or 500: an unresolved/old link still has to land
 * somewhere useful so Google can follow the redirect and re-index it.
 */
export default async function LegacyShopifyProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Resolve outside the redirect call: permanentRedirect throws internally, so
  // it must stay out of the try/catch or we'd swallow the redirect itself.
  let target = storePath(ASHBURTON_STORE_SLUG)
  try {
    const product = await resolveLegacyShopifyProduct(slug)
    if (product) {
      target = productPath(
        productSlugId(product.id, product.display_name || product.description),
      )
    }
  } catch {
    // Fall back to the storefront on any lookup failure.
  }

  permanentRedirect(absoluteUrl(target))
}
