# Grounded: Changes & Next Steps

## Completed (Backend Integrated ✅)

All 9 backend TODOs are fully implemented:

- **macOS Activity Monitor** — CoreGraphics `CGEventSourceSecondsSinceLastEventType`
- **Ephemeral Session Engine** — Active/Idle transitions, 45-min threshold
- **Nearby Place Discovery** — IP geolocation + Overpass API (parks, water, nature reserves)
- **Recommendation Engine** — Local Ollama LLM with auto model detection (`pick_qwen_model`), fallback implemented
- **Event Layer & API Contract** — Tauri `recommendation_ready` event to React (requires capabilities — see fix below)
- **Supabase Persistence** — `notification_history` table via REST API
- **Frontend** — React complete, Orb animations fixed, UI bugs fixed
- **Dashboard** — Real screen-time metrics, usage chart
- **Full verification** — `npm run typecheck`, `npm run build`, `cargo check`, `npm test` all pass

---

## Fixes (Oct 10 session) — backend connection + OSM viewer

**Root causes found and fixed:**

1. **Ollama model mismatch** — code requested `"qwen2.5"` but the installed model is `"qwen2.5:1.5b"`. Ollama returns 404 for name mismatches, so every LLM call failed and surfaced as "can't connect to backend". Fixed with `pick_qwen_model()` in `llm.rs`: queries `/api/tags`, prefers exact `"qwen2.5"`, then any qwen model. Verified by curl: old name → `model 'qwen2.5' not found`, new name → valid JSON.

2. **No Tauri v2 capabilities** — there was no `src-tauri/capabilities/` directory and `gen/schemas/capabilities.json` was `{}`. In Tauri v2, a webview matching no capability has **no IPC access at all**, so even the pure-Rust `get_backend_status` check failed with "not allowed. Command not allowed on any window/webview/URL context" — this is why the error showed even with `ollama serve` running. Fixed by adding `src-tauri/capabilities/main.json` (`core:default` for window `main`); verified it compiles into `gen/schemas/capabilities.json`.

3. **LLM recommendation could never parse** — the prompt asked for name/category/distance/reason only, but `RecommendedPlace` requires `lat`/`lon`, so deserialization always failed and `recommendation_ready` never fired. Fixed: prompt now includes each candidate's coordinates and requires lat/lon in the JSON response.

4. **Malformed LLM responses killed the pipeline** — a parse failure propagated as a hard error, silently skipping the event emission. Fixed: parse failures now fall back (first candidate + its real coordinates) like HTTP failures do.

5. **OSM viewer fixes** (`OutdoorRecommendation.tsx`) — stale "This is frontend mock data" note removed; Leaflet map now cleaned up on unmount (StrictMode double-mount previously threw "Map container is already initialized"); bundle-safe `divIcon` marker (default Leaflet icon images don't resolve under Vite); map container only rendered when coordinates exist; demo/mock places in `grounded-data.ts` now carry real Bangalore coordinates so the demo path shows a map too.

**Verification:** `cargo check` (0 warnings), `npm run typecheck`, `npm run build` (1932 modules), `npm test` (1/1) all pass.

**To see it live:** restart `npm run tauri dev` — the running app binary predates these fixes.

---

## Fixes (Oct 10, round 2) — "I can't reach the backend" after IPC fix

**Root cause found by live probing:** Overpass API returns **HTTP 406 for requests without a User-Agent header**. `reqwest::Client::new()` sends **no User-Agent by default**, so the Rust discovery always 406'd — and `ask_llm` called discovery *before* answering, propagating the failure as "I couldn't reach the backend" even though Ollama was fine. Proven: same query with `Python-urllib` UA → 406; with a custom UA → 200 with real data.

**Fixed:**

1. **User-Agent on all API requests** — new `api_client()` in `lib.rs` builds a reqwest client with `user_agent("Grounded/0.1 (desktop companion)")`; `discovery.rs` also sets `USER_AGENT` explicitly on ip-api and Overpass requests via a new `post_overpass()` helper.
2. **Overpass mirror fallback** — `post_overpass()` tries `overpass-api.de` then `overpass.kumi.systems` (the primary was intermittently 406/504 during testing).
3. **Radius fix** — the orb's Bangalore query used `around:10000` which hit 504 gateway timeouts; reduced to `around:5000` (verified 200, 9.7KB of places).
4. **`ask_llm` is now fully resilient** — discovery failure falls back to static offline candidates (`discovery::fallback_candidates()`: Cubbon Park, Lalbagh, Ulsoor Lake with real coords) instead of erroring; LLM failure returns a graceful message naming a nearby place instead of "I couldn't reach the backend".
5. **Recommendation pipeline resilience** — the 45-min threshold event no longer silently `continue`s on discovery failure; it uses offline candidates so the recommendation always fires.
6. **90s HTTP timeout** — `reqwest::Client::new()` had no timeout; a hung endpoint would spin the orb forever.
7. **Model preference** — `pick_qwen_model` now prefers `qwen2.5*` tags (fast, no thinking overhead) over `qwen3:4b` (whose thinking mode took ~50s/answer in testing; thinking is correctly separated by current Ollama, so parsing is unaffected either way).
8. **Frontend honesty** — `backend.ts` `askLLM` now surfaces the real error (`Backend unavailable: <message>`) instead of the opaque "I couldn't reach the backend."

**End-to-end proof (live):** fixed discovery query → 20 real Bangalore places (incl. Lalbagh, Cubbon Park) → qwen LLM answered "Lalbagh Botanical Gardens is a perfect spot for a quick break!" in the exact format the orb displays.

**IMPORTANT:** `tauri dev` must be running with a freshly rebuilt binary — check `target/debug/grounded` mtime is newer than your last edit. The dev process died twice during this session; a stale binary keeps old behavior.

---

## Changes Completed This Session

| Change | Status |
|--------|--------|
| `npm install leaflet @types/leaflet` | ✅ Installed (3 packages, 0 vulnerabilities) |
| Leaflet CSS added to `index.html` | ✅ Added via CDN link |
| `npm run typecheck` | ✅ Passes |
| `npm run build` | ✅ Passes (vite v6.4.4, 1928 modules transformed) |
| `npm test` | ✅ Passes (1 test file, 1 test) |
| `cargo check` | ✅ Passes (1 unused import warning) |

---

## Task 1: OpenStreetMap Interactive Map on OutdoorRecommendation — **COMPLETE**

**Goal**: Display an interactive Leaflet OSM map with a marker for each suggested place.

**What's been done**:
- ✅ Leaflet + `@types/leaflet` installed
- ✅ Leaflet CSS linked in `index.html` + imported in the component
- ✅ `OutdoorPlace` type includes `lat`/`lon` fields (`src/types/grounded.ts`)
- ✅ Rust `PlaceCandidate` struct includes `lat`/`lon` (`src-tauri/src/discovery.rs`)
- ✅ Overpass query responses extract `lat`/`lon` from elements
- ✅ Fallback candidates include lat/lon
- ✅ `RecommendedPlace` in `llm.rs` includes `lat`/`lon`, emitted in the `recommendation_ready` event
- ✅ `App.tsx` passes `lat`/`lon` from the event payload into the `place` object
- ✅ Leaflet map component in `OutdoorRecommendation.tsx` renders the map with a marker at the place's coordinates
- ✅ Mock/demo places carry real Bangalore coordinates, so the demo path shows a map too

---

## Task 2: Orb Display When Typing a Basic Prompt in the Taskbar — **MOSTLY COMPLETE**

**Goal**: One morphing orb component app-wide; command bar typing triggers the orb animation on any screen.

**What's been done**:
- ✅ `CommandBar` now accepts `onAskLLM` callback prop
- ✅ When user types a non-command prompt, `onAskLLM(query)` fires
- ✅ `App.tsx` handles this via `handleAskLLM`:
  - Navigates to "main" screen (where the orb lives)
  - Sets `pendingQuery` state
- ✅ `MainExperience` receives `pendingQuery` and `onQueryConsumed` props
- ✅ `MainExperience` uses a ref to call `orbRef.current.submit(pendingQuery)` programmatically
- ✅ `MorphOrb` component completely rewritten with full animation pipeline (idle → launch → assemble → think → resolve → condense → unfold → answered)
- ✅ `MorphOrb` accepts `onSubmit` async callback that calls `askLLM` from backend
- ✅ GroundedMessage removed to give orb full focus

**What's still needed**:
- [ ] Test end-to-end: type a question in CommandBar → navigates to main → orb animates → LLM response appears

---

## Task 3: Real macOS Screen Time in the Analytics Bar — **COMPLETE**

**Goal**: Dashboard's analytics card should show real macOS screen time from the Rust engine.

**What's been done**:
- ✅ `Dashboard.tsx` rewritten to fetch real screen time via `getScreenTime()` from `backend.ts`
- ✅ Polls every 30 seconds + immediate fetch on mount
- ✅ `formatDuration` helper formats seconds into "4h 31m" style
- ✅ Metrics now show: Total screen time (live), Current session, Status (Active/Idle), Breaks encouraged
- ✅ Usage chart shows hourly blocks based on current time, with current hour proportional to screen time
- ✅ No more mock `overviewMetrics` or `usagePoints` from `grounded-data.ts`

---

## Task 4: Full Verification — **COMPLETE**

| Check | Status |
|-------|--------|
| `npm run typecheck` | ✅ Passes |
| `npm run build` | ✅ Passes (production build) |
| `cargo check` | ✅ Passes (1 warning: unused `Manager` import) |
| `npm test` | ✅ Passes (1 test file, 1 test) |

---

## Files Modified This Session

### Frontend
- `src/App.tsx` — Added `pendingQuery` state, `handleAskLLM`, Tauri event listener for `recommendation_ready`
- `src/components/CommandBar.tsx` — Complete rewrite: global `/` hotkey, `onAskLLM` callback, styled form
- `src/components/MainExperience.tsx` — Added `pendingQuery`/`onQueryConsumed` props, ref to trigger orb programmatically, dev backend status indicator
- `src/components/ui/ai-thiking-orb-and-input.tsx` — **Complete rewrite** (1041 lines): full morphing orb animation pipeline with `onSubmit` callback
- `src/pages/Dashboard.tsx` — Complete rewrite: real screen time from Rust, polling, live metrics
- `src/pages/OutdoorRecommendation.tsx` — No changes yet (map component pending)
- `src/types/grounded.ts` — Added `lat`/`lon` to `OutdoorPlace`
- `src/index.css` — Minor additions (orb styles already embedded in component)
- `index.html` — Added Leaflet CSS CDN link

### Backend (Rust)
- `src-tauri/src/lib.rs` — **Complete rewrite**: Tauri commands (`get_backend_status`, `get_screen_time`, `ask_llm`), backend loop with discovery + LLM + Supabase + event emission
- `src-tauri/src/discovery.rs` — Added `lat`/`lon` to `PlaceCandidate`, extract from Overpass elements
- `src-tauri/src/llm.rs` — No changes (but `RecommendedPlace` still needs lat/lon for Task 1)
- `src-tauri/src/engine.rs` — No changes (session engine working)
- `src-tauri/Cargo.toml` — No changes

### Tests
- `src/services/app-state.test.ts` — Still passes

---

## Changes (Oct 10, round 3) — functional Settings + macOS Screen Time sync

**Root causes found and fixed:**

1. **Settings were demo-only** — the page even said "These controls only affect the demo frontend for now." Nothing persisted, and the Rust engine hardcoded a 45-min threshold. Fixed: new `src/services/settings.ts` (persist via `set_settings` Rust command to `~/Library/Application Support/com.grounded.touchgrass/settings.json`, localStorage mirror under plain vite), `get_settings`/`set_settings` commands added, `SessionEngine` now reads a live `INTERVENTION_THRESHOLD_SECONDS` atomic so the "Long session threshold" stepper steers the running engine without a restart. Steppers now clamp to bounds (threshold 5–240, break 5–60, reminders 15–240) and disable at the limits; persisted settings load on app start (App.tsx).

2. **Screen time only counted Grounded's own runtime** — `TODAY_ACTIVE_SECONDS` starts at 0 when the app launches and ticks 1/sec while active, so it could never match System Settings → Screen Time. Fixed: new `src-tauri/src/monitor/screentime.rs` reads CoreDuet's `knowledgeC.db` (`/app/inFocus` stream — the source macOS Screen Time itself is derived from): total/longest/sessions/hourly for the local day, **excluding Grounded itself** (`ZVALUESTRING NOT LIKE 'com.grounded%'` — time in Grounded is break time), ongoing sessions counted live (ZENDDATE=0 → now), corrupt rows capped at 1 day. A 5-min sync loop stores it in `SCREEN_TIME_READING` (RwLock); `get_screen_time` prefers the synced value and `get_screen_time_detail` returns `{synced, source, total, longest, sessions, hourly}`. **Fallback**: without Full Disk Access the db is TCC-protected — get_screen_time falls back to the engine counter and the Dashboard shows an honest notice naming the fix.

**Verification:** `cargo test --lib` (6/6 — including 5 new SQL tests against an in-memory knowledgeC fixture; REAL-column bug and hour-split bug caught by these before ever touching the real db), `cargo check` (0 warnings), `npm run typecheck`, `npm test` (1/1), `npm run build`, plus the live `live_knowledgec_smoke` test proving the graceful TCC error message.

**To get full Mac screen time:** System Settings → Privacy & Security → Full Disk Access → add Grounded (the `npm run tauri dev` binary), restart the app. The Dashboard then shows the same number as macOS Screen Time.

**IMPORTANT:** restart `npm run tauri dev` — the running binary predates these changes.

---

## Changes (Oct 10, round 4) — Grounded's own timer as the single source + auto break message

**User decision:** drop the macOS Screen Time (knowledgeC.db) sync; stick with Grounded's own activity engine. The knowledgeC reader stays in the repo as `#[cfg(test)]`-only (`monitor/screentime.rs`) — its 5 in-memory SQL tests still run and it can be revived behind a settings toggle later.

1. **Dashboard runs on the engine** — `get_screen_time_detail` now returns `{source: "grounded-engine", total_seconds, current_session_seconds, is_active, sessions, nudges, hourly}` straight from engine atomics (no TCC, no Full Disk Access needed). The engine now also tracks `CURRENT_SESSION_SECONDS`, `IS_ACTIVE`, `SESSIONS_TODAY`, `NUDGES_TODAY`, and `HOURLY_ACTIVE_SECONDS[24]` (per local hour, via chrono Timelike). App.tsx polls it every 2s so `activity.sessionSeconds` is engine truth, not the old frontend +60/min guess.

2. **Timer expiry auto-displays the break message with a place** — the threshold pipeline in `lib.rs` can no longer swallow the nudge: LLM failure → `llm::fallback_place(&candidates)` (now `pub`), discovery failure → offline candidates, Supabase persistence is best-effort. `recommendation_ready` always fires when the timer runs out; App.tsx renders it as the intervention screen with the place (message: "You've been at the screen a while — time for a break.", break minutes from the user's Settings). "Breaks encouraged" on the Dashboard shows the real nudge count.

**Verification:** `cargo check` (0 warnings), `cargo test --lib` (6/6), `npm run typecheck`, `npm test` (1/1), `npm run build` — all pass.

**Known trade-off:** Grounded's timer is per-app-run — `total_seconds`/hourly reset when the app restarts (and don't reset at midnight). That's inherent to "Grounded's own timer"; the knowledgeC path was the persistent alternative.

**IMPORTANT:** restart `npm run tauri dev` — the running binary predates these changes.

---

## Changes (Oct 10, round 5) — plain-language settings + repeating reminders + real notifications

**Why the user's 5-min test never fired:** (a) the running binary predated the settings persistence — the app data dir was empty, `set_settings` never wrote; (b) the timer counts only ACTIVE keyboard/mouse time, so idly watching the window never accrues seconds. Fixed by rebuilding + documenting the behavior in the setting's description.

1. **Settings copy rewritten in plain language** — "Long session threshold" → "Time before a break is suggested" (with a concrete example + the "clock pauses when you step away" behavior), "Break duration" → "How long your break should be", "Minimum time between reminders" → "How often to remind you again" (with example).

2. **The reminders setting now actually works** — previously stored but unused (nudges fired once per session). Engine now: first nudge at threshold, then repeats every `reminder_frequency_minutes` until the user goes idle (idle resets the cycle). New `REMINDER_INTERVAL_SECONDS` atomic; `set_settings` updates it live; `GroundedSettings` Rust struct now persists all three fields (serde was silently dropping break/reminder from the payload).

3. **Nudge reaches the user as a macOS notification** — `tauri-plugin-notification` added (registered + `notification:default` in capabilities/main.json). Title "Time for a break", body names the minutes and the recommended place. The in-app break screen still appears via `recommendation_ready`.

4. **Engine testability** — `tick_at(idle, Instant)` injects the clock (`tick()` delegates with real time); 3 new tests (first nudge at threshold, repeats at interval, idle resets) serialized with a mutex because they mutate GLOBAL static atomics — parallel tests raced and failed randomly. `cargo test --lib`: 9 passed.

**Verification:** `cargo check` 0 warnings, `cargo test --lib` 9/9 (×3 runs stable), `npm run typecheck`, `npm test`, `npm run build` — all pass. Restart `npm run tauri dev` to pick up the new binary.

---

## Changes (Oct 10, round 6) — orb-driven break flow + the settings fix that finally works

**Independent review verdict (pre-ship check the user asked for): FAIL — 3 blocking logic errors, all fixed below.** The reviewer also ran the full gate suite independently (Rust 9/9, tsc clean, vitest 1/1, security scan clean) and proved the serde bug with a real round-trip probe: `rename_all` alone was NOT enough — the Rust field was named `intervention_threshold_minutes` while the frontend sends `sessionThresholdMinutes`, so every settings save was rejected with "missing field interventionThresholdMinutes" and silently swallowed.

1. **Settings persistence finally works** — Rust `GroundedSettings` fields renamed to match the frontend exactly (`session_threshold_minutes` / `break_duration_minutes` / `reminder_frequency_minutes` + `rename_all = "camelCase"`). Verified with a serde round-trip probe: the exact frontend payload now deserializes, and `get_settings` returns what the frontend reads. This was the root cause of "5 min, no break."

2. **Orb-driven break flow (user's ask)** — when the Rust threshold timer fires, it emits `break_ready`; App.tsx calls `orbRef.triggerBreak(place)`; the orb runs its full launch→assemble→think animation (its "backend call" is visualized with the thinking labels) and morphs into a **place card inside the orb**: "TIME FOR A BREAK" / place name / category · distance / **Show on map** + **Not now** buttons. "Show on map" navigates to the recommendation page with the Leaflet map pinned to the place's real coordinates. The orb also exposes a real imperative handle now (`MorphOrbHandle`: submit/triggerBreak/clearBreak) — fixing the previously dead `orbRef.current.submit()` path from the CommandBar.

3. **Review fixes** — stale `synced` doc removed from backend.ts; `recommendation_ready` kept as a compatibility listener that no longer steals the screen.

**Verification:** `cargo check` 0 warnings, `cargo test --lib` 9/9, `npm run typecheck`, `npm test` 1/1, `npm run build` all pass; serde round-trip probe: SET_SETTINGS OK / GET_SETTINGS RETURNS camelCase / ROUND-TRIP OK. Restart `npm run tauri dev`, set 5 min, use the Mac normally — the orb will animate and morph into the break card at 5 minutes of active use.

---

## Changes (Oct 10, round 7) — full review remediation (ship gate)

The full independent review delivered 4 findings; all are now fixed:

1. ✅ (was fixed in round 6) **Settings field-name mismatch** — plus `#[serde(alias)]` for legacy `intervention_threshold_minutes` files. Probe verified all three shapes deserialize: current frontend payload (threshold 5, bools true), legacy file (45 + defaults), get_settings output (bools round-trip).

2. ✅ **Toggles now persist** — Rust struct gained `nature_imagery` / `nearby_recommendations` bool fields (with `#[serde(default)]`); without them serde silently dropped the two booleans and they reset to `true` on every restart. Probe verified: `{natureImagery: false, nearbyRecommendations: false}` round-trips.

3. ✅ (was fixed in round 6) **CommandBar → orb flow** — `MorphOrbHandle` imperative handle (submit/triggerBreak/clearBreak) now actually attached via the `orbRef` prop.

4. ✅ **Midnight rollover** — the engine compares the local calendar day on every active tick (`ACTIVE_DAY: AtomicI64`, days-since-CE); on change, `TODAY_ACTIVE_SECONDS` and all 24 hourly counters reset. An app left running for days no longer shows multi-day totals under "today".

**Review suggestions also applied:** server-side clamp in `set_settings` (5–240 / 5–60 / 15–240, matching the frontend — threshold 0 can no longer be set via IPC), HTTPS geolocation (ipwho.is → ipapi.co fallback; the plain-HTTP ip-api location query is gone — the privacy page's promise holds on the wire too).

**Final verification:** `cargo check` 0 warnings, `cargo clippy -D warnings` 0 warnings, `cargo test --lib` 9/9, `npm run typecheck` clean, `npm test` 1/1, `npm run build` passes, serde round-trip probe all-shapes OK.

**Worthy of shipping.** Remaining nits are non-blocking (dual pollers when Dashboard is open, `useDemoState` naming, Supabase trailing-slash tolerance). Restart `npm run tauri dev` with the fresh binary.

---

## Changes (Oct 10, round 8) — discovery always failing fixed (final)

**Root cause of "Discovery failed" on every nudge:** the HTTPS geolocation swap (round 7) changed the endpoint to ipwho.is but kept `lat`/`lon` response fields — ipwho.is returns `latitude`/`longitude`, so serde failed and EVERY break nudge degraded to the static offline parks. Proven with curl (real response shape) + a live probe: `DISCOVERY_OK 7 places, first: Bird and Rabbit park (12.977, 77.597)` after aliasing.

Fixed: `IpApiResp` now uses `latitude`/`longitude` with `#[serde(alias = "lat"/"lon")]` so all three providers (ipwho.is, ipapi.co, legacy ip-api.com) deserialize. `cargo check` 0 warnings, `cargo test --lib` 9/9, typecheck, vitest, build all pass.

---

## Changes (Oct 10, round 9) — Codex/Astra session merged & verified (final state)

The 21:07–22:57 Codex session (cut off by a spend cap) landed significant changes on top of Hermes' rounds 1–8. This round reviews, completes, and verifies them.

**What Codex added (reviewed, all sound):**
- `pipeline.rs` — bounded remote work: 20s discovery timeout + 15s LLM timeout; honors the `nearbyRecommendations` toggle (disabled → no map placeholder invented); falls back gracefully. With tests.
- `activity_store.rs` — daily totals persist to `activity.json` (atomic tmp+rename) and restore on launch, same-day only. Survives app restarts — resolves Hermes' "counters reset on restart" weakness. With tests.
- `engine.rs` — rollover moved to a public `rollover_day()` called on every tick; `ENGINE_TEST_LOCK` made `pub(crate)` for cross-module tests.
- `deliver_break()` extracted; event → notification → UI, then Supabase persistence in a detached task with `history_save_status` feedback (DB failure never delays the nudge).
- `test_break` command + "Try a reminder" button in Settings — manual trigger through the exact production delivery path.
- Pending-break queue in App.tsx — a nudge arriving while another screen is open (or mid StrictMode remount) is delivered once the orb is mounted.
- `RecommendedPlace.lat/lon` now `Option` — `nearbyRecommendations: off` no longer fabricates map coordinates; map UI handles absent coords ("map-unavailable" state, copy OSM link, recenter button).
- Playwright E2E suite (`tests/e2e/break-flow.spec.ts` + config) with a mocked-IPC harness; native WebKit E2E probe (`src-tauri/examples/native_e2e.rs`); Supabase live check (`verify_connection.rs --save`).
- Supabase migration with RLS: insert-only for anon, revoke reads — history can't be scraped.
- `db.rs` hardening: 10s timeout, trimmed URL, publishable-key auth handling, actionable error messages; `.env` loading via dotenvy (repo root).

**This round (Hermes):**
- Installed Playwright browsers and ran the E2E suite: **4/4 passed** (settings→orb→map flow, dismiss+re-reminder, failed-save honesty, command-bar Q&A).
- `cargo test`: **13/13 passed** (1 ignored smoke); `cargo check` + `clippy -D warnings`: 0 warnings; typecheck, vitest 1/1, build all pass.
- Cleaned `git diff --check` trailing whitespace (lib.rs, CommandBar.tsx) flagged by Codex.
- Added `.env.example` (real `.env` is gitignored and never read by agents).

**Architecture (current, verified):**
```
React UI ──invoke──▶ Rust commands (settings/screen-time/ask_llm/test_break)
   ▲                     │
   └──events── pipeline.rs ──▶ discovery (ipwho.is→ipapi.co, 20s cap)
   break_ready              └─▶ llm.rs (Ollama/Qwen, 15s cap) → fallback
       │                    Supabase insert (detached, best-effort)
   orb morphs ──Show on map──▶ OutdoorRecommendation (Leaflet)
engine.rs (1s tick: CGEventSource idle, rollover, nudges) ── activity_store.rs (activity.json)
```

**Verification (all green):** cargo 13/13 + 0 clippy warnings, typecheck, vitest 1/1, build, Playwright 4/4.

**Remaining (non-blocking):** dev `println!` logging (swap for `log`/`tracing` before a public release); app icon empty in tauri.conf.json; dual engine pollers; optional `npm run test:e2e` script. Restart `npm run tauri dev` to pick up the rebuilt binary.

---

## Changes (Oct 10, round 10) — migration #2 + real recommendation variety

**Why every nudge said Cubbon Park / Ulsoor Lake:** three compounding causes — the Overpass query only asked for 10 places; `fallback_place` always took `candidates.first()` (Cubbon Park sorts near the top); and nothing remembered what was recently suggested, so even LLM picks could repeat forever.

**Fixed — recommendations now vary with real distances:**
- **Wider net**: Overpass query now also covers gardens (node+way) and playgrounds (3 km), asks for 30 elements instead of 10, dedupes node/way twins of the same place.
- **Real distances**: haversine distance from the user computed per candidate; the UI now shows "249 m away" / "1.3 km away" instead of the static "Check the map for distance" (also what the LLM is told to echo).
- **Recent-place memory** (`recent_places.json`, survives restarts): the last 5 recommended names. The LLM prompt now lists them under "AVOID these"; the no-LLM fallback excludes recent picks and rotates through the nearest remaining places using a persistent remember-counter. Proven live: 3 consecutive nudges → Cubbon Park (249 m), Bird and Rabbit park (653 m), Freedom Park (1.3 km) — 3 unique places out of 20 real candidates near the user.
- **Honest no-candidate case**: empty candidate list → "A moment away from the screen" with no fabricated coordinates (this also fixed an infinite recursion the new tests caught: varied_fallback ↔ fallback_place).
- **Migration #2** (`supabase/migrations/202610100002_reminder_details.sql`): adds `place_lat`, `place_lon`, `nudge_kind` ('threshold'|'manual') to `notification_history`, extends the anon INSERT grant to the new columns (the original column-scoped grant would have rejected them with the new payload), keeps RLS read-proof, CHECK-constrains nudge_kind. `db.rs` sends the new fields (coordinates omitted when absent) — legacy shapes still load via serde.

**Verification:** cargo 19/19 (6 new llm tests: variety, no-repeat, coordinates, distance formatting, rotation, empty-pool), clippy 0, typecheck, vitest 1/1, build, Playwright 4/4. Live probe: `VARIED unique=3 of 3`.

**How to apply the migrations:** Supabase Dashboard → SQL Editor → paste each file in `supabase/migrations/` (both are idempotent) → Run. Then `cargo run --manifest-path src-tauri/Cargo.toml --example verify_connection -- --save` should print `SUPABASE_INSERT_OK`.

---

## Immediate Next Steps

1. **Complete Task 1 (Leaflet map)**:
   - Add `lat`/`lon` to `RecommendedPlace` in `llm.rs`
   - Emit them in the `recommendation_ready` event from `lib.rs`
   - Update `App.tsx` to capture and pass them to the place object
   - Build Leaflet map component in `OutdoorRecommendation.tsx`

2. **Test Task 2 end-to-end** — Verify the CommandBar → Orb → LLM flow works

3. **Optional**: Add marker clustering for multiple nearby places (would need full candidate list in event payload)

## UI repair (Oct 10)

- Replaced the viewport-fixed map and unrelated illustration with an embedded, responsive Leaflet map. Added a custom pin, recenter control, resize handling, coordinate validation, tile failure feedback, and copy-location action. Leaflet CSS is bundled locally.
- Standardized page heading sizes and spacing, kept navigation buttons labelled at small widths, and moved demo controls and the closed command shortcut into document flow.
- Corrected chart widths and duration labels; dashboard loading and disconnected states no longer masquerade as zero activity.
- Increased the orb answer card height and enabled scrolling for long replies. Queued incoming breaks until the main screen mounts. Settings steppers use five-minute increments and toggles have accessible labels.
- Verification: TypeScript, existing Vitest suite, and production build pass. Playwright browser checks passed at 390, 560, 720, and 1080px for page bounds, navigation, map containment, and keyboard commands; no page errors. Map and settings screenshots inspected. These checks do not verify native Tauri IPC or live break delivery.
- Added the requested .env values and ignored .env/.env.* (except .env.example). The Rust backend currently expects unprefixed SUPABASE_URL and SUPABASE_ANON_KEY environment variables; adding NEXT_PUBLIC_ entries alone does not configure it.


## Supabase configuration (Oct 10)

- Renamed the ignored root .env keys to SUPABASE_URL and SUPABASE_ANON_KEY.
- Rust now loads root .env in development via dotenvy before starting the backend. Process environment takes precedence. Release builds load .env from their working directory or use supplied process environment; credentials are not compiled into the app.
- Publishable keys use only the apikey header; legacy anon JWTs retain bearer authentication. Endpoint construction tolerates trailing slashes.
- Live read-only probe: /auth/v1/settings returned HTTP 200. The notification_history endpoint returned PGRST205 / HTTP 404: public.notification_history was missing from the API schema cache. No live record was inserted.
- Prepared supabase/migrations/202610100001_notification_history.sql for execution in the project SQL Editor. Anonymous clients can insert place name/category only; no history read/update/delete access is granted. Table creation needs project administration access, which the supplied publishable key does not provide.

Supabase validation: cargo check passed; cargo test --lib passed 11 tests with the manual knowledgeC smoke test ignored. Publishable-key headers, legacy-key compatibility, JSON payload, and trailing-slash handling covered by regression tests.
