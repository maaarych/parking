import { NextResponse } from "next/server";
import { listFrames, readSpots, writeSpots } from "@/lib/server-data";
import type { SpotsFile } from "@/lib/types";

export const dynamic = "force-dynamic";

// The annotation tool writes to disk, so it only works on a local dev machine.
const devOnly = () =>
  process.env.NODE_ENV === "production"
    ? NextResponse.json({ error: "disabled in production" }, { status: 403 })
    : null;

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  return NextResponse.json({ frames: await listFrames(), spots: await readSpots() });
}

export async function PUT(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const body = (await req.json()) as SpotsFile;
  // basic validation: every polygon has >= 3 normalized points
  for (const cam of Object.values(body)) {
    for (const s of cam.spots) {
      const ok =
        s.polygon.length >= 3 &&
        s.polygon.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
      if (!ok) return NextResponse.json({ error: `bad polygon ${s.id}` }, { status: 400 });
    }
  }
  await writeSpots(body);
  return NextResponse.json({ ok: true });
}
