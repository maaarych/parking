import "server-only";
import { execFile } from "node:child_process";
import path from "node:path";
import { LOCATIONS } from "../locations";
import { readAnalysis, summarize } from "../server-data";
import type { CameraAnalysis } from "../types";

const ROOT = process.cwd();
const MAX_RECHECK_AGE_MS = 10 * 60_000;

export type RunState = {
  /** Fresh YOLO re-checks done in this run, by location id. */
  rechecks: Map<number, { camera: CameraAnalysis; checkedAt: number }>;
  /** Routes fetched in this run, by location id. */
  routes: Map<number, { distanceM: number; etaMin: number; estimated: boolean }>;
  origin: { lat: number; lng: number } | null;
};

export const newRunState = (): RunState => ({ rechecks: new Map(), routes: new Map(), origin: null });

const rad = (d: number) => (d * Math.PI) / 180;
function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

async function geocode({ query }: { query: string }) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=3&accept-language=uk" +
    "&viewbox=23.90,49.90,24.15,49.77&bounded=1&q=" +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { "User-Agent": "lviv-parking-agent-demo/0.1" } });
  if (!res.ok) return { error: `geocoder HTTP ${res.status}` };
  const items = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  if (!items.length) return { error: "nothing found in Lviv for this query; try a street name or a landmark" };
  return { results: items.map((i) => ({ name: i.display_name, lat: +i.lat, lng: +i.lon })) };
}

async function listParkingLots(state: RunState, args: { origin_lat?: number; origin_lng?: number }) {
  const analysis = await readAnalysis();
  const summaries = new Map(summarize(analysis?.cameras ?? []).map((s) => [s.id, s]));
  const hasOrigin = typeof args.origin_lat === "number" && typeof args.origin_lng === "number";
  if (hasOrigin) state.origin = { lat: args.origin_lat!, lng: args.origin_lng! };
  const lots = LOCATIONS.map((l) => {
    const s = summaries.get(l.id);
    return {
      location_id: l.id,
      name: l.name,
      lat: l.lat,
      lng: l.lng,
      free_spots: s?.free ?? null,
      total_spots: s?.total ?? 0,
      data_from: s?.updatedAt ?? null,
      straight_line_m: hasOrigin ? Math.round(haversineM({ lat: args.origin_lat!, lng: args.origin_lng! }, l)) : undefined,
    };
  }).sort((a, b) => (a.straight_line_m ?? 0) - (b.straight_line_m ?? 0));
  return {
    note: "free_spots comes from the last stored analysis and may be stale: confirm with recheck_lot before recommending.",
    lots,
  };
}

async function getRoute(state: RunState, args: { location_id: number; from_lat: number; from_lng: number }) {
  const loc = LOCATIONS.find((l) => l.id === args.location_id);
  if (!loc) return { error: `unknown location_id ${args.location_id}` };
  state.origin = { lat: args.from_lat, lng: args.from_lng };
  let route: { distanceM: number; etaMin: number; estimated: boolean };
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${args.from_lng},${args.from_lat};${loc.lng},${loc.lat}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { code: string; routes?: { distance: number; duration: number }[] };
    if (j.code !== "Ok" || !j.routes?.[0]) throw new Error(j.code);
    route = { distanceM: Math.round(j.routes[0].distance), etaMin: Math.max(1, Math.round(j.routes[0].duration / 60)), estimated: false };
  } catch {
    // Routing service unreachable: fall back to a rough estimate and say so.
    const d = haversineM({ lat: args.from_lat, lng: args.from_lng }, loc) * 1.4;
    route = { distanceM: Math.round(d), etaMin: Math.max(1, Math.round(d / 1000 / 20 * 60)), estimated: true };
  }
  state.routes.set(loc.id, route);
  return { location_id: loc.id, name: loc.name, distance_m: route.distanceM, eta_min: route.etaMin, estimated: route.estimated };
}

function runAnalyzer(cameraIds: string[]): Promise<CameraAnalysis[]> {
  const python = path.join(ROOT, "analyzer", ".venv", "bin", "python");
  const script = path.join(ROOT, "analyzer", "analyze.py");
  const args = [script, "--only", cameraIds.join(","), "--redetect", "--no-write", "--json"];
  return new Promise((resolve, reject) => {
    execFile(python, args, { cwd: ROOT, timeout: 120_000, maxBuffer: 20_000_000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || String(err)));
      const line = stdout.split("\n").find((l) => l.startsWith("RESULT_JSON "));
      if (!line) return reject(new Error("analyzer returned no result"));
      resolve(JSON.parse(line.slice("RESULT_JSON ".length)) as CameraAnalysis[]);
    });
  });
}

async function recheckLot(state: RunState, args: { location_id: number }) {
  const loc = LOCATIONS.find((l) => l.id === args.location_id);
  if (!loc) return { error: `unknown location_id ${args.location_id}` };
  const analysis = await readAnalysis();
  const cameraIds = (analysis?.cameras ?? []).filter((c) => c.locationId === loc.id).map((c) => c.cameraId);
  if (!cameraIds.length) return { error: "this location has no camera frame" };
  const cameras = await runAnalyzer(cameraIds);
  const camera = cameras[0];
  state.rechecks.set(loc.id, { camera, checkedAt: Date.now() });
  const free = camera.spots.filter((s) => !s.occupied);
  return {
    location_id: loc.id,
    name: loc.name,
    fresh_detection: true,
    vehicles_detected: camera.vehicles.length,
    free_spots: free.length,
    total_spots: camera.spots.length,
    free_spot_ids: free.map((s) => s.id),
  };
}

export type Recommendation = {
  location_id: number;
  name: string;
  free_spots: number;
  total_spots: number;
  spot_id: string;
  distance_m: number;
  eta_min: number;
  estimated_route: boolean;
  waze_url: string;
  reason: string;
  camera: CameraAnalysis;
};

export type GateCheck = { label: string; ok: boolean; detail?: string };

/**
 * The verification gate: the agent's claim is accepted only if the code can confirm it from this run's own evidence.
 * Nothing here trusts numbers typed by the model.
 */
function submitRecommendation(
  state: RunState,
  args: { location_id: number; reason: string; max_eta_min?: number },
): { result: object; checks: GateCheck[]; recommendation?: Recommendation } {
  const loc = LOCATIONS.find((l) => l.id === args.location_id);
  const checks: GateCheck[] = [];
  if (!loc) {
    checks.push({ label: "Локація існує", ok: false, detail: `unknown location_id ${args.location_id}` });
    return { result: { accepted: false, problems: checks.map((c) => c.detail) }, checks };
  }
  const re = state.rechecks.get(loc.id);
  const route = state.routes.get(loc.id);

  checks.push({ label: "Свіжа перевірка кадру (YOLO) виконана", ok: !!re, detail: re ? undefined : "call recheck_lot for this location first" });
  const fresh = !!re && Date.now() - re.checkedAt <= MAX_RECHECK_AGE_MS;
  if (re) checks.push({ label: "Перевірка не старіша за 10 хв", ok: fresh });
  const freeSpots = re?.camera.spots.filter((s) => !s.occupied) ?? [];
  checks.push({
    label: "Після перевірки є вільне місце",
    ok: freeSpots.length > 0,
    detail: re ? `${freeSpots.length} з ${re.camera.spots.length}` : undefined,
  });
  checks.push({ label: "Маршрут розраховано", ok: !!route, detail: route ? undefined : "call get_route for this location first" });
  const etaOk = !!route && (args.max_eta_min == null || route.etaMin <= args.max_eta_min);
  if (route) {
    checks.push({
      label: args.max_eta_min != null ? `Дорога ≤ ${args.max_eta_min} хв` : "Обмеження за часом не задано",
      ok: etaOk,
      detail: `${route.etaMin} хв, ${(route.distanceM / 1000).toFixed(1)} км${route.estimated ? " (оцінка)" : ""}`,
    });
  }

  const problems = checks.filter((c) => !c.ok);
  if (problems.length || !re || !route) {
    return {
      result: { accepted: false, problems: problems.map((c) => `${c.label}${c.detail ? ` (${c.detail})` : ""}`) },
      checks,
    };
  }

  // Best spot = the free spot with the least vehicle overlap.
  const best = [...freeSpots].sort((a, b) => a.coverage - b.coverage)[0];
  const waze = `https://waze.com/ul?ll=${loc.lat},${loc.lng}&navigate=yes`;
  checks.push({ label: "Посилання Waze побудоване з координат локації", ok: true, detail: `${loc.lat}, ${loc.lng}` });
  const recommendation: Recommendation = {
    location_id: loc.id,
    name: loc.name,
    free_spots: freeSpots.length,
    total_spots: re.camera.spots.length,
    spot_id: best.id,
    distance_m: route.distanceM,
    eta_min: route.etaMin,
    estimated_route: route.estimated,
    waze_url: waze,
    reason: args.reason,
    camera: re.camera,
  };
  return { result: { accepted: true }, checks, recommendation };
}

function reportNoParking(state: RunState, args: { reason: string }) {
  const monitored = LOCATIONS;
  const checks: GateCheck[] = monitored.map((l) => {
    const re = state.rechecks.get(l.id);
    const free = re?.camera.spots.filter((s) => !s.occupied).length;
    return {
      label: `${l.name}: перевірено свіжим кадром`,
      ok: !!re && free === 0,
      detail: re ? `вільних: ${free}` : "не перевірено",
    };
  });
  const bad = checks.filter((c) => !c.ok);
  return {
    accepted: bad.length === 0,
    checks,
    result: bad.length
      ? { accepted: false, problems: bad.map((c) => `${c.label} (${c.detail})`) }
      : { accepted: true, reason: args.reason },
  };
}

export const TOOL_DEFS = [
  {
    name: "geocode",
    description: "Find coordinates of a place in Lviv (street, address, landmark). Returns up to 3 candidates.",
    input_schema: { type: "object" as const, properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "list_parking_lots",
    description:
      "List the monitored parking lots with the free/total spots from the LAST STORED analysis (may be stale). " +
      "Pass the user's coordinates to get straight-line distances, sorted nearest first.",
    input_schema: {
      type: "object" as const,
      properties: { origin_lat: { type: "number" }, origin_lng: { type: "number" } },
    },
  },
  {
    name: "get_route",
    description: "Driving distance and ETA (minutes) from the user's position to a parking lot.",
    input_schema: {
      type: "object" as const,
      properties: { location_id: { type: "integer" }, from_lat: { type: "number" }, from_lng: { type: "number" } },
      required: ["location_id", "from_lat", "from_lng"],
    },
  },
  {
    name: "recheck_lot",
    description:
      "Re-run the vision model (YOLO) on the lot's camera frame right now and return fresh free spots. Takes ~5 s. " +
      "Required before recommending a lot.",
    input_schema: { type: "object" as const, properties: { location_id: { type: "integer" } }, required: ["location_id"] },
  },
  {
    name: "submit_recommendation",
    description:
      "Submit the final choice. The system verifies it against this run's own evidence (fresh recheck, route, time limit) and " +
      "either accepts it or returns the problems to fix. Set max_eta_min when the user gave a time limit.",
    input_schema: {
      type: "object" as const,
      properties: {
        location_id: { type: "integer" },
        reason: { type: "string", description: "1-2 sentences for the user, in the user's language" },
        max_eta_min: { type: "number" },
      },
      required: ["location_id", "reason"],
    },
  },
  {
    name: "report_no_parking",
    description:
      "Use ONLY when every monitored lot has been rechecked with recheck_lot and none has a free spot (or none fits the user's limits). " +
      "The system verifies that all lots were rechecked.",
    input_schema: { type: "object" as const, properties: { reason: { type: "string" } }, required: ["reason"] },
  },
];

export type ToolOutcome = {
  result: unknown;
  checks?: GateCheck[];
  recommendation?: Recommendation;
  noParking?: boolean;
};

export async function callTool(state: RunState, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "geocode":
        return { result: await geocode(input as { query: string }) };
      case "list_parking_lots":
        return { result: await listParkingLots(state, input as { origin_lat?: number; origin_lng?: number }) };
      case "get_route":
        return { result: await getRoute(state, input as { location_id: number; from_lat: number; from_lng: number }) };
      case "recheck_lot":
        return { result: await recheckLot(state, input as { location_id: number }) };
      case "submit_recommendation": {
        const r = submitRecommendation(state, input as { location_id: number; reason: string; max_eta_min?: number });
        return { result: r.result, checks: r.checks, recommendation: r.recommendation };
      }
      case "report_no_parking": {
        const r = reportNoParking(state, input as { reason: string });
        return { result: r.result, checks: r.checks, noParking: r.accepted };
      }
      default:
        return { result: { error: `unknown tool ${name}` } };
    }
  } catch (e) {
    return { result: { error: e instanceof Error ? e.message : String(e) } };
  }
}
