"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import type { FeaturedBrandAbout } from "@/lib/marketplace/featured-brand-about";

interface BrandAboutSectionProps {
  brand: FeaturedBrandAbout;
  className?: string;
}

function BrandAboutCopy({ brand }: { brand: FeaturedBrandAbout }) {
  return (
    <div>
      <div className="space-y-2">
        {brand.logoSrc ? (
          <>
            <h2 className="sr-only">About {brand.name}</h2>
            <Image
              src={brand.logoSrc}
              alt={`${brand.name} logo`}
              width={120}
              height={16}
              className="block h-5 w-auto"
              unoptimized
            />
          </>
        ) : (
          <h2 className="text-xl font-semibold tracking-tight text-gray-900">
            About {brand.name}
          </h2>
        )}
        <p className="text-sm text-gray-500">
          {brand.established} · {brand.origin}
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {brand.paragraphs.map((paragraph, index) => (
          <p key={index} className="text-sm leading-relaxed text-gray-600">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}

function BrandAboutVideo({ videoId, brandName }: { videoId: string; brandName: string }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={`${brandName} brand video`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="h-full w-full"
        loading="lazy"
      />
    </div>
  );
}

export function BrandAboutSection({ brand, className }: BrandAboutSectionProps) {
  const hasVideo = !!brand.youtubeVideoId;

  return (
    <section className={cn("border-t border-gray-200 bg-white", className)}>
      <div className="mx-auto max-w-[1536px] px-4 py-10 sm:px-4 lg:px-4 xl:px-5">
        {hasVideo ? (
          <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-8">
            <BrandAboutCopy brand={brand} />
            <div className="lg:pt-1">
              <BrandAboutVideo videoId={brand.youtubeVideoId!} brandName={brand.name} />
            </div>
          </div>
        ) : (
          <div className="max-w-3xl">
            <BrandAboutCopy brand={brand} />
          </div>
        )}
      </div>
    </section>
  );
}
