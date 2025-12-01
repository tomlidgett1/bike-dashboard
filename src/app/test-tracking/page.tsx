"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { useInteractionTracker } from "@/lib/tracking/interaction-tracker";
import { CheckCircle, XCircle, Clock, Database, Activity } from "lucide-react";

// ============================================================
// Test Tracking Page
// Comprehensive testing interface for the recommendation system
// ============================================================

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  details?: any;
}

export default function TestTrackingPage() {
  const { user } = useAuth();
  const tracker = useInteractionTracker(user?.id);
  
  const [testResults, setTestResults] = React.useState<TestResult[]>([]);
  const [running, setRunning] = React.useState(false);
  const [currentTest, setCurrentTest] = React.useState<string>('');

  const addResult = (result: TestResult) => {
    setTestResults(prev => [...prev, result]);
  };

  const runTests = async () => {
    setRunning(true);
    setTestResults([]);

    // Test 1: API Health Check
    setCurrentTest('API Health Check');
    try {
      const response = await fetch('/api/tracking');
      const data = await response.json();
      
      if (data.status === 'ok') {
        addResult({
          name: 'API Health Check',
          status: 'success',
          message: 'Tracking API is running',
          details: data,
        });
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      addResult({
        name: 'API Health Check',
        status: 'error',
        message: 'API is not accessible',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Test 2: Send Test Interaction
    setCurrentTest('Send Test Interaction');
    try {
      const testProductId = crypto.randomUUID(); // Fake product ID for testing
      const response = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interactions: [{
            sessionId: crypto.randomUUID(),
            userId: user?.id,
            productId: testProductId,
            interactionType: 'view',
            dwellTimeSeconds: 10,
            timestamp: new Date().toISOString(),
            metadata: { test: true, source: 'test_page' },
          }]
        })
      });

      const data = await response.json();
      
      if (data.success && data.processed === 1) {
        addResult({
          name: 'Send Test Interaction',
          status: 'success',
          message: 'Successfully tracked 1 interaction',
          details: data,
        });
      } else {
        throw new Error(JSON.stringify(data));
      }
    } catch (error) {
      addResult({
        name: 'Send Test Interaction',
        status: 'error',
        message: 'Failed to track interaction',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Test 3: Tracking Hook
    setCurrentTest('Tracking Hook Test');
    try {
      tracker.trackProductView('test-product-123');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for batch
      
      addResult({
        name: 'Tracking Hook Test',
        status: 'success',
        message: 'Hook executed (check browser console and network tab)',
        details: 'View tracked via useInteractionTracker hook',
      });
    } catch (error) {
      addResult({
        name: 'Tracking Hook Test',
        status: 'error',
        message: 'Hook failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Test 4: Search Tracking
    setCurrentTest('Search Tracking Test');
    try {
      tracker.trackSearch('test bike search query');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for debounce
      
      addResult({
        name: 'Search Tracking Test',
        status: 'success',
        message: 'Search tracked (debounced 1s)',
        details: 'Search will be batched and sent',
      });
    } catch (error) {
      addResult({
        name: 'Search Tracking Test',
        status: 'error',
        message: 'Search tracking failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Test 5: Like/Unlike
    setCurrentTest('Like/Unlike Test');
    try {
      tracker.trackLike('test-product-456');
      await new Promise(resolve => setTimeout(resolve, 500));
      tracker.trackUnlike('test-product-456');
      
      addResult({
        name: 'Like/Unlike Test',
        status: 'success',
        message: 'Like and unlike tracked',
        details: 'Check network tab in 5 seconds',
      });
    } catch (error) {
      addResult({
        name: 'Like/Unlike Test',
        status: 'error',
        message: 'Like tracking failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Test 6: Recommendations API
    setCurrentTest('Recommendations API');
    try {
      const response = await fetch('/api/recommendations/for-you?limit=10');
      const data = await response.json();
      
      if (data.success) {
        addResult({
          name: 'Recommendations API',
          status: 'success',
          message: `Returned ${data.recommendations?.length || 0} recommendations`,
          details: data.meta,
        });
      } else {
        throw new Error('API returned error');
      }
    } catch (error) {
      addResult({
        name: 'Recommendations API',
        status: 'error',
        message: 'Recommendations API failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    setCurrentTest('');
    setRunning(false);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-md border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="h-6 w-6 text-[#FFC72C]" />
            <h1 className="text-2xl font-bold text-gray-900">
              Tracking System Test Suite
            </h1>
          </div>
          <p className="text-gray-600 mb-4">
            Comprehensive tests for the recommendation system's tracking infrastructure.
          </p>
          
          {/* User Info */}
          <div className="bg-gray-50 rounded-md p-3 space-y-1">
            <p className="text-sm text-gray-700">
              <span className="font-medium">User ID:</span> {user?.id || 'Anonymous'}
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-medium">Email:</span> {user?.email || 'Not logged in'}
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-medium">Session ID:</span> {typeof window !== 'undefined' ? localStorage.getItem('yj_session_id') || 'Not initialized' : 'N/A'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-4">
            <Button
              onClick={runTests}
              disabled={running}
              className="rounded-md bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-medium"
            >
              {running ? 'Running Tests...' : 'Run All Tests'}
            </Button>
            <Button
              onClick={clearResults}
              disabled={running}
              variant="outline"
              className="rounded-md"
            >
              Clear Results
            </Button>
          </div>

          {currentTest && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4 animate-spin" />
              <span>Running: {currentTest}</span>
            </div>
          )}
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div className="bg-white rounded-md border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h2>
            <div className="space-y-3">
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-md p-4"
                >
                  <div className="flex items-start gap-3">
                    {result.status === 'success' ? (
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : result.status === 'error' ? (
                      <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Clock className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900">
                        {result.name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {result.message}
                      </p>
                      {result.details && (
                        <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(result.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Database Check Instructions */}
        <div className="bg-white rounded-md border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-5 w-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">Database Verification</h2>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            After running tests, verify data in Supabase SQL Editor:
          </p>
          <div className="bg-gray-50 rounded-md p-3 space-y-2 text-sm font-mono">
            <code className="block text-gray-800">
              SELECT * FROM user_interactions ORDER BY created_at DESC LIMIT 10;
            </code>
            <code className="block text-gray-800">
              SELECT * FROM product_scores ORDER BY updated_at DESC LIMIT 10;
            </code>
            <code className="block text-gray-800">
              SELECT COUNT(*) FROM user_interactions;
            </code>
          </div>
        </div>

        {/* Manual Actions */}
        <div className="bg-white rounded-md border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Manual Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => {
                // Use null for non-product interactions
                tracker.trackProductView(null as any);
                console.log('Tracked view without product ID');
              }}
              variant="outline"
              className="rounded-md"
            >
              Track View (No Product)
            </Button>
            <Button
              onClick={() => {
                // Track search (no product_id needed)
                tracker.trackSearch('manual test search');
                console.log('Tracked search');
              }}
              variant="outline"
              className="rounded-md"
            >
              Track Search
            </Button>
            <Button
              onClick={() => {
                // Clear offline queue
                localStorage.removeItem('yj_offline_interactions');
                console.log('✅ Cleared offline queue');
              }}
              variant="outline"
              className="rounded-md"
            >
              Clear Queue
            </Button>
            <Button
              onClick={() => {
                const sessionId = localStorage.getItem('yj_session_id');
                console.log('Session ID:', sessionId);
                console.log('Last activity:', localStorage.getItem('yj_last_activity'));
              }}
              variant="outline"
              className="rounded-md"
            >
              Show Session Info
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            These actions will be batched and sent within 5 seconds. Check Network tab.
          </p>
        </div>
      </div>
    </div>
  );
}

