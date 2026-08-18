# Miniapp Desktop-Parity UX Design

## Goal

Bring the desktop app's skill descriptions, live resolution hints, special skill controls, and trait notes into the existing phone and iPad flow without adding new top-level screens. Complex information is revealed only for the currently selected item.

## Current audit

The audit used the current H5 runtime at 390x844 and 1024x768. Evidence is stored in `artifacts/2026-08-13-holistic-ux-audit/`.

### Stable areas

- Spirit cards, nature and IV controls, ability stages, mode switch, and the result dock have a clear hierarchy.
- The skill picker has categories, search, selected state, and stable keyboard behavior.
- Battle conditions use progressive disclosure: common conditions, traits and status, marks, and advanced parameters.
- The result sheet supports in-place status, defense, and modifier activation with cancellation.
- iPad uses parallel combatant panels and a dedicated result rail.

### Remaining product gaps

1. A complex selected skill shows only name, category, power, and cost. The user cannot see its source description or how rules such as refraction, adjacent power, speed difference, or hit progression resolve now.
2. Four-skill special inputs are not fully aligned with desktop: calculation-supplied inputs, choice-trait toggles, and the Gale Turbine companion selector are missing from the miniapp edit path.
3. Refraction calculates correctly, but the miniapp does not state which carried-skill effects apply.
4. A trait with only fixed skill-power bonuses is filtered out of battle conditions. For example, the desktop note for Disc Swap is not visible.
5. Skill descriptions exist in data, but there is no shared presentation contract, so new desktop rules can drift from the miniapp.

## Selected approach

Use two levels: a compact selected-skill note on the workspace and complete editing in the result sheet.

### Main workspace

- Unselected skill rows keep their current height.
- One shared note below the skill list describes the currently selected skill instead of expanding every row.
- The note has up to two parts: source description and current resolution hint.
- Phone clamps each part to two lines. iPad may show more text without breaking the parallel panels.

### Single-skill parameters

- Keep the current parameter area because single-skill users need direct editing.
- Show description and current resolution before dynamic inputs, manual power, and hit count.
- Do not render empty groups when a skill has no extra inputs.

### Four-skill result sheet

- Do not place four sets of controls on the workspace.
- The on-demand Skill Parameters section shows the selected skill's full description, current resolution, and complete input set.
- Switching result rows switches description, hint, and controls together.

### Result actions

- Keep the action workbench as the only activation location.
- Skill actions show the full source description plus the current special-effect summary.
- Apply and cancel keep the sheet, category, and selected skill unchanged.

### Traits

- Show traits that have controls, automatic stacks, or fixed skill-power bonuses.
- Keep the desktop-source description under the trait name.
- Show automatic values as label and value; show power bonuses as compact labels such as `Sound Bullet +15`.

## Data and code boundaries

1. Move desktop `describeResolution` into a React-free shared domain function used by both frontends.
2. Add a miniapp skill-presentation view model that combines description, resolution, refraction, reflection, static inputs, status inputs, calculation inputs, choice-trait controls, and Gale Turbine controls.
3. Do not change the damage formula or season data.
4. Keep the current picker, battle-condition structure, result-action history, and safe undo behavior.

## Responsive and accessibility rules

- Use the existing visual system; no new icons or SVG assets.
- Keep at least a 44px effective touch target for interactive controls.
- Use `aria-pressed` for selection and connect the selected note to the active row. Text is supplemental, not the only selected-state signal.
- Screenshot review proves visible layout only. Keyboard, screen-reader order, and native touch require separate verification.

## Out of scope

- No new navigation, help page, or desktop-style sidebar.
- Do not put all 553 descriptions in the picker list.
- Do not keep all four skill parameter sets permanently visible.
- Do not change data version, presets, settings, or release version.

## Acceptance criteria

1. Selecting Refraction shows its source description and a carried-skill effect hint.
2. Miniapp exposes the desktop-editable special inputs for the selected skill, including choice traits and Gale Turbine.
3. Bonus-only traits such as Disc Swap appear with desktop-source notes.
4. Single mode and four-skill result details follow the same description and input rules.
5. Unselected rows remain compact, with no new overflow at 390px phone or 1024px iPad.
6. Result activation, cancellation, and result switching do not regress.
7. Core drift, desktop tests, miniapp tests, H5 build, and WeChat production build pass.
