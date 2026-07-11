export interface ParsedAgentSpec {
  frontmatter: Record<string, unknown>;
  body: string;
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "[]") return [];
  if (/^".*"$/.test(value)) return value.slice(1, -1);
  return value;
}

export function parseAgentSpecMarkdown(markdown: string): ParsedAgentSpec {
  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith("---")) return { frontmatter: {}, body: markdown };

  const end = trimmed.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: {}, body: markdown };

  const frontmatterText = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trimStart();
  const frontmatter: Record<string, unknown> = {};
  let activeListKey: string | null = null;

  for (const line of frontmatterText.split("\n")) {
    if (!line.trim()) continue;
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && activeListKey) {
      const arr = Array.isArray(frontmatter[activeListKey]) ? frontmatter[activeListKey] as unknown[] : [];
      arr.push(parseScalar(listItem[1]));
      frontmatter[activeListKey] = arr;
      continue;
    }

    const keyMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const [, key, rawValue] = keyMatch;
    if (rawValue.trim() === "") {
      if (["required_apps", "required_capabilities", "write_actions", "allowed_toolkits", "allowed_tool_slugs"].includes(key)) {
        frontmatter[key] = [];
        activeListKey = key;
      } else {
        frontmatter[key] = {};
        activeListKey = null;
      }
    } else {
      frontmatter[key] = parseScalar(rawValue);
      activeListKey = rawValue.trim() === "" ? key : null;
      if (rawValue.trim() === "[]") activeListKey = key;
    }
  }

  return { frontmatter, body };
}
