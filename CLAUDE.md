# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Prism Viewer is a web app for analyzing modded Starsector assets. It is at the early scaffold stage: a React 19 + TypeScript + Vite template with a placeholder landing page in `src/App.tsx`. There is no domain logic yet.

## Commands

- `npm run dev`: Vite dev server with HMR
- `npm run build`: type-check (`tsc -b`) then production build to `dist/`
- `npm run lint`: Oxlint (config in `.oxlintrc.json`)
- `npm run preview`: serve the built `dist/`
- `npx tsc -b`: type-check only

No test framework is set up yet.

## Toolchain notes

- The toolchain is Vite 8 with `@vitejs/plugin-react` (Oxc-based), TypeScript ~6.0, and Oxlint (not ESLint). Lint rules enforce `react/rules-of-hooks` and warn on `react/only-export-components` (component files should export only components, so Fast Refresh keeps working).
- TypeScript uses project references: `tsconfig.app.json` covers `src/` (DOM, `vite/client` types), and `tsconfig.node.json` covers `vite.config.ts`.
- Strictness flags break the build, not just the lint: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` (no `enum`, `namespace` or parameter properties; use union types or `as const` objects), and `verbatimModuleSyntax` (type-only imports must use `import type`).
- Imports include the `.tsx`/`.ts` extension (`import App from './App.tsx'`), which `allowImportingTsExtensions` permits.
- The entry point is `index.html` → `src/main.tsx` (renders `<App />` in `StrictMode`). Global styles are in `src/index.css`, and component styles are in `src/App.css`.
