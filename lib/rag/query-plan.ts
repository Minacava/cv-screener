import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, type UIMessage } from "ai";
import { z } from "zod";

export const queryPlanSchema = z.object({
  intent: z.enum(["search", "refine", "lookup"]),
  searchQuery: z
    .string()
    .describe(
      "Standalone English retrieval query that includes all active skill/criteria constraints from the conversation"
    ),
  candidateName: z
    .string()
    .nullable()
    .describe(
      "Person name mentioned for a profile lookup (partial OK), or null"
    ),
});

export type QueryPlan = z.infer<typeof queryPlanSchema>;

type MessageSources = {
  sources?: string[];
};

const REFINE_HINTS =
  /\b(of these|among (them|these|those)|from (these|those|them)|de estos|de estas|entre (ellos|ellas|estos|estas)|tambien|también|also from|which of (them|these)|quiénes de|cuales de|cuáles de)\b/i;

const LOOKUP_HINTS =
  /\b(summarize|summary|profile|tell me about|who is|cv of|resume of|experiencia de|perfil de|resumen de)\b/i;

const SEARCH_HINTS =
  /\b(show|find|list|candidates?|with|experience in|skilled in|know|knows|saber|saben|muéstrame|muestrame|busca|buscar)\b/i;

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

export function lastUserQuery(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      const text = getMessageText(message);
      if (text) return text;
    }
  }
  throw new Error("No user message found");
}

/** PDF filenames from the most recent assistant message that listed sources. */
export function getLastAssistantSources(messages: UIMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    const metadata = message.metadata as MessageSources | undefined;
    if (Array.isArray(metadata?.sources) && metadata.sources.length > 0) {
      return metadata.sources.filter(
        (s): s is string => typeof s === "string" && s.length > 0
      );
    }
  }
  return [];
}

function buildConversationSnippet(messages: UIMessage[], maxTurns = 8): string {
  const recent = messages.slice(-maxTurns);
  return recent
    .map((message) => {
      const text = getMessageText(message);
      if (!text) return null;
      return `${message.role.toUpperCase()}: ${text}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
}

function priorUserQueries(messages: UIMessage[]): string[] {
  return messages
    .filter((m) => m.role === "user")
    .map(getMessageText)
    .filter(Boolean)
    .slice(0, -1); // exclude current turn
}

/** Build a retrieval query that keeps earlier skill constraints when refining. */
function combinedSearchQuery(messages: UIMessage[], latest: string): string {
  const prior = priorUserQueries(messages).filter(
    (q) => !REFINE_HINTS.test(q) && !LOOKUP_HINTS.test(q)
  );
  if (prior.length === 0) return latest;
  return `${prior.join("; ")}; ${latest}`;
}

function inferLookupName(query: string): string | null {
  if (!LOOKUP_HINTS.test(query)) return null;

  const proper = query.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g);
  if (proper && proper.length > 0) {
    return proper[proper.length - 1] ?? null;
  }
  return null;
}

/**
 * Fast path without an LLM when intent is obvious.
 * Returns null when the turn is ambiguous and needs generateObject.
 */
export function tryHeuristicQueryPlan(
  messages: UIMessage[],
  priorSources: string[]
): QueryPlan | null {
  const latest = lastUserQuery(messages);
  const userTurns = messages.filter((m) => m.role === "user").length;

  if (userTurns <= 1 && priorSources.length === 0) {
    const name = inferLookupName(latest);
    if (name) {
      return {
        intent: "lookup",
        searchQuery: `CV profile of ${name}`,
        candidateName: name,
      };
    }
    return {
      intent: "search",
      searchQuery: latest,
      candidateName: null,
    };
  }

  if (priorSources.length > 0 && REFINE_HINTS.test(latest)) {
    return {
      intent: "refine",
      searchQuery: combinedSearchQuery(messages, latest),
      candidateName: null,
    };
  }

  const name = inferLookupName(latest);
  if (name) {
    return {
      intent: "lookup",
      searchQuery: `CV profile of ${name}`,
      candidateName: name,
    };
  }

  // Clear new skill search (not refining prior set)
  if (SEARCH_HINTS.test(latest) && !REFINE_HINTS.test(latest)) {
    return {
      intent: "search",
      searchQuery: latest,
      candidateName: null,
    };
  }

  return null;
}

function fallbackPlan(
  messages: UIMessage[],
  priorSources: string[]
): QueryPlan {
  const heuristic = tryHeuristicQueryPlan(messages, priorSources);
  if (heuristic) return heuristic;

  return {
    intent: "search",
    searchQuery: lastUserQuery(messages),
    candidateName: null,
  };
}

/**
 * Resolve retrieval intent. Prefer heuristics; call Gemini only when ambiguous.
 */
export async function resolveQueryPlan(options: {
  apiKey: string;
  modelId: string;
  messages: UIMessage[];
  priorSources: string[];
}): Promise<QueryPlan> {
  const { apiKey, modelId, messages, priorSources } = options;
  const latest = lastUserQuery(messages);

  const heuristic = tryHeuristicQueryPlan(messages, priorSources);
  if (heuristic) return heuristic;

  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const { object } = await generateObject({
      model: google(modelId),
      schema: queryPlanSchema,
      temperature: 0,
      prompt: `You classify CV-screening chat turns for retrieval.

Prior CV source files from the last assistant answer (may be empty):
${priorSources.length > 0 ? priorSources.join(", ") : "(none)"}

Conversation:
${buildConversationSnippet(messages)}

Rules:
- intent "refine": user narrows or filters the PREVIOUS candidate set (e.g. "of these who know AWS", "de estos cuáles saben React"). Requires prior sources when possible. searchQuery must combine prior criteria with the new constraint (e.g. "candidates with React and AWS").
- intent "lookup": user asks about a specific person by name (summary, profile, experience). Set candidateName to the name as written (partial OK). searchQuery should target that person.
- intent "search": new skill/criteria search unrelated to narrowing the previous list. searchQuery is a standalone embedding query with all needed skills.

Return only the structured object.`,
    });

    if (object.intent === "refine" && priorSources.length === 0) {
      return {
        intent: "search",
        searchQuery: object.searchQuery || latest,
        candidateName: object.candidateName,
      };
    }

    return {
      intent: object.intent,
      searchQuery: object.searchQuery?.trim() || latest,
      candidateName: object.candidateName?.trim() || null,
    };
  } catch {
    return fallbackPlan(messages, priorSources);
  }
}
