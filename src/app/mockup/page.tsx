"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CircleDollarSign,
  ExternalLink,
  ImageOff,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PageBody,
  PageContainer,
  PageHeader,
} from "./_components/page-primitives";
import { StatCard } from "./_components/stat-card";
import { StatusBadge } from "./_components/status-badge";
import { ProductThumb } from "./_components/product-thumb";
import { PRODUCTS, STORE, formatCurrency } from "./_components/mock-data";

const RECENT_ORDERS = [
  { id: "#YJ-4821", customer: "Marcus Chen", item: "Trek Domane SL 6", total: 4299, status: "live" as const },
  { id: "#YJ-4820", customer: "Sarah Williams", item: "Castelli Gabba Jersey", total: 189, status: "live" as const },
  { id: "#YJ-4819", customer: "James O'Brien", item: "ENVE SES 4.5 Wheelset", total: 2850, status: "draft" as const },
  { id: "#YJ-4818", customer: "Priya Nair", item: "Garmin Edge 1040", total: 749, status: "live" as const },
];

const ATTENTION = PRODUCTS.filter((p) => !p.hasImage || p.stock === 0).slice(0, 4);

export default function OverviewPage() {
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Good morning, Tom"
        description={`Here's what's happening at ${STORE.name} today.`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <RefreshCw className="size-4" />
              Sync inventory
            </Button>
            <Button size="sm">
              <Store className="size-4" />
              View storefront
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Revenue (30 days)"
            value={formatCurrency(48250)}
            icon={CircleDollarSign}
            trend={{ value: "12.4%", direction: "up" }}
            hint="vs last month"
          />
          <StatCard
            label="Orders"
            value={342}
            icon={ShoppingBag}
            trend={{ value: "8.1%", direction: "up" }}
            hint="vs last month"
          />
          <StatCard
            label="Products live"
            value="942"
            icon={Package}
            tone="positive"
            hint="of 1,284 synced"
          />
          <StatCard
            label="Conversion rate"
            value="3.8%"
            icon={TrendingUp}
            trend={{ value: "0.4%", direction: "down" }}
            hint="vs last month"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Recent orders */}
          <Card className="gap-0 py-0 lg:col-span-3">
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
              <div className="space-y-0.5">
                <h3 className="font-heading text-base font-semibold leading-none">
                  Recent orders
                </h3>
                <p className="text-sm text-muted-foreground">
                  Latest sales across your storefront and marketplace.
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View all
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
            <div className="divide-y divide-border/60">
              {RECENT_ORDERS.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {order.customer}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.item} · {order.id}
                    </p>
                  </div>
                  <StatusBadge state={order.status} />
                  <span className="w-20 text-right text-sm font-medium tabular-nums">
                    {formatCurrency(order.total)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Needs attention */}
          <Card className="gap-0 py-0 lg:col-span-2">
            <div className="border-b border-border/60 px-6 py-4">
              <h3 className="font-heading text-base font-semibold leading-none">
                Needs attention
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Listings holding back your marketplace reach.
              </p>
            </div>
            <div className="divide-y divide-border/60">
              {ATTENTION.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-6 py-3">
                  <ProductThumb hue={p.hue} hasImage={p.hasImage} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {!p.hasImage ? "Missing images" : "Out of stock"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-8 shrink-0">
                    {!p.hasImage ? (
                      <ImageOff className="size-4" />
                    ) : (
                      <ExternalLink className="size-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
            <Separator />
            <div className="px-6 py-3">
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/mockup/products">Review all products</Link>
              </Button>
            </div>
          </Card>
        </div>
      </PageBody>
    </PageContainer>
  );
}
