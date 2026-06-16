"use client";

import * as React from "react";
import { Reorder } from "framer-motion";
import {
  Trash2,
  Edit2,
  GripVertical,
  Loader2,
  Bike,
  Search,
  Check,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { StoreRental } from "@/lib/types/store";
import { StoreRentalBookingsPanel } from "@/components/settings/store-rental-bookings-panel";

interface RentalProduct {
  id: string;
  description: string;
  display_name?: string | null;
  category?: string | null;
  category_name?: string | null;
  primary_image_url?: string | null;
  card_url?: string | null;
  thumbnail_url?: string | null;
}

interface RentalRow extends StoreRental {
  product_id: string;
}

export type RentalsTab = "products" | "bookings";

interface RentalFormData {
  product_id: string;
  description: string;
  price_per_hour: string;
  price_per_day: string;
  is_available: boolean;
}

const BLANK_FORM: RentalFormData = {
  product_id: "",
  description: "",
  price_per_hour: "",
  price_per_day: "",
  is_available: true,
};

/** Fixed-height rental form — body scrolls, header/footer stay put. */
const RENTAL_DIALOG_CLASS =
  "flex !flex-col h-[min(85vh,40rem)] max-h-[85vh] w-full max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl";

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function productLabel(product: RentalProduct) {
  return product.display_name?.trim() || product.description;
}

function productImage(product: RentalProduct) {
  return product.primary_image_url || product.card_url || product.thumbnail_url || null;
}

function rentalSummary(rental: RentalRow): string {
  const parts: string[] = [];

  if (rental.price_per_hour != null) {
    parts.push(`${formatPrice(rental.price_per_hour)}/hr`);
  }

  if (rental.price_per_day != null) {
    parts.push(`${formatPrice(rental.price_per_day)}/day`);
  }

  parts.push(rental.is_available ? "Available" : "Unavailable");

  if (rental.category) {
    parts.push(rental.category);
  }

  return parts.join(" · ");
}

export function StoreRentalsManager({
  activeTab = "products",
  addRequest = 0,
}: {
  activeTab?: RentalsTab;
  addRequest?: number;
} = {}) {
  const [rentals, setRentals] = React.useState<RentalRow[]>([]);
  const [products, setProducts] = React.useState<RentalProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingRental, setEditingRental] = React.useState<RentalRow | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<RentalFormData>(BLANK_FORM);
  const [productSearch, setProductSearch] = React.useState("");

  const productById = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const rentedProductIds = React.useMemo(
    () => new Set(rentals.map((rental) => rental.product_id)),
    [rentals],
  );

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [rentalsRes, productsRes] = await Promise.all([
        fetch("/api/store/rentals"),
        fetch("/api/products?pageSize=500&status=active&stock=in-stock"),
      ]);

      let nextProducts: RentalProduct[] = [];
      if (productsRes.ok) {
        const data = await productsRes.json();
        nextProducts = data.products ?? [];
        setProducts(nextProducts);
      }

      if (rentalsRes.ok) {
        const data = await rentalsRes.json();
        const rows: RentalRow[] = (data.rentals ?? []).map((rental: StoreRental & { product_id: string }) => {
          const product = nextProducts.find((item) => item.id === rental.product_id);
          return {
            ...rental,
            product_id: rental.product_id,
            name: product ? productLabel(product) : "Unknown product",
            category: product?.category_name || product?.category || null,
            image_url: product ? productImage(product) : null,
          };
        });
        setRentals(rows);
      }
    } catch (err) {
      console.error("Error fetching rentals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAdd = React.useCallback(() => {
    setEditingRental(null);
    setFormData(BLANK_FORM);
    setProductSearch("");
    setIsDialogOpen(true);
  }, []);

  React.useEffect(() => {
    if (addRequest > 0) openAdd();
  }, [addRequest, openAdd]);

  const openEdit = (rental: RentalRow) => {
    setEditingRental(rental);
    setFormData({
      product_id: rental.product_id,
      description: rental.description || "",
      price_per_hour:
        rental.price_per_hour != null ? String(rental.price_per_hour) : "",
      price_per_day: rental.price_per_day != null ? String(rental.price_per_day) : "",
      is_available: rental.is_available,
    });
    setProductSearch("");
    setIsDialogOpen(true);
  };

  const filteredProducts = React.useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return products.filter((product) => {
      if (editingRental && product.id === editingRental.product_id) return true;
      if (rentedProductIds.has(product.id)) return false;
      if (!query) return true;
      const label = productLabel(product).toLowerCase();
      const category = (product.category_name || product.category || "").toLowerCase();
      return label.includes(query) || category.includes(query);
    });
  }, [products, productSearch, rentedProductIds, editingRental]);

  const selectedProduct = formData.product_id ? productById.get(formData.product_id) : null;

  const handleSave = async () => {
    const pricePerHour = formData.price_per_hour.trim()
      ? parseFloat(formData.price_per_hour)
      : null;
    const pricePerDay = formData.price_per_day.trim()
      ? parseFloat(formData.price_per_day)
      : null;

    if (!editingRental && !formData.product_id) return;
    if (pricePerHour == null && pricePerDay == null) return;

    setSaving(true);
    try {
      if (editingRental) {
        const res = await fetch("/api/store/rentals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingRental.id,
            description: formData.description.trim() || null,
            price_per_hour: pricePerHour,
            price_per_day: pricePerDay,
            is_available: formData.is_available,
          }),
        });
        if (res.ok) {
          await fetchData();
          setIsDialogOpen(false);
        }
      } else {
        const res = await fetch("/api/store/rentals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: formData.product_id,
            description: formData.description.trim() || null,
            price_per_hour: pricePerHour,
            price_per_day: pricePerDay,
            is_available: formData.is_available,
          }),
        });
        if (res.ok) {
          await fetchData();
          setIsDialogOpen(false);
        }
      }
    } catch (err) {
      console.error("Error saving rental:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/store/rentals?id=${id}`, { method: "DELETE" });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("Error deleting rental:", err);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleReorder = async (newOrder: RentalRow[]) => {
    setRentals(newOrder);
    try {
      await Promise.all(
        newOrder.map((rental, index) =>
          fetch("/api/store/rentals", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: rental.id, display_order: index }),
          }),
        ),
      );
    } catch (err) {
      console.error("Error updating rental order:", err);
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (activeTab === "bookings") {
    return <StoreRentalBookingsPanel rentals={rentals} />;
  }

  return (
    <>
      {rentals.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-white py-12 text-center">
          <Bike className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-600">No rental products yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Add bikes or gear from your inventory to offer them for hire
          </p>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={rentals}
          onReorder={handleReorder}
          className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white"
        >
          {rentals.map((rental) => (
            <Reorder.Item key={rental.id} value={rental}>
              <div className="flex cursor-move items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50">
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>

                {rental.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rental.image_url}
                    alt={rental.name}
                    className="h-9 w-9 flex-shrink-0 rounded-md object-cover bg-gray-50"
                  />
                ) : (
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-gray-50">
                    <Bike className="h-4 w-4 text-gray-300" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-medium text-gray-900">{rental.name}</h4>
                  <p className="mt-0.5 text-xs text-gray-500">{rentalSummary(rental)}</p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(rental)}>
                    <Edit2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteConfirmId(rental.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          className={cn(
            RENTAL_DIALOG_CLASS,
            "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out",
          )}
        >
          <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-2">
            <DialogTitle>{editingRental ? "Edit rental" : "Add rental product"}</DialogTitle>
            <DialogDescription>
              {editingRental
                ? "Update pricing and availability for this rental listing."
                : "Choose a product from your catalogue and set hourly or daily hire rates."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
            <div className="flex flex-col gap-4 py-2">
            {!editingRental && (
              <div className="flex flex-col gap-2">
                <Label>Select product</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="rounded-md border border-border">
                  <div className="p-2 space-y-0.5">
                    {filteredProducts.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No available products found
                      </p>
                    ) : (
                      filteredProducts.map((product) => {
                        const image = productImage(product);
                        const selected = formData.product_id === product.id;
                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({ ...prev, product_id: product.id }))
                            }
                            className={cn(
                              "w-full flex items-center gap-2.5 p-2 rounded-md text-left transition-colors cursor-pointer",
                              selected ? "bg-accent" : "hover:bg-accent/60",
                            )}
                          >
                            {image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={image}
                                alt={productLabel(product)}
                                className="h-10 w-10 rounded-md object-cover bg-muted flex-shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                <Bike className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{productLabel(product)}</p>
                              {(product.category_name || product.category) && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {product.category_name || product.category}
                                </p>
                              )}
                            </div>
                            {selected && <Check className="h-4 w-4 text-foreground flex-shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {editingRental && selectedProduct && (
              <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3">
                {rentalImage(editingRental) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rentalImage(editingRental)!}
                    alt={editingRental.name}
                    className="h-12 w-12 rounded-md object-cover bg-muted"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center">
                    <Bike className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{editingRental.name}</p>
                  {editingRental.category && (
                    <p className="text-xs text-muted-foreground">{editingRental.category}</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="price-per-hour">Price per hour (AUD)</Label>
                <Input
                  id="price-per-hour"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price_per_hour}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, price_per_hour: e.target.value }))
                  }
                  placeholder="e.g. 25"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price-per-day">Price per day (AUD)</Label>
                <Input
                  id="price-per-day"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price_per_day}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, price_per_day: e.target.value }))
                  }
                  placeholder="e.g. 80"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rental-description">Rental description (optional)</Label>
              <Textarea
                id="rental-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="e.g. Includes helmet and lock. Minimum 2-hour hire."
                rows={3}
              />
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={formData.is_available}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_available: checked === true }))
                }
              />
              Available to hire now
            </label>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                saving ||
                (!editingRental && !formData.product_id) ||
                (!formData.price_per_hour.trim() && !formData.price_per_day.trim())
              }
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingRental ? "Save changes" : "Add rental"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent className="animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove rental listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product from your Rentals tab. The product stays in your catalogue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function rentalImage(rental: RentalRow) {
  return rental.image_url || null;
}
