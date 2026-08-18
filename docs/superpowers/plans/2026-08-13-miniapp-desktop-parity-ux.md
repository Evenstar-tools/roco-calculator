# Miniapp Desktop-Parity UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the miniapp presentation and edit path for desktop skill and trait rules while preserving the shortest phone flow and the iPad two-column workflow.

**Architecture:** Extract live skill resolution into a shared pure function. Build a miniapp presentation view model that combines descriptions, special hints, and dynamic inputs. Components only decide where each information layer is shown. Damage, data, and activation state machines remain unchanged.

**Tech Stack:** React 18, Taro 4.2, Vitest, Testing Library, shared ES modules.

## Task 1: Shared skill-presentation contract

**Files:**
- Create: `src/domain/skill-presentation.js`
- Modify: `src/components/SingleSkillEditor.jsx`
- Modify: `scripts/miniapp/shared-source-manifest.mjs`
- Sync: `miniapp/src/shared/domain/skill-presentation.js`
- Test: `tests/domain/skill-presentation.test.js`

- [ ] Write failing tests for speed or defense difference, adjacent power, multiplier, and unchanged branches.
- [ ] Implement React-free `describeSkillResolution(result)`.
- [ ] Reuse it from desktop while keeping the prior component export compatible.
- [ ] Sync shared core and run domain tests plus the drift gate.

## Task 2: Miniapp special inputs and presentation data

**Files:**
- Create: `miniapp/src/view-models/skill-presentation.js`
- Modify: `miniapp/src/view-models/skills.js`
- Modify: `miniapp/src/components/SkillConditionEditor.jsx`
- Test: `miniapp/tests/skill-presentation.test.js`
- Test: `miniapp/tests/skills.test.js`

- [ ] Write failing tests for refraction, reflection, result inputs, choice traits, and Gale Turbine.
- [ ] Merge and deduplicate static, derived, status, result, and special inputs.
- [ ] Show source description and current resolution before the combined controls.

## Task 3: Selected-skill information hierarchy

**Files:**
- Modify: `miniapp/src/components/SingleSkillResultRow.jsx`
- Modify: `miniapp/src/components/SkillSlots.jsx`
- Modify: `miniapp/src/components/BattleWorkspace.jsx`
- Modify: `miniapp/src/components/ResultSheet.jsx`
- Modify: `miniapp/src/pages/index/styles/skills.css`
- Modify: `miniapp/src/pages/index/styles/responsive.css`
- Test: `miniapp/tests/skill-slots.test.jsx`
- Test: `miniapp/tests/result-sheet.test.jsx`

- [ ] Write failing tests that show notes only for the selected skill while unselected rows remain compact.
- [ ] Add one shared selected-skill note to each skill panel.
- [ ] Feed the same presentation data to single-skill parameters and four-skill result parameters.
- [ ] Clamp phone text and preserve iPad panel alignment.

## Task 4: Trait notes and fixed-power bonuses

**Files:**
- Modify: `miniapp/src/components/TraitConditionEditor.jsx`
- Modify: `miniapp/src/pages/index/styles/overlays.css`
- Test: `miniapp/tests/trait-controls.test.jsx`

- [ ] Write a failing test for a trait whose only extra data is `skillPowerBonuses`.
- [ ] Show source description, automatic stacks, and compact bonus labels.
- [ ] Avoid duplicate visible or accessible copy.

## Task 5: Result-action context

**Files:**
- Modify: `miniapp/src/view-models/result-actions.js`
- Modify: `miniapp/src/components/ResultActionPanel.jsx`
- Test: `miniapp/tests/result-actions.test.js`
- Test: `miniapp/tests/result-action-panel.test.jsx`

- [ ] Add current special-effect summaries to skill actions.
- [ ] Render source description and the summary without changing in-place apply or cancel behavior.
- [ ] Verify category, scroll position, and selected result remain stable.

## Task 6: Regression and delivery

**Files:**
- Update: `artifacts/2026-08-13-holistic-ux-audit/`
- Create: `docs/verification/miniapp-desktop-parity-ux-2026-08-13.md`

- [ ] Run new focused tests red before implementation and green afterward.
- [ ] Run all miniapp tests, all desktop tests, core drift, and `git diff --check`.
- [ ] Build H5 and recheck workspace, picker, battle conditions, result sheet, and settings at 390x844 and 1024x768.
- [ ] Build the WeChat production package. If native DevTools inspection remains unavailable, record that separately and do not substitute H5 evidence.
