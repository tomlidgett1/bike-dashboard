import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { StoreProfilePageClient } from './store-profile-page-client'
import {
  fetchCachedPublicStoreHomepageProfile,
  resolveStoreUserId,
} from '@/lib/marketplace/public-store-profile'
import { JsonLd } from '@/components/seo/json-ld'
import { bikeStoreSchema, breadcrumbSchema, extractLocality } from '@/lib/seo/structured-data'
import { SITE_NAME, absoluteUrl, storePath, storeUrl } from '@/lib/seo/site'
import type { StoreProfile } from '@/lib/types/store'

export const revalidate = 60

function buildStoreDescription(store: StoreProfile, locality: string | null): string {
  const bio = store.description?.trim()
  if (bio && bio.length >= 40) return bio.slice(0, 200)

  const where = locality ? ` in ${locality}` : ''
  const brandNames = (store.brands ?? []).map((b) => b.name).filter(Boolean).slice(0, 4)
  const brandBit = brandNames.length ? ` Stockists of ${brandNames.join(', ')}.` : ''
  const serviceBit = (store.services ?? []).length ? ' Bike servicing and repairs available.' : ''
  return `Shop bikes, parts and accessories from ${store.store_name}${where} on Yellow Jersey.${brandBit}${serviceBit} Delivery or local pickup.`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeId: string }>
}): Promise<Metadata> {
  const { storeId: param } = await params
  const userId = param ? await resolveStoreUserId(param) : null
  const store = userId ? await fetchCachedPublicStoreHomepageProfile(userId) : null

  if (!store) {
    return { title: 'Bike shop', robots: { index: false, follow: true } }
  }

  const canonicalId = store.slug ?? userId!
  const locality = extractLocality(store.address)
  const title = locality
    ? `${store.store_name} — Bike shop in ${locality}`
    : `${store.store_name} — Bike shop`
  const description = buildStoreDescription(store, locality)
  const image = store.cover_image_url || store.logo_url || undefined

  return {
    title,
    description,
    alternates: { canonical: storePath(canonicalId) },
    openGraph: {
      type: 'website',
      title: `${title} · ${SITE_NAME}`,
      description,
      url: storeUrl(canonicalId),
      images: image ? [{ url: image, alt: store.store_name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} · ${SITE_NAME}`,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function StoreProfilePage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId: param } = await params
  const userId = param ? await resolveStoreUserId(param) : null
  const initialStore = userId ? await fetchCachedPublicStoreHomepageProfile(userId) : null

  // Canonicalise to the slug URL: a hit via the raw UUID permanently redirects
  // to /marketplace/store/{slug} so links and crawl budget consolidate.
  if (initialStore?.slug && param !== initialStore.slug) {
    permanentRedirect(storePath(initialStore.slug))
  }

  const canonicalId = initialStore?.slug ?? userId ?? param

  return (
    <>
      {initialStore ? (
        <JsonLd
          data={[
            bikeStoreSchema(initialStore, storeUrl(canonicalId)),
            breadcrumbSchema([
              { name: 'Marketplace', url: absoluteUrl('/marketplace') },
              { name: initialStore.store_name, url: storeUrl(canonicalId) },
            ]),
          ]}
        />
      ) : null}
      {/* The client + its APIs are keyed by user_id (UUID), so always pass the
          resolved id even when the URL is a slug. */}
      <StoreProfilePageClient storeId={userId ?? param} initialStore={initialStore} />
    </>
  )
}
