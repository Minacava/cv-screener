# ADR 002: CV Generation Pipeline Strategy

## Context

The technical task requires generating 25–30 realistic fake CVs in PDF format with:

- AI-generated structured text (name, contact, experience, education, skills)
- AI-generated professional headshot photos
- Professional PDF layout
- Specific seed requirements: Jane Doe, UPC graduates, Python experience

Constraints: demo-reliable, free-tier friendly, must not block PDF write on image failures.

## Decision

### Text generation: Gemini only

**Env:** `GEMINI_CV_GEN_MODEL` (default in `.env.example`: `gemini-flash-lite-latest`)

- Structured JSON via Gemini `responseMimeType: application/json` + `responseSchema`
- OpenRouter free-tier models were tried for CV text and hung indefinitely — removed from this path
- Batch size 7 (four batches for 25 CVs); each batch is try/catch so one failure does not abort the run
- On HTTP 429 wait `15_000 * attempt` ms; on 503 use shorter backoff; up to 4 attempts per batch
- `parseCandidatesJson` extracts a balanced `{...}` object so trailing model noise does not break the pipeline

Prompt rules (batch-aware): Jane Doe only in batch 1; UPC / Python quotas; English CVs; `photoPromptHint` for portraits.

### Image generation: Gemini → Pollinations → placeholder

**Primary:** `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image`  
**Fallback:** Pollinations.ai (no API key)  
**Last resort:** pdfkit “No photo” box

```
1. Try Gemini Image (2 attempts)
2. On 429 → disable Gemini images for the rest of the run
3. Fall back to Pollinations (20s timeout, up to 4 retries with backoff)
4. If SKIP_GEMINI_IMAGE=1 → skip Gemini and use Pollinations directly
5. If all fail → write PDF with placeholder (never block)
```

Pace writes (~1.2s after a successful photo, longer after failures) to reduce provider 429s.

### PDF layout

**Tool:** pdfkit in `lib/cv/pdf-template.ts`

- Fixed A4 margins, header photo + identity block, section rules
- Experience / education: title left, dates/year right-aligned
- Bullets in a dedicated column; sections: Summary, Skills, Experience, Education

## Consequences

**Benefits**

- Single reliable text path (Gemini)
- Image failures never stop the 25-PDF deliverable
- Output is deterministic enough for demos and committed under `cvs/`

**Trade-offs**

- Gemini image quota often forces Pollinations (slower, rate-limited)
- Sequential batches are simpler but not maximally parallel

## Implementation map

```
askGeminiForCandidateProfiles()
  → retries + parseCandidatesJson()
  → CvCandidate[]

generateCandidatePhoto()
  → Gemini image and/or Pollinations
  → Buffer | null

writeCandidatePdf()
  → cvs/CV_{index}_{name}.pdf
```

Files: `scripts/generate-cvs.ts`, `lib/cv/pdf-template.ts`, `lib/cv/types.ts`, output `cvs/` + `manifest.json`.

## Environment

```bash
# Required
GEMINI_API_KEY=...
GEMINI_CV_GEN_MODEL=gemini-flash-lite-latest
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image

# Optional
SKIP_GEMINI_IMAGE=1   # Pollinations only for portraits
CV_COUNT=25           # Override default count
```

Removed from this path: `OPENROUTER_CV_GEN_MODEL` / `OPENROUTER_CV_GEN_MODELS`.

## Alternatives considered

| Alternative | Why not |
|-------------|---------|
| OpenRouter free tier for CV text | Unreliable hangs; not demo-ready |
| OpenAI DALL-E | Paid API; overkill for headshots |
| Skip images entirely | Task asks for AI-generated photos |
| LangChain orchestration | Unnecessary for this pipeline |

## Follow-ups

- Prefer committed `cvs/` for review demos; regenerate when the template or seed rules change
- Watch Gemini / Pollinations quotas before live demos
