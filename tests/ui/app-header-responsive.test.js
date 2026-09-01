import { expect, test } from "vitest";
import { readWebStyles } from "./helpers/web-styles.js";

const styles = readWebStyles();

test("hides the team label with the other header labels at narrow widths", () => {
  expect(styles).toMatch(
    /@media \(max-width: 760px\) \{[\s\S]{0,700}\.view-mode-switch button span \{[\s\S]*?display: none;[\s\S]{0,500}\.team-action span \{[\s\S]*?display: none;/,
  );
  expect(styles).toMatch(
    /@media \(max-width: 760px\) \{[\s\S]{0,900}\.team-action \{[\s\S]*?width: 38px;[\s\S]*?padding: 0;/,
  );
});
