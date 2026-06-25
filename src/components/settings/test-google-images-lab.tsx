"use client";

import * as React from "react";
import { ExternalLink, Loader2, Search } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ImageResult = {
  position: number;
  title: string;
  thumbnail: string;
  originalUrl: string;
  width: number;
  height: number;
  sourceName: string;
  sourceUrl: string;
};

export function TestGoogleImagesLab() {
  const [query, setQuery] = React.useState("");
  const [images, setImages] = React.useState<ImageResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = React.useState<string | null>(null);

  const runSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) {
      setError("Enter a search query");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/settings/test-google-images?q=${encodeURIComponent(trimmed)}`,
      );
      const data = (await response.json()) as {
        error?: string;
        images?: ImageResult[];
      };

      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }

      setImages(data.images ?? []);
      setSearchedQuery(trimmed);
    } catch (err) {
      setImages([]);
      setSearchedQuery(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for images…"
          className="sm:max-w-md"
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <Search className="mr-2 size-4" />
              Search
            </>
          )}
        </Button>
      </form>

      {error ? (
        <div className="rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {searchedQuery && !loading ? (
        <p className="text-sm text-muted-foreground">
          {images.length > 0
            ? `${images.length} results for “${searchedQuery}”`
            : `No images found for “${searchedQuery}”`}
        </p>
      ) : null}

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <a
              key={`${image.position}-${image.thumbnail}`}
              href={image.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "group overflow-hidden rounded-md border border-border/60 bg-white",
                "transition-shadow hover:shadow-sm",
              )}
            >
              <div className="relative aspect-square bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.thumbnail}
                  alt={image.title}
                  className="absolute inset-0 size-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="space-y-1 p-3">
                <p className="line-clamp-2 text-sm font-medium text-gray-900">{image.title}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate">{image.sourceName}</span>
                  <ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
                <p className="text-xs text-muted-foreground">
                  {image.width} × {image.height}
                </p>
              </div>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
