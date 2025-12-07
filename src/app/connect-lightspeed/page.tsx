"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Check,
  X,
  RefreshCw,
  Package,
  Clock,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  Boxes,
  Loader2,
  CheckCircle2,
  Sparkles,
  BarChart3,
  History,
  Trash2,
  Settings,
  Tag,
} from "lucide-react";
import Image from "next/image";
import { Header } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLightspeedConnection } from "@/lib/hooks/use-lightspeed-connection";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number],
    },
  },
};

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  entities_synced: string[] | null;
  records_processed: number;
  records_created: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

interface CategoryStat {
  name: string;
  count: number;
}

interface SyncState {
  id: string;
  status: string;
  phase: string;
  items_fetched: number;
  items_inserted: number;
  started_at: string;
}

export default function ConnectLightspeedPage() {
  const [syncSuccess, setSyncSuccess] = React.useState(false);
  const [syncLogs, setSyncLogs] = React.useState<SyncLog[]>([]);
  const [syncState, setSyncState] = React.useState<SyncState | null>(null);
  const [continuing, setContinuing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [syncStats, setSyncStats] = React.useState<{
    totalProducts: number;
    inStockProducts: number;
    categories: CategoryStat[];
    totalCategories: number;
  } | null>(null);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [loadingCategories, setLoadingCategories] = React.useState(false);
  
  // API Test Panel State
  const [showApiTest, setShowApiTest] = React.useState(false);
  const [testQuery, setTestQuery] = React.useState('itemshops-with-stock');
  const [testRunning, setTestRunning] = React.useState(false);
  const [testResult, setTestResult] = React.useState<any>(null);
  const [testError, setTestError] = React.useState<string | null>(null);
  
  // Sync All Products State
  const [syncingAllProducts, setSyncingAllProducts] = React.useState(false);
  const [syncAllResult, setSyncAllResult] = React.useState<any>(null);
  const [syncAllError, setSyncAllError] = React.useState<string | null>(null);

  // Sync settings
  const [autoSyncNewProducts, setAutoSyncNewProducts] = React.useState(true);
  const [showCategoryList, setShowCategoryList] = React.useState(false);

  // Categories from Lightspeed API
  interface CategoryWithPreference {
    categoryId: string;
    name: string;
    fullPath: string;
    isEnabled: boolean;
    lastSyncedAt?: string;
    productCount: number;
    hasPreference: boolean;
  }

  const [categories, setCategories] = React.useState<CategoryWithPreference[]>([]);
  const [enabledCategoriesCount, setEnabledCategoriesCount] = React.useState(0);
  const [enabledCategories, setEnabledCategories] = React.useState<CategoryWithPreference[]>([]);
  const [syncing, setSyncing] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState<{
    phase: string;
    message: string;
    progress: number;
    details?: any;
  } | null>(null);
  const [abortController, setAbortController] = React.useState<AbortController | null>(null);
  const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const {
    isConnected,
    isLoading,
    isConnecting,
    isSyncing,
    isDisconnecting,
    accountInfo,
    connection,
    error,
    lastSync,
    syncOptions,
    syncSettings,
    connect,
    disconnect,
    sync,
    toggleSyncOption,
    updateSyncSettings,
    formatLastSync,
  } = useLightspeedConnection();

  // Check for initial sync on connection
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true' && isConnected) {
      // Show message that initial sync is running
      setSyncingAllProducts(true);
      
      // Check sync status after a delay
      setTimeout(() => {
        setSyncingAllProducts(false);
      }, 5000); // Show for 5 seconds
    }
  }, [isConnected]);

  // Fetch sync history, state, and categories
  React.useEffect(() => {
    if (isConnected) {
      fetchSyncHistory();
      checkSyncState();
      fetchCategories();
      checkActiveSync();
    }
  }, [isConnected]);

  // Check for active sync on mount
  const checkActiveSync = async () => {
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      
      const { data: activeSync } = await supabase
        .from('active_syncs')
        .select('*')
        .eq('status', 'running')
        .single();
      
      if (activeSync) {
        // Sync is running, show progress
        setSyncing(true);
        setSyncProgress({
          phase: activeSync.phase,
          message: activeSync.message || 'Syncing...',
          progress: activeSync.progress || 0,
          details: {
            itemsWithStock: activeSync.items_with_stock,
            inserted: activeSync.items_synced,
          },
        });
        
        // Start polling for updates
        startPolling();
      }
    } catch (error) {
      console.error('Error checking active sync:', error);
    }
  };

  // Poll for sync status updates
  const startPolling = () => {
    // Clear existing interval if any
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    const pollInterval = setInterval(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        
        const { data: activeSync } = await supabase
          .from('active_syncs')
          .select('*')
          .single();
        
        if (!activeSync || activeSync.status !== 'running') {
          // Sync finished
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setSyncing(false);
          
          if (activeSync?.status === 'completed') {
            // Show final complete state
            setSyncProgress({
              phase: 'complete',
              message: activeSync.message || `Sync complete! ${activeSync.items_synced || 0} products synced.`,
              progress: 100,
              details: {
                itemsWithStock: activeSync.items_with_stock,
                inserted: activeSync.items_synced,
                total: activeSync.items_synced,
              },
            });
            
            setSyncSuccess(true);
            setTimeout(() => {
              setSyncSuccess(false);
              setSyncProgress(null);
            }, 3000);
            
            // Refresh data
            await fetchSyncHistory();
            await fetchCategories();
          } else if (activeSync?.status === 'cancelled') {
            setSyncProgress({
              phase: 'cancelled',
              message: 'Sync was cancelled',
              progress: 0,
            });
            setTimeout(() => setSyncProgress(null), 3000);
          } else {
            setSyncProgress(null);
          }
          
          return;
        }
        
        // Update progress
        setSyncProgress({
          phase: activeSync.phase,
          message: activeSync.message || 'Syncing...',
          progress: activeSync.progress || 0,
          details: {
            itemsWithStock: activeSync.items_with_stock,
            inserted: activeSync.items_synced,
            total: activeSync.items_synced,
          },
        });
      } catch (error) {
        console.error('Polling error:', error);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    }, 2000); // Poll every 2 seconds
    
    pollingIntervalRef.current = pollInterval;
  };

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const fetchSyncHistory = async () => {
    try {
      const response = await fetch('/api/lightspeed/sync-history');
      if (response.ok) {
        const data = await response.json();
        setSyncLogs(data.logs || []);
        setSyncStats(data.stats || null);
      }
    } catch (error) {
      console.error('Error fetching sync history:', error);
    }
  };

  const fetchCategories = async () => {
    setLoadingCategories(true);
    try {
      const response = await fetch('/api/lightspeed/categories-sync');
      if (response.ok) {
        const data = await response.json();
        const allCategories = data.categories || [];
        const enabled = allCategories.filter((c: CategoryWithPreference) => c.isEnabled);
        
        setCategories(allCategories);
        setEnabledCategories(enabled);
        setEnabledCategoriesCount(data.enabledCount || 0);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const checkSyncState = async () => {
    try {
      const response = await fetch('/api/lightspeed/check-sync-state');
      if (response.ok) {
        const data = await response.json();
        setSyncState(data.syncState || null);
      }
    } catch (error) {
      console.error('Error checking sync state:', error);
    }
  };

  const handleContinueSync = async () => {
    setContinuing(true);
    try {
      const response = await fetch('/api/lightspeed/continue-sync', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.shouldContinue) {
        // Sync is still incomplete, poll again after a delay
        setTimeout(() => {
          handleContinueSync();
        }, 3000);
      } else {
        // Sync complete
        setSyncState(null);
        fetchSyncHistory();
        setContinuing(false);
      }
    } catch (error) {
      console.error('Error continuing sync:', error);
      setContinuing(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch('/api/products/delete-all', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        // Refresh stats
        await fetchSyncHistory();
        setShowDeleteConfirm(false);
        alert(`Successfully deleted ${data.deletedCount} products`);
      } else {
        throw new Error(data.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Error deleting products:', error);
      alert('Failed to delete products');
    } finally {
      setDeleting(false);
    }
  };

  const handleSync = async () => {
    const result = await sync();
    if (result.success) {
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
      // Refresh history after sync
      fetchSyncHistory();
    }
  };

  const handleToggleCategory = async (categoryId: string) => {
    // Optimistically update UI
    const newCategories = categories.map(cat =>
      cat.categoryId === categoryId
        ? { ...cat, isEnabled: !cat.isEnabled }
        : cat
    );
    const oldCategories = [...categories];
    
    setCategories(newCategories);
    
    // Update enabled categories list
    const newEnabledCategories = newCategories.filter(c => c.isEnabled);
    setEnabledCategories(newEnabledCategories);
    setEnabledCategoriesCount(newEnabledCategories.length);

    // Auto-save to database (in background)
    setSavingSettings(true);
    try {
      const response = await fetch('/api/lightspeed/categories-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categories: newCategories.map(cat => ({
            categoryId: cat.categoryId,
            name: cat.name,
            fullPath: cat.fullPath,
            isEnabled: cat.isEnabled,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      // Success - no need to refresh, state already updated
    } catch (error) {
      console.error('Error auto-saving category:', error);
      // Revert on error
      setCategories(oldCategories);
      setEnabledCategories(oldCategories.filter(c => c.isEnabled));
      setEnabledCategoriesCount(oldCategories.filter(c => c.isEnabled).length);
      alert('Failed to save category preference');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleAllCategories = async (enabled: boolean) => {
    // Optimistically update UI
    const newCategories = categories.map(cat => ({ ...cat, isEnabled: enabled }));
    const oldCategories = [...categories];
    
    setCategories(newCategories);
    
    // Update enabled categories list
    const newEnabledCategories = newCategories.filter(c => c.isEnabled);
    setEnabledCategories(newEnabledCategories);
    setEnabledCategoriesCount(newEnabledCategories.length);

    // Auto-save to database (in background)
    setSavingSettings(true);
    try {
      const response = await fetch('/api/lightspeed/categories-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categories: newCategories.map(cat => ({
            categoryId: cat.categoryId,
            name: cat.name,
            fullPath: cat.fullPath,
            isEnabled: cat.isEnabled,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      // Success - no need to refresh, state already updated
    } catch (error) {
      console.error('Error auto-saving categories:', error);
      // Revert on error
      setCategories(oldCategories);
      setEnabledCategories(oldCategories.filter(c => c.isEnabled));
      setEnabledCategoriesCount(oldCategories.filter(c => c.isEnabled).length);
      alert('Failed to save category preferences');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleInstantSync = async () => {
    // Get all enabled category IDs from the database
    const enabledCategoryIds = enabledCategories.map(c => c.categoryId);
    
    if (enabledCategoryIds.length === 0) {
      alert('Please configure and save at least one category first');
      return;
    }

    setSyncing(true);
    setSyncProgress({ phase: 'init', message: 'Connecting to Lightspeed...', progress: 0 });
    
    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);
    
    try {
      // Get the auth token
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call the Supabase Edge Function with SSE
      const response = await fetch(`${supabaseUrl}/functions/v1/sync-lightspeed-inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          categoryIds: enabledCategoryIds,
          sse: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Sync failed');
      }

      // Process SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete message in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('SSE Progress:', data);
              
              if (data.phase === 'done') {
                // Sync complete - final message
                setSyncProgress({ 
                  phase: 'complete', 
                  message: `Sync complete! ${data.result?.itemsSynced || 0} products synced.`, 
                  progress: 100,
                  details: {
                    itemsWithStock: data.result?.itemsWithStock,
                    inserted: data.result?.itemsSynced,
                    total: data.result?.itemsSynced,
                  }
                });
              } else if (data.phase === 'error') {
                throw new Error(data.error);
              } else if (data.phase === 'complete') {
                // Explicit complete phase
                setSyncProgress({
                  phase: data.phase,
                  message: data.message,
                  progress: 100,
                  details: data.details,
                });
              } else {
                setSyncProgress({
                  phase: data.phase,
                  message: data.message,
                  progress: data.progress,
                  details: data.details,
                });
              }
            } catch (e) {
              console.error('SSE parse error:', e);
            }
          }
        }
      }
      
      // Show success message
      setSyncSuccess(true);
      setTimeout(() => {
        setSyncSuccess(false);
        setSyncProgress(null);
      }, 3000);
      
      // Refresh data
      await fetchSyncHistory();
      await fetchCategories();
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Sync cancelled by user');
        setSyncProgress({ 
          phase: 'cancelled', 
          message: 'Sync cancelled', 
          progress: 0 
        });
        setTimeout(() => setSyncProgress(null), 3000);
      } else {
        console.error('Error syncing:', error);
        setSyncProgress({ 
          phase: 'error', 
          message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 
          progress: 0 
        });
        setTimeout(() => setSyncProgress(null), 5000);
      }
    } finally {
      setSyncing(false);
      setAbortController(null);
    }
  };

  const handleCancelSync = async () => {
    if (abortController) {
      abortController.abort();
    }
    
    // Update database to mark as cancelled
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      await supabase
        .from('active_syncs')
        .update({
          status: 'cancelled',
          phase: 'cancelled',
          message: 'Sync cancelled by user',
          completed_at: new Date().toISOString(),
        })
        .eq('status', 'running');
      
      setSyncProgress({ 
        phase: 'cancelled', 
        message: 'Sync cancelled', 
        progress: 0 
      });
      
      setTimeout(() => {
        setSyncProgress(null);
        setSyncing(false);
      }, 2000);
      
    } catch (error) {
      console.error('Error cancelling sync:', error);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <>
        <Header
          title="Connect Lightspeed"
          description="Integrate with Lightspeed POS"
        />
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Connect Lightspeed"
        description="Integrate with Lightspeed POS"
      />

      <div className="p-4 lg:p-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-3xl space-y-6"
        >
          {/* Error Message */}
          {error && (
            <motion.div variants={itemVariants}>
              <div className="rounded-md border border-red-200 bg-white p-4 shadow-sm dark:border-red-900 dark:bg-card">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-900 dark:text-red-400">
                      Connection Error
                    </h3>
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Sync Success Message */}
          <AnimatePresence>
            {syncSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="rounded-md border border-green-200 bg-white p-4 shadow-sm dark:border-green-900 dark:bg-card">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-semibold text-green-900 dark:text-green-400">
                        Sync Completed Successfully
                      </h3>
                      <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                        Your categories have been synchronised with Lightspeed.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Connection Status Card */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary overflow-hidden flex-shrink-0">
                      <Image
                        src="/ls.png"
                        alt="Lightspeed"
                        width={48}
                        height={48}
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold">Lightspeed Integration</h3>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "rounded-md",
                            isConnected
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-secondary text-muted-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "mr-1.5 h-2 w-2 rounded-full",
                              isConnected ? "bg-green-500" : "bg-muted-foreground"
                            )}
                          />
                          {isConnected ? "Connected" : "Not Connected"}
                        </Badge>
                      </div>
                      {accountInfo && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {accountInfo.name}
                        </p>
                      )}
                      
                      {/* Connection Date */}
                      {isConnected && connection?.connected_at && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Check className="h-3.5 w-3.5" />
                          <span>
                            Connected on{' '}
                            {new Date(connection.connected_at).toLocaleDateString('en-AU', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isConnected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={disconnect}
                      disabled={isDisconnecting}
                      className="rounded-md border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20 flex-shrink-0"
                    >
                      {isDisconnecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        <>
                          <X className="mr-2 h-4 w-4" />
                          Disconnect
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={connect}
                      disabled={isConnecting}
                      className="rounded-md flex-shrink-0"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Connect Lightspeed
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Sync Inventory Button / Continue Sync */}
          <AnimatePresence mode="wait">
            {isConnected && (
              <motion.div
                key="sync-inventory"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{
                  duration: 0.4,
                  ease: [0.04, 0.62, 0.23, 0.98],
                }}
              >
                <Card className="bg-white dark:bg-card rounded-md border-border">
                  <CardContent className="p-6">
                    {syncState ? (
                      // Show Continue Sync
                      <div className="space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-yellow-100 dark:bg-yellow-900/30">
                            <RefreshCw className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-base font-semibold mb-1">Sync In Progress</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                              Your inventory sync was paused. Continue to complete the import.
                            </p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{syncState.items_inserted} products synced</span>
                              <span>•</span>
                              <span>Phase: {syncState.phase}</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          onClick={handleContinueSync}
                          disabled={continuing}
                          className="rounded-md w-full"
                        >
                          {continuing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Continuing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Continue Sync
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      // Show Start Sync with Category Management
                      <div className="space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 overflow-hidden flex-shrink-0">
                            <Image
                              src="/ls.png"
                              alt="Lightspeed"
                              width={48}
                              height={48}
                              className="object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div className="flex-1">
                                <h3 className="text-base font-semibold mb-1">Sync Your Inventory</h3>
                                <p className="text-sm text-muted-foreground">
                                  Configure and sync categories from Lightspeed
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowCategoryList(!showCategoryList)}
                                className="rounded-md text-xs h-8"
                              >
                                <ChevronDown 
                                  className={cn(
                                    "h-3.5 w-3.5 mr-1.5 transition-transform duration-200",
                                    showCategoryList && "rotate-180"
                                  )} 
                                />
                                {showCategoryList ? 'Hide' : 'Show'} Categories
                              </Button>
                            </div>

                            {/* Last Sync Info */}
                            {lastSync && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                                <Clock className="h-3.5 w-3.5" />
                                <span>
                                  Last sync:{' '}
                                  {new Date(lastSync).toLocaleDateString('en-AU', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                  })}{' '}
                                  at{' '}
                                  {new Date(lastSync).toLocaleTimeString('en-AU', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </div>
                            )}

                            {/* Categories Configuration & Selection */}
                            <AnimatePresence>
                              {showCategoryList && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ 
                                    duration: 0.4,
                                    ease: [0.04, 0.62, 0.23, 0.98]
                                  }}
                                  className="overflow-hidden"
                                >
                                  <div className="space-y-3 pt-3 mt-3 border-t border-border">
                                    {/* Quick Actions */}
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {savingSettings ? (
                                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Saving...
                                          </span>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">
                                            {enabledCategoriesCount} {enabledCategoriesCount === 1 ? 'category' : 'categories'} enabled
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleToggleAllCategories(true)}
                                          disabled={loadingCategories || savingSettings}
                                          className="rounded-md text-xs h-7"
                                        >
                                          <Check className="h-3 w-3 mr-1" />
                                          All
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleToggleAllCategories(false)}
                                          disabled={loadingCategories || savingSettings}
                                          className="rounded-md text-xs h-7"
                                        >
                                          <X className="h-3 w-3 mr-1" />
                                          None
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Category List */}
                                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                                      {loadingCategories ? (
                                        <div className="flex items-center justify-center py-8">
                                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                        </div>
                                      ) : categories.length === 0 ? (
                                        <p className="text-xs text-muted-foreground text-center py-4">
                                          No categories found. Make sure you're connected to Lightspeed.
                                        </p>
                                      ) : (
                                        categories.map((category) => {
                                          const isUncategorized = category.categoryId === '__UNCATEGORIZED__'
                                          return (
                                            <div 
                                              key={category.categoryId} 
                                              className={cn(
                                                "flex items-center justify-between gap-3 px-2 py-2 rounded-md transition-colors",
                                                isUncategorized 
                                                  ? "bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-50 dark:hover:bg-amber-950/20" 
                                                  : "hover:bg-secondary/30"
                                              )}
                                            >
                                              <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                                                <Checkbox
                                                  id={`category-${category.categoryId}`}
                                                  checked={category.isEnabled}
                                                  onCheckedChange={() => handleToggleCategory(category.categoryId)}
                                                  disabled={savingSettings}
                                                />
                                                <Label
                                                  htmlFor={`category-${category.categoryId}`}
                                                  className="text-sm cursor-pointer flex-1 min-w-0"
                                                >
                                                  <span className="block truncate">
                                                    {category.name}
                                                    {isUncategorized && (
                                                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                                                        (Special)
                                                      </span>
                                                    )}
                                                  </span>
                                                  {category.fullPath !== category.name && (
                                                    <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                                                      {category.fullPath}
                                                    </span>
                                                  )}
                                                </Label>
                                              </div>
                                              {category.productCount > 0 && (
                                                <Badge variant="secondary" className="rounded-md text-xs flex-shrink-0">
                                                  {category.productCount}
                                                </Badge>
                                              )}
                                            </div>
                                          )
                                        })
                                      )}
                                    </div>

                                    {/* Stock Info */}
                                    <div className="flex items-start gap-2 pt-2 border-t border-border">
                                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                      <p className="text-xs text-muted-foreground">
                                        Only products with stock {'>'} 0 will be synced
                                      </p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Sync Button & Progress */}
                            <div className="space-y-3 mt-4">
                              {/* Progress Bar */}
                              <AnimatePresence>
                                {syncProgress && syncing && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                                    className="overflow-hidden"
                                  >
                                    <div className="rounded-md bg-white border border-border p-4 space-y-3">
                                      {/* Progress Header */}
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          {syncProgress.phase === 'complete' ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                          ) : syncProgress.phase === 'cancelled' ? (
                                            <X className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                          ) : syncProgress.phase === 'error' ? (
                                            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                          ) : (
                                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                          )}
                                          <span className="text-sm font-medium">
                                            {syncProgress.phase === 'complete' ? 'Complete' : 
                                             syncProgress.phase === 'cancelled' ? 'Cancelled' :
                                             syncProgress.phase === 'error' ? 'Failed' : 'Syncing...'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          {syncProgress.phase !== 'cancelled' && (
                                            <span className={cn(
                                              "text-sm font-semibold",
                                              syncProgress.phase === 'complete' ? "text-green-600 dark:text-green-400" :
                                              syncProgress.phase === 'error' ? "text-red-600 dark:text-red-400" :
                                              "text-primary"
                                            )}>
                                              {Math.round(syncProgress.progress)}%
                                            </span>
                                          )}
                                          {syncProgress.phase !== 'complete' && 
                                           syncProgress.phase !== 'error' && 
                                           syncProgress.phase !== 'cancelled' && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={handleCancelSync}
                                              className="rounded-md h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400"
                                            >
                                              <X className="h-3 w-3 mr-1" />
                                              Cancel
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {/* Progress Bar */}
                                      {syncProgress.phase !== 'cancelled' && (
                                        <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                                          <motion.div
                                            className={cn(
                                              "h-2.5 rounded-full",
                                              syncProgress.phase === 'complete' ? "bg-green-600 dark:bg-green-400" :
                                              syncProgress.phase === 'error' ? "bg-red-600 dark:bg-red-400" :
                                              "bg-primary"
                                            )}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${syncProgress.progress}%` }}
                                            transition={{ duration: 0.3, ease: "easeOut" }}
                                          />
                                        </div>
                                      )}
                                      
                                      {/* Status Message */}
                                      <p className={cn(
                                        "text-xs",
                                        syncProgress.phase === 'complete' ? "text-green-600 dark:text-green-400" :
                                        syncProgress.phase === 'error' ? "text-red-600 dark:text-red-400" :
                                        syncProgress.phase === 'cancelled' ? "text-amber-600 dark:text-amber-400" :
                                        "text-muted-foreground"
                                      )}>
                                        {syncProgress.message}
                                      </p>
                                      
                                      {/* Details */}
                                      {syncProgress.details && (
                                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                          {syncProgress.details.itemsWithStock !== undefined && (
                                            <span className="flex items-center gap-1">
                                              <Package className="h-3 w-3" />
                                              {syncProgress.details.itemsWithStock} with stock
                                            </span>
                                          )}
                                          {syncProgress.details.inserted !== undefined && (
                                            <span className="flex items-center gap-1">
                                              <Check className="h-3 w-3" />
                                              {syncProgress.details.inserted}/{syncProgress.details.total} saved
                                            </span>
                                          )}
                                          {syncProgress.details.itemsFetched !== undefined && (
                                            <span className="flex items-center gap-1">
                                              <Boxes className="h-3 w-3" />
                                              {syncProgress.details.itemsFetched} items fetched
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              
                              {/* Sync Button */}
                              <div className="flex items-center gap-3">
                                <Button
                                  onClick={handleInstantSync}
                                  disabled={syncing || enabledCategoriesCount === 0}
                                  className="rounded-md"
                                >
                                  {syncing ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Syncing...
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="mr-2 h-4 w-4" />
                                      Start Sync {enabledCategoriesCount > 0 && `(${enabledCategoriesCount})`}
                                    </>
                                  )}
                                </Button>
                                {!syncing && (
                                  enabledCategoriesCount === 0 ? (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                      Configure and save categories first
                                    </p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      {enabledCategoriesCount} {enabledCategoriesCount === 1 ? 'category' : 'categories'} will be synced
                                    </p>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sync Settings */}
          <AnimatePresence mode="wait">
            {isConnected && (
              <motion.div
                key="sync-settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{
                  duration: 0.4,
                  ease: [0.04, 0.62, 0.23, 0.98],
                }}
              >
                <Card className="bg-white dark:bg-card rounded-md border-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                        <Settings className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">
                          Sync Settings
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Configure how products are synced from Lightspeed
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Auto Sync New Products */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <Label htmlFor="autoSyncNewProducts" className="text-sm font-medium">
                          Auto-Sync New Products
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Automatically sync products when they come back in stock (0 → 1+)
                        </p>
                      </div>
                      <Switch
                        id="autoSyncNewProducts"
                        checked={autoSyncNewProducts}
                        onCheckedChange={setAutoSyncNewProducts}
                      />
                    </div>

                    {/* Manual Approval Note */}
                    <AnimatePresence>
                      {!autoSyncNewProducts && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ 
                            duration: 0.4,
                            ease: [0.04, 0.62, 0.23, 0.98]
                          }}
                          className="overflow-hidden"
                        >
                          <div className="rounded-md bg-white border border-border p-3 mt-4">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-xs font-medium text-foreground">Manual Approval Required</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  New items will require manual approval before syncing.
                                </p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sync Statistics */}
          <AnimatePresence mode="wait">
            {isConnected && syncStats && syncStats.totalProducts > 0 && (
              <motion.div
                key="sync-stats"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{
                  duration: 0.4,
                  ease: [0.04, 0.62, 0.23, 0.98],
                }}
              >
                <Card className="bg-white dark:bg-card rounded-md border-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                        <BarChart3 className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">
                          Synced Inventory
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Your current inventory status
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      <div className="rounded-md bg-secondary/50 p-4">
                        <div className="text-2xl font-bold text-foreground">{syncStats.totalProducts}</div>
                        <div className="text-xs text-muted-foreground mt-1">Total Products</div>
                      </div>
                      <div className="rounded-md bg-secondary/50 p-4">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{syncStats.inStockProducts}</div>
                        <div className="text-xs text-muted-foreground mt-1">In Stock</div>
                      </div>
                      <div className="rounded-md bg-secondary/50 p-4">
                        <div className="text-2xl font-bold text-foreground">{syncStats.totalCategories}</div>
                        <div className="text-xs text-muted-foreground mt-1">Categories</div>
                      </div>
                      <div className="rounded-md bg-secondary/50 p-4">
                        <div className="text-2xl font-bold text-foreground">
                          {lastSync ? formatLastSync(lastSync) : 'Never'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Last Sync</div>
                      </div>
                    </div>

                    {/* Categories Breakdown */}
                    {syncStats.categories.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium">Products by Category</h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDeleteAll}
                            disabled={deleting}
                            className={cn(
                              "rounded-md transition-colors",
                              showDeleteConfirm 
                                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {deleting ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                Deleting...
                              </>
                            ) : showDeleteConfirm ? (
                              <>
                                <AlertCircle className="mr-2 h-3 w-3" />
                                Confirm Delete
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-2 h-3 w-3" />
                                Delete All
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {syncStats.categories.slice(0, 5).map((cat) => (
                            <div key={cat.name} className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">{cat.name}</span>
                              <Badge variant="secondary" className="rounded-md">
                                {cat.count}
                              </Badge>
                            </div>
                          ))}
                          {syncStats.categories.length > 5 && (
                            <div className="text-xs text-muted-foreground italic">
                              + {syncStats.categories.length - 5} more categories
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sync History Log */}
          <AnimatePresence mode="wait">
            {isConnected && syncLogs.length > 0 && (
              <motion.div
                key="sync-logs"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{
                  duration: 0.4,
                  ease: [0.04, 0.62, 0.23, 0.98],
                }}
              >
                <Card className="bg-white dark:bg-card rounded-md border-border">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                        <History className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">
                          Sync History
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Recent synchronisation activity
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {syncLogs.map((log) => {
                        const startDate = new Date(log.started_at);
                        const isCompleted = log.status === 'completed';
                        
                        return (
                          <div
                            key={log.id}
                            className="flex items-start justify-between gap-4 p-3 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge
                                  variant={isCompleted ? "default" : "secondary"}
                                  className={cn(
                                    "rounded-md text-xs",
                                    isCompleted && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  )}
                                >
                                  {log.status}
                                </Badge>
                                <span className="text-xs text-muted-foreground capitalize">
                                  {log.sync_type} sync
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                <span>{log.records_created} products synced</span>
                                {log.entities_synced && log.entities_synced.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <span>{log.entities_synced.join(', ')}</span>
                                  </>
                                )}
                                {log.duration_ms && (
                                  <>
                                    <span>•</span>
                                    <span>{(log.duration_ms / 1000).toFixed(1)}s</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-xs font-medium text-foreground">
                                {startDate.toLocaleDateString()}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {startDate.toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sync All Products to Table */}
          {isConnected && (
            <motion.div variants={itemVariants}>
              <Card className="bg-white dark:bg-card rounded-md border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base font-semibold">
                      Sync All Products to Database
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Fetch all items with stock from Lightspeed and store in products_all_ls table
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Initial Sync Notice */}
                  {syncingAllProducts && !syncAllResult && (
                    <div className="rounded-md bg-blue-50 border border-blue-200 p-3 dark:bg-blue-900/10 dark:border-blue-900">
                      <div className="flex items-start gap-2">
                        <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0 animate-spin" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-blue-900 dark:text-blue-400">
                            Initial Sync Running
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                            Your inventory is being synced automatically in the background. This may take a few minutes.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-md bg-gray-50 border border-gray-200 p-3 dark:bg-gray-900 dark:border-gray-800">
                    <p className="text-xs text-muted-foreground">
                      This will query all items with positive stock from your Lightspeed account,
                      fetch their complete details, and store them in the products_all_ls table.
                      This may take several minutes depending on your inventory size.
                    </p>
                  </div>

                  <Button
                    onClick={async () => {
                      setSyncingAllProducts(true);
                      setSyncAllError(null);
                      setSyncAllResult(null);

                      try {
                        const response = await fetch('/api/lightspeed/sync-all-products', {
                          method: 'POST',
                        });
                        const data = await response.json();

                        if (!response.ok) {
                          setSyncAllError(data.error || 'Sync failed');
                        } else {
                          setSyncAllResult(data);
                        }
                      } catch (error) {
                        setSyncAllError(error instanceof Error ? error.message : 'Unknown error');
                      } finally {
                        setSyncingAllProducts(false);
                      }
                    }}
                    disabled={syncingAllProducts}
                    className="w-full rounded-md"
                  >
                    {syncingAllProducts ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Syncing All Products...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Start Full Sync
                      </>
                    )}
                  </Button>

                  {/* Sync Error */}
                  {syncAllError && (
                    <div className="rounded-md bg-red-50 border border-red-200 p-3 dark:bg-red-900/10 dark:border-red-900">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-red-900 dark:text-red-400">
                            Sync Failed
                          </p>
                          <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                            {syncAllError}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sync Success */}
                  {syncAllResult && (
                    <div className="rounded-md bg-green-50 border border-green-200 p-4 dark:bg-green-900/10 dark:border-green-900">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <p className="text-sm font-medium text-green-900 dark:text-green-400">
                            Sync Complete!
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Items Synced:</span>
                              <span className="ml-1 font-medium">{syncAllResult.productsInserted}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Pages Queried:</span>
                              <span className="ml-1 font-medium">{syncAllResult.pagesQueried}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Unique Items:</span>
                              <span className="ml-1 font-medium">{syncAllResult.uniqueItems}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Total Records:</span>
                              <span className="ml-1 font-medium">{syncAllResult.totalRecords}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* API Test Panel */}
          {isConnected && (
            <motion.div variants={itemVariants}>
              <Card className="bg-white dark:bg-card rounded-md border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base font-semibold">
                        API Test Panel
                      </CardTitle>
                      <Badge variant="secondary" className="rounded-md text-xs">
                        Developer
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowApiTest(!showApiTest)}
                      className="rounded-md"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          showApiTest && "rotate-180"
                        )}
                      />
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Test different Lightspeed API queries
                  </CardDescription>
                </CardHeader>
                <AnimatePresence>
                  {showApiTest && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.4,
                        ease: [0.04, 0.62, 0.23, 0.98],
                      }}
                      className="overflow-hidden"
                    >
                      <CardContent className="space-y-4">
                        {/* Query Selection */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Select Query</Label>
                          <div className="grid grid-cols-1 gap-2">
                            <button
                              onClick={() => setTestQuery('itemshops-with-stock')}
                              className={cn(
                                "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                                testQuery === 'itemshops-with-stock'
                                  ? "border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-900"
                                  : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                              )}
                            >
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-current flex-shrink-0 mt-0.5">
                                {testQuery === 'itemshops-with-stock' && (
                                  <div className="h-2.5 w-2.5 rounded-full bg-current" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">Items with Stock (ItemShops)</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  GET /ItemShop.json?qoh=&gt;0 - Returns inventory by location (correct method)
                                </div>
                              </div>
                            </button>

                            <button
                              onClick={() => setTestQuery('items-in-stock')}
                              className={cn(
                                "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                                testQuery === 'items-in-stock'
                                  ? "border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-900"
                                  : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                              )}
                            >
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-current flex-shrink-0 mt-0.5">
                                {testQuery === 'items-in-stock' && (
                                  <div className="h-2.5 w-2.5 rounded-full bg-current" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">All Items (No Stock Filter)</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  GET /Item.json - Returns first 100 items (qoh not available on this endpoint)
                                </div>
                              </div>
                            </button>

                            <button
                              onClick={() => setTestQuery('all-categories')}
                              className={cn(
                                "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                                testQuery === 'all-categories'
                                  ? "border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-900"
                                  : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                              )}
                            >
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-current flex-shrink-0 mt-0.5">
                                {testQuery === 'all-categories' && (
                                  <div className="h-2.5 w-2.5 rounded-full bg-current" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">All Categories</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  GET /Category.json - Returns all product categories
                                </div>
                              </div>
                            </button>

                            <button
                              onClick={() => setTestQuery('account-info')}
                              className={cn(
                                "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                                testQuery === 'account-info'
                                  ? "border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-900"
                                  : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                              )}
                            >
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-current flex-shrink-0 mt-0.5">
                                {testQuery === 'account-info' && (
                                  <div className="h-2.5 w-2.5 rounded-full bg-current" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">Account Information</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  GET /Account.json - Returns account details and stats
                                </div>
                              </div>
                            </button>
                          </div>
                        </div>

                        {/* Run Test Button */}
                        <Button
                          onClick={async () => {
                            setTestRunning(true);
                            setTestError(null);
                            setTestResult(null);

                            try {
                              const response = await fetch(`/api/lightspeed/test/${testQuery}`);
                              const data = await response.json();

                              if (!response.ok) {
                                setTestError(data.error || 'Test failed');
                              } else {
                                setTestResult(data);
                              }
                            } catch (error) {
                              setTestError(error instanceof Error ? error.message : 'Unknown error');
                            } finally {
                              setTestRunning(false);
                            }
                          }}
                          disabled={testRunning}
                          className="w-full rounded-md"
                        >
                          {testRunning ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Running Test...
                            </>
                          ) : (
                            <>
                              <Zap className="mr-2 h-4 w-4" />
                              Run Test Query
                            </>
                          )}
                        </Button>

                        {/* Test Results */}
                        {testError && (
                          <div className="rounded-md bg-red-50 border border-red-200 p-3 dark:bg-red-900/10 dark:border-red-900">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-red-900 dark:text-red-400">
                                  Error
                                </p>
                                <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                                  {testError}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {testResult && (
                          <div className="rounded-md bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800">
                            <div className="border-b border-gray-200 dark:border-gray-800 px-3 py-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Test Results
                              </span>
                              <Badge variant="secondary" className="rounded-md text-xs">
                                {testResult.duration}ms
                              </Badge>
                            </div>
                            <div className="p-3">
                              <pre className="text-xs font-mono overflow-x-auto">
                                {JSON.stringify(testResult, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          )}

          {/* Help Card */}
          <motion.div variants={itemVariants}>
            <Card className="bg-white dark:bg-card rounded-md border-border">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
                  <AlertCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-medium">Need help connecting?</h4>
                  <p className="text-xs text-muted-foreground">
                    Visit our documentation for step-by-step instructions on
                    setting up your Lightspeed integration.
                  </p>
                  <a
                    href="https://www.lightspeedhq.com/retail/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                  >
                    Visit Lightspeed
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}
