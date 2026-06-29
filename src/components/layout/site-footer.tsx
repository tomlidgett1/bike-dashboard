import { Suspense } from "react";
import { SiteFooterShell } from "@/components/layout/site-footer-shell";
import { SiteFooterSeoSections } from "@/components/layout/site-footer-seo-sections";

interface SiteFooterProps {
  /** Marketplace homepage: collapsible SEO leaf-link sections for crawl discovery. */
  showSeoSections?: boolean;
}

export function SiteFooter({ showSeoSections = false }: SiteFooterProps) {
  return (
    <SiteFooterShell>
      {showSeoSections ? (
        <Suspense fallback={null}>
          <SiteFooterSeoSections />
        </Suspense>
      ) : null}
    </SiteFooterShell>
  );
}
