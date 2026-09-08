# ADR 001: Technology Stack for CV Screener

## Context

We need a compact full-stack prototype that can:

1. Generate or ingest CV PDFs
2. Embed and store them for similarity search
3. Query candidates from a web UI (e.g. against a job description)

Constraints: TypeScript end-to-end, free-tier friendly APIs, easy local demo for reviewers, minimal ops overhead.

## Decision

| Layer | Choice | Responsibility |
|-------|--------|----------------|
| App | Next.js (App Router) + TypeScript | UI and server logic in one codebase |
| UI | Tailwind CSS + shadcn | Consistent, fast-to-build components |
| LLM / chat | Google Gemini (`gemini-flash-lite-latest` via `GEMINI_CV_GEN_MODEL` / `GEMINI_CHAT_MODEL`) | CV JSON generation and grounded chat answers |
| Embeddings | Gemini `gemini-embedding-001` (`outputDimensionality: 768`) | Indexing and query vectors |
| Images | Gemini `gemini-3.1-flash-image` → Pollinations.ai fallback | CV headshots without blocking PDF write |
| Vector DB | Pinecone (serverless free tier, cosine, 768) | Persistent similarity search |
| PDFs | pdfkit (write) + pdf-parse (read) | Mock CV generation and text extraction |
| Offline pipeline | tsx scripts (`generate-cvs`, `index-cvs`) | Ingestion outside the HTTP request path |

Secrets live in `.env.local` (gitignored). Only `.env.example` is committed. Demo PDFs under `cvs/` are committed for review/preview.

## Consequences

**Benefits**

- Single language for app and scripts
- One model vendor for chat, generation, and embeddings
- Managed vector store without self-hosting
- Straightforward deploy path (e.g. Vercel) for the web app

**Trade-offs**

- Coupling to Gemini and Pinecone (keys, quotas, vendor lock-in)
- Demo requires API keys and a pre-created Pinecone index
- Ingestion scripts run locally; they are not part of the serverless request lifecycle
- Out of scope for this prototype: auth, private object storage, multi-tenant isolation, production-scale batch indexing

## Alternatives considered

| Alternative | Why not for this prototype |
|-------------|----------------------------|
| OpenAI for chat + embeddings | Equally valid RAG pattern; Gemini chosen for free-tier friction and a single model vendor in TypeScript |
| OpenRouter free tier for CV text | Hung indefinitely in testing; removed from the critical generation path |
| Local vector store (in-memory / Chroma) | Simpler offline story, but less representative of managed RAG and does not persist across ephemeral serverless instances |
| Split FastAPI (Python) + React SPA | Stronger ML ecosystem in Python, but more repos, CORS, and deploy surface than needed for this take-home size |
| LlamaParse (LlamaIndex / LlamaCloud) | Stronger on messy real-world PDFs, but adds another API, cost, and latency; unnecessary while CVs are template-generated |

## PDF text extraction

**Decision:** extract text with **`pdf-parse`** in the local ingestion script.

**Why pdf-parse**

- Mock CVs are produced with **pdfkit** templates → mostly linear text, not multi-column or scanned layouts
- No extra vendor or API key beyond Gemini and Pinecone
- Runs fully offline inside `index-cvs`
- Enough clean text for embeddings in this prototype

**When I would use LlamaParse (LlamaIndex — not LangChain)**

- Real recruiter PDFs with complex layouts, tables, or structure that local parsers scramble
- Willing to accept LlamaCloud API key, cost, and network latency for higher-fidelity markdown/text

**Where LangChain fits**

- LangChain is an **orchestration** framework (chains, agents, retrievers, tool wiring), not a drop-in replacement for `pdf-parse`
- If the RAG plumbing grew (multi-step retrieval, tools, eval harnesses), LangChain (or LlamaIndex) could sit above the same stack
- PDF parsing would still be an explicit choice underneath: keep `pdf-parse`, or swap in LlamaParse / another loader

## Target RAG flow

1. **Ingestion (local script):** PDF → `pdf-parse` → Gemini embedding → Pinecone upsert  
2. **Query (app):** user prompt → embedding → Pinecone K-NN → augment prompt → Gemini response  

Intended PDF generation approach: structured JSON from Gemini, rendered through a pdfkit template (avoids unreliable LLM-authored PDF layout).

## Follow-ups

Detail decisions live in:

- [ADR 002](002-cv-generation.md) — CV generation
- [ADR 003](003-rag-indexing.md) — indexing / chunking
- [ADR 004](004-chat-rag.md) — chat retrieve-and-generate path
