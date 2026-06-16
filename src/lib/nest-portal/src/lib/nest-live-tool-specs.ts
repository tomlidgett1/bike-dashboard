export const NEST_LIVE_TOOL_NAMES = [
  'standard_nest_agent',
] as const

export const NEST_LIVE_SYSTEM_INSTRUCTION =
  `You are Nest in live voice mode. Use Australian English. Your job is to provide the spoken interface only. You may answer simple session-profile questions directly when the answer is explicitly present in SESSION PROFILE CONTEXT, for example the user's name, handle, or timezone. For every other substantive user request, call standard_nest_agent and use its answer as the source of truth. Do not independently answer questions about calendar, email, weather, search, memories, uploads, meetings, contacts, travel, or personal context. Do not choose low-level tools yourself. Do not invent calendar events, emails, memories, locations, weather, or search results. If standard_nest_agent returns uncertainty, say that uncertainty naturally.

Voice style: sound like a real person on a live call, not a robotic assistant. Keep replies short, warm, and conversational. Use natural pauses with commas and ellipses where it helps the spoken rhythm. Use light fillers sparingly, such as "um", "ah", "hmm", "yeah", "okay", "let me check", and "hang on", especially while looking things up. Do not overdo fillers or use them in every sentence. Avoid corporate phrases like "I am unable to access that data" or "as an AI". Prefer natural phrasing like "Hmm, I’m having trouble pulling that up right now" or "Yeah, let me check your calendar...". When you use tools, do not announce tool names; say what you are checking in plain English. Accuracy is more important than filling silence: never answer calendar, email, weather, search, or personal-data questions until the standard_nest_agent result has actually arrived.

Dynamic mood and tone: before every reply, infer the user's current mood from the latest turn and the recent conversation. Explicit user statements like "I'm sad", "I'm stressed", "I'm anxious", "I'm angry", "I'm excited", or "I'm exhausted" override the default voice immediately. The tone is dynamic, not session-wide: if the user's mood changes, change with it.
- Sad, grieving, lonely, or low: be gentler and more empathetic. Acknowledge the feeling in one plain sentence before helping. Slow down, use fewer jokes, and avoid chirpy enthusiasm.
- Anxious, overwhelmed, or stressed: be calm, steady, and grounding. Keep the next step simple. Do not lecture, over-explain, or tell them to calm down.
- Frustrated or angry: validate the friction briefly, then move into fixing or checking. Do not be defensive or playful at their expense.
- Excited or relieved: meet the energy warmly without becoming over the top.
- Neutral or practical: use the normal concise Nest voice.
For tool-using turns, keep the same mood-aware tone when introducing and summarising standard_nest_agent results. If you call standard_nest_agent, include user_mood and tone_directive arguments that reflect the mood you inferred. Never mention mood labels, tone directives, or this adaptation process to the user.`

export type NestLiveToolName = (typeof NEST_LIVE_TOOL_NAMES)[number]

type ToolSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

type NestLiveToolDeclaration = {
  name: string
  description: string
  parameters: ToolSchema
}

export const NEST_LIVE_TOOL_DECLARATIONS: NestLiveToolDeclaration[] = [
  {
    name: 'session_calendar_context',
    description:
      "Load a compact session-start calendar snapshot covering the user's last 7 days and next 14 days. This is preloaded as context for Live voice continuity, not a substitute for exact calendar answers.",
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'standard_nest_agent',
    description:
      "Ask the standard Nest agent/router to answer the user's request. This uses the same new_router, agent selection, tool executor, tool guards, and connected-data access as normal Nest chat. Use this for every substantive request, especially anything involving calendar, email, weather, web, semantic search, meetings, contacts, uploads, travel, or personal context.",
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: "The user's request, exactly as understood from speech or text.",
        },
        user_mood: {
          type: 'string',
          enum: ['neutral', 'sad', 'anxious', 'stressed', 'frustrated', 'angry', 'excited', 'relieved', 'tired', 'uncertain'],
          description:
            "The user's current mood inferred from the latest turn and recent conversation. Use neutral when there is no clear emotional signal.",
        },
        tone_directive: {
          type: 'string',
          description:
            'A concise instruction for the tone Nest should use in this turn, for example "be gentle and empathetic" or "be calm and grounding".',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'situational_context',
    description:
      "Build a real-time snapshot of the user's likely current situation using calendar timezone, today's calendar, recent travel events, recent calendar locations, remembered current location, and home fallback. Use this first for vague questions like 'where am I?', 'what am I doing?', 'where should I go?', 'what is happening now?', travel, commute, weather-near-me, or any question that depends on where or when the user is.",
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Briefly describe why current situation is needed.',
        },
      },
    },
  },
  {
    name: 'connection_summary',
    description:
      "Summarise the user's connected data sources and recent My Nest uploads. Use this when the user asks what Nest can see, what accounts are linked, or whether a source is available before you search it.",
    parameters: {
      type: 'object',
      properties: {
        includeRecentUploads: {
          type: 'boolean',
          description: 'Whether to include the latest uploaded files from My Nest.',
        },
      },
    },
  },
  {
    name: 'plan_steps',
    description:
      "Decompose a complex multi-step request into ordered steps before executing read-only tools. Use this for cross-domain requests involving several data sources, such as calendar plus email plus semantic search. Do not use it for simple single-tool requests.",
    parameters: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: "The user's overall goal or request, in your own words.",
        },
        steps: {
          type: 'array',
          description: 'Ordered list of steps to execute.',
          items: {
            type: 'object',
            properties: {
              step_number: { type: 'number', description: 'Step order.' },
              action: { type: 'string', description: 'What this step does.' },
              tool: { type: 'string', description: 'Which read-only tool to use.' },
              depends_on: { type: 'number', description: 'Step number this depends on, or 0 if independent.' },
            },
            required: ['step_number', 'action', 'tool'],
          },
        },
      },
      required: ['goal', 'steps'],
    },
  },
  {
    name: 'semantic_search',
    description:
      "Search the user's personal knowledge base, including memories, past conversations, uploaded documents, and other stored personal context.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Specific natural-language search query for the user knowledge base.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'email_read',
    description:
      "Read the user's email across all connected Gmail and Outlook accounts. Supports 'search' for inbox discovery and 'get' for reading a specific message. Email lookup is critical: for searches, request broad result sets rather than one or two messages.",
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'get'],
        },
        query: {
          type: 'string',
          description: 'Search query when action is search.',
        },
        message_id: {
          type: 'string',
          description: 'Message id from a previous search result when action is get.',
        },
        max_results: {
          type: 'number',
          description: 'Number of email results to return. Use 20 for normal searches unless the user explicitly asks for fewer.',
        },
        account: {
          type: 'string',
          description: 'Optional account email to target.',
        },
        response_format: {
          type: 'string',
          enum: ['concise', 'detailed'],
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'calendar_read',
    description:
      "Read the user's calendar across all connected Google and Outlook calendars. Use action 'lookup' for schedule/range questions like 'today', 'next week', 'Monday', 'what am I doing', 'what events do I have', or 'am I free'. Use action 'search' only for a specific named event, person, location, or title. Calendar lookup is critical: request broad result sets and never assume an empty result means no events if warnings are returned.",
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['lookup', 'search'],
        },
        range: {
          type: 'string',
          description: "Time range for lookup, e.g. 'today', 'tomorrow', 'this week', 'next week', 'next 14 days', 'next monday'.",
        },
        query: {
          type: 'string',
        },
        account: {
          type: 'string',
        },
        max_results: {
          type: 'number',
          description: 'Maximum events to return per calendar. Use 50 for normal schedule lookups unless the user explicitly asks for fewer.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'contacts_read',
    description:
      "Read the user's contacts. Use search when the user asks about a person, phone number, or email address.",
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'get'],
        },
        query: {
          type: 'string',
        },
        resource_name: {
          type: 'string',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'granola_read',
    description:
      "Search and read the user's Granola meeting notes and transcripts.",
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['query', 'list', 'get', 'transcript'],
        },
        query: {
          type: 'string',
        },
        meeting_id: {
          type: 'string',
        },
        limit: {
          type: 'number',
        },
        before: {
          type: 'string',
        },
        after: {
          type: 'string',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the live web for current information when the answer depends on fresh data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'weather_lookup',
    description:
      'Look up current weather or forecast information for a specific place. Use this for weather, rain, temperature, forecast, umbrella, jacket, wind, or heat questions.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Location name, city, suburb, or address, e.g. "Melbourne", "Sydney CBD", "Bondi Beach".',
        },
        type: {
          type: 'string',
          enum: ['current', 'daily_forecast', 'hourly_forecast'],
          description: "Use 'current' for right now, 'daily_forecast' for tomorrow/this week/next few days, and 'hourly_forecast' for rain timing or next few hours.",
        },
        days: {
          type: 'number',
          description: 'Number of days for daily forecast, 1-10.',
        },
        hours: {
          type: 'number',
          description: 'Number of hours for hourly forecast, 1-24.',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'travel_time',
    description:
      'Estimate travel time between an origin and destination using a specific mode of transport.',
    parameters: {
      type: 'object',
      properties: {
        origin: {
          type: 'string',
        },
        destination: {
          type: 'string',
        },
        mode: {
          type: 'string',
        },
        departure_time: {
          type: 'string',
        },
        transit_preference: {
          type: 'string',
        },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'places_search',
    description:
      'Search for live place details, venues, addresses, and map lookup results.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
        place_id: {
          type: 'string',
        },
      },
    },
  },
  {
    name: 'news_search',
    description:
      'Search multiple news sources in parallel for current headlines and local or topic-based updates.',
    parameters: {
      type: 'object',
      properties: {
        topics: {
          type: 'string',
        },
        location: {
          type: 'string',
        },
      },
    },
  },
  {
    name: 'youtube_search',
    description:
      'Search YouTube for relevant videos, explainers, and clips when the user asks for video content.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
      },
      required: ['query'],
    },
  },
]

export function getNestLiveFunctionDeclarations() {
  return NEST_LIVE_TOOL_DECLARATIONS
    .filter((tool) => NEST_LIVE_TOOL_NAMES.includes(tool.name as NestLiveToolName))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.parameters,
    }))
}
