// Dev-only fixture page to preview the purchase-order approval card with
// ambiguity buttons. Returns 404 in production.

import { notFound } from "next/navigation";
import { LightspeedPurchaseOrderCard } from "@/components/genie/lightspeed-purchase-order-card";
import type { LightspeedPurchaseOrderCreateProposal } from "@/lib/types/genie-agent";

const FIXTURE: LightspeedPurchaseOrderCreateProposal = {
  kind: "lightspeed_purchase_order_create",
  summary: "Purchase order for Shimano Australia invoice #INV-20418 with 4 lines totalling $1,842.50.",
  invoice_id: "00000000-0000-0000-0000-000000000000",
  invoice_number: "INV-20418",
  invoice_date: "2026-06-10",
  supplier_name: "Shimano Australia Cycling",
  currency: "AUD",
  vendor_id: null,
  vendor_name: null,
  vendor_options: [
    { vendor_id: "12", name: "Shimano Australia", score: 0.82 },
    { vendor_id: "31", name: "Shimano / Madison", score: 0.55 },
  ],
  create_vendor_name: "Shimano Australia Cycling",
  shop_id: null,
  shop_options: [
    { shop_id: "1", name: "Main Store" },
    { shop_id: "2", name: "Workshop" },
  ],
  lines: [
    {
      description: "Shimano XT M8100 12sp Cassette 10-51T",
      supplier_sku: "CS-M8100-12",
      upc: "4550170446956",
      quantity: 4,
      unit_cost: 189.5,
      item_id: "1043",
      item_name: "Shimano XT CS-M8100 Cassette",
      item_options: [],
    },
    {
      description: "Shimano Deore brake pads resin B05S",
      supplier_sku: "B05S-RX",
      upc: null,
      quantity: 20,
      unit_cost: 11.2,
      item_id: null,
      item_name: null,
      item_options: [
        { item_id: "2210", name: "Shimano B05S Resin Pads", sku: "B05S", upc: null, default_cost: 10.9, qoh: 6, confidence: 0.78, matched_on: "description" },
        { item_id: "2211", name: "Shimano B03S Resin Pads", sku: "B03S", upc: null, default_cost: 9.5, qoh: 2, confidence: 0.52, matched_on: "description" },
      ],
    },
    {
      description: "Shimano SLX M7100 shifter 12sp",
      supplier_sku: "SL-M7100-R",
      upc: "4550170887644",
      quantity: 3,
      unit_cost: 64.0,
      item_id: null,
      item_name: null,
      item_options: [],
    },
  ],
  shipping_cost: 24.9,
  other_cost: null,
  invoice_total: 1842.5,
  source_label: 'Gmail · orders@shimano.com.au · "Tax Invoice INV-20418"',
};

export default function PurchaseOrderCardDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-sm font-semibold text-muted-foreground">Dev fixture — LightspeedPurchaseOrderCard</h1>
      <LightspeedPurchaseOrderCard proposal={FIXTURE} />
    </div>
  );
}
