import { normalizeNatureId } from "../domain/natures.js";
import { normalizeMarkSlot } from "../domain/marks.js";
import { reconcileSkillLoadout } from "../domain/skill-loadout.js";

const DIRECTIONS = new Set(["forward", "reverse"]);
const SIDES = new Set(["attacker", "defender"]);
const DIRECTION_INPUTS = new Set([
  "selectedSkillIndex",
  "selectedDamageSource",
  "reduction",
  "hitCount",
  "traitDamageHitCount",
  "starfallStacks",
  "finalDamageMultiplier",
  "currentHp",
  "context",
  "overrides",
]);

function requireDirection(action) {
  if (!DIRECTIONS.has(action.direction)) {
    throw new TypeError(`动作 ${action.type} 缺少有效方向`);
  }

  return action.direction;
}

function requireSide(action) {
  if (!SIDES.has(action.side)) {
    throw new TypeError(`动作 ${action.type} 缺少有效阵营`);
  }

  return action.side;
}

function updateSide(state, action, updater) {
  const side = requireSide(action);
  return {
    ...state,
    sides: {
      ...state.sides,
      [side]: updater(state.sides[side]),
    },
  };
}

function cloneSkillEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(entry);
  }
  return JSON.parse(JSON.stringify(entry));
}

export function calculatorReducer(state, action) {
  switch (action.type) {
    case "state/replace":
      if (
        action.value === null ||
        typeof action.value !== "object" ||
        Array.isArray(action.value)
      ) {
        throw new TypeError("替换状态必须是已校验的配置对象");
      }
      return action.value;
    case "mode/set":
      if (action.value !== "single" && action.value !== "four") {
        throw new TypeError("技能模式必须是 single 或 four");
      }
      return {
        ...state,
        mode: action.value,
      };
    case "mark/update": {
      const side = requireSide(action);
      if (action.polarity !== "positive" && action.polarity !== "negative") {
        throw new TypeError("印记类型必须是 positive 或 negative");
      }
      const slot = normalizeMarkSlot(action.value, action.polarity);
      const legacyDirection = side === "defender" ? "forward" : "reverse";
      return {
        ...state,
        marks: {
          ...state.marks,
          [side]: {
            ...state.marks[side],
            [action.polarity]: slot,
          },
        },
        directions:
          action.polarity === "negative"
            ? {
                ...state.directions,
                [legacyDirection]: {
                  ...state.directions[legacyDirection],
                  starfallStacks:
                    slot.id === "starfall" ? slot.stacks : 0,
                },
              }
            : state.directions,
      };
    }
    case "side/set-spirit":
      return updateSide(state, action, (side) => ({
        ...side,
        skills: Array.isArray(action.legalSkillIds)
          ? reconcileSkillLoadout(side.skills, action.legalSkillIds)
          : side.skills,
        spiritId: action.value,
      }));
    case "side/apply-preset": {
      const member = action.value;
      if (
        !member ||
        typeof member !== "object" ||
        typeof member.spiritId !== "string" ||
        !member.spiritId ||
        !member.displayIvs ||
        typeof member.displayIvs !== "object" ||
        !member.skills ||
        typeof member.skills !== "object"
      ) {
        throw new TypeError("队伍成员配置无效");
      }
      if (
        !Array.isArray(member.skills.four) ||
        member.skills.four.length !== 4
      ) {
        throw new TypeError("队伍成员必须配置四个技能位");
      }
      const four = member.skills.four.map(cloneSkillEntry);
      const single = cloneSkillEntry(
        member.skills.single ?? four.find(Boolean) ?? null,
      );
      return updateSide(state, action, () => ({
        displayIvs: { ...member.displayIvs },
        nature: normalizeNatureId(member.natureId),
        skills: { four, single },
        spiritId: member.spiritId,
      }));
    }
    case "side/set-nature":
      return updateSide(state, action, (side) => ({
        ...side,
        nature: action.value,
      }));
    case "side/set-iv":
      return updateSide(state, action, (side) => {
        if (!Object.hasOwn(side.displayIvs, action.stat)) {
          throw new TypeError(`未知能力字段 ${action.stat}`);
        }

        return {
          ...side,
          displayIvs: {
            ...side.displayIvs,
            [action.stat]: action.value,
          },
        };
      });
    case "side/set-single-skill":
      return updateSide(state, action, (side) => ({
        ...side,
        skills: {
          ...side.skills,
          single: action.value,
        },
      }));
    case "side/set-four-skill":
      return updateSide(state, action, (side) => {
        if (
          !Number.isInteger(action.index) ||
          action.index < 0 ||
          action.index >= side.skills.four.length
        ) {
          throw new RangeError("四技能槽位必须是 0 到 3 的整数");
        }

        const four = [...side.skills.four];
        four[action.index] = action.value;
        return {
          ...side,
          skills: {
            ...side.skills,
            four,
          },
        };
      });
    case "direction/set-reduction": {
      const direction = requireDirection(action);
      return {
        ...state,
        directions: {
          ...state.directions,
          [direction]: {
            ...state.directions[direction],
            reduction: action.value,
          },
        },
      };
    }
    case "direction/set-context": {
      const direction = requireDirection(action);
      if (
        action.value === null ||
        typeof action.value !== "object" ||
        Array.isArray(action.value)
      ) {
        throw new TypeError("方向上下文必须是对象");
      }
      return {
        ...state,
        directions: {
          ...state.directions,
          [direction]: {
            ...state.directions[direction],
            context: { ...action.value },
          },
        },
      };
    }
    case "direction/update": {
      const direction = requireDirection(action);
      if (
        action.value === null ||
        typeof action.value !== "object" ||
        Array.isArray(action.value)
      ) {
        throw new TypeError("方向更新值必须是对象");
      }

      const unknownKey = Object.keys(action.value).find(
        (key) => !DIRECTION_INPUTS.has(key),
      );
      if (unknownKey) {
        throw new TypeError(`未知方向输入 ${unknownKey}`);
      }

      const current = state.directions[direction];
      const next = {
        ...current,
        ...action.value,
      };
      if (action.value.context) {
        next.context = {
          ...current.context,
          ...action.value.context,
        };
      }
      if (action.value.overrides) {
        next.overrides = {
          ...current.overrides,
          ...action.value.overrides,
        };
      }

      return {
        ...state,
        directions: {
          ...state.directions,
          [direction]: next,
        },
      };
    }
    case "sides/swap":
      return {
        ...state,
        marks: state.marks
          ? {
              attacker: state.marks.defender,
              defender: state.marks.attacker,
            }
          : state.marks,
        sides: {
          attacker: state.sides.defender,
          defender: state.sides.attacker,
        },
      };
    default:
      return state;
  }
}
