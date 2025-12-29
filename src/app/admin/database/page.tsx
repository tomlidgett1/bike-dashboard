'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  Search,
  Loader2,
  RefreshCw,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Filter,
  Plus,
  Eye,
  EyeOff,
  Copy,
  ChevronLeft,
  ChevronRight,
  Table2,
  Columns3,
  ArrowUpDown,
  MoreHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface Column {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

interface Filter {
  id: string;
  column: string;
  operator: string;
  value: string;
}

interface EditingCell {
  rowId: string;
  column: string;
  value: unknown;
}

// ============================================================
// Constants
// ============================================================

const OPERATORS = [
  { value: 'eq', label: 'Equals' },
  { value: 'neq', label: 'Not Equals' },
  { value: 'gt', label: 'Greater Than' },
  { value: 'gte', label: 'Greater Than or Equal' },
  { value: 'lt', label: 'Less Than' },
  { value: 'lte', label: 'Less Than or Equal' },
  { value: 'like', label: 'Contains (case sensitive)' },
  { value: 'ilike', label: 'Contains (case insensitive)' },
  { value: 'is', label: 'Is (null/true/false)' },
  { value: 'in', label: 'In (comma separated)' },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

// ============================================================
// Helper Functions
// ============================================================

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  if (typeof value === 'string' && value.length > 100) {
    return value.substring(0, 100) + '...';
  }
  return String(value);
}

function getInputType(dataType: string): string {
  if (dataType.includes('int') || dataType === 'numeric' || dataType === 'decimal' || dataType === 'real' || dataType === 'double precision') {
    return 'number';
  }
  if (dataType === 'boolean' || dataType === 'bool') {
    return 'checkbox';
  }
  if (dataType.includes('timestamp') || dataType === 'date') {
    return 'datetime-local';
  }
  return 'text';
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ============================================================
// Main Component
// ============================================================

export default function DatabaseBrowserPage() {
  // State
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [columns, setColumns] = useState<Column[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [searchColumn, setSearchColumn] = useState('');
  const [filters, setFilters] = useState<Filter[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingTables, setLoadingTables] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<string | null>(null);
  const [viewJsonDialog, setViewJsonDialog] = useState<{ open: boolean; value: unknown; column: string }>({
    open: false,
    value: null,
    column: '',
  });
  const [idColumn, setIdColumn] = useState('id');
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [bulkEditColumn, setBulkEditColumn] = useState('');
  const [bulkEditValue, setBulkEditValue] = useState('');
  const [bulkEditLoading, setBulkEditLoading] = useState(false);

  // Computed values
  const totalPages = Math.ceil(total / pageSize);
  const hasSelection = selectedRows.size > 0;
  const allSelected = data.length > 0 && selectedRows.size === data.length;

  // Fetch tables on mount
  useEffect(() => {
    fetchTables();
  }, []);

  // Fetch table schema when table changes
  useEffect(() => {
    if (selectedTable) {
      fetchSchema(selectedTable);
      setPage(1);
      setSelectedRows(new Set());
      setFilters([]);
      setSearch('');
      setSearchColumn('');
      setSortBy('');
      setSortOrder('asc');
    }
  }, [selectedTable]);

  // Fetch data when parameters change
  useEffect(() => {
    if (selectedTable && columns.length > 0) {
      fetchData();
    }
  }, [selectedTable, page, pageSize, sortBy, sortOrder, search, searchColumn, filters, columns]);

  // API calls
  const fetchTables = async () => {
    setLoadingTables(true);
    try {
      const res = await fetch('/api/admin/database/tables');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTables(json.tables || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tables');
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchSchema = async (tableName: string) => {
    try {
      const res = await fetch(`/api/admin/database/tables?table=${encodeURIComponent(tableName)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const cols = json.columns || [];
      setColumns(cols);
      setVisibleColumns(new Set(cols.slice(0, 10).map((c: Column) => c.column_name)));
      
      // Determine ID column
      const idCol = cols.find((c: Column) => c.column_name === 'id');
      if (idCol) {
        setIdColumn('id');
      } else {
        const firstCol = cols[0];
        if (firstCol) setIdColumn(firstCol.column_name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schema');
    }
  };

  const fetchData = useCallback(async () => {
    if (!selectedTable) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        table: selectedTable,
        page: String(page),
        pageSize: String(pageSize),
      });
      
      if (sortBy) {
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
      }
      if (search && searchColumn) {
        params.set('search', search);
        params.set('searchColumn', searchColumn);
      }
      if (filters.length > 0) {
        params.set('filters', JSON.stringify(filters.map(f => ({
          column: f.column,
          operator: f.operator,
          value: f.value
        }))));
      }

      const res = await fetch(`/api/admin/database/data?${params.toString()}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [selectedTable, page, pageSize, sortBy, sortOrder, search, searchColumn, filters]);

  const handleUpdate = async (rowId: string, column: string, value: unknown) => {
    try {
      const res = await fetch('/api/admin/database/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selectedTable,
          id: rowId,
          idColumn,
          data: { [column]: value }
        })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      
      // Update local data
      setData(prev => prev.map(row => {
        if (row[idColumn] === rowId) {
          return { ...row, [column]: value };
        }
        return row;
      }));
      setEditingCell(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update';
      
      // Provide user-friendly messages for common database errors
      if (errorMessage.includes('foreign key constraint')) {
        setError('Cannot update: The value does not exist in the referenced table.');
      } else if (errorMessage.includes('violates not-null constraint')) {
        setError('Cannot update: This field cannot be empty.');
      } else if (errorMessage.includes('violates unique constraint')) {
        setError('Cannot update: This value already exists and must be unique.');
      } else if (errorMessage.includes('violates check constraint')) {
        setError('Cannot update: The value does not meet the validation rules for this field.');
      } else if (errorMessage.includes('permission denied')) {
        setError('Permission denied: You do not have access to update this table.');
      } else {
        setError(errorMessage);
      }
      setEditingCell(null);
    }
  };

  const handleDelete = async (ids: string[]) => {
    try {
      const res = await fetch('/api/admin/database/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selectedTable,
          ids,
          idColumn
        })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      
      setSelectedRows(new Set());
      setDeleteDialogOpen(false);
      setRowToDelete(null);
      fetchData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete';
      
      // Close dialog first so user can see error
      setDeleteDialogOpen(false);
      setRowToDelete(null);
      
      // Provide user-friendly messages for common database errors
      if (errorMessage.includes('foreign key constraint')) {
        const match = errorMessage.match(/on table "(\w+)"/);
        const referencingTable = match ? match[1] : 'another table';
        setError(`Cannot delete: This record is referenced by rows in "${referencingTable}". Delete those records first, or update them to remove the reference.`);
      } else if (errorMessage.includes('violates not-null constraint')) {
        setError('Cannot delete: This would leave required data missing in related records.');
      } else if (errorMessage.includes('permission denied')) {
        setError('Permission denied: You do not have access to delete from this table.');
      } else {
        setError(errorMessage);
      }
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkEditColumn || selectedRows.size === 0) return;
    
    setBulkEditLoading(true);
    try {
      const column = columns.find(c => c.column_name === bulkEditColumn);
      let parsedValue: unknown = bulkEditValue;
      
      // Parse value based on column type
      if (column) {
        if (bulkEditValue === '' && column.is_nullable === 'YES') {
          parsedValue = null;
        } else if (column.data_type === 'boolean' || column.data_type === 'bool') {
          parsedValue = bulkEditValue === 'true';
        } else if (column.data_type.includes('int')) {
          parsedValue = parseInt(bulkEditValue);
        } else if (column.data_type === 'numeric' || column.data_type === 'decimal' || column.data_type === 'real' || column.data_type === 'double precision') {
          parsedValue = parseFloat(bulkEditValue);
        } else if (column.data_type === 'jsonb' || column.data_type === 'json') {
          try {
            parsedValue = JSON.parse(bulkEditValue);
          } catch {
            parsedValue = bulkEditValue;
          }
        }
      }

      const res = await fetch('/api/admin/database/data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: selectedTable,
          ids: Array.from(selectedRows),
          idColumn,
          data: { [bulkEditColumn]: parsedValue }
        })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      
      setBulkEditDialogOpen(false);
      setBulkEditColumn('');
      setBulkEditValue('');
      setSelectedRows(new Set());
      fetchData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to bulk update';
      setBulkEditDialogOpen(false);
      
      if (errorMessage.includes('foreign key constraint')) {
        setError('Cannot update: The value does not exist in the referenced table.');
      } else if (errorMessage.includes('violates not-null constraint')) {
        setError('Cannot update: This field cannot be empty.');
      } else if (errorMessage.includes('violates unique constraint')) {
        setError('Cannot update: This value already exists and must be unique.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setBulkEditLoading(false);
    }
  };

  // Event handlers
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(data.map(row => String(row[idColumn]))));
    }
  };

  const handleSelectRow = (rowId: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleAddFilter = () => {
    if (columns.length === 0) return;
    setFilters(prev => [...prev, {
      id: generateId(),
      column: columns[0].column_name,
      operator: 'eq',
      value: ''
    }]);
  };

  const handleUpdateFilter = (id: string, field: keyof Filter, value: string) => {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const handleRemoveFilter = (id: string) => {
    setFilters(prev => prev.filter(f => f.id !== id));
  };

  const handleCopyValue = (value: unknown) => {
    const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    navigator.clipboard.writeText(text);
  };

  const startEditing = (rowId: string, column: string, value: unknown) => {
    setEditingCell({ rowId, column, value });
    setEditValue(value === null || value === undefined ? '' : String(value));
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEditing = () => {
    if (!editingCell) return;
    
    const column = columns.find(c => c.column_name === editingCell.column);
    let parsedValue: unknown = editValue;
    
    if (column) {
      if (editValue === '' && column.is_nullable === 'YES') {
        parsedValue = null;
      } else if (column.data_type === 'boolean' || column.data_type === 'bool') {
        parsedValue = editValue === 'true';
      } else if (column.data_type.includes('int')) {
        parsedValue = parseInt(editValue);
      } else if (column.data_type === 'numeric' || column.data_type === 'decimal' || column.data_type === 'real' || column.data_type === 'double precision') {
        parsedValue = parseFloat(editValue);
      } else if (column.data_type === 'jsonb' || column.data_type === 'json') {
        try {
          parsedValue = JSON.parse(editValue);
        } catch {
          parsedValue = editValue;
        }
      }
    }
    
    handleUpdate(editingCell.rowId, editingCell.column, parsedValue);
  };

  const toggleColumnVisibility = (column: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  // Render
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-900 rounded-md">
              <Database className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Database Browser</h1>
              <p className="text-sm text-gray-500">View and manage your Supabase tables</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={!selectedTable || loading}
              className="rounded-md"
            >
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Error display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800"
            >
              <div className="flex items-center justify-between">
                <span>{error}</span>
                <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table selector and controls */}
        <div className="bg-white rounded-md border border-gray-200 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Table selector */}
            <div className="flex items-center gap-2">
              <Table2 className="h-4 w-4 text-gray-400" />
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger className="w-[250px] rounded-md">
                  <SelectValue placeholder="Select a table..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingTables ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    tables.map(table => (
                      <SelectItem key={table} value={table}>
                        {table}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Column visibility */}
            {columns.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-md">
                    <Columns3 className="h-4 w-4 mr-1.5" />
                    Columns
                    <Badge variant="secondary" className="ml-2 rounded-md">
                      {visibleColumns.size}/{columns.length}
                    </Badge>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[250px] max-h-[400px] overflow-y-auto">
                  <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {columns.map(col => (
                    <DropdownMenuCheckboxItem
                      key={col.column_name}
                      checked={visibleColumns.has(col.column_name)}
                      onCheckedChange={() => toggleColumnVisibility(col.column_name)}
                    >
                      <span className="truncate">{col.column_name}</span>
                      <span className="ml-auto text-xs text-gray-400">{col.data_type}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Search */}
            {columns.length > 0 && (
              <div className="flex items-center gap-2">
                <Select value={searchColumn} onValueChange={setSearchColumn}>
                  <SelectTrigger className="w-[150px] rounded-md">
                    <SelectValue placeholder="Search column" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map(col => (
                      <SelectItem key={col.column_name} value={col.column_name}>
                        {col.column_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 w-[200px] rounded-md"
                  />
                </div>
              </div>
            )}

            {/* Filter toggle */}
            {columns.length > 0 && (
              <Button
                variant={showFilters ? "default" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="rounded-md"
              >
                <Filter className="h-4 w-4 mr-1.5" />
                Filters
                {filters.length > 0 && (
                  <Badge variant="secondary" className="ml-2 rounded-md">
                    {filters.length}
                  </Badge>
                )}
              </Button>
            )}

            {/* Page size */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-500">Rows:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1); }}>
                <SelectTrigger className="w-[80px] rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filters panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="overflow-hidden"
              >
                <div className="pt-4 border-t border-gray-200 space-y-3">
                  {filters.map(filter => (
                    <div key={filter.id} className="flex items-center gap-2">
                      <Select
                        value={filter.column}
                        onValueChange={(v) => handleUpdateFilter(filter.id, 'column', v)}
                      >
                        <SelectTrigger className="w-[180px] rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {columns.map(col => (
                            <SelectItem key={col.column_name} value={col.column_name}>
                              {col.column_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Select
                        value={filter.operator}
                        onValueChange={(v) => handleUpdateFilter(filter.id, 'operator', v)}
                      >
                        <SelectTrigger className="w-[200px] rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map(op => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Input
                        value={filter.value}
                        onChange={(e) => handleUpdateFilter(filter.id, 'value', e.target.value)}
                        placeholder="Value..."
                        className="w-[200px] rounded-md"
                      />
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFilter(filter.id)}
                        className="rounded-md"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddFilter}
                    className="rounded-md"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Filter
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bulk actions */}
        <AnimatePresence>
          {hasSelection && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-md border border-gray-200 p-3 flex items-center gap-4"
            >
              <span className="text-sm font-medium text-gray-700">
                {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBulkEditColumn('');
                  setBulkEditValue('');
                  setBulkEditDialogOpen(true);
                }}
                className="rounded-md"
              >
                <Pencil className="h-4 w-4 mr-1.5" />
                Bulk Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="rounded-md"
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete Selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRows(new Set())}
                className="rounded-md"
              >
                Clear Selection
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Data table */}
        {selectedTable && (
          <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
            {loading && data.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : data.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Database className="h-12 w-12 mb-4 text-gray-300" />
                <p className="text-lg font-medium">No data found</p>
                <p className="text-sm">This table is empty or no results match your filters.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-[50px]">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        {columns
                          .filter(col => visibleColumns.has(col.column_name))
                          .map(col => (
                            <TableHead
                              key={col.column_name}
                              className="cursor-pointer hover:bg-gray-100 transition-colors"
                              onClick={() => handleSort(col.column_name)}
                            >
                              <div className="flex items-center gap-1.5">
                                <span>{col.column_name}</span>
                                {sortBy === col.column_name ? (
                                  sortOrder === 'asc' ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )
                                ) : (
                                  <ChevronsUpDown className="h-4 w-4 text-gray-300" />
                                )}
                              </div>
                            </TableHead>
                          ))}
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row, rowIndex) => {
                        const rowId = String(row[idColumn]);
                        const isSelected = selectedRows.has(rowId);
                        
                        return (
                          <TableRow
                            key={rowId || rowIndex}
                            data-state={isSelected ? 'selected' : undefined}
                            className={cn(
                              isSelected && "bg-blue-50",
                              loading && "opacity-50"
                            )}
                          >
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleSelectRow(rowId)}
                              />
                            </TableCell>
                            {columns
                              .filter(col => visibleColumns.has(col.column_name))
                              .map(col => {
                                const value = row[col.column_name];
                                const isEditing = editingCell?.rowId === rowId && editingCell?.column === col.column_name;
                                const isJson = col.data_type === 'jsonb' || col.data_type === 'json';
                                const isObject = typeof value === 'object' && value !== null;
                                
                                return (
                                  <TableCell
                                    key={col.column_name}
                                    className="max-w-[300px]"
                                  >
                                    {isEditing ? (
                                      <div className="flex items-center gap-1">
                                        {col.data_type === 'boolean' || col.data_type === 'bool' ? (
                                          <Select
                                            value={editValue}
                                            onValueChange={setEditValue}
                                          >
                                            <SelectTrigger className="w-[100px] h-8 rounded-md">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="true">true</SelectItem>
                                              <SelectItem value="false">false</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : isJson ? (
                                          <textarea
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            className="flex-1 text-sm border rounded-md p-2 min-h-[100px] font-mono"
                                          />
                                        ) : (
                                          <Input
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            type={getInputType(col.data_type)}
                                            className="flex-1 h-8 rounded-md"
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') saveEditing();
                                              if (e.key === 'Escape') cancelEditing();
                                            }}
                                          />
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={saveEditing}
                                          className="h-8 w-8 p-0 rounded-md"
                                        >
                                          <Check className="h-4 w-4 text-green-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={cancelEditing}
                                          className="h-8 w-8 p-0 rounded-md"
                                        >
                                          <X className="h-4 w-4 text-red-600" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div
                                        className="flex items-center gap-2 group cursor-pointer"
                                        onDoubleClick={() => startEditing(rowId, col.column_name, value)}
                                      >
                                        <span className={cn(
                                          "truncate",
                                          value === null && "text-gray-400 italic",
                                          isObject && "font-mono text-xs"
                                        )}>
                                          {formatCellValue(value)}
                                        </span>
                                        <div className="hidden group-hover:flex items-center gap-0.5">
                                          {isObject && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 w-6 p-0 rounded-md"
                                              onClick={() => setViewJsonDialog({ open: true, value, column: col.column_name })}
                                            >
                                              <Eye className="h-3 w-3" />
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 rounded-md"
                                            onClick={() => handleCopyValue(value)}
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </TableCell>
                                );
                              })}
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-md">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setRowToDelete(rowId);
                                      setDeleteDialogOpen(true);
                                    }}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Row
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-500">
                    Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className="rounded-md"
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-md"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-gray-600 px-2">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-md"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(totalPages)}
                      disabled={page === totalPages}
                      className="rounded-md"
                    >
                      Last
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* No table selected */}
        {!selectedTable && !loadingTables && (
          <div className="bg-white rounded-md border border-gray-200 p-20 flex flex-col items-center justify-center text-gray-500">
            <Table2 className="h-16 w-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-700">Select a Table</p>
            <p className="text-sm">Choose a table from the dropdown above to view and manage its data.</p>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out rounded-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              {rowToDelete
                ? 'Are you sure you want to delete this row? This action cannot be undone.'
                : `Are you sure you want to delete ${selectedRows.size} row${selectedRows.size !== 1 ? 's' : ''}? This action cannot be undone.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setRowToDelete(null);
              }}
              className="rounded-md"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(rowToDelete ? [rowToDelete] : Array.from(selectedRows))}
              className="rounded-md"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JSON viewer dialog */}
      <Dialog open={viewJsonDialog.open} onOpenChange={(open) => setViewJsonDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-[800px] max-h-[80vh] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out rounded-md">
          <DialogHeader>
            <DialogTitle>{viewJsonDialog.column}</DialogTitle>
            <DialogDescription>JSON data viewer</DialogDescription>
          </DialogHeader>
          <div className="bg-gray-900 rounded-md p-4 overflow-auto max-h-[60vh]">
            <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
              {JSON.stringify(viewJsonDialog.value, null, 2)}
            </pre>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleCopyValue(viewJsonDialog.value)}
              className="rounded-md"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk edit dialog */}
      <Dialog open={bulkEditDialogOpen} onOpenChange={setBulkEditDialogOpen}>
        <DialogContent className="animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out rounded-md">
          <DialogHeader>
            <DialogTitle>Bulk Edit {selectedRows.size} Row{selectedRows.size !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              Set the same value for a field across all selected rows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Column to Update</label>
              <Select value={bulkEditColumn} onValueChange={(v) => {
                setBulkEditColumn(v);
                setBulkEditValue('');
              }}>
                <SelectTrigger className="rounded-md">
                  <SelectValue placeholder="Select a column..." />
                </SelectTrigger>
                <SelectContent>
                  {columns.map(col => (
                    <SelectItem key={col.column_name} value={col.column_name}>
                      <div className="flex items-center gap-2">
                        <span>{col.column_name}</span>
                        <span className="text-xs text-gray-400">({col.data_type})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {bulkEditColumn && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">New Value</label>
                {(() => {
                  const col = columns.find(c => c.column_name === bulkEditColumn);
                  if (!col) return null;
                  
                  if (col.data_type === 'boolean' || col.data_type === 'bool') {
                    return (
                      <Select value={bulkEditValue} onValueChange={setBulkEditValue}>
                        <SelectTrigger className="rounded-md">
                          <SelectValue placeholder="Select value..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">true</SelectItem>
                          <SelectItem value="false">false</SelectItem>
                        </SelectContent>
                      </Select>
                    );
                  }
                  
                  if (col.data_type === 'jsonb' || col.data_type === 'json') {
                    return (
                      <textarea
                        value={bulkEditValue}
                        onChange={(e) => setBulkEditValue(e.target.value)}
                        placeholder='{"key": "value"}'
                        className="w-full min-h-[100px] border rounded-md p-2 font-mono text-sm"
                      />
                    );
                  }
                  
                  return (
                    <Input
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      type={getInputType(col.data_type)}
                      placeholder={col.is_nullable === 'YES' ? 'Leave empty for NULL' : 'Enter value...'}
                      className="rounded-md"
                    />
                  );
                })()}
                {columns.find(c => c.column_name === bulkEditColumn)?.is_nullable === 'YES' && (
                  <p className="text-xs text-gray-500">Leave empty to set NULL</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkEditDialogOpen(false)}
              className="rounded-md"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkUpdate}
              disabled={!bulkEditColumn || bulkEditLoading}
              className="rounded-md"
            >
              {bulkEditLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  Update {selectedRows.size} Row{selectedRows.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

