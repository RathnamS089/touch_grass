import { Clock3, MapPin, Play } from "lucide-react";
import MorphOrb from "@/components/ui/ai-thiking-orb-and-input";
import { BackgroundParticles } from "@/components/BackgroundParticles";
import { GroundedMessage } from "@/components/GroundedMessage";
import { groundedMessages } from "@/mock/grounded-data";
import type { GroundedAppState, ExperienceState } from "@/types/grounded";

interface MainExperienceProps {
  state: GroundedAppState;
  onIntervention: () => void;
  onRecommendation: () => void;
}

export function MainExperience({ state, onIntervention, onRecommendation }: MainExperienceProps) {
  const { experience, activity, intervention } = state;
  
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

  return (
    <section className="experience" aria-labelledby="experience-title">
      {/* Background particles */}
      <BackgroundParticles />
      
      {/* MorphOrb */}
      <div className="experience__ambient" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <MorphOrb state={experience} />
      
      {/* Grounded Message */}
      <GroundedMessage 
        label={messageConfig.label}
        message={messageConfig.message}
        secondary={messageConfig.secondary}
        state={experience}
      />
      
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