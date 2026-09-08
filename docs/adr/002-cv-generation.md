# ADR 002: CV Generation Pipeline Strategy

| Field | Value |
|-------|--------|
| Status | Accepted |
| Date | 2026-09-08 |
| Context | Technical take-home: Generate 25-30 realistic AI-generated CVs with photos |

## Context

The technical task requires generating 25-30 realistic fake CVs in PDF format with:
- AI-generated structured text (name, contact, experience, education, skills)
- AI-generated professional headshot photos
- Professional PDF layout
- Specific requirements: Jane Doe, UPC graduates, Python experience

Key constraints:
- Must be reliable (demo-ready for interview)
- Use free-tier APIs where possible
- Should complete in ~2-3 minutes for 25 CVs
- Must not block on image generation failures

## Decision

### Text Generation: Gemini 3.6 Flash (Exclusive)

**Model:** `gemini-3.6-flash`

**Why Gemini over OpenRouter:**
1. **Reliability:** Consistent 100% success rate in testing (~100s for 25 CVs)
2. **Structured output:** Native JSON schema validation with `responseSchema`
3. **Free tier:** Generous quota, no rate limit issues
4. **Simplicity:** Single vendor for text, embeddings, and images

**Why NOT OpenRouter free tier:**
- Tested models (`poolside/laguna-s-2.1:free`, `cohere/north-mini-code:free`) hung indefinitely (>5 minutes)
- Inconsistent timeout behavior even with 60s timeout configured
- Not production-ready for demo environment

### Image Generation: Gemini → Pollinations Fallback

**Primary:** `gemini-3.1-flash-image`
**Fallback:** Pollinations.ai (free, no API key)

**Strategy:**
```
1. Try Gemini Image (2 attempts, 1s delay)
2. If quota exceeded (429) → disable Gemini for rest of run
3. Fall back to Pollinations.ai (8s timeout)
4. If all fail → PDF placeholder ("No photo")
```

**Why this approach:**
- **Never blocks:** Images failures don't stop PDF generation
- **No quota dependency:** Pollinations has no rate limits
- **Graceful degradation:** PDFs still valid with placeholders
- **Fast when working:** Gemini images add minimal time

### Batch Processing & Resilience

**Batch size:** 7 candidates per batch (4 batches for 25 CVs)

**Error handling:**
1. **Per-batch try-catch:** Failed batch logs warning but continues
2. **JSON parsing resilience:** 
   - Extracts balanced braces `{...}` from response
   - Handles markdown fences, trailing text, comments
   - Retries on `SyntaxError` (4 attempts total)
3. **HTTP retry logic:**
   - 503/429/502: exponential backoff (2s, 4s, 6s, 8s)
   - Timeout errors: progressive retry (1s, 2s, 3s)
4. **Final validation:** Fails only if zero profiles generated across all batches

### Prompt Engineering

**Structure:**
- Clear JSON schema with all required fields
- Batch-specific requirements (Jane Doe in batch 1 only)
- Diversity requirements (UPC graduates, Python experience)
- Professional tone and realistic data

**Temperature:** 0.5 (was 0.8)
- Lower temperature = more consistent JSON formatting
- Reduces parse errors from creative formatting

### PDF Layout

**Tool:** pdfkit
**Template:** `lib/cv/pdf-template.ts`

**Layout:**
- Professional single-page design
- Photo placeholder if image unavailable
- Clean typography (Helvetica)
- Sections: Summary, Skills, Experience, Education

## Consequences

### Benefits

✅ **Reliable:** 100% success rate in testing (Gemini path)  
✅ **Fast:** ~2 minutes for 25 CVs with images  
✅ **Resilient:** Multiple fallback layers prevent total failure  
✅ **Simple:** Single code path (Gemini), easy to explain  
✅ **Demo-ready:** No manual intervention needed  

### Trade-offs

⚠️ **Gemini quota dependency:** Primary path needs valid API key with quota  
⚠️ **Pollinations speed:** Fallback images add ~8s per photo (timeout)  
⚠️ **No OpenRouter option:** Removed due to reliability issues  

### Testing Results

**Gemini-only generation (25 CVs):**
- Time: ~100 seconds
- Success rate: 100% (text)
- Image success: Varies by quota (falls back gracefully)

**OpenRouter attempts:**
- Laguna/Cohere models: Hung >5 minutes
- Even with 60s timeout: Low-level network hang
- Decision: Remove entirely from CV generation

## Implementation Details

### Key Functions

```typescript
askGeminiForCandidateProfiles()
  ↓
  4 retry attempts with exponential backoff
  ↓
  parseCandidatesJson() → balanced brace extraction
  ↓
  Return CvCandidate[]

generateCandidatePhoto()
  ↓
  Try Gemini Image (2 attempts)
  ↓
  Fallback to Pollinations.ai
  ↓
  Return Buffer | null
```

### File Structure

- `scripts/generate-cvs.ts` - Main pipeline (458 lines, down from 603)
- `lib/cv/pdf-template.ts` - PDF rendering with pdfkit
- `lib/cv/types.ts` - TypeScript interfaces
- Output: `cvs/CV_{index}_{name}.pdf` + `manifest.json`

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| OpenRouter free tier | Unreliable (hangs), not demo-ready |
| OpenAI DALL-E | Requires paid API, overkill for headshots |
| Local Stable Diffusion | Complex setup, slow, not free-tier friendly |
| Skip images entirely | Task requires "AI-generated photo" |
| LangChain orchestration | Unnecessary complexity for this pipeline |

## Environment Configuration

### Required
```bash
GEMINI_API_KEY=...
GEMINI_CV_GEN_MODEL=gemini-3.6-flash
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
```

### Optional
```bash
SKIP_GEMINI_IMAGE=1  # Skip to Pollinations directly
CV_COUNT=25          # Override default count
```

### Not Used (Removed)
```bash
OPENROUTER_CV_GEN_MODEL      # Removed due to reliability issues
OPENROUTER_CV_GEN_MODELS     # Removed due to reliability issues
USE_POLLINATIONS_FALLBACK    # Now automatic fallback
```

## Metrics

- **Lines of code:** 458 (from 603 after removing OpenRouter)
- **Generation time:** ~2-3 minutes for 25 CVs
- **Success rate:** 100% (with fallbacks)
- **Image success:** ~60-80% Gemini, 100% with Pollinations fallback

## Follow-ups

- Monitor Gemini quota usage in production
- Consider caching generated CVs if demo needs repeat runs
- Potential optimization: Parallelize batches (currently sequential for rate limiting)
