"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Loader2, RefreshCw } from "@/components/layout/app-sidebar/dashboard-icons";
import { GmailLogo } from "@/components/genie/gmail-logo";
import { LightspeedLogo } from "@/components/genie/lightspeed-logo";
import { NestLogo } from "@/components/genie/nest-logo";
import {
  enquirySummary,
  relativeTime,
  senderName,
} from "@/components/settings/customer-inquiries/parts";
import {
  bentoFullPageShellClassName,
  bentoOuterWrapClassName,
  getBentoShellStyles,
} from "@/components/settings/bento-variant-styles";
import { useDismissibleIds } from "@/components/settings/bento-inbox-item-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchCustomerInquiries } from "@/lib/customer-inquiries/client";
import type { CustomerInquiryListItem } from "@/lib/customer-inquiries/types";
import {
  fetchMissingBrandProducts,
  saveProductBrand,
  suggestProductBrandsBatch,
} from "@/lib/missing-brands/client";
import type { BrandSuggestion, MissingBrandProduct } from "@/lib/missing-brands/types";
import {
  fetchMissingCategoryProducts,
  saveProductCategory,
  suggestProductCategoriesBatch,
} from "@/lib/missing-categories/client";
import type { CategorySuggestion, MissingCategoryProduct } from "@/lib/missing-categories/types";
import { isNestConversationUnread } from "@/lib/nest/conversation-read-state";
import {
  filterNestCustomerChats,
  sanitiseNestConversationsResponse,
  type NestConversationListItem,
  type NestConversationsResponse,
} from "@/lib/nest/types";
import { cn } from "@/lib/utils";

type ActionRowKind = "enquiry" | "nest" | "missing-brand" | "assign-category";

type SimpleActionRow = {
  key: string;
  kind: ActionRowKind;
  sortAt: number;
  title: string;
  subtitle: string;
  detail: string;
  when: string | null;
  primaryLabel: string;
  primaryHref?: string;
  enquiry?: CustomerInquiryListItem;
  nest?: NestConversationListItem;
  brandProduct?: MissingBrandProduct;
  categoryProduct?: MissingCategoryProduct;
  brandSuggestion?: BrandSuggestion | null;
  categorySuggestion?: CategorySuggestion | null;
};

const TYPE_LABELS: Record<ActionRowKind, string> = {
  enquiry: "Customer enquiry",
  nest: "Nest message",
  "missing-brand": "Missing brand",
  "assign-category": "Assign category",
};

const VARIANT = "light-beige-floating" as const;

async function fetchNestList(): Promise<NestConversationListItem[]> {
  const res = await fetch("/api/store/nest-messages?listOnly=1", { cache: "no-store" });
  const data = (await res.json()) as NestConversationsResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not load Nest messages.");
  }
  const sanitised = sanitiseNestConversationsResponse({
    chats: Array.isArray(data.chats) ? data.chats : [],
    selectedChatId: null,
    conversation: null,
  });
  return filterNestCustomerChats(sanitised.chats).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

function nestDisplayTitle(chat: NestConversationListItem): string {
  return (
    chat.displayName?.trim() ||
    chat.title?.trim() ||
    chat.participantHandle?.trim() ||
    chat.chatId
  );
}

function TypeBadge({ kind }: { kind: ActionRowKind }) {
  return (
    <span className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700">
      {TYPE_LABELS[kind]}
    </span>
  );
}

function SourceMark({ kind }: { kind: ActionRowKind }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white">
      {kind === "enquiry" ? (
        <GmailLogo className="h-4 w-auto max-w-[22px] object-contain" />
      ) : kind === "nest" ? (
        <NestLogo className="h-full w-full rounded-none object-cover" />
      ) : (
        <LightspeedLogo className="h-[18px] w-[18px]" />
      )}
    </span>
  );
}

function buildRows({
  enquiries,
  nestChats,
  brandProducts,
  categoryProducts,
  brandSuggestions,
  categorySuggestions,
}: {
  enquiries: CustomerInquiryListItem[];
  nestChats: NestConversationListItem[];
  brandProducts: MissingBrandProduct[];
  categoryProducts: MissingCategoryProduct[];
  brandSuggestions: Record<string, BrandSuggestion | null>;
  categorySuggestions: Record<string, CategorySuggestion | null>;
}): SimpleActionRow[] {
  const rows: SimpleActionRow[] = [];

  for (const enquiry of enquiries) {
    rows.push({
      key: `enquiry:${enquiry.id}`,
      kind: "enquiry",
      sortAt: enquiry.received_at ? new Date(enquiry.received_at).getTime() : 0,
      title: senderName(enquiry),
      subtitle: enquiry.subject?.trim() || "No subject",
      detail: enquiry.draft_body?.trim() || enquirySummary(enquiry),
      when: enquiry.received_at,
      primaryLabel: "Respond",
      primaryHref: "/settings/store/customer-inquiries",
      enquiry,
    });
  }

  for (const chat of nestChats) {
    if (!isNestConversationUnread(chat)) continue;
    rows.push({
      key: `nest:${chat.chatId}`,
      kind: "nest",
      sortAt: new Date(chat.lastMessageAt).getTime(),
      title: nestDisplayTitle(chat),
      subtitle: chat.participantHandle?.trim() || "—",
      detail: chat.preview?.trim() || "No preview",
      when: chat.lastMessageAt,
      primaryLabel: "Reply",
      primaryHref: "/settings/store/nest",
      nest: chat,
    });
  }

  for (const product of brandProducts) {
    const suggestion = brandSuggestions[product.id] ?? product.suggestion ?? null;
    rows.push({
      key: `missing-brand:${product.id}`,
      kind: "missing-brand",
      sortAt: 0,
      title: product.name,
      subtitle: product.sku,
      detail: suggestion?.brand
        ? `Suggested ${suggestion.brand}`
        : product.preview,
      when: null,
      primaryLabel: suggestion?.brand ? "Approve" : "Add brand",
      brandProduct: product,
      brandSuggestion: suggestion,
    });
  }

  for (const product of categoryProducts) {
    const suggestion = categorySuggestions[product.id] ?? product.suggestion ?? null;
    rows.push({
      key: `assign-category:${product.id}`,
      kind: "assign-category",
      sortAt: 0,
      title: product.name,
      subtitle: [product.sku, product.brand].filter(Boolean).join(" · "),
      detail: suggestion?.categoryLabel
        ? `Suggested ${suggestion.categoryLabel}`
        : product.preview,
      when: null,
      primaryLabel: suggestion?.categoryId ? "Approve" : "Assign category",
      categoryProduct: product,
      categorySuggestion: suggestion,
    });
  }

  return rows.sort((a, b) => {
    if (a.sortAt !== b.sortAt) return b.sortAt - a.sortAt;
    return a.title.localeCompare(b.title);
  });
}

export function ActionsSimpleBentoTable({ className }: { className?: string }) {
  const shell = getBentoShellStyles(VARIANT);
  const panelClassName = cn("flex min-h-0 flex-1 flex-col", shell.panelClassName);
  const { isDismissed, dismiss, ignoringId } = useDismissibleIds();

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [enquiries, setEnquiries] = React.useState<CustomerInquiryListItem[]>([]);
  const [nestChats, setNestChats] = React.useState<NestConversationListItem[]>([]);
  const [brandProducts, setBrandProducts] = React.useState<MissingBrandProduct[]>([]);
  const [categoryProducts, setCategoryProducts] = React.useState<MissingCategoryProduct[]>([]);
  const [brandSuggestions, setBrandSuggestions] = React.useState<Record<string, BrandSuggestion | null>>({});
  const [categorySuggestions, setCategorySuggestions] = React.useState<
    Record<string, CategorySuggestion | null>
  >({});
  const [approvingKey, setApprovingKey] = React.useState<string | null>(null);

  const loadBrandSuggestions = React.useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) return;
    try {
      const data = await suggestProductBrandsBatch(productIds);
      const next: Record<string, BrandSuggestion | null> = {};
      for (const entry of data.suggestions ?? []) {
        next[entry.productId] = entry.brand
          ? {
              brand: entry.brand,
              manufacturerId: entry.manufacturerId,
              confidence: entry.confidence,
              source: entry.source,
            }
          : null;
      }
      setBrandSuggestions((current) => ({ ...current, ...next }));
    } catch (error) {
      console.error("[ActionsSimpleBentoTable] brand suggest failed:", error);
    }
  }, []);

  const loadCategorySuggestions = React.useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) return;
    try {
      const data = await suggestProductCategoriesBatch(productIds);
      const next: Record<string, CategorySuggestion | null> = {};
      for (const entry of data.suggestions ?? []) {
        next[entry.productId] = entry.categoryId
          ? {
              categoryId: entry.categoryId,
              categoryLabel: entry.categoryLabel,
              confidence: entry.confidence,
              source: entry.source,
            }
          : null;
      }
      setCategorySuggestions((current) => ({ ...current, ...next }));
    } catch (error) {
      console.error("[ActionsSimpleBentoTable] category suggest failed:", error);
    }
  }, []);

  const load = React.useCallback(
    async (options?: { refresh?: boolean }) => {
      if (options?.refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadError(null);

      try {
        const [enquiryData, nestData, brandData, categoryData] = await Promise.all([
          fetchCustomerInquiries("draft_ready"),
          fetchNestList(),
          fetchMissingBrandProducts(30),
          fetchMissingCategoryProducts(30),
        ]);

        const loadedBrands = brandData.products ?? [];
        const loadedCategories = categoryData.products ?? [];

        setEnquiries(enquiryData.inquiries ?? []);
        setNestChats(nestData);
        setBrandProducts(loadedBrands);
        setCategoryProducts(loadedCategories);

        const seededBrands: Record<string, BrandSuggestion | null> = {};
        const uncachedBrandIds: string[] = [];
        for (const item of loadedBrands) {
          if (item.suggestion !== undefined) {
            seededBrands[item.id] = item.suggestion;
          } else {
            uncachedBrandIds.push(item.id);
          }
        }
        setBrandSuggestions(seededBrands);
        void loadBrandSuggestions(uncachedBrandIds);

        const seededCategories: Record<string, CategorySuggestion | null> = {};
        const uncachedCategoryIds: string[] = [];
        for (const item of loadedCategories) {
          if (item.suggestion !== undefined) {
            seededCategories[item.id] = item.suggestion;
          } else {
            uncachedCategoryIds.push(item.id);
          }
        }
        setCategorySuggestions(seededCategories);
        void loadCategorySuggestions(uncachedCategoryIds);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Could not load actions.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadBrandSuggestions, loadCategorySuggestions],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleApproveBrand(row: SimpleActionRow) {
    const product = row.brandProduct;
    const brand = row.brandSuggestion?.brand?.trim();
    if (!product || !brand || approvingKey) return;

    setApprovingKey(row.key);
    try {
      await saveProductBrand(product.id, brand);
      setBrandProducts((current) => current.filter((item) => item.id !== product.id));
      dismiss(row.key);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to save brand.");
    } finally {
      setApprovingKey(null);
    }
  }

  async function handleApproveCategory(row: SimpleActionRow) {
    const product = row.categoryProduct;
    const categoryId = row.categorySuggestion?.categoryId?.trim();
    if (!product || !categoryId || approvingKey) return;

    setApprovingKey(row.key);
    try {
      await saveProductCategory(product.id, categoryId);
      setCategoryProducts((current) => current.filter((item) => item.id !== product.id));
      dismiss(row.key);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to save category.");
    } finally {
      setApprovingKey(null);
    }
  }

  const rows = buildRows({
    enquiries,
    nestChats,
    brandProducts,
    categoryProducts,
    brandSuggestions,
    categorySuggestions,
  }).filter((row) => !isDismissed(row.key));

  return (
    <div className={bentoFullPageShellClassName(className)}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">All actions</h2>
          <p className="mt-0.5 text-[11px] text-gray-600">
            Open enquiries, Nest messages, and Lightspeed catalog fixes in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ refresh: true })}
          disabled={loading || refreshing}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          aria-label="Refresh actions"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className={bentoOuterWrapClassName(VARIANT)}>
        <div className={panelClassName}>
          {loadError ? (
            <div className="mx-3 mb-3 rounded-md border border-red-100 bg-white px-3 py-2.5 text-[12px] text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{loadError}</span>
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto px-1 pb-3">
            {loading ? (
              <div className="flex items-center justify-center py-24 text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading actions…
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
                <p className="text-sm font-medium text-gray-900">You&apos;re all caught up</p>
                <p className="mt-1 max-w-sm text-sm text-gray-500">
                  No open enquiries, unread Nest messages, or catalog fixes need attention.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-[#f2f1ee]/95 backdrop-blur-sm">
                  <TableRow className="border-black/[0.06] hover:bg-transparent">
                    <TableHead className="w-[52px] pl-3">Source</TableHead>
                    <TableHead className="w-[140px]">Type</TableHead>
                    <TableHead className="min-w-[160px]">Item</TableHead>
                    <TableHead className="min-w-[220px]">Detail</TableHead>
                    <TableHead className="hidden w-[88px] md:table-cell">When</TableHead>
                    <TableHead className="w-[120px] pr-3 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => {
                      const busy = ignoringId === row.key || approvingKey === row.key;
                      const canApproveBrand =
                        row.kind === "missing-brand" && Boolean(row.brandSuggestion?.brand);
                      const canApproveCategory =
                        row.kind === "assign-category" && Boolean(row.categorySuggestion?.categoryId);

                      return (
                        <TableRow
                          key={row.key}
                          className={cn(
                            "border-black/[0.05] transition-opacity hover:bg-white/70",
                            busy && "pointer-events-none opacity-45",
                          )}
                        >
                          <TableCell className="pl-3">
                            <SourceMark kind={row.kind} />
                          </TableCell>
                          <TableCell>
                            <TypeBadge kind={row.kind} />
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">{row.title}</p>
                              <p className="truncate text-xs text-gray-500">{row.subtitle}</p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[360px]">
                            <p className="line-clamp-2 text-sm text-gray-700">{row.detail}</p>
                          </TableCell>
                          <TableCell className="hidden text-xs text-gray-500 md:table-cell">
                            {row.when ? relativeTime(row.when) : "—"}
                          </TableCell>
                          <TableCell className="pr-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {row.primaryHref ? (
                                <Link
                                  href={row.primaryHref}
                                  className="inline-flex rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                >
                                  {row.primaryLabel}
                                </Link>
                              ) : canApproveBrand ? (
                                <button
                                  type="button"
                                  onClick={() => void handleApproveBrand(row)}
                                  disabled={busy}
                                  className="inline-flex rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                                >
                                  {approvingKey === row.key ? "Saving…" : "Approve"}
                                </button>
                              ) : canApproveCategory ? (
                                <button
                                  type="button"
                                  onClick={() => void handleApproveCategory(row)}
                                  disabled={busy}
                                  className="inline-flex rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
                                >
                                  {approvingKey === row.key ? "Saving…" : "Approve"}
                                </button>
                              ) : (
                                <Link
                                  href="/products"
                                  className="inline-flex rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                >
                                  {row.primaryLabel}
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => dismiss(row.key)}
                                disabled={busy}
                                className="inline-flex rounded-md px-2 py-1.5 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
                              >
                                Dismiss
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
