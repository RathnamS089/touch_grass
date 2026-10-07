import { defaultSettings, mockIntervention } from "@/mock/grounded-data";
import type { ExperienceState, GroundedAppState, Screen } from "@/types/grounded";

export type DemoAction = ExperienceState | "recommendation";

export function createInitialState(): GroundedAppState {
  return {
    screen: "main",
    experience: "resting",
    activity: { status: "idle", sessionSeconds: 0 },
    settings: defaultSettings,
  };
}

export function transitionExperience(state: GroundedAppState, action: DemoAction): GroundedAppState {
  if (action === "recommendation") {
    return { ...state, screen: "recommendation", experience: "intervention", intervention: mockIntervention };
  }

  if (action === "resting") {
    return {
      ...state,
      screen: "main",
      experience: "resting",
      activity: { status: "idle", sessionSeconds: 0 },
      intervention: undefined,
    };
  }

  if (action === "active") {
    return {
      ...state,
      screen: "main",
      experience: "active",
      activity: { status: "active", sessionSeconds: Math.max(state.activity.sessionSeconds, 84 * 60) },
      intervention: undefined,
    };
  }

  if (action === "long-session") {
    return {
      ...state,
      screen: "main",
      experience: "long-session",
      activity: { status: "active", sessionSeconds: 84 * 60 },
      intervention: undefined,
    };
  }

  return {
    ...state,
    screen: "main",
    experience: "intervention",
    activity: { status: "active", sessionSeconds: 99 * 60 },
    intervention: mockIntervention,
  };
}

export function navigate(state: GroundedAppState, screen: Screen): GroundedAppState {
  return { ...state, screen };
}
