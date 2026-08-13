# Desktop Promotion Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline 193-spirit popular configuration import and a clear data-source dialog to the existing desktop settings menu.

**Architecture:** Store the supplied configuration library as a lazy-loaded public JSON asset. Reuse the existing configuration-library parser, preview UI, and atomic importer so the built-in library has exactly the same validation and persistence behavior as file import. Add a focused data-source dialog beside the existing overlay components.

**Tech Stack:** React 19, Vitest, Testing Library, Vite, Electron.

## Global Constraints

- Do not change damage calculations, team storage, sharing format, or current configuration state.
- Do not add runtime dependencies.
- The built-in library must be available offline and load only after the user opens it.
- Existing dirty user changes must remain intact.

---

### Task 1: Lock the built-in library contract

**Files:**
- Create: `public/data/presets/pvp-popular-configs.json`
- Test: `tests/state/popular-config-library.test.js`

**Interfaces:**
- Consumes: `parseFavoriteConfigLibrary(json, options)` and `public/data/runtime.json`.
- Produces: a versioned library with exactly 193 source entries that current data can parse.

- [ ] Write a failing test that reads the asset, checks the format and entry count, and parses it against the current runtime snapshot.
- [ ] Run the targeted test and verify it fails because the asset is absent.
- [ ] Copy the approved user JSON into the public preset directory without changing its payload.
- [ ] Run the test and verify that all valid entries are available for import and no unsupported schema is reported.

### Task 2: Add popular-library preview to the existing dialog

**Files:**
- Modify: `src/components/ConfigLibraryDialog.jsx`
- Modify: `src/styles.css`
- Test: `tests/ui/config-library-dialog.test.jsx`

**Interfaces:**
- Consumes: `mode="popular"`, `parsed`, `snapshot`, and `onConfirmImport`.
- Produces: title, offline-library summary, real preview metrics, expandable spirit/skill list, and import confirmation.

- [ ] Write a failing component test for the popular mode title, 193 count, preview metrics, list toggle, warning copy, and confirm button.
- [ ] Run the targeted test and verify the missing popular UI fails.
- [ ] Refactor the existing entry list into a shared rendering path for export and popular import.
- [ ] Add compact popular-mode styling and responsive rules.
- [ ] Run the component test and verify it passes.

### Task 3: Wire lazy loading and atomic import

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/WorkspaceOverlays.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: `/data/presets/pvp-popular-configs.json`, `storedData.previewFavoriteConfigLibrary`, and `storedData.importFavoriteConfigLibrary`.
- Produces: `openPopularConfigLibrary()` and the menu action `onPopularConfigLibrary`.

- [ ] Write a failing integration test that opens the menu, loads the preset only on click, shows a real preview, confirms import, and leaves teams untouched.
- [ ] Run the targeted test and verify it fails because the menu action does not exist.
- [ ] Add the menu entry and lazy fetch with explicit loading/error states.
- [ ] Feed the parsed result into the existing atomic import callback and refresh stored UI state through the current hook.
- [ ] Run the integration test and verify it passes.

### Task 4: Add data-source and feedback details

**Files:**
- Create: `src/components/DataSourceDialog.jsx`
- Modify: `src/components/WorkspaceOverlays.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Test: `tests/ui/workspace-overlays.test.jsx`
- Test: `tests/ui/app-integration.test.jsx`

**Interfaces:**
- Consumes: menu action `onShowDataSource`, close callback, clipboard API, and toast callback.
- Produces: accessible `数据来源` dialog with BWIKI link and copyable QQ `1215583051`.

- [ ] Write failing tests for opening, closing, link target, QQ text, and copy feedback.
- [ ] Run the tests and verify they fail because the dialog is absent.
- [ ] Implement the focused dialog and connect it to the menu/overlay state.
- [ ] Run the tests and verify they pass.

### Task 5: Desktop and regression verification

**Files:**
- Modify only files required by failures traced to this feature.

- [ ] Run `npm test` and fix only request-related regressions.
- [ ] Run `npm run e2e`.
- [ ] Run `npm run build` and verify the preset JSON exists under `dist/client/data/presets/`.
- [ ] Launch the built UI, capture the two dialogs at a desktop viewport, and compare them with the approved effect images.
- [ ] Run `git diff --check` and confirm unrelated dirty work remains preserved.
