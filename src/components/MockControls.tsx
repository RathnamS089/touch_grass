import { RotateCcw } from "lucide-react";
import type { DemoAction } from "@/services/app-state";

interface MockControlsProps {
  onChange: (action: DemoAction) => void;
}

export function MockControls({ onChange }: MockControlsProps) {
  const choices: { action: DemoAction; label: string }[] = [
    { action: "resting", label: "Resting" },
    { action: "active", label: "Active" },
    { action: "long-session", label: "Long session" },
    { action: "intervention", label: "Intervention" },
    { action: "recommendation", label: "Recommendation" },
  ];
  return (
    <aside className="mock-controls" aria-label="Development mock controls">
      <span><RotateCcw size={13} /> Mock states</span>
      <div>{choices.map(({ action, label }) => <button type="button" onClick={() => onChange(action)} key={action}>{label}</button>)}</div>
    </aside>
  );
}
