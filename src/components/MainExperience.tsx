import React, { useEffect, useRef } from "react";
import { Clock3, MapPin, Play, CheckCircle } from "lucide-react";
import MorphOrb, { type MorphOrbHandle, type OrbBreakPlace } from "@/components/ui/ai-thiking-orb-and-input";
import { BackgroundParticles } from "@/components/BackgroundParticles";
import { GroundedMessage } from "@/components/GroundedMessage";
import { groundedMessages } from "@/mock/grounded-data";
import type { GroundedAppState, ExperienceState } from "@/types/grounded";
import { getBackendStatus, askLLM } from "@/services/backend";

interface MainExperienceProps {
  state: GroundedAppState;
  onIntervention: () => void;
  onRecommendation: () => void;
  pendingQuery?: string | null;
  onQueryConsumed?: () => void;
  /** Shared orb handle: App triggers the break morph through it */
  orbHandleRef?: React.RefObject<MorphOrbHandle | null>;
  /** Break flow: opens the place on the map (navigation to the map screen) */
  onBreakMap?: (place: OrbBreakPlace) => void;
}

export function MainExperience({ state, onIntervention, onRecommendation, pendingQuery, onQueryConsumed, orbHandleRef, onBreakMap }: MainExperienceProps) {
  const { experience, activity, intervention } = state;
  const localOrbRef = useRef<MorphOrbHandle | null>(null);
  const orbHandle = orbHandleRef ?? localOrbRef;

  // When a pending query arrives from the CommandBar, programmatically submit it to the orb
  useEffect(() => {
    if (!pendingQuery) return;
    const frame = requestAnimationFrame(() => {
      if (orbHandle.current?.submit(pendingQuery)) onQueryConsumed?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingQuery, onQueryConsumed, orbHandle]);

  // Break flow: the orb's place card buttons call back here
  const handleBreakAction = (action: "map" | "later", place: OrbBreakPlace) => {
    if (action === "map") {
      onBreakMap?.(place);
    }
    orbHandle.current?.clearBreak();
  };

  // Get the appropriate message based on state
  const getMessageForState = (exp: ExperienceState) => {
    switch (exp) {
      case "resting":
        return groundedMessages.resting;
      case "active":
        return groundedMessages.active;
      case "threshold-exceeded":
        return groundedMessages["threshold-exceeded"];
      case "recommendation":
        if (intervention?.place) {
          return {
            label: groundedMessages.recommendation.label,
            message: intervention.place.name,
            secondary: `${intervention.place.distance} · ${intervention.place.category}`,
          };
        }
        return groundedMessages.recommendation;
      default:
        return groundedMessages.resting;
    }
  };

  const messageConfig = getMessageForState(experience);

  // Development-only backend status check
  const [backendStatus, setBackendStatus] = React.useState<{
    connected: boolean;
    checking: boolean;
  }>({ connected: false, checking: true });

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    let mounted = true;
    getBackendStatus().then((result) => {
      if (mounted) {
        setBackendStatus({ connected: result.ok, checking: false });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="experience" aria-label="Grounded companion">
      {/* Background particles */}
      {state.settings.natureImagery && <BackgroundParticles />}

      {/* MorphOrb — orbHandle drives the break flow and CommandBar queries */}
      <MorphOrb
        orbRef={orbHandle}
        onSubmit={async (q) => {
          return await askLLM(q);
        }}
        onBreakAction={handleBreakAction}
      />

      {/* Grounded Message removed to give the Orb full focus */}

      {/* Development-only backend status indicator */}
      {import.meta.env.DEV && (
        <div className="experience__backend-status" aria-live="polite">
          {backendStatus.checking ? (
            <span className="backend-checking">Checking backend…</span>
          ) : backendStatus.connected ? (
            <span className="backend-connected">
              <CheckCircle size={12} /> Backend: connected
            </span>
          ) : (
            <span className="backend-disconnected">Backend unavailable</span>
          )}
        </div>
      )}

      {/* Status indicators for specific states */}
      {experience === "active" && (
        <div className="experience__timer">
          <Clock3 size={15} />
          gentle threshold at {state.settings.sessionThresholdMinutes} min
        </div>
      )}

      {experience === "threshold-exceeded" && (
        <div className="experience__hint">
          <MapPin size={15} />
          no tracking. no judgment. just a nudge.
        </div>
      )}

      {/* Action buttons for intervention state */}
      {experience === "intervention" && (
        <div className="experience__actions">
          <div className="break-chip">
            <Play size={14} fill="currentColor" />
            {intervention?.breakMinutes ?? 15} minute reset
          </div>
          <button className="button button--primary" onClick={onRecommendation} type="button">
            Let's go
          </button>
          <button className="button button--quiet" onClick={onIntervention} type="button">
            Maybe later
          </button>
        </div>
      )}
    </section>
  );
}