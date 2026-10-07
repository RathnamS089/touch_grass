import { ArrowLeft, EyeOff, MapPinned } from "lucide-react";
import type { GroundedSettings } from "@/types/grounded";

interface SettingsProps { settings: GroundedSettings; onChange: (settings: GroundedSettings) => void; onBack: () => void; }

function Stepper({ value, suffix, onChange }: { value: number; suffix: string; onChange: (value: number) => void }) {
  return <div className="stepper"><button aria-label="Decrease" type="button" onClick={() => onChange(Math.max(5, value - 15))}>−</button><strong>{value} <small>{suffix}</small></strong><button aria-label="Increase" type="button" onClick={() => onChange(value + 15)}>+</button></div>;
}

export function Settings({ settings, onChange, onBack }: SettingsProps) {
  const update = <K extends keyof GroundedSettings>(key: K, value: GroundedSettings[K]) => onChange({ ...settings, [key]: value });
  return (
    <section className="content-page page-enter" aria-labelledby="settings-title">
      <button className="text-button" type="button" onClick={onBack}><ArrowLeft size={17} /> Grounded</button>
      <header className="page-header"><p className="eyebrow">Your pace</p><h1 id="settings-title">Settings that stay out of the way.</h1><p>These controls only affect the demo frontend for now.</p></header>
      <div className="settings-list">
        <section className="setting-row"><div><h2>Long session threshold</h2><p>When a gentle nudge can appear.</p></div><Stepper value={settings.sessionThresholdMinutes} suffix="min" onChange={(value) => update("sessionThresholdMinutes", value)} /></section>
        <section className="setting-row"><div><h2>Break duration</h2><p>A suggested reset, never a demand.</p></div><Stepper value={settings.breakDurationMinutes} suffix="min" onChange={(value) => update("breakDurationMinutes", value)} /></section>
        <section className="setting-row"><div><h2>Minimum time between reminders</h2><p>Give the day plenty of breathing room.</p></div><Stepper value={settings.reminderFrequencyMinutes} suffix="min" onChange={(value) => update("reminderFrequencyMinutes", value)} /></section>
        <section className="setting-row"><div><h2><EyeOff size={17} /> Nature imagery</h2><p>Use local illustration placeholders during breaks.</p></div><label className="switch"><input checked={settings.natureImagery} type="checkbox" onChange={(event) => update("natureImagery", event.target.checked)} /><span /></label></section>
        <section className="setting-row"><div><h2><MapPinned size={17} /> Nearby recommendations</h2><p>Show mock outdoor places during this demo.</p></div><label className="switch"><input checked={settings.nearbyRecommendations} type="checkbox" onChange={(event) => update("nearbyRecommendations", event.target.checked)} /><span /></label></section>
      </div>
    </section>
  );
}
