import { StoreProfilePageClient } from './store-profile-page-client'
import { fetchCachedPublicStoreHomepageProfile } from '@/lib/marketplace/public-store-profile'

export const revalidate = 60

export default async function StoreProfilePage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params
  const initialStore = storeId ? await fetchCachedPublicStoreHomepageProfile(storeId) : null

  return (
    <StoreProfilePageClient
      storeId={storeId}
      initialStore={initialStore}
    />
  )
}
