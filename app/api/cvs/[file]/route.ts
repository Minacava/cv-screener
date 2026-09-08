import { readFile } from "node:fs/promises";
import path from "node:path";

const CVS_DIR = path.join(process.cwd(), "cvs");
const SAFE_CV_FILE = /^CV_\d+_[A-Za-z0-9_.-]+\.pdf$/i;

type RouteContext = {
  params: Promise<{ file: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { file: rawFile } = await context.params;
  const file = decodeURIComponent(rawFile);

  if (!SAFE_CV_FILE.test(file)) {
    return Response.json({ error: "Invalid file name" }, { status: 400 });
  }

  const filePath = path.join(CVS_DIR, file);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(CVS_DIR) + path.sep)) {
    return Response.json({ error: "Invalid file path" }, { status: 400 });
  }

  try {
    const data = await readFile(resolved);
    return new Response(data, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "CV not found" }, { status: 404 });
  }
}
