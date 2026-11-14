/* =====================================================================
   霓虹协议 · core.js
   工具 / 存档 / 音频 / 输入 / 相机 / 程序化美术
   ===================================================================== */
(function () {
  'use strict';
  const NP = window.NP = window.NP || {};

  /* ---------------- 基础工具 ---------------- */
  const TAU = Math.PI * 2;
  NP.TAU = TAU;
  NP.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  NP.lerp = (a, b, t) => a + (b - a) * t;
  NP.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  NP.randi = (a, b) => Math.floor(NP.rand(a, b + 1));
  NP.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  NP.chance = (p) => Math.random() < p;
  NP.dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  NP.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  NP.angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  NP.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
  NP.fmt = function (n) {
    n = Math.round(n);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  };
  NP.mmss = function (s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  NP.$ = (s, r) => (r || document).querySelector(s);
  NP.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 配色 ---------------- */
  NP.COL = {
    cyan: '#3fe6ff', cyanDim: '#0d8ea8', mag: '#ff2f7d', vio: '#a06bff',
    amber: '#ffbc4a', lime: '#b6ff4a', red: '#ff3b52', white: '#ffffff',
    ink: '#05060c', steel: '#2a3a55', steel2: '#4a6285'
  };

  /* ---------------- 存档 ---------------- */
  const SAVE_KEY = 'neon_protocol_save_v1';
  const DEFAULT_SAVE = {
    v: 1,
    diamonds: 0,
    up: { hp: 0, atk: 0, def: 0, rate: 0, crit: 0, cdr: 0 },
    cleared: [false, false, false, false],
    best: [0, 0, 0, 0],
    runs: 0, kills: 0, bossKills: 0, deaths: 0,
    settings: { audio: true, auto: true, shake: true, dmgNum: true, lock: true }
  };

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  const Save = NP.Save = {
    data: deepClone(DEFAULT_SAVE),
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          this.data = Object.assign(deepClone(DEFAULT_SAVE), d);
          this.data.up = Object.assign({}, DEFAULT_SAVE.up, d.up || {});
          this.data.settings = Object.assign({}, DEFAULT_SAVE.settings, d.settings || {});
          if (!Array.isArray(this.data.cleared)) this.data.cleared = [false, false, false, false];
          if (!Array.isArray(this.data.best)) this.data.best = [0, 0, 0, 0];
        }
      } catch (e) { console.warn('存档读取失败', e); }
      return this.data;
    },
    write() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* 隐私模式忽略 */ }
    },
    reset() {
      this.data = deepClone(DEFAULT_SAVE);
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
      this.write();
    },
    exportCode() {
      try {
        const json = JSON.stringify(this.data);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        return 'NP1-' + b64;
      } catch (e) { return ''; }
    },
    importCode(code) {
      try {
        code = String(code || '').trim();
        if (!code) return '存档码为空';
        if (code.indexOf('NP1-') === 0) code = code.slice(4);
        const json = decodeURIComponent(escape(atob(code)));
        const d = JSON.parse(json);
        if (typeof d !== 'object' || d === null) return '存档码格式错误';
        const merged = Object.assign(deepClone(DEFAULT_SAVE), d);
        merged.up = Object.assign({}, DEFAULT_SAVE.up, d.up || {});
        merged.settings = Object.assign({}, DEFAULT_SAVE.settings, d.settings || {});
        if (!Array.isArray(merged.cleared)) merged.cleared = [false, false, false, false];
        if (!Array.isArray(merged.best)) merged.best = [0, 0, 0, 0];
        this.data = merged;
        this.write();
        return true;
      } catch (e) { return '存档码无法解析'; }
    }
  };

  /* ---------------- 永久强化定义 ---------------- */
  NP.UPGRADES = [
    { id: 'hp', icon: '❖', name: '生命扩容', en: 'VITALITY', base: 55, max: 10, effect: (n) => `最大生命 +${n * 8}%`, unit: '50 护甲' },
    { id: 'atk', icon: '✦', name: '火力校准', en: 'FIREPOWER', base: 75, max: 10, effect: (n) => `攻击力 +${n * 8}%` },
    { id: 'def', icon: '▣', name: '装甲镀层', en: 'PLATING', base: 45, max: 10, effect: (n) => `防御力 +${n * 50}` },
    { id: 'rate', icon: '⚡', name: '枪机超频', en: 'RATE', base: 65, max: 10, effect: (n) => `攻速 +${n * 6}%` },
    { id: 'crit', icon: '◎', name: '弱点解析', en: 'WEAKPOINT', base: 85, max: 10, effect: (n) => `暴击率 +${n * 4}%` },
    { id: 'cdr', icon: '◷', name: '冷却矩阵', en: 'COOLDOWN', base: 80, max: 10, effect: (n) => `技能冷却 -${(n * 3.5).toFixed(1)}%` }
  ];
  NP.upCost = (u, lvl) => Math.round(u.base * Math.pow(1.22, lvl));

  /* ---------------- 难度定义 ---------------- */
  NP.DIFFS = [
    { id: 0, name: '简单', en: 'EASY', mult: 1, mobHp: 1, mobAtk: 1, desc: '首领保持基础属性，适合熟悉机制。' },
    { id: 1, name: '普通', en: 'NORMAL', mult: 2.5, mobHp: 1.25, mobAtk: 1.15, desc: '首领属性 ×2.5，义体被适度强化。' },
    { id: 2, name: '困难', en: 'HARD', mult: 5, mobHp: 1.6, mobAtk: 1.35, desc: '首领属性 ×5，容错率大幅下降。' },
    { id: 3, name: '噩梦', en: 'NIGHTMARE', mult: 15, mobHp: 2.4, mobAtk: 1.7, desc: '首领属性 ×15，技能频率翻倍。通关三档后解锁。', hidden: true }
  ];

  /* ---------------- 音频（全程序化合成） ---------------- */
  const Audio = NP.Audio = {
    ctx: null, master: null, sfxGain: null, musicGain: null,
    enabled: true, started: false, noiseBuf: null,
    lastShot: 0, musicTimer: null, step: 0, intensity: 0,
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.5;
        this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
        // 噪声缓冲
        const len = this.ctx.sampleRate * 1;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
      } catch (e) { this.ctx = null; }
    },
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.9 : 0;
      if (!on) this.stopMusic(); else if (this.started) this.startMusic();
    },
    tone(o) {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      const { type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.2, delay = 0, detune = 0 } = o;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t + delay);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      if (detune) osc.detune.value = detune;
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      osc.connect(g); g.connect(this.sfxGain);
      osc.start(t + delay); osc.stop(t + delay + dur + 0.02);
    },
    noise(o) {
      if (!this.ctx || !this.enabled || !this.noiseBuf) return;
      const t = this.ctx.currentTime;
      const { dur = 0.2, vol = 0.2, f0 = 1200, f1 = 200, q = 1, delay = 0 } = o;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.Q.value = q;
      filt.frequency.setValueAtTime(f0, t + delay);
      filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + delay + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
      src.start(t + delay); src.stop(t + delay + dur + 0.02);
    },
    sfx(name, arg) {
      if (!this.ctx || !this.enabled) return;
      switch (name) {
        case 'shoot':
          this.tone({ type: 'square', f0: 820, f1: 260, dur: 0.06, vol: 0.075 });
          this.tone({ type: 'sawtooth', f0: 1400, f1: 400, dur: 0.045, vol: 0.035 });
          break;
        case 'shootOver':
          this.tone({ type: 'sawtooth', f0: 1200, f1: 320, dur: 0.07, vol: 0.08 });
          break;
        case 'hit': this.noise({ dur: 0.07, vol: 0.1, f0: 2400, f1: 700, q: 1.4 }); break;
        case 'crit':
          this.noise({ dur: 0.09, vol: 0.14, f0: 3200, f1: 900, q: 2 });
          this.tone({ type: 'triangle', f0: 1600, f1: 900, dur: 0.07, vol: 0.06 });
          break;
        case 'kill':
          this.noise({ dur: 0.26, vol: 0.16, f0: 800, f1: 90, q: 0.8 });
          this.tone({ type: 'sawtooth', f0: 200, f1: 60, dur: 0.22, vol: 0.1 });
          break;
        case 'bigKill':
          this.noise({ dur: 0.5, vol: 0.26, f0: 600, f1: 60, q: 0.7 });
          this.tone({ type: 'sine', f0: 120, f1: 40, dur: 0.4, vol: 0.18 });
          break;
        case 'hurt':
          this.tone({ type: 'square', f0: 190, f1: 90, dur: 0.16, vol: 0.16 });
          this.noise({ dur: 0.12, vol: 0.1, f0: 900, f1: 200 });
          break;
        case 'dash':
          this.tone({ type: 'sawtooth', f0: 300, f1: 1500, dur: 0.16, vol: 0.1 });
          this.noise({ dur: 0.18, vol: 0.09, f0: 400, f1: 3000, q: 0.7 });
          break;
        case 'overclock':
          [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.16, vol: 0.09, delay: i * 0.045 }));
          break;
        case 'emp':
          this.tone({ type: 'sine', f0: 220, f1: 45, dur: 0.6, vol: 0.26 });
          this.noise({ dur: 0.5, vol: 0.18, f0: 3000, f1: 120, q: 0.6 });
          break;
        case 'laser':
          this.tone({ type: 'sawtooth', f0: 2200, f1: 180, dur: 0.42, vol: 0.2 });
          this.noise({ dur: 0.4, vol: 0.16, f0: 5000, f1: 400, q: 0.8 });
          break;
        case 'levelup':
          [523, 784, 1046, 1568].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.22, vol: 0.11, delay: i * 0.07 }));
          break;
        case 'card':
          this.tone({ type: 'triangle', f0: 880, f1: 1320, dur: 0.12, vol: 0.1 });
          break;
        case 'pickup':
          this.tone({ type: 'triangle', f0: 1600, f1: 2400, dur: 0.07, vol: 0.06 });
          break;
        case 'buy':
          this.tone({ type: 'square', f0: 660, f1: 990, dur: 0.1, vol: 0.1 });
          this.tone({ type: 'square', f0: 990, f1: 1320, dur: 0.1, vol: 0.07, delay: 0.07 });
          break;
        case 'deny':
          this.tone({ type: 'square', f0: 220, f1: 150, dur: 0.14, vol: 0.12 });
          break;
        case 'bossSpawn':
          this.tone({ type: 'sine', f0: 60, f1: 34, dur: 1.6, vol: 0.34 });
          this.noise({ dur: 1.4, vol: 0.16, f0: 300, f1: 60, q: 0.5 });
          [110, 164, 220].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, dur: 1.4, vol: 0.07, delay: i * 0.12 }));
          break;
        case 'rage':
          this.tone({ type: 'sawtooth', f0: 300, f1: 90, dur: 0.9, vol: 0.22 });
          this.tone({ type: 'square', f0: 900, f1: 300, dur: 0.6, vol: 0.1 });
          break;
        case 'blink':
          this.tone({ type: 'sine', f0: 1800, f1: 200, dur: 0.2, vol: 0.12 });
          this.noise({ dur: 0.16, vol: 0.1, f0: 5000, f1: 800 });
          break;
        case 'charge':
          this.tone({ type: 'sawtooth', f0: 90, f1: 200, dur: 0.6, vol: 0.18 });
          this.noise({ dur: 0.55, vol: 0.1, f0: 300, f1: 1200, q: 0.6 });
          break;
        case 'shield':
          this.tone({ type: 'sine', f0: 600, f1: 1400, dur: 0.3, vol: 0.14 });
          this.tone({ type: 'triangle', f0: 900, f1: 1800, dur: 0.3, vol: 0.08, delay: 0.05 });
          break;
        case 'heal':
          this.tone({ type: 'sine', f0: 520, f1: 900, dur: 0.25, vol: 0.1 });
          break;
        case 'bossDie':
          this.noise({ dur: 2.2, vol: 0.3, f0: 900, f1: 40, q: 0.5 });
          this.tone({ type: 'sine', f0: 90, f1: 20, dur: 2, vol: 0.28 });
          break;
        case 'win':
          [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.12, delay: i * 0.12 }));
          break;
        case 'lose':
          [440, 392, 330, 262].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, dur: 0.5, vol: 0.11, delay: i * 0.16 }));
          break;
        case 'ui': this.tone({ type: 'square', f0: 1200, f1: 1600, dur: 0.04, vol: 0.045 }); break;
        case 'alarm':
          this.tone({ type: 'square', f0: 880, f1: 660, dur: 0.18, vol: 0.1 });
          break;
      }
    },
    /* 极简暗黑合成器循环 */
    startMusic() {
      if (!this.ctx || this.musicTimer || !this.enabled) return;
      this.started = true;
      const bassSeq = [0, 0, 0, 0, -3, -3, 2, 2];
      const scale = [55, 58.27, 65.41, 73.42, 82.41, 87.31];
      let tick = 0;
      this.musicTimer = setInterval(() => {
        if (!this.ctx || !this.enabled) return;
        const t = this.ctx.currentTime;
        const step = tick % 16;
        if (step % 4 === 0) {
          const n = bassSeq[(tick >> 2) % bassSeq.length];
          const f = 55 * Math.pow(2, n / 12);
          this._musicNote(f, 0.5, 'sawtooth', 0.16);
          this._musicNote(f * 2, 0.45, 'square', 0.035);
        }
        if (this.intensity > 0 && step % 2 === 0) {
          const f = scale[(tick * 3) % scale.length] * 4;
          this._musicNote(f, 0.22, 'triangle', 0.045);
        }
        if (step === 0 || step === 6 || step === 10) {
          this._noiseMusic(0.09, 0.05);
        }
        if (step === 4 || step === 12) this._noiseMusic(0.16, 0.09);
        tick++;
      }, 145);
    },
    _musicNote(f, dur, type, vol) {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.02);
    },
    _noiseMusic(dur, vol) {
      if (!this.noiseBuf) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.musicGain);
      src.start(t); src.stop(t + dur + 0.01);
    },
    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    }
  };

  /* ---------------- 输入 ---------------- */
  const Input = NP.Input = {
    keys: Object.create(null),
    queue: [],
    mouse: { x: 0, y: 0, down: false, wx: 0, wy: 0 },
    bound: false,
    /* 在输入框 / 文本域里打字时不驱动游戏 */
    _typing() {
      const el = document.activeElement;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    },
    bind(canvas) {
      if (this.bound) return;
      this.bound = true;
      const el = canvas || document.querySelector('#game');
      window.addEventListener('keydown', (e) => {
        if (this._typing()) return;
        const c = e.code || e.key;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
        if (!this.keys[c]) this.queue.push(c);
        this.keys[c] = true;
      });
      window.addEventListener('keyup', (e) => { this.keys[e.code || e.key] = false; });
      window.addEventListener('blur', () => { this.keys = Object.create(null); this.mouse.down = false; });
      window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
      // 只把画布上的左键当作射击，避免点 UI 按钮时开火
      if (el) el.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.down = true; });
      window.addEventListener('mousedown', (e) => {
        // 画布之外按下不置位（保留窗口级兜底，防止指针在画布外按下后状态卡住）
        if (e.button === 0 && e.target === el) this.mouse.down = true;
      });
      window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
      if (el) el.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    consume() { const q = this.queue; this.queue = []; return q; }
  };

  /* ---------------- 相机 ---------------- */
  NP.Camera = class {
    constructor() {
      this.x = 0; this.y = 0; this.zoom = 1; this.shake = 0; this.sx = 0; this.sy = 0; this.w = 1280; this.h = 720;
      this.tilt = 0.78;   // 纵向压缩，模拟 3/4 俯视（立体视角）
    }
    resize(w, h) { this.w = w; this.h = h; }
    follow(tx, ty, dt, ww, wh) {
      const halfW = this.w / 2 / this.zoom, halfH = this.h / 2 / (this.zoom * this.tilt);
      let cx = tx, cy = ty;
      if (ww > halfW * 2) cx = NP.clamp(cx, halfW, ww - halfW); else cx = ww / 2;
      if (wh > halfH * 2) cy = NP.clamp(cy, halfH, wh - halfH); else cy = wh / 2;
      const k = 1 - Math.pow(0.0015, dt);
      this.x = NP.lerp(this.x, cx, k);
      this.y = NP.lerp(this.y, cy, k);
      if (this.shake > 0.01) {
        this.shake = Math.max(0, this.shake - dt * 26);
        this.sx = NP.rand(-1, 1) * this.shake;
        this.sy = NP.rand(-1, 1) * this.shake;
      } else { this.shake = 0; this.sx = this.sy = 0; }
    }
    apply(ctx) {
      ctx.translate(this.w / 2 + this.sx, this.h / 2 + this.sy);
      ctx.scale(this.zoom, this.zoom * this.tilt);
      ctx.translate(-this.x, -this.y);
    }
    screenToWorld(sx, sy) {
      return {
        x: (sx - this.w / 2 - this.sx) / this.zoom + this.x,
        y: (sy - this.h / 2 - this.sy) / (this.zoom * this.tilt) + this.y
      };
    }
  };

  /* ---------------- 程序化美术 ---------------- */
  const glowCache = new Map();
  const Art = NP.Art = {
    glow(color) {
      if (glowCache.has(color)) return glowCache.get(color);
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, color);
      grd.addColorStop(0.25, color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 1;
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      glowCache.set(color, c);
      return c;
    },
    drawGlow(ctx, x, y, r, color, alpha) {
      const sp = this.glow(color);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha === undefined ? 0.6 : alpha;
      ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
      ctx.restore();
    },
    rr(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    poly(ctx, pts) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
    },
    /* 通用角色：卡通赛博义体 · 可旋转枪臂（不翻转身体，保证任何角度都清晰可辨） */
    drawHero(ctx, o) {
      const {
        x = 0, y = 0, scale = 1, aim = 0, facing = 1, t = 0,
        hurt = 0, dash = 0, over = 0, alpha = 1, walk = 0, showGun = true, tilt = 1
      } = o;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      if (tilt && tilt !== 1) ctx.scale(1, 1 / tilt);   // 抵消相机纵向压缩，让角色保持直立比例
      const bob = Math.sin(t * 6) * 1.3 + walk * Math.sin(t * 17) * 1.7;
      const swing = walk * Math.sin(t * 17);
      const overC = over > 0;
      const accent = overC ? '#ff2f7d' : '#3fe6ff';

      // 地面阴影
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(0, 3, 20, 6.5, 0, 0, TAU); ctx.fill();

      // 超频环
      if (overC) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,47,125,.55)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 2, 27 + Math.sin(t * 12) * 3, 9, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      if (dash > 0) ctx.globalAlpha = alpha * 0.42;

      /* ---------- 腿 ---------- */
      ctx.fillStyle = '#182742';
      Art.rr(ctx, -10 + swing * 2.2, -24, 9, 21, 4); ctx.fill();
      Art.rr(ctx, 1 - swing * 2.2, -24, 9, 21, 4); ctx.fill();
      ctx.fillStyle = 'rgba(63,230,255,.75)';
      ctx.fillRect(-9 + swing * 2.2, -15, 7, 1.8);
      ctx.fillRect(2 - swing * 2.2, -15, 7, 1.8);
      ctx.fillStyle = '#0b1322';
      Art.rr(ctx, -12 + swing * 2.2, -6, 12, 7, 3); ctx.fill();
      Art.rr(ctx, 1 - swing * 2.2, -6, 12, 7, 3); ctx.fill();
      ctx.fillStyle = '#b6ff4a';
      ctx.fillRect(-11 + swing * 2.2, -2.2, 9, 1.4);
      ctx.fillRect(2 - swing * 2.2, -2.2, 9, 1.4);

      /* ---------- 背包 ---------- */
      const by = bob;
      ctx.fillStyle = '#12203a';
      Art.rr(ctx, -17, -52 + by, 9, 22, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(63,230,255,.3)'; ctx.lineWidth = 1;
      Art.rr(ctx, -17, -52 + by, 9, 22, 3); ctx.stroke();
      ctx.fillStyle = 'rgba(63,230,255,.55)';
      ctx.fillRect(-15, -48 + by, 5, 1.5);
      ctx.fillRect(-15, -44.5 + by, 5, 1.5);

      /* ---------- 躯干 ---------- */
      const g1 = ctx.createLinearGradient(-14, -56, 12, -20);
      g1.addColorStop(0, '#3b5a88');
      g1.addColorStop(0.55, '#25405f');
      g1.addColorStop(1, '#131f34');
      ctx.fillStyle = g1;
      Art.rr(ctx, -14, -54 + by, 28, 32, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(150,235,255,.35)'; ctx.lineWidth = 1.2;
      Art.rr(ctx, -14, -54 + by, 28, 32, 7); ctx.stroke();
      // 领口
      ctx.fillStyle = '#0d1728';
      Art.poly(ctx, [[-8, -54 + by], [8, -54 + by], [4, -47 + by], [-4, -47 + by]]); ctx.fill();
      ctx.fillStyle = accent;
      Art.poly(ctx, [[-4, -50 + by], [4, -50 + by], [2.5, -47.5 + by], [-2.5, -47.5 + by]]); ctx.fill();
      // 前襟
      ctx.strokeStyle = 'rgba(10,20,36,.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -47 + by); ctx.lineTo(0, -24 + by); ctx.stroke();
      // 胸核心
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(-5.5, -40 + by, 2.6, 0, TAU); ctx.fill();
      Art.drawGlow(ctx, -5.5, -40 + by, 13, overC ? 'rgba(255,47,125,.95)' : 'rgba(63,230,255,.95)', .55);
      // 腰带
      ctx.fillStyle = '#0a1424';
      ctx.fillRect(-14, -30 + by, 28, 5);
      ctx.fillStyle = accent;
      ctx.fillRect(-2.5, -29.5 + by, 5, 3.5);
      // 肩甲
      ctx.fillStyle = '#2b4467';
      Art.rr(ctx, -20, -53 + by, 8, 11, 3); ctx.fill();
      Art.rr(ctx, 12, -53 + by, 8, 11, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(63,230,255,.4)'; ctx.lineWidth = 1;
      Art.rr(ctx, -20, -53 + by, 8, 11, 3); ctx.stroke();
      Art.rr(ctx, 12, -53 + by, 8, 11, 3); ctx.stroke();

      /* ---------- 头 ---------- */
      const hy = -62 + by;
      ctx.fillStyle = '#e8b894';
      Art.rr(ctx, -4, hy + 9, 8, 6, 2); ctx.fill();
      ctx.fillStyle = '#f4cba8';
      ctx.beginPath(); ctx.arc(0, hy, 13, 0, TAU); ctx.fill();
      // 头发
      ctx.fillStyle = '#e0286d';
      Art.poly(ctx, [
        [-13.5, hy - 1], [-15.5, hy - 9], [-10, hy - 8.5], [-11, hy - 16],
        [-4, hy - 11.5], [-1, hy - 19], [2.5, hy - 12], [8, hy - 17],
        [8.5, hy - 9.5], [13.5, hy - 8], [12.5, hy + 1], [7, hy - 4],
        [-5, hy - 4.5]
      ]); ctx.fill();
      ctx.fillStyle = '#3fe6ff';
      Art.poly(ctx, [[-1, hy - 19], [2.5, hy - 12], [5.5, hy - 14.5], [3.5, hy - 18]]); ctx.fill();
      ctx.fillStyle = 'rgba(255,47,125,.55)';
      Art.poly(ctx, [[-13.5, hy - 1], [-15.5, hy - 9], [-12.5, hy - 8], [-12, hy - 1]]); ctx.fill();
      // 耳机
      ctx.fillStyle = '#0c1729';
      Art.rr(ctx, -17.5, hy - 6, 5.5, 12, 2.5); ctx.fill();
      Art.rr(ctx, 12, hy - 6, 5.5, 12, 2.5); ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(-16.5, hy - 1.5, 3.5, 3);
      ctx.fillRect(13, hy - 1.5, 3.5, 3);
      // 护目镜
      ctx.fillStyle = 'rgba(8,16,28,.96)';
      Art.rr(ctx, -12.5, hy - 4.5, 25, 10.5, 5); ctx.fill();
      ctx.strokeStyle = overC ? 'rgba(255,47,125,.85)' : 'rgba(63,230,255,.8)';
      ctx.lineWidth = 1.1;
      Art.rr(ctx, -12.5, hy - 4.5, 25, 10.5, 5); ctx.stroke();
      // 眼睛
      ctx.fillStyle = overC ? '#ffd0e2' : '#c9f8ff';
      ctx.beginPath(); ctx.ellipse(-5, hy + 0.5, 2.6, 2.9, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, hy + 0.5, 2.6, 2.9, 0, 0, TAU); ctx.fill();
      // 反光
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      Art.poly(ctx, [[-12, hy - 4], [-3, hy - 4], [-7, hy + 4], [-12, hy + 4]]); ctx.fill();
      Art.drawGlow(ctx, 0, hy + 0.5, 20, overC ? 'rgba(255,47,125,.9)' : 'rgba(63,230,255,.9)', .42);
      // 天线
      ctx.strokeStyle = 'rgba(63,230,255,.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(13, hy - 6); ctx.lineTo(17, hy - 15); ctx.stroke();
      ctx.fillStyle = '#b6ff4a';
      ctx.beginPath(); ctx.arc(17, hy - 16.5, 2.1, 0, TAU); ctx.fill();
      Art.drawGlow(ctx, 17, hy - 16.5, 9, 'rgba(182,255,74,.9)', .6);

      /* ---------- 手臂 + 枪 ---------- */
      if (showGun) {
        const sx = 7, sy = -45 + by;
        const a = aim;
        const len = 17;
        const hx = sx + Math.cos(a) * len;
        const hyy = sy + Math.sin(a) * len;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#25405f'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hyy); ctx.stroke();
        ctx.strokeStyle = 'rgba(63,230,255,.45)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(sx, sy - 2.5); ctx.lineTo(hx, hyy - 2.5); ctx.stroke();
        ctx.fillStyle = '#e8b894';
        ctx.beginPath(); ctx.arc(hx, hyy, 3.6, 0, TAU); ctx.fill();
        // 枪
        ctx.save();
        ctx.translate(hx, hyy);
        ctx.rotate(a);
        const g2 = ctx.createLinearGradient(0, -7, 0, 7);
        g2.addColorStop(0, '#3a4d6b');
        g2.addColorStop(1, '#121d30');
        ctx.fillStyle = g2;
        Art.rr(ctx, -4, -7, 26, 13, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(150,225,255,.45)'; ctx.lineWidth = 1;
        Art.rr(ctx, -4, -7, 26, 13, 3); ctx.stroke();
        ctx.fillStyle = accent;
        ctx.fillRect(2, -4.5, 11, 2.4);
        Art.drawGlow(ctx, 8, -3.3, 12, overC ? 'rgba(255,47,125,.9)' : 'rgba(63,230,255,.9)', .5);
        ctx.fillStyle = '#0e1a2c';
        Art.rr(ctx, 4, 5.5, 7, 8, 2); ctx.fill();
        Art.rr(ctx, 20, -4.5, 10, 8, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(63,230,255,.5)'; ctx.lineWidth = 1;
        Art.rr(ctx, 20, -4.5, 10, 8, 2); ctx.stroke();
        ctx.fillStyle = '#c8f7ff';
        ctx.fillRect(28, -2.5, 3, 5);
        Art.drawGlow(ctx, 30, 0, 11, overC ? 'rgba(255,120,170,.9)' : 'rgba(150,240,255,.9)', .55);
        ctx.restore();
      }

      // 受击光
      if (hurt > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        Art.drawGlow(ctx, 0, -38 + by, 46, 'rgba(255,90,120,.95)', hurt * 0.85);
        ctx.restore();
      }
      ctx.restore();
    },
    /* 侧视角色：横版用，脚点在原点，朝向 +x */
    drawHeroSide(ctx, o) {
      const { over = 0, hurt = 0, t = 0, walk = 0, air = false, aim = 0, dash = 0 } = o;
      const overC = over > 0;
      const accent = overC ? '#ff2f7d' : '#3fe6ff';
      const bob = Math.sin(t * 13) * (walk > 0.2 ? 1.7 : 0.7);
      const swing = Math.sin(t * 15) * walk;
      const lift = air ? 4 : 0;

      // 影子
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(0, 1, 21, 5.5, 0, 0, TAU); ctx.fill();

      // 后腿
      ctx.strokeStyle = '#16233a';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, -22);
      ctx.lineTo(-6 - swing * 7, -12 - lift);
      ctx.lineTo(-8 - swing * 9, -1 - lift);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(63,230,255,.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-6 - swing * 7, -12 - lift); ctx.lineTo(-8 - swing * 9, -3 - lift); ctx.stroke();

      // 后手
      ctx.strokeStyle = '#1d2f4c';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-4, -44 + bob); ctx.lineTo(-14, -34 + bob); ctx.stroke();

      // 披风 / 风衣下摆
      ctx.fillStyle = 'rgba(20,32,54,.95)';
      ctx.beginPath();
      ctx.moveTo(-6, -46 + bob);
      ctx.quadraticCurveTo(-24 - Math.abs(swing) * 6, -30 + bob, -18 - swing * 6, -12 + bob);
      ctx.lineTo(-2, -18 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(63,230,255,.25)';
      ctx.lineWidth = 1.2; ctx.stroke();

      // 躯干
      const g = ctx.createLinearGradient(-10, -52, 12, -18);
      g.addColorStop(0, '#3b5a88');
      g.addColorStop(0.6, '#25405f');
      g.addColorStop(1, '#131f34');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-7, -52 + bob);
      ctx.lineTo(9, -50 + bob);
      ctx.lineTo(11, -22 + bob);
      ctx.lineTo(-6, -20 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,235,255,.35)';
      ctx.lineWidth = 1.2; ctx.stroke();

      // 胸灯
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(4, -38 + bob, 2.4, 0, TAU); ctx.fill();
      NP.Art.drawGlow(ctx, 4, -38 + bob, 12, overC ? 'rgba(255,47,125,.9)' : 'rgba(63,230,255,.9)', .5);

      // 腰带
      ctx.fillStyle = '#0a1424';
      ctx.fillRect(-6, -26 + bob, 16, 4);

      // 前腿
      ctx.strokeStyle = '#1d2f4c';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(2, -22);
      ctx.lineTo(6 + swing * 8, -12 - lift);
      ctx.lineTo(9 + swing * 10, -1);
      ctx.stroke();
      // 靴
      ctx.fillStyle = '#0b1322';
      ctx.beginPath(); ctx.ellipse(10 + swing * 10, -2, 7, 3.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b6ff4a';
      ctx.fillRect(6 + swing * 10, -3, 7, 1.6);

      // 头
      const hy = -62 + bob;
      ctx.fillStyle = '#f4cba8';
      ctx.beginPath(); ctx.arc(0, hy, 11, 0, TAU); ctx.fill();
      // 头发（向后扫）
      ctx.fillStyle = '#e0286d';
      ctx.beginPath();
      ctx.moveTo(-11, hy - 2);
      ctx.lineTo(-16, hy - 9);
      ctx.lineTo(-9, hy - 10);
      ctx.lineTo(-12, hy - 17);
      ctx.lineTo(-3, hy - 13);
      ctx.lineTo(2, hy - 18);
      ctx.lineTo(5, hy - 11);
      ctx.lineTo(12, hy - 6);
      ctx.lineTo(9, hy + 2);
      ctx.lineTo(0, hy - 3);
      ctx.lineTo(-8, hy - 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3fe6ff';
      ctx.beginPath();
      ctx.moveTo(2, hy - 18); ctx.lineTo(5, hy - 11); ctx.lineTo(8, hy - 13); ctx.lineTo(5, hy - 17);
      ctx.closePath(); ctx.fill();

      // 耳机
      ctx.fillStyle = '#0c1729';
      ctx.beginPath(); ctx.arc(-9, hy + 1, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(-11, hy + 0.5, 2.4, 2.4);

      // 护目镜（朝右）
      ctx.fillStyle = 'rgba(8,16,28,.96)';
      ctx.beginPath();
      ctx.moveTo(-4, hy - 4.2);
      ctx.lineTo(10.5, hy - 3.4);
      ctx.lineTo(10.5, hy + 3.6);
      ctx.lineTo(-4, hy + 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = overC ? 'rgba(255,47,125,.85)' : 'rgba(63,230,255,.8)';
      ctx.lineWidth = 1.1; ctx.stroke();
      ctx.fillStyle = overC ? '#ffd0e2' : '#c9f8ff';
      ctx.beginPath(); ctx.ellipse(5, hy + 0.4, 2.8, 2.6, 0, 0, TAU); ctx.fill();
      NP.Art.drawGlow(ctx, 5, hy, 17, overC ? 'rgba(255,47,125,.9)' : 'rgba(63,230,255,.9)', .42);

      // 天线
      ctx.strokeStyle = 'rgba(63,230,255,.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(9, hy - 6); ctx.lineTo(13, hy - 14); ctx.stroke();
      ctx.fillStyle = '#b6ff4a';
      ctx.beginPath(); ctx.arc(13, hy - 15, 2, 0, TAU); ctx.fill();

      // 枪臂
      const sx = 6, sy = -46 + bob;
      const a = aim;
      const hx = sx + Math.cos(a) * 20, hyy = sy + Math.sin(a) * 20;
      ctx.strokeStyle = '#25405f'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hyy); ctx.stroke();
      ctx.strokeStyle = 'rgba(63,230,255,.4)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx, sy - 2.5); ctx.lineTo(hx, hyy - 2.5); ctx.stroke();
      ctx.fillStyle = '#e8b894';
      ctx.beginPath(); ctx.arc(hx, hyy, 3.4, 0, TAU); ctx.fill();

      ctx.save();
      ctx.translate(hx, hyy);
      ctx.rotate(a);
      const g2 = ctx.createLinearGradient(0, -6, 0, 6);
      g2.addColorStop(0, '#3a4d6b');
      g2.addColorStop(1, '#121d30');
      ctx.fillStyle = g2;
      NP.Art.rr(ctx, -4, -6, 26, 12, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(150,225,255,.45)'; ctx.lineWidth = 1;
      NP.Art.rr(ctx, -4, -6, 26, 12, 3); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillRect(2, -4, 10, 2.2);
      NP.Art.drawGlow(ctx, 7, -2.9, 11, overC ? 'rgba(255,47,125,.9)' : 'rgba(63,230,255,.9)', .5);
      ctx.fillStyle = '#0e1a2c';
      NP.Art.rr(ctx, 21, -3.8, 9, 7, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(63,230,255,.5)'; ctx.lineWidth = 1;
      NP.Art.rr(ctx, 21, -3.8, 9, 7, 2); ctx.stroke();
      ctx.restore();

      if (hurt > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        NP.Art.drawGlow(ctx, 0, -40, 44, 'rgba(255,90,120,.95)', hurt * 0.85);
        ctx.restore();
      }
    }

  };
})();