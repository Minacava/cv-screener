# CV Screener

App para filtrar CVs con búsqueda semántica: indexa PDFs en Pinecone (embeddings de Gemini) y permite consultar candidatos desde una UI en Next.js.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind / shadcn
- **Google Gemini** — CV generation, embeddings, chat (confiable y rápido)
- **Pollinations.ai** — fallback automático para imágenes (sin cuota)
- **OpenRouter** (opcional) — chat/RAG alternativo
- **Pinecone** — vector store
- **pdfkit** / **pdf-parse** — generar y leer CVs en PDF

## Requisitos

- Node.js 20+
- API key de [Google AI Studio](https://aistudio.google.com/apikey) (Gemini — **REQUERIDO** para CV generation + embeddings)
- API key de [OpenRouter](https://openrouter.ai/settings/keys) (**OPCIONAL** — solo para chat/RAG alternativo)
- Cuenta free de [Pinecone](https://www.pinecone.io/) con un índice serverless llamado `cv-screener`

## Setup

```bash
npm install
cp .env.example .env.local
```

Completa `.env.local` con tus keys (ese archivo **no** se sube a git):

```bash
# REQUERIDO
GEMINI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=cv-screener

# Configuración óptima (ver .env.example para detalles)
GEMINI_CV_GEN_MODEL=gemini-3.6-flash
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
GEMINI_EMBEDDING_MODEL=text-embedding-004

# OPCIONAL - OpenRouter solo para chat/RAG
OPENROUTER_API_KEY=...
OPENROUTER_CHAT_MODEL=thinkingmachines/inkling-small:free

# Imágenes: comentar para activar (requerido por la tarea técnica)
# SKIP_GEMINI_IMAGE=1
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

1. `scripts/generate-cvs` crea PDFs sintéticos en `cvs/` usando Gemini para textos y Pollinations/Gemini para fotos
2. `scripts/index-cvs` parsea cada PDF, genera embeddings con Gemini y los upserta en Pinecone
3. La UI envía una query, la embeddea y recupera CVs similares; Gemini/OpenRouter genera la respuesta final

**Architecture Decisions:**
- [ADR 001: Technology Stack](docs/adr/001-stack.md)
- [ADR 002: CV Generation Strategy](docs/adr/002-cv-generation.md)

## Notas

- Secrets solo en `.env.local` — ver `.env.example` como plantilla
- Los PDFs generados viven en `cvs/` (ignora secrets; no commits de keys)
- **OpenRouter free tier NO recomendado** para CV generation (se cuelga) — usar Gemini
