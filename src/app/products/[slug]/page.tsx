import { permanentRedirect } from 'next/navigation'
import { resolveLegacyShopifyProduct } from '@/lib/seo/resolve-legacy-shopify-product'
import { absoluteUrl, productPath, productSlugId } from '@/lib/seo/site'

/**
 * Old Shopify URLs (`/products/{handle}`) from ashburtoncycles.com.au and
 * anywhere else Google still links. Permanently redirect to Yellow Jersey.
 */
export default async function LegacyShopifyProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await resolveLegacyShopifyProduct(slug)

  if (!product) {
    permanentRedirect(absoluteUrl('/marketplace'))
  }

  permanentRedirect(
    absoluteUrl(
      productPath(
        productSlugId(product.id, product.display_name || product.description),
      ),
    ),
  )
}
