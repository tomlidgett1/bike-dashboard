export function toolOutputIndicatesFailure(
  sideEffect: string,
  structuredData: Record<string, unknown> | undefined,
): boolean {
  if (sideEffect !== 'commit' || !structuredData) return false;
  return structuredData.ok === false ||
    structuredData.status === 'error' ||
    structuredData.verified === false;
}
