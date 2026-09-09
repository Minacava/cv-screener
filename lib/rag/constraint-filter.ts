/** Tokens that are not useful for CV skill / constraint matching. */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "and",
  "or",
  "with",
  "who",
  "whom",
  "which",
  "that",
  "these",
  "those",
  "them",
  "they",
  "also",
  "from",
  "among",
  "know",
  "knows",
  "knowing",
  "have",
  "has",
  "had",
  "show",
  "find",
  "list",
  "candidates",
  "candidate",
  "cvs",
  "cv",
  "people",
  "person",
  "profile",
  "summary",
  "experience",
  "experienced",
  "skilled",
  "skill",
  "skills",
  "please",
  "me",
  "my",
  "de",
  "los",
  "las",
  "estos",
  "estas",
  "ellos",
  "ellas",
  "cuales",
  "cuáles",
  "quiénes",
  "quienes",
  "saben",
  "saber",
  "con",
  "que",
  "qué",
  "entre",
  "también",
  "tambien",
  "graduated",
  "graduate",
  "graduates",
  "graduation",
  "university",
  "universitat",
  "college",
  "school",
  "degree",
  "studied",
  "study",
  "studying",
  "bachelor",
  "master",
  "masters",
  "education",
  "edu",
  "alumni",
  "alumnus",
  "attended",
  "attending",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9+.#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract constraint tokens from a refine / search phrase
 * (e.g. "of these who know AWS" → ["aws"],
 *  "Which candidate graduated from UPC?" → ["upc"]).
 */
export function constraintTokens(query: string): string[] {
  const normalized = normalizeText(query);
  const raw = normalized.split(" ").filter((token) => {
    if (token.length < 2) return false;
    if (STOPWORDS.has(token)) return false;
    return true;
  });
  return [...new Set(raw)];
}

type TextMatchable = {
  text: string;
};

function matchesAllTokens(text: string, tokens: string[]): boolean {
  const haystack = normalizeText(text);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Keep prior-turn CVs whose text contains the new constraint tokens.
 * If no tokens can be extracted, return the full prior set (chat model filters).
 */
export function filterCandidatesByConstraint<T extends TextMatchable>(
  candidates: T[],
  constraintQuery: string
): T[] {
  if (candidates.length === 0) return [];

  const tokens = constraintTokens(constraintQuery);
  if (tokens.length === 0) return candidates;

  const matched = candidates.filter((candidate) =>
    matchesAllTokens(candidate.text, tokens)
  );

  return matched;
}

/**
 * If the query has distinctive tokens (e.g. "upc", "python"), return only CVs
 * whose text contains all of them. Returns null when there are no tokens or no hits
 * so the caller can fall back to vector-score filtering.
 */
export function tryLexicalFilter<T extends TextMatchable>(
  candidates: T[],
  query: string
): T[] | null {
  if (candidates.length === 0) return null;

  const tokens = constraintTokens(query);
  if (tokens.length === 0) return null;

  const matched = candidates.filter((candidate) =>
    matchesAllTokens(candidate.text, tokens)
  );

  return matched.length > 0 ? matched : null;
}
