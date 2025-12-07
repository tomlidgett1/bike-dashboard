'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, Instagram, CheckCircle2, XCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

interface Product {
  id: string;
  description: string;
  price: number;
  primary_image_url: string | null;
  brand: string | null;
  model: string | null;
  qoh: number;
  is_active: boolean;
  user_id: string;
  created_at: string;
}

interface PostStatus {
  status: 'idle' | 'generating' | 'posting' | 'success' | 'error';
  message?: string;
  imageUrl?: string;
  postUrl?: string;
}

export default function InstagramPostsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [postStatuses, setPostStatuses] = useState<Map<string, PostStatus>>(new Map());

  const supabase = createClient();

  // Fetch active products
  const fetchProducts = async (searchTerm: string = '') => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('products')
        .select('id, description, price, primary_image_url, brand, model, qoh, is_active, user_id, created_at')
        .eq('is_active', true)
        .gt('qoh', 0)
        .not('primary_image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (searchTerm) {
        query = query.or(`description.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('[Instagram Posts] Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleSearch = () => {
    fetchProducts(search);
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const handlePostToInstagram = async (productId: string) => {
    try {
      // Update status: generating image
      setPostStatuses(prev => new Map(prev).set(productId, {
        status: 'generating',
        message: 'Generating Instagram image...',
      }));

      // Step 1: Generate Instagram image
      const generateResponse = await fetch('/api/instagram/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });

      if (!generateResponse.ok) {
        const error = await generateResponse.json();
        throw new Error(error.error || 'Failed to generate image');
      }

      const { imageUrl } = await generateResponse.json();

      // Update status: posting
      setPostStatuses(prev => new Map(prev).set(productId, {
        status: 'posting',
        message: 'Posting to Instagram...',
        imageUrl,
      }));

      // Wait a moment for UI feedback
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 2: Post to Instagram
      const postResponse = await fetch('/api/instagram/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, imageUrl }),
      });

      if (!postResponse.ok) {
        const error = await postResponse.json();
        throw new Error(error.error || error.details || 'Failed to post to Instagram');
      }

      const { postUrl } = await postResponse.json();

      // Update status: success
      setPostStatuses(prev => new Map(prev).set(productId, {
        status: 'success',
        message: 'Successfully posted to Instagram!',
        imageUrl,
        postUrl,
      }));

      // Remove from selected after success
      setSelectedProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    } catch (error) {
      console.error('[Instagram Posts] Error posting:', error);
      setPostStatuses(prev => new Map(prev).set(productId, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to post',
      }));
    }
  };

  const selectedProductsList = Array.from(selectedProducts)
    .map(id => products.find(p => p.id === id))
    .filter(Boolean) as Product[];

  const getProductTitle = (product: Product) => {
    if (product.brand && product.model) {
      return `${product.brand} ${product.model}`;
    }
    return product.description.substring(0, 50);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Instagram className="h-6 w-6 text-pink-600" />
                Instagram Posts
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Select listings to post to Instagram with branded images
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Selected:</span>
              <span className="font-bold text-pink-600">{selectedProducts.size}</span>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by product name, brand, or model..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 rounded-md"
              />
            </div>
            <Button onClick={handleSearch} className="rounded-md">
              Search
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product Selection */}
          <div className="lg:col-span-2">
            <Card className="rounded-md">
              <CardHeader>
                <CardTitle className="text-lg">Available Listings</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">Loading products...</p>
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-600">No products found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {products.map((product) => {
                      const isSelected = selectedProducts.has(product.id);
                      const status = postStatuses.get(product.id);

                      return (
                        <div
                          key={product.id}
                          className={cn(
                            'flex items-center gap-4 p-3 bg-white border-2 rounded-md transition-all',
                            isSelected ? 'border-pink-500 bg-pink-50/50' : 'border-gray-200 hover:border-gray-300'
                          )}
                        >
                          {/* Image */}
                          <div className="relative h-16 w-16 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                            {product.primary_image_url ? (
                              <Image
                                src={product.primary_image_url}
                                alt={getProductTitle(product)}
                                fill
                                className="object-cover"
                                sizes="64px"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-gray-400">
                                No Image
                              </div>
                            )}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">
                              {getProductTitle(product)}
                            </h3>
                            <p className="text-sm text-gray-600 truncate">
                              {product.description.substring(0, 60)}
                            </p>
                            <p className="text-sm font-semibold text-gray-900 mt-1">
                              ${product.price.toFixed(2)}
                            </p>
                          </div>

                          {/* Action Button */}
                          <Button
                            onClick={() => toggleProductSelection(product.id)}
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            className="rounded-md"
                            disabled={status?.status === 'generating' || status?.status === 'posting'}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Selected Products / Ready to Post */}
          <div className="lg:col-span-1">
            <Card className="rounded-md sticky top-24">
              <CardHeader>
                <CardTitle className="text-lg">Ready to Post ({selectedProducts.size})</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedProductsList.length === 0 ? (
                  <div className="text-center py-8">
                    <Instagram className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-600">
                      Select products to post to Instagram
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedProductsList.map((product) => {
                      const status = postStatuses.get(product.id);

                      return (
                        <div
                          key={product.id}
                          className="p-3 bg-white border rounded-md"
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative h-12 w-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                              {product.primary_image_url && (
                                <Image
                                  src={product.primary_image_url}
                                  alt={getProductTitle(product)}
                                  fill
                                  className="object-cover"
                                  sizes="48px"
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm text-gray-900 truncate">
                                {getProductTitle(product)}
                              </h4>
                              <p className="text-xs text-gray-600">
                                ${product.price.toFixed(2)}
                              </p>
                            </div>
                          </div>

                          {/* Status or Action */}
                          <div className="mt-3">
                            {!status || status.status === 'idle' ? (
                              <Button
                                onClick={() => handlePostToInstagram(product.id)}
                                className="w-full rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                                size="sm"
                              >
                                <Instagram className="h-4 w-4 mr-2" />
                                Post to Instagram
                              </Button>
                            ) : status.status === 'generating' ? (
                              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-md">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Generating image...
                              </div>
                            ) : status.status === 'posting' ? (
                              <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 px-3 py-2 rounded-md">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Posting to Instagram...
                              </div>
                            ) : status.status === 'success' ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-md">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Posted successfully!
                                </div>
                                {status.postUrl && (
                                  <Button
                                    onClick={() => window.open(status.postUrl, '_blank')}
                                    variant="outline"
                                    size="sm"
                                    className="w-full rounded-md"
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    View on Instagram
                                  </Button>
                                )}
                              </div>
                            ) : status.status === 'error' ? (
                              <div className="space-y-2">
                                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
                                  <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                  <span className="text-xs">{status.message}</span>
                                </div>
                                <Button
                                  onClick={() => handlePostToInstagram(product.id)}
                                  variant="outline"
                                  size="sm"
                                  className="w-full rounded-md"
                                >
                                  Try Again
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="rounded-md mt-4">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900">n8n Setup</p>
                    <p className="text-xs">
                      Configure your n8n webhook in .env.local:
                    </p>
                    <ul className="text-xs list-disc list-inside space-y-0.5 ml-2">
                      <li>N8N_WEBHOOK_URL</li>
                    </ul>
                    <p className="text-xs mt-2 text-blue-600">
                      In n8n, map: URLIMAGE → Photo URL, caption → Caption
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

