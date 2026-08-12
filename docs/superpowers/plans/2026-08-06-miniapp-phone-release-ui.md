# Miniapp Phone Release UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the WeChat mini program phone portrait screen to match the confirmed mobile design and reach a stable release baseline.

**Architecture:** Keep the existing Taro/React data flow and calculator store. Adjust only phone-facing component markup where the current grid is structurally wrong, then replace the final mobile CSS override with one authoritative `max-width: 767px` layout. Preserve tablet media queries and release packaging.

**Tech Stack:** React 18, Taro 4.2.1, CSS, Vitest, Playwright release layout gate.

## Global Constraints

- Miniapp version remains `0.1.1`; web version remains `1.4.3`.
- Do not change calculator, persistence, preset-import, or sharing behavior.
- Keep iPad/tablet layout unchanged.
- Main WeChat package must remain below 2 MiB.
- Use real existing pet, element, and stat assets; do not add placeholder art.

---

### Task 1: Lock phone structure with component tests

**Files:**
- Modify: `miniapp/tests/workspace-responsive.test.jsx`
- Modify: `miniapp/tests/spirit-picker.test.jsx`
- Modify: `miniapp/tests/result-sheet.test.jsx`

**Interfaces:**
- Consumes: `BattleWorkspace`, `SpiritPicker`, `ResultBar`.
- Produces: regression expectations for compact mode labels, card-driven pet selection, inline skill metadata, and non-obstructive phone result markup.

- [ ] Add assertions for short mode labels and one active phone skill panel.
- [ ] Add assertions that a compact spirit card can open its search without a visible “更换” button.
- [ ] Add assertions that skill metadata stays grouped with the skill name and the result action remains available.
- [ ] Run the focused tests and confirm they fail for the old markup.

### Task 2: Fix phone interaction markup

**Files:**
- Modify: `miniapp/src/components/CombatantCard.jsx`
- Modify: `miniapp/src/components/SpiritPicker.jsx`
- Modify: `miniapp/src/components/ModeSwitch.jsx`
- Modify: `miniapp/src/components/SkillPicker.jsx`

**Interfaces:**
- `SpiritPicker({ open, onOpenChange, hideTrigger, ... })` supports card-driven opening while retaining existing desktop trigger behavior.
- `ModeSwitch` renders short and long labels so CSS can choose by breakpoint.
- `SkillPicker` keeps name and metadata in one copy column.

- [ ] Make compact combatant summaries open the correct picker and activate the corresponding direction.
- [ ] Preserve search, selection, favorite ordering, and controlled/uncontrolled picker behavior.
- [ ] Add breakpoint-safe short mode copy.
- [ ] Move skill metadata into the skill-copy column.
- [ ] Run focused component tests until they pass.

### Task 3: Replace the phone visual system

**Files:**
- Modify: `miniapp/src/pages/index/index.css`

**Interfaces:**
- Phone breakpoint: `@media (max-width: 767px)`.
- Narrow fallback: `@media (max-width: 359px)`.

- [ ] Normalize phone page typography, line height, padding, dividers, and color tokens.
- [ ] Rebuild the duel region with large real pet art, stable name/type alignment, and a centered switch control.
- [ ] Rebuild nature/IV rows with six evenly aligned real stat icons and restrained selected states.
- [ ] Rebuild the mode switch and skill rows so metadata remains horizontal.
- [ ] Change the mobile result bar from fixed overlay to an in-flow result card.
- [ ] Keep conditions, dialogs, search results, and all key controls above 44 px high.

### Task 4: Browser and release verification

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Preview: `http://127.0.0.1:4173/#/pages/index/index`.
- Reference: confirmed 426 × 922 normalized phone design.

- [ ] Build H5 and refresh the local preview.
- [ ] Capture 320, 375, 390, and 430 px phone states.
- [ ] Test pet selection, direction switching, mode switching, skill selection, conditions, and result details.
- [ ] Compare the confirmed reference and the 426 px implementation in one visual input.
- [ ] Fix every P0/P1/P2 issue and repeat the comparison.
- [ ] Run all 206 miniapp tests, portrait safe-area gate, WeChat build, release gate, and `git diff --check`.
- [ ] Update `design-qa.md` to `final result: passed` only after all checks succeed.

