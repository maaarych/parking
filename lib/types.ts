/** Point in normalized image coordinates: x, y in 0..1 (relative to frame width/height). */
export type Point = [number, number];

export type SpotDef = {
  /** Unique within a camera, e.g. "4-1-3". */
  id: string;
  polygon: Point[];
};

/** data/spots.json — hand-drawn parking spots per camera. Key = camera id ("<location>-<n>"). */
export type SpotsFile = Record<string, { spots: SpotDef[] }>;

export type Vehicle = {
  /** Normalized [x1, y1, x2, y2]. */
  box: [number, number, number, number];
  cls: "car" | "motorcycle" | "bus" | "truck";
  conf: number;
};

export type SpotState = SpotDef & {
  occupied: boolean;
  /** Share of the spot covered by a vehicle (0..1). */
  coverage: number;
};

export type CameraAnalysis = {
  cameraId: string;
  locationId: number;
  /** Public URL of the analysed frame. */
  frame: string;
  width: number;
  height: number;
  /** ISO time the analysis ran. */
  analyzedAt: string;
  vehicles: Vehicle[];
  spots: SpotState[];
};

/** data/analysis.json — output of analyzer/analyze.py. */
export type AnalysisFile = {
  generatedAt: string;
  model: string;
  cameras: CameraAnalysis[];
};

export type LocationSummary = {
  id: number;
  /** Cameras with at least one frame, e.g. ["4-1"]. */
  cameras: string[];
  /** null when no spots have been drawn for this location yet. */
  free: number | null;
  total: number;
  updatedAt: string | null;
};
