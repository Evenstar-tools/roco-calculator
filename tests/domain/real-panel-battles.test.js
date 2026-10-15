import { spawnSync } from "node:child_process";
import { test, expect } from "vitest";

// 2026-10-15 用户游戏截图：六项能力直接断言，不从计算结果倒推目标面板。
const fastSpecialIvs = { hp:60,physicalAttack:0,magicalAttack:60,speed:60,physicalDefense:0,magicalDefense:0 };
const fastPhysicalIvs = { hp:60,physicalAttack:60,magicalAttack:0,speed:60,physicalDefense:0,magicalDefense:0 };
const shark = { spirit:"彩蝶鲨", nature:"胆小", ivs:fastSpecialIvs, skill:"天洪" };
// 旧四场对局保留原配招；新截图只用于锁定六项能力，不能混换对局条件。
const didi = { spirit:"霹雳迪迪", nature:"胆小", ivs:fastSpecialIvs, skills:["落雷","色散","镜像反射","放晴"] };
const bluce = { spirit:"冰钻布鲁斯", nature:"固执", ivs:fastPhysicalIvs, skills:["暴风雪","力量增效","火焰冲锋","先发制人"] };
const cases = [
  ["雨天藤绞", { mode:"single", attacker:{spirit:"卷毛鸭",nature:"开朗",ivs:fastPhysicalIvs,skill:"藤绞"}, defender:shark,
    forward:{context:{rainWeather:true,weatherRainTurns:8}} }, 207, 201, 175],
  // 云卷大泽 BV1mCpy6cEnA：无雨双力增 310，雨天单力增 414；不使用旧特性覆盖字段。
  ["补档无雨双力增藤绞", { mode:"single", attacker:{spirit:"卷毛鸭",nature:"开朗",ivs:fastPhysicalIvs,skill:"藤绞"}, defender:shark,
    forward:{context:{rainWeather:false,weatherRainTurns:0},overrides:{attackLevelStage:20}} }, 310, 603, 175],
  ["补档雨天单力增藤绞", { mode:"single", attacker:{spirit:"卷毛鸭",nature:"开朗",ivs:fastPhysicalIvs,skill:"藤绞"}, defender:shark,
    forward:{context:{rainWeather:true,weatherRainTurns:8},overrides:{attackLevelStage:10}} }, 414, 402, 175],
  ["原片雨天沉溺", { mode:"single", attacker:{spirit:"卷毛鸭",nature:"开朗",ivs:fastPhysicalIvs,skill:"沉溺"}, defender:shark,
    forward:{context:{rainWeather:true,weatherRainTurns:8}} }, 313, 201, 175],
  ["力量增效后冰爪", { mode:"single", attacker:{spirit:"卡瓦重（火山附近的样子）",nature:"开朗",ivs:fastPhysicalIvs,skill:"冰爪"},defender:shark,
    forward:{overrides:{attackLevelStage:10}} },310,376,175],
  ["迪迪先发制人", {mode:"four",attacker:bluce,defender:didi,forward:{skill:4}},159,235,132],
  ["迪迪强化先发制人", {mode:"four",attacker:bluce,defender:didi,forward:{skill:4,overrides:{attackLevelStage:10}}},318,470,132],
  ["迪迪火焰冲锋", {mode:"four",attacker:bluce,defender:didi,forward:{skill:3}},173,235,132],
  ["迪迪暴风雪", {mode:"four",attacker:bluce,defender:didi,forward:{skill:1}},307,235,132],
];

test.each(cases)("真实面板约束下无攻防覆盖复算：%s", (_label, battle, damage, attack, defense) => {
  const input = {schemaVersion:1,level:60,...battle};
  expect(input.forward.overrides?.attackerStat).toBeUndefined();
  expect(input.forward.overrides?.defenderDefense).toBeUndefined();
  const run = spawnSync(process.execPath,["scripts/cli/rock-calculator.mjs","explain","--input","-","--direction","forward"],{
    cwd:process.cwd(),input:JSON.stringify(input),encoding:"utf8",
  });
  expect(run.status,run.stderr).toBe(0);
  const out=JSON.parse(run.stdout);
  expect(out.result.totalDamage).toBe(damage);
  const formula=out.result.formulaSteps.find(({label})=>label==="等级系数与攻防比");
  expect(formula.input).toMatchObject({attackerStat:attack,defenderDefense:defense});
  expect(out.result.combatPanel.defender).toMatchObject({
    physicalDefense:battle.defender.spirit==="彩蝶鲨"?175:132,
    magicalDefense:battle.defender.spirit==="彩蝶鲨"?175:206,
  });
});
