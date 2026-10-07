import { useEffect, useState } from "react";
import { MainExperience } from "@/components/MainExperience";
import { MockControls } from "@/components/MockControls";
import { CommandBar } from "@/components/CommandBar";
import { Navigation } from "@/components/Navigation";
import { Dashboard } from "@/pages/Dashboard";
import { OutdoorRecommendation } from "@/pages/OutdoorRecommendation";
import { Privacy } from "@/pages/Privacy";
import { Settings } from "@/pages/Settings";
import { createInitialState, navigate, transitionExperience, type DemoAction } from "@/services/app-state";

export default function App() {
  const [state, setState] = useState(createInitialState);
  const isDevelopment = import.meta.env.DEV;

  useEffect(() => {
    if (state.experience !== "active") return;
    const timer = window.setInterval(() => setState((current) => ({
      ...current,
      activity: { ...current.activity, sessionSeconds: current.activity.sessionSeconds + 60 },
    })), 60_000);
    return () => window.clearInterval(timer);
  }, [state.experience]);

  const useDemoState = (action: DemoAction) => setState((current) => transitionExperience(current, action));
  const goMain = () => setState((current) => navigate(current, "main"));

  const content = (() => {
    switch (state.screen) {
      case "recommendation":
        return <OutdoorRecommendation place={state.intervention?.place ?? transitionExperience(state, "intervention").intervention!.place!} onBack={goMain} onReset={() => useDemoState("resting")} />;
      case "dashboard":
        return <Dashboard onBack={goMain} />;
      case "settings":
        return <Settings settings={state.settings} onChange={(settings) => setState((current) => ({ ...current, settings }))} onBack={goMain} />;
      case "privacy":
        return <Privacy onBack={goMain} />;
      default:
        return <MainExperience state={state} onIntervention={() => useDemoState("intervention")} onRecommendation={() => useDemoState("recommendation")} />;
    }
  })();

  return (
    <main className="app-shell">
      <div className="app-noise" aria-hidden="true" />
      <div className="app-frame">
        <Navigation current={state.screen} onNavigate={(screen) => setState((current) => navigate(current, screen))} />
        {content}
      </div>
      <CommandBar onCommand={(screen) => setState((current) => navigate(current, screen))} />
      {isDevelopment && <MockControls onChange={useDemoState} />}
    </main>
  );
}
