# CV Screener

Semantic CV screening app: generate synthetic CV PDFs, index them in Pinecone with Gemini embeddings, and query candidates from a Next.js chat UI.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind / shadcn
- **Google Gemini** — CV generation, embeddings, and chat
- **Pollinations.ai** — automatic image fallback when Gemini image quota is unavailable
- **Pinecone** — vector store
- **pdfkit** / **pdf-parse** — generate and extract CV PDFs

## Requirements

- Node.js 20+
- [Google AI Studio](https://aistudio.google.com/apikey) API key (required for generation, embeddings, and chat)
- Free [Pinecone](https://www.pinecone.io/) serverless index named `cv-screener`
  - **Dimensions:** 768 (`gemini-embedding-001` with `outputDimensionality: 768`)
  - **Metric:** cosine
  - **Spec:** serverless (free tier)

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` with your keys (this file is gitignored):

```bash
# Required
GEMINI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=cv-screener

# Models (see .env.example)
GEMINI_CV_GEN_MODEL=gemini-flash-lite-latest
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
# Optional — defaults to GEMINI_CV_GEN_MODEL
# GEMINI_CHAT_MODEL=gemini-flash-lite-latest
```

The repo already includes **25 demo PDFs** in `cvs/` and is intended to run against a shared Pinecone namespace (`cvs`) that you index once.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data pipeline (optional regenerate)

Only needed if you want to rebuild the dataset or refresh vectors:

```bash
# 1. Generate 25 sample CVs (PDFs in cvs/)
npm run generate-cvs

# 2. Embed and upsert into Pinecone namespace "cvs"
#    Prefer RESET_PINECONE=1 only on your own index / before a clean demo reindex
RESET_PINECONE=1 npm run index-cvs
# → Indexed 25 vectors from 25 CVs
```

## Architecture

1. `scripts/generate-cvs` creates **25** synthetic PDFs in `cvs/` (Gemini text + Gemini/Pollinations photos)
2. `scripts/index-cvs` parses each PDF, embeds text (768-dim), and upserts **25 vectors** into Pinecone (`namespace: cvs`)
3. `/api/chat` embeds the user query, retrieves similar CVs from Pinecone, and streams a grounded answer with Gemini (source badges can open the PDF in a side panel)

**Architecture Decision Records:**

- [ADR 001: Technology Stack](docs/adr/001-stack.md)
- [ADR 002: CV Generation Strategy](docs/adr/002-cv-generation.md)
- [ADR 003: RAG Indexing](docs/adr/003-rag-indexing.md)
- [ADR 004: Chat RAG Query Path](docs/adr/004-chat-rag.md)

## Notes

- Keep secrets in `.env.local` only — use `.env.example` as the template
- Demo PDFs in `cvs/` are committed so local/Vercel preview can open sources without regenerating
- Chat uses Gemini; image generation falls back to Pollinations when Gemini image quota is unavailable
