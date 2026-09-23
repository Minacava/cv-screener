# CV Screener

**Semantic candidate screening with RAG** — generate synthetic CV PDFs, index them with Gemini embeddings in Pinecone, and interview your talent pool from a streaming chat UI.

**Live demo:** [cv-screener-lovat.vercel.app](https://cv-screener-lovat.vercel.app)

---

## Why this project

Recruiters often ask natural-language questions (“Who has Python and AWS?”, “Summarize Jane Doe”, “Anyone from UPC?”). This demo shows an end-to-end answer path:

1. **Ingest** — synthetic CVs as real PDFs  
2. **Index** — chunked text → 768-dim embeddings → Pinecone  
3. **Query** — chat retrieves relevant CVs, grounds the LLM, and surfaces source PDFs in a side panel  

Built as a compact full-stack portfolio piece: TypeScript end-to-end, free-tier friendly vendors, and a reviewer-ready dataset committed in-repo.

## Features

- **Streaming chat** grounded in retrieved CV context (Gemini + Vercel AI SDK)
- **Smart retrieval** — skill search, multi-turn refine, and name lookup with relevance filtering
- **Source badges** that open the matching PDF in an in-app preview
- **Offline data pipeline** — regenerate and reindex 25 demo CVs with npm scripts
- **Resilient media** — CV photos via Gemini image generation, with Pollinations.ai fallback

## Tech stack

| Layer | Choice |
|--------|--------|
| App | Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui |
| LLM / chat | Google Gemini (`gemini-flash-lite-latest`) |
| Embeddings | Gemini `gemini-embedding-001` (768 dims) |
| Vector store | Pinecone (serverless, cosine) |
| PDFs | pdfkit (write) · pdf-parse (extract) |
| Images | Gemini image model → Pollinations.ai fallback |

## Architecture

```
cvs/*.pdf  ──►  index-cvs  ──►  Pinecone (namespace: cvs)
                                      │
User chat  ──►  /api/chat  ──►  embed query + retrieve
                                      │
                               Gemini grounded answer
                                      │
                               Source badges → PDF panel
```

1. `scripts/generate-cvs` creates **25** synthetic PDFs under `cvs/`  
2. `scripts/index-cvs` parses each PDF, embeds text, and upserts vectors into Pinecone (`namespace: cvs`)  
3. `POST /api/chat` plans the query, retrieves similar CVs, and streams a grounded answer  

**Architecture Decision Records**

- [ADR 001 — Technology stack](docs/adr/001-stack.md)
- [ADR 002 — CV generation](docs/adr/002-cv-generation.md)
- [ADR 003 — RAG indexing](docs/adr/003-rag-indexing.md)
- [ADR 004 — Chat RAG query path](docs/adr/004-chat-rag.md)

## Requirements

- Node.js **20+**
- [Google AI Studio](https://aistudio.google.com/apikey) API key (generation, embeddings, chat)
- Free [Pinecone](https://www.pinecone.io/) serverless index named `cv-screener`
  - **Dimensions:** `768`
  - **Metric:** cosine
  - **Spec:** serverless (free tier)

## Quick start

```bash
npm install
cp .env.example .env.local
```

Configure `.env.local` (gitignored):

```bash
# Required
GEMINI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=cv-screener

# Models (see .env.example for full list)
GEMINI_CV_GEN_MODEL=gemini-flash-lite-latest
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
# Optional — defaults to GEMINI_CV_GEN_MODEL
# GEMINI_CHAT_MODEL=gemini-flash-lite-latest
```

The repo ships with **25 demo PDFs** in `cvs/`. Index them once into your Pinecone namespace (`cvs`), then run the app:

```bash
npm run index-cvs   # first time / after regenerating CVs
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Optional: regenerate the dataset

```bash
# 1. Generate 25 sample CVs (PDFs in cvs/)
npm run generate-cvs

# 2. Embed and upsert into Pinecone namespace "cvs"
#    Prefer RESET_PINECONE=1 only on your own index / before a clean reindex
RESET_PINECONE=1 npm run index-cvs
```

## Project structure

```
app/                 # Next.js App Router (UI + API routes)
components/chat/     # Chat UI, markdown, PDF preview
lib/rag/             # Embeddings, Pinecone, query planning, filters
scripts/             # generate-cvs · index-cvs
cvs/                 # Committed demo PDFs + manifest
docs/adr/            # Architecture Decision Records
```

## Notes

- Keep secrets in `.env.local` only — `.env.example` is the committed template
- Demo PDFs under `cvs/` are committed so previews work without regenerating
- Chat uses Gemini; image generation falls back to Pollinations when Gemini image quota is unavailable

## Author

**Marina Camacho** ([@Minacava](https://github.com/Minacava))

---

MIT-style learning / portfolio demo — feel free to fork and adapt for your own experiments.
