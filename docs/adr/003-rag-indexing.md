# ADR 003: RAG Indexing Strategy


## Context

After generating 25 mock CV PDFs, we need a local ingestion path that:

1. Extracts text from each PDF
2. Turns that text into vectors
3. Stores vectors so the chat UI can retrieve relevant candidates

Constraints: free-tier friendly, TypeScript end-to-end, easy to re-run before a demo, simple to explain in an interview.

## Decision

| Topic | Choice | Why |
|-------|--------|-----|
| Extraction | `pdf-parse` v2 (`PDFParse`) in `scripts/index-cvs.ts` | Linear pdfkit templates |
| Chunking | **1 vector per CV** (full page text) | Candidate-level demo queries |
| Embeddings | Gemini `gemini-embedding-001` (`outputDimensionality: 768`) | Current embed API; matches Pinecone 768-dim index |
| Vector DB | Pinecone serverless index, metric `cosine`, dim `768` | Free tier, no local Docker |
| Namespace | `cvs` | Isolates demo data; easy reset |
| Record IDs | `cv-{filename-slug}` (idempotent re-upserts) | Safe to re-run indexing |
| Metadata | `fileName`, `fullName`, `text` | Sources + grounding for chat |

Command:

```bash
npm run generate-cvs   # 25 PDFs
RESET_PINECONE=1 npm run index-cvs   # 25 vectors in namespace cvs
```

Shared helpers for the future chat route:

- `lib/rag/embeddings.ts` — Gemini embed
- `lib/rag/pinecone.ts` — index client + `PINECONE_CV_NAMESPACE`

## Why one vector per CV

Demo questions are candidate-level (“Who has Python?”, “UPC graduates?”, “Summarize Jane Doe”). Our CVs are single-page pdfkit templates (~1–2k chars). Embedding the whole CV:

- Maximizes recall for skill / school / name queries
- Avoids over-engineering chunk overlap / section splitting
- Makes source attribution trivial (one file ↔ one vector)

If real multi-page recruiter PDFs appeared later, we would revisit section or sliding-window chunks (follow-up ADR).

## Why Gemini embeddings + Pinecone

- Same vendor already used for CV text generation
- `gemini-embedding-001` with `outputDimensionality: 768` matches the serverless Pinecone index
- Managed vector store without local Docker for the demo

## Consequences

**Benefits**

- Predictable demo: always **25 PDFs → 25 vectors**
- Re-runnable: upsert by stable IDs; optional `RESET_PINECONE=1` clears namespace `cvs`
- Chat can reuse the same embed + Pinecone helpers

**Trade-offs**

- Pinecone index must be created manually (768 / cosine / serverless)
- Metadata `text` size is capped (~30k chars) for Pinecone limits — fine for 1-page mocks
- No hybrid / sparse search in this prototype

## Alternatives considered

| Alternative | Why not now |
|-------------|-------------|
| Section chunks (skills / experience / education) | More vectors and join logic; unnecessary for 1-page CVs |
| Local Chroma / in-memory | Does not persist across Next.js restarts as cleanly for a managed RAG story |
| LlamaParse | Extra API; our PDFs are linear templates |

## Pinecone index setup (one-time)

- Name: `cv-screener` (or `PINECONE_INDEX_NAME`)
- Dimensions: **768**
- Metric: **cosine**
- Spec: serverless (free tier)

## Follow-ups

- Chat query path documented in [ADR 004](004-chat-rag.md)
- Evaluate whether section chunks improve precision if candidate-level retrieval is not enough
