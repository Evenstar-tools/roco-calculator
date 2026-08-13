# Mini-program Reference Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the approved quick-configuration visual system on phone and iPad and add repeatable asset, layout, interaction, and native-runtime gates.

**Architecture:** Keep the current Taro component structure. Change only the quick-control rendering, its CSS, trusted raster control assets, and verification scripts/tests. Existing stat silhouettes and calculator state remain unchanged.

**Tech Stack:** Taro/React, Vitest/Testing Library, CSS, Phosphor Icons rendered to PNG, existing Playwright viewport/interaction probes, WeChat Developer Tools.

## Global Constraints

- Mini-program version stays `0.1.1`; web core stays `1.4.3`.
- No cloud development dependency.
- No visible SVG, emoji, text-symbol, CSS-drawn, or handcrafted icon substitute.
- Keep `miniapp/project.config.json` and unrelated `artifacts/` changes out of commits.
- Native WeChat runtime is the final local completion gate.

---

### Task 1: Lock the quick-control visual contract

**Files:**
- Modify: `miniapp/tests/portrait-css.test.js`
- Modify: `miniapp/tests/workspace-responsive.test.jsx`
- Test: `miniapp/tests/portrait-css.test.js`
- Test: `miniapp/tests/workspace-responsive.test.jsx`

**Interfaces:**
- Consumes: `QuickCombatantControls({ configuration, onIvChange, onNatureChange, side })`
- Produces: test contract for six equal captioned stat controls and persistent selected states

- [ ] Add assertions that the axis row is absent, captions are rendered inside each button, and selected nature/IV states expose the correct raster badge.
- [ ] Run the focused tests and confirm they fail because the old axis row and hidden captions remain.

### Task 2: Implement measured quick controls

**Files:**
- Modify: `miniapp/src/components/QuickCombatantControls.jsx`
- Modify: `miniapp/src/pages/index/styles/parameters.css`
- Modify: `miniapp/src/pages/index/styles/responsive.css`
- Create: `miniapp/src/assets/icons/status-up.png`
- Create: `miniapp/src/assets/icons/status-check.png`

**Interfaces:**
- Consumes: `QUICK_STATS`, `STAT_LABELS`, `StatIcon`, existing change callbacks
- Produces: two aligned rows with direct captions and raster selected-state badges

- [ ] Remove the independent axis row.
- [ ] Render icon, caption, and state badge inside each equal-width button.
- [ ] Make unselected buttons frameless and selected buttons use fill plus inset edge without geometry shift.
- [ ] Preserve selected-nature re-tap reset and IV 0/60 toggle behavior.
- [ ] Run focused tests until green.

### Task 3: Normalize trusted control assets and verify them

**Files:**
- Create: `scripts/miniapp/render-control-icons.mjs`
- Create: `scripts/miniapp/verify-ui-assets.py`
- Modify: `miniapp/src/assets/icons/arrows-left-right.png`
- Modify: `miniapp/src/assets/icons/caret-right.png`
- Modify: `miniapp/src/components/DirectionSwitch.jsx`
- Modify: `miniapp/src/components/ResultBar.jsx`
- Modify: `miniapp/tests/portrait-css.test.js`

**Interfaces:**
- Consumes: `@phosphor-icons/react`, React server rendering, bundled Sharp at generation time
- Produces: transparent 3x PNG controls and an alpha-bound/clipping audit

- [ ] Add failing asset provenance/dimension/mode assertions.
- [ ] Render ArrowsLeftRight, CaretRight, ArrowUp, and Check from the trusted library to PNG.
- [ ] Verify all control PNG dimensions, alpha bounds, and edge clearance.
- [ ] Use `aspectFit` for every control asset and rerun tests.

### Task 4: Run visual and interaction gates

**Files:**
- Modify: `scripts/miniapp/verify-interaction-matrix.mjs` only if a missing core state is found
- Modify: `scripts/miniapp/verify-portrait-layout.mjs` only if a missing geometry assertion is found
- Update: `design-qa.md`

**Interfaces:**
- Consumes: H5 preview fixture and production app state
- Produces: six viewport screenshots, selected/reset states, and interaction results

- [ ] Build the H5 fixture and run 320/375/390/430/820/1024 layout probes.
- [ ] Run phone and iPad interaction matrices, including selected-state/reset evidence.
- [ ] Compare the quick-control reference and actual screenshots together; fix every visible target-state mismatch.
- [ ] Run the full mini-program and core test suites.

### Task 5: Prove the production mini-program

**Files:**
- Update: `design-qa.md`

**Interfaces:**
- Consumes: production WeChat build
- Produces: build hash/size and real Developer Tools screenshots

- [ ] Run the production build and release verifier.
- [ ] Start the real WeChat Developer Tools project and verify startup, nature select/reset, IV select, and core navigation.
- [ ] Capture native phone evidence and record the exact verification boundary.
- [ ] Review the intended diff, commit only request-traceable files, and leave local config/artifacts unstaged.
