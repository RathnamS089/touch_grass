import { Leaf, Sparkles } from "lucide-react";
import type { ExperienceState } from "@/types/grounded";

interface MorphOrbProps {
  state: ExperienceState;
  label?: string;
  compact?: boolean;
}

export default function MorphOrb({ state, label, compact = false }: MorphOrbProps) {
  const stateLabel = label ?? (state === "resting" ? "Take your time." : state === "active" ? "Active" : state === "long-session" ? "A gentle nudge" : "A moment for you");

  return (
    <div className={`morph-orb morph-orb--${state} ${compact ? "morph-orb--compact" : ""}`} aria-label={`Grounded orb: ${stateLabel}`}>
      <span className="orb-aura orb-aura--one" />
      <span className="orb-aura orb-aura--two" />
      <div className="orb-core">
        {state === "resting" ? <Leaf size={compact ? 22 : 31} strokeWidth={1.4} /> : <Sparkles size={compact ? 21 : 28} strokeWidth={1.35} />}
      </div>
      <span className="orb-orbit orb-orbit--one" />
      <span className="orb-orbit orb-orbit--two" />
    </div>
  );
}
