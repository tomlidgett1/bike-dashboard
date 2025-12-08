"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CategoriseAdminPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/admin/categorise-all-canonical');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const runCategorisation = async (processAll: boolean, limit?: number) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/categorise-all-canonical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processAll, limit }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to run categorisation');
      }

      const data = await response.json();
      setResult(data);
      
      // Reload stats
      await loadStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">AI Categorisation Admin</h1>

      {/* Stats Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current Statistics</CardTitle>
          <CardDescription>Overview of canonical product categorisation</CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Canonical Products</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Categorised</p>
                <p className="text-2xl font-bold text-green-600">{stats.categorised}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Uncategorised</p>
                <p className="text-2xl font-bold text-orange-600">{stats.uncategorised}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Coverage</p>
                <p className="text-2xl font-bold">{stats.percentageCategorised.toFixed(1)}%</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Loading...</p>
          )}
          <Button 
            onClick={loadStats} 
            variant="outline" 
            size="sm" 
            className="mt-4"
          >
            Refresh Stats
          </Button>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Run AI Categorisation</CardTitle>
          <CardDescription>
            Use GPT-4o-mini to automatically categorise canonical products
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Button
              onClick={() => runCategorisation(false, 10)}
              disabled={loading}
              variant="outline"
            >
              Test (10 products)
            </Button>
            
            <Button
              onClick={() => runCategorisation(false, 50)}
              disabled={loading}
              variant="outline"
            >
              Batch (50 products)
            </Button>

            <Button
              onClick={() => runCategorisation(false)}
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Categorise Uncategorised'}
            </Button>

            <Button
              onClick={() => runCategorisation(true)}
              disabled={loading}
              variant="destructive"
            >
              {loading ? 'Processing...' : 'Recategorise ALL'}
            </Button>
          </div>

          <p className="text-xs text-gray-500">
            • Test: Process 10 uncategorised products<br />
            • Batch: Process 50 uncategorised products<br />
            • Categorise Uncategorised: Process all products without categories<br />
            • Recategorise ALL: Reprocess ALL canonical products (overwrites existing)
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      {loading && (
        <Card className="mb-6">
          <CardContent className="py-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Processing... This may take a few minutes.</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-6 border-red-300 bg-red-50">
          <CardContent className="py-6">
            <h3 className="font-semibold text-red-900 mb-2">Error</h3>
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="mb-6 border-green-300 bg-green-50">
          <CardContent className="py-6">
            <h3 className="font-semibold text-green-900 mb-4">Results</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-green-700">Processed</p>
                <p className="text-2xl font-bold text-green-900">{result.processed}</p>
              </div>
              <div>
                <p className="text-sm text-green-700">Succeeded</p>
                <p className="text-2xl font-bold text-green-900">{result.succeeded}</p>
              </div>
              <div>
                <p className="text-sm text-red-700">Failed</p>
                <p className="text-2xl font-bold text-red-900">{result.failed}</p>
              </div>
              <div>
                <p className="text-sm text-green-700">Success Rate</p>
                <p className="text-2xl font-bold text-green-900">
                  {(result.successRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            
            {result.errors && result.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-red-900 mb-2">Errors:</p>
                <ul className="text-xs text-red-700 space-y-1">
                  {result.errors.map((err: string, idx: number) => (
                    <li key={idx}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

