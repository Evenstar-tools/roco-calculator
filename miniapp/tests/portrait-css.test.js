import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function readSource(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const pageCss = readSource("src/pages/index/index.css");
const tokensCss = readSource("src/styles/tokens.css");
const styleFiles = [
  "base.css",
  "duel.css",
  "parameters.css",
  "skills.css",
  "overlays.css",
  "share.css",
  "responsive.css",
];
const styles = Object.fromEntries(
  styleFiles.map((file) => [
    file,
    readSource(`src/pages/index/styles/${file}`),
  ]),
);
const allCss = [pageCss, tokensCss, ...Object.values(styles)].join("\n");
const appHeaderSource = readSource("src/components/AppHeader.jsx");
const battleWorkspaceSource = readSource("src/components/BattleWorkspace.jsx");
const directionSwitchSource = readSource("src/components/DirectionSwitch.jsx");
const conditionFieldSource = readSource("src/components/ConditionField.jsx");
const quickControlsSource = readSource("src/components/QuickCombatantControls.jsx");
const resultSheetSource = readSource("src/components/ResultSheet.jsx");

describe("reference-first responsive CSS", () => {
  test("loads shared tokens before the ordered style modules", () => {
    expect(pageCss.trim()).toBe(
      [
        '@import "../../styles/tokens.css";',
        ...styleFiles.map((file) => `@import "./styles/${file}";`),
      ].join("\n"),
    );
  });

  test("uses a warm neutral palette without purple or decorative gradients", () => {
    expect(tokensCss).toContain("--surface-page: #f4f2ed");
    expect(allCss).not.toMatch(/linear-gradient|radial-gradient/iu);
    expect(allCss).not.toMatch(/#7c3aed|#7457d7|#f4f0ff/iu);
  });

  test("keeps the compact result dock SVG-free with explicit three-state colors", () => {
    expect(
      existsSync(resolve(process.cwd(), "src/assets/icons/caret-right.svg")),
    ).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), "src/assets/icons/caret-down.svg")),
    ).toBe(false);
    expect(styles["skills.css"]).toContain("--result-success: #218663");
    expect(styles["skills.css"]).toContain("--result-warning: #d87500");
    expect(styles["skills.css"]).toContain("--result-danger: #d74238");
  });

  test("keeps quick controls free of embedded IV numbers and text-only detail actions", () => {
    expect(quickControlsSource).not.toContain("quick-controls__iv-value");
    expect(styles["parameters.css"]).not.toContain(".quick-controls__iv-value");
    expect(battleWorkspaceSource).not.toContain("数值调整");
  });

  test("places each stat caption and raster state badge inside its measured control", () => {
    const parameters = styles["parameters.css"];

    expect(quickControlsSource).not.toContain("quick-controls__axis");
    expect(quickControlsSource).toContain('import statusUpIcon from "../assets/icons/status-up.png"');
    expect(quickControlsSource).toContain('import statusCheckIcon from "../assets/icons/status-check.png"');
    expect(quickControlsSource).toContain('className="quick-controls__stat-label"');
    expect(quickControlsSource).toContain('className="quick-controls__status-badge quick-controls__status-badge--nature"');
    expect(quickControlsSource).toContain('className="quick-controls__status-badge quick-controls__status-badge--iv"');
    expect(parameters).toMatch(/\.quick-controls__option\s*\{[\s\S]*flex-direction:\s*column/u);
    expect(parameters).toMatch(/\.quick-controls__stat-label\s*\{[\s\S]*display:\s*block/u);
    expect(parameters).toMatch(/\.quick-controls__status-badge\s*\{[\s\S]*position:\s*absolute/u);
    expect(parameters).toMatch(/\.quick-controls__option--selected\s*\{[\s\S]*box-shadow:\s*inset/u);
    expect(parameters).toMatch(/\.quick-controls__status-badge\s*>\s*img\s*\{[\s\S]*inset:\s*0[\s\S]*transform:\s*none/u);
    expect(styles["duel.css"]).toMatch(/\.direction-switch__icon\s*>\s*img\s*\{[\s\S]*inset:\s*0[\s\S]*transform:\s*none/u);
    expect(styles["skills.css"]).toMatch(/\.result-bar__action-icon\s*>\s*img\s*\{[\s\S]*inset:\s*0[\s\S]*transform:\s*none/u);
  });

  test("uses one fixed label column and six frameless equal-width controls", () => {
    const parameters = styles["parameters.css"];
    expect(quickControlsSource).toContain(
      '<Text className="quick-controls__row-label">性格</Text>',
    );
    expect(quickControlsSource).not.toContain("普通性格");
    expect(quickControlsSource).not.toContain("quick-controls__option--neutral");
    expect(parameters).toMatch(/\.quick-controls__option--stat\s*\{[\s\S]*width:\s*100%[\s\S]*margin:\s*0[\s\S]*border:\s*0[\s\S]*background:\s*transparent/u);
    expect(parameters).toMatch(/\.quick-controls__option--stat::after\s*\{[\s\S]*border:\s*0/u);
    expect(parameters).toMatch(/\.quick-controls__option--selected\s*\{[\s\S]*background:\s*var\(--success-soft\)/u);
  });

  test("uses raster assets for every mini-program control icon", () => {
    expect(
      existsSync(resolve(process.cwd(), "src/assets/icons/arrows-left-right.svg")),
    ).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), "src/assets/icons/arrows-left-right.png")),
    ).toBe(true);
    expect(directionSwitchSource).toContain("arrows-left-right.png");
    expect(directionSwitchSource).not.toContain(".svg");
    expect(directionSwitchSource).toContain('mode="aspectFit"');
    expect(existsSync(resolve(process.cwd(), "src/assets/icons/status-up.png"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/assets/icons/status-check.png"))).toBe(true);
  });

  test("keeps modal headings readable without wrapped or merged labels", () => {
    const overlays = styles["overlays.css"];
    const sharedCloseRule = overlays.match(
      /\.skill-picker__close,[\s\S]*?\.result-sheet__close\s*\{([\s\S]*?)\}/u,
    )?.[1] ?? "";
    expect(appHeaderSource).toContain('className="settings-sheet__title"');
    expect(battleWorkspaceSource).toContain('className="conditions-sheet__heading"');
    expect(overlays).toMatch(/\.settings-sheet__heading[\s\S]*display:\s*grid/u);
    expect(overlays).toMatch(/\.settings-sheet__close\s*\{[\s\S]*width:\s*auto[\s\S]*flex:\s*0\s+0\s+auto/u);
    expect(overlays).toMatch(/\.settings-sheet__switch\s*\{[\s\S]*width:\s*52px[\s\S]*height:\s*44px[\s\S]*flex:\s*0\s+0\s+52px/u);
    expect(overlays).toMatch(/\.settings-sheet__switch::before\s*\{[\s\S]*pointer-events:\s*none/u);
    expect(overlays).toMatch(/\.settings-sheet__switch-thumb\s*\{[\s\S]*pointer-events:\s*none/u);
    expect(overlays).toMatch(/\.conditions-sheet__heading[\s\S]*display:\s*grid/u);
    expect(sharedCloseRule).toMatch(/margin:\s*0/u);
  });

  test("keeps real image assets contained and every primary control touchable", () => {
    expect(allCss).toMatch(/object-fit:\s*contain/u);
    expect(styles["base.css"]).toMatch(/\.stat-icon\s*>\s*img\s*\{[\s\S]*inset:\s*0[\s\S]*margin:\s*auto[\s\S]*transform:\s*none/u);
    expect(tokensCss).toMatch(/--touch-target:\s*44PX/u);
    expect(styles["base.css"]).toMatch(/\.app-header__action[\s\S]*white-space:\s*nowrap/u);
    expect(styles["base.css"]).toMatch(
      /\.app-header__action,[\s\S]*display:\s*flex[\s\S]*align-items:\s*center[\s\S]*justify-content:\s*center[\s\S]*line-height:\s*1/u,
    );
    expect(styles["base.css"]).toMatch(/\.button-hover[\s\S]*transform:\s*scale\(0\.98\)/u);
    expect(styles["skills.css"]).toMatch(/\.skill-result-row__result[\s\S]*min-height:\s*var\(--touch-target\)/u);
  });

  test("keeps shared typography and radius tokens out of Taro pixel scaling", () => {
    expect(tokensCss).toMatch(/--font-title:\s*21PX/u);
    expect(tokensCss).toMatch(/--font-section:\s*15PX/u);
    expect(tokensCss).toMatch(/--font-body:\s*14PX/u);
    expect(tokensCss).toMatch(/--font-caption:\s*12PX/u);
    expect(tokensCss).toMatch(/--font-result:\s*54PX/u);
    expect(tokensCss).toMatch(/--radius-card:\s*12PX/u);
    expect(tokensCss).toMatch(/--radius-control:\s*9PX/u);
  });

  test("normalizes the native mode switch into two equal selected-state cells", () => {
    const skills = styles["skills.css"];
    const buttonRule = skills.match(
      /\.mode-switch__button\s*\{([\s\S]*?)\}/u,
    )?.[1] ?? "";

    expect(buttonRule).toMatch(/width:\s*100%/u);
    expect(buttonRule).toMatch(/min-width:\s*0/u);
    expect(buttonRule).toMatch(/margin:\s*0/u);
    expect(buttonRule).toMatch(/padding:\s*0/u);
    expect(buttonRule).toMatch(/border:\s*0/u);
    expect(buttonRule).toMatch(/background:\s*transparent/u);
    expect(buttonRule).toMatch(/line-height:\s*1/u);
    expect(skills).toMatch(
      /\.mode-switch__button::after\s*\{[\s\S]*border:\s*0/u,
    );
  });

  test("uses compact phone composition and current-direction-only work surfaces", () => {
    const responsive = styles["responsive.css"];
    expect(responsive).toMatch(/@media\s*\(max-width:\s*767px\)/u);
    expect(responsive).toMatch(/\.battle-workspace__duel[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*44px\s*minmax\(0,\s*1fr\)/u);
    expect(responsive).toMatch(/\.stat-grid[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/u);
    expect(responsive).toMatch(/\.side-configuration:not\(\.side-configuration--active\)[\s\S]*display:\s*none/u);
    expect(responsive).toMatch(/\.skill-panel:not\(\.skill-panel--active\)[\s\S]*display:\s*none/u);
    expect(responsive).toMatch(/\.result-bar[\s\S]*display:\s*none/u);
    expect(responsive).toMatch(
      /\.result-bar\s*\{[\s\S]*min-height:\s*calc\(var\(--result-bar-height\)\s*\+\s*var\(--safe-area-bottom\)\)/u,
    );
  });

  test("stacks phone ability steppers before their values can truncate", () => {
    const responsive = styles["responsive.css"];
    expect(responsive).toMatch(
      /@media\s*\(max-width:\s*479px\)[\s\S]*\.active-ability-stage__grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
    );
  });

  test("restores the dense dual-side and result-rail layout on iPad", () => {
    const responsive = styles["responsive.css"];
    expect(responsive).toMatch(/@media\s*\(min-width:\s*768px\)/u);
    expect(responsive).toMatch(/\.workspace-layout[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*300px/u);
    expect(responsive).toMatch(
      /@media\s*\(min-width:\s*768px\)[\s\S]*\.quick-controls__row\s*\{[\s\S]*grid-template-columns:\s*42px\s+repeat\(6,\s*minmax\(0,\s*1fr\)\)[\s\S]*gap:\s*3px/u,
    );
    expect(responsive).toMatch(
      /@media\s*\(min-width:\s*1024px\)[\s\S]*\.workspace-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*260px/u,
    );
    expect(responsive).toMatch(
      /@media\s*\(min-width:\s*1200px\)[\s\S]*\.workspace-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*320px/u,
    );
    expect(responsive).toMatch(/\.configuration-grid[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
    expect(responsive).toMatch(/\.skills-grid[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  });

  test("keeps all sheets fixed, scrollable and safe-area aware", () => {
    const overlays = styles["overlays.css"];
    expect(overlays).toMatch(/\.parameter-sheet__overlay[\s\S]*position:\s*fixed[\s\S]*inset:\s*0/u);
    expect(overlays).toMatch(/\.skill-picker__overlay[\s\S]*position:\s*fixed[\s\S]*inset:\s*0/u);
    expect(overlays).toMatch(/\.result-sheet[\s\S]*var\(--safe-area-bottom\)/u);
    expect(overlays).toMatch(/overflow-y:\s*auto/u);
    expect(overlays).toMatch(/\.skill-picker__backdrop\s*\{[\s\S]*z-index:\s*0/u);
    expect(overlays).toMatch(/\.skill-picker__sheet\s*\{[\s\S]*z-index:\s*1/u);
    expect(overlays).toMatch(/\.result-sheet__close\s*\{[\s\S]*flex:\s*0\s+0\s+64px/u);
    expect(overlays).toMatch(
      /\.result-sheet__scroll\s*\{[\s\S]*width:\s*100%[\s\S]*box-sizing:\s*border-box/u,
    );
    expect(overlays).toMatch(
      /\.result-sheet\s*\{[\s\S]*height:\s*min\(92vh,\s*820px\)/u,
    );
    expect(overlays).toMatch(
      /\.result-sheet__scroll\s*\{[\s\S]*height:\s*0[\s\S]*flex:\s*1\s+1\s+auto/u,
    );
    expect(overlays).toMatch(
      /\.settings-sheet__row,[\s\S]*\.settings-sheet__action-row,[\s\S]*\.settings-sheet__reset\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/u,
    );
    expect(resultSheetSource).not.toMatch(
      /catchMove[\s\S]{0,80}result-sheet__overlay/u,
    );
  });

  test("keeps the share preview trigger above the result scroll surface", () => {
    expect(styles["overlays.css"]).toMatch(
      /\.result-sheet__share\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*3;[^}]*flex:\s*0 0 auto;/su,
    );
    expect(styles["overlays.css"]).toMatch(
      /\.result-sheet__share::after\s*\{[^}]*pointer-events:\s*none;/su,
    );
  });

  test("prevents 320px horizontal overflow and vertical text fallbacks", () => {
    expect(styles["base.css"]).toContain("min-width: 320px");
    expect(allCss).toMatch(/box-sizing:\s*border-box/u);
    expect(allCss).not.toMatch(/writing-mode\s*:\s*vertical/iu);
    expect(allCss).not.toMatch(/(?:^|[;{]\s*)width:\s*[5-9]\d{2}px/gmu);
  });

  test("contains the target HP editor inside its mobile grid column", () => {
    const skills = styles["skills.css"];
    const responsive = styles["responsive.css"];

    expect(skills).toMatch(
      /\.conditions-ribbon__health-input\s*\{[\s\S]*box-sizing:\s*border-box/u,
    );
    expect(responsive).toMatch(
      /@media\s*\(max-width:\s*359px\)[\s\S]*\.conditions-ribbon__health-input\s*\{[\s\S]*width:\s*58px/u,
    );
  });

  test("defines persistent selected, pressed and focus-visible states", () => {
    expect(allCss).toContain(".combatant-card--active");
    expect(allCss).toContain(".stat-grid__item--raised");
    expect(allCss).toContain(".skill-result-row--selected");
    expect(allCss).toContain(".quick-controls__option--selected");
    expect(allCss).toContain(":focus-visible");
  });

  test("aligns nature and IV on one six-column grid", () => {
    const parameters = styles["parameters.css"];
    const responsive = styles["responsive.css"];

    expect(parameters).toMatch(/\.quick-controls__row[\s\S]*repeat\(6,\s*minmax\(0,\s*1fr\)\)/u);
    expect(parameters).not.toContain(".quick-controls__axis");
    expect(parameters).not.toMatch(/repeat\(7,\s*minmax\(0,\s*1fr\)\)/u);
    expect(responsive).not.toMatch(/repeat\(7,\s*minmax\(0,\s*1fr\)\)/u);
  });

  test("renders the quick-control summary as a centered semantic footer", () => {
    const parameters = styles["parameters.css"];

    expect(parameters).toMatch(
      /\.quick-controls__summary\s*\{[\s\S]*display:\s*flex[\s\S]*justify-content:\s*center/u,
    );
    expect(parameters).toMatch(
      /\.quick-controls__summary\s*\{[\s\S]*overflow:\s*hidden/u,
    );
    expect(parameters).toMatch(
      /\.quick-controls__summary-iv\s*\{[\s\S]*min-width:\s*0[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis/u,
    );
    expect(parameters).toMatch(
      /\.quick-controls__summary-arrow--up\s*\{[\s\S]*color:\s*var\(--success\)/u,
    );
    expect(parameters).toMatch(
      /\.quick-controls__summary-arrow--down\s*\{[\s\S]*color:\s*var\(--danger\)/u,
    );
  });

  test("keeps skill rows inside the picker without a redundant action column", () => {
    const overlays = styles["overlays.css"];

    expect(overlays).toMatch(
      /\.skill-picker__option\s*\{[\s\S]*grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\)\s+24px/u,
    );
    expect(overlays).not.toContain("skill-picker__choice-state");
  });

  test("matches the approved skill category and selected-row treatment", () => {
    const overlays = styles["overlays.css"];

    expect(overlays).toMatch(
      /\.skill-picker__categories\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)[\s\S]*overflow:\s*hidden[\s\S]*gap:\s*6px/u,
    );
    expect(overlays).toMatch(
      /\.skill-picker__category\s*\{[\s\S]*width:\s*100%[\s\S]*min-height:\s*44px[\s\S]*white-space:\s*nowrap/u,
    );
    expect(overlays).toMatch(
      /\.skill-picker__category--active\s*\{[\s\S]*background:\s*var\(--result\)[\s\S]*color:\s*#fff/u,
    );
    expect(overlays).toMatch(
      /\.skill-picker__selected-icon\s*\{[\s\S]*width:\s*20px[\s\S]*height:\s*20px/u,
    );
    expect(overlays).toMatch(
      /\.skill-picker__search-icon\s*\{[\s\S]*width:\s*18px[\s\S]*height:\s*18px/u,
    );
    expect(overlays).toMatch(
      /\.skill-picker__clear\s*\{[\s\S]*min-height:\s*44px/u,
    );
  });

  test("keeps result trigger categories equal and every action touchable", () => {
    const overlays = styles["overlays.css"];

    expect(overlays).toMatch(
      /\.result-actions__categories\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/u,
    );
    expect(overlays).toMatch(
      /\.result-actions__category\s*\{[\s\S]*min-height:\s*44px/u,
    );
    expect(overlays).toMatch(
      /\.result-actions__item\s*\{[\s\S]*min-width:\s*0[\s\S]*overflow:\s*hidden/u,
    );
    expect(overlays).toMatch(
      /\.result-actions__apply\s*\{[\s\S]*min-height:\s*44px/u,
    );
    expect(overlays).toMatch(
      /\.result-actions__category--active\s*\{[\s\S]*background:\s*var\(--result\)[\s\S]*color:\s*#fff/u,
    );
  });

  test("keeps long boolean trigger labels on one readable row", () => {
    const skills = styles["skills.css"];
    const overlays = styles["overlays.css"];
    const responsive = styles["responsive.css"];

    expect(conditionFieldSource).toContain(
      'className="condition-editor__toggle-label"',
    );
    expect(conditionFieldSource).toContain(
      'className="condition-editor__toggle-state"',
    );
    expect(skills).toMatch(
      /\.condition-editor__toggle\s*\{[\s\S]*display:\s*flex[\s\S]*justify-content:\s*space-between[\s\S]*font-size:\s*13px/u,
    );
    expect(skills).toMatch(
      /\.condition-editor__toggle-label\s*\{[\s\S]*white-space:\s*nowrap/u,
    );
    expect(overlays).toMatch(
      /\.result-actions__control-slot--boolean \.condition-editor__toggle\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto[\s\S]*height:\s*44px[\s\S]*font-size:\s*12px[\s\S]*line-height:\s*17px/u,
    );
    expect(overlays).toMatch(
      /\.result-actions__control-slot--boolean \.condition-editor__toggle-label\s*\{[\s\S]*white-space:\s*nowrap/u,
    );
    expect(overlays).toMatch(
      /\.result-actions__control-slot--boolean \.condition-editor__toggle-state\s*\{[\s\S]*font-size:\s*11px[\s\S]*white-space:\s*nowrap/u,
    );
    expect(responsive).toMatch(
      /@media\s*\(max-width:\s*359px\)[\s\S]*\.result-actions__control-slot--boolean\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/u,
    );
  });

  test("keeps neutral nature summary inline instead of styling it as an option row", () => {
    const parameters = styles["parameters.css"];

    expect(parameters).toMatch(
      /\.nature-picker__neutral\s*\{[\s\S]*flex:\s*0\s+0\s+auto[\s\S]*white-space:\s*nowrap/u,
    );
    expect(parameters).not.toMatch(
      /\.nature-picker__option,\s*\n\.nature-picker__neutral/u,
    );
  });

  test("constrains the fixed spirit search and results to equal safe margins", () => {
    const overlays = styles["overlays.css"];
    const fixedInput = overlays.match(
      /\.combatant-card--identity-only \.spirit-picker--open \.spirit-picker__input\s*\{([\s\S]*?)\}/u,
    )?.[1] ?? "";
    const fixedResults = overlays.match(
      /\.combatant-card--identity-only \.spirit-picker__results\s*\{([\s\S]*?)\}/u,
    )?.[1] ?? "";

    for (const rule of [fixedInput, fixedResults]) {
      expect(rule).toMatch(/left:\s*14px/u);
      expect(rule).toMatch(/right:\s*14px/u);
      expect(rule).toMatch(/width:\s*auto/u);
    }
    expect(overlays).toMatch(
      /\.spirit-picker__result\s*\{[\s\S]*width:\s*100%[\s\S]*margin:\s*0/u,
    );
  });

  test("uses native-safe font-weight tokens for WXSS compilation", () => {
    expect(tokensCss).toMatch(/--weight-title:\s*700;/u);
    expect(tokensCss).toMatch(/--weight-section:\s*600;/u);
    expect(tokensCss).toMatch(/--weight-emphasis:\s*600;/u);
    expect(tokensCss).toMatch(/--weight-result:\s*800;/u);
  });

  test("avoids unsupported compound pseudo selectors in native WXSS", () => {
    expect(allCss).not.toContain(":last-child:nth-child(odd)");
  });
});
