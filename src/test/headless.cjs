/* 霓虹协议 · 无头冒烟测试
   用最小 DOM/Canvas 桩在 Node 中真实执行游戏逻辑与渲染调用。
   运行： node test/headless.cjs
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------------- 假 DOM ---------------- */
function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, on) => {
      const v = on === undefined ? !set.has(c) : !!on;
      v ? set.add(c) : set.delete(c);
      return v;
    },
    contains: (c) => set.has(c)
  };
}

function makeEl(tag = 'div', id = '') {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id, className: '', _html: '', textContent: '', value: '',
    hidden: false, checked: true, disabled: false,
    dataset: {}, children: [], style: {}, width: 300, height: 150,
    offsetWidth: 0, parentElement: null, _listeners: {}
  };
  el.classList = makeClassList();
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); this.children = []; }
  });
  el.addEventListener = (n, f) => { (el._listeners[n] = el._listeners[n] || []).push(f); };
  el.removeEventListener = () => { };
  el.appendChild = (c) => { el.children.push(c); c.parentElement = el; return c; };
  el.removeChild = (c) => { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); };
  el.remove = () => { if (el.parentElement) el.parentElement.removeChild(el); };
  Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || null });
  el.querySelector = () => makeEl('div');
  el.querySelectorAll = () => [];
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 });
  el.animate = () => ({ finished: Promise.resolve() });
  el.getContext = () => makeCtx(el);
  el.focus = () => { };
  el.select = () => { };
  el.click = () => { if (el.onclick) el.onclick({}); };
  return el;
}

const gradient = { addColorStop() { } };
function makeCtx(canvas) {
  const noop = () => undefined;
  const target = {
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    measureText: () => ({ width: 12 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop,
    setTransform: noop, save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    ellipse: noop, rect: noop, fill: noop, stroke: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop, strokeText: noop,
    drawImage: noop, setLineDash: noop, quadraticCurveTo: noop, bezierCurveTo: noop
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

/* ---------------- 环境 ---------------- */
const registry = new Map();
const html = fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8');
for (const m of html.matchAll(/id="([\w-]+)"/g)) registry.set(m[1], makeEl('div', m[1]));

const doc = {
  title: '',
  body: makeEl('body'),
  documentElement: makeEl('html'),
  getElementById: (id) => registry.get(id) || null,
  querySelector: (sel, root) => {
    if (typeof sel !== 'string') return null;
    if (sel[0] === '#') return registry.get(sel.slice(1)) || null;
    return makeEl('div');
  },
  querySelectorAll: () => [],
  createElement: (tag) => makeEl(tag),
  addEventListener: () => { }
};

const winListeners = {};
const localStore = new Map();
const storage = {
  getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
  setItem: (k, v) => localStore.set(k, String(v)),
  removeItem: (k) => localStore.delete(k)
};

const windowObj = {
  innerWidth: 1600, innerHeight: 900, devicePixelRatio: 2,
  document: doc,
  addEventListener: (n, f) => { (winListeners[n] = winListeners[n] || []).push(f); },
  removeEventListener: () => { },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => { },
  localStorage: storage,
  navigator: { clipboard: { writeText: async () => { } }, userAgent: 'node' },
  performance: { now: () => Date.now() },
  setTimeout, clearTimeout, setInterval, clearInterval,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  confirm: () => true,
  Image: function () { },
  console
};

global.window = windowObj;
global.location = { search: '', href: 'file:///neon-protocol.html' };
windowObj.location = global.location;
global.document = doc;
global.localStorage = storage;
global.navigator = windowObj.navigator;
global.requestAnimationFrame = windowObj.requestAnimationFrame;
global.performance = windowObj.performance;
global.btoa = windowObj.btoa;
global.atob = windowObj.atob;
global.confirm = windowObj.confirm;

/* 固定随机种子，保证测试可复现 */
let __seed = 987654321;
Math.random = function () {
  __seed |= 0; __seed = (__seed + 0x6D2B79F5) | 0;
  let t = Math.imul(__seed ^ (__seed >>> 15), 1 | __seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ---------------- 载入脚本 ---------------- */
for (const f of ['core.js', 'cards.js', 'entities.js', 'boss.js', 'game.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
(winListeners.load || []).forEach((f) => f());
const NP = global.window.NP;
const G = NP.App;

const results = [];
function check(name, fn) {
  try {
    const r = fn();
    results.push({ name, ok: true, info: r === undefined ? '' : String(r) });
  } catch (e) {
    results.push({ name, ok: false, info: e.message + '  @ ' + (e.stack || '').split('\n')[1] });
  }
}

function freshRun(diff, opts) {
  opts = opts || {};
  G.startRun(diff);
  G.state = 'play';
  G.autoplay = true;
  if (opts.immortal) G.player.takeDamage = () => false;
  return G.player;
}

function toBoss(diff, immortal) {
  const p = freshRun(diff, { immortal });
  G.spawned = 200;
  G.kills = 200;
  p.gainXp(2000);          // 200 只小怪的经验 = LV21
  p.pendingCards = 0;
  G.state = 'play';
  G.spawnBoss();
  return p;
}

/* 1 */ check('存档初始化', () => {
  if (!NP.Save.data || typeof NP.Save.data.diamonds !== 'number') throw new Error('save 未初始化');
  return 'diamonds=' + NP.Save.data.diamonds + ' cleared=' + JSON.stringify(NP.Save.data.cleared);
});

/* 2 */ check('角色属性公式（设定集）', () => {
  const st = NP.computeStats(1, NP.newMods(), NP.Save.data.up);
  if (st.maxHp !== 1500 + 350) throw new Error('LV1 生命错误 ' + st.maxHp);
  if (st.atk !== 300 + 50) throw new Error('LV1 攻击错误 ' + st.atk);
  if (Math.abs(st.def - 52.5) > 1e-6) throw new Error('LV1 防御错误 ' + st.def);
  const s21 = NP.computeStats(21, NP.newMods(), NP.Save.data.up);
  if (s21.maxHp !== 1500 + 350 * 21) throw new Error('LV21 生命错误 ' + s21.maxHp);
  if (s21.atk !== 300 + 50 * 21) throw new Error('LV21 攻击错误 ' + s21.atk);
  if (Math.abs(s21.defReduce - 102.5 * 0.0002) > 1e-9) throw new Error('防御减伤公式错误 ' + s21.defReduce);
  return `LV1 hp=${st.maxHp} atk=${st.atk} def=${st.def} | LV21 hp=${s21.maxHp} atk=${s21.atk} def=${s21.def}`;
});

/* 3 */ check('难度倍率', () => {
  const out = NP.DIFFS.map((d) => d.mult).join('/');
  if (out !== '1/2.5/5/15') throw new Error('倍率错误 ' + out);
  return '×' + out + ' | 噩梦技能频率 ×' + NP.DIFFS[3].id;
});

/* 4 */ check('刷怪节奏（无敌玩家 60 秒）', () => {
  const p = freshRun(1, { immortal: true });
  for (let i = 0; i < 60 * 60; i++) {
    G.step(1 / 60);
    if (i % 20 === 0) G.render();
  }
  if (G.spawned < 45) throw new Error('刷怪太慢：60s 仅 ' + G.spawned);
  if (G.kills < 40) throw new Error('击杀太慢：60s 仅 ' + G.kills);
  return `kills=${G.kills} spawned=${G.spawned} alive=${G.mobs.length} lv=${p.level} 钻石=${G.runDiamonds} 子弹=${G.pBullets.length}`;
});

/* 5 */ check('清剿 200 后首领登场（第 200 杀恰好同时升级的真实流程）', () => {
  const p = freshRun(2);
  G.autoplay = true;
  p.gainXp(1990);          // 199 杀 = 1990 经验 → LV20
  G.close('#cardOverlay');
  p.pendingCards = 0;
  G.state = 'play';
  G.kills = 199;
  G.spawned = 200;
  const m = new NP.Mob(G, 'assault', p.x + 220, p.y);
  G.mobs.push(m);
  G.damageMob(m, 1e9, false, true);   // 第 200 杀：+10 经验 → LV21 → 弹选卡

  if (G.kills !== 200) throw new Error('击杀计数错误 ' + G.kills);
  if (G.state !== 'cards') throw new Error('第 200 杀应触发升级选卡，实际状态 ' + G.state);
  if (G.boss) throw new Error('选卡界面还没结束时不应生成首领');
  if (!G.bossPending) throw new Error('未记录待生成标记');

  const card = NP.drawCards(p.stacks, 1)[0];
  G.applyCard(card);                 // 玩家选卡
  if (!G.boss) throw new Error('选卡结束后首领仍未生成');
  return `LV.${p.level} · 选卡后 HP=${G.boss.maxHp} ATK=${Math.round(G.boss.atk)} DEF=${Math.round(G.boss.def)}`;
});

/* 6 */ check('首领技能覆盖（无敌玩家 45 秒）', () => {
  toBoss(1, true);
  const seen = new Set();
  let shield = false, clone = false;
  for (let i = 0; i < 45 * 60; i++) {
    G.step(1 / 60);
    if (i % 10 === 0) G.render();
    const b = G.boss;
    if (b) {
      if (b.cast) seen.add(b.cast.type);
      if (b.shield > 0) shield = true;
    }
    if (G.clones.length) clone = true;
    if (!b) break;
  }
  const need = ['blink', 'charge', 'barrage', 'shield', 'clone'];
  const missing = need.filter((k) => !seen.has(k) && !(k === 'shield' && shield) && !(k === 'clone' && clone));
  if (missing.length) throw new Error('未覆盖技能: ' + missing.join(','));
  return `技能=${[...seen].join('/')} 护盾=${shield} 分身=${clone} 剩余HP=${G.boss ? Math.round(G.boss.hp) : '已击破'}`;
});

/* 7 */ check('狂暴：25% 触发 + 90% 攻击震荡', () => {
  const p = toBoss(1, false);
  for (let i = 0; i < 30; i++) G.step(1 / 60);   // 让初始无敌帧过期
  p.iframe = 0;
  const b = G.boss;
  b.hp = b.maxHp * 0.26;
  G.damageBoss(b, b.maxHp * 0.02, false, true);
  if (!b.enraged) throw new Error('25% 未进入狂暴, hp=' + (b.hp / b.maxHp).toFixed(3));
  if (b.freq !== 1.25) throw new Error('狂暴后技能频率应为 ×1.25，实为 ' + b.freq);
  const hp0 = p.hp;
  let dealt = 0;
  for (let i = 0; i < 90; i++) {
    const before = p.hp;
    G.step(1 / 60);
    dealt += Math.max(0, before - p.hp);
  }
  if (dealt <= 0) throw new Error('震荡未造成伤害（hp ' + Math.round(hp0) + '→' + Math.round(p.hp) + '）');
  return `freq=${b.freq} 震荡前 hp=${Math.round(hp0)} 震荡伤害≈${Math.round(dealt)}`;
});

/* 8 */ check('参考构筑：四档首领击杀耗时', () => {
  const builds = {
    输出向: ['bullet', 'rate', 'crit', 'critdmg', 'bullet', 'rate', 'crit', 'critdmg',
      'bullet', 'overflow', 'rate', 'crit', 'bullet', 'critdmg', 'rate', 'crit',
      'bullet', 'overflow', 'rate', 'crit'],
    均衡向: ['bullet', 'rate', 'hp', 'crit', 'armor', 'bullet', 'cdr', 'rate', 'crit',
      'lifesteal', 'hp', 'bullet', 'armor', 'cdr', 'rate', 'crit', 'bullet', 'move', 'regen', 'critdmg']
  };
  const lines = [];
  for (const key in builds) {
    const out = [];
    for (const d of [0, 1, 2, 3]) {
      const p = toBoss(d, true);
      for (const id of builds[key]) {
        const c = NP.CARDS_BY_ID[id];
        if (!c) continue;
        if ((p.stacks[c.id] || 0) < c.max) p.addCard(c);
      }
      let t = 0;
      const limit = 240 * 60;
      while (t < limit && G.boss) {
        // 模拟正常玩家：技能卡着冷却用
        if (p.cd.q <= 0) p.doOverclock();
        if (p.cd.r <= 0) p.doLaser();
        if (p.cd.e <= 0 && p.hp < p.maxHp * 0.55) p.doEmp();
        G.step(1 / 60);
        if (t % 12 === 0) G.render();
        t++;
      }
      out.push(`${NP.DIFFS[d].name}:${G.boss ? '>240s' : (t / 60).toFixed(0) + 's'}`);
      if (d === 0) out.push(`(ATK ${Math.round(p.stats.atk)}/HP ${p.maxHp}/射速 ${p.stats.fireRate.toFixed(1)})`);
    }
    lines.push(key + ' ' + out.join(' '));
  }
  return lines.join('  ||  ');
});

/* 8b */ if (process.env.DIAG) check('DPS 诊断（噩梦 20s）', () => {
  const p = toBoss(3, true);
  for (const id of ['bullet', 'rate', 'crit', 'critdmg', 'bullet', 'rate', 'crit', 'critdmg',
    'bullet', 'overflow', 'rate', 'crit', 'bullet', 'critdmg', 'rate', 'crit',
    'bullet', 'overflow', 'rate', 'crit']) {
    const c = NP.CARDS_BY_ID[id];
    if (c && (p.stacks[c.id] || 0) < c.max) p.addCard(c);
  }
  let dmg = 0, cloneDmg = 0;
  const orig = G.damageBoss.bind(G);
  G.damageBoss = (b, d, c, s) => {
    const before = b ? b.hp : 0;
    orig(b, d, c, s);
    const dealt = Math.max(0, before - (b ? b.hp : 0));
    if (b && b.isClone) cloneDmg += dealt; else dmg += dealt;
  };
  let alive = 0;
  for (let i = 0; i < 20 * 60; i++) {
    if (p.cd.q <= 0) p.doOverclock();
    if (p.cd.r <= 0) p.doLaser();
    G.step(1 / 60);
    alive += G.clones.length;
  }
  G.damageBoss = orig;
  return `20s 对本体 ${Math.round(dmg)}（${Math.round(dmg / 20)}/s），对分身 ${Math.round(cloneDmg)}，平均分身数 ${(alive / 1200).toFixed(1)}，剩余 ${G.boss ? Math.round(G.boss.hp) : 0}/${G.boss ? G.boss.maxHp : 0}`;
});

/* 8b */ check('噩梦：满钻石强化下的耗时', () => {
  const backup = JSON.parse(JSON.stringify(NP.Save.data.up));
  NP.Save.data.up = { hp: 10, atk: 10, def: 10, rate: 10, crit: 10, cdr: 10 };
  try {
    const p = toBoss(3, true);
    for (const id of ['bullet', 'rate', 'crit', 'critdmg', 'bullet', 'rate', 'crit', 'critdmg',
      'bullet', 'overflow', 'rate', 'crit', 'bullet', 'critdmg', 'rate', 'crit',
      'bullet', 'overflow', 'rate', 'crit']) {
      const c = NP.CARDS_BY_ID[id];
      if (c && (p.stacks[c.id] || 0) < c.max) p.addCard(c);
    }
    let t = 0;
    while (t < 240 * 60 && G.boss) {
      if (p.cd.q <= 0) p.doOverclock();
      if (p.cd.r <= 0) p.doLaser();
      G.step(1 / 60);
      t++;
    }
    if (G.boss) throw new Error('满强化下 240 秒仍未击破噩梦首领');
    return `${(t / 60).toFixed(0)}s（ATK ${Math.round(p.stats.atk)} / 射速 ${p.stats.fireRate.toFixed(1)} / 暴击 ${(p.stats.crit * 100).toFixed(0)}%）`;
  } finally {
    NP.Save.data.up = backup;
  }
});

/* 9 */ check('钻石永久强化生效', () => {
  NP.Save.data.diamonds = 100000;
  const before = NP.Save.data.up.atk;
  NP.Save.data.up.atk = before + 1;
  NP.Save.data.up.hp = 1;
  const p = freshRun(0);
  const atkUp = p.stats.atk, hpUp = p.maxHp;
  NP.Save.data.up.atk = before;
  NP.Save.data.up.hp = 0;
  const p2 = freshRun(0);
  if (!(atkUp > p2.stats.atk)) throw new Error('攻击强化无效');
  if (!(hpUp > p2.maxHp)) throw new Error('生命强化无效');
  return `ATK ${p2.stats.atk}→${atkUp}, HP ${p2.maxHp}→${hpUp}`;
});

/* 10 */ check('存档码导出 / 导入', () => {
  NP.Save.data.diamonds = 4242;
  const code = NP.Save.exportCode();
  if (!code || code.indexOf('NP1-') !== 0) throw new Error('导出码格式错误');
  NP.Save.data.diamonds = 0;
  const r = NP.Save.importCode(code);
  if (r !== true) throw new Error('导入失败: ' + r);
  if (NP.Save.data.diamonds !== 4242) throw new Error('导入后数据不符 ' + NP.Save.data.diamonds);
  const bad = NP.Save.importCode('garbage');
  if (bad === true) throw new Error('错误存档码应被拒绝');
  return `长度=${code.length}`;
});

/* 11 */ check('升级与选卡', () => {
  const p = freshRun(0);
  p.gainXp(1000);
  if (p.level !== 11) throw new Error('1000 经验应升到 LV11，实为 ' + p.level);
  const cards = NP.drawCards(p.stacks, 3);
  if (cards.length !== 3) throw new Error('抽卡数量错误 ' + cards.length);
  const full = {};
  NP.CARDS.forEach((c) => { full[c.id] = c.max; });
  if (NP.drawCards(full, 3).length !== 0) throw new Error('满级卡池仍可抽卡');
  p.addCard(NP.CARDS_BY_ID.bullet);
  const atkAfter = p.stats.atk;
  if (!(atkAfter > 300 + 50 * p.level)) throw new Error('卡牌未影响属性');
  return `LV=${p.level} 卡池=${cards.map((c) => c.name).join('/')} ATK=${atkAfter}`;
});

/* 11b 回归：输入绑定 */
check('键盘 / 鼠标输入绑定', () => {
  const fire = (type, ev) => (winListeners[type] || []).forEach((f) => f(ev));
  if (!(winListeners.keydown || []).length) throw new Error('没有注册键盘监听（Input.bind 未调用）');
  const kd = { code: 'KeyD', preventDefault() { } };

  fire('keydown', kd);
  if (!NP.Input.keys.KeyD) throw new Error('keydown 未写入按键状态');
  fire('keyup', kd);
  if (NP.Input.keys.KeyD) throw new Error('keyup 未清除按键状态');

  fire('mousemove', { clientX: 900, clientY: 400 });
  if (NP.Input.mouse.x !== 900 || NP.Input.mouse.y !== 400) throw new Error('mousemove 未更新坐标');

  (G.canvas._listeners.mousedown || []).forEach((f) => f({ button: 0, target: G.canvas }));
  if (!NP.Input.mouse.down) throw new Error('画布左键未触发射击');
  fire('mouseup', { button: 0 });
  if (NP.Input.mouse.down) throw new Error('mouseup 未复位射击状态');

  const p = freshRun(0);
  G.autoplay = false;
  const x0 = p.x;
  fire('keydown', kd);
  for (let i = 0; i < 30; i++) G.step(1 / 60);
  fire('keyup', kd);
  if (!(p.x > x0 + 20)) throw new Error(`按 D 未向右移动: ${x0.toFixed(1)} → ${p.x.toFixed(1)}`);
  return `按住 D 半秒：x ${x0.toFixed(0)} → ${p.x.toFixed(0)}`;
});

/* 11c 横版物理 */
check('横版跳跃 / 落地', () => {
  const p = freshRun(0);
  G.autoplay = false;
  const fire = (type, ev) => (winListeners[type] || []).forEach((f) => f(ev));
  const y0 = p.y;
  if (Math.abs(y0 - G.groundY) > 1) throw new Error('玩家未站在地面: ' + y0);
  const sp = { code: 'Space', preventDefault() { } };
  fire('keydown', sp);
  for (let i = 0; i < 18; i++) G.step(1 / 60);
  const yMid = p.y;
  if (!(yMid < y0 - 40)) throw new Error('跳跃未生效 ' + y0 + ' -> ' + yMid);
  fire('keyup', sp);
  for (let i = 0; i < 150; i++) G.step(1 / 60);
  if (Math.abs(p.y - y0) > 2) throw new Error('未落回地面 ' + p.y);
  return `起跳高度 ${Math.round(y0 - yMid)}px，落回 y=${Math.round(p.y)}`;
});

/* 11d 自动锁定 */
check('攻击自动锁定 / 手动接管', () => {
  const p = freshRun(0);
  G.autoplay = false;
  NP.Save.data.settings.lock = true;
  NP.Save.data.settings.auto = true;
  G.mobs.length = 0;
  G.clones.length = 0;
  G.boss = null;
  const m = new NP.Mob(G, 'assault', p.x + 300, G.groundY, false);
  m.spawnT = 0;
  G.mobs.push(m);
  p._mx = NP.Input.mouse.x;
  p._my = NP.Input.mouse.y;
  for (let i = 0; i < 6; i++) G.step(1 / 60);
  if (p.lockTarget !== m) throw new Error('未锁定最近的敌人');
  const want = Math.atan2(m.cy - p.chestY, m.x - p.x);
  if (Math.abs(p.aim - want) > 0.06) throw new Error('锁定角度不正确 ' + p.aim.toFixed(2) + ' vs ' + want.toFixed(2));

  NP.Input.mouse.x += 45;
  NP.Input.mouse.y += 25;
  G.step(1 / 60);
  if (p.lockTarget) throw new Error('移动鼠标后未切回手动瞄准');
  return `锁定角度 ${want.toFixed(2)}，移动鼠标后已转手动`;
});

/* 12 */ check('死亡流程', () => {
  const p = freshRun(1);
  p.iframe = 0;
  p.takeDamage(1e9);
  if (p.hp !== 0) throw new Error('死亡未归零');
  if (G.state !== 'dead') throw new Error('死亡状态错误 ' + G.state);
  G.showResult(false);
  if (G.state !== 'result') throw new Error('结算状态错误 ' + G.state);
  return '状态=' + G.state;
});

/* 13 */ check('单文件构建完整', () => {
  const out = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8');
  if (/<script src=/.test(out)) throw new Error('仍存在外部脚本引用');
  if (/<link[^>]+stylesheet/.test(out)) throw new Error('仍存在外部样式引用');
  return Math.round(out.length / 1024) + ' KB';
});

/* ---------------- 输出 ---------------- */
let fail = 0;
console.log('\n=== 霓虹协议 · 无头冒烟测试 ===\n');
for (const r of results) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  if (r.info) console.log('      ' + r.info);
}
console.log(`\n结果: ${results.length - fail}/${results.length} 通过\n`);
process.exit(fail ? 1 : 0);