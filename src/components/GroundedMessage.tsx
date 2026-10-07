import React from "react";
import type { GroundedMessageProps } from "@/types/grounded";

export function GroundedMessage({ label, message, secondary, state = "resting", children }: GroundedMessageProps) {
  // Determine status dot color based on state
  const getStatusDotColor = (state: GroundedMessageProps["state"]): string => {
    switch (state) {
      case "resting":
        return "rgba(76, 175, 80, .3)";
      case "active":
        return "rgba(102, 187, 106, .4)";
      case "threshold-exceeded":
        return "rgba(139, 195, 74, .5)";
      case "recommendation":
        return "rgba(129, 199, 132, .4)";
      default:
        return "rgba(76, 175, 80, .3)";
    }
  };

  return (
    <div className="grounded-message" data-state={state}>
      <div className="grounded-message__label">
        <div
          className="grounded-message__status-dot"
          style={{ backgroundColor: getStatusDotColor(state) }}
          aria-hidden="true"
        />
        <span>{label}</span>
      </div>
      <div className="grounded-message__message">{message}</div>
      {secondary && <div className="grounded-message__secondary">{secondary}</div>}
      {children && <div className="grounded-message__children">{children}</div>}
    </div>
  );
}