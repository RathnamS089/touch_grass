import { describe, expect, it } from "vitest";
import { createInitialState, transitionExperience } from "./app-state";

describe("transitionExperience", () => {
  it("moves through the demo journey and resets the active session", () => {
    let state = createInitialState();

    state = transitionExperience(state, "active");
    expect(state.screen).toBe("main");
    expect(state.activity.status).toBe("active");

    state = transitionExperience(state, "long-session");
    expect(state.experience).toBe("long-session");

    state = transitionExperience(state, "intervention");
    expect(state.intervention?.breakMinutes).toBe(15);

    state = transitionExperience(state, "recommendation");
    expect(state.screen).toBe("recommendation");
    expect(state.intervention?.place?.name).toBe("Cubbon Park");

    state = transitionExperience(state, "resting");
    expect(state.screen).toBe("main");
    expect(state.experience).toBe("resting");
    expect(state.activity.status).toBe("idle");
    expect(state.activity.sessionSeconds).toBe(0);
  });
});
