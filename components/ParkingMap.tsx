"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import type { ParkingLocation } from "@/lib/locations";
import type { LocationSummary } from "@/lib/types";
import { getStatus, STATUS_COLOR } from "@/lib/status";

const CENTER: [number, number] = [49.8405, 24.0285];

// Cached so a data refresh doesn't swap the icon of unchanged markers.
const iconCache = new Map<string, L.DivIcon>();

function makeIcon(label: string, color: string, selected: boolean) {
  const key = `${label}|${color}|${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "pin-wrapper",
      html: `<div class="pin${selected ? " pin-selected" : ""}" style="background:${color}">${label}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

type Props = {
  locations: ParkingLocation[];
  summaries: Map<number, LocationSummary>;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export default function ParkingMap({ locations, summaries, selectedId, onSelect }: Props) {
  return (
    <MapContainer center={CENTER} zoom={14} scrollWheelZoom className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((loc) => {
        const s = summaries.get(loc.id);
        const status = getStatus(s?.free ?? null, s?.total ?? 0);
        const label = s?.free == null ? "?" : String(s.free);
        return (
          <Marker
            key={loc.id}
            position={[loc.lat, loc.lng]}
            icon={makeIcon(label, STATUS_COLOR[status], loc.id === selectedId)}
            eventHandlers={{ click: () => onSelect(loc.id) }}
            zIndexOffset={loc.id === selectedId ? 1000 : 0}
          />
        );
      })}
    </MapContainer>
  );
}
