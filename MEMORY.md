# Grounded project memory

## Current app direction

Grounded is a hackathon desktop app for the theme "Touch Grass." The first milestone is intentionally a dumb UI foundation, not the final AI product.

Use exactly this stack for the current Grounded desktop app:
- Tauri 2
- Svelte
- TypeScript
- Vite
- Rust only where Tauri requires it
- No Python, Django, React, Next.js, Tailwind unless already present, external backend, AI, Ollama, Qwen, OpenRouter, TabPFN, Supabase, SQLite, OpenStreetMap, GPS/location, screen monitoring, keyboard/mouse monitoring, notifications, auth, or cloud APIs.

## Implemented dumb version

The current implementation is a native Tauri + Svelte desktop UI with simulated/mock data. It shows:
- Current session timer
- Today's total usage
- Longest session
- Sessions today
- Active/Idle state
- Break streak text
- Random hardcoded motivation quote
- CSS-based nature placeholder

The session timer counts upward in Svelte frontend state. The Active/Idle toggle pauses and resumes the timer and visually changes the state.

## Visual target

The UI should feel calm, minimal, modern, slightly playful, nature-inspired, and macOS utility-like. It should not feel like a corporate productivity dashboard or analytics app. Use dark UI, subtle green/nature accents, generous spacing, clean typography, and minimal animation.

## Verification history

During setup, Rust/Cargo was missing and Tauri initially failed. Rust was installed via rustup. Tauri then failed because `src-tauri/icons/icon.png` was missing/invalid. A valid local icon was added.

Verified successful commands after fixes:
- `npm install`
- `npm run build`
- `npx svelte-check --tsconfig ./tsconfig.json`
- `cargo check` from `src-tauri`
- `npm run tauri dev`
- `npm run tauri build`

Build artifacts were generated at:
- `src-tauri/target/release/bundle/macos/Grounded.app`
- `src-tauri/target/release/bundle/dmg/Grounded_0.1.0_aarch64.dmg`

## Important interaction note

The user may stop or interrupt mid-session and ask whether the task is over. Do not treat old background-process notifications as current failures without checking the latest verified state. If interrupted, inspect current project state and continue from the last real blocker instead of restarting blindly.

## Future architecture, not implemented yet

Future phases may add Rust-side system activity monitoring, SQLite, location, desktop notifications, and Qwen 3 via Ollama for personalized intervention. Do not implement these in the dumb version.
