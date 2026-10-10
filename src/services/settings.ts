import type { GroundedSettings } from "@/types/grounded";
import { invoke } from "@tauri-apps/api/core";

/**
 * Settings persistence: saved to the Rust side (app data dir) so the
 * thresholds drive the live engine and survive app restarts.
 *
 * Under plain `vite` (no Tauri IPC), a localStorage mirror keeps the Settings
 * page functional in a browser for development.
 */

const SETTINGS_KEY = "grounded_settings_v1";

/** Engine defaults mirror the Rust EngineConfig::default (engine.rs) */
export const ENGINE_DEFAULTS: GroundedSettings = {
  sessionThresholdMinutes: 45,
  breakDurationMinutes: 15,
  reminderFrequencyMinutes: 60,
  natureImagery: true,
  nearbyRecommendations: true,
};

function normalize(raw: Partial<GroundedSettings> | null | undefined): GroundedSettings {
  const clamp = (n: unknown, min: number, max: number, fallback: number) => {
    const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN;
    return Number.isNaN(v) ? fallback : Math.min(max, Math.max(min, v));
  };
  return {
    sessionThresholdMinutes: clamp(raw?.sessionThresholdMinutes, 5, 240, ENGINE_DEFAULTS.sessionThresholdMinutes),
    breakDurationMinutes: clamp(raw?.breakDurationMinutes, 5, 60, ENGINE_DEFAULTS.breakDurationMinutes),
    reminderFrequencyMinutes: clamp(raw?.reminderFrequencyMinutes, 15, 240, ENGINE_DEFAULTS.reminderFrequencyMinutes),
    natureImagery: typeof raw?.natureImagery === "boolean" ? raw.natureImagery : ENGINE_DEFAULTS.natureImagery,
    nearbyRecommendations:
      typeof raw?.nearbyRecommendations === "boolean" ? raw.nearbyRecommendations : ENGINE_DEFAULTS.nearbyRecommendations,
  };
}

function readLocal(): GroundedSettings | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(settings: GroundedSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private mode) — in-memory only
  }
}

function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Load persisted settings; falls back to engine defaults */
export async function loadSettings(): Promise<GroundedSettings> {
  if (hasTauri()) {
    try {
      const raw = await invoke<Partial<GroundedSettings> | null>("get_settings");
      return normalize(raw);
    } catch {
      // IPC unavailable (plain vite) — fall through to localStorage
    }
  }
  return readLocal() ?? ENGINE_DEFAULTS;
}

/** Persist settings via the Rust side; localStorage mirrors for dev */
export async function saveSettings(settings: GroundedSettings): Promise<void> {
  if (hasTauri()) {
    await invoke("set_settings", { settings });
  }
  writeLocal(settings);
}
