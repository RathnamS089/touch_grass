import React, { useEffect, useState } from "react";
import { Activity, ArrowLeft, Coffee, Timer } from "lucide-react";
import { getScreenTimeDetail } from "@/services/backend";
import type { DailyMetric } from "@/types/grounded";

interface DashboardProps {
  onBack: () => void;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `${totalSeconds}s`;
}

/** Label for a local hour, e.g. 9 → "09:00" */
function hourLabel(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

interface Detail {
  total_seconds: number;
  current_session_seconds: number;
  is_active: boolean;
  sessions: number;
  nudges: number;
  hourly: [number, number][];
}

export function Dashboard({ onBack }: DashboardProps) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    // Fetch immediately, then poll every 5s — the engine updates every second,
    // so "Current session" and "Status" stay live
    let mounted = true;
    const fetch = () => {
      getScreenTimeDetail().then((result) => {
        if (!mounted) return;
        if (result.ok) { setDetail(result.data); setLoadState("ready"); }
        else setLoadState("error");
      });
    };
    fetch();
    const id = window.setInterval(fetch, 5_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const totalSeconds = detail?.total_seconds ?? 0;

  const metrics: DailyMetric[] = [
    {
      label: "Total screen time",
      value: detail ? formatDuration(totalSeconds) : "—",
      description: "Today’s activity recorded by Grounded",
    },
    {
      label: "Current session",
      value:
        detail && detail.is_active && detail.current_session_seconds > 0
          ? formatDuration(detail.current_session_seconds)
          : "—",
      description: !detail ? "Waiting for activity data" : detail.is_active ? "Since you sat down" : "Not at the screen",
    },
    {
      label: "Status",
      value: !detail ? "—" : detail.is_active ? "Active" : "Idle",
      description: "Right now",
    },
    {
      label: "Breaks encouraged",
      value: detail ? String(detail.nudges) : "—",
      description: "A little reset goes a long way",
    },
  ];

  const icons = [Timer, Activity, Activity, Coffee];

  // Real hourly activity recorded by the engine (local hours)
  const usagePoints = (detail?.hourly ?? []).map(([hour, secs]) => ({
    time: hourLabel(hour),
    // A full bar represents 60 active minutes.
    value: Math.min(100, Math.max(0, secs / 36)),
    duration: formatDuration(secs),
  }));

  return (
    <section className="content-page page-enter" aria-labelledby="dashboard-title">
      <button className="text-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Grounded
      </button>
      <header className="page-header">
        <p className="eyebrow">A softer overview</p>
        <h1 id="dashboard-title">Today, at a glance.</h1>
        <p>
          Enough context to notice the day. Not enough to turn it into a
          scoreboard.
        </p>
      </header>
      <p className="dashboard-status" role="status">{loadState === "loading" ? "Loading today’s activity…" : loadState === "error" ? (detail ? "Connection interrupted. Showing the last update; reconnecting…" : "Activity is unavailable. Open Grounded on your Mac to see your day.") : "Today’s totals are saved on this Mac."}</p>
      <div className="metrics-grid">
        {metrics.map((metric, index) => {
          const Icon = icons[index];
          return (
            <article className="metric-card" key={metric.label}>
              <span>
                <Icon size={17} />
              </span>
              <strong>{metric.value}</strong>
              <p>{metric.label}</p>
              <small>{metric.description}</small>
            </article>
          );
        })}
      </div>
      <section className="usage-card" aria-labelledby="usage-title">
        <div>
          <p className="eyebrow">Rhythm, not performance</p>
          <h2 id="usage-title">Your day in small blocks</h2>
        </div>
        <div className="usage-chart">
          {usagePoints.length > 0 ? (
            usagePoints.map((point) => (
              <div className="usage-chart__row" key={point.time}>
                <span>{point.time}</span>
                <i style={{ "--usage": point.value } as React.CSSProperties} />
                <b>{point.duration}</b>
              </div>
            ))
          ) : (
            <p className="usage-chart__empty">{loadState === "loading" ? "Loading activity…" : loadState === "error" && !detail ? "Waiting for activity data." : "No screen activity recorded today yet."}</p>
          )}
        </div>
      </section>
    </section>
  );
}
