import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI, Modality, Type } from "@google/genai";

import { writeCandidatePdf } from "../lib/cv/pdf-template";
import type { CvCandidate } from "../lib/cv/types";
import { loadEnvFilesIntoProcess } from "../lib/env";

const ROOT = process.cwd();
const CVS_DIR = path.join(ROOT, "cvs");

let skipGeminiImageForRun = false;

function resolveTargetCount(): number {
  const raw = process.env.CV_COUNT;
  if (raw === undefined || raw === "") return 25;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`CV_COUNT must be a positive number (got ${raw})`);
  }
  return Math.floor(n);
}

function buildBatchSizes(total: number): number[] {
  const sizes: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const size = Math.min(7, remaining);
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nameToFileSlug(fullName: string): string {
  return fullName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function buildProfilePrompt(
  count: number,
  batchIndex: number,
  totalBatches: number
): string {
  return `You are generating fake but realistic software/tech candidate CVs.

Create exactly ${count} UNIQUE candidate profiles as JSON with shape:
{ "candidates": [ { fullName, headline, email, phone, location, summary, skills[], experience[{company,title,startDate,endDate,bullets[]}], education[{institution,degree,field,graduationYear}], photoPromptHint } ] }

Hard requirements for THIS batch (batch ${batchIndex + 1} of ${totalBatches}):
${batchIndex === 0 ? `- Include exactly one candidate named "Jane Doe" (software engineer, strong Python).` : `- Do NOT include Jane Doe; invent other names.`}
${count >= 2 ? `- Include at least ${batchIndex === 0 ? Math.min(2, count) : 1} graduate(s) from Universitat Politècnica de Catalunya (UPC) / UPC Barcelona.` : `- Education may include UPC if it fits Jane Doe's profile.`}
${count >= 3 ? `- Include at least ${batchIndex === 0 ? Math.min(3, count) : Math.min(2, count)} candidates with clear Python experience in skills and/or work bullets.` : `- Include clear Python experience in skills and/or work bullets.`}
- Mix other skills when there is room: React, AWS, TypeScript, Node.js, data, ML, devops.
- English language CVs.
- Each experience entry: 2–4 bullets.
- Each candidate: 2–3 experience roles, 1–2 education entries.
- photoPromptHint: diverse, professional LinkedIn-style headshot description (no celebrities).

Return ONLY valid JSON.`;
}

function parseCandidatesJson(text: string, count: number, batchLabel: string): CvCandidate[] {
  let cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) {
    throw new Error(`No JSON object found in ${batchLabel}`);
  }
  
  let braceCount = 0;
  let lastBrace = firstBrace;
  for (let i = firstBrace; i < cleaned.length; i++) {
    if (cleaned[i] === "{") braceCount++;
    if (cleaned[i] === "}") {
      braceCount--;
      if (braceCount === 0) {
        lastBrace = i;
        break;
      }
    }
  }
  
  const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(jsonStr) as { candidates?: CvCandidate[] };
  
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    throw new Error(`Invalid candidates payload for ${batchLabel}`);
  }
  return parsed.candidates.slice(0, count);
}

const geminiCandidateResponseSchema = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING },
          headline: { type: Type.STRING },
          email: { type: Type.STRING },
          phone: { type: Type.STRING },
          location: { type: Type.STRING },
          summary: { type: Type.STRING },
          skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          experience: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                company: { type: Type.STRING },
                title: { type: Type.STRING },
                startDate: { type: Type.STRING },
                endDate: { type: Type.STRING },
                bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["company", "title", "startDate", "endDate", "bullets"],
            },
          },
          education: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                institution: { type: Type.STRING },
                degree: { type: Type.STRING },
                field: { type: Type.STRING },
                graduationYear: { type: Type.STRING },
              },
              required: ["institution", "degree", "field", "graduationYear"],
            },
          },
          photoPromptHint: { type: Type.STRING },
        },
        required: [
          "fullName",
          "headline",
          "email",
          "phone",
          "location",
          "summary",
          "skills",
          "experience",
          "education",
          "photoPromptHint",
        ],
      },
    },
  },
  required: ["candidates"],
};

async function askGeminiForCandidateProfiles(
  ai: GoogleGenAI,
  chatModel: string,
  count: number,
  batchIndex: number,
  totalBatches: number
): Promise<CvCandidate[]> {
  const prompt = buildProfilePrompt(count, batchIndex, totalBatches);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: chatModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: geminiCandidateResponseSchema,
        },
      });
      const text = response.text;
      if (!text) {
        throw new Error(`Empty Gemini response for batch ${batchIndex + 1}`);
      }
      return parseCandidatesJson(text, count, `batch ${batchIndex + 1}`);
    } catch (error) {
      lastError = error;
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: number }).status)
          : undefined;
      console.warn(
        `  Gemini batch ${batchIndex + 1} attempt ${attempt} failed` +
        (status ? ` (${status})` : "")
      );
      if (status === 503 || status === 429) {
        const delay = status === 429 ? 15_000 * attempt : 2000 * attempt;
        await waitMs(delay);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed Gemini batch ${batchIndex + 1}`);
}

function buildPortraitPrompt(candidate: CvCandidate): string {
  return `Professional corporate CV headshot photo. Square portrait, soft studio lighting, plain light background, photorealistic. Person: ${candidate.fullName}, role: ${candidate.headline}. Visual: ${candidate.photoPromptHint}. No text, no logos, no watermark overlays.`;
}

async function generateCandidatePhoto(
  ai: GoogleGenAI | null,
  imageModel: string,
  candidate: CvCandidate
): Promise<Buffer | null> {
  // Skip Gemini image API, but still try Pollinations so PDFs get a portrait.
  if (process.env.SKIP_GEMINI_IMAGE === "1" || skipGeminiImageForRun) {
    return downloadFallbackAiPortrait(buildPortraitPrompt(candidate));
  }

  const prompt = buildPortraitPrompt(candidate);

  if (ai) {
    const fromGemini = await askGeminiForPortraitBytes(
      ai,
      imageModel,
      candidate,
      prompt
    );
    if (fromGemini) return fromGemini;

    console.warn(
      `  No Gemini image for ${candidate.fullName}; trying Pollinations fallback…`
    );
  }

  return downloadFallbackAiPortrait(prompt);
}

async function askGeminiForPortraitBytes(
  ai: GoogleGenAI,
  imageModel: string,
  candidate: CvCandidate,
  prompt: string
): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: imageModel,
        contents: prompt,
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const data = part.inlineData?.data;
        if (data) return Buffer.from(data, "base64");
      }
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: number }).status)
          : undefined;
      console.warn(
        `  Gemini image error for ${candidate.fullName}:`,
        error instanceof Error ? error.message.slice(0, 120) : error
      );
      if (status === 429) {
        skipGeminiImageForRun = true;
        console.warn(
          "  Disabling Gemini image for the rest of this run (quota)."
        );
        return null;
      }
    }
    await waitMs(1000 * attempt);
  }
  return null;
}

async function downloadFallbackAiPortrait(prompt: string): Promise<Buffer | null> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=512&height=512&nologo=true&seed=${Date.now() % 100000}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "image/*" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429 || response.status === 503) {
        console.warn(`  Fallback image HTTP ${response.status}; retry ${attempt}/4`);
        await waitMs(4_000 * attempt);
        continue;
      }
      if (!response.ok) {
        console.warn(`  Fallback image HTTP ${response.status}`);
        return null;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 1000) {
        console.warn("  Fallback image too small; retrying");
        await waitMs(2_000 * attempt);
        continue;
      }
      return bytes;
    } catch (error) {
      console.warn(
        "  Fallback image failed:",
        error instanceof Error ? error.message : error
      );
      if (attempt < 4) {
        await waitMs(2_000 * attempt);
        continue;
      }
    }
  }
  return null;
}

async function runGenerateCvsPipeline(): Promise<void> {
  await loadEnvFilesIntoProcess();

  const targetCount = resolveTargetCount();
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    throw new Error(
      "Set GEMINI_API_KEY in .env.local (required for CV generation)"
    );
  }

  const geminiCvModel = process.env.GEMINI_CV_GEN_MODEL;
  if (!geminiCvModel) {
    throw new Error("Set GEMINI_CV_GEN_MODEL in .env.local");
  }

  const imageModel = process.env.GEMINI_IMAGE_MODEL;
  if (process.env.SKIP_GEMINI_IMAGE !== "1" && !imageModel) {
    throw new Error("Set GEMINI_IMAGE_MODEL in .env.local");
  }

  console.log(`Using Gemini (${geminiCvModel}) for CV generation`);

  const gemini = new GoogleGenAI({ apiKey: geminiKey });

  await mkdir(CVS_DIR, { recursive: true });

  if (process.env.SKIP_GEMINI_IMAGE === "1") {
    skipGeminiImageForRun = true;
  }

  const batchSizes = buildBatchSizes(targetCount);
  const all: CvCandidate[] = [];

  console.log(`Generating ${targetCount} profile(s) via Gemini…`);

  for (let i = 0; i < batchSizes.length; i++) {
    console.log(`  Profile batch ${i + 1}/${batchSizes.length}…`);
    try {
      const batch = await askGeminiForCandidateProfiles(
        gemini,
        geminiCvModel,
        batchSizes[i]!,
        i,
        batchSizes.length
      );
      all.push(...batch);
    } catch (error) {
      console.error(
        `  Batch ${i + 1} failed completely:`,
        error instanceof Error ? error.message : error
      );
    }
    await waitMs(800);
  }

  if (all.length === 0) {
    throw new Error("No candidates generated from any batch");
  }
  
  console.log(`Got ${all.length} profile(s) (target was ${targetCount})`);
  const candidates = all.slice(0, targetCount);
  console.log(`Writing ${candidates.length} PDF(s) with AI photos…`);

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const index = i + 1;
    const fileName = `CV_${index}_${nameToFileSlug(candidate.fullName)}.pdf`;
    const outPath = path.join(CVS_DIR, fileName);

    console.log(`  [${index}/${candidates.length}] ${candidate.fullName}`);
    let photo: Buffer | null = null;
    try {
      photo = await generateCandidatePhoto(
        gemini,
        imageModel ?? "",
        candidate
      );
    } catch (error) {
      console.warn(
        `  Photo skipped for ${candidate.fullName}:`,
        error instanceof Error ? error.message.slice(0, 120) : error
      );
    }
    await writeCandidatePdf(candidate, photo, outPath);
    console.log(
      `    → ${fileName}${photo ? "" : " (no photo / placeholder)"}`
    );
    // Pace image providers (Gemini / Pollinations) to reduce 429s.
    await waitMs(photo ? 1_200 : 2_500);
  }

  const manifest = candidates.map((c, i) => ({
    index: i + 1,
    fullName: c.fullName,
    fileName: `CV_${i + 1}_${nameToFileSlug(c.fullName)}.pdf`,
  }));
  await writeFile(
    path.join(CVS_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log(`Done. Wrote ${candidates.length} PDF(s) to ${CVS_DIR}`);
}

runGenerateCvsPipeline().catch((error) => {
  console.error(error);
  process.exit(1);
});
