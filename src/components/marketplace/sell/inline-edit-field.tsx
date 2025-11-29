"use client";

import * as React from "react";
import { Edit2, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfidenceBadge } from "./confidence-badge";
import { cn } from "@/lib/utils";

// ============================================================
// Inline Editable Field
// ============================================================

interface InlineEditFieldProps {
  label: string;
  value: string;
  confidence?: number;
  onSave: (newValue: string) => void;
  multiline?: boolean;
  placeholder?: string;
}

export function InlineEditField({
  label,
  value,
  confidence,
  onSave,
  multiline = false,
  placeholder = "Edit value",
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(value);

  const handleSave = () => {
    onSave(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  React.useEffect(() => {
    setEditValue(value);
  }, [value]);

  return (
    <div className={cn(
      "group rounded-md border-2 transition-colors p-4",
      confidence && confidence < 70 ? "border-yellow-300 bg-yellow-50" : "border-gray-200 bg-white"
    )}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-gray-900">{label}</label>
          {confidence !== undefined && (
            <ConfidenceBadge confidence={confidence} size="sm" showIcon={false} showPercentage={true} />
          )}
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-gray-900"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          {multiline ? (
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={placeholder}
              className="rounded-md"
              rows={4}
              autoFocus
            />
          ) : (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={placeholder}
              className="rounded-md"
              autoFocus
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800"
            >
              <Check className="h-3.5 w-3.5 inline mr-1" />
              Save
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
            >
              <X className="h-3.5 w-3.5 inline mr-1" />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-gray-900">{value || <span className="text-gray-400 italic">Not provided</span>}</p>
      )}
    </div>
  );
}

