# Miniapp Share Flow Design

## Goal

Make sharing a current battle result deliberate for the sender and immediately understandable for the receiver, while never overwriting the receiver's remembered calculator state until they explicitly choose to continue from the shared snapshot.

## Selected references

- Sender preview: `artifacts/2026-08-14-share-flow-design/sender-share-preview-reference.png`
- Receiver snapshot: `artifacts/2026-08-14-share-flow-design/receiver-share-snapshot-reference.png`

These references define hierarchy, spacing intent, attacker red, defender blue, result-state colors, warm white surfaces, restrained borders, and the use of real spirit images. Implementation must reuse existing project assets and components rather than rasterizing UI text or controls.

## Selected approach

Use a two-stage flow.

1. The sender reviews a compact share preview, then invokes the native WeChat share action.
2. The receiver opens a read-only shared snapshot. The snapshot is isolated from local persistence until the receiver explicitly chooses to continue calculating from it.

## Sender flow

### Entry

- Keep sharing inside the existing result sheet.
- The fixed action label is `分享此结果` when the selected result is exact.
- When no result is resolved, the label is `分享当前配置`.
- The action remains reachable above the phone safe area and does not require scrolling to the formula tail.

### Preview sheet

The preview opens above the result sheet and contains:

1. `分享当前计算` heading and close action.
2. Attacker and defender portraits, names, and elements.
3. Selected skill, total damage, HP percentage, remaining HP, and state-colored HP bar when exact.
4. A compact inclusion summary for both configurations, skills and skill parameters, ability stages, traits, marks, weather, and battle context.
5. A completeness notice. Full snapshots show `完整配置将随分享发送`; reduced snapshots show `部分复杂参数将按默认值打开`.
6. `取消` and native `发送给好友` actions.

The native action uses `openType="share"`. No custom success toast is shown because the mini program cannot reliably prove the final recipient action.

## Receiver flow

### Snapshot isolation

- A valid share payload creates `shareSnapshot` and `shareStatus: "preview"`.
- The remembered local state is loaded separately as `localState`.
- Autosave is disabled while `shareStatus` is `preview`.
- Closing or choosing `返回我的配置` restores `localState` without writing the shared state.
- Choosing `用此配置继续计算` changes `shareStatus` to `active`; the shared store becomes the current working state and normal configuration memory resumes.

### Receiver page hierarchy

The receiver sees a dedicated page state on the existing index route:

1. Green status band: `好友分享快照 · 已载入` and `本次预览不会覆盖你的本机配置`.
2. Compact matchup header with real spirit portraits, attacker and defender labels, names, elements, and selected skill.
3. Result summary with selected damage, HP percentage, remaining HP, and the same green/yellow/red thresholds used elsewhere.
4. Four-skill comparison when in four-skill mode; the selected result is highlighted. Single-skill mode shows only the current skill.
5. Configuration summary for both sides: nature, non-default IV summary, relevant attack or defense ability stage, and current target HP.
6. Battle-state summary that only lists non-default weather, marks, trait values, triggers, hit count, manual power, reduction, or multiplier. Empty state reads `无额外战斗条件`.
7. Collapsed `查看计算过程` entry.
8. Fixed actions: `返回我的配置` and `用此配置继续计算`.

### Active share-derived session

After continuing, render the normal calculator with a compact context strip: `正在基于好友分享调整`. The strip provides `恢复原分享` while the page remains open. Re-sharing produces a fresh snapshot from the current edited state.

## Payload and compatibility

- Preserve the self-contained, serverless Base64URL payload and the 899-character budget.
- Encoding must return completeness metadata: `full`, `reduced`, or `minimal`.
- Decoding must return a structured result: `valid`, `repaired`, or `invalid`, plus the decoded state and completeness metadata.
- Invalid shares never silently fall back to the default calculator. Show `分享内容无法读取` with one action: `打开我的计算器`.
- Older supported payloads show `部分参数已按当前版本修复`.
- A share without an exact result remains shareable as configuration, without displaying invented damage.
- No identity, account, avatar URL, secret, or unsupported context field is included.

## Native share content

- Exact result title: `{攻击方} → {防守方}｜{技能} {伤害}伤害（{百分比}% HP）` within the platform limit.
- Unresolved title: `{攻击方} → {防守方}｜计算配置`.
- Keep a static product share image optional; do not block this version on dynamic image generation.

## Responsive rules

- Phone: single-column, 16px page inset, 12px radii, minimum 44px touch targets, fixed actions above the safe area.
- iPad: matchup and result summary may share a top row; skill comparison and configuration summary may use two columns. Do not stretch phone cards across the full width.
- Red and blue are always accompanied by attacker and defender labels.
- Result colors use the existing thresholds: green below 20%, yellow from 20% through 50%, red above 50%.

## Error and empty states

1. Invalid or unsupported payload: explicit error page, no local state mutation.
2. Repaired payload: visible compatibility note; allow preview and continue.
3. Reduced payload: visible completeness warning before sender shares and on receiver preview.
4. Missing selected skill: configuration-share presentation instead of a damage result.
5. Missing current data ID: repair to valid current defaults and mark the snapshot as repaired.

## Out of scope

- No cloud storage, share history, sender identity, expiring server token, dynamic report image, or new top-level route.
- No changes to damage formulas or season data.
- No automatic import into the receiver's saved configuration library.

## Acceptance criteria

1. The sender can preview exactly what will be shared before opening the native share menu.
2. The receiver sees a complete readable battle report before entering the calculator.
3. Opening or closing a share does not overwrite remembered local state.
4. Autosave begins only after `用此配置继续计算`.
5. Returning from preview restores the exact prior local state.
6. Invalid and repaired payloads are distinguishable and never silently masquerade as defaults.
7. Full, reduced, minimal, single-skill, four-skill, exact-result, and unresolved-result states are tested.
8. Phone and iPad layouts have no clipping, overflow, hidden fixed actions, or unsafe-area overlap.
9. Native WeChat sharing is verified on a real device in addition to H5 and unit tests.
