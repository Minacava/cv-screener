import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { GoogleGenAI } from "@google/genai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";

import { embedText } from "@/lib/rag/embeddings";
import {
  getPineconeIndex,
  PINECONE_CV_NAMESPACE,
  type CvVectorMetadata,
} from "@/lib/rag/pinecone";

export const maxDuration = 30;

const TOP_K = 5;

type ChatMessageSources = {
  sources?: string[];
};

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function lastUserQuery(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      const text = getMessageText(message);
      if (text) return text;
    }
  }
  throw new Error("No user message found");
}

function buildGroundedInstructions(
  matches: Array<{
    fullName: string;
    fileName: string;
    text: string;
  }>
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

  return `You are a CV screening assistant in a polished chat UI.

Answer ONLY using the retrieved CV context below. Do not invent candidates, skills, employers, or education.
If the context is insufficient, say you could not find that information in the indexed CVs.

Formatting rules:
- Use clean Markdown (headings, short paragraphs, bullet lists).
- Lead with a one-sentence summary when useful.
- For each candidate use a bold name as the list item title, then 1–2 short bullets of evidence.
- Do NOT include PDF filenames or "Source file" lines in the answer — the UI already shows source badges.
- Keep answers concise and scannable.

Retrieved CV context:
${context}`;
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

  const query = lastUserQuery(messages);
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const queryVector = await embedText(ai, embeddingModel, query);
  const index = await getPineconeIndex<CvVectorMetadata>();

  const retrieval = await index.query({
    namespace: PINECONE_CV_NAMESPACE,
    vector: queryVector,
    topK: TOP_K,
    includeMetadata: true,
  });

  const matches = (retrieval.matches ?? [])
    .map((match) => {
      const metadata = match.metadata as CvVectorMetadata | undefined;
      if (!metadata?.fileName || !metadata.text) return null;
      return {
        fullName: metadata.fullName || metadata.fileName,
        fileName: metadata.fileName,
        text: metadata.text,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const sources = [...new Set(matches.map((match) => match.fileName))];
  const google = createGoogleGenerativeAI({ apiKey: geminiKey });

  const result = streamText({
    model: google(chatModel),
    instructions: buildGroundedInstructions(matches),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      messageMetadata: ({ part }): ChatMessageSources | undefined => {
        if (part.type === "start" || part.type === "finish") {
          return { sources };
        }
        return undefined;
      },
    }),
  });
}
