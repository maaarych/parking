import { NextResponse } from "next/server";
import { readAnalysis, summarize } from "@/lib/server-data";

export const dynamic = "force-dynamic";

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
