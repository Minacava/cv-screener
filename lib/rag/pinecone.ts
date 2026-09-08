import { Pinecone, type Index, type RecordMetadata } from "@pinecone-database/pinecone";

export const PINECONE_CV_NAMESPACE = "cvs";

export type CvVectorMetadata = {
  fileName: string;
  fullName: string;
  text: string;
};

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
  const description = await pc.describeIndex(indexName);
  if (!description.host) {
    throw new Error(
      `Pinecone index "${indexName}" has no host (is it ready?)`
    );
  }

  return pc.index<T>({ host: description.host });
}
