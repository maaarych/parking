"use client";

import { useState } from "react";
import type { CameraAnalysis } from "@/lib/types";
import { BASE_PATH } from "@/lib/paths";
import { BUSY_COLOR, FREE_COLOR } from "@/lib/status";

const toPoints = (poly: [number, number][]) => poly.map(([x, y]) => `${x},${y}`).join(" ");

export default function CameraView({ camera }: { camera: CameraAnalysis }) {
  const [showVehicles, setShowVehicles] = useState(false);
  const freeSpots = camera.spots.filter((s) => !s.occupied);
  const occupiedSpots = camera.spots.filter((s) => s.occupied);
  const free = freeSpots.length;

  return (
    <div>
      <div className="cam-frame" style={{ aspectRatio: `${camera.width} / ${camera.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE_PATH}${camera.frame}`} alt={`Камера ${camera.cameraId}`} />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none">
          {/* Occupied spots: muted red. Free spots are drawn last, brighter, with a white halo so they stand out. */}
          {occupiedSpots.map((s) => (
            <polygon
              key={s.id}
              points={toPoints(s.polygon)}
              fill={BUSY_COLOR}
              fillOpacity={0.22}
              stroke={BUSY_COLOR}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {freeSpots.map((s) => (
            <g key={s.id}>
              <polygon
                points={toPoints(s.polygon)}
                fill="none"
                stroke="#fff"
                strokeWidth={6}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                points={toPoints(s.polygon)}
                fill={FREE_COLOR}
                fillOpacity={0.55}
                stroke={FREE_COLOR}
                strokeWidth={3}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {showVehicles &&
            camera.vehicles.map((v, i) => (
              <rect
                key={i}
                x={v.box[0]}
                y={v.box[1]}
                width={v.box[2] - v.box[0]}
                height={v.box[3] - v.box[1]}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </svg>
      </div>
      <div className="cam-meta">
        {camera.spots.length ? (
          <span className="cam-legend">
            <i className="swatch" style={{ background: FREE_COLOR }} /> Вільно <b>{free}</b>
            <i className="swatch" style={{ background: BUSY_COLOR, opacity: 0.6 }} /> Зайнято <b>{occupiedSpots.length}</b>
          </span>
        ) : (
          <span>Місця на цій камері ще не розмічені</span>
        )}
        <label className="check">
          <input type="checkbox" checked={showVehicles} onChange={(e) => setShowVehicles(e.target.checked)} />
          Показати виявлені авто ({camera.vehicles.length})
        </label>
      </div>
    </div>
  );
}
