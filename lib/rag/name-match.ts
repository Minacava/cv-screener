const MIN_NAME_TOKEN_LEN = 3;

export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .filter((token) => token.length >= MIN_NAME_TOKEN_LEN);
}

/**
 * True when every token of `candidateName` appears in the CV full name,
 * or (when no explicit name) when a significant full-name token appears in the query.
 */
export function candidateMatchesNameQuery(
  query: string,
  fullName: string,
  candidateName?: string | null
): boolean {
  const nameParts = nameTokens(fullName);
  if (nameParts.length === 0) return false;

  const explicit = candidateName?.trim()
    ? nameTokens(candidateName)
    : [];

  if (explicit.length > 0) {
    return explicit.every((token) => nameParts.includes(token));
  }

  const normalizedQuery = normalizeForMatch(query);
  const normalizedFull = normalizeForMatch(fullName);
  if (normalizedQuery.includes(normalizedFull)) return true;

  return nameParts.some((token) => {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?:\\s|$)`);
    return re.test(normalizedQuery);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ScoredName = { fullName: string; score: number };

/**
 * Keep only CVs whose name matches the lookup; drop unrelated top-K neighbors.
 * Ambiguous shared names (e.g. several Liams) all stay; non-matching hits go.
 */
export function filterByCandidateName<T extends ScoredName>(
  query: string,
  matches: T[],
  candidateName?: string | null
): T[] {
  if (matches.length === 0) return [];

  const named = matches.filter((match) =>
    candidateMatchesNameQuery(query, match.fullName, candidateName)
  );
  return named;
}
