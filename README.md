# CV Screener

Semantic CV screening app: generate synthetic CV PDFs, index them in Pinecone with Gemini embeddings, and query candidates from a Next.js chat UI.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind / shadcn
- **Google Gemini** — CV generation, embeddings, and chat
- **Pollinations.ai** — automatic image fallback when Gemini image quota is unavailable
- **OpenRouter** (optional) — alternative chat / RAG provider
- **Pinecone** — vector store
- **pdfkit** / **pdf-parse** — generate and extract CV PDFs

## Requirements

- Node.js 20+
- [Google AI Studio](https://aistudio.google.com/apikey) API key (required for CV generation and embeddings)
- [OpenRouter](https://openrouter.ai/settings/keys) API key (optional, for chat / RAG)
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

# Optional — OpenRouter for chat / RAG
OPENROUTER_API_KEY=...
OPENROUTER_CHAT_MODEL=thinkingmachines/inkling-small:free
```

## Data pipeline

```bash
# 1. Generate 25 sample CVs (PDFs in cvs/)
npm run generate-cvs

# 2. Embed and upsert the 25 CVs into Pinecone namespace "cvs"
#    RESET_PINECONE=1 clears the namespace first (clean reindex)
RESET_PINECONE=1 npm run index-cvs
# → Indexed 25 vectors from 25 CVs
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

1. `scripts/generate-cvs` creates **25** synthetic PDFs in `cvs/` (Gemini text + Gemini/Pollinations photos)
2. `scripts/index-cvs` parses each PDF, embeds text (768-dim), and upserts **25 vectors** into Pinecone (`namespace: cvs`)
3. The UI embeds the user query, retrieves similar CVs, and generates an answer with Gemini or OpenRouter

**Architecture Decision Records:**

- [ADR 001: Technology Stack](docs/adr/001-stack.md)
- [ADR 002: CV Generation Strategy](docs/adr/002-cv-generation.md)
- [ADR 003: RAG Indexing](docs/adr/003-rag-indexing.md)

## Notes

- Keep secrets in `.env.local` only — use `.env.example` as the template
- Generated PDFs live in `cvs/` (ignored by git except `.gitkeep`)
- CV generation uses Gemini; OpenRouter is reserved for optional chat / RAG
