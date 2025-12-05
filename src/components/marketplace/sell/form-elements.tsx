"use client";

import * as React from "react";
import { Info, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ============================================================
// Form Field with Label and Error
// ============================================================

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  required = false,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-medium text-gray-900">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-gray-500 flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          {hint}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ============================================================
// Autocomplete Input with Suggestions
// ============================================================

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}

export function Autocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (value) {
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered.slice(0, 8));
      setIsOpen(filtered.length > 0);
    } else {
      setFilteredSuggestions([]);
      setIsOpen(false);
    }
  }, [value, suggestions]);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("rounded-md", className)}
        onFocus={() => value && setIsOpen(filteredSuggestions.length > 0)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      />
      {isOpen && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors"
              onClick={() => {
                onChange(suggestion);
                setIsOpen(false);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Chip Input (for tags/keywords)
// ============================================================

interface ChipInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxChips?: number;
}

export function ChipInput({ values, onChange, placeholder, maxChips = 10 }: ChipInputProps) {
  const [inputValue, setInputValue] = React.useState("");

  const addChip = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !values.includes(trimmed) && values.length < maxChips) {
      onChange([...values, trimmed]);
      setInputValue("");
    }
  };

  const removeChip = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {values.map((value, index) => (
          <div
            key={index}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-md"
          >
            {value}
            <button
              type="button"
              onClick={() => removeChip(index)}
              className="hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip();
            }
          }}
          placeholder={placeholder}
          className="rounded-md"
        />
        <button
          type="button"
          onClick={addChip}
          disabled={values.length >= maxChips}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Section Header
// ============================================================

interface SectionHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

export function SectionHeader({ title, description, className }: SectionHeaderProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-600">{description}</p>}
    </div>
  );
}

// ============================================================
// Info Box
// ============================================================

interface InfoBoxProps {
  children: React.ReactNode;
  className?: string;
}

export function InfoBox({ children, className }: InfoBoxProps) {
  return (
    <div className={cn("bg-white border border-gray-200 rounded-xl p-4", className)}>
      <div className="flex gap-3">
        <Info className="h-5 w-5 text-gray-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-gray-700">{children}</div>
      </div>
    </div>
  );
}

// ============================================================
// Price Input (with currency symbol)
// ============================================================

interface PriceInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function PriceInput({ value, onChange, placeholder, className }: PriceInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.]/g, "");
    if (val === "") {
      onChange(undefined);
    } else {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        onChange(num);
      }
    }
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">
        $
      </span>
      <Input
        type="text"
        inputMode="decimal"
        value={value !== undefined ? value : ""}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn("pl-7 rounded-md", className)}
      />
    </div>
  );
}

// ============================================================
// Year Selector
// ============================================================

interface YearSelectorProps {
  value: string | undefined;
  onChange: (value: string) => void;
  startYear?: number;
  endYear?: number;
  placeholder?: string;
}

export function YearSelector({
  value,
  onChange,
  startYear,
  endYear,
  placeholder = "Select year",
}: YearSelectorProps) {
  const currentYear = new Date().getFullYear();
  const start = startYear || currentYear - 30;
  const end = endYear || currentYear;

  const years = Array.from({ length: end - start + 1 }, (_, i) => (end - i).toString());

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="rounded-md">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={year}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}



