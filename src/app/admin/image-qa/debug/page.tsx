'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export default function ImageQADebugPage() {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    setLoading(true);
    const supabase = createClient();
    const results: any = {};

    try {
      // 1. Count canonical products
      const { data: products, error: productsError } = await supabase
        .from('canonical_products')
        .select('id', { count: 'exact', head: true });
      
      results.totalProducts = products === null ? 0 : (productsError ? 'Error' : 'Unknown');
      results.productsError = productsError?.message;

      // 2. Count product images by status
      const { data: allImages } = await supabase
        .from('product_images')
        .select('id, approval_status');
      
      results.totalImages = allImages?.length || 0;
      results.pendingImages = allImages?.filter(img => img.approval_status === 'pending').length || 0;
      results.approvedImages = allImages?.filter(img => img.approval_status === 'approved').length || 0;
      results.rejectedImages = allImages?.filter(img => img.approval_status === 'rejected').length || 0;

      // 3. Check approval_status column exists
      let columnCheck = null;
      try {
        const { data } = await supabase.rpc('check_column_exists' as any);
        columnCheck = data;
      } catch {
        // RPC doesn't exist, that's ok
      }
      
      // 4. Sample products with images
      const { data: sampleProducts } = await supabase
        .from('canonical_products')
        .select(`
          id,
          normalized_name,
          upc,
          product_images (
            id,
            approval_status
          )
        `)
        .limit(5);
      
      results.sampleProducts = sampleProducts;

      // 5. Test API endpoint
      try {
        const apiResponse = await fetch('/api/admin/images/products?limit=5');
        const apiResult = await apiResponse.json();
        results.apiWorking = apiResponse.ok;
        results.apiResult = apiResult;
      } catch (apiError: any) {
        results.apiWorking = false;
        results.apiError = apiError.message;
      }

    } catch (error: any) {
      results.generalError = error.message;
    }

    setDiagnostics(results);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-md border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Image QA System Diagnostics</h1>
            <Button onClick={runDiagnostics} disabled={loading} className="rounded-md">
              {loading ? 'Running...' : 'Refresh'}
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"></div>
              <p className="text-gray-600 mt-4">Running diagnostics...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Database Stats */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Database</h2>
                <div className="bg-gray-50 rounded-md p-4 space-y-2 font-mono text-sm">
                  <div className="flex justify-between">
                    <span>Total Canonical Products:</span>
                    <span className="font-bold">{diagnostics?.totalProducts || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Product Images:</span>
                    <span className="font-bold">{diagnostics?.totalImages || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>- Pending:</span>
                    <span className="font-bold text-orange-600">{diagnostics?.pendingImages || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>- Approved:</span>
                    <span className="font-bold text-green-600">{diagnostics?.approvedImages || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>- Rejected:</span>
                    <span className="font-bold text-red-600">{diagnostics?.rejectedImages || 0}</span>
                  </div>
                </div>
              </div>

              {/* API Status */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">API Status</h2>
                <div className="bg-gray-50 rounded-md p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-block w-3 h-3 rounded-full ${diagnostics?.apiWorking ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span className="font-medium">
                      {diagnostics?.apiWorking ? 'API Working' : 'API Error'}
                    </span>
                  </div>
                  {diagnostics?.apiError && (
                    <div className="text-red-600 text-sm mt-2">
                      Error: {diagnostics.apiError}
                    </div>
                  )}
                </div>
              </div>

              {/* Sample Products */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Sample Products</h2>
                <div className="bg-gray-50 rounded-md p-4">
                  {diagnostics?.sampleProducts && diagnostics.sampleProducts.length > 0 ? (
                    <div className="space-y-2">
                      {diagnostics.sampleProducts.map((product: any) => (
                        <div key={product.id} className="border-b border-gray-200 pb-2">
                          <div className="font-medium">{product.normalized_name}</div>
                          <div className="text-sm text-gray-600">
                            UPC: {product.upc || 'None'} | Images: {product.product_images?.length || 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-600">No products found</div>
                  )}
                </div>
              </div>

              {/* Raw Data */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Raw Diagnostic Data</h2>
                <pre className="bg-gray-900 text-gray-100 rounded-md p-4 overflow-x-auto text-xs">
                  {JSON.stringify(diagnostics, null, 2)}
                </pre>
              </div>

              {/* Quick Actions */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h2>
                <div className="flex gap-2">
                  <Button
                    onClick={() => window.location.href = '/admin/image-qa'}
                    className="rounded-md"
                  >
                    Go to Image QA
                  </Button>
                  <Button
                    onClick={() => window.open('https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/editor', '_blank')}
                    variant="outline"
                    className="rounded-md"
                  >
                    Open Supabase SQL Editor
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

