import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { LOCATIONS, MVP_CAMERAS } from "./locations";
import type { AnalysisFile, CameraAnalysis, LocationSummary, SpotsFile } from "./types";

const ROOT = process.cwd();
export const SPOTS_PATH = path.join(ROOT, "data", "spots.json");
export const ANALYSIS_PATH = path.join(ROOT, "data", "analysis.json");
export const FRAMES_DIR = path.join(ROOT, "public", "frames");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export const readSpots = () => readJson<SpotsFile>(SPOTS_PATH, {});
export const readAnalysis = () => readJson<AnalysisFile | null>(ANALYSIS_PATH, null);

export async function writeSpots(spots: SpotsFile) {
  await fs.mkdir(path.dirname(SPOTS_PATH), { recursive: true });
  await fs.writeFile(SPOTS_PATH, JSON.stringify(spots, null, 2));
}

export async function listFrames(): Promise<string[]> {
  const files = await fs.readdir(FRAMES_DIR).catch(() => [] as string[]);
  return files
    .filter((f) => /^\d+-\d+\.jpg$/.test(f))
    .map((f) => f.replace(".jpg", ""))
    .filter((id) => MVP_CAMERAS.includes(id))
    .sort((a, b) => {
      const [al, an] = a.split("-").map(Number);
      const [bl, bn] = b.split("-").map(Number);
      return al - bl || an - bn;
    });
}

export function summarize(cameras: CameraAnalysis[]): LocationSummary[] {
  return LOCATIONS.map((loc) => {
    const cams = cameras.filter((c) => c.locationId === loc.id);
    const spots = cams.flatMap((c) => c.spots);
    return {
      id: loc.id,
      cameras: cams.map((c) => c.cameraId),
      total: spots.length,
      free: spots.length ? spots.filter((s) => !s.occupied).length : null,
      updatedAt: cams[0]?.analyzedAt ?? null,
    };
  });
}
