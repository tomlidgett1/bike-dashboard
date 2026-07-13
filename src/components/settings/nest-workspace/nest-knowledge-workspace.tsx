"use client";

import * as React from "react";
import { BookOpen, Brain, FlaskConical, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  type NestWorkspaceContext,
  type NestWorkspaceTab,
} from "@/lib/nest/nest-workspace-types";
import { ChatWorkspace } from "./chat-workspace";
import { KnowledgeSection } from "./knowledge-section";
import { loadNestWorkspace } from "./workspace-api";
import { WorkspaceTabs } from "./workspace-ui";

const TAB_ITEMS = [
  { id: "learn", label: "Learn", icon: Sparkles },
  { id: "test", label: "Test", icon: FlaskConical },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
] as const;

function isWorkspaceTab(value: string | null): value is NestWorkspaceTab {
  return TAB_ITEMS.some((item) => item.id === value);
}

function WorkspaceLoading() {
  return (
    <div
      className="flex h-[calc(100svh-57px)] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]"
      aria-label="Loading Nest knowledge"
      aria-busy="true"
    >
      <div className="space-y-4 text-center">
        <div className="mx-auto h-10 w-56 animate-pulse rounded-md bg-gray-100" />
        <div className="mx-auto h-12 w-full max-w-xl animate-pulse rounded-2xl bg-gray-100" />
      </div>
    </div>
  );
}

export function NestKnowledgeWorkspace({
  initialContext,
}: {
  initialContext?: NestWorkspaceContext;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [selectedTab, setSelectedTab] = React.useState<NestWorkspaceTab>(
    isWorkspaceTab(requestedTab) ? requestedTab : "learn",
  );
  const [context, setContext] = React.useState<NestWorkspaceContext | null>(
    initialContext ?? null,
  );
  const [loading, setLoading] = React.useState(!initialContext);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [learnSeed, setLearnSeed] = React.useState("");

  React.useEffect(() => {
    const nextTab = isWorkspaceTab(requestedTab) ? requestedTab : "learn";
    setSelectedTab(nextTab);
  }, [requestedTab]);

  const loadInitial = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setContext(await loadNestWorkspace());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the Nest knowledge workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = React.useCallback(async () => {
    setRefreshing(true);
    try {
      setContext(await loadNestWorkspace());
    } catch {
      // Silent refresh failure — the current view stays usable.
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initialContext) void loadInitial();
  }, [initialContext, loadInitial]);

  function selectTab(nextTab: NestWorkspaceTab) {
    setSelectedTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (loading) {
    return <WorkspaceLoading />;
  }

  if (!context || error) {
    return (
      <div className="flex h-[calc(100svh-57px)] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4">
        <div className="w-full max-w-lg rounded-md border border-gray-200 bg-white p-6 text-center">
          <Brain className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-gray-900">
            Nest is unavailable
          </h1>
          <p role="alert" className="mt-2 text-sm leading-relaxed text-gray-500">
            {error || "Nest returned an incomplete workspace."}
          </p>
          <Button
            type="button"
            onClick={() => void loadInitial()}
            className="mt-5 bg-gray-900 text-white hover:bg-gray-800"
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(100svh-57px)] min-w-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
      <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2">
        <WorkspaceTabs
          items={TAB_ITEMS}
          value={selectedTab}
          onChange={selectTab}
        />
      </div>

      <div
        role="tabpanel"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        aria-label={TAB_ITEMS.find((item) => item.id === selectedTab)?.label}
      >
        {selectedTab === "learn" ? (
          <ChatWorkspace
            key={`learn-${learnSeed}`}
            mode="learn"
            onDataChanged={reload}
            initialPrompt={learnSeed}
            refreshing={refreshing}
          />
        ) : null}

        {selectedTab === "test" ? (
          <ChatWorkspace
            mode="test"
            onDataChanged={reload}
            onTeachNest={(prompt) => {
              setLearnSeed(prompt);
              selectTab("learn");
            }}
            refreshing={refreshing}
          />
        ) : null}

        {selectedTab === "knowledge" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-16 md:px-6">
            <div className="mx-auto w-full max-w-3xl">
              <KnowledgeSection
                context={context}
                onReload={reload}
                refreshing={refreshing}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
