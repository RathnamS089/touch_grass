import { invoke } from "@tauri-apps/api/core";

export interface BackendStatus {
  ok: boolean;
  backend: string;
  message: string;
}

export interface BackendError {
  ok: false;
  error: string;
}

export type BackendResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ScreenTimeDetail {
  /** "grounded-engine" — Grounded's own activity engine (idle + threshold) */
  source: string;
  /** Total active seconds today (all sessions) */
  total_seconds: number;
  /** Seconds in the current continuous active session (0 when idle) */
  current_session_seconds: number;
  /** True while the user is actively at the screen */
  is_active: boolean;
  /** Active sessions started today */
  sessions: number;
  /** Break nudges shown today */
  nudges: number;
  /** [local hour 0-23, active seconds] for each hour with activity */
  hourly: [number, number][];
}

export async function getBackendStatus(): Promise<BackendResult<BackendStatus>> {
  try {
    const result = await invoke<BackendStatus>("get_backend_status");
    return { ok: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: `Backend unavailable: ${message}` };
  }
}

export async function getScreenTime(): Promise<number> {
  try {
    return await invoke<number>("get_screen_time");
  } catch (e) {
    return 0;
  }
}

/**
 * Full screen-time snapshot for the Dashboard, from Grounded's own engine.
 */
export async function getScreenTimeDetail(): Promise<BackendResult<ScreenTimeDetail>> {
  try {
    const result = await invoke<ScreenTimeDetail>("get_screen_time_detail");
    return { ok: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: `Backend unavailable: ${message}` };
  }
}

export async function askLLM(query: string): Promise<string> {
  try {
    return await invoke<string>("ask_llm", { query });
  } catch (e) {
    // Surface the real error (IPC permission, command failure, …) so the
    // orb shows what actually went wrong instead of an opaque message
    const message = e instanceof Error ? e.message : String(e);
    return `Backend unavailable: ${message}`;
  }
}
