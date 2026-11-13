/* =====================================================================
   霓虹协议 · cards.js
   升级协议卡（技能卡）+ 属性结算
   ===================================================================== */
(function () {
  'use strict';
  const NP = window.NP;

  NP.XP_PER_LEVEL = 100;

  /* 每张卡对 mods 的贡献；mods 为累加池 */
  NP.newMods = function () {
    return {
      dmg: 0, allDmg: 0, rate: 0, crit: 0, critDmg: 0, hp: 0, def: 0,
      dr: 0, regen: 0, lifesteal: 0, cdr: 0, move: 0, pierce: 0, multishot: 0,
      bulletSpeed: 0, range: 0, killHeal: 0, armorPen: 0, overDur: 0,
      laserDmg: 0, empRadius: 0, empDmg: 0, shieldGen: 0, dashCdr: 0
    };
  };

  /* rarity: common | rare | epic */
  NP.CARDS = [
    {
      id: 'bullet', name: '高能弹头', en: 'HE', icon: '◈', rarity: 'common', max: 8,
      desc: '子弹伤害 +12%',
      apply: (m) => { m.dmg += 0.12; }
    },
    {
      id: 'rate', name: '疾速扳机', en: 'TRIGGER', icon: '⚡', rarity: 'common', max: 8,
      desc: '射速 +14%',
      apply: (m) => { m.rate += 0.14; }
    },
    {
      id: 'crit', name: '弱点解析', en: 'WEAKPOINT', icon: '◎', rarity: 'common', max: 8,
      desc: '暴击率 +6%',
      apply: (m) => { m.crit += 0.06; }
    },
    {
      id: 'critdmg', name: '致死过载', en: 'OVERKILL', icon: '✖', rarity: 'rare', max: 6,
      desc: '暴击伤害 +30%',
      apply: (m) => { m.critDmg += 0.30; }
    },
    {
      id: 'armor', name: '复合装甲', en: 'PLATING', icon: '▣', rarity: 'common', max: 6,
      desc: '受到的伤害 -7%',
      apply: (m) => { m.dr += 0.07; }
    },
    {
      id: 'def', name: '纳米镀层', en: 'NANO', icon: '⬢', rarity: 'common', max: 8,
      desc: '防御力 +60（每点 -0.02% 伤害）',
      apply: (m) => { m.def += 60; }
    },
    {
      id: 'hp', name: '生命扩容', en: 'VITALITY', icon: '❖', rarity: 'common', max: 8,
      desc: '最大生命 +10%',
      apply: (m) => { m.hp += 0.10; }
    },
    {
      id: 'regen', name: '纳米修复', en: 'REPAIR', icon: '✚', rarity: 'common', max: 6,
      desc: '每秒回复 0.7% 最大生命',
      apply: (m) => { m.regen += 0.007; }
    },
    {
      id: 'lifesteal', name: '血色黎明', en: 'BLOODRUSH', icon: '♨', rarity: 'rare', max: 6,
      desc: '吸血 +5%',
      apply: (m) => { m.lifesteal += 0.05; }
    },
    {
      id: 'cdr', name: '冷却矩阵', en: 'MATRIX', icon: '◷', rarity: 'common', max: 6,
      desc: '所有技能冷却 -7%',
      apply: (m) => { m.cdr += 0.07; }
    },
    {
      id: 'move', name: '伺服腿', en: 'SERVO', icon: '➤', rarity: 'common', max: 6,
      desc: '移动速度 +8%',
      apply: (m) => { m.move += 0.08; }
    },
    {
      id: 'pierce', name: '磁轨穿透', en: 'RAILGUN', icon: '⇥', rarity: 'rare', max: 5,
      desc: '子弹穿透 +1 个目标',
      apply: (m) => { m.pierce += 1; }
    },
    {
      id: 'multi', name: '多重弹道', en: 'SPLIT', icon: '⑂', rarity: 'rare', max: 4,
      desc: '每次射击额外发射 1 发子弹',
      apply: (m) => { m.multishot += 1; }
    },
    {
      id: 'speed', name: '弹速强化', en: 'VELOCITY', icon: '→', rarity: 'common', max: 6,
      desc: '子弹速度 +18%，射程 +12%',
      apply: (m) => { m.bulletSpeed += 0.18; m.range += 0.12; }
    },
    {
      id: 'pen', name: '穿甲芯', en: 'AP ROUND', icon: '▼', rarity: 'rare', max: 5,
      desc: '无视目标 12% 防御力',
      apply: (m) => { m.armorPen += 0.12; }
    },
    {
      id: 'overflow', name: '溢流核心', en: 'OVERFLOW', icon: '✺', rarity: 'epic', max: 4,
      desc: '全部伤害 +18%（含激光）',
      apply: (m) => { m.allDmg += 0.18; }
    },
    {
      id: 'killheal', name: '处刑回馈', en: 'EXECUTE', icon: '✜', rarity: 'common', max: 5,
      desc: '击杀时回复 2% 最大生命',
      apply: (m) => { m.killHeal += 0.02; }
    },
    {
      id: 'overdur', name: '超频延展', en: 'EXTEND', icon: '⏱', rarity: 'rare', max: 4,
      desc: '超频协议持续 +2.5 秒',
      apply: (m) => { m.overDur += 2.5; }
    },
    {
      id: 'laser', name: '激光聚焦', en: 'FOCUS', icon: '✦', rarity: 'rare', max: 5,
      desc: '毁灭激光伤害 +45%',
      apply: (m) => { m.laserDmg += 0.45; }
    },
    {
      id: 'emp', name: '电磁增幅', en: 'EMP BOOST', icon: '◉', rarity: 'rare', max: 4,
      desc: '电磁脉冲半径 +25%，并造成伤害',
      apply: (m) => { m.empRadius += 0.25; m.empDmg += 1; }
    },
    {
      id: 'shieldgen', name: '护盾发生器', en: 'BARRIER', icon: '⬡', rarity: 'epic', max: 4,
      desc: '每 12 秒生成 8% 最大生命的护盾',
      apply: (m) => { m.shieldGen += 0.08; }
    },
    {
      id: 'dash', name: '相位引擎', en: 'PHASE', icon: '⇢', rarity: 'common', max: 5,
      desc: '冲刺冷却 -15%，冲刺距离 +15%',
      apply: (m) => { m.dashCdr += 0.15; }
    }
  ];

  NP.CARDS_BY_ID = {};
  NP.CARDS.forEach((c) => { NP.CARDS_BY_ID[c.id] = c; });

  const RARITY_W = { common: 1, rare: 0.52, epic: 0.2 };

  /* 抽 3 张不重复的可用卡 */
  NP.drawCards = function (stacks, n) {
    const pool = NP.CARDS.filter((c) => (stacks[c.id] || 0) < c.max);
    const picked = [];
    const used = new Set();
    let guard = 0;
    while (picked.length < Math.min(n, pool.length) && guard++ < 400) {
      const total = pool.reduce((s, c) => (used.has(c.id) ? s : s + RARITY_W[c.rarity]), 0);
      if (total <= 0) break;
      let r = Math.random() * total;
      for (const c of pool) {
        if (used.has(c.id)) continue;
        r -= RARITY_W[c.rarity];
        if (r <= 0) { used.add(c.id); picked.push(c); break; }
      }
    }
    return picked;
  };

  /* 由等级 / 卡池 / 永久强化 计算最终属性 */
  NP.computeStats = function (level, mods, up) {
    const baseHp = 1500 + 350 * level;
    const baseAtk = 300 + 50 * level;
    const baseDef = 50 + 2.5 * level;

    const maxHp = Math.round(baseHp * (1 + up.hp * 0.08) * (1 + mods.hp));
    const atk = Math.round(baseAtk * (1 + up.atk * 0.08) * (1 + mods.dmg + mods.allDmg));
    const def = baseDef + up.def * 50 + mods.def;
    const fireRate = 3.2 * (1 + up.rate * 0.06) * (1 + mods.rate);
    const crit = NP.clamp(0.05 + up.crit * 0.04 + mods.crit, 0, 0.95);
    const critDmg = 1.65 + mods.critDmg;
    const cdr = NP.clamp(up.cdr * 0.035 + mods.cdr, 0, 0.6);
    const defReduce = Math.min(0.70, def * 0.0002);       // 每点防御 -0.02% 伤害
    const takenMul = (1 - defReduce) * (1 - Math.min(0.62, mods.dr));
    return {
      maxHp, atk, def, fireRate, crit, critDmg, cdr,
      defReduce, takenMul,
      moveMul: 1 + mods.move,
      lifesteal: mods.lifesteal,
      regen: mods.regen,
      killHeal: mods.killHeal,
      pierce: mods.pierce,
      multishot: mods.multishot,
      bulletSpeed: 1900 * (1 + mods.bulletSpeed),
      range: 1180 * (1 + mods.range),
      armorPen: Math.min(0.9, mods.armorPen),
      overDur: 10 + mods.overDur,
      laserMul: 1 + mods.laserDmg + mods.allDmg,
      empR: 420 * (1 + mods.empRadius),
      empDmg: mods.empDmg,
      shieldGen: mods.shieldGen,
      dashCdr: mods.dashCdr
    };
  };
})();