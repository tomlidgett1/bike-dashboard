"use client";

export const dynamic = "force-dynamic";

import { Ghost } from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import {
  AgentBentoCard,
  type AgentBentoCardProps,
} from "@/components/settings/agent-bento-card";
import { AgentApprovalsList } from "@/components/settings/agent-approvals-list";

const AGENTS: AgentBentoCardProps[] = [
  {
    name: "Workshop Pickup Agent",
    tagline: "Let customers know their bike is ready",
    description:
      "When workshop work is marked complete, Nest writes a clear pickup message from the job notes and texts the customer.",
    lastRun: "12 Jul, 11:18 am",
    totalRuns: 1247,
    integrations: ["nest", "lightspeed"],
    defaultEnabled: true,
  },
  {
    name: "Google Review Agent",
    tagline: "Turn completed work into reviews",
    description:
      "When a work order is checked out, Nest texts the customer and asks them to leave your store a Google review.",
    lastRun: "12 Jul, 12:42 pm",
    totalRuns: 184,
    integrations: ["nest", "lightspeed", "google"],
    defaultEnabled: true,
  },
  {
    name: "Customer Enquiry Agent",
    tagline: "Prepare replies while the inbox is quiet",
    description:
      "Reads new customer emails, checks relevant Lightspeed context and prepares a useful reply for staff to review.",
    lastRun: "12 Jul, 12:44 pm",
    totalRuns: 8920,
    integrations: ["gmail", "lightspeed"],
    defaultEnabled: true,
  },
  {
    name: "First Service Rescue Agent",
    tagline: "Bring new bike buyers back to the workshop",
    description:
      "Finds recent bike buyers who have not returned for their first service and sends a personal booking reminder.",
    lastRun: "12 Jul, 3:00 am",
    totalRuns: 96,
    integrations: ["nest", "lightspeed"],
    defaultEnabled: true,
  },
  {
    name: "Customer Lifecycle Agent",
    tagline: "Reach the right customers at the right time",
    description:
      "Finds customers who are slipping away, plans the right message and sends it in your store’s best-performing window.",
    lastRun: "12 Jul, 12:40 pm",
    totalRuns: 412,
    integrations: ["gmail", "lightspeed"],
    defaultEnabled: true,
  },
  {
    name: "Payment Request Agent",
    tagline: "Collect completed workshop payments sooner",
    description:
      "Finds finished but unpaid work orders, creates a secure payment link and texts it to the customer before pickup.",
    lastRun: "11 Jul, 4:55 pm",
    totalRuns: 63,
    integrations: ["nest", "lightspeed", "stripe"],
  },
  {
    name: "Catalogue Care Agent",
    tagline: "Keep Lightspeed product data tidy",
    description:
      "Scans your catalogue for missing brands and categories, then prepares suggested fixes for your approval.",
    lastRun: "12 Jul, 12:30 pm",
    totalRuns: 2156,
    integrations: ["lightspeed"],
  },
  {
    name: "Missed Call Recovery Agent",
    tagline: "Never lose an unanswered call",
    description:
      "When the store misses a call, Nest immediately texts the caller so they can continue the conversation by message.",
    lastRun: "12 Jul, 10:22 am",
    totalRuns: 311,
    integrations: ["nest"],
    defaultEnabled: true,
  },
];

export default function StoreAgentsPage() {
  return (
    <DashboardFloatingPage
      title="Agents"
      icon={Ghost}
      flush
      scrollClassName="overflow-x-hidden"
    >
      <div className="flex w-full min-w-0 flex-col pt-4 md:pt-5">
        <AgentApprovalsList />
        <div className="h-px w-full bg-gray-300" aria-hidden />
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 px-4 pb-4 pt-6 md:grid-cols-3 md:px-5 md:pb-5">
          {AGENTS.map((agent) => (
            <AgentBentoCard key={agent.name} {...agent} />
          ))}
        </div>
      </div>
    </DashboardFloatingPage>
  );
}
