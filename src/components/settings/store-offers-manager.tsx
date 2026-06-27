"use client";

import * as React from "react";
import {
  Trash2,
  Edit2,
  Loader2,
  Gift,
  Search,
  Check,
  Package,
  Wrench,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { StoreBundleOffer, StoreService } from "@/lib/types/store";

interface CatalogProduct {
  id: string;
  description: string;
  display_name?: string | null;
  category_name?: string | null;
  primary_image_url?: string | null;
  card_url?: string | null;
  thumbnail_url?: string | null;
  price?: number | null;
}

type BuyType = "product" | "service";

interface OfferFormData {
  name: string;
  description: string;
  buy_type: BuyType;
  buy_product_id: string;
  buy_service_id: string;
  free_product_ids: string[];
  expires_at: string;
}

const BLANK_FORM: OfferFormData = {
  name: "",
  description: "",
  buy_type: "service",
  buy_product_id: "",
  buy_service_id: "",
  free_product_ids: [],
  expires_at: "",
};

const OFFER_DIALOG_CLASS =
  "flex !flex-col h-[min(90vh,44rem)] max-h-[90vh] w-full max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl";

function productLabel(product: CatalogProduct) {
  return product.display_name?.trim() || product.description;
}

function productImage(product: CatalogProduct) {
  return product.primary_image_url || product.card_url || product.thumbnail_url || null;
}

function defaultExpiryDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return format(date, "yyyy-MM-dd");
}

function formatExpiryLabel(value: string) {
  try {
    return format(parseISO(value), "d MMM yyyy");
  } catch {
    return value;
  }
}

export function StoreOffersManager({ addRequest = 0 }: { addRequest?: number } = {}) {
  const [offers, setOffers] = React.useState<StoreBundleOffer[]>([]);
  const [products, setProducts] = React.useState<CatalogProduct[]>([]);
  const [services, setServices] = React.useState<StoreService[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingOffer, setEditingOffer] = React.useState<StoreBundleOffer | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<OfferFormData>(BLANK_FORM);
  const [productSearch, setProductSearch] = React.useState("");
  const [freeSearch, setFreeSearch] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const productById = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const serviceById = React.useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [offersRes, productsRes, servicesRes] = await Promise.all([
        fetch("/api/store/offers"),
        fetch("/api/products?pageSize=500&status=active&stock=in-stock"),
        fetch("/api/store/services"),
      ]);

      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products ?? []);
      }

      if (servicesRes.ok) {
        const data = await servicesRes.json();
        setServices(data.services ?? []);
      }

      if (offersRes.ok) {
        const data = await offersRes.json();
        setOffers(data.offers ?? []);
      }
    } catch (err) {
      console.error("Error fetching offers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAdd = React.useCallback(() => {
    setEditingOffer(null);
    setFormData({ ...BLANK_FORM, expires_at: defaultExpiryDate() });
    setProductSearch("");
    setFreeSearch("");
    setError(null);
    setIsDialogOpen(true);
  }, []);

  React.useEffect(() => {
    if (addRequest > 0) openAdd();
  }, [addRequest, openAdd]);

  const openEdit = (offer: StoreBundleOffer) => {
    setEditingOffer(offer);
    setFormData({
      name: offer.name,
      description: offer.description ?? "",
      buy_type: offer.buy_service_id ? "service" : "product",
      buy_product_id: offer.buy_product_id ?? "",
      buy_service_id: offer.buy_service_id ?? "",
      free_product_ids: offer.free_product_ids ?? [],
      expires_at: offer.expires_at ? format(parseISO(offer.expires_at), "yyyy-MM-dd") : defaultExpiryDate(),
    });
    setProductSearch("");
    setFreeSearch("");
    setError(null);
    setIsDialogOpen(true);
  };

  const filteredProducts = React.useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter((product) => productLabel(product).toLowerCase().includes(q))
      .slice(0, 50);
  }, [productSearch, products]);

  const filteredFreeProducts = React.useMemo(() => {
    const q = freeSearch.trim().toLowerCase();
    const buyProductId = formData.buy_type === "product" ? formData.buy_product_id : null;
    const base = products.filter((product) => product.id !== buyProductId);
    if (!q) return base.slice(0, 50);
    return base
      .filter((product) => productLabel(product).toLowerCase().includes(q))
      .slice(0, 50);
  }, [freeSearch, formData.buy_product_id, formData.buy_type, products]);

  const toggleFreeProduct = (productId: string) => {
    setFormData((prev) => {
      const exists = prev.free_product_ids.includes(productId);
      return {
        ...prev,
        free_product_ids: exists
          ? prev.free_product_ids.filter((id) => id !== productId)
          : [...prev.free_product_ids, productId],
      };
    });
  };

  const handleSave = async () => {
    setError(null);

    if (!formData.name.trim()) {
      setError("Offer name is required.");
      return;
    }

    if (formData.buy_type === "product" && !formData.buy_product_id) {
      setError("Select the product customers must buy.");
      return;
    }

    if (formData.buy_type === "service" && !formData.buy_service_id) {
      setError("Select the service customers must book.");
      return;
    }

    if (formData.free_product_ids.length === 0) {
      setError("Select at least one free product.");
      return;
    }

    if (!formData.expires_at) {
      setError("Expiry date is required.");
      return;
    }

    const expiresAt = new Date(`${formData.expires_at}T23:59:59`).toISOString();

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      buy_product_id: formData.buy_type === "product" ? formData.buy_product_id : null,
      buy_service_id: formData.buy_type === "service" ? formData.buy_service_id : null,
      free_product_ids: formData.free_product_ids,
      expires_at: expiresAt,
    };

    try {
      setSaving(true);
      const response = await fetch("/api/store/offers", {
        method: editingOffer ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingOffer ? { id: editingOffer.id, ...payload } : payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to save offer.");
        return;
      }

      setIsDialogOpen(false);
      await fetchData();
    } catch (err) {
      console.error("Error saving offer:", err);
      setError("Failed to save offer.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const response = await fetch(`/api/store/offers?id=${deleteConfirmId}`, { method: "DELETE" });
      if (response.ok) {
        setDeleteConfirmId(null);
        await fetchData();
      }
    } catch (err) {
      console.error("Error deleting offer:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {offers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-gray-100">
            <Gift className="h-5 w-5 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">No bundle offers yet</h3>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            Create a buy-one-get-free bundle — for example, book a general service and include a free tube, tyre levers and gels.
          </p>
          <Button className="mt-5 rounded-md" onClick={openAdd}>
            Create offer
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const buyName = offer.buy_product_id
              ? productById.get(offer.buy_product_id)
                ? productLabel(productById.get(offer.buy_product_id)!)
                : "Product"
              : serviceById.get(offer.buy_service_id ?? "")
                ? serviceById.get(offer.buy_service_id ?? "")!.name
                : "Service";

            const freeNames = (offer.free_product_ids ?? [])
              .map((id) => productById.get(id))
              .filter(Boolean)
              .map((product) => productLabel(product!));

            const isExpired = new Date(offer.expires_at).getTime() <= Date.now();

            return (
              <div
                key={offer.id}
                className="flex flex-col gap-4 rounded-md border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{offer.name}</h3>
                    {isExpired ? (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                        Expired
                      </span>
                    ) : (
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    Buy <span className="font-medium text-gray-900">{buyName}</span>
                    {" · "}
                    Get {freeNames.length} free item{freeNames.length === 1 ? "" : "s"}
                  </p>
                  {freeNames.length > 0 && (
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500">{freeNames.join(", ")}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    Expires {formatExpiryLabel(offer.expires_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" className="rounded-md" onClick={() => openEdit(offer)}>
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-md text-red-600 hover:text-red-700"
                    onClick={() => setDeleteConfirmId(offer.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className={OFFER_DIALOG_CLASS}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-6 py-4">
            <DialogTitle>{editingOffer ? "Edit bundle offer" : "Create bundle offer"}</DialogTitle>
            <DialogDescription>
              Buy X, get Y free. Customers purchase or book one item and receive selected products at no extra cost.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="offer-name">Offer name</Label>
              <Input
                id="offer-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Service bundle — free essentials"
                className="rounded-md"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer-description">Description (optional)</Label>
              <Textarea
                id="offer-description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Short summary shown on the storefront card"
                className="min-h-[72px] rounded-md"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer-expires">Expiry date</Label>
              <Input
                id="offer-expires"
                type="date"
                value={formData.expires_at}
                onChange={(e) => setFormData((prev) => ({ ...prev, expires_at: e.target.value }))}
                className="rounded-md"
              />
            </div>

            <div className="space-y-3">
              <Label>What must the customer buy?</Label>
              <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      buy_type: "service",
                      buy_product_id: "",
                    }))
                  }
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    formData.buy_type === "service"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  <Wrench size={15} />
                  Service
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      buy_type: "product",
                      buy_service_id: "",
                    }))
                  }
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    formData.buy_type === "product"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  <Package size={15} />
                  Product
                </button>
              </div>

              {formData.buy_type === "service" ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                  {services.length === 0 ? (
                    <p className="px-2 py-4 text-center text-sm text-gray-500">
                      Add services under Storefront → Services first.
                    </p>
                  ) : (
                    services.map((service) => {
                      const selected = formData.buy_service_id === service.id;
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({ ...prev, buy_service_id: service.id }))
                          }
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                            selected ? "bg-gray-900 text-white" : "hover:bg-gray-50",
                          )}
                        >
                          <span className="font-medium">{service.name}</span>
                          {selected && <Check className="h-4 w-4" />}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search products to buy..."
                      className="rounded-md pl-9"
                    />
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                    {filteredProducts.map((product) => {
                      const selected = formData.buy_product_id === product.id;
                      const image = productImage(product);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              buy_product_id: product.id,
                              free_product_ids: prev.free_product_ids.filter((id) => id !== product.id),
                            }))
                          }
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
                            selected ? "bg-gray-900 text-white" : "hover:bg-gray-50",
                          )}
                        >
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
                            {image ? (
                              <Image src={image} alt="" fill className="object-contain p-0.5" sizes="40px" />
                            ) : (
                              <Package className="m-auto h-4 w-4 text-gray-300" />
                            )}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {productLabel(product)}
                          </span>
                          {selected && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3">
              <Label>Free products included</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={freeSearch}
                  onChange={(e) => setFreeSearch(e.target.value)}
                  placeholder="Search products to include for free..."
                  className="rounded-md pl-9"
                />
              </div>

              {formData.free_product_ids.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.free_product_ids.map((id) => {
                    const product = productById.get(id);
                    if (!product) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        {productLabel(product)}
                        <button
                          type="button"
                          onClick={() => toggleFreeProduct(id)}
                          className="rounded-md p-0.5 hover:bg-gray-100"
                          aria-label={`Remove ${productLabel(product)}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                {filteredFreeProducts.map((product) => {
                  const selected = formData.free_product_ids.includes(product.id);
                  const image = productImage(product);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => toggleFreeProduct(product.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
                        selected ? "bg-gray-100 ring-1 ring-gray-300" : "hover:bg-gray-50",
                      )}
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
                        {image ? (
                          <Image src={image} alt="" fill className="object-contain p-0.5" sizes="40px" />
                        ) : (
                          <Package className="m-auto h-4 w-4 text-gray-300" />
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {productLabel(product)}
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-gray-700" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-gray-100 px-6 py-4">
            <Button variant="outline" className="rounded-md" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-md" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingOffer ? "Save changes" : "Create offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent className="rounded-md bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this offer?</AlertDialogTitle>
            <AlertDialogDescription>
              This bundle will be removed from your storefront immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-md bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
