"use client";

import * as React from "react";
import { format } from "date-fns";
import { 
  ArrowUp, 
  ArrowDown, 
  Power, 
  PowerOff, 
  RefreshCw,
  Filter,
  Download,
  Search,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface InventoryLog {
  id: string;
  product_name: string;
  product_sku: string | null;
  lightspeed_item_id: string;
  old_qoh: number;
  new_qoh: number;
  qoh_change: number;
  old_is_active: boolean | null;
  new_is_active: boolean | null;
  sync_type: string;
  sync_source: string;
  created_at: string;
  metadata?: any;
}

interface InventoryLogsViewProps {
  className?: string;
}

export function InventoryLogsView({ className }: InventoryLogsViewProps) {
  const [logs, setLogs] = React.useState<InventoryLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [changeTypeFilter, setChangeTypeFilter] = React.useState('all');
  const [statistics, setStatistics] = React.useState({
    total: 0,
    increases: 0,
    decreases: 0,
    activated: 0,
    deactivated: 0,
  });

  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '100',
        change_type: changeTypeFilter,
      });

      const response = await fetch(`/api/lightspeed/inventory-logs?${params}`);
      const data = await response.json();

      if (data.success) {
        setLogs(data.logs);
        setStatistics(data.statistics);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  }, [changeTypeFilter]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Filter logs by search term
  const filteredLogs = React.useMemo(() => {
    if (!searchTerm) return logs;
    
    const term = searchTerm.toLowerCase();
    return logs.filter(log => 
      log.product_name.toLowerCase().includes(term) ||
      log.product_sku?.toLowerCase().includes(term) ||
      log.lightspeed_item_id.includes(term)
    );
  }, [logs, searchTerm]);

  const getChangeIcon = (log: InventoryLog) => {
    if (log.old_is_active === false && log.new_is_active === true) {
      return <Power className="h-4 w-4 text-green-600" />;
    }
    if (log.old_is_active === true && log.new_is_active === false) {
      return <PowerOff className="h-4 w-4 text-red-600" />;
    }
    if (log.qoh_change > 0) {
      return <ArrowUp className="h-4 w-4 text-green-600" />;
    }
    if (log.qoh_change < 0) {
      return <ArrowDown className="h-4 w-4 text-red-600" />;
    }
    return null;
  };

  const getChangeBadge = (log: InventoryLog) => {
    if (log.old_is_active === false && log.new_is_active === true) {
      return (
        <Badge variant="outline" className="rounded-md bg-green-50 text-green-700 border-green-200">
          Activated
        </Badge>
      );
    }
    if (log.old_is_active === true && log.new_is_active === false) {
      return (
        <Badge variant="outline" className="rounded-md bg-red-50 text-red-700 border-red-200">
          Deactivated
        </Badge>
      );
    }
    if (log.qoh_change > 0) {
      return (
        <Badge variant="outline" className="rounded-md bg-green-50 text-green-700 border-green-200">
          +{log.qoh_change}
        </Badge>
      );
    }
    if (log.qoh_change < 0) {
      return (
        <Badge variant="outline" className="rounded-md bg-red-50 text-red-700 border-red-200">
          {log.qoh_change}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="rounded-md">
        No Change
      </Badge>
    );
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with Stats and Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 space-y-4">
        {/* Statistics Cards */}
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Updates</div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-white">
              {statistics.total}
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Stock Increased</div>
            <div className="text-2xl font-semibold text-green-600">
              {statistics.increases}
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Stock Decreased</div>
            <div className="text-2xl font-semibold text-red-600">
              {statistics.decreases}
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Activated</div>
            <div className="text-2xl font-semibold text-green-600">
              {statistics.activated}
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Deactivated</div>
            <div className="text-2xl font-semibold text-red-600">
              {statistics.deactivated}
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by product name, SKU, or item ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 rounded-md"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
            <SelectTrigger className="w-48 rounded-md">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Changes</SelectItem>
              <SelectItem value="increase">Stock Increased</SelectItem>
              <SelectItem value="decrease">Stock Decreased</SelectItem>
              <SelectItem value="activated">Activated</SelectItem>
              <SelectItem value="deactivated">Deactivated</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
            className="rounded-md"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-gray-400 mb-2">
              <Filter className="h-12 w-12 mx-auto mb-3 opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              No logs found
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {searchTerm
                ? "Try adjusting your search or filters"
                : "Inventory updates will appear here when they occur"}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Old Stock
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  New Stock
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Change
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date & Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-card divide-y divide-gray-200 dark:divide-gray-800">
              {filteredLogs.map((log) => (
                <tr 
                  key={log.id} 
                  className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {log.product_name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Item ID: {log.lightspeed_item_id}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900 dark:text-white font-mono">
                      {log.product_sku || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {log.old_qoh}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {log.new_qoh}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {getChangeIcon(log)}
                      {getChangeBadge(log)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {log.old_is_active !== null && log.new_is_active !== null && 
                     log.old_is_active !== log.new_is_active ? (
                      <div className="flex items-center justify-center gap-1 text-xs">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "rounded-md",
                            log.old_is_active 
                              ? "bg-green-50 text-green-700 border-green-200" 
                              : "bg-gray-50 text-gray-600 border-gray-200"
                          )}
                        >
                          {log.old_is_active ? "Active" : "Inactive"}
                        </Badge>
                        <span className="text-gray-400">→</span>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "rounded-md",
                            log.new_is_active 
                              ? "bg-green-50 text-green-700 border-green-200" 
                              : "bg-gray-50 text-gray-600 border-gray-200"
                          )}
                        >
                          {log.new_is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {format(new Date(log.created_at), 'MMM d, yyyy')}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(log.created_at), 'h:mm a')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with result count */}
      {!loading && filteredLogs.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredLogs.length} of {statistics.total} total updates
          </div>
        </div>
      )}
    </div>
  );
}

