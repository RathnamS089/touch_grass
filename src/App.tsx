import { useEffect, useState, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { MainExperience } from "@/components/MainExperience";
import { MockControls } from "@/components/MockControls";
import { CommandBar } from "@/components/CommandBar";
import { Navigation } from "@/components/Navigation";
import { Dashboard } from "@/pages/Dashboard";
import { OutdoorRecommendation } from "@/pages/OutdoorRecommendation";
import { Privacy } from "@/pages/Privacy";
import { Settings } from "@/pages/Settings";
import { loadSettings } from "@/services/settings";
import { getScreenTimeDetail } from "@/services/backend";
import { createInitialState, navigate, transitionExperience, type DemoAction } from "@/services/app-state";
import type { GroundedSettings, OutdoorPlace } from "@/types/grounded";
import type { MorphOrbHandle, OrbBreakPlace } from "@/components/ui/ai-thiking-orb-and-input";

/** Shape the Rust pipeline emits on break_ready / recommendation_ready */
interface RecommendationEvent {
  name: string;
  category: string;
  distance: string;
  reason: string;
  lat?: number;
  lon?: number;
}

function recToPlace(rec: RecommendationEvent): OutdoorPlace {
  return {
    id: rec.name.toLowerCase().split(' ').join('-'),
    name: rec.name,
    category: rec.category,
    distance: rec.distance,
    description: rec.reason,
    lat: rec.lat,
    lon: rec.lon
  };
}

export default function App() {
  const [state, setState] = useState(createInitialState);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [pendingBreak, setPendingBreak] = useState<OrbBreakPlace | null>(null);
  const orbRef = useRef<MorphOrbHandle | null>(null);
  const isDevelopment = import.meta.env.DEV;

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const subscription = listen<string>("history_save_status", event => setHistoryStatus(event.payload));
    return () => { subscription.then(unlisten => unlisten()).catch(() => {}); };
  }, []);

  // Load persisted settings once; the Settings page keeps them in sync
  useEffect(() => {
    let mounted = true;
    loadSettings().then((settings) => {
      if (mounted) setState((current) => ({ ...current, settings }));
    });
    return () => { mounted = false; };
  }, []);

  // Break flow: the Rust threshold timer fired → the orb talks to the
  // backend's suggestion and morphs into the place card
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<RecommendationEvent>("break_ready", (event) => {
      const rec = event.payload;
      setState((current) => ({
        ...current,
        screen: "main",
        intervention: {
          message: "You've been at the screen a while — time for a break.",
          breakMinutes: current.settings.breakDurationMinutes,
          place: recToPlace(rec),
        },
      }));
      setPendingBreak({
        name: rec.name,
        category: rec.category,
        distance: rec.distance,
        reason: rec.reason,
        lat: rec.lat,
        lon: rec.lon,
      });
    });
    return () => {
      unlisten.then(f => f()).catch(() => {});
    };
  }, []);

  // Deliver only after the main screen has mounted its imperative handle.
  useEffect(() => {
    if (state.screen !== "main" || !pendingBreak) return;
    // Wait through StrictMode's effect teardown/recreation before consuming it.
    const frame = requestAnimationFrame(() => {
      if (orbRef.current?.triggerBreak(pendingBreak)) setPendingBreak(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [state.screen, pendingBreak]);

  // Compatibility listener (same payload, kept for any other consumers):
  // updates the stored intervention in place, never steals the screen — the
  // break_ready listener above owns the orb morph flow
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<RecommendationEvent>("recommendation_ready", (event) => {
      const rec = event.payload;
      setState((current) => ({
        ...current,
        intervention: {
          message: "You've been at the screen a while — time for a break.",
          breakMinutes: current.settings.breakDurationMinutes,
          place: recToPlace(rec),
        },
      }));
    });
    return () => {
      unlisten.then(f => f()).catch(() => {});
    };
  }, []);

  // "Show on map" on the orb's break card → recommendation screen with the map
  const handleBreakMap = useCallback((place: OrbBreakPlace) => {
    setState((current) => ({
      ...current,
      screen: "recommendation",
      experience: "intervention",
      intervention: {
        message: "A good time for a break.",
        breakMinutes: current.settings.breakDurationMinutes,
        place: {
          id: place.name.toLowerCase().split(' ').join('-'),
          name: place.name,
          category: place.category,
          distance: place.distance,
          description: place.reason,
          lat: place.lat,
          lon: place.lon,
        },
      },
    }));
  }, []);

  // Live session seconds from Grounded's own activity engine (Rust), polled
  // every 2s — the source of truth for the timer, not a frontend guess
  useEffect(() => {
    let mounted = true;
    const tick = () => {
      getScreenTimeDetail().then((result) => {
        if (!mounted || !result.ok) return;
        const d = result.data;
        setState((current) => ({
          ...current,
          activity: {
            status: d.is_active ? "active" : "idle",
            sessionSeconds: d.current_session_seconds,
          },
        }));
      });
    };
    tick();
    const id = window.setInterval(tick, 2_000);
    return () => { mounted = false; window.clearInterval(id); };
  }, []);

  const setDemoState = (action: DemoAction) => setState((current) => transitionExperience(current, action));
  const goMain = () => setState((current) => navigate(current, "main"));

  const handleAskLLM = useCallback((query: string) => {
    // Navigate to main screen so the orb is visible, then set the pending query
    setState((current) => navigate(current, "main"));
    setPendingQuery(query);
  }, []);

  const content = (() => {
    switch (state.screen) {
      case "recommendation":
        return <OutdoorRecommendation place={state.intervention?.place ?? transitionExperience(state, "intervention").intervention!.place!} onBack={goMain} onReset={() => setDemoState("resting")} />;
      case "dashboard":
        return <Dashboard onBack={goMain} />;
      case "settings":
        return <Settings settings={state.settings as GroundedSettings} onChange={(settings) => setState((current) => ({ ...current, settings }))} onBack={goMain} />;
      case "privacy":
        return <Privacy onBack={goMain} />;
      default:
        return <MainExperience state={state} orbHandleRef={orbRef} onBreakMap={handleBreakMap} onIntervention={() => setDemoState("intervention")} onRecommendation={() => setDemoState("recommendation")} pendingQuery={pendingQuery} onQueryConsumed={() => setPendingQuery(null)} />;
    }
  })();

  return (
    <main className="app-shell">
      <div className="app-noise" aria-hidden="true" />
      <div className="app-frame">
        <Navigation current={state.screen} onNavigate={(screen) => setState((current) => navigate(current, screen))} />
        {content}
      </div>
      {historyStatus && <div className="history-status" role="status"><span>{historyStatus}</span><button type="button" aria-label="Dismiss save status" onClick={() => setHistoryStatus(null)}>×</button></div>}
      <CommandBar onCommand={(screen) => setState((current) => navigate(current, screen))} onAskLLM={handleAskLLM} />
      {isDevelopment && <MockControls onChange={setDemoState} />}
    </main>
  );
}
