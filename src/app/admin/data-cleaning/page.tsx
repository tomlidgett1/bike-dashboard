"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { 
  RefreshCw, 
  Play, 
  Loader2, 
  Check, 
  X, 
  Clock, 
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Search,
  FileText,
  Sparkles
} from "lucide-react";

interface CanonicalProduct {
  id: string;
  normalized_name: string;
  display_name: string | null;
  upc: string | null;
  manufacturer: string | null;
  category: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  product_description: string | null;
  bike_surface: string | null;
  description_generated_at: string | null;
  product_count: number;
  created_at: string;
  updated_at: string;
  queueStatus: 'pending' | 'processing' | 'completed' | 'failed' | null;
}

interface Stats {
  total: number;
  withDescription: number;
  withoutDescription: number;
  queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function DataCleaningPage() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<CanonicalProduct[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [categories, setCategories] = useState<string[]>([]);
  
  // Filters
  const [filter, setFilter] = useState<'all' | 'with_description' | 'without_description'>('all');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const loadData = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        filter,
      });
      
      if (search) params.set('search', search);
      if (selectedCategory) params.set('category', selectedCategory);
      
      const response = await fetch(`/api/admin/data-cleaning?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load data');
      }
      
      const data = await response.json();
      
      setStats(data.stats);
      setProducts(data.products);
      setPagination(data.pagination);
      setCategories(data.categories || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, search, selectedCategory, pagination.limit]);
  
  // Load data on mount and when filters change
  useEffect(() => {
    loadData(1);
  }, [filter, selectedCategory]);
  
  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  
  const handleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  };
  
  const handleSelectProduct = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };
  
  const handleQueueSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setQueueing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/data-cleaning/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: Array.from(selectedIds) }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to queue products');
      }
      
      const data = await response.json();
      setResult({
        type: 'queue',
        message: `Queued ${data.queued} products for description generation`,
        skipped: data.skipped,
      });
      
      setSelectedIds(new Set());
      await loadData(pagination.page);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setQueueing(false);
    }
  };
  
  const handleQueueAll = async () => {
    setQueueing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/data-cleaning/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueAll: true }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to queue products');
      }
      
      const data = await response.json();
      setResult({
        type: 'queue',
        message: `Queued ${data.queued} products for description generation`,
      });
      
      await loadData(pagination.page);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setQueueing(false);
    }
  };
  
  const handleProcessQueue = async (limit = 5) => {
    setProcessing(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch('/api/admin/data-cleaning/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process queue');
      }
      
      const data = await response.json();
      setResult({
        type: 'process',
        ...data,
      });
      
      await loadData(pagination.page);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };
  
  const handleClearQueue = async (type: 'failed' | 'completed') => {
    try {
      await fetch('/api/admin/data-cleaning/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type === 'failed' ? 'clearFailed' : 'clearCompleted']: true }),
      });
      
      await loadData(pagination.page);
    } catch (err: any) {
      setError(err.message);
    }
  };
  
  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-blue-100 text-blue-800">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-green-100 text-green-800">
            <Check className="h-3 w-3" />
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-red-100 text-red-800">
            <X className="h-3 w-3" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };
  
  const coveragePercent = stats ? ((stats.withDescription / stats.total) * 100) : 0;
  
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Data Cleaning</h1>
          <p className="text-gray-600 mt-1">Generate AI-powered product descriptions for canonical products</p>
        </div>
        <Button 
          onClick={() => loadData(pagination.page)} 
          variant="outline"
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <Card className="rounded-md">
          <CardContent className="py-4">
            <p className="text-sm text-gray-600">Total Products</p>
            <p className="text-2xl font-bold">{stats?.total?.toLocaleString() ?? '-'}</p>
          </CardContent>
        </Card>
        
        <Card className="rounded-md">
          <CardContent className="py-4">
            <p className="text-sm text-gray-600">With Description</p>
            <p className="text-2xl font-bold text-green-600">{stats?.withDescription?.toLocaleString() ?? '-'}</p>
          </CardContent>
        </Card>
        
        <Card className="rounded-md">
          <CardContent className="py-4">
            <p className="text-sm text-gray-600">Without Description</p>
            <p className="text-2xl font-bold text-orange-600">{stats?.withoutDescription?.toLocaleString() ?? '-'}</p>
          </CardContent>
        </Card>
        
        <Card className="rounded-md">
          <CardContent className="py-4">
            <p className="text-sm text-gray-600">Coverage</p>
            <p className="text-2xl font-bold">{coveragePercent.toFixed(1)}%</p>
          </CardContent>
        </Card>
        
        <Card className="rounded-md">
          <CardContent className="py-4">
            <p className="text-sm text-gray-600">Queue Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{stats?.queue?.pending ?? 0}</p>
          </CardContent>
        </Card>
        
        <Card className="rounded-md">
          <CardContent className="py-4">
            <p className="text-sm text-gray-600">Queue Processing</p>
            <p className="text-2xl font-bold text-blue-600">{stats?.queue?.processing ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions Card */}
      <Card className="mb-6 rounded-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Queue Management
          </CardTitle>
          <CardDescription>
            Queue products for AI description generation or manually trigger processing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Button
              onClick={handleQueueSelected}
              disabled={selectedIds.size === 0 || queueing}
              variant="outline"
            >
              {queueing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Queue Selected ({selectedIds.size})
            </Button>
            
            <Button
              onClick={handleQueueAll}
              disabled={queueing || stats?.withoutDescription === 0}
              variant="outline"
            >
              Queue All Without Descriptions ({stats?.withoutDescription ?? 0})
            </Button>
            
            <div className="border-l border-gray-200 pl-4 flex gap-2">
              <Button
                onClick={() => handleProcessQueue(5)}
                disabled={processing}
              >
                {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Process Queue (5)
              </Button>
              
              <Button
                onClick={() => handleProcessQueue(20)}
                disabled={processing}
                variant="outline"
              >
                Process 20
              </Button>
            </div>
          </div>
          
          {(stats?.queue?.failed ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-600">{stats?.queue?.failed} failed items</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleClearQueue('failed')}
              >
                Clear Failed
              </Button>
            </div>
          )}
          
          {(stats?.queue?.completed ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-600">{stats?.queue?.completed} completed items</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleClearQueue('completed')}
              >
                Clear Completed
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results/Error Messages */}
      {error && (
        <Card className="mb-6 rounded-md bg-white border-red-200">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mb-6 rounded-md bg-white border-green-200">
          <CardContent className="py-4 flex items-start gap-3">
            <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">
                {result.type === 'queue' ? 'Queued Successfully' : 'Processing Complete'}
              </p>
              {result.message && <p className="text-green-700 text-sm">{result.message}</p>}
              {result.type === 'process' && (
                <p className="text-green-700 text-sm">
                  Processed: {result.processed}, Successful: {result.successful}, Failed: {result.failed}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-6 rounded-md">
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px] max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 rounded-md"
                />
              </div>
            </div>
            
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  filter === 'all'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  filter === 'without_description'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
                onClick={() => setFilter('without_description')}
              >
                No Description
              </button>
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  filter === 'with_description'
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70"
                )}
                onClick={() => setFilter('with_description')}
              >
                Has Description
              </button>
            </div>
            
            <Select 
              value={selectedCategory || "all"} 
              onValueChange={(val) => setSelectedCategory(val === "all" ? "" : val)}
            >
              <SelectTrigger className="w-[200px] rounded-md">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.filter(cat => cat && cat.trim() !== '').map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="rounded-md">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Canonical Products
            </CardTitle>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {pagination.total.toLocaleString()} products
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No products found
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <Checkbox
                          checked={selectedIds.size === products.length && products.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Links</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bike Surface</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Queue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedIds.has(product.id)}
                            onCheckedChange={() => handleSelectProduct(product.id)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-xs">
                            <p className="font-medium text-sm truncate">
                              {product.display_name || product.normalized_name}
                            </p>
                            {product.upc && (
                              <p className="text-xs text-gray-500">UPC: {product.upc}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {product.manufacturer || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {product.marketplace_category || product.category || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {product.product_count || 0}
                        </td>
                        <td className="px-4 py-3">
                          {product.bike_surface ? (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-blue-100 text-blue-800">
                              {product.bike_surface}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {product.product_description ? (
                            <div className="max-w-xs">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-green-100 text-green-800">
                                <Check className="h-3 w-3" />
                                Yes
                              </span>
                              <p className="text-xs text-gray-500 mt-1 truncate">
                                {product.product_description.substring(0, 50)}...
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600">
                              <X className="h-3 w-3" />
                              No
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(product.queueStatus)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="text-sm text-gray-600">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadData(pagination.page - 1)}
                    disabled={pagination.page === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadData(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

