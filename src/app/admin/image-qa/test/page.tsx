'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

export default function ImageDiscoveryTestPage() {
  const [productId, setProductId] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLog(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(message);
  };

  const testDiscovery = async () => {
    if (!productId) {
      alert('Please enter a product ID');
      return;
    }

    setLoading(true);
    setLog([]);
    
    try {
      addLog('🔍 Step 1: Checking if product exists...');
      
      const supabase = createClient();
      const { data: product, error: productError } = await supabase
        .from('canonical_products')
        .select('id, normalized_name, upc, category, manufacturer')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        addLog(`❌ Product not found: ${productError?.message}`);
        setLoading(false);
        return;
      }

      addLog(`✅ Product found: ${product.normalized_name}`);
      addLog(`   UPC: ${product.upc || 'None'}`);
      addLog(`   Category: ${product.category || 'None'}`);
      addLog(`   Manufacturer: ${product.manufacturer || 'None'}`);

      addLog('');
      addLog('🚀 Step 2: Triggering image discovery...');

      const response = await fetch('/api/admin/images/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId: productId }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        addLog('✅ Discovery API call successful');
        addLog(`   Message: ${result.message}`);
        
        if (result.debug) {
          addLog('   Debug info:');
          addLog(`     - Queued: ${result.debug.queuedSuccessfully}`);
          addLog(`     - Processing started: ${result.debug.processingStarted}`);
        }
      } else {
        addLog(`❌ Discovery API call failed: ${result.error || 'Unknown error'}`);
        setLoading(false);
        return;
      }

      addLog('');
      addLog('⏳ Step 3: Waiting 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      addLog('');
      addLog('🔍 Step 4: Checking for new images...');

      const { data: images } = await supabase
        .from('product_images')
        .select('id, approval_status, created_at')
        .eq('canonical_product_id', productId)
        .order('created_at', { ascending: false });

      if (images && images.length > 0) {
        addLog(`✅ Found ${images.length} images:`);
        images.forEach((img, idx) => {
          addLog(`   ${idx + 1}. Status: ${img.approval_status}, Created: ${new Date(img.created_at).toLocaleString()}`);
        });
      } else {
        addLog('⚠️  No images found yet. This could mean:');
        addLog('   1. The edge function is still processing');
        addLog('   2. No images were found on the internet');
        addLog('   3. There was an error in the discovery process');
        addLog('');
        addLog('💡 Check the Supabase Edge Function logs:');
        addLog('   https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/functions');
      }

      addLog('');
      addLog('🔍 Step 5: Checking queue status...');

      const { data: queueItems } = await supabase
        .from('ai_image_discovery_queue')
        .select('*')
        .eq('canonical_product_id', productId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (queueItems && queueItems.length > 0) {
        const queueItem = queueItems[0];
        addLog(`✅ Queue item found:`);
        addLog(`   Status: ${queueItem.status}`);
        addLog(`   Images found: ${queueItem.images_found || 0}`);
        addLog(`   Images downloaded: ${queueItem.images_downloaded || 0}`);
        addLog(`   Attempts: ${queueItem.attempts}`);
        if (queueItem.error_message) {
          addLog(`   Error: ${queueItem.error_message}`);
        }
      } else {
        addLog('⚠️  No queue item found');
      }

    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
      addLog('');
      addLog('✅ Test complete!');
    }
  };

  const getFirstProduct = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('canonical_products')
      .select('id')
      .limit(1)
      .single();
    
    if (data) {
      setProductId(data.id);
      addLog(`Set product ID to: ${data.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-md border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Image Discovery Test</h1>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Canonical Product ID
              </label>
              <div className="flex gap-2">
                <Input
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="Enter product ID (UUID)"
                  className="rounded-md flex-1"
                />
                <Button
                  onClick={getFirstProduct}
                  variant="outline"
                  className="rounded-md"
                >
                  Get First Product
                </Button>
              </div>
            </div>

            <Button
              onClick={testDiscovery}
              disabled={loading || !productId}
              className="rounded-md w-full"
            >
              {loading ? 'Running Test...' : 'Test Image Discovery'}
            </Button>
          </div>

          {/* Log Output */}
          <div className="bg-gray-900 text-gray-100 rounded-md p-4 font-mono text-sm h-[500px] overflow-y-auto">
            {log.length === 0 ? (
              <div className="text-gray-500">
                Enter a product ID and click "Test Image Discovery" to begin...
              </div>
            ) : (
              log.map((line, idx) => (
                <div key={idx} className="mb-1">
                  {line}
                </div>
              ))
            )}
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-md">
            <h3 className="font-semibold text-blue-900 mb-2">How to use this test:</h3>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Click "Get First Product" to automatically fill in a product ID</li>
              <li>Or paste a product ID from your database</li>
              <li>Click "Test Image Discovery"</li>
              <li>Watch the logs to see what happens at each step</li>
              <li>If images appear, the system is working!</li>
              <li>If not, the logs will tell you where it failed</li>
            </ol>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => window.location.href = '/admin/image-qa'}
              variant="outline"
              className="rounded-md"
            >
              Go to Image QA
            </Button>
            <Button
              onClick={() => window.location.href = '/admin/image-qa/debug'}
              variant="outline"
              className="rounded-md"
            >
              View Diagnostics
            </Button>
            <Button
              onClick={() => window.open('https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/functions', '_blank')}
              variant="outline"
              className="rounded-md"
            >
              Edge Function Logs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}



