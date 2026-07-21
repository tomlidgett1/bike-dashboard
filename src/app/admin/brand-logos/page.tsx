// Brand logo curation — admin-only approval workbench for Yellow Jersey product brands.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin-auth';
import { BrandLogosAdminPanel } from './brand-logos-admin-panel';

export const dynamic = 'force-dynamic';

export default async function BrandLogosAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Brand logo curation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review Lightspeed brands for Ashburton Cycles, ranked by units in stock. Approve, reject
            candidates, or skip. Only approved logos appear on product pages (top-right of the breadcrumb).
          </p>
        </div>
        <BrandLogosAdminPanel />
      </div>
    </div>
  );
}
