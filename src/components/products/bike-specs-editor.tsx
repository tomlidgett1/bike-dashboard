"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BikeIcon, AI_DISCOVER_ICON, getBikeSpecSectionIconName } from "@/components/ui/bike-icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BIKE_SPEC_SECTION_HINTS,
  hasBikeSpecs,
  parseBikeSpecs,
  type BikeSpecItem,
  type BikeSpecSection,
  type BikeSpecsData,
  type BikeSpecsMetadata,
} from "@/lib/types/bike-specs";
import { BikeSpecsSources } from "@/components/products/bike-specs-sources";

interface BikeSpecsEditorProps {
  productId: string;
  productName: string;
  initialSpecs: BikeSpecsData | null;
  onSaved: (specs: BikeSpecsData | null, isBicycle: boolean) => void;
  className?: string;
}

function emptySection(title: string): BikeSpecSection {
  return { title, specs: [{ label: "", value: "" }] };
}

function normaliseSections(sections: BikeSpecSection[]): Pick<BikeSpecsData, "sections"> {
  return {
    sections: sections
      .map((section) => ({
        title: section.title.trim(),
        specs: section.specs
          .map((spec) => ({
            label: spec.label.trim(),
            value: spec.value.trim(),
          }))
          .filter((spec) => spec.label && spec.value),
      }))
      .filter((section) => section.title && section.specs.length > 0),
  };
}

function buildPayload(
  sections: BikeSpecSection[],
  metadata: BikeSpecsMetadata | null
): BikeSpecsData {
  const payload = normaliseSections(sections);
  if (!hasBikeSpecs(payload)) {
    return { sections: [], metadata: metadata ?? undefined };
  }
  return metadata ? { ...payload, metadata } : payload;
}

export function BikeSpecsEditor({
  productId,
  productName,
  initialSpecs,
  onSaved,
  className,
}: BikeSpecsEditorProps) {
  const [sections, setSections] = React.useState<BikeSpecSection[]>(
    () => initialSpecs?.sections ?? []
  );
  const [metadata, setMetadata] = React.useState<BikeSpecsMetadata | null>(
    () => initialSpecs?.metadata ?? null
  );
  const [discovering, setDiscovering] = React.useState(false);
  const [polishing, setPolishing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [discoverMessage, setDiscoverMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSections(initialSpecs?.sections ?? []);
    setMetadata(initialSpecs?.metadata ?? null);
  }, [initialSpecs, productId]);

  const updateSpec = (
    sectionIndex: number,
    specIndex: number,
    field: keyof BikeSpecItem,
    value: string
  ) => {
    setSections((prev) =>
      prev.map((section, si) =>
        si !== sectionIndex
          ? section
          : {
              ...section,
              specs: section.specs.map((spec, spi) =>
                spi !== specIndex ? spec : { ...spec, [field]: value }
              ),
            }
      )
    );
  };

  const addSpec = (sectionIndex: number) => {
    setSections((prev) =>
      prev.map((section, index) =>
        index !== sectionIndex
          ? section
          : { ...section, specs: [...section.specs, { label: "", value: "" }] }
      )
    );
  };

  const removeSpec = (sectionIndex: number, specIndex: number) => {
    setSections((prev) =>
      prev.map((section, index) =>
        index !== sectionIndex
          ? section
          : {
              ...section,
              specs: section.specs.filter((_, spi) => spi !== specIndex),
            }
      )
    );
  };

  const addSection = () => {
    const nextTitle =
      BIKE_SPEC_SECTION_HINTS.find(
        (hint) => !sections.some((section) => section.title === hint)
      ) ?? "Other";
    setSections((prev) => [...prev, emptySection(nextTitle)]);
  };

  const removeSection = (sectionIndex: number) => {
    setSections((prev) => prev.filter((_, index) => index !== sectionIndex));
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setError(null);
    setDiscoverMessage("Searching the official brand website for specifications…");

    try {
      const response = await fetch("/api/products/bike-specs/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to discover specifications");
      }

      const parsed = parseBikeSpecs(data.bike_specs);
      if (!parsed) {
        throw new Error("Received invalid specification data");
      }

      setSections(parsed.sections);
      setMetadata(parsed.metadata ?? null);
      setDiscoverMessage(
        parsed.metadata?.primary_source_title
          ? `Specifications found on ${parsed.metadata.primary_source_title} and polished for listing.`
          : "Specifications found on the official brand website and polished for listing."
      );
      onSaved(parsed, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
      setDiscoverMessage(null);
    } finally {
      setDiscovering(false);
    }
  };

  const handlePolish = async () => {
    setPolishing(true);
    setError(null);
    setDiscoverMessage("Polishing specification copy for the marketplace…");

    try {
      const response = await fetch("/api/products/bike-specs/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to polish specifications");
      }

      const parsed = parseBikeSpecs(data.bike_specs);
      if (!parsed) {
        throw new Error("Received invalid specification data");
      }

      setSections(parsed.sections);
      setMetadata(parsed.metadata ?? null);
      setDiscoverMessage("Specification copy polished.");
      onSaved(parsed, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Polish failed");
      setDiscoverMessage(null);
    } finally {
      setPolishing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const payload = buildPayload(sections, metadata);

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bike_specs: hasBikeSpecs(payload) ? payload : null,
          is_bicycle: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save specifications");
      }

      const parsed = parseBikeSpecs(data.product?.bike_specs);
      setSections(parsed?.sections ?? []);
      setMetadata(parsed?.metadata ?? null);
      onSaved(parsed, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-3 border-b border-gray-100 pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">{productName}</p>
            <p className="mt-1 text-sm text-gray-500">
              AI Add searches the official brand website first, then shows every source used here.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleDiscover}
            disabled={discovering || saving || polishing}
            className="shrink-0"
          >
            {discovering ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BikeIcon iconName={AI_DISCOVER_ICON} size={16} className="size-4 shrink-0" />
            )}
            {discovering ? "Searching…" : "AI Add"}
          </Button>
        </div>

        {discoverMessage && (
          <p className="text-sm text-gray-600">{discoverMessage}</p>
        )}
        {error && (
          <p className="text-sm text-red-700">{error}</p>
        )}

        <BikeSpecsSources metadata={metadata} />
      </div>

      {sections.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-500">No specifications yet.</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={addSection}>
            <Plus className="size-4" />
            Add section manually
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section, sectionIndex) => (
            <div
              key={`${section.title}-${sectionIndex}`}
              className="space-y-4 border-b border-gray-100 pb-8 last:border-b-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <BikeIcon
                  iconName={getBikeSpecSectionIconName(section.title)}
                  size={16}
                  className="size-4 shrink-0 opacity-90"
                />
                <Input
                  value={section.title}
                  onChange={(e) =>
                    setSections((prev) =>
                      prev.map((item, index) =>
                        index !== sectionIndex
                          ? item
                          : { ...item, title: e.target.value }
                      )
                    )
                  }
                  placeholder="Section title"
                  className="font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeSection(sectionIndex)}
                  aria-label="Remove section"
                >
                  <Trash2 className="size-4 text-gray-400" />
                </Button>
              </div>

              <div className="space-y-4">
                {section.specs.map((spec, specIndex) => (
                  <div key={specIndex} className="grid gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-start">
                    <Input
                      value={spec.label}
                      onChange={(e) =>
                        updateSpec(sectionIndex, specIndex, "label", e.target.value)
                      }
                      placeholder="Label"
                    />
                    <Textarea
                      value={spec.value}
                      onChange={(e) =>
                        updateSpec(sectionIndex, specIndex, "value", e.target.value)
                      }
                      placeholder="Specification value"
                      rows={2}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="sm:mt-1"
                      onClick={() => removeSpec(sectionIndex, specIndex)}
                      aria-label="Remove spec"
                    >
                      <Trash2 className="size-4 text-gray-400" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-gray-600"
                onClick={() => addSpec(sectionIndex)}
              >
                <Plus className="size-4" />
                Add spec
              </Button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-6">
            <Button type="button" variant="outline" size="sm" onClick={addSection}>
              <Plus className="size-4" />
              Add section
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePolish}
              disabled={polishing || saving || discovering}
            >
              {polishing ? <Loader2 className="size-4 animate-spin" /> : null}
              Polish copy
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || discovering || polishing}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save specifications
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
