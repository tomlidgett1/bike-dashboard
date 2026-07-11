export function capabilityToRequiredToolkits(capability: string): string[] {
  switch (capability) {
    case "email_search":
    case "email_read":
      return ["gmail", "outlook"];
    case "notion_create_page":
      return ["notion"];
    case "strava_summary":
      return ["strava"];
    default:
      return [];
  }
}

export function capabilitySearchQuery(capability: string): string {
  switch (capability) {
    case "email_search":
      return "search email messages";
    case "email_read":
      return "read email message";
    case "notion_create_page":
      return "create notion page";
    case "strava_summary":
      return "summarise Strava activities athlete stats distance elevation last 2 years";
    default:
      return capability.replace(/_/g, " ");
  }
}
