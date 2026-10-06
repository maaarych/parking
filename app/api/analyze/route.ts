import { execFile } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Dev helper: runs the Python analyzer so you can see annotation results immediately. */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  const root = process.cwd();
  const python = path.join(root, "analyzer", ".venv", "bin", "python");
  const script = path.join(root, "analyzer", "analyze.py");
  return new Promise<NextResponse>((resolve) => {
    execFile(python, [script], { cwd: root, timeout: 15 * 60_000, maxBuffer: 10_000_000 }, (err, stdout, stderr) => {
      if (err) resolve(NextResponse.json({ ok: false, log: stderr || String(err) }, { status: 500 }));
      else resolve(NextResponse.json({ ok: true, log: stdout }));
    });
  });
}
