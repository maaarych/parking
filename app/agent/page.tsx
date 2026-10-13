"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import CameraView from "@/components/CameraView";
import type { AgentEvent } from "@/lib/agent/agent";

// Type-only import above: the agent code itself stays on the server.

const EXAMPLES = [
  "Я буду біля площі Ринок через 15 хвилин, потрібне місце для авто. Дорога не довше 20 хвилин.",
  "Їду на вул. Шолом-Алейхема, треба припаркуватись якомога ближче.",
  "I'm at Lviv Opera House, need a parking spot within 10 minutes of driving.",
];

const TOOL_LABEL: Record<string, string> = {
  geocode: "Геокодування (OpenStreetMap)",
  list_parking_lots: "Список паркінгів і збережені дані",
  get_route: "Маршрут (OSRM)",
  recheck_lot: "Свіжа перевірка кадру (YOLO)",
  submit_recommendation: "Подати рекомендацію → перевірка",
  report_no_parking: "Повідомити «місць немає» → перевірка",
};

type Item = AgentEvent & { key: number };

function summarize(name: string, r: unknown): string {
  const o = r as Record<string, unknown>;
  if (o?.error) return `Помилка: ${String(o.error)}`;
  switch (name) {
    case "geocode": {
      const f = (o.results as { name: string; lat: number; lng: number }[] | undefined)?.[0];
      return f ? `${f.name.split(",").slice(0, 2).join(",")} (${f.lat.toFixed(4)}, ${f.lng.toFixed(4)})` : "нічого не знайдено";
    }
    case "list_parking_lots":
      return (o.lots as { name: string; free_spots: number | null; total_spots: number; straight_line_m?: number }[])
        .map((l) => `${l.name}: ${l.free_spots ?? "?"}/${l.total_spots}${l.straight_line_m != null ? `, ${l.straight_line_m} м` : ""}`)
        .join(" · ");
    case "get_route":
      return `${o.name}: ${o.eta_min} хв, ${((o.distance_m as number) / 1000).toFixed(1)} км${o.estimated ? " (оцінка)" : ""}`;
    case "recheck_lot":
      return `${o.name}: знайдено авто ${o.vehicles_detected}, вільно ${o.free_spots} з ${o.total_spots}`;
    default:
      return o.accepted ? "прийнято" : `відхилено: ${((o.problems as string[]) ?? []).join("; ")}`;
  }
}

export default function AgentPage() {
  const [request, setRequest] = useState(EXAMPLES[0]);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const counter = useRef(0);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState<number | null>(null);

  async function run() {
    setItems([]);
    setElapsed(null);
    setRunning(true);
    startedAt.current = Date.now();
    const push = (ev: AgentEvent) => setItems((prev) => [...prev, { ...ev, key: counter.current++ }]);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} (агент працює лише в dev-режимі)`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) if (p.startsWith("data: ")) push(JSON.parse(p.slice(6)) as AgentEvent);
      }
    } catch (e) {
      push({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
    setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
    setRunning(false);
  }

  const final = items.find((i) => i.type === "final") as (Item & { type: "final" }) | undefined;

  return (
    <div className="agent">
      <div className="agent-col">
        <Link href="/">← На карту</Link>
        <h1>Агент: знайди мені паркування</h1>
        <p className="muted">
          Опишіть, де ви і що потрібно. Агент сам обирає кроки, перевіряє вільне місце свіжим проходом YOLO і віддає
          маршрут у Waze, лише якщо перевірка пройшла.
        </p>
        <textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={3} disabled={running} />
        <div className="agent-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setRequest(ex)} disabled={running}>
              {ex.length > 46 ? `${ex.slice(0, 46)}…` : ex}
            </button>
          ))}
        </div>
        <button className="agent-run" onClick={run} disabled={running || !request.trim()}>
          {running ? "Агент працює…" : "Запустити агента"}
        </button>
        {elapsed != null && <p className="muted">Завершено за {elapsed} с</p>}

        <ol className="agent-log">
          {items.map((it) => {
            switch (it.type) {
              case "start":
                return (
                  <li key={it.key} className="ev ev-start">
                    Модель: {it.model}
                  </li>
                );
              case "thought":
                return (
                  <li key={it.key} className="ev ev-thought">
                    <b>Рішення</b>
                    {it.text}
                  </li>
                );
              case "tool_call":
                return (
                  <li key={it.key} className="ev ev-call">
                    <b>Інструмент: {TOOL_LABEL[it.name] ?? it.name}</b>
                    <code>{JSON.stringify(it.input)}</code>
                  </li>
                );
              case "tool_result":
                return (
                  <li key={it.key} className="ev ev-result">
                    <span>{summarize(it.name, it.result)}</span>
                    <em>{it.ms} мс</em>
                  </li>
                );
              case "gate":
                return (
                  <li key={it.key} className={`ev ev-gate ${it.accepted ? "ok" : "bad"}`}>
                    <b>Перевірка результату: {it.accepted ? "пройдена" : "відхилено, агент має виправити"}</b>
                    <ul>
                      {it.checks.map((c, i) => (
                        <li key={i}>
                          <span>{c.ok ? "✓" : "✗"}</span> {c.label}
                          {c.detail ? <em> — {c.detail}</em> : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              case "error":
                return (
                  <li key={it.key} className="ev ev-error">
                    {it.message}
                  </li>
                );
              default:
                return null;
            }
          })}
        </ol>
      </div>

      <div className="agent-col">
        {final?.recommendation && (
          <div className="agent-result">
            <h2>{final.recommendation.name}</h2>
            <p>{final.recommendation.reason}</p>
            <div className="agent-facts">
              <span>
                Вільно <b>{final.recommendation.free_spots}</b> з {final.recommendation.total_spots}
              </span>
              <span>
                Дорога <b>{final.recommendation.eta_min} хв</b> · {(final.recommendation.distance_m / 1000).toFixed(1)} км
                {final.recommendation.estimated_route ? " (оцінка)" : ""}
              </span>
              <span>
                Місце <b>{final.recommendation.spot_id}</b>
              </span>
            </div>
            <a className="agent-waze" href={final.recommendation.waze_url} target="_blank" rel="noreferrer">
              Відкрити маршрут у Waze
            </a>
            <CameraView camera={final.recommendation.camera} />
            <p className="muted">Кадр щойно перевірений агентом (свіжий прохід YOLO).</p>
          </div>
        )}
        {final?.noParking && (
          <div className="agent-result">
            <h2>Вільних місць немає</h2>
            <p>{final.noParking.reason}</p>
          </div>
        )}
        {!final && !running && !items.length && (
          <p className="muted">Результат з’явиться тут: локація, час дороги, кадр із вільним місцем і кнопка Waze.</p>
        )}
      </div>
    </div>
  );
}
