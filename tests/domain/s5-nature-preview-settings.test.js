import { test, expect } from 'vitest';
import { validatePreviewSettings } from '../../public/tools/s5-nature/matchup-ui.mjs';

const sessionWith = override => ({ profiles: [{ preview: { skillOverrides: { skill: override } } }],
  preview: { incomingOverridesList: [override] } });

test('preview settings preserve fractional displayed power and legacy final power separately', () => {
  for (const override of [{ displayedPower: 60.5 }, { displayedPower: 0 }, { effectivePower: 137.5 }]) {
    expect(() => validatePreviewSettings(sessionWith(override))).not.toThrow();
  }
});

test('preview settings reject ambiguous mixed power fields in either direction', () => {
  const mixed = { displayedPower: 60.5, effectivePower: 137.5 };
  expect(() => validatePreviewSettings({ profiles: [{ preview: { skillOverrides: { skill: mixed } } }] })).toThrow();
  expect(() => validatePreviewSettings({ profiles: [], preview: { incomingOverridesList: [mixed] } })).toThrow();
});

test('preview settings reject invalid displayed power without changing hit count rules', () => {
  for (const override of [{ displayedPower: -1 }, { displayedPower: Infinity }, { displayedPower: '60.5' },
    { displayedPower: 100001 }, { displayedPower: 60.5, hitCount: 1.5 }]) {
    expect(() => validatePreviewSettings(sessionWith(override))).toThrow();
  }
});
