'use client';

import type { BlogSection } from '@/lib/blog/types';
import { sanitizeBlogCredit, sanitizeBlogText } from '@/lib/blog/sanitize';

function BlogExternalImage({
  src,
  alt,
  caption,
  credit,
  className,
}: {
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
  className?: string;
}) {
  const safeCaption = caption ? sanitizeBlogText(caption) : undefined;
  const safeCredit = sanitizeBlogCredit(credit) ?? undefined;

  return (
    <figure className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={sanitizeBlogText(alt)}
        className="w-full rounded-md object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      {(safeCaption || safeCredit) && (
        <figcaption className="mt-2 text-xs text-zinc-500">
          {safeCaption && <span>{safeCaption}</span>}
          {safeCaption && safeCredit && <span> · </span>}
          {safeCredit && <span className="italic">Photo: {safeCredit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export function BlogArticleBody({ sections }: { sections: BlogSection[] }) {
  return (
    <div className="space-y-6">
      {sections.map((section, i) => {
        switch (section.type) {
          case 'heading':
            return (
              <h2
                key={i}
                className="text-[1.6rem] font-medium leading-tight tracking-tight text-zinc-950 sm:text-[1.9rem]"
              >
                {sanitizeBlogText(section.content)}
              </h2>
            );
          case 'subheading':
            return (
              <h3 key={i} className="text-lg font-medium tracking-tight text-zinc-800">
                {sanitizeBlogText(section.content)}
              </h3>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="border-l-2 border-zinc-300 pl-5 text-lg font-medium italic leading-relaxed text-zinc-700"
              >
                {sanitizeBlogText(section.content)}
              </blockquote>
            );
          case 'list':
            return (
              <ul key={i} className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-zinc-600">
                {(section.items ?? []).map((item, j) => (
                  <li key={j}>{sanitizeBlogText(item)}</li>
                ))}
              </ul>
            );
          case 'image':
            if (!section.image?.url) return null;
            return (
              <BlogExternalImage
                key={i}
                src={section.image.url}
                alt={sanitizeBlogText(section.image.caption || section.content || 'Cycling photograph')}
                caption={sanitizeBlogText(section.image.caption)}
                credit={sanitizeBlogCredit(section.image.credit) ?? undefined}
                className="my-8"
              />
            );
          case 'paragraph':
          default:
            return (
              <p key={i} className="text-[15px] leading-[1.75] text-zinc-600 sm:text-base sm:leading-[1.8]">
                {sanitizeBlogText(section.content)}
              </p>
            );
        }
      })}
    </div>
  );
}

export { BlogExternalImage };
