export type Status = "free" | "full" | "unknown";

export const STATUS_COLOR: Record<Status, string> = {
  free: "#16a34a",
  full: "#dc2626",
  unknown: "#9ca3af",
};

export const STATUS_LABEL: Record<Status, string> = {
  free: "Є вільні місця",
  full: "Місць немає",
  unknown: "Немає розмітки місць",
};

export function getStatus(free: number | null, total: number): Status {
  if (free === null || total === 0) return "unknown";
  if (free <= 0) return "full";
  return "free";
}

export const FREE_COLOR = "#22c55e";
export const BUSY_COLOR = "#ef4444";
