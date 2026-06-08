"use client";

import * as React from "react";
import nextDynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Package, Bike, Layers } from "lucide-react";
import { PageContainer, PageHeader, PageBody } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { StoreCategoriesManager } from "@/components/settings/store-categories-manager";
import { AutoAssignCarouselsPanel } from "@/components/settings/auto-assign-carousels-panel";
import {
  StoreCarouselsNewMenu,
  type CarouselCreateRequest,
} from "@/components/settings/store-carousels-new-menu";
import { SettingsManagerLoading } from "@/components/settings/settings-manager-loading";
import type { StoreCarouselPage } from "@/lib/types/store";
import { cn } from "@/lib/utils";

const StoreSectionsManager = nextDynamic(
  () => import("@/components/settings/store-sections-manager").then((mod) => mod.StoreSectionsManager),
  { ssr: false, loading: () => <SettingsManagerLoading className="min-h-64" /> },
);

type CarouselsTab = StoreCarouselPage | "sections";

function tabFromParam(param: string | null): CarouselsTab {
  if (param === "sections") return "sections";
  if (param === "bikes") return "bikes";
  return "products";
}

function tabToQuery(tab: CarouselsTab): string {
  return tab === "products" ? "/settings/store/carousels" : `/settings/store/carousels?tab=${tab}`;
}

export function StoreCarouselsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [createRequest, setCreateRequest] = React.useState<CarouselCreateRequest | null>(null);
  const [sectionCreateRequest, setSectionCreateRequest] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState<CarouselsTab>(() =>
    tabFromParam(searchParams.get("tab")),
  );

  const carouselStorePage: StoreCarouselPage =
    activeTab === "bikes" ? "bikes" : "products";

  const handleCreateCarousel = React.useCallback(
    (action: CarouselCreateRequest["action"], storePage: StoreCarouselPage) => {
      setCreateRequest({ id: Date.now(), action, storePage });
    },
    [],
  );

  React.useEffect(() => {
    setActiveTab(tabFromParam(searchParams.get("tab")));
  }, [searchParams]);

  const selectTab = (tab: CarouselsTab) => {
    setActiveTab(tab);
    router.replace(tabToQuery(tab), { scroll: false });
  };

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Carousels"
        description="Manage carousels and page sections for your store."
        actions={
          <div className="flex items-center gap-2">
            {activeTab === "sections" ? (
              <Button
                size="sm"
                className="rounded-md"
                onClick={() => setSectionCreateRequest((n) => n + 1)}
              >
                <Plus className="size-4" />
                New section
              </Button>
            ) : (
              <>
                <AutoAssignCarouselsPanel
                  variant="button"
                  onApplied={() => setRefreshKey((k) => k + 1)}
                />
                <StoreCarouselsNewMenu
                  defaultStorePage={carouselStorePage}
                  onCreate={handleCreateCarousel}
                />
              </>
            )}
          </div>
        }
      />
      <PageBody>
        <div className="mb-4 flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
            <button
              type="button"
              onClick={() => selectTab("products")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === "products"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Package size={15} />
              Products page
            </button>
            <button
              type="button"
              onClick={() => selectTab("bikes")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === "bikes"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Bike size={15} />
              Bikes page
            </button>
            <button
              type="button"
              onClick={() => selectTab("sections")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === "sections"
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Sections
            </button>
        </div>

        {activeTab === "sections" ? (
          <StoreSectionsManager createSectionRequest={sectionCreateRequest} />
        ) : (
          <StoreCategoriesManager
            refreshKey={refreshKey}
            activePage={activeTab}
            createRequest={createRequest}
          />
        )}
      </PageBody>
    </PageContainer>
  );
}
