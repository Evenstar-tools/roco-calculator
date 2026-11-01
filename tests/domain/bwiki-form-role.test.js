import { describe, expect, it } from "vitest";
import { resolveSpiritFormRole } from "../../src/features/team-ability/domain/spirit-form-role.js";

describe("reviewed BWIKI season form roles", () => {
  it("keeps newly synced final forms in ranking tools without rebuilding old manifests", () => {
    const spirit = { id: "spirit_nrc_new", stage: "二阶", formRole: "final",
      evolutionFamilyId: "nrc:example", formRoleEvidence: { kind: "bwiki-season",
        revision: 20305, url: "https://wiki.biligame.com/nrc/index.php?oldid=20305" } };
    expect(resolveSpiritFormRole(spirit)).toEqual({ formRole: "final",
      evolutionFamilyId: "nrc:example", formRoleStatus: "verified" });
    expect(resolveSpiritFormRole({ ...spirit, formRole: "growth" }).formRole).toBe("growth");
  });

  it("requires a reviewed source instead of trusting an unsupported role field", () => {
    expect(resolveSpiritFormRole({ id: "spirit_nrc_new", formRole: "final" }).formRole).toBe("unknown");
    expect(resolveSpiritFormRole({ id: "spirit_nrc_new", formRole: "final",
      formRoleEvidence: { kind: "bwiki-season", revision: 0,
        url: "https://wiki.biligame.com/nrc/index.php?oldid=0" } }).formRole).toBe("unknown");
  });
});
