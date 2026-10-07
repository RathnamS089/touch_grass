export type ActivityStatus = "active" | "idle";
export type ExperienceState = "resting" | "active" | "long-session" | "threshold-exceeded" | "intervention" | "recommendation";
export type Screen = "main" | "recommendation" | "dashboard" | "settings" | "privacy" | "analytics";

export interface ActivityState {
  status: ActivityStatus;
  sessionSeconds: number;
}

export interface OutdoorPlace {
  id: string;
  name: string;
  category: string;
  distance: string;
  description: string;
  imageUrl?: string;
}

export interface GroundedMessageProps {
  label: string;
  message: string;
  secondary?: string;
  state?: ExperienceState;
  children?: React.ReactNode;
}

export interface Intervention {
  message: string;
  breakMinutes: number;
  place?: OutdoorPlace;
}

export interface DailyMetric {
  label: string;
  value: string;
  description: string;
}

export interface UsagePoint {
  time: string;
  value: number;
}

export interface GroundedSettings {
  sessionThresholdMinutes: number;
  breakDurationMinutes: number;
  reminderFrequencyMinutes: number;
  natureImagery: boolean;
  nearbyRecommendations: boolean;
}

export interface GroundedAppState {
  screen: Screen;
  experience: ExperienceState;
  activity: ActivityState;
  intervention?: Intervention;
  settings: GroundedSettings;
}