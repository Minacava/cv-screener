# CV Screener

App para filtrar CVs con búsqueda semántica: indexa PDFs en Pinecone (embeddings de Gemini) y permite consultar candidatos desde una UI en Next.js.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind / shadcn
- **Google Gemini** — chat y embeddings
- **Pinecone** — vector store
- **pdfkit** / **pdf-parse** — generar y leer CVs en PDF

## Requisitos

- Node.js 20+
- API key de [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
- Cuenta free de [Pinecone](https://www.pinecone.io/) con un índice serverless llamado `cv-screener` (o el nombre que pongas en `.env.local`)

## Setup

```bash
npm install
cp .env.example .env.local
```

Completa `.env.local` con tus keys (ese archivo **no** se sube a git):

```bash
GEMINI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=cv-screener
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004
```

## Pipeline de datos

```bash
# 1. Generar CVs de ejemplo (PDFs en cvs/)
npm run generate-cvs

# 2. Extraer texto, embeddear e indexar en Pinecone
npm run index-cvs
```

## Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Arquitectura (resumen)

1. `scripts/generate-cvs` crea PDFs sintéticos en `cvs/`
2. `scripts/index-cvs` parsea cada PDF, genera embeddings con Gemini y los upserta en Pinecone
3. La UI envía una query (p. ej. descripción del rol), la embeddea y recupera CVs similares; Gemini puede ayudar a resumir o rankear resultados

Stack decisions (ADR): [docs/adr/001-stack.md](docs/adr/001-stack.md).

## Notas

- Secrets solo en `.env.local` — ver `.env.example` como plantilla
- Los PDFs generados viven en `cvs/` (ignora secrets; no commits de keys)
