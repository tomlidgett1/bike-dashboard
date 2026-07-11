import type { ToolContract, ToolOutput } from './types.ts';
import { getAdminClient } from '../supabase.ts';
import { buildLightspeedInventoryPrefix } from '../brand-lightspeed-inventory.ts';
import {
  buildLightspeedWorkorderPrefix,
  lookupLightspeedCustomerByPhone,
} from '../brand-lightspeed-workorders.ts';
import {
  buildLightspeedSalesPrefix,
  buildLightspeedItemSalesPrefixSql,
  resolveSalesDateWindow,
} from '../brand-lightspeed-sales.ts';
import {
  ALLOWED_LIGHTSPEED_SQL_VIEWS,
  executeLightspeedAnalyticsSql,
  validateLightspeedAnalyticsSql,
} from '../lightspeed-sql-query.ts';

function requireBrandContext(
  ctx: Parameters<ToolContract['handler']>[1],
): NonNullable<Parameters<ToolContract['handler']>[1]['brandContext']> {
  if (!ctx.brandContext) {
    throw new Error('Brand tool called without brand context');
  }
  return ctx.brandContext;
}

function fallbackToolOutput(message: string): ToolOutput {
  return {
    content: message,
    structuredData: { ok: false, message },
  };
}

export const brandCustomerLookupTool: ToolContract = {
  name: 'brand_customer_lookup',
  description:
    'Look up the current customer by the phone number they are messaging from. Use this when caller identity matters for a reply or when continuing a booking naturally.',
  namespace: 'brand.lightspeed.customer.read',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 8000,
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Optional short reason for the lookup.',
      },
    },
    additionalProperties: false,
  },
  handler: async (_input, ctx) => {
    const brand = requireBrandContext(ctx);
    const supabase = getAdminClient();
    const customer = await lookupLightspeedCustomerByPhone(
      supabase,
      brand.baseBrandKey,
      ctx.senderHandle,
      ctx.brandApiDebug,
    );

    if (!customer) {
      return fallbackToolOutput(
        '[LIGHTSPEED CUSTOMER LOOKUP]\nNo customer matched the caller phone number.',
      );
    }

    const content = [
      '[LIGHTSPEED CUSTOMER LOOKUP]',
      `Matched caller: ${customer.fullName ?? customer.firstName ?? 'unknown'}`,
      customer.customerId ? `Customer ID: ${customer.customerId}` : '',
      customer.firstName
        ? `Use ${customer.firstName} naturally when it suits.`
        : 'You can use their name naturally when it suits.',
    ].filter(Boolean).join('\n');

    return {
      content,
      structuredData: {
        ok: true,
        customerId: customer.customerId,
        firstName: customer.firstName,
        fullName: customer.fullName,
      },
    };
  },
};

export const brandInventoryLookupTool: ToolContract = {
  name: 'brand_inventory_lookup',
  description:
    'Check live mirrored Lightspeed inventory for product availability, pricing, or stock questions for this brand.',
  namespace: 'brand.lightspeed.inventory.read',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 12000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The product or stock question to look up.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const brand = requireBrandContext(ctx);
    const query = String(input.query ?? '').trim();
    if (!query) {
      return fallbackToolOutput('Inventory lookup needs a query.');
    }

    const supabase = getAdminClient();
    const content = await buildLightspeedInventoryPrefix({
      supabase,
      brandKey: brand.baseBrandKey,
      message: query,
      settings: brand.isInternal ? null : brand.lightspeedSettings,
    });

    return {
      content: content || '[LIVE LIGHTSPEED INVENTORY]\nNo matching inventory data returned for that query.',
      structuredData: { ok: true, query },
    };
  },
};

export const brandWorkorderLookupTool: ToolContract = {
  name: 'brand_workorder_lookup',
  description:
    'Look up live mirrored Lightspeed workorders and service jobs for this brand. Use `customerName` ONLY when looking up a specific individual customer — leave it empty for general workshop/status queries.',
  namespace: 'brand.lightspeed.workorders.read',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 12000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The service-job or workshop question to look up (e.g. "active jobs", "due today", "last week").',
      },
      customerName: {
        type: 'string',
        description: 'OPTIONAL. First name, last name, or full name of a SPECIFIC CUSTOMER to search for. Only include when the user is asking about an individual customer\'s job — not for general workshop queries. Do NOT put the business name here.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const brand = requireBrandContext(ctx);
    const query = String(input.query ?? '').trim();
    if (!query) {
      return fallbackToolOutput('Workorder lookup needs a query.');
    }

    // Build the effective message for the prefix builder.
    // If the AI provided an explicit customerName, prepend it so that
    // extractCustomerNameFromQuery reliably finds it. Otherwise pass the
    // query as-is with no business-name noise that could be mis-extracted.
    const customerName = typeof (input as Record<string, unknown>).customerName === 'string'
      ? ((input as Record<string, unknown>).customerName as string).trim()
      : '';
    const effectiveMessage = customerName
      ? `${customerName}: ${query}`
      : query;

    const supabase = getAdminClient();
    const now = new Date();
    const todayYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);

    // ── Workorder status split (Q18): "split between open / finished / completed" ──
    const statusSplitQuery = /\bsplit\b|\bhow many\s+(?:are\s+)?(?:open|finished|awaiting|collected|status)\b|\bcounts?\s+by\s+status\b/i.test(query);
    if (statusSplitQuery && brand.isInternal) {
      try {
        const splitSql = [
          'select',
          '  workorder_status_id,',
          '  case workorder_status_id',
          "    when 1 then 'Open (in workshop)'",
          "    when 4 then 'Finished awaiting collection'",
          "    when 5 then 'Done and paid / collected'",
          "    when 8 then 'Due today'",
          "    else 'Other (status ' || workorder_status_id::text || ')'",
          '  end as status_label,',
          '  count(*) as workorder_count',
          'from private.nest_brand_lightspeed_workorder_analytics_v',
          'where brand_key = {{brand_key}}',
          '  and archived is false',
          'group by workorder_status_id',
          'order by workorder_status_id asc nulls last',
        ].join('\n');
        const splitResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, splitSql, 20);
        return {
          content: [
            '[LIGHTSPEED WORKORDER STATUS SPLIT — SQL analytics]',
            `As of today ${todayYmd}.`,
            `Rows: ${JSON.stringify(splitResult.rows, null, 2)}`,
          ].join('\n'),
          structuredData: { ok: true, query, rows: splitResult.rows },
        };
      } catch {
        // fall through to standard path
      }
    }

    // ── Unique customers (Q16): "how many unique customers" over a period ──
    const uniqueCustomerQuery = /\bunique\s+customers?\b|\bunique\s+(?:people|clients?)\b|\bdistinct\s+customers?\b/i.test(query);
    if (uniqueCustomerQuery && brand.isInternal) {
      const resolved = resolveSalesDateWindow(query);
      const fromYmd = resolved?.fromYmd ?? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(now.getTime() - 730 * 86400000));
      const toYmd = resolved?.toYmd ?? todayYmd;
      try {
        const uniqueSql = [
          'select',
          '  count(distinct customer_id) as unique_customers',
          'from private.nest_brand_lightspeed_workorder_analytics_v',
          'where brand_key = {{brand_key}}',
          '  and customer_id is not null',
          `  and time_in_date_melbourne between '${fromYmd}' and '${toYmd}'`,
        ].join('\n');
        const uniqueResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, uniqueSql, 5);
        return {
          content: [
            '[LIGHTSPEED WORKORDER ANALYTICS — unique customers]',
            `Period: ${fromYmd} to ${toYmd}.`,
            `Result: ${JSON.stringify(uniqueResult.rows, null, 2)}`,
          ].join('\n'),
          structuredData: { ok: true, query, rows: uniqueResult.rows },
        };
      } catch {
        // fall through
      }
    }

    // ── Warranty percentage (Q17) ─────────────────────────────────────────
    const warrantyQuery = /\bwarranty\b/i.test(query) && /\bpercentage\b|\bpercent\b|\bhow many\b|\bproportion\b|\bratio\b/i.test(query);
    if (warrantyQuery && brand.isInternal) {
      const resolved = resolveSalesDateWindow(query);
      const fromYmd = resolved?.fromYmd ?? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(now.getTime() - 180 * 86400000));
      const toYmd = resolved?.toYmd ?? todayYmd;
      try {
        const warrantySql = [
          'select',
          '  count(*) as total_workorders,',
          '  count(*) filter (where warranty is true) as warranty_jobs,',
          '  round(count(*) filter (where warranty is true)::numeric / nullif(count(*), 0) * 100, 1) as warranty_pct',
          'from private.nest_brand_lightspeed_workorder_analytics_v',
          'where brand_key = {{brand_key}}',
          '  and archived is false',
          `  and time_in_date_melbourne between '${fromYmd}' and '${toYmd}'`,
        ].join('\n');
        const warrantyResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, warrantySql, 5);
        return {
          content: [
            '[LIGHTSPEED WORKORDER ANALYTICS — warranty percentage]',
            `Period: ${fromYmd} to ${toYmd}.`,
            `Result: ${JSON.stringify(warrantyResult.rows, null, 2)}`,
          ].join('\n'),
          structuredData: { ok: true, query, rows: warrantyResult.rows },
        };
      } catch {
        // fall through
      }
    }

    // ── Most frequent customer (Q7) ─────────────────────────────────────
    const frequentCustomerQuery = /\bmost\s+frequent\b|\bmost\s+(?:jobs?|workorders?|services?)\b|\bfrequent(?:ly)?\s+(?:uses?|visits?|comes?\s+in)\b|\brepeat\s+customers?\b/i.test(query);
    if (frequentCustomerQuery && brand.isInternal) {
      const resolved = resolveSalesDateWindow(query);
      const fromYmd = resolved?.fromYmd ?? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(now.getTime() - 730 * 86400000));
      const toYmd = resolved?.toYmd ?? todayYmd;
      try {
        const frequentSql = [
          'select',
          '  customer_name,',
          '  count(*) as workorder_count',
          'from private.nest_brand_lightspeed_workorder_analytics_v',
          'where brand_key = {{brand_key}}',
          '  and archived is false',
          '  and customer_name is not null',
          `  and time_in_date_melbourne between '${fromYmd}' and '${toYmd}'`,
          'group by customer_name',
          'order by workorder_count desc',
        ].join('\n');
        const freqResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, frequentSql, 10);
        return {
          content: [
            '[LIGHTSPEED WORKORDER ANALYTICS — most frequent customers]',
            `Period: ${fromYmd} to ${toYmd}.`,
            `Top 10: ${JSON.stringify(freqResult.rows, null, 2)}`,
          ].join('\n'),
          structuredData: { ok: true, query, rows: freqResult.rows },
        };
      } catch {
        // fall through
      }
    }

    const content = await buildLightspeedWorkorderPrefix({
      supabase,
      brandKey: brand.baseBrandKey,
      message: effectiveMessage,
      force: brand.isInternal,
      settings: brand.isInternal ? null : brand.lightspeedSettings,
      senderHandle: ctx.senderHandle,
      brandApiDebug: ctx.brandApiDebug,
    });

    return {
      content: content || '[LIVE SERVICE JOB LOOKUP]\nNo matching service-job data returned for that query.',
      structuredData: { ok: true, query, customerName: customerName || null },
    };
  },
};

export const brandSalesLookupTool: ToolContract = {
  name: 'brand_sales_lookup',
  description:
    'Look up Lightspeed sales data for this brand. Handles: revenue/profit totals, gross profit, tax, discounts, product keyword sales, public holiday comparisons (built-in VIC calendar), products vs services breakdown, best-day-ever, monthly avg transaction value, quarterly GP margin. Use this first for any sales/revenue question. For truly novel aggregations with no shortcut here, fall back to brand_lightspeed_sql_query.',
  namespace: 'brand.lightspeed.sales.read',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 55000, // item keyword queries over multi-year ranges can be slow
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The sales, revenue, profit, or pattern question to look up.',
      },
      itemKeyword: {
        type: 'string',
        description: 'OPTIONAL. A product keyword to search for in item descriptions (e.g. "glasses", "helmet", "service", "inner tube"). Use when the question is about a specific product category. Leave empty for general sales/revenue questions.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const brand = requireBrandContext(ctx);
    const query = String(input.query ?? '').trim();
    if (!query) {
      return fallbackToolOutput('Sales lookup needs a query.');
    }

    const itemKeyword = typeof (input as Record<string, unknown>).itemKeyword === 'string'
      ? ((input as Record<string, unknown>).itemKeyword as string).trim()
      : '';

    const supabase = getAdminClient();
    const now = new Date();
    const todayYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);

    // ── Best single sales day ever (Q1) ──────────────────────────────────
    const bestDayEverQuery = /\bbest\s+(?:single\s+)?(?:sales?\s+)?day\s+ever\b|\bbest\s+day\s+(?:of\s+all\s+time|ever|in\s+history)\b|\bhighest\s+(?:single\s+)?day\b/i.test(query);
    if (bestDayEverQuery) {
      try {
        const bestDaySql = [
          'select',
          '  complete_date_melbourne,',
          '  count(*) as total_transactions,',
          '  sum(calc_total) as total_revenue',
          'from private.nest_brand_lightspeed_sale_analytics_v',
          'where brand_key = {{brand_key}}',
          '  and completed is true',
          '  and voided is false',
          '  and archived is false',
          '  and complete_date_melbourne is not null',
          'group by complete_date_melbourne',
          'order by total_revenue desc',
        ].join('\n');
        const bestResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, bestDaySql, 5);
        return {
          content: [
            '[LIGHTSPEED SQL ANALYTICS — best single sales day ever]',
            `Based on ${bestResult.rowCount} unique trading days in the mirror.`,
            `Top 5 days: ${JSON.stringify(bestResult.rows, null, 2)}`,
          ].join('\n'),
          structuredData: { ok: true, query, rows: bestResult.rows },
        };
      } catch {
        // fall through
      }
    }

    // ── Products vs services revenue breakdown (Q14) ──────────────────────
    const productsVsServicesQuery =
      /\bproducts?\s+vs\.?\s+services?\b|\bservices?\s+vs\.?\s+products?\b|\bbreakdown.{0,25}(?:products?|services?)\b/i.test(query);
    if (productsVsServicesQuery) {
      const resolved = resolveSalesDateWindow(query);
      const from12m = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(now.getTime() - 365 * 86400000));
      const fromYmd = resolved?.fromYmd ?? from12m;
      const toYmd = resolved?.toYmd ?? todayYmd;
      try {
        // Services = item_type IS NULL or item_type like 'service' or category is a known service category
        // Best proxy: items with no UPC/EAN and description matching service patterns
        const pvsSql = [
          "with classified as (",
          '  select',
          '    l.calc_line_total,',
          '    case',
          "      when lower(coalesce(l.item_description, '')) ~ '(service|labour|labor|labor|repair|tune|lube|fit|fit|bleed|adjust|cable|tape|overhaul|service|mechanic)'",
          "        then 'Services'",
          "      else 'Products'",
          '    end as category',
          '  from private.nest_brand_lightspeed_sale_line_analytics_v l',
          '  where l.brand_key = {{brand_key}}',
          '    and l.is_layaway is false',
          `    and l.complete_date_melbourne between '${fromYmd}' and '${toYmd}'`,
          '    and l.item_id is not null',
          ')',
          'select',
          '  category,',
          '  count(*) as line_items,',
          '  round(sum(calc_line_total), 2) as total_revenue,',
          '  round(sum(calc_line_total) / nullif(sum(sum(calc_line_total)) over (), 0) * 100, 1) as revenue_pct',
          'from classified',
          'group by category',
          'order by total_revenue desc',
        ].join('\n');
        const pvsResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, pvsSql, 10);
        return {
          content: [
            '[LIGHTSPEED SQL ANALYTICS — products vs services breakdown]',
            `Period: ${fromYmd} to ${toYmd}.`,
            `Note: classification based on item description keywords; not guaranteed exact.`,
            `Result: ${JSON.stringify(pvsResult.rows, null, 2)}`,
          ].join('\n'),
          structuredData: { ok: true, query, rows: pvsResult.rows },
        };
      } catch {
        // fall through
      }
    }

    // ── Month-by-month average transaction value (Q3) ─────────────────────
    const monthlyAvgTransactionQuery =
      /\baverage\s+transaction\s+value\s+by\s+month\b|\bmonthly\s+average\s+transaction\b|\bavg\s+(?:sale|transaction)\s+(?:value\s+)?by\s+month\b/i.test(query);
    if (monthlyAvgTransactionQuery) {
      const resolved = resolveSalesDateWindow(query);
      const from12m = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(now.getTime() - 365 * 86400000));
      const fromYmd = resolved?.fromYmd ?? from12m;
      const toYmd = resolved?.toYmd ?? todayYmd;
      try {
        const monthlyAvgSql = [
          'select',
          "  to_char(complete_date_melbourne, 'YYYY-MM') as month,",
          '  count(*) as completed_sales,',
          '  round(avg(calc_total), 2) as avg_transaction_value,',
          '  round(sum(calc_total), 2) as total_revenue',
          'from private.nest_brand_lightspeed_sale_analytics_v',
          'where brand_key = {{brand_key}}',
          '  and completed is true',
          '  and voided is false',
          '  and archived is false',
          `  and complete_date_melbourne between '${fromYmd}' and '${toYmd}'`,
          "group by to_char(complete_date_melbourne, 'YYYY-MM')",
          "order by to_char(complete_date_melbourne, 'YYYY-MM')",
        ].join('\n');
        const monthlyResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, monthlyAvgSql, 24);
        return {
          content: [
            '[LIGHTSPEED SQL ANALYTICS — monthly average transaction value]',
            `Period: ${fromYmd} to ${toYmd}.`,
            `${monthlyResult.rowCount} months: ${JSON.stringify(monthlyResult.rows, null, 2)}`,
          ].join('\n'),
          structuredData: { ok: true, query, rows: monthlyResult.rows },
        };
      } catch {
        // fall through
      }
    }

    // ── Quarter-by-quarter GP margin trend (Q11) ─────────────────────────
    const quarterlyMarginQuery =
      /\b(?:quarter(?:ly)?|q[1-4])\b.{0,40}(?:margin|gp|gross\s+profit)\b|\b(?:margin|gp)\b.{0,40}\bquarter(?:ly|s?)?\b/i.test(query);
    if (quarterlyMarginQuery) {
      const resolved = resolveSalesDateWindow(query);
      const fromYmd = resolved?.fromYmd ?? `${todayYmd.slice(0, 4)}-01-01`;
      const toYmd = resolved?.toYmd ?? todayYmd;
      try {
        const quarterSql = [
          'select',
          "  to_char(complete_date_melbourne, 'YYYY') || '-Q' ||",
          "  ceil(extract(month from complete_date_melbourne) / 3)::text as quarter,",
          '  count(*) as completed_sales,',
          '  round(sum(calc_total), 2) as total_revenue,',
          '  round(sum(case when calc_avg_cost > 0 then calc_avg_cost else calc_fifo_cost end), 2) as total_cogs,',
          '  round(sum(calc_total - case when calc_avg_cost > 0 then calc_avg_cost else calc_fifo_cost end) / nullif(sum(calc_total), 0) * 100, 1) as margin_pct',
          'from private.nest_brand_lightspeed_sale_analytics_v',
          'where brand_key = {{brand_key}}',
          '  and completed is true',
          '  and voided is false',
          '  and archived is false',
          `  and complete_date_melbourne between '${fromYmd}' and '${toYmd}'`,
          "group by to_char(complete_date_melbourne, 'YYYY') || '-Q' || ceil(extract(month from complete_date_melbourne) / 3)::text",
          'order by 1',
        ].join('\n');
        const qResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, quarterSql, 20);
        return {
          content: [
            '[LIGHTSPEED SQL ANALYTICS — quarterly GP margin trend]',
            `Period: ${fromYmd} to ${toYmd}.`,
            `${JSON.stringify(qResult.rows, null, 2)}`,
          ].join('\n'),
          structuredData: { ok: true, query, rows: qResult.rows },
        };
      } catch {
        // fall through
      }
    }

    // ── Public holiday vs regular day comparison (Q20) ────────────────────
    const publicHolidayQuery = /\bpublic\s+holidays?\b/i.test(query);
    if (publicHolidayQuery) {
      const resolved = resolveSalesDateWindow(query);
      const yearStr = todayYmd.slice(0, 4);
      const fromYmd = resolved?.fromYmd ?? `${yearStr}-01-01`;
      const toYmd = resolved?.toYmd ?? `${yearStr}-12-31`;
      // VIC public holidays 2024-2026 hardcoded (Easter approx)
      const vicHolidays = [
        '2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-06-10','2024-11-05','2024-12-25','2024-12-26',
        '2025-01-01','2025-01-27','2025-04-18','2025-04-21','2025-04-25','2025-06-09','2025-10-03','2025-11-04','2025-12-25','2025-12-26',
        '2026-01-01','2026-01-26','2026-04-03','2026-04-06','2026-04-25','2026-06-08','2026-11-03','2026-12-25','2026-12-26',
      ];
      const inRange = vicHolidays.filter((d) => d >= fromYmd && d <= toYmd);
      if (inRange.length > 0) {
        const holidayArray = inRange.map((d) => `'${d}'`).join(',');
        try {
          const phSql = [
            `with ph as (select unnest(array[${holidayArray}]::date[]) as ph_date)`,
            'select',
            "  case when p.ph_date is not null then 'Public Holiday' else 'Regular Day' end as day_type,",
            '  count(distinct s.complete_date_melbourne) as trading_days,',
            '  count(*) as total_sales,',
            '  round(sum(s.calc_total), 2) as total_revenue,',
            '  round(avg(s.calc_total), 2) as avg_transaction_value',
            'from private.nest_brand_lightspeed_sale_analytics_v s',
            'left join ph p on s.complete_date_melbourne = p.ph_date',
            'where s.brand_key = {{brand_key}}',
            '  and s.completed is true and s.voided is false and s.archived is false',
            `  and s.complete_date_melbourne between date '${fromYmd}' and date '${toYmd}'`,
            "group by case when p.ph_date is not null then 'Public Holiday' else 'Regular Day' end",
            'order by 1',
          ].join('\n');
          const phResult = await executeLightspeedAnalyticsSql(supabase, brand.baseBrandKey, phSql, 5);
          return {
            content: [
              '[LIGHTSPEED SQL ANALYTICS — Victorian public holiday vs regular day]',
              `Period: ${fromYmd} to ${toYmd}. ${inRange.length} VIC public holidays in range.`,
              `Result: ${JSON.stringify(phResult.rows, null, 2)}`,
            ].join('\n'),
            structuredData: { ok: true, query, rows: phResult.rows },
          };
        } catch {
          // fall through
        }
      }
    }

    const transactionWeekdayQuery =
      /\btransactions?\b/i.test(query) &&
      /\bweekday\b|\bweekdays\b|\bday\s+of\s+(?:the\s+)?week\b|\beach\s+of\s+the\s+7\s+weekdays\b/i.test(query);
    if (transactionWeekdayQuery) {
      const resolved = resolveSalesDateWindow(query);
      const fromYmd = resolved?.fromYmd
        ?? new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(now.getTime() - 180 * 86400000));
      const toYmd = resolved?.toYmd ?? todayYmd;
      const suggestedSql = [
        'select',
        '  complete_isodow_melbourne as isodow,',
        '  complete_weekday_melbourne as day_name,',
        '  count(*) as total_transactions,',
        '  count(distinct complete_date_melbourne) as trading_days,',
        '  round(count(*)::numeric / nullif(count(distinct complete_date_melbourne), 0), 2) as avg_transactions_per_trading_day',
        'from private.nest_brand_lightspeed_sale_analytics_v',
        'where brand_key = {{brand_key}}',
        '  and completed is true',
        '  and voided is false',
        '  and archived is false',
        `  and complete_date_melbourne between date '${fromYmd}' and date '${toYmd}'`,
        'group by complete_isodow_melbourne, complete_weekday_melbourne',
        'order by complete_isodow_melbourne',
      ].join('\n');
      const sqlResult = await executeLightspeedAnalyticsSql(
        supabase,
        brand.baseBrandKey,
        suggestedSql,
        20,
      );
      return {
        content: [
          '[LIGHTSPEED SQL ANALYTICS — weekday transaction averages]',
          `Period: ${fromYmd} to ${toYmd}.`,
          `Rows returned: ${sqlResult.rowCount}.`,
          'SQL:',
          suggestedSql,
          '',
          'Rows:',
          JSON.stringify(sqlResult.rows, null, 2),
        ].join('\n'),
        structuredData: {
          ok: true,
          query,
          sqlUsed: suggestedSql,
          rowCount: sqlResult.rowCount,
          rows: sqlResult.rows,
        },
      };
    }

    // If an item keyword is provided, use the dedicated item sales search
    if (itemKeyword) {
      const resolved = resolveSalesDateWindow(query);
      const from90 = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(now.getTime() - 90 * 86400000));
      const fromYmd = resolved?.fromYmd ?? from90;
      const toYmd = resolved?.toYmd ?? todayYmd;
      const dateLabel = resolved?.label ?? 'Last 90 days';

      const content = await buildLightspeedItemSalesPrefixSql({
        supabase,
        brandKey: brand.baseBrandKey,
        keyword: itemKeyword,
        fromYmd,
        toYmd,
        dateLabel,
      });
      return {
        content: content || `[LIVE LIGHTSPEED ITEM SALES]\nNo results for "${itemKeyword}" in that period.`,
        structuredData: { ok: true, query, itemKeyword },
      };
    }

    const content = await buildLightspeedSalesPrefix({
      supabase,
      brandKey: brand.baseBrandKey,
      message: query,
      force: true,
      brandApiDebug: ctx.brandApiDebug,
    });

    return {
      content: content || '[LIVE LIGHTSPEED SALES]\nNo matching sales data returned for that query.',
      structuredData: { ok: true, query },
    };
  },
};

export const brandLightspeedSqlQueryTool: ToolContract = {
  name: 'brand_lightspeed_sql_query',
  description:
    'Run a guarded read-only SQL analytics query for any novel Lightspeed question not handled by the standard tools. Use this for: weekday/monthly/quarterly aggregations, multi-period comparisons (e.g. "Oct last year vs this year"), best/worst single days, revenue or margin cuts by category/price/item-type, workorder analytics (quarterly counts, historical frequency, warranty %), unique customer counts, and any other custom dimension the fixed tools cannot directly express. Hard rules: use ONLY the approved private analytics views, include {{brand_key}} placeholder in WHERE, SELECT/CTE only. Approved views: private.nest_brand_lightspeed_sale_analytics_v, private.nest_brand_lightspeed_sale_line_analytics_v, private.nest_brand_lightspeed_inventory_v, private.nest_brand_lightspeed_workorder_analytics_v.',
  namespace: 'brand.lightspeed.sales.read',
  sideEffect: 'read',
  idempotent: true,
  timeoutMs: 20000,
  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Short explanation of what the query is trying to answer.',
      },
      sql: {
        type: 'string',
        description:
          "Read-only SQL. Must be a SELECT/CTE query, must reference one or more approved private analytics views, and must include the literal {{brand_key}} placeholder in the WHERE clause. Example: select complete_weekday_melbourne as day_name, count(*) as total_transactions from private.nest_brand_lightspeed_sale_analytics_v where brand_key = {{brand_key}} and complete_date_melbourne between date '2024-01-01' and date '2024-06-30' group by complete_weekday_melbourne order by min(complete_isodow_melbourne)",
      },
      limit: {
        type: 'number',
        description: 'Optional row limit. Defaults to 50, max 200.',
      },
    },
    required: ['reason', 'sql'],
    additionalProperties: false,
  },
  inputExamples: [
    {
      reason: 'Average transactions per weekday for last 6 months',
      sql: "select complete_weekday_melbourne as day_name, count(*) as total_transactions, round(count(*)::numeric / count(distinct complete_date_melbourne), 2) as avg_transactions_per_day from private.nest_brand_lightspeed_sale_analytics_v where brand_key = {{brand_key}} and completed is true and voided is false and archived is false and complete_date_melbourne between date '2025-10-14' and date '2026-04-14' group by complete_weekday_melbourne order by min(complete_isodow_melbourne)",
      limit: 20,
    },
    {
      reason: 'Compare revenue for October 2024 vs October 2025',
      sql: "select to_char(complete_date_melbourne, 'YYYY') as year, sum(calc_total) as total_revenue, count(*) as transactions from private.nest_brand_lightspeed_sale_analytics_v where brand_key = {{brand_key}} and completed is true and voided is false and archived is false and ((complete_date_melbourne between date '2024-10-01' and date '2024-10-31') or (complete_date_melbourne between date '2025-10-01' and date '2025-10-31')) group by to_char(complete_date_melbourne, 'YYYY') order by 1",
      limit: 5,
    },
    {
      reason: 'Best single trading days ever by revenue',
      sql: "select complete_date_melbourne, count(*) as transactions, round(sum(calc_total), 2) as total_revenue from private.nest_brand_lightspeed_sale_analytics_v where brand_key = {{brand_key}} and completed is true and voided is false and archived is false group by complete_date_melbourne order by total_revenue desc",
      limit: 10,
    },
    {
      reason: 'Quarterly GP margin trend this year',
      sql: "select to_char(complete_date_melbourne,'YYYY')||'-Q'||ceil(extract(month from complete_date_melbourne)/3)::text as quarter, count(*) as completed_sales, round(sum(calc_total),2) as revenue, round(sum(calc_total - case when calc_avg_cost>0 then calc_avg_cost else calc_fifo_cost end)/nullif(sum(calc_total),0)*100,1) as margin_pct from private.nest_brand_lightspeed_sale_analytics_v where brand_key={{brand_key}} and completed is true and voided is false and archived is false and complete_date_melbourne between date '2025-01-01' and date '2025-12-31' group by 1 order by 1",
      limit: 10,
    },
    {
      reason: 'Workorder count and warranty % per quarter',
      sql: "select to_char(time_in_date_melbourne,'YYYY')||'-Q'||ceil(extract(month from time_in_date_melbourne)/3)::text as quarter, count(*) as workorders, count(*) filter(where warranty is true) as warranty_jobs, round(count(*) filter(where warranty is true)::numeric/nullif(count(*),0)*100,1) as warranty_pct from private.nest_brand_lightspeed_workorder_analytics_v where brand_key={{brand_key}} and archived is false and time_in_date_melbourne is not null group by 1 order by 1",
      limit: 20,
    },
    {
      reason: 'Monthly average transaction value for last 12 months',
      sql: "select to_char(complete_date_melbourne,'YYYY-MM') as month, count(*) as sales, round(avg(calc_total),2) as avg_transaction_value, round(sum(calc_total),2) as total_revenue from private.nest_brand_lightspeed_sale_analytics_v where brand_key={{brand_key}} and completed is true and voided is false and archived is false and complete_date_melbourne between date '2025-04-14' and date '2026-04-14' group by 1 order by 1",
      limit: 24,
    },
    {
      reason: 'Compare revenue on Victorian public holidays vs regular days (2025)',
      sql: "with ph as (select unnest(array['2025-01-01','2025-01-27','2025-04-18','2025-04-19','2025-04-20','2025-04-21','2025-04-25','2025-06-09','2025-10-03','2025-11-04','2025-12-25','2025-12-26']::date[]) as ph_date), classified as (select s.complete_date_melbourne, s.calc_total, case when p.ph_date is not null then 'Public Holiday' else 'Regular Day' end as day_type from private.nest_brand_lightspeed_sale_analytics_v s left join ph p on s.complete_date_melbourne = p.ph_date where s.brand_key = {{brand_key}} and s.completed is true and s.voided is false and s.archived is false and s.complete_date_melbourne between date '2025-01-01' and date '2025-12-31') select day_type, count(distinct complete_date_melbourne) as trading_days, count(*) as total_sales, round(sum(calc_total),2) as total_revenue, round(avg(calc_total),2) as avg_transaction_value from classified group by day_type order by day_type",
      limit: 10,
    },
    {
      reason: 'Top 10 most frequent customers by workorder count over last 2 years',
      sql: "select customer_name, count(*) as workorder_count from private.nest_brand_lightspeed_workorder_analytics_v where brand_key = {{brand_key}} and archived is false and customer_name is not null and time_in_date_melbourne between date '2024-04-14' and date '2026-04-14' group by customer_name order by workorder_count desc",
      limit: 10,
    },
  ],
  handler: async (input, ctx) => {
    const brand = requireBrandContext(ctx);
    const reason = String(input.reason ?? '').trim();
    const sql = String(input.sql ?? '').trim();
    const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? input.limit : undefined;
    if (!reason || !sql) {
      return fallbackToolOutput('Lightspeed SQL analytics query needs both a reason and SQL.');
    }

    const supabase = getAdminClient();
    const result = await executeLightspeedAnalyticsSql(
      supabase,
      brand.baseBrandKey,
      sql,
      limit,
    );

    const previewRows = result.rows.slice(0, 20);
    const content = [
      '[LIGHTSPEED SQL ANALYTICS — SQL executed against Nest mirror]',
      `Reason: ${reason}`,
      `Allowed views: ${ALLOWED_LIGHTSPEED_SQL_VIEWS.join(', ')}`,
      `Rows returned: ${result.rowCount} (limit ${result.limitApplied})`,
      'SQL:',
      sql,
      '',
      'Rows:',
      JSON.stringify(previewRows, null, 2),
    ].join('\n');

    return {
      content,
      structuredData: {
        ok: true,
        reason,
        sql,
        rowCount: result.rowCount,
        limitApplied: result.limitApplied,
        rows: result.rows,
      },
    };
  },
};
