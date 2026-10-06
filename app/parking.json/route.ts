import { NextResponse } from "next/server";
import { readAnalysis, summarize } from "@/lib/server-data";

// Rendered once at build time -> out/parking.json for the static (GitHub Pages) deployment.
export const dynamic = "force-static";

export async function GET() {
  const analysis = await readAnalysis();
  const cameras = analysis?.cameras ?? [];
  return NextResponse.json({
    generatedAt: analysis?.generatedAt ?? null,
    model: analysis?.model ?? null,
    locations: summarize(cameras),
    cameras,
  });
}
