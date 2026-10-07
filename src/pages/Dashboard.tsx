import { Activity, ArrowLeft, Coffee, Timer } from "lucide-react";
import { overviewMetrics, usagePoints } from "@/mock/grounded-data";

interface DashboardProps { onBack: () => void; }

export function Dashboard({ onBack }: DashboardProps) {
  return (
    <section className="content-page page-enter" aria-labelledby="dashboard-title">
      <button className="text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> Grounded</button>
      <header className="page-header"><p className="eyebrow">A softer overview</p><h1 id="dashboard-title">Today, at a glance.</h1><p>Enough context to notice the day. Not enough to turn it into a scoreboard.</p></header>
      <div className="metrics-grid">{overviewMetrics.map((metric, index) => <article className="metric-card" key={metric.label}><span>{[Timer, Activity, Coffee, Activity][index]({ size: 17 })}</span><strong>{metric.value}</strong><p>{metric.label}</p><small>{metric.description}</small></article>)}</div>
      <section className="usage-card" aria-labelledby="usage-title"><div><p className="eyebrow">Rhythm, not performance</p><h2 id="usage-title">Your day in small blocks</h2></div><div className="usage-chart">{usagePoints.map((point) => <div className="usage-chart__row" key={point.time}><span>{point.time}</span><i style={{ "--usage": point.value } as React.CSSProperties} /><b>{point.value}</b></div>)}</div></section>
    </section>
  );
}
