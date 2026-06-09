"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  Dot,
  Globe,
  ListChecks,
  Package,
  PenLine,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SafeProductImage } from "@/components/settings/safe-product-image";

export interface DescriptionProduct {
  id: string;
  description: string;
  display_name?: string | null;
  product_description?: string | null;
  product_specs?: string | null;
  brand?: string | null;
  model?: string | null;
  marketplace_category?: string | null;
  marketplace_subcategory?: string | null;
  marketplace_level_3_category?: string | null;
  category_name?: string | null;
  full_category_path?: string | null;
  system_sku?: string | null;
  custom_sku?: string | null;
  price: number;
  qoh: number;
  sellable?: number | null;
  reorder_point?: number | null;
  primary_image_url: string | null;
  resolved_image_url: string | null;
  is_active: boolean;
}

export type GenStatus = "idle" | "searching" | "writing_desc" | "writing_specs" | "done" | "error";

export interface GenState {
  status: GenStatus;
  description: string | null;
  specs: string | null;
  error: string | null;
}

export type GenerateMode = "both" | "description" | "specs";

interface StoreProductContentTableProps {
  products: DescriptionProduct[];
  selected: Set<string>;
  genStates: Record<string, GenState>;
  expandedIds: Set<string>;
  mode: GenerateMode;
  isGenerating: boolean;
  onToggleSelect: (id: string) => void;
  onToggleVisibleSelection: (ids: string[], shouldSelect: boolean) => void;
  onToggleExpand: (id: string) => void;
  onGenerate: (ids: string[]) => void;
}

const STATUS_LABEL: Record<GenStatus, string> = {
  idle: "",
  searching: "Searching",
  writing_desc: "Writing description",
  writing_specs: "Writing specs",
  done: "Done",
  error: "Failed",
};

const STATUS_ICON: Record<GenStatus, React.ReactNode> = {
  idle: null,
  searching: <Globe className="h-3 w-3 animate-pulse" />,
  writing_desc: <PenLine className="h-3 w-3 animate-pulse" />,
  writing_specs: <ListChecks className="h-3 w-3 animate-pulse" />,
  done: <CheckCircle2 className="h-3 w-3" />,
  error: <AlertCircle className="h-3 w-3" />,
};

function SelectionCheckbox({
  checked,
  indeterminate,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { indeterminate?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      className={cn(
        "h-3.5 w-3.5 rounded-md border-border text-foreground accent-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          part || null
        )
      )}
    </>
  );
}

function ContentPreview({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim());

  return (
    <div className="space-y-2.5">
      {blocks.map((block, blockIndex) => {
        const lines = block
          .trim()
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length === 1 && /^#{1,3}\s/.test(lines[0])) {
          return (
            <h4 key={blockIndex} className="text-xs font-semibold text-foreground">
              <InlineText text={lines[0].replace(/^#+\s/, "")} />
            </h4>
          );
        }

        const isBullet = (line: string) => /^[•\-\*]\s/.test(line);
        const bulletLines = lines.filter(isBullet);
        const nonBulletLines = lines.filter((line) => !isBullet(line));

        if (bulletLines.length > 0) {
          const rawHeader = nonBulletLines.length === 1 ? nonBulletLines[0] : null;
          const header = rawHeader?.replace(/^\*\*(.+)\*\*$/, "$1") ?? rawHeader;

          return (
            <div key={blockIndex} className="space-y-1">
              {header ? (
                <p className="text-xs font-semibold text-foreground">
                  <InlineText text={header} />
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {bulletLines.map((line, lineIndex) => (
                  <li key={lineIndex} className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
                    <span className="mt-[2px] shrink-0 select-none text-muted-foreground">•</span>
                    <span>
                      <InlineText text={line.replace(/^[•\-\*]\s/, "")} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        return (
          <p key={blockIndex} className="text-xs leading-relaxed text-muted-foreground">
            <InlineText text={lines.join(" ")} />
          </p>
        );
      })}
    </div>
  );
}

function getProductName(product: DescriptionProduct) {
  return product.display_name || product.description || "Unnamed product";
}

function getSku(product: DescriptionProduct) {
  return product.custom_sku || product.system_sku || "—";
}

function getCategory(product: DescriptionProduct) {
  return (
    [
      product.marketplace_category,
      product.marketplace_subcategory,
      product.marketplace_level_3_category,
    ]
      .filter(Boolean)
      .join(" / ") ||
    product.full_category_path ||
    product.category_name ||
    "Uncategorised"
  );
}

function wordCount(text: string | null | undefined) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function contentScore(product: DescriptionProduct) {
  return Number(!!product.product_description) + Number(!!product.product_specs);
}

function formatCurrency(value: number | null | undefined) {
  if (!value) return "—";
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function columnClassName(columnId: string) {
  switch (columnId) {
    case "select":
      return "w-10 min-w-10";
    case "product":
      return "min-w-[300px]";
    case "brand":
      return "min-w-[120px]";
    case "category":
      return "min-w-[220px]";
    case "price":
      return "min-w-[88px] text-right";
    case "stock":
      return "min-w-[110px] text-right";
    case "image":
      return "min-w-[88px]";
    case "description":
    case "specs":
      return "min-w-[120px]";
    case "aiState":
      return "min-w-[150px]";
    case "actions":
      return "min-w-[132px] text-right";
    default:
      return "min-w-[120px]";
  }
}

function ContentBadge({
  ready,
  words,
  label,
}: {
  ready: boolean;
  words: number;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Badge
        variant="outline"
        className={cn(
          "h-5 rounded-md border-border bg-background px-1.5 text-[10px] font-medium",
          ready ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {ready ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Dot className="h-3 w-3 -mx-0.5" />}
        {ready ? "Ready" : "Missing"}
      </Badge>
      <span className="text-[10px] text-muted-foreground">
        {ready ? `${words.toLocaleString()} words` : `No ${label}`}
      </span>
    </div>
  );
}

export function StoreProductContentTable({
  products,
  selected,
  genStates,
  expandedIds,
  mode,
  isGenerating,
  onToggleSelect,
  onToggleVisibleSelection,
  onToggleExpand,
  onGenerate,
}: StoreProductContentTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "content", desc: false },
    { id: "product", desc: false },
  ]);

  const visibleIds = React.useMemo(() => products.map((product) => product.id), [products]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  const columns = React.useMemo<ColumnDef<DescriptionProduct>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: () => (
          <SelectionCheckbox
            checked={allVisibleSelected}
            indeterminate={someVisibleSelected && !allVisibleSelected}
            disabled={isGenerating || visibleIds.length === 0}
            aria-label="Select all visible products"
            onChange={() => onToggleVisibleSelection(visibleIds, !(allVisibleSelected || someVisibleSelected))}
          />
        ),
        cell: ({ row }) => (
          <SelectionCheckbox
            checked={selected.has(row.original.id)}
            disabled={isGenerating}
            aria-label={`Select ${getProductName(row.original)}`}
            onChange={() => onToggleSelect(row.original.id)}
          />
        ),
      },
      {
        id: "product",
        accessorFn: getProductName,
        header: "Product",
        cell: ({ row }) => {
          const product = row.original;
          const title = getProductName(product);
          const imageUrl = product.resolved_image_url || product.primary_image_url;

          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50">
                {imageUrl ? (
                  <SafeProductImage src={imageUrl} alt={title} width={32} height={32} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold leading-tight text-foreground">{title}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{getSku(product)}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "brand",
        accessorFn: (product) => product.brand || "",
        header: "Brand",
        cell: ({ row }) => (
          <span className="block truncate text-xs text-muted-foreground" title={row.original.brand || undefined}>
            {row.original.brand || "—"}
          </span>
        ),
      },
      {
        id: "category",
        accessorFn: getCategory,
        header: "Category",
        cell: ({ row }) => {
          const category = getCategory(row.original);
          return (
            <span className="block max-w-[260px] truncate text-xs text-muted-foreground" title={category}>
              {category}
            </span>
          );
        },
      },
      {
        id: "price",
        accessorFn: (product) => product.price || 0,
        header: "Price",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-foreground">{formatCurrency(row.original.price)}</span>
        ),
      },
      {
        id: "stock",
        accessorFn: (product) => product.qoh || 0,
        header: "Stock",
        cell: ({ row }) => {
          const product = row.original;
          const reorder = product.reorder_point ?? 0;
          const lowStock = product.qoh > 0 && reorder > 0 && product.qoh <= reorder;

          return (
            <div className="text-right">
              <p className={cn("font-mono text-xs tabular-nums text-foreground", lowStock && "text-amber-700")}>
                {product.qoh.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {product.sellable != null ? `${product.sellable.toLocaleString()} sellable` : reorder ? `reorder ${reorder}` : "on hand"}
              </p>
            </div>
          );
        },
      },
      {
        id: "image",
        accessorFn: (product) => Number(!!(product.resolved_image_url || product.primary_image_url)),
        header: "Image",
        cell: ({ row }) => {
          const hasImage = !!(row.original.resolved_image_url || row.original.primary_image_url);
          return (
            <Badge
              variant="outline"
              className={cn(
                "h-5 rounded-md border-border bg-background px-1.5 text-[10px] font-medium",
                hasImage ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {hasImage ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Dot className="h-3 w-3 -mx-0.5" />}
              {hasImage ? "Ready" : "Missing"}
            </Badge>
          );
        },
      },
      {
        id: "description",
        accessorFn: (product) => wordCount(product.product_description),
        header: "Description",
        cell: ({ row }) => (
          <ContentBadge
            ready={!!row.original.product_description}
            words={wordCount(row.original.product_description)}
            label="description"
          />
        ),
      },
      {
        id: "specs",
        accessorFn: (product) => wordCount(product.product_specs),
        header: "Specs",
        cell: ({ row }) => (
          <ContentBadge ready={!!row.original.product_specs} words={wordCount(row.original.product_specs)} label="specs" />
        ),
      },
      {
        id: "content",
        accessorFn: contentScore,
        header: "AI State",
        cell: ({ row }) => {
          const product = row.original;
          const genState = genStates[product.id];
          const active = !!genState && genState.status !== "idle";
          const hasBoth = !!product.product_description && !!product.product_specs;

          if (active) {
            return (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs",
                  genState.status === "error" ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {STATUS_ICON[genState.status]}
                {STATUS_LABEL[genState.status]}
              </span>
            );
          }

          return (
            <span className="text-xs text-muted-foreground">
              {hasBoth ? "Content complete" : mode === "both" ? "Needs AI copy" : `Needs ${mode}`}
            </span>
          );
        },
      },
      {
        id: "actions",
        enableSorting: false,
        header: "Actions",
        cell: ({ row }) => {
          const product = row.original;
          const hasDesc = !!product.product_description;
          const hasSpecs = !!product.product_specs;
          const hasRequestedContent = mode === "description" ? hasDesc : mode === "specs" ? hasSpecs : hasDesc && hasSpecs;
          const previewDesc = genStates[product.id]?.description || product.product_description;
          const previewSpecs = genStates[product.id]?.specs || product.product_specs;
          const canPreview = !!(previewDesc || previewSpecs);
          const isExpanded = expandedIds.has(product.id);

          return (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={isGenerating}
                onClick={() => onGenerate([product.id])}
                className="rounded-md"
              >
                {hasRequestedContent ? <RotateCcw className="size-3" /> : <Sparkles className="size-3" />}
                {hasRequestedContent ? "Redo" : "Generate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!canPreview}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Hide generated content" : "Preview generated content"}
                onClick={() => onToggleExpand(product.id)}
                className="rounded-md text-muted-foreground"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-180")} />
              </Button>
            </div>
          );
        },
      },
    ],
    [
      allVisibleSelected,
      expandedIds,
      genStates,
      isGenerating,
      mode,
      onGenerate,
      onToggleExpand,
      onToggleSelect,
      onToggleVisibleSelection,
      selected,
      someVisibleSelected,
      visibleIds,
    ]
  );

  // TanStack Table intentionally returns table-model helpers; sorting state remains local and explicit here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: products,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;

  if (products.length === 0) {
    return (
      <div className="border-t border-border/60 py-14 text-center">
        <Package className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No products match your filter</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border-t border-border/60">
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-[11px]">
          <thead className="bg-muted/35">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border/70">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className={cn(
                        columnClassName(header.column.id),
                        "px-2 py-2 text-left align-middle font-semibold text-muted-foreground"
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex max-w-full items-center gap-1 rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                            header.column.id === "price" || header.column.id === "stock" ? "justify-end" : "justify-start"
                          )}
                        >
                          <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                          {sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3 shrink-0" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3 shrink-0" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 shrink-0 opacity-45" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => {
              const product = row.original;
              const previewDesc = genStates[product.id]?.description || product.product_description;
              const previewSpecs = genStates[product.id]?.specs || product.product_specs;
              const isExpanded = expandedIds.has(product.id);
              const checked = selected.has(product.id);

              return (
                <React.Fragment key={row.id}>
                  <tr
                    data-state={checked ? "selected" : undefined}
                    className="border-b border-border/50 bg-background transition-colors hover:bg-muted/30 data-[state=selected]:bg-muted/45"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          columnClassName(cell.column.id),
                          "px-2 py-2 align-middle text-muted-foreground"
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  <AnimatePresence>
                    {isExpanded && (previewDesc || previewSpecs) ? (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-b border-border/50 bg-muted/20"
                      >
                        <td colSpan={row.getVisibleCells().length} className="p-0">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                            className="overflow-hidden"
                          >
                            <div className="grid gap-3 px-5 py-4 lg:grid-cols-2">
                              {previewDesc ? (
                                <div className="rounded-md border border-border bg-background p-3">
                                  <div className="mb-2 flex items-center gap-1.5">
                                    <Sparkles className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs font-medium text-foreground">Description</span>
                                  </div>
                                  <ContentPreview text={previewDesc} />
                                </div>
                              ) : null}
                              {previewSpecs ? (
                                <div className="rounded-md border border-border bg-background p-3">
                                  <div className="mb-2 flex items-center gap-1.5">
                                    <ListChecks className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs font-medium text-foreground">Specifications</span>
                                  </div>
                                  <ContentPreview text={previewSpecs} />
                                </div>
                              ) : null}
                            </div>
                          </motion.div>
                        </td>
                      </motion.tr>
                    ) : null}
                  </AnimatePresence>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
