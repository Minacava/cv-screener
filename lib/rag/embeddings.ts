import type { GoogleGenAI } from "@google/genai";

/** Must match the Pinecone index dimension. */
export const EMBEDDING_DIMENSIONS = 768;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusFromError(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    return Number((error as { status?: number }).status);
  }
  return undefined;
}

/** Embed texts with Gemini; retries on transient 429/503. */
export async function embedTexts(
  ai: GoogleGenAI,
  model: string,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model,
        contents: texts,
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      });
      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== texts.length) {
        throw new Error(
          `Expected ${texts.length} embeddings, got ${embeddings.length}`
        );
      }
      return embeddings.map((item, i) => {
        const values = item.values;
        if (!values || values.length === 0) {
          throw new Error(`Empty embedding at index ${i}`);
        }
        if (values.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Expected ${EMBEDDING_DIMENSIONS}-dim embedding at index ${i}, got ${values.length}`
          );
        }
        return values;
      });
    } catch (error) {
      lastError = error;
      const status = statusFromError(error);
      console.warn(
        `  Embedding attempt ${attempt} failed` +
          (status ? ` (${status})` : "")
      );
      if (status === 429 || status === 503) {
        await waitMs(1500 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to embed texts");
}

export async function embedText(
  ai: GoogleGenAI,
  model: string,
  text: string
): Promise<number[]> {
  const [vector] = await embedTexts(ai, model, [text]);
  if (!vector) throw new Error("Empty embedding response");
  return vector;
}
