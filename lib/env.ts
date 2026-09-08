import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

/** Load `.env.local` / `.env` into `process.env` (does not override existing vars). */
export async function loadEnvFilesIntoProcess(): Promise<void> {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(ROOT, name);
    try {
      const raw = await readFile(filePath, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch {
      // Missing env file is OK.
    }
  }
}
