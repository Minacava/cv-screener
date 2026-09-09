/** Stable Pinecone vector id derived from a CV PDF filename. */
export function vectorIdFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "");
  return `cv-${base}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-");
}
