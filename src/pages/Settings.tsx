import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, EyeOff, MapPinned } from "lucide-react";
import type { GroundedSettings } from "@/types/grounded";
import { saveSettings } from "@/services/settings";

interface SettingsProps {
  settings: GroundedSettings;
  onChange: (settings: GroundedSettings) => void;
  onBack: () => void;
}

const MIN_THRESHOLD_MINUTES = 5;
const MAX_THRESHOLD_MINUTES = 240;
const MIN_BREAK_MINUTES = 5;
const MAX_BREAK_MINUTES = 60;
const MIN_REMINDER_MINUTES = 15;
const MAX_REMINDER_MINUTES = 240;

function Stepper({
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper">
      <button
        aria-label="Decrease"
        type="button"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 5))}
      >
        −
      </button>
      <strong>
        {value} <small>{suffix}</small>
      </strong>
      <button
        aria-label="Increase"
        type="button"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 5))}
      >
        +
      </button>
    </div>
  );
}

export function Settings({ settings, onChange, onBack }: SettingsProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const update = async <K extends keyof GroundedSettings>(
    key: K,
    value: GroundedSettings[K],
  ) => {
    const next = { ...settings, [key]: value };
    setSaving(true);
    setSaveError(null);
    try { await saveSettings(next); onChange(next); }
    catch { setSaveError("Changes could not be saved. Please try again."); }
    finally { setSaving(false); }
  };

  return (
    <section className="content-page page-enter" aria-labelledby="settings-title">
      <button className="text-button" type="button" onClick={onBack}>
        <ArrowLeft size={17} /> Grounded
      </button>
      <header className="page-header">
        <p className="eyebrow">Your pace</p>
        <h1 id="settings-title">Find your pace.</h1>
        <p>
          Three numbers decide when Grounded nudges you. Changes apply
          immediately — no restart needed.
        </p>
      </header>
      <p role="status" className="dashboard-status">{saveError ?? (saving ? "Saving…" : "Settings apply when saved.")}</p>
      <fieldset className="settings-list" disabled={saving}>
        <legend className="sr-only">Break preferences</legend>
        <section className="setting-row">
          <div>
            <h2>Time before a break is suggested</h2>
            <p>
              How long you can keep working before Grounded suggests a break.
              It only counts time you're actually using the Mac — step away
              for a minute and the continuous session resets. Example: at 30 min, a
              suggestion appears after 30 minutes of continuous use.
            </p>
          </div>
          <Stepper
            value={settings.sessionThresholdMinutes}
            suffix="min"
            min={MIN_THRESHOLD_MINUTES}
            max={MAX_THRESHOLD_MINUTES}
            onChange={(value) => update("sessionThresholdMinutes", value)}
          />
        </section>
        <section className="setting-row">
          <div>
            <h2>How long your break should be</h2>
            <p>
              When a break is suggested, this is how long Grounded recommends
              stepping away. A suggestion, never a demand.
            </p>
          </div>
          <Stepper
            value={settings.breakDurationMinutes}
            suffix="min"
            min={MIN_BREAK_MINUTES}
            max={MAX_BREAK_MINUTES}
            onChange={(value) => update("breakDurationMinutes", value)}
          />
        </section>
        <section className="setting-row">
          <div>
            <h2>How often to remind you again</h2>
            <p>
              If you keep working after the first suggestion, Grounded waits
              this long before gently reminding you again. Example: at 15 min,
              a reminder every 15 minutes until you take a break.
            </p>
          </div>
          <Stepper
            value={settings.reminderFrequencyMinutes}
            suffix="min"
            min={MIN_REMINDER_MINUTES}
            max={MAX_REMINDER_MINUTES}
            onChange={(value) => update("reminderFrequencyMinutes", value)}
          />
        </section>
        <section className="setting-row">
          <div>
            <h2>
              <EyeOff size={17} /> Nature imagery
            </h2>
            <p>Show ambient nature particles on the home screen.</p>
          </div>
          <label className="switch">
            <input
              aria-label="Nature imagery"
              checked={settings.natureImagery}
              type="checkbox"
              onChange={(event) => update("natureImagery", event.target.checked)}
            />
            <span />
          </label>
        </section>
        <section className="setting-row">
          <div>
            <h2>
              <MapPinned size={17} /> Nearby recommendations
            </h2>
            <p>Include real outdoor places when a break is suggested.</p>
          </div>
          <label className="switch">
            <input
              aria-label="Nearby recommendations"
              checked={settings.nearbyRecommendations}
              type="checkbox"
              onChange={(event) =>
                update("nearbyRecommendations", event.target.checked)
              }
            />
            <span />
          </label>
        </section>
      </fieldset>
      <section className="setting-row">
        <div><h2>Try a break reminder</h2><p>Show a real recommendation now and save it to your reminder history.</p></div>
        <button className="button button--quiet" disabled={testing} onClick={async () => {
          setTesting(true); setSaveError(null);
          try { await invoke("test_break"); }
          catch { setSaveError("Could not show a test reminder. Open the desktop app and try again."); }
          finally { setTesting(false); }
        }}>{testing ? "Finding a break…" : "Try a reminder"}</button>
      </section>
    </section>
  );
}
