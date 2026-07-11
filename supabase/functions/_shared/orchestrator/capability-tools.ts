import type { ClassifierResult, Capability, DomainTag, ToolNamespace } from './types.ts';

const CAPABILITY_TO_NAMESPACES: Record<Capability, ToolNamespace[]> = {
  'composio.read': ['composio.read'],
  'composio.write': ['composio.write'],
  'email.read': ['email.read'],
  'email.write': ['email.write'],
  'calendar.read': ['calendar.read'],
  'calendar.write': ['calendar.write'],
  'contacts.read': ['contacts.read'],
  'granola.read': ['granola.read'],
  'web.search': ['web.search'],
  'knowledge.search': ['knowledge.search'],
  'memory.read': ['memory.read'],
  'memory.write': ['memory.write'],
  'travel.search': ['travel.search', 'memory.read', 'knowledge.search'],
  'weather.search': ['weather.search'],
  'reminders.manage': ['reminders.manage'],
  'notifications.watch': ['notifications.watch'],
  'youtube.search': ['youtube.search'],
  'brand.lightspeed.customer.read': ['brand.lightspeed.customer.read'],
  'brand.lightspeed.inventory.read': ['brand.lightspeed.inventory.read'],
  'brand.lightspeed.workorders.read': ['brand.lightspeed.workorders.read'],
  'brand.lightspeed.sales.read': ['brand.lightspeed.sales.read'],
  'brand.booking.read': ['brand.booking.read'],
  'brand.booking.write': ['brand.booking.write'],
  'brand.booking.create': ['brand.booking.create'],
  'brand.deputy.read': ['brand.deputy.read'],
  'brand.deputy.write': ['brand.deputy.write'],
  'deep_profile': ['memory.read', 'memory.write', 'knowledge.search', 'granola.read', 'email.read', 'calendar.read', 'contacts.read'],
};

// Every task domain ships with the universally-safe read tools (web.search,
// knowledge.search, weather.search, travel.search, granola.read) so that
// compound user requests like "find the latest X then email Y" never lose
// access to the web just because the classifier picked the action domain.
// All these are read-only, no side-effects; commit tools (email_send,
// calendar_write) still gate on explicit user confirmation.
const COMPOUND_READ_TOOLS: ToolNamespace[] = [
  'web.search', 'knowledge.search', 'weather.search', 'travel.search', 'granola.read',
];

const DOMAIN_BASE_TOOLS: Record<DomainTag, ToolNamespace[]> = {
  email: ['email.read', 'email.write', 'contacts.read', 'memory.read', 'notifications.watch', 'reminders.manage', ...COMPOUND_READ_TOOLS],
  calendar: ['calendar.read', 'calendar.write', 'contacts.read', 'memory.read', 'email.read', 'reminders.manage', 'notifications.watch', ...COMPOUND_READ_TOOLS],
  meeting_prep: ['calendar.read', 'granola.read', 'email.read', 'contacts.read', 'knowledge.search', 'memory.read', 'web.search', 'weather.search', 'travel.search'],
  // Research can shade into action: "find news on X and email Tom" — give it
  // contacts/email/calendar reads + email.write so it can act on what it found.
  research: ['web.search', 'knowledge.search', 'contacts.read', 'memory.read', 'travel.search', 'weather.search', 'youtube.search', 'email.read', 'email.write', 'calendar.read', 'reminders.manage'],
  recall: ['memory.read', 'knowledge.search', 'granola.read', 'calendar.read', ...COMPOUND_READ_TOOLS],
  contacts: ['contacts.read', 'memory.read', 'email.read', 'calendar.read', ...COMPOUND_READ_TOOLS],
  reminders: ['reminders.manage', 'calendar.read', 'memory.read', ...COMPOUND_READ_TOOLS],
  brand: [],
  general: [
    'memory.read', 'memory.write', 'email.read', 'email.write',
    'calendar.read', 'calendar.write', 'contacts.read', 'granola.read',
    'web.search', 'knowledge.search', 'travel.search', 'weather.search', 'reminders.manage', 'notifications.watch', 'youtube.search',
  ],
};

const WRITE_CAPABILITIES: Set<string> = new Set([
  'composio.write',
  'email.write',
  'calendar.write',
  'memory.write',
  'reminders.manage',
  'notifications.watch',
]);
const COMPOUND_EXTRAS: ToolNamespace[] = ['contacts.read', 'memory.read'];
const WRITE_COMPANION_READS: Partial<Record<Capability, ToolNamespace[]>> = {
  'composio.write': ['composio.read'],
  'email.write': ['email.read', 'contacts.read'],
  'calendar.write': ['calendar.read'],
  'reminders.manage': ['calendar.read'],
  'notifications.watch': ['email.read', 'calendar.read'],
};

const ALWAYS_INCLUDED: ToolNamespace[] = ['messaging.react'];

export function resolveTools(result: ClassifierResult): ToolNamespace[] {
  const nsSet = new Set<ToolNamespace>(ALWAYS_INCLUDED);

  // Universally-safe read tools are always available so compound requests
  // ("find latest X and email Tom") never lose web.search just because the
  // classifier locked onto the action domain. All side-effecting tools
  // (email_send, calendar_write) still pass through the executor's
  // confirmation gate.
  for (const ns of COMPOUND_READ_TOOLS) nsSet.add(ns);

  for (const cap of result.requiredCapabilities) {
    const namespaces = CAPABILITY_TO_NAMESPACES[cap];
    if (namespaces) {
      for (const ns of namespaces) nsSet.add(ns);
    }
  }

  if (result.preferredCapabilities) {
    for (const cap of result.preferredCapabilities) {
      const namespaces = CAPABILITY_TO_NAMESPACES[cap];
      if (namespaces) {
        for (const ns of namespaces) nsSet.add(ns);
      }
    }
  }

  if (result.primaryDomain === 'meeting_prep' || result.primaryDomain === 'recall') {
    const baseDomain = DOMAIN_BASE_TOOLS[result.primaryDomain];
    for (const ns of baseDomain) nsSet.add(ns);
  } else if (result.confidence < 0.7) {
    const baseDomain = DOMAIN_BASE_TOOLS[result.primaryDomain];
    if (baseDomain) {
      for (const ns of baseDomain) nsSet.add(ns);
    }
  }

  const hasWrite = result.requiredCapabilities.some(c => WRITE_CAPABILITIES.has(c));
  if (hasWrite) {
    for (const ns of COMPOUND_EXTRAS) nsSet.add(ns);
    for (const cap of result.requiredCapabilities) {
      const companionReads = WRITE_COMPANION_READS[cap];
      if (!companionReads) continue;
      for (const ns of companionReads) nsSet.add(ns);
    }
  }

  if (result.primaryDomain === 'general') {
    const allGeneral = DOMAIN_BASE_TOOLS.general;
    for (const ns of allGeneral) nsSet.add(ns);
  }

  if (result.requiresToolUse && nsSet.size <= ALWAYS_INCLUDED.length) {
    const baseDomain = DOMAIN_BASE_TOOLS[result.primaryDomain];
    if (baseDomain) {
      for (const ns of baseDomain) nsSet.add(ns);
    }
  }

  return [...nsSet];
}

export function resolveToolChoice(result: ClassifierResult): string | undefined {
  if (result.requiresToolUse) return 'required';
  return undefined;
}

export function getBaseToolsForDomain(domain: DomainTag): ToolNamespace[] {
  return [...(DOMAIN_BASE_TOOLS[domain] ?? DOMAIN_BASE_TOOLS.general), ...ALWAYS_INCLUDED];
}

export function expandCapabilities(result: ClassifierResult, _agentFeedback: string): ClassifierResult {
  const expandedCaps = new Set<Capability>(result.requiredCapabilities);

  const baseDomain = DOMAIN_BASE_TOOLS[result.primaryDomain];
  if (baseDomain) {
    for (const ns of baseDomain) {
      const cap = namespaceToCap(ns);
      if (cap) expandedCaps.add(cap);
    }
  }

  if (result.secondaryDomains) {
    for (const domain of result.secondaryDomains) {
      const secondaryBase = DOMAIN_BASE_TOOLS[domain];
      if (secondaryBase) {
        for (const ns of secondaryBase) {
          const cap = namespaceToCap(ns);
          if (cap) expandedCaps.add(cap);
        }
      }
    }
  }

  console.log(`[capability-tools] expanded capabilities: [${[...expandedCaps].join(', ')}] (was: [${result.requiredCapabilities.join(', ')}])`);

  return {
    ...result,
    requiredCapabilities: [...expandedCaps],
    confidence: 1.0,
  };
}

function namespaceToCap(ns: ToolNamespace): Capability | null {
  const map: Partial<Record<ToolNamespace, Capability>> = {
    'email.read': 'email.read',
    'email.write': 'email.write',
    'calendar.read': 'calendar.read',
    'calendar.write': 'calendar.write',
    'contacts.read': 'contacts.read',
    'granola.read': 'granola.read',
    'web.search': 'web.search',
    'knowledge.search': 'knowledge.search',
    'memory.read': 'memory.read',
    'memory.write': 'memory.write',
    'travel.search': 'travel.search',
    'weather.search': 'weather.search',
    'reminders.manage': 'reminders.manage',
    'notifications.watch': 'notifications.watch',
    'youtube.search': 'youtube.search',
    'composio.read': 'composio.read',
    'composio.write': 'composio.write',
    'brand.lightspeed.customer.read': 'brand.lightspeed.customer.read',
    'brand.lightspeed.inventory.read': 'brand.lightspeed.inventory.read',
    'brand.lightspeed.workorders.read': 'brand.lightspeed.workorders.read',
    'brand.lightspeed.sales.read': 'brand.lightspeed.sales.read',
    'brand.booking.read': 'brand.booking.read',
    'brand.booking.write': 'brand.booking.write',
    'brand.booking.create': 'brand.booking.create',
    'brand.deputy.read': 'brand.deputy.read',
    'brand.deputy.write': 'brand.deputy.write',
  };
  return map[ns] ?? null;
}

export function hasDeepProfile(result: ClassifierResult): boolean {
  return result.requiredCapabilities.includes('deep_profile');
}
