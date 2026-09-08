import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { PDFParse } from "pdf-parse";

import { loadEnvFilesIntoProcess } from "../lib/env";
import { embedTexts } from "../lib/rag/embeddings";
import {
  getPineconeIndex,
  PINECONE_CV_NAMESPACE,
  type CvVectorMetadata,
} from "../lib/rag/pinecone";

const ROOT = process.cwd();
const CVS_DIR = path.join(ROOT, "cvs");
const EXPECTED_CV_COUNT = 25;
const EMBED_BATCH_SIZE = 5;
const MAX_METADATA_TEXT_CHARS = 30_000;

type CvDocument = {
  id: string;
  fileName: string;
  fullName: string;
  text: string;
};

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fullNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "");
  const withoutPrefix = base.replace(/^CV_\d+_/, "");
  return withoutPrefix.replace(/_/g, " ").trim() || base;
}

function vectorIdFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "");
  return `cv-${base}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-");
}

async function extractPdfText(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return cleanText(result.text ?? "");
  } finally {
    await parser.destroy();
  }
}

async function listCvPdfs(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(CVS_DIR);
  } catch {
    throw new Error(
      `No cvs/ directory found. Run \`npm run generate-cvs\` first.`
    );
  }

  return entries
    .filter((name) => /^CV_\d+_.*\.pdf$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/^CV_(\d+)_/i)?.[1] ?? 0);
      const nb = Number(b.match(/^CV_(\d+)_/i)?.[1] ?? 0);
      return na - nb;
    });
}

async function loadCvDocuments(fileNames: string[]): Promise<CvDocument[]> {
  const docs: CvDocument[] = [];

  for (const fileName of fileNames) {
    const filePath = path.join(CVS_DIR, fileName);
    console.log(`  Parsing ${fileName}…`);
    const text = await extractPdfText(filePath);
    if (!text) {
      console.warn(`  Empty text for ${fileName}; skipping`);
      continue;
    }
    docs.push({
      id: vectorIdFromFileName(fileName),
      fileName,
      fullName: fullNameFromFileName(fileName),
      text:
        text.length > MAX_METADATA_TEXT_CHARS
          ? text.slice(0, MAX_METADATA_TEXT_CHARS)
          : text,
    });
  }

  return docs;
}

async function runIndexCvsPipeline(): Promise<void> {
  await loadEnvFilesIntoProcess();

  const geminiKey = process.env.GEMINI_API_KEY;
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL;

  if (!geminiKey) {
    throw new Error("Set GEMINI_API_KEY in .env.local");
  }
  if (!embeddingModel) {
    throw new Error("Set GEMINI_EMBEDDING_MODEL in .env.local");
  }

  const fileNames = await listCvPdfs();
  if (fileNames.length === 0) {
    throw new Error(
      `No CV_*.pdf files in ${CVS_DIR}. Run \`npm run generate-cvs\` first.`
    );
  }
  if (fileNames.length < EXPECTED_CV_COUNT) {
    console.warn(
      `Found ${fileNames.length} PDFs (expected ${EXPECTED_CV_COUNT}). ` +
        `Indexing available files. Run \`npm run generate-cvs\` to regenerate.`
    );
  } else if (fileNames.length > EXPECTED_CV_COUNT) {
    console.warn(
      `Found ${fileNames.length} PDFs (expected ${EXPECTED_CV_COUNT}). Indexing all.`
    );
  }

  console.log(
    `Indexing ${fileNames.length} CV(s) → Pinecone namespace "${PINECONE_CV_NAMESPACE}"…`
  );

  const docs = await loadCvDocuments(fileNames);
  if (docs.length === 0) {
    throw new Error("No extractable CV text found");
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const index = await getPineconeIndex<CvVectorMetadata>();

  if (process.env.RESET_PINECONE === "1") {
    console.log(
      `  RESET_PINECONE=1 → clearing namespace "${PINECONE_CV_NAMESPACE}"…`
    );
    try {
      await index.deleteAll({ namespace: PINECONE_CV_NAMESPACE });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/404|NotFound/i.test(msg)) {
        console.warn(
          `  Namespace "${PINECONE_CV_NAMESPACE}" was empty or missing; continuing.`
        );
      } else {
        throw error;
      }
    }
  }

  let upserted = 0;
  for (let i = 0; i < docs.length; i += EMBED_BATCH_SIZE) {
    const batch = docs.slice(i, i + EMBED_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(docs.length / EMBED_BATCH_SIZE);
    console.log(
      `  Embed + upsert batch ${batchNum}/${totalBatches} (${batch.length} CVs)…`
    );

    const vectors = await embedTexts(
      ai,
      embeddingModel,
      batch.map((d) => d.text)
    );

    await index.upsert({
      namespace: PINECONE_CV_NAMESPACE,
      records: batch.map((doc, j) => ({
        id: doc.id,
        values: vectors[j]!,
        metadata: {
          fileName: doc.fileName,
          fullName: doc.fullName,
          text: doc.text,
        },
      })),
    });

    upserted += batch.length;
    await waitMs(300);
  }

  const stats = await index.describeIndexStats();
  const nsCount =
    stats.namespaces?.[PINECONE_CV_NAMESPACE]?.recordCount ?? upserted;

  console.log(`Indexed ${upserted} vectors from ${docs.length} CVs`);
  console.log(
    `Pinecone namespace "${PINECONE_CV_NAMESPACE}" now reports ~${nsCount} record(s)`
  );

  if (docs.length === EXPECTED_CV_COUNT && upserted === EXPECTED_CV_COUNT) {
    console.log(`Indexed ${EXPECTED_CV_COUNT} CVs successfully`);
  }
}

runIndexCvsPipeline().catch((error) => {
  console.error(error);
  process.exit(1);
});
