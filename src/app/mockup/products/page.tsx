"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  ImageIcon,
  ImageOff,
  ListFilter,
  MoreHorizontal,
  Package,
  PackageX,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  PageBody,
  PageContainer,
  PageHeader,
} from "../_components/page-primitives";
import { StatCard } from "../_components/stat-card";
import { StatusBadge } from "../_components/status-badge";
import { ProductThumb } from "../_components/product-thumb";
import {
  CATEGORIES,
  PRODUCTS,
  formatCurrency,
  type MockProduct,
} from "../_components/mock-data";

type SortKey = "name" | "price" | "stock";

export default function ProductsPage() {
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [stock, setStock] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const filtered = React.useMemo(() => {
    const list = PRODUCTS.filter((p) => {
      const q = search.trim().toLowerCase();
      if (q && !`${p.name} ${p.sku} ${p.brand}`.toLowerCase().includes(q))
        return false;
      if (category !== "all" && p.category !== category) return false;
      if (stock === "in" && p.stock <= 0) return false;
      if (stock === "low" && !(p.stock > 0 && p.stock <= p.reorderPoint))
        return false;
      if (stock === "out" && p.stock !== 0) return false;
      if (status !== "all" && p.state !== status) return false;
      return true;
    });
    list.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
      return (a[sort.key] - b[sort.key]) * dir;
    });
    return list;
  }, [search, category, stock, status, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );

  const allChecked = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const someChecked = filtered.some((p) => selected.has(p.id));

  const toggleAll = () =>
    setSelected((prev) => {
      if (allChecked) return new Set();
      return new Set(filtered.map((p) => p.id));
    });

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const hasFilters =
    search !== "" || category !== "all" || stock !== "all" || status !== "all";
  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setStock("all");
    setStatus("all");
  };

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Products"
        description="1,284 products synced from Lightspeed · last updated 6 minutes ago"
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download className="size-4" />
              Import
            </Button>
            <Button size="sm">
              <Plus className="size-4" />
              Add product
            </Button>
          </>
        }
      />

      <PageBody>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Total products" value="1,284" icon={Package} hint="across 7 categories" />
          <StatCard label="Live on marketplace" value="942" icon={Eye} tone="positive" hint="73% of catalogue" />
          <StatCard label="Low stock" value="37" icon={TriangleAlert} tone="warning" hint="at or below reorder point" />
          <StatCard label="Needs images" value="84" icon={ImageOff} tone="warning" hint="hidden from marketplace" />
        </div>

        {/* Table card */}
        <Card className="gap-0 py-0">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 lg:flex-row lg:items-center">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU or brand…"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger size="sm" className="w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={stock} onValueChange={setStock}>
                <SelectTrigger size="sm" className="w-[130px]">
                  <SelectValue placeholder="Stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stock</SelectItem>
                  <SelectItem value="in">In stock</SelectItem>
                  <SelectItem value="low">Low stock</SelectItem>
                  <SelectItem value="out">Out of stock</SelectItem>
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger size="sm" className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="needs_images">Needs images</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>

              {hasFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  Clear
                </Button>
              ) : (
                <Button variant="outline" size="icon-sm">
                  <ListFilter className="size-4" />
                  <span className="sr-only">More filters</span>
                </Button>
              )}
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 ? (
            <div className="flex items-center gap-3 border-b border-border/60 bg-primary/5 px-4 py-2.5">
              <span className="text-sm font-medium">
                {selected.size} selected
              </span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="xs">
                  <Eye className="size-3.5" />
                  Set live
                </Button>
                <Button variant="outline" size="xs">
                  <Sparkles className="size-3.5" />
                  Discover images
                </Button>
                <Button variant="outline" size="xs">
                  <Trash2 className="size-3.5" />
                  Archive
                </Button>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto text-muted-foreground"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
            </div>
          ) : null}

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={
                        allChecked ? true : someChecked ? "indeterminate" : false
                      }
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      label="Product"
                      active={sort.key === "name"}
                      dir={sort.dir}
                      onClick={() => toggleSort("name")}
                    />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="hidden lg:table-cell">Brand</TableHead>
                  <TableHead className="text-right">
                    <SortButton
                      label="Price"
                      active={sort.key === "price"}
                      dir={sort.dir}
                      onClick={() => toggleSort("price")}
                      align="right"
                    />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortButton
                      label="Stock"
                      active={sort.key === "stock"}
                      dir={sort.dir}
                      onClick={() => toggleSort("stock")}
                      align="right"
                    />
                  </TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead className="w-10 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    checked={selected.has(p.id)}
                    onCheck={() => toggleOne(p.id)}
                  />
                ))}
                {filtered.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="h-48 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <PackageX className="size-8" />
                        <p className="text-sm font-medium text-foreground">
                          No products match your filters
                        </p>
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {/* Footer / pagination */}
          <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">
              Showing <span className="font-medium text-foreground">1–{filtered.length}</span>{" "}
              of <span className="font-medium text-foreground">1,284</span> products
            </p>
            <div className="flex items-center gap-2">
              <span className="hidden text-muted-foreground sm:inline">
                Rows per page
              </span>
              <Select defaultValue="12">
                <SelectTrigger size="sm" className="w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="48">48</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" disabled>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="px-2 text-muted-foreground">Page 1 of 107</span>
                <Button variant="outline" size="icon-sm">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </PageBody>
    </PageContainer>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
        align === "right" && "ml-auto flex-row-reverse"
      )}
    >
      {label}
      <ArrowUpDown
        className={cn(
          "size-3 transition-opacity",
          active ? "opacity-100" : "opacity-40",
          active && dir === "desc" && "rotate-180"
        )}
      />
    </button>
  );
}

function ProductRow({
  product: p,
  checked,
  onCheck,
}: {
  product: MockProduct;
  checked: boolean;
  onCheck: () => void;
}) {
  return (
    <TableRow data-state={checked ? "selected" : undefined} className="group">
      <TableCell className="pl-4">
        <Checkbox
          checked={checked}
          onCheckedChange={onCheck}
          aria-label={`Select ${p.name}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <ProductThumb hue={p.hue} hasImage={p.hasImage} />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{p.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">
        {p.category}
      </TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">
        {p.brand}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatCurrency(p.price)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <StockCell stock={p.stock} reorderPoint={p.reorderPoint} />
      </TableCell>
      <TableCell>
        <StatusBadge state={p.state} />
      </TableCell>
      <TableCell className="pr-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem>
              <Pencil className="size-4" />
              Edit product
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ExternalLink className="size-4" />
              View on marketplace
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ImageIcon className="size-4" />
              Discover images
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 className="size-4" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function StockCell({
  stock,
  reorderPoint,
}: {
  stock: number;
  reorderPoint: number;
}) {
  if (stock === 0) {
    return (
      <span className="font-medium text-rose-600 dark:text-rose-400">
        Out of stock
      </span>
    );
  }
  if (stock <= reorderPoint) {
    return (
      <span className="font-medium text-amber-600 dark:text-amber-400">
        {stock} · Low
      </span>
    );
  }
  return (
    <span className="font-medium text-foreground">
      {stock}
      <span className="ml-1 font-normal text-muted-foreground">in stock</span>
    </span>
  );
}
