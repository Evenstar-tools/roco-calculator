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


describe("reviewed Candymo S5 form roles", () => {
  const spirit = { id: "spirit_preview_s5_lily-of-valley", stage: "三阶", formRole: "final",
    evolutionFamilyId: "candymo-lily-of-valley", formRoleEvidence: { kind: "candymo-reviewed",
      reviewId: "s5-candymo-20261101", sourceId: 3824, authority: "third-party-game-data-site",
      url: "https://app.candymo.com/pets/3824", apiUrl: "https://api.candymo.com/api/v1/pets/3824" } };
  it("admits the exact reviewed source and local identity to ranking", () => {
    expect(resolveSpiritFormRole(spirit)).toEqual({ formRole: "final",
      evolutionFamilyId: "candymo-lily-of-valley", formRoleStatus: "verified" });
  });
  it.each([
    { reviewId: "unreviewed" }, { sourceId: 9999 }, { authority: "official" },
    { url: "https://example.com/pets/3824" }, { apiUrl: "https://api.candymo.com/api/v1/pets/3168" },
  ])("rejects unrelated or mismatched source evidence %j", patch => {
    expect(resolveSpiritFormRole({ ...spirit, formRoleEvidence: { ...spirit.formRoleEvidence, ...patch } }).formRole)
      .toBe("unknown");
  });
  it("does not let another spirit reuse a reviewed identity", () => {
    expect(resolveSpiritFormRole({ ...spirit, id: "spirit_unreviewed" }).formRole).toBe("unknown");
  });
});
