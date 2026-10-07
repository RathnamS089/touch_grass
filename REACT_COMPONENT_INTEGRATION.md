# React MorphOrb component integration notes

This repository is currently a Tauri 2 + Svelte + TypeScript + Vite desktop app. It is not a React/shadcn/Tailwind app.

The provided `ai-thiking-orb-and-input.tsx` component is a React component. It cannot be pasted directly into the current Svelte app without changing the frontend framework or creating a separate React app/package.

## Recommendation

Keep the current Grounded app as Svelte for the hackathon dumb version. If you want to use the React MorphOrb component, create a separate React + shadcn + Tailwind prototype or intentionally migrate the frontend from Svelte to React.

Do not mix this React component into the current Svelte UI unless you explicitly decide to migrate away from the required Svelte stack.

## If creating a separate React prototype

From a separate directory, run:

```bash
npm create vite@latest grounded-react-orb -- --template react-ts
cd grounded-react-orb
npm install
npx shadcn@latest init
```

When prompted by shadcn, use the default component path:

```text
components/ui
```

If your project does not already use `/components/ui`, create it. shadcn conventions expect reusable UI primitives and copy-paste components to live there. Keeping this path avoids import mismatches like:

```tsx
import MorphOrb from "@/components/ui/ai-thiking-orb-and-input";
```

## Tailwind setup

If shadcn did not configure Tailwind automatically, follow the shadcn CLI prompts or install Tailwind manually for your Vite React project.

For Tailwind 4, your main CSS file can start with:

```css
@import "tailwindcss";
@import "tw-animate-css";
```

Then append the MorphOrb keyframes/classes from the provided prompt.

For Tailwind 3, configure `tailwind.config.js` content paths and put the CSS in `src/index.css` or `src/globals.css`.

## Dependencies from the provided component

The component itself uses:
- React
- TypeScript
- Browser DOM APIs
- Canvas API
- CSS from `../../index.css`

It does not require lucide-react because the SVG icons are inline. Do not install lucide-react unless you replace those inline SVGs.

The prompt mentions `tw-animate-css`; install it only if your copied CSS imports it:

```bash
npm install tw-animate-css
```

## Files to add in a React project

Create:

```text
components/ui/ai-thiking-orb-and-input.tsx
src/demo.tsx
src/index.css
```

Use the provided component code in:

```text
components/ui/ai-thiking-orb-and-input.tsx
```

Use the provided demo code in:

```text
src/demo.tsx
```

Make sure your alias `@` points to the project root or `src`, depending on your shadcn setup. If the alias points to `src`, the component path should be:

```text
src/components/ui/ai-thiking-orb-and-input.tsx
```

and the import should remain:

```tsx
import MorphOrb from "@/components/ui/ai-thiking-orb-and-input";
```

## Questions to answer before integration

1. What app should receive this component: the current Svelte/Tauri Grounded app, or a separate React prototype?
2. What props should be passed to `MorphOrb.onSubmit`?
3. Should the answer be mocked locally or connected to a later model/backend?
4. Where should it appear: full-screen landing view, dashboard card, command palette, or break intervention screen?
5. What responsive behavior is expected on small desktop windows?
6. Are there any required assets? The current component uses no external image assets.

## Running a separate React prototype

```bash
npm install
npm run dev
```

Then open the local Vite URL.

## Running the current Grounded Svelte/Tauri app

From this repository:

```bash
. "$HOME/.cargo/env"
npm run tauri dev
```

Build:

```bash
. "$HOME/.cargo/env"
npm run tauri build
```

## Important compatibility note

The current project was built to satisfy the original requirement: Tauri 2 + Svelte + TypeScript + Vite. Adding React, shadcn, and Tailwind here would violate that original stack constraint unless the product direction has changed.
