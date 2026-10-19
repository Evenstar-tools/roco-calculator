import { assertWorkspaceJson } from "../runtime/workspace-store.js";
import { storageError } from "./server-storage.js";

export const TEAM_DRAFT_FORMAT = "rock-calculator.team-draft";
export const TEAM_DRAFT_MAX_BYTES = 1024 * 1024;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (code) => { throw storageError(code, code); };
const reference = (value) => typeof value === "string" && value.length > 0 && value.length <= 256;

function assertSlot(slot) {
  if (slot === null || reference(slot)) return;
  if (!object(slot)) fail("TEAM_DRAFT_INVALID");
  for (const key of ["skillId", "id"]) {
    if (Object.hasOwn(slot, key) && slot[key] !== null && !reference(slot[key])) fail("TEAM_DRAFT_INVALID");
  }
}

function assertTeam(team) {
  if (!object(team) || typeof team.name !== "string" || !Array.isArray(team.members) || team.members.length !== 6) fail("TEAM_DRAFT_INVALID");
  // Six slots are the tool's persisted team shape, not verified Global battle rules.
  for (const member of team.members) {
    if (member === null) continue;
    if (!object(member) || !reference(member.spiritId)) fail("TEAM_DRAFT_INVALID");
    for (const key of ["nature", "natureId"]) {
      if (Object.hasOwn(member, key) && member[key] !== null && !reference(member[key])) fail("TEAM_DRAFT_INVALID");
    }
    if (Object.hasOwn(member, "displayIvs") && (!object(member.displayIvs) || Object.values(member.displayIvs).some((value) => value !== null && (!Number.isFinite(value) || value < 0)))) fail("TEAM_DRAFT_INVALID");
    if (Object.hasOwn(member, "skills")) {
      if (!object(member.skills) || !Array.isArray(member.skills.four) || member.skills.four.length > 32) fail("TEAM_DRAFT_INVALID");
      member.skills.four.forEach(assertSlot);
      if (Object.hasOwn(member.skills, "single")) assertSlot(member.skills.single);
    }
  }
}

function assertEnvelope(envelope, serverId) {
  try { assertWorkspaceJson(envelope); } catch { fail("TEAM_DRAFT_INVALID"); }
  if (!object(envelope) || envelope.format !== TEAM_DRAFT_FORMAT || envelope.kind !== "team-draft") fail("TEAM_DRAFT_FORMAT");
  if (envelope.serverId !== serverId || serverId !== "global") fail("TEAM_DRAFT_SERVER_MISMATCH");
  if (envelope.schemaVersion !== 1) fail("TEAM_DRAFT_VERSION");
  const keys = ["format", "schemaVersion", "serverId", "kind", "versions", "payload"];
  if (Object.keys(envelope).length !== keys.length || keys.some((key) => !Object.hasOwn(envelope, key))) fail("TEAM_DRAFT_INVALID");
  if (!object(envelope.versions) || Object.keys(envelope.versions).length !== 3 || ["game", "data", "rules"].some((key) => envelope.versions[key] !== null)) fail("TEAM_DRAFT_VERSION");
  assertTeam(envelope.payload);
}

export function serializeTeamDraft(team, { serverId = "global" } = {}) {
  const envelope = { format: TEAM_DRAFT_FORMAT, schemaVersion: 1, serverId, kind: "team-draft", versions: { game: null, data: null, rules: null }, payload: team };
  assertEnvelope(envelope, serverId);
  const text = `${JSON.stringify(envelope, null, 2)}\n`;
  if (new TextEncoder().encode(text).length > TEAM_DRAFT_MAX_BYTES) fail("TEAM_DRAFT_TOO_LARGE");
  return text;
}

export function parseTeamDraft(text, { serverId = "global" } = {}) {
  if (typeof text !== "string") fail("TEAM_DRAFT_INVALID");
  if (new TextEncoder().encode(text).length > TEAM_DRAFT_MAX_BYTES) fail("TEAM_DRAFT_TOO_LARGE");
  let envelope;
  try { envelope = JSON.parse(text.replace(/^\uFEFF/u, "")); } catch { fail("TEAM_DRAFT_JSON"); }
  assertEnvelope(envelope, serverId);
  return envelope.payload;
}
