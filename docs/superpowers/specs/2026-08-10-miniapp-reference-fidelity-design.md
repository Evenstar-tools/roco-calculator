# Mini-program Reference Fidelity Design

## Goal

Make the phone and iPad quick-configuration surface match the approved visual direction as an implementation, not an element inventory, and turn the same checks into repeatable project gates.

## Source of truth

- Quick-control reference: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-bdad7da8-72ee-407b-93ec-2ab0c2073321.png`
- Full phone/iPad direction: `C:/Users/Administrator/.codex/generated_images/019fab9b-05ae-77c2-9eb0-b738051cb220/exec-e12d7255-c16e-451d-aff1-fed2f9bd3048.png`
- Current native evidence: `artifacts/2026-08-10-frameless-controls/wechat-main-screen.png`

## Visual contract

- The quick control is one fixed text column plus six equal stat columns.
- There is no visible neutral/“普通” button. Re-tapping the selected positive nature returns to neutral.
- Each stat control shows the real raster icon with its label directly below it; there is no separate axis-label row.
- Unselected controls are frameless. Selected controls use a pale green fill, a stable inset edge, and a real raster state badge without changing width.
- Nature and IV rows share the same column tracks, icon slots, captions, and optical alignment.
- IV buttons do not show `60`; the compact summary may describe the configuration.
- All controls remain at least 44 px touch targets and expose persistent selected plus pressed feedback.
- Direction and result-arrow icons come from a trusted icon library, are exported as transparent PNG at 3x, and use `aspectFit`.

## Asset contract

- Keep the six existing stat PNGs because their silhouettes match the approved game-oriented reference.
- Generate standard control icons from `@phosphor-icons/react`; do not hand-draw SVG paths.
- Verify dimensions, alpha bounds, transparent padding, clipping, and final-size sharpness.
- Replacing an extension is not a fix: regenerate the asset from the trusted source.

## Responsive contract

- Phone widths: 320, 375, 390, and 430 px; no horizontal overflow or clipped labels.
- iPad widths: 820 and 1024 px; both sides remain aligned and dense.
- Reference/actual comparison uses the same viewport, data, and selected state.

## Interaction contract

- Nature selection, re-tap reset, IV toggle, side switching, single/four skill switching, search open/dismiss, conditions, details, and result sheet remain functional.
- H5 is an iteration gate only. Production WeChat build and real Developer Tools startup/interaction are the final local gate.

## Evidence contract

Delivery must include automated tests, six-viewport layout checks, phone/iPad interaction checks, reference/actual comparison images, production build size/hash, and native WeChat screenshots. Upload/review/public release remain separate.
