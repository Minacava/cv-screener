import { Pinecone, type Index, type RecordMetadata } from "@pinecone-database/pinecone";

export const PINECONE_CV_NAMESPACE = "cvs";

export type CvVectorMetadata = {
  fileName: string;
  fullName: string;
  text: string;
};

type CachedHost = {
  indexName: string;
  host: string;
  expiresAt: number;
};

/** Reuse describeIndex result across warm serverless/dev requests. */
const HOST_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedHost: CachedHost | null = null;

async function resolveIndexHost(
  pc: Pinecone,
  indexName: string
): Promise<string> {
  const now = Date.now();
  if (
    cachedHost &&
    cachedHost.indexName === indexName &&
    cachedHost.expiresAt > now
  ) {
    return cachedHost.host;
  }

  const description = await pc.describeIndex(indexName);
  if (!description.host) {
    throw new Error(
      `Pinecone index "${indexName}" has no host (is it ready?)`
    );
  }

  cachedHost = {
    indexName,
    host: description.host,
    expiresAt: now + HOST_CACHE_TTL_MS,
  };
  return description.host;
}

/** Pinecone index client from `PINECONE_API_KEY` and `PINECONE_INDEX_NAME`. */
export async function getPineconeIndex<
  T extends RecordMetadata = CvVectorMetadata
>(): Promise<Index<T>> {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;

  if (!apiKey) {
    throw new Error("Set PINECONE_API_KEY in .env.local");
  }
  if (!indexName) {
    throw new Error("Set PINECONE_INDEX_NAME in .env.local");
  }

  const pc = new Pinecone({ apiKey });
  const host = await resolveIndexHost(pc, indexName);
  return pc.index<T>({ host });
}
