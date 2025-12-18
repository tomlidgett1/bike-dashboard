'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Loader2, Sparkles, Star, ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface CuratedImage {
  id: string;
  url: string;
  cardUrl: string | null;
  isPrimary: boolean;
  angle: string;
  reason: string;
}

interface CurationResult {
  canonicalProductId: string;
  productName: string;
  candidatesFound: number;
  imagesSelected: number;
  images: CuratedImage[];
  aiReasoning: string;
}

interface CanonicalProduct {
  id: string;
  normalized_name: string;
  upc: string | null;
  category: string | null;
  manufacturer: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  image_count: number;
}

export default function CurateImagesPage() {
  const [productId, setProductId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingProduct, setFetchingProduct] = useState(false);
  const [product, setProduct] = useState<CanonicalProduct | null>(null);
  const [result, setResult] = useState<CurationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch product details when ID is entered
  const handleFetchProduct = async () => {
    if (!productId.trim()) {
      setError('Please enter a canonical product ID');
      return;
    }

    setFetchingProduct(true);
    setError(null);
    setProduct(null);
    setResult(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('canonical_products')
        .select('id, normalized_name, upc, category, manufacturer, marketplace_category, marketplace_subcategory, image_count')
        .eq('id', productId.trim())
        .single();

      if (fetchError || !data) {
        setError(`Product not found: ${fetchError?.message || 'Invalid ID'}`);
        return;
      }

      setProduct(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch product');
    } finally {
      setFetchingProduct(false);
    }
  };

  // Trigger image curation
  const handleCurate = async () => {
    if (!product) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/images/curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId: product.id }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || data.details || 'Curation failed');
        return;
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to curate images');
    } finally {
      setLoading(false);
    }
  };

  // Get angle label style
  const getAngleBadgeStyle = (angle: string) => {
    const styles: Record<string, string> = {
      front: 'bg-green-100 text-green-800',
      side: 'bg-blue-100 text-blue-800',
      back: 'bg-purple-100 text-purple-800',
      detail: 'bg-orange-100 text-orange-800',
      context: 'bg-gray-100 text-gray-800',
    };
    return styles[angle.toLowerCase()] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Curate Canonical Images</h1>
          <p className="text-sm text-gray-600 mt-1">
            Enter a canonical product ID to automatically discover and curate up to 5 diverse-angle images using AI
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Input Section */}
        <div className="bg-white rounded-md border border-gray-200 p-6 mb-6">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Canonical Product ID
          </label>
          <div className="flex gap-3">
            <Input
              placeholder="Enter UUID (e.g. 123e4567-e89b-12d3-a456-426614174000)"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetchProduct()}
              className="flex-1 rounded-md font-mono text-sm"
            />
            <Button
              onClick={handleFetchProduct}
              disabled={fetchingProduct || !productId.trim()}
              className="rounded-md"
            >
              {fetchingProduct ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                'Fetch Product'
              )}
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-white rounded-md border border-red-200 p-4 mb-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        )}

        {/* Product Info */}
        {product && (
          <div className="bg-white rounded-md border border-gray-200 p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{product.normalized_name}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 mt-2">
                  {product.upc && <span>UPC: {product.upc}</span>}
                  {product.marketplace_category && (
                    <span>
                      {product.marketplace_category}
                      {product.marketplace_subcategory && ` > ${product.marketplace_subcategory}`}
                    </span>
                  )}
                  {product.manufacturer && <span>Manufacturer: {product.manufacturer}</span>}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <ImageIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Current images: <span className="font-medium">{product.image_count}</span>
                  </span>
                </div>
              </div>
              <Button
                onClick={handleCurate}
                disabled={loading}
                className="rounded-md"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Curating... (~30s)
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Curate Images
                  </>
                )}
              </Button>
            </div>

            {loading && (
              <div className="mt-6 p-4 bg-blue-50 rounded-md">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">AI is curating images...</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      Searching Google Images, downloading candidates, analysing with GPT-4o Vision
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div className="bg-white rounded-md border border-gray-200 p-6">
            {/* Success Header */}
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
              <div className="p-2 bg-green-100 rounded-md">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  Successfully curated {result.imagesSelected} images
                </h3>
                <p className="text-sm text-gray-600">
                  Found {result.candidatesFound} candidates, selected {result.imagesSelected} with diverse angles
                </p>
              </div>
            </div>

            {/* AI Reasoning */}
            <div className="bg-gray-50 rounded-md p-3 mb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">AI Reasoning</p>
              <p className="text-sm text-gray-700">{result.aiReasoning}</p>
            </div>

            {/* Images Grid */}
            <div className="grid grid-cols-5 gap-4">
              {result.images.map((image) => (
                <div key={image.id} className="relative">
                  <div
                    className={cn(
                      'aspect-square rounded-md overflow-hidden border-2 transition-all',
                      image.isPrimary
                        ? 'border-yellow-400 ring-2 ring-yellow-200'
                        : 'border-gray-200'
                    )}
                  >
                    <img
                      src={image.cardUrl || image.url}
                      alt={image.angle}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Primary Star */}
                  {image.isPrimary && (
                    <div className="absolute -top-2 -right-2 p-1.5 bg-yellow-400 rounded-full shadow-lg">
                      <Star className="h-4 w-4 text-yellow-900 fill-yellow-900" />
                    </div>
                  )}

                  {/* Angle Badge */}
                  <div className="mt-2">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 text-xs font-medium rounded-md capitalize',
                        getAngleBadgeStyle(image.angle)
                      )}
                    >
                      {image.angle}
                    </span>
                    {image.isPrimary && (
                      <span className="ml-1 text-xs font-medium text-yellow-700">• Hero</span>
                    )}
                  </div>

                  {/* Reason Tooltip */}
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2" title={image.reason}>
                    {image.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!product && !error && (
          <div className="text-center py-16 bg-white rounded-md border border-gray-200">
            <ImageIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Enter a canonical product ID to get started</p>
            <p className="text-sm text-gray-500 mt-1">
              The AI will search for product images and select the best 5 diverse angles
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


