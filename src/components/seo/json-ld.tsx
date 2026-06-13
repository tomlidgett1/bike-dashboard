/**
 * Renders one or more schema.org objects as a JSON-LD <script>.
 *
 * Server component — emitted in the initial HTML so crawlers see it without
 * executing JS. The `<` escaping prevents a stray "</script>" inside any string
 * field from breaking out of the script tag.
 */
type JsonObject = Record<string, unknown>;

export function JsonLd({ data, id }: { data: JsonObject | JsonObject[]; id?: string }) {
  return (
    <script
      type="application/ld+json"
      id={id}
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
