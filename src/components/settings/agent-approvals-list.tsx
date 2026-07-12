import {
  AgentIntegrationLogos,
  type AgentIntegration,
} from "@/components/settings/agent-bento-card";
import { cn } from "@/lib/utils";

const CELL_PAD = "px-4 md:px-5";
const VISIBLE_APPROVAL_ROWS = 4;
const APPROVAL_HEADER_ROW_CLASS = "h-8 border-b border-gray-300";
const APPROVAL_BODY_ROW_CLASS = "h-12 border-b border-gray-300";

type MockApproval = {
  id: string;
  agent: string;
  task: string;
  detail: string;
  waiting: string;
  integrations: AgentIntegration[];
};

const MOCK_APPROVALS: MockApproval[] = [
  {
    id: "payment-alex-morgan",
    agent: "Payment Request Agent",
    task: "Send a payment link to Alex Morgan",
    detail: "Work order #10482 · $189.00",
    waiting: "4 min ago",
    integrations: ["nest", "lightspeed", "stripe"],
  },
  {
    id: "catalogue-fixes",
    agent: "Catalogue Care Agent",
    task: "Apply 24 catalogue fixes",
    detail: "18 missing brands · 6 missing categories",
    waiting: "11 min ago",
    integrations: ["lightspeed"],
  },
  {
    id: "first-service-reminders",
    agent: "First Service Rescue Agent",
    task: "Message 8 customers about their first service",
    detail: "Messages are drafted and ready to send",
    waiting: "26 min ago",
    integrations: ["nest", "lightspeed"],
  },
  {
    id: "customer-enquiry-mia",
    agent: "Customer Enquiry Agent",
    task: "Reply to Mia Chen about Trek Domane availability",
    detail: "Draft checked against current Lightspeed stock",
    waiting: "32 min ago",
    integrations: ["gmail", "lightspeed"],
  },
];

export const PENDING_APPROVALS_COUNT = MOCK_APPROVALS.length;

export function AgentApprovalsList() {
  return (
    <section className="w-full min-w-0">
      <div className="mb-2.5 flex items-end justify-between gap-4 px-4 md:px-5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">Approvals</h2>
          <p className="mt-0.5 text-[12px] text-gray-500">
            Agent actions waiting for you to review
          </p>
        </div>
        <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium tabular-nums text-gray-600">
          {MOCK_APPROVALS.length} waiting
        </span>
      </div>

      <div className="overflow-hidden">
        <table className="w-full table-fixed border-t border-gray-300 text-left">
          <colgroup>
            <col className="w-[11%]" />
            <col className="w-[34%]" />
            <col className="w-[24%]" />
            <col className="w-[14%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead className="bg-white">
            <tr className={APPROVAL_HEADER_ROW_CLASS}>
              <th
                className={cn(
                  CELL_PAD,
                  "h-8 align-middle pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400",
                )}
              >
                Requires
              </th>
              <th className="h-8 min-w-0 align-middle py-0 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Approval
              </th>
              <th className="h-8 min-w-0 align-middle py-0 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Agent
              </th>
              <th className="h-8 min-w-0 align-middle py-0 pr-2 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Waiting
              </th>
              <th
                className={cn(
                  CELL_PAD,
                  "h-8 align-middle py-0 text-right text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400",
                )}
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {MOCK_APPROVALS.slice(0, VISIBLE_APPROVAL_ROWS).map((approval) => (
              <tr key={approval.id} className={APPROVAL_BODY_ROW_CLASS}>
                <td className={cn(CELL_PAD, "h-12 min-w-0 align-middle pr-2")}>
                  <AgentIntegrationLogos integrations={approval.integrations} size="sm" />
                </td>
                <td className="h-12 min-w-0 align-middle pr-2">
                  <p className="truncate text-[12px] font-semibold leading-tight text-gray-900">
                    {approval.task}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] leading-tight text-gray-500">
                    {approval.detail}
                  </p>
                </td>
                <td className="h-12 min-w-0 truncate align-middle pr-2 text-[11px] font-medium text-gray-600">
                  {approval.agent}
                </td>
                <td className="h-12 min-w-0 truncate align-middle pr-2 text-[10px] text-gray-400">
                  {approval.waiting}
                </td>
                <td className={cn(CELL_PAD, "h-12 min-w-0 align-middle text-right")}>
                  <button
                    type="button"
                    className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
