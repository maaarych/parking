"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LOCATIONS } from "@/lib/locations";
import { BUSY_COLOR, FREE_COLOR } from "@/lib/status";
import type { CameraAnalysis, Point, SpotsFile } from "@/lib/types";

const NEW_COLOR = "#38bdf8"; // spot not analyzed yet

const toPoints = (poly: Point[]) => poly.map(([x, y]) => `${x},${y}`).join(" ");

export default function AnnotatePage() {
  const [frames, setFrames] = useState<string[]>([]);
  const [spots, setSpots] = useState<SpotsFile>({});
  const [camera, setCamera] = useState<string>("");
  const [draft, setDraft] = useState<Point[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showVehicles, setShowVehicles] = useState(false);
  // Latest analysis per camera: which spots are occupied + detected vehicles.
  const [analysis, setAnalysis] = useState<Record<string, CameraAnalysis>>({});
  // Spots added/changed since the last analysis: shown in blue until analyzed.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const loadAnalysis = useCallback(() => {
    fetch("/api/parking", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { cameras: CameraAnalysis[] }) => setAnalysis(Object.fromEntries(d.cameras.map((c) => [c.cameraId, c]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  useEffect(() => {
    fetch("/api/spots")
      .then((r) => r.json())
      .then((d) => {
        setFrames(d.frames);
        setSpots(d.spots);
        setCamera(d.frames[0] ?? "");
      })
      .catch(() => setMsg("Не вдалося завантажити (інструмент працює лише в dev-режимі)"));
  }, []);

  const current = spots[camera]?.spots ?? [];
  const occupiedById = new Map((analysis[camera]?.spots ?? []).map((s) => [s.id, s.occupied]));
  const stateOf = (id: string): "free" | "busy" | "new" =>
    fresh.has(`${camera}:${id}`) || !occupiedById.has(id) ? "new" : occupiedById.get(id) ? "busy" : "free";
  const colorOf = (id: string) => ({ free: FREE_COLOR, busy: BUSY_COLOR, new: NEW_COLOR })[stateOf(id)];
  const counts = current.reduce(
    (c, s) => ({ ...c, [stateOf(s.id)]: c[stateOf(s.id)] + 1 }),
    { free: 0, busy: 0, new: 0 },
  );

  const commit = useCallback(
    (poly: Point[]) => {
      if (poly.length < 3) return;
      setSpots((prev) => {
        const list = prev[camera]?.spots ?? [];
        const n = list.reduce((m, s) => Math.max(m, Number(s.id.split("-").pop())), 0) + 1;
        setFresh((f) => new Set(f).add(`${camera}:${camera}-${n}`));
        return { ...prev, [camera]: { spots: [...list, { id: `${camera}-${n}`, polygon: poly }] } };
      });
      setDraft([]);
      setDirty(true);
    },
    [camera],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") commit(draft);
      else if (e.key === "Escape") {
        if (draft.length) setDraft([]);
        else setAdding(false);
      }
      else if (e.key === "Backspace") setDraft((d) => d.slice(0, -1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, commit]);

  function onStageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!adding) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p: Point = [
      Math.min(1, Math.max(0, +((e.clientX - r.left) / r.width).toFixed(4))),
      Math.min(1, Math.max(0, +((e.clientY - r.top) / r.height).toFixed(4))),
    ];
    const next = [...draft, p];
    if (next.length === 4) commit(next);
    else setDraft(next);
  }

  function remove(id: string) {
    setFresh((f) => new Set(f).add(`${camera}:${id}`));
    setSpots((prev) => ({ ...prev, [camera]: { spots: (prev[camera]?.spots ?? []).filter((s) => s.id !== id) } }));
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    // drop cameras without spots so the file stays clean
    const clean = Object.fromEntries(Object.entries(spots).filter(([, v]) => v.spots.length));
    const res = await fetch("/api/spots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clean),
    });
    if (!res.ok) {
      setMsg("Помилка збереження");
      return false;
    }
    setDirty(false);
    setMsg("Збережено");
    return true;
  }

  async function saveAndAnalyze() {
    setBusy(true);
    setMsg("Зберігаю…");
    if (await save()) {
      setMsg("Аналізую кадри (кілька хвилин)…");
      const res = await fetch("/api/analyze", { method: "POST" });
      const j = await res.json();
      if (res.ok) {
        setFresh(new Set());
        loadAnalysis();
      }
      setMsg(res.ok ? "Готово — кольори оновлено" : `Помилка аналізу: ${String(j.log).slice(-300)}`);
    }
    setBusy(false);
  }

  const locId = Number(camera.split("-")[0]);
  const locName = LOCATIONS.find((l) => l.id === locId)?.name ?? "";

  return (
    <div className="annot">
      <div>
        <div className="annot-stage" onClick={onStageClick} style={{ cursor: adding ? "crosshair" : "default" }}>
          {camera && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/frames/${camera}.jpg`} alt={camera} />
          )}
          <svg viewBox="0 0 1 1" preserveAspectRatio="none">
            {current.map((s) => (
              <polygon
                key={s.id}
                points={toPoints(s.polygon)}
                fill={hover === s.id ? "#facc15" : colorOf(s.id)}
                fillOpacity={hover === s.id ? 0.5 : stateOf(s.id) === "free" ? 0.5 : 0.3}
                stroke={hover === s.id ? "#facc15" : colorOf(s.id)}
                strokeWidth={stateOf(s.id) === "free" ? 3 : 2}
                strokeDasharray={stateOf(s.id) === "new" ? "6 4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {showVehicles &&
              (analysis[camera]?.vehicles ?? []).map((v, i) => (
                <rect
                  key={i}
                  x={v.box[0]}
                  y={v.box[1]}
                  width={v.box[2] - v.box[0]}
                  height={v.box[3] - v.box[1]}
                  fill="none"
                  stroke="#facc15"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            {draft.length > 1 && (
              <polyline
                points={toPoints(draft)}
                fill="none"
                stroke="#f97316"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {draft.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={0.004} fill="#f97316" />
            ))}
          </svg>
        </div>
      </div>

      <aside className="annot-side">
        <Link href="/">← На карту</Link>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>Розмітка місць</h2>
        <select value={camera} onChange={(e) => (setCamera(e.target.value), setDraft([]))}>
          {frames.map((f) => (
            <option key={f} value={f}>
              Камера {f} {spots[f]?.spots.length ? `(${spots[f].spots.length})` : ""}
            </option>
          ))}
        </select>
        <div className="muted">{locName}</div>
        <button className={adding ? "primary" : ""} onClick={() => (setAdding((a) => !a), setDraft([]))}>
          {adding ? "✓ Режим додавання (натисніть, щоб вийти)" : "+ Додати місце"}
        </button>
        <p className="hint">
          {adding ? (
            <>
              Клікайте по 4 кути паркувального місця на землі (по периметру місця, де стоїть авто). Після 4-го кліку місце
              додається. <b>Enter</b> — завершити з 3 точок, <b>Backspace</b> — прибрати точку, <b>Esc</b> — скасувати
              (вдруге — вийти з режиму).
            </>
          ) : (
            <>Натисніть «Додати місце», щоб малювати нові місця. Колір показує результат останнього аналізу.</>
          )}
        </p>
        <ul className="annot-legend">
          <li><i style={{ background: FREE_COLOR }} /> Вільно: {counts.free}</li>
          <li><i style={{ background: BUSY_COLOR }} /> Зайнято: {counts.busy}</li>
          <li><i style={{ background: NEW_COLOR }} /> Ще не проаналізовано: {counts.new}</li>
        </ul>
        <label className="check">
          <input type="checkbox" checked={showVehicles} onChange={(e) => setShowVehicles(e.target.checked)} />
          Показати виявлені авто ({analysis[camera]?.vehicles.length ?? 0})
        </label>
        <div className="row">
          <button onClick={save} disabled={busy || !dirty}>
            Зберегти
          </button>
          <button onClick={saveAndAnalyze} disabled={busy}>
            Зберегти й проаналізувати
          </button>
        </div>
        {msg && <div>{msg}</div>}
        <strong>Місця на цій камері: {current.length}</strong>
        <ul>
          {current.map((s) => (
            <li key={s.id} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}>
              <span className="annot-id">
                <i style={{ background: colorOf(s.id) }} />
                {s.id}
              </span>
              <button onClick={() => remove(s.id)}>Видалити</button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
