import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { GoogleGenAI } from "@google/genai";
import {
  convertToModelMessages,
  cosineSimilarity,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import { filterCandidatesByConstraint, tryLexicalFilter } from "@/lib/rag/constraint-filter";
import { vectorIdFromFileName } from "@/lib/rag/cv-ids";
import { embedText } from "@/lib/rag/embeddings";
import {
  filterByCandidateName,
  nameTokens,
  normalizeForMatch,
} from "@/lib/rag/name-match";
import {
  getPineconeIndex,
  PINECONE_CV_NAMESPACE,
  type CvVectorMetadata,
} from "@/lib/rag/pinecone";
import {
  getLastAssistantSources,
  lastUserQuery,
  resolveQueryPlan,
  type QueryPlan,
} from "@/lib/rag/query-plan";

export const maxDuration = 30;

/** Neighbors to retrieve before filtering (25 = full demo corpus). */
const TOP_K = 25;
/** Floor for each individual match. */
const MIN_SCORE = 0.45;
/** Top hit must exceed this to show any CVs (filters off-topic queries). */
const MIN_TOP_SCORE = 0.5;

type ChatMessageSources = {
  sources?: string[];
};

type RetrievedCv = {
  fullName: string;
  fileName: string;
  text: string;
  score: number;
};

/** Detect a likely person-name lookup when the planner stayed on "search". */
function inferLookupName(query: string): string | null {
  const normalized = normalizeForMatch(query);
  const lookupCue =
    /\b(summarize|summary|profile|tell me about|who is|cv of|resume of|experiencia de|perfil de|resumen de)\b/i;
  if (!lookupCue.test(query)) return null;

  // Prefer capitalized tokens from the raw query (e.g. Jane, Jane Doe)
  const proper = query.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g
  );
  if (proper && proper.length > 0) {
    // Last proper-noun phrase is usually the person (after "Summarize the profile of")
    return proper[proper.length - 1] ?? null;
  }

  const tokens = nameTokens(normalized);
  return tokens.length > 0 ? tokens[tokens.length - 1]! : null;
}

function promoteLookupPlan(plan: QueryPlan, rawQuery: string): QueryPlan {
  if (plan.intent === "lookup" && plan.candidateName) return plan;
  if (plan.intent === "refine") return plan;

  const inferred =
    plan.candidateName?.trim() || inferLookupName(rawQuery);
  if (!inferred) return plan;

  return {
    intent: "lookup",
    searchQuery: plan.searchQuery || `CV profile of ${inferred}`,
    candidateName: inferred,
  };
}

/** Drop off-topic/weak hits for skill search. */
function filterRelevantMatches(matches: RetrievedCv[]): RetrievedCv[] {
  if (matches.length === 0) return [];

  const topScore = matches[0]?.score ?? 0;
  if (topScore < MIN_TOP_SCORE) return [];

  return matches.filter((match) => match.score >= MIN_SCORE);
}

function buildGroundedInstructions(
  matches: RetrievedCv[],
  plan: QueryPlan
): string {
  const context =
    matches.length === 0
      ? "(No matching CVs were retrieved.)"
      : matches
          .map(
            (match, index) =>
              `### Candidate ${index + 1}: ${match.fullName}\n` +
              `Source file: ${match.fileName}\n` +
              `${match.text}`
          )
          .join("\n\n");

  const modeNotes =
    plan.intent === "refine"
      ? `
Mode: refine previous results.
The CV context below is ONLY the candidates from the previous turn. Filter them against the latest user constraint. List only those who match; if none match, say so clearly. Do not introduce other candidates.`
      : plan.intent === "lookup"
        ? `
Mode: person lookup.
Answer only about the named candidate(s) in the context. Do not mention or summarize other people.`
        : "";

  return `You are a CV screening assistant in a polished chat UI.

Answer ONLY using the retrieved CV context below. Do not invent candidates, skills, employers, or education.
If the context is insufficient, say you could not find that information in the indexed CVs.
${modeNotes}

Formatting rules:
- Use clean Markdown (headings, short paragraphs, bullet lists).
- Lead with a one-sentence summary when useful.
- For each candidate use a bold name as the list item title, then 1–2 short bullets of evidence.
- Do NOT include PDF filenames or "Source file" lines in the answer — the UI already shows source badges.
- Keep answers concise and scannable.

Retrieved CV context:
${context}`;
}

function metadataToRetrieved(
  metadata: CvVectorMetadata,
  score: number
): RetrievedCv {
  return {
    fullName: metadata.fullName || metadata.fileName,
    fileName: metadata.fileName,
    text: metadata.text,
    score,
  };
}

async function retrieveFromPineconeQuery(
  queryVector: number[],
  searchQuery: string,
  plan: QueryPlan
): Promise<RetrievedCv[]> {
  const index = await getPineconeIndex<CvVectorMetadata>();
  const retrieval = await index.query({
    namespace: PINECONE_CV_NAMESPACE,
    vector: queryVector,
    topK: TOP_K,
    includeMetadata: true,
  });

  const scoredMatches = (retrieval.matches ?? [])
    .map((match) => {
      const metadata = match.metadata as CvVectorMetadata | undefined;
      if (!metadata?.fileName || !metadata.text) return null;
      return metadataToRetrieved(metadata, match.score ?? 0);
    })
    .filter((item): item is RetrievedCv => item !== null);

  if (plan.intent === "lookup") {
    const named = filterByCandidateName(
      searchQuery,
      scoredMatches,
      plan.candidateName
    );
    // If name filter emptied the set, try matching against the raw candidate name only
    if (named.length > 0) return named;
    return filterByCandidateName(
      plan.candidateName || searchQuery,
      scoredMatches,
      plan.candidateName
    );
  }

  // Prefer CVs that literally mention distinctive tokens (e.g. "upc", "python")
  const lexical = tryLexicalFilter(scoredMatches, searchQuery);
  if (lexical) return lexical;

  return filterRelevantMatches(scoredMatches);
}

async function retrieveRefinedFromSources(options: {
  queryVector: number[];
  constraintQuery: string;
  priorSources: string[];
}): Promise<RetrievedCv[]> {
  const { queryVector, constraintQuery, priorSources } = options;
  const index = await getPineconeIndex<CvVectorMetadata>();
  const ids = [...new Set(priorSources.map((file) => vectorIdFromFileName(file)))];
  const fetched = await index.fetch({
    ids,
    namespace: PINECONE_CV_NAMESPACE,
  });

  const records = fetched.records ?? {};
  const retrieved: RetrievedCv[] = [];

  for (const id of ids) {
    const record = records[id];
    const metadata = record?.metadata as CvVectorMetadata | undefined;
    if (!metadata?.fileName || !metadata.text) continue;

    const values = record.values;
    const score =
      Array.isArray(values) && values.length === queryVector.length
        ? cosineSimilarity(queryVector, values)
        : 0;

    retrieved.push(metadataToRetrieved(metadata, score));
  }

  const ranked = retrieved.sort((a, b) => b.score - a.score);
  // Prefer the latest user turn for lexical tokens (e.g. only "aws")
  return filterCandidatesByConstraint(ranked, constraintQuery);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { messages?: UIMessage[] };
  const messages = body.messages ?? [];
  if (messages.length === 0) {
    return Response.json({ error: "messages are required" }, { status: 400 });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL;
  const chatModel =
    process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_CV_GEN_MODEL;

  if (!geminiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }
  if (!embeddingModel) {
    return Response.json(
      { error: "GEMINI_EMBEDDING_MODEL is not configured" },
      { status: 500 }
    );
  }
  if (!chatModel) {
    return Response.json(
      { error: "Set GEMINI_CHAT_MODEL or GEMINI_CV_GEN_MODEL" },
      { status: 500 }
    );
  }

  const priorSources = getLastAssistantSources(messages);
  const rawQuery = lastUserQuery(messages);
  let plan = await resolveQueryPlan({
    apiKey: geminiKey,
    modelId: chatModel,
    messages,
    priorSources,
  });
  plan = promoteLookupPlan(plan, rawQuery);

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const queryVector = await embedText(ai, embeddingModel, plan.searchQuery);

  const matches =
    plan.intent === "refine" && priorSources.length > 0
      ? await retrieveRefinedFromSources({
          queryVector,
          constraintQuery: rawQuery,
          priorSources,
        })
      : await retrieveFromPineconeQuery(queryVector, plan.searchQuery, plan);

  const sources = [...new Set(matches.map((match) => match.fileName))];
  const google = createGoogleGenerativeAI({ apiKey: geminiKey });

  const result = streamText({
    model: google(chatModel),
    instructions: buildGroundedInstructions(matches, plan),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      messageMetadata: ({ part }): ChatMessageSources | undefined => {
        if (part.type === "finish") {
          return { sources };
        }
        return undefined;
      },
    }),
  });
}
