# touch_grass

A desktop-focused wellness and focus companion built with React, TypeScript, Tauri, and Rust.

This project is organized around a Tauri desktop app with a React front end and a Rust-powered backend for screen-time tracking, break recommendations, and app-state orchestration. It also includes Supabase configuration for persistence and notification history.

## Overview

The app appears to be a "Grounded" experience designed to:

- monitor active screen time and session state
- detect when the user has been on screen for too long
- trigger a break recommendation flow
- surface outdoor or break suggestions on a recommendation screen
- persist settings and activity history
- support dashboards, settings, and privacy views

## Tech Stack

- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2
- Backend: Rust
- Styling: Tailwind CSS
- Data persistence: Supabase
- Testing: Vitest + Playwright

## Repository Structure

```text
.
├── .env.example                # Example environment variables for Supabase
├── index.html                 # Vite app entry HTML
├── package.json               # Node scripts and dependencies
├── playwright.config.ts       # Playwright configuration
├── src/                       # React frontend source
│   ├── App.tsx                # Main app orchestration and event listeners
│   ├── components/            # Reusable UI and experience components
│   ├── pages/                 # Dashboard, settings, recommendations, etc.
│   ├── services/              # App state, backend integration, settings loading
│   ├── types/                 # Shared TypeScript types
│   ├── index.css              # Global styling and UI theme
│   └── main.tsx               # App bootstrap
├── src-tauri/                 # Rust + Tauri backend
│   ├── Cargo.toml             # Rust dependencies and metadata
│   ├── src/                   # Rust app source
│   ├── tauri.conf.json        # Tauri app config
│   └── capabilities/          # Tauri capability definitions
├── supabase/                  # Supabase schema/migrations
├── tests/                     # Test files (if used by the project)
├── tsconfig.json              # TypeScript config
├── tsconfig.node.json         # Node-specific TypeScript config
├── vite.config.ts             # Vite config
├── .gitignore                 # Git ignore settings
└── README.md                  # Project documentation
```

## Prerequisites

Before running the project locally, make sure you have:

- Node.js 18+ or newer
- npm
- Rust stable toolchain
- Tauri prerequisites for your OS
  - https://tauri.app/v1/guides/getting-started/setup/

## Environment Setup

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Update `.env` with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

## Installation

```bash
npm install
```

## Run the App

For the desktop app:

```bash
npm run tauri dev
```

For the frontend in a browser during development:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Testing

Run unit tests:

```bash
npm test
```

Run end-to-end tests:

```bash
npm run test:e2e
```

Run TypeScript checks:

```bash
npm run typecheck
```

## Notes

- The frontend listens for Tauri events such as `break_ready` and `recommendation_ready` and updates the experience state accordingly.
- The Rust backend is responsible for activity tracking and recommendation events.
- Supabase is used for data persistence and notification history.
- This repository includes both the app UI and its native desktop wrapper, so the Tauri setup is an important part of local development.

## Contributing

Contributions are welcome. If you are making UI, backend, or Tauri-related changes, please keep the project structure consistent and validate with the relevant test or type-check commands before submitting changes.

## License

No explicit project license is currently defined in the repository metadata.
