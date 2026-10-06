"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { LOCATIONS } from "@/lib/locations";
import { DATA_URL } from "@/lib/paths";
import type { CameraAnalysis, LocationSummary } from "@/lib/types";
import { getStatus, STATUS_COLOR, STATUS_LABEL, type Status } from "@/lib/status";
import CameraView from "./CameraView";

const ParkingMap = dynamic(() => import("./ParkingMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Завантаження карти…</div>,
});

type ApiData = {
  generatedAt: string | null;
  model: string | null;
  locations: LocationSummary[];
  cameras: CameraAnalysis[];
};

const REFRESH_MS = 30_000;

export default function ParkingApp() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cameraIdx, setCameraIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json: ApiData = await res.json();
        if (!cancelled) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const summaries = useMemo(() => new Map((data?.locations ?? []).map((l) => [l.id, l])), [data]);
  const monitored = (data?.locations ?? []).filter((l) => l.free !== null);
  const totalFree = monitored.reduce((s, l) => s + (l.free ?? 0), 0);
  const totalSpots = monitored.reduce((s, l) => s + l.total, 0);
  const updated = data?.generatedAt ? new Date(data.generatedAt).toLocaleString("uk-UA") : null;

  const selected = LOCATIONS.find((l) => l.id === selectedId) ?? null;
  const selectedSummary = selectedId ? summaries.get(selectedId) : undefined;
  const selectedCameras = (data?.cameras ?? []).filter((c) => c.locationId === selectedId);
  const camera = selectedCameras[Math.min(cameraIdx, selectedCameras.length - 1)];
  const selectedStatus = getStatus(selectedSummary?.free ?? null, selectedSummary?.total ?? 0);

  function select(id: number) {
    setSelectedId(id);
    setCameraIdx(0);
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Вільні паркувальні місця у Львові</h1>
          <p className="sub">
            {data ? (
              monitored.length ? (
                <>
                  Вільно <b>{totalFree}</b> з {totalSpots} розмічених місць у {monitored.length} локаціях
                  {updated && <> · аналіз кадрів: {updated}</>}
                </>
              ) : (
                "Ще немає розмічених місць: відкрийте /annotate та запустіть аналіз"
              )
            ) : error ? (
              "Не вдалося завантажити дані"
            ) : (
              "Завантаження…"
            )}
          </p>
        </div>
        <ul className="legend">
          {(Object.keys(STATUS_COLOR) as Status[]).map((s) => (
            <li key={s}>
              <span className="dot" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </li>
          ))}
        </ul>
      </header>
      <main className="main">
        <ParkingMap locations={LOCATIONS} summaries={summaries} selectedId={selectedId} onSelect={select} />
        <div className="demo-badge">Демо: тестові кадри з PDF, не live</div>

        {selected && (
          <aside className="panel">
            <button className="panel-close" onClick={() => setSelectedId(null)} aria-label="Закрити">
              ×
            </button>
            <h2>{selected.name}</h2>
            <p className="panel-status" style={{ color: STATUS_COLOR[selectedStatus] }}>
              {STATUS_LABEL[selectedStatus]}
              {selectedSummary?.free != null && (
                <span className="muted">
                  {" "}
                  · вільно {selectedSummary.free} з {selectedSummary.total}
                </span>
              )}
            </p>
            {selectedCameras.length > 1 && (
              <div className="tabs">
                {selectedCameras.map((c, i) => (
                  <button key={c.cameraId} className={i === cameraIdx ? "active" : ""} onClick={() => setCameraIdx(i)}>
                    Камера {i + 1}
                  </button>
                ))}
              </div>
            )}
            {camera ? (
              <CameraView key={camera.cameraId} camera={camera} />
            ) : (
              <p className="muted">Для цієї локації немає кадру з камери (у PDF є лише карта).</p>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}
