# Miniapp Share Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved two-stage share preview and isolated receiver snapshot flow without overwriting the receiver's remembered calculator state before consent.

**Architecture:** Extend the pure share codec to report validity and completeness. Keep share-session lifecycle in the index page, render sender and receiver UI in focused components, and reuse the existing calculation view model and spirit assets. Autosave remains unchanged for normal sessions and is gated off only during read-only share preview.

**Tech Stack:** React 18, Taro 4.2, Vitest, Testing Library, CSS modules by page bundle, WeChat `openType="share"`.

## Global Constraints

- Preserve the existing self-contained Base64URL path and maximum encoded payload length of 899 characters.
- Do not change damage formulas, season data, spirit assets, or existing configuration-library behavior.
- Receiver preview must not write to local persistence.
- Phone touch targets are at least 44px and fixed actions respect safe-area insets.
- Reuse current attacker red, defender blue, result thresholds, typography, borders, and radii.
- Do not create SVG, CSS-drawn assets, dynamic report images, cloud storage, share history, or new top-level routes.

---

### Task 1: Structured share codec result

**Files:**
- Modify: `miniapp/src/share/payload.js`
- Test: `miniapp/tests/share-payload.test.js`

**Interfaces:**
- Produces: `encodeSharePayloadWithMeta(state) -> { encoded, completeness }`
- Produces: `decodeSharePayloadResult(encoded, snapshot) -> { status, completeness, state }`
- Preserves: `encodeSharePayload(state)` and `decodeSharePayload(encoded, snapshot)` compatibility wrappers.

- [ ] Write failing tests asserting full, reduced, minimal, repaired, and invalid results.
- [ ] Run `npm --prefix miniapp test -- --run tests/share-payload.test.js` and confirm failures are caused by the missing structured APIs.
- [ ] Add metadata without changing the encoded payload contract or privacy filter.
- [ ] Keep legacy wrappers returning the same values expected by existing callers.
- [ ] Run the targeted test and confirm all share codec tests pass.

### Task 2: Isolated share-session lifecycle

**Files:**
- Modify: `miniapp/src/pages/index/index.jsx`
- Test: `miniapp/tests/index-page.test.jsx`
- Test: `miniapp/tests/app-shell.test.jsx`

**Interfaces:**
- Consumes: `decodeSharePayloadResult`.
- Produces page state: `shareSession: { status, completeness, originalState, sharedState } | null`.
- Produces handlers: `continueSharedCalculation()`, `returnToLocalCalculation()`, `restoreSharedSnapshot()`.

- [ ] Write a failing test that opening a valid share renders preview and does not call persistence save.
- [ ] Write a failing test that returning restores the local persisted state.
- [ ] Write a failing test that continuing enables autosave for the shared working state.
- [ ] Write a failing test that invalid payloads render an explicit error instead of defaults.
- [ ] Implement the minimum lifecycle and autosave gate.
- [ ] Run the two page test files and confirm all lifecycle tests pass.

### Task 3: Sender share preview

**Files:**
- Create: `miniapp/src/components/SharePreviewSheet.jsx`
- Modify: `miniapp/src/components/ResultSheet.jsx`
- Modify: `miniapp/src/pages/index/styles/overlays.css`
- Modify: `miniapp/src/pages/index/styles/responsive.css`
- Test: `miniapp/tests/share-preview.test.jsx`
- Test: `miniapp/tests/result-sheet.test.jsx`

**Interfaces:**
- Consumes: current calculation view, state-derived completeness, pet images, and native share message.
- Produces: close action and `Button openType="share"`.

- [ ] Write failing tests for exact-result copy, unresolved configuration copy, inclusion summary, reduced warning, close, and native share action.
- [ ] Run the sender tests and verify the intended assertions fail.
- [ ] Implement the compact preview using existing result formatting and assets.
- [ ] Keep the result-sheet action fixed and above the safe area.
- [ ] Run the sender tests and confirm they pass.

### Task 4: Receiver shared-result page

**Files:**
- Create: `miniapp/src/components/SharedResultPage.jsx`
- Create: `miniapp/src/view-models/share-summary.js`
- Modify: `miniapp/src/pages/index/index.jsx`
- Modify: `miniapp/src/pages/index/styles/base.css`
- Modify: `miniapp/src/pages/index/styles/overlays.css`
- Modify: `miniapp/src/pages/index/styles/responsive.css`
- Test: `miniapp/tests/share-summary.test.js`
- Test: `miniapp/tests/shared-result-page.test.jsx`

**Interfaces:**
- Consumes: snapshot, shared state, calculation view, pet images, completeness, and decode status.
- Produces: matchup, result, skill comparison, compact side summaries, non-default battle state, collapsed calculation entry, and the two fixed decisions.

- [ ] Write failing view-model tests for nature, non-default IVs, ability stages, current HP, and non-default conditions.
- [ ] Write failing component tests for exact, unresolved, single, four, reduced, repaired, and invalid displays.
- [ ] Run the new tests and verify failures are caused by missing components and summaries.
- [ ] Implement the view model and page with real project assets.
- [ ] Run both new test files and confirm they pass.

### Task 5: Active share-derived context and native title

**Files:**
- Create: `miniapp/src/components/SharedSessionStrip.jsx`
- Modify: `miniapp/src/components/BattleWorkspace.jsx`
- Modify: `miniapp/src/pages/index/index.jsx`
- Modify: `miniapp/src/share/payload.js`
- Modify: `miniapp/src/pages/index/styles/base.css`
- Test: `miniapp/tests/shared-session.test.jsx`
- Test: `miniapp/tests/share-payload.test.js`

**Interfaces:**
- Consumes: active share session and original shared state.
- Produces: `正在基于好友分享调整`, restore action, and exact share title including HP percentage.

- [ ] Write failing tests for active context, restore behavior, re-share state, exact title, and unresolved title.
- [ ] Run targeted tests and confirm expected failures.
- [ ] Implement the strip, restore handler, and title formatting.
- [ ] Run targeted tests and confirm they pass.

### Task 6: Full regression, visual QA, and native verification

**Files:**
- Create: `artifacts/2026-08-14-share-flow-qa/design-qa.md`
- Create screenshots under: `artifacts/2026-08-14-share-flow-qa/`

**Interfaces:**
- Consumes all prior tasks.
- Produces fresh test, build, screenshot, and native-share evidence.

- [ ] Run the share-focused tests and all miniapp tests.
- [ ] Run the H5 production build and WeChat production build.
- [ ] Capture sender preview, receiver preview, active share-derived state, reduced warning, invalid state, phone layout, and iPad layout.
- [ ] Compare sender and receiver screenshots with the selected references at matching states and record P0-P3 findings.
- [ ] Fix all P0-P2 findings and repeat capture until `design-qa.md` says `final result: passed`.
- [ ] Test native sharing to another WeChat account or group and verify the receiver opens the isolated snapshot.
- [ ] Run `git diff --check` and review only request-related changes before handoff.
