# Hermes Memory — Grounded (Touch Grass)
_Last updated: 2026-10-08_

---

## Project Overview
**Grounded** is a desktop app for the "Touch Grass" hackathon. It is a gentle, nature-inspired reminder system that nudges users to take screen breaks.

---

## Tech Stack
| Layer | Choice |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Desktop runtime | Tauri 2 |
| Backend | Rust (tokio, reqwest) |
| Local LLM | Ollama (Qwen) |
| Database | Supabase (REST API) |

---

## Current State (Backend Integrated!)

### ✅ What is fully working
- **Frontend** - React app complete, Orb animations fixed, UI bugs fixed.
- **macOS Activity Monitor** - Uses CoreGraphics `CGEventSourceSecondsSinceLastEventType` to get idle time.
- **Session & Threshold Engine** - Tracks Active/Idle transitions without saving historical data. Fires threshold events after continuous use (e.g. 45 mins).
- **Nearby Place Discovery** - Queries Overpass API for parks and nature reserves using privacy-conscious IP-based rough geolocation.
- **Recommendation Engine** - Calls local Ollama (qwen2.5) to pick the best nearby place for a break, formatted as JSON. Fallback implemented if Ollama is down.
- **Event Layer & API Contract** - Rust emits a `recommendation_ready` Tauri event to the React frontend.
- **Supabase Persistence** - Saves a minimal record (place name, category) to Supabase's `notification_history` via its REST API (requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars).

All TODOs (1-9) are fully implemented on the backend!

---

## Key Files

### Core
| File | Purpose |
|---|---|
| `src-tauri/src/monitor/activity.rs` | macOS activity detection (CoreGraphics) |
| `src-tauri/src/engine.rs` | Session and Threshold engines |
| `src-tauri/src/discovery.rs` | Location and Overpass API requests |
| `src-tauri/src/llm.rs` | Ollama local LLM integration |
| `src-tauri/src/db.rs` | Supabase persistence |
| `src-tauri/src/lib.rs` | Main event loop and Tauri integration |

---

## Next Steps / Run Instructions
- Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in environment.
- Run local Ollama: `ollama run qwen2.5`
- Start the app: `npm run tauri dev`
