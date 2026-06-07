"use client";

import * as React from "react";
import { Reorder } from "framer-motion";
import {
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  Loader2,
  Clock,
  Tag,
  Bike,
  Search,
  Check,
  Package,
  CalendarDays,
} from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
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

type RentalsTab = "products" | "bookings";

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

const DIALOG_CLASS =
  "flex h-[min(32rem,85vh)] max-h-[min(32rem,85vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl";

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

export function StoreRentalsManager() {
  const [rentals, setRentals] = React.useState<RentalRow[]>([]);
  const [products, setProducts] = React.useState<RentalProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingRental, setEditingRental] = React.useState<RentalRow | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<RentalFormData>(BLANK_FORM);
  const [productSearch, setProductSearch] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<RentalsTab>("products");

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

  const openAdd = () => {
    setEditingRental(null);
    setFormData(BLANK_FORM);
    setProductSearch("");
    setIsDialogOpen(true);
  };

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

  const toggleAvailability = async (rental: RentalRow) => {
    const next = !rental.is_available;
    setRentals((prev) =>
      prev.map((item) => (item.id === rental.id ? { ...item, is_available: next } : item)),
    );
    await fetch("/api/store/rentals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rental.id, is_available: next }),
    }).catch(console.error);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("products")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "products"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <Package size={15} />
            Add product
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bookings")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "bookings"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            <CalendarDays size={15} />
            Manage bookings
          </button>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("products")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            activeTab === "products"
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          <Package size={15} />
          Add product
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bookings")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            activeTab === "bookings"
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          <CalendarDays size={15} />
          Manage bookings
        </button>
      </div>

      {activeTab === "bookings" ? (
        <StoreRentalBookingsPanel rentals={rentals} />
      ) : (
        <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Pick products from your catalogue and set hire rates. Shown on your store&apos;s Rentals tab.
        </p>
        <Button onClick={openAdd} size="sm">
          <Plus className="size-4" />
          Add rental
        </Button>
      </div>

      {rentals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Bike className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No rental products yet</p>
            <p className="text-xs text-muted-foreground">
              Add bikes or gear from your inventory to offer them for hire.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Reorder.Group axis="y" values={rentals} onReorder={handleReorder} className="space-y-2">
          {rentals.map((rental) => (
            <Reorder.Item key={rental.id} value={rental}>
              <div className="flex items-center gap-3 p-3 border border-border rounded-md transition-colors cursor-move bg-card hover:bg-accent/40">
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                </div>

                {rental.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={rental.image_url}
                    alt={rental.name}
                    className="h-12 w-12 rounded-md object-cover bg-muted flex-shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <Bike className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-foreground truncate">{rental.name}</h4>
                    <span
                      className={cn(
                        "flex-shrink-0 text-xs px-2 py-0.5 rounded-md font-medium",
                        rental.is_available
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {rental.is_available ? "Available" : "Unavailable"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {rental.price_per_hour != null && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatPrice(rental.price_per_hour)} / hr
                      </span>
                    )}
                    {rental.price_per_day != null && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Tag className="h-3 w-3" />
                        {formatPrice(rental.price_per_day)} / day
                      </span>
                    )}
                    {rental.category && (
                      <span className="text-xs text-muted-foreground truncate">{rental.category}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => toggleAvailability(rental)}
                  >
                    {rental.is_available ? "Mark unavailable" : "Mark available"}
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(rental)}>
                    <Edit2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteConfirmId(rental.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
        <DialogContent className={cn(DIALOG_CLASS, "animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out")}>
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle>{editingRental ? "Edit rental" : "Add rental product"}</DialogTitle>
            <DialogDescription>
              {editingRental
                ? "Update pricing and availability for this rental listing."
                : "Choose a product from your catalogue and set hourly or daily hire rates."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
            {!editingRental && (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <Label>Select product</Label>
                <div className="relative shrink-0">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
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
              <div className="flex items-center gap-3 rounded-md border border-border bg-white p-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
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

            <div className="space-y-2 shrink-0">
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

            <label className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
              <Checkbox
                checked={formData.is_available}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_available: checked === true }))
                }
              />
              Available to hire now
            </label>
          </div>

          <DialogFooter className="shrink-0 px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
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
      )}
    </div>
  );
}

function rentalImage(rental: RentalRow) {
  return rental.image_url || null;
}
