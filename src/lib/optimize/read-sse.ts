export async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void | Promise<void>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        // Skip malformed chunks
        continue;
      }
      await onEvent(event);
    }
  }
}
