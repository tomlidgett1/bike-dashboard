"use client";

import * as React from "react";
import { Loader2, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

// ============================================================
// Store Category Display Manager
// Simple interface to rename auto-generated categories
// ============================================================

interface CategoryDisplay {
  category_name: string;
  display_name: string;
  product_count: number;
  has_override: boolean;
  override_id?: string;
}

export function StoreCategoryDisplayManager() {
  const [categories, setCategories] = React.useState<CategoryDisplay[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Fetch category names
  const fetchCategories = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/store/category-names');
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Start editing
  const handleEdit = (category: CategoryDisplay) => {
    setEditingId(category.category_name);
    setEditValue(category.display_name);
  };

  // Cancel editing
  const handleCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  // Save display name
  const handleSave = async (categoryName: string, overrideId?: string) => {
    if (!editValue.trim()) return;

    try {
      setSaving(true);

      if (overrideId) {
        // Update existing override
        await fetch('/api/store/categories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: overrideId,
            name: editValue,
          }),
        });
      } else {
        // Create new override
        await fetch('/api/store/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editValue,
            source: 'display_override',
            lightspeed_category_id: categoryName,
            product_ids: [],
          }),
        });
      }

      await fetchCategories();
      setEditingId(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving display name:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Customize how your categories appear on your store profile
        </h3>
      </div>

      {categories.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-600">
            No categories found. Add products to see categories here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map((category) => (
            <div
              key={category.category_name}
              className="flex items-center gap-3 p-3 border border-gray-200 rounded-md bg-white"
            >
              {editingId === category.category_name ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1"
                    placeholder="Display name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSave(category.category_name, category.override_id);
                      } else if (e.key === 'Escape') {
                        handleCancel();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSave(category.category_name, category.override_id)}
                    disabled={!editValue.trim() || saving}
                    className="h-8 w-8 p-0"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={saving}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {category.display_name}
                      </h4>
                      {category.category_name !== category.display_name && (
                        <span className="text-xs text-gray-500">
                          (was: {category.category_name})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {category.product_count} products
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(category)}
                    className="h-8 px-3 text-xs"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Rename
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}








