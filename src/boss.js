/* =====================================================================
   霓虹协议 · boss.js
   首领：LJM-12138「终焉核心」+ 残影分身
   ===================================================================== */
(function () {
  'use strict';
  const NP = window.NP;
  const TAU = NP.TAU;

  const BASE = { hp: 1000000, atk: 3500, def: 1000, r: 78 };

  const SKILL_CD = { blink: 24.0, charge: 9.0, barrage: 7.0, shield: 60.0, clone: 16.0 };
  // 瞬移（5 秒无敌）与护盾（20 秒）冷却不随难度频率缩短，否则会变成永久无敌 / 永久护盾
  const SKILL_NAME = { blink: '瞬移被刺', charge: '终焉冲锋', barrage: '全向弹幕', shield: '护盾', clone: '残影分身' };

  NP.Boss = class Boss {
    constructor(G, isClone) {
      this.G = G;
      this.isClone = !!isClone;
      this.elapsed = 0;
      this.hitFlash = 0;
      this.invuln = 0;
      this.stun = 0;
      this.dead = false;
      this.shield = 0;
      this.shieldMax = 0;
      this.shieldPulse = 0;
      this.enraged = false;
      this.enrageBlastT = 0;
      this.enrageBlastMax = 0;
      this.passiveCd = 1.5;
      this.cast = null;
      this.phase = 0;
      this.angle = 0;
      this.vx = 0; this.vy = 0;
      this.ringA = 0;
      this.trail = [];
      this.skillUsed = null;
      this.life = 0;
      this.chargeHits = new Set();

      const d = G.diffData;
      const m = d.mult;
      this.specHp = BASE.hp * m;   // 设定集基础生命 × 难度倍率（护盾回复以此为准）
      // 「终焉充能」：清剿期间首领持续充能，生命随玩家等级提升（基础 1,000,000 不变）
      const charge = 1 + 0.01 * Math.max(0, (G.player ? G.player.level : 1) - 1);
      // 「终焉充能」：清剿过程中首领持续充能，生命随玩家等级提升（基础值仍为 100000）
      if (isClone) {
        // 分身：继承 80% 攻击与技能，但作为投影只有本体 8% 的耐久
        this.maxHp = Math.round(BASE.hp * m * charge * 0.04);
        this.atk = BASE.atk * m * 0.8;
        this.def = BASE.def * (1 + (m - 1) * 0.08) * 0.8;
        this.r = BASE.r * 0.62;
        this.life = 0; // 由生成时设定
        this.x = G.boss ? G.boss.x + 160 : G.world.w / 2;
        this.y = G.boss ? G.boss.y - 120 : G.world.h / 2;
        this.cd = { blink: 2.5, charge: 6, barrage: 3.5, shield: 99, clone: 99 };
      } else {
        this.maxHp = Math.round(BASE.hp * m * charge);
        this.atk = BASE.atk * m;
        // 防御倍率做收敛处理：直接 ×15 会让减伤达到 210%（免疫），这里按 25% 系数放大后仍有 38% 减伤
        this.def = BASE.def * (1 + (m - 1) * 0.08);
        this.r = BASE.r;
        this.x = G.world.w / 2;
        this.y = G.world.h / 2 - 220;
        this.cd = { blink: 3.2, charge: 5.5, barrage: 2.4, shield: 13, clone: 9.5 };
      }
      this.hp = this.maxHp;
      this.freqMul = 1;
    }

    get alive() { return !this.dead && this.hp > 0; }
    get cy() { return this.y; }

    /* 技能频率：噩梦翻倍；狂暴 +25% */
    get freq() {
      const d = this.G.diffData;
      return (d.id === 3 ? 2 : 1) * (this.enraged ? 1.25 : 1);
    }

    /* ---------- 伤害 ---------- */
    takeDamage(dmg, crit, silent) {
      if (this.dead) return 0;
      if (this.invuln > 0) return 0;
      let final = dmg;
      if (this.shield > 0) final *= 0.4;
      const pen = this.G.player ? this.G.player.stats.armorPen : 0;
      const effDef = this.def * (1 - pen);
      const reduce = Math.min(0.70, effDef * 0.0002);
      final *= (1 - reduce);
      this.hp -= final;
      this.hitFlash = 1;
      if (!silent && this.G.player) this.G.player.onDamageDealt(final, crit);
      if (this.hp <= 0) { this.hp = 0; this.die(); }
      else if (!this.isClone && !this.enraged && this.hp / this.maxHp <= 0.25) this.enrage();
      return final;
    }

    enrage() {
      this.enraged = true;
      this.enrageBlastMax = this.enrageBlastT = 1.15;
      this.G.onBossEnrage(this);
    }

    die() {
      if (this.dead) return;
      this.dead = true;
      this.G.onBossDead(this);
    }

    /* ---------- 更新 ---------- */
    update(dt) {
      const G = this.G;
      this.elapsed += dt;
      this.life -= dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt * 3.5);
      this.invuln = Math.max(0, this.invuln - dt);
      this.ringA += dt * (this.enraged ? 1.5 : 0.6) * (this.isClone ? -1.4 : 1);
      this.shieldPulse += dt;

      // 狂暴震荡倒计时
      if (this.enrageBlastT > 0) {
        this.enrageBlastT -= dt;
        if (this.enrageBlastT <= 0) {
          this.enrageBlastT = 0;
          G.bossBlast(this, 0.9 * this.atk);
        }
      }

      // 护盾计时
      if (this.shield > 0) {
        this.shield -= dt;
        if (this.shield <= 0) {
          this.shield = 0;
          const heal = Math.round(this.specHp * 0.30); // 按设定基础生命回复 30%
          this.hp = Math.min(this.maxHp, this.hp + heal);
          G.text(`+${NP.fmt(heal)}`, this.x, this.y - this.r - 30, '#b6ff4a', 18);
          G.fxRing(this.x, this.y, this.r + 40, 'rgba(182,255,74,.8)', 0.6);
          NP.Audio.sfx('heal');
        }
      }

      // 分身在生命周期结束后消散
      if (this.isClone && this.life <= 0) { this.dissolve(); return; }

      if (this.stun > 0) {
        this.stun -= dt;
        this.vx *= 0.86; this.vy *= 0.86;
        this.x += this.vx * dt; this.y += this.vy * dt;
        return;
      }

      const p = G.player;
      const dist = NP.dist(this, p);

      // 被动：靠近时自动攻击
      this.passiveCd -= dt;
      if (!this.isClone && this.passiveCd <= 0 && dist < 175) {
        this.passiveCd = 1.2;
        p.takeDamage(this.atk * 0.35);
        G.fxRing(this.x, this.y, 190, 'rgba(255,47,125,.55)', 0.4);
        G.shake(4);
        NP.Audio.sfx('hit');
      }

      // 正在施法
      if (this.cast) { this.updateCast(dt); }
      else {
        this.cdTick(dt);
        const next = this.pickSkill(dist);
        if (next) this.startCast(next, dist);
        else this.drift(dt, dist);
      }

      // 边界
      this.x = NP.clamp(this.x, this.r, G.world.w - this.r);
      this.y = NP.clamp(this.y, 140, G.groundY - 110);

      // 冲刺拖尾
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].life -= dt;
        if (this.trail[i].life <= 0) this.trail.splice(i, 1);
      }
      if (this.trail.length > 30) this.trail.splice(0, this.trail.length - 30);
    }

    cdTick(dt) {
      for (const k in this.cd) {
        if (this.cd[k] <= 0) continue;
        const f = (k === 'blink' || k === 'shield') ? 1 : this.freq;
        this.cd[k] = Math.max(0, this.cd[k] - dt * f);
      }
    }

    pickSkill(dist) {
      const order = this.isClone ? ['barrage', 'blink', 'charge'] : ['barrage', 'blink', 'charge', 'clone', 'shield'];
      const ready = order.filter((k) => this.cd[k] <= 0);
      if (!ready.length) return null;
      // 权重：近身优先冲锋/背刺，远程优先弹幕
      const w = ready.map((k) => {
        let v = 1;
        if (k === 'charge') v = dist < 620 ? 2.2 : 0.6;
        if (k === 'blink') v = dist < 700 ? 1.6 : 0.8;
        if (k === 'barrage') v = dist > 260 ? 1.8 : 1;
        if (k === 'clone') v = this.isClone ? 0 : 1;
        if (k === 'shield') v = this.hp / this.maxHp < 0.7 ? 2.4 : 0.7;
        return v;
      });
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < ready.length; i++) {
        r -= w[i];
        if (r <= 0) return ready[i];
      }
      return ready[0];
    }

    startCast(type, dist) {
      // 护盾有最短循环限制，避免高频率下形成「永动护盾」
      this.cd[type] = SKILL_CD[type];
      this.skillUsed = type;
      const p = this.G.player;
      const angTo = Math.atan2(p.y - this.y, p.x - this.x);
      if (type === 'blink') {
        this.cast = { type, phase: 'windup', t: 0, dur: this.isClone ? 0.5 : 0.42, ang: angTo };
        NP.Audio.sfx('blink');
      } else if (type === 'charge') {
        this.cast = { type, phase: 'windup', t: 0, dur: 0.85, ang: angTo, hitDone: false };
        NP.Audio.sfx('charge');
        this.G.toast('终焉冲锋 // 火焰路径');
      } else if (type === 'barrage') {
        this.cast = { type, phase: 'windup', t: 0, dur: 0.55, shots: 0 };
        NP.Audio.sfx('alarm');
      } else if (type === 'shield') {
        this.cast = { type, phase: 'windup', t: 0, dur: 0.25 };
      } else if (type === 'clone') {
        this.cast = { type, phase: 'windup', t: 0, dur: 0.7 };
        this.G.toast('残影分身 // 投影展开');
      }
    }

    updateCast(dt) {
      const c = this.cast;
      const G = this.G;
      const p = G.player;
      c.t += dt;
      const k = c.t / c.dur;

      if (c.type === 'blink') {
        if (c.phase === 'windup') {
          // 目标点：玩家背后
          c.ang = Math.atan2(p.y - this.y, p.x - this.x);
          if (c.t >= c.dur) {
            const back = Math.atan2(this.y - p.y, this.x - p.x);
            const nx = p.x + Math.cos(back) * 96;
            const ny = p.y + Math.sin(back) * 96;
            this.trail.push({ x: this.x, y: this.y, life: 0.5 });
            this.x = NP.clamp(nx, this.r, G.world.w - this.r);
            this.y = NP.clamp(ny, this.r, G.world.h - this.r);
            this.invuln = (this.G.diffData.id === 3) ? 10 : 5;   // 5 秒无敌，噩梦翻倍
            c.phase = 'strike'; c.t = 0; c.dur = 0.26;
            c.ang = Math.atan2(p.y - this.y, p.x - this.x);
            NP.Audio.sfx('blink');
            G.shake(5);
            // 突刺伤害：判定在正前方 260 的矩形
            const dmg = 900 + 0.2 * this.atk + 10 * this.elapsed;
            const hx = this.x + Math.cos(c.ang) * 130;
            const hy = this.y + Math.sin(c.ang) * 130;
            if (NP.dist({ x: hx, y: hy }, p) < 150 + p.r) {
              p.takeDamage(dmg);
            }
            G.beamFx(this.x, this.y, hx, hy, 'rgba(255,47,125,.9)', 0.3);
          }
        } else if (c.t >= c.dur) {
          this.cast = null;
        }
        return;
      }

      if (c.type === 'charge') {
        if (c.phase === 'windup') {
          // 缓慢跟随玩家的瞄准线
          const desired = Math.atan2(p.y - this.y, p.x - this.x);
          let diff = ((desired - c.ang + Math.PI * 3) % TAU) - Math.PI;
          c.ang += diff * Math.min(1, dt * 3.4);
          if (c.t >= c.dur) {
            c.phase = 'dash'; c.t = 0; c.dur = 0.62;
            this.chargeHits = new Set();
            NP.Audio.sfx('charge');
          }
        } else {
          const sp = 1650;
          this.x += Math.cos(c.ang) * sp * dt;
          this.y += Math.sin(c.ang) * sp * dt;
          this.trail.push({ x: this.x, y: this.y, life: 0.5 });
          c.fireT = (c.fireT || 0) + dt;
          if (c.fireT >= 0.05) {
            c.fireT = 0;
            G.firePatches.push({ x: this.x, y: G.groundY, r: 46, life: 3, dps: 500, t: 0 });
          }
          if (NP.dist(this, p) < this.r + p.r + 12) {
            const dmg = 2000 + 0.3 * this.atk + 5 * this.elapsed;
            p.takeDamage(dmg);
            G.shake(10);
          }
          if (this.x <= this.r || this.x >= G.world.w - this.r) {
            this.x = NP.clamp(this.x, this.r, G.world.w - this.r);
            c.t = c.dur;
          }
          if (this.y <= this.r || this.y >= G.world.h - this.r) {
            this.y = NP.clamp(this.y, this.r, G.world.h - this.r);
            c.t = c.dur;
          }
          if (c.t >= c.dur) { this.cast = null; this.cd.charge = SKILL_CD.charge; }
        }
        return;
      }

      if (c.type === 'barrage') {
        if (c.phase === 'windup') {
          if (c.t >= c.dur) {
            c.phase = 'fire'; c.t = 0; c.dur = 0.2;
            const n = this.isClone ? 16 : 24;
            const dmg = 1000 + 0.15 * this.atk + 8 * this.elapsed;
            const off = Math.random() * TAU;
            for (let i = 0; i < n; i++) {
              const a = off + (i / n) * TAU;
              G.spawnMobBullet(this.x, this.y, a, 300, dmg, 9, this.enraged ? '#ff6b3c' : '#ff2f7d');
            }
            NP.Audio.sfx('bigKill');
            G.shake(6);
            G.fxRing(this.x, this.y, this.r + 50, 'rgba(255,47,125,.9)', 0.45);
          }
        } else if (c.t >= c.dur) this.cast = null;
        return;
      }

      if (c.type === 'shield') {
        if (c.t >= c.dur) {
          this.shield = 20;
          this.shieldMax = 20;
          NP.Audio.sfx('shield');
          G.toast('护盾展开 // 受伤减少 60%');
          G.fxRing(this.x, this.y, this.r + 60, 'rgba(63,230,255,.9)', 0.7);
          this.cast = null;
        }
        return;
      }

      if (c.type === 'clone') {
        if (c.t >= c.dur) {
          G.spawnClone(this);
          this.cast = null;
        }
        return;
      }
    }

    drift(dt, dist) {
      const p = this.G.player;
      const ang = Math.atan2(p.y - this.y, p.x - this.x);
      const want = dist < 340 ? -1 : dist > 560 ? 1 : 0;
      const side = Math.sin(this.elapsed * 0.7) * 0.9;
      const sp = 165;
      this.vx = Math.cos(ang) * sp * want + Math.cos(ang + Math.PI / 2) * sp * side;
      this.vy = Math.sin(ang) * sp * want + Math.sin(ang + Math.PI / 2) * sp * side;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    dissolve() {
      this.dead = true;
      const G = this.G;
      G.burst(this.x, this.y, 40, 'rgba(160,107,255,.9)', 260, { life: 0.9, size: 4 });
      G.fxRing(this.x, this.y, 120, 'rgba(160,107,255,.8)', 0.7);
      G.toast('残影分身 消散');
      NP.Audio.sfx('blink');
      G.removeClone(this);
    }

    /* ---------- 渲染 ---------- */
    draw(ctx, t) {
      const r = this.r;
      const bob = Math.sin(t * 1.8 + this.phase) * 7;
      const enraged = this.enraged || this.isClone;
      const core = this.isClone ? '#a06bff' : (enraged ? '#ff2f7d' : '#ff4f8f');

      // 地面阴影
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(this.x, Math.min((this.G.groundY || this.y + r * 0.55), this.y + r * 0.55), r * 1.05, r * 0.26, 0, 0, TAU); ctx.fill();
      ctx.restore();

      // 施法预警
      this.drawTelegraph(ctx, t);

      // 冲刺残影
      if (this.trail.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const g of this.trail) {
          const a = NP.clamp(g.life / 0.5, 0, 1);
          ctx.fillStyle = `rgba(255,47,125,${a * 0.22})`;
          ctx.beginPath(); ctx.arc(g.x, g.y, this.r * 0.85 * a, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }

      const cx = this.x, cy = this.y + bob;

      // 推进器光
      NP.Art.drawGlow(ctx, cx, cy + r * 0.7, r * 1.3, this.isClone ? 'rgba(160,107,255,.35)' : 'rgba(255,47,125,.3)', 0.5);
      // 核心光晕
      NP.Art.drawGlow(ctx, cx, cy, r * 1.8,
        this.isClone ? 'rgba(160,107,255,.5)' : (enraged ? 'rgba(255,47,125,.55)' : 'rgba(255,79,143,.4)'), 0.5);

      // 狂暴光环
      if (enraged) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const a = 0.18 + 0.1 * Math.sin(t * 9);
        ctx.fillStyle = `rgba(255,47,125,${a})`;
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, TAU); ctx.fill();
        ctx.restore();
      }

      // 外环（旋转六段）
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 1 / (this.G.cam.tilt || 1));
      ctx.rotate(this.ringA);
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * TAU + 0.12;
        const a1 = ((i + 1) / segs) * TAU - 0.12;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.22, a0, a1);
        ctx.strokeStyle = enraged ? 'rgba(255,80,120,.85)' : 'rgba(63,230,255,.55)';
        ctx.lineWidth = 4;
        ctx.stroke();
        // 末端节点
        ctx.fillStyle = enraged ? 'rgba(255,180,90,.95)' : 'rgba(63,230,255,.85)';
        ctx.beginPath(); ctx.arc(Math.cos(a1) * r * 1.22, Math.sin(a1) * r * 1.22, 3.4, 0, TAU); ctx.fill();
      }
      ctx.rotate(-this.ringA * 2.4);
      ctx.strokeStyle = 'rgba(160,107,255,.4)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98);
        ctx.lineTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08);
        ctx.stroke();
      }
      ctx.restore();

      // 内环（反向旋转虚线）
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 1 / (this.G.cam.tilt || 1));
      ctx.rotate(-this.ringA * 1.6);
      ctx.strokeStyle = this.isClone ? 'rgba(160,107,255,.3)' : 'rgba(63,230,255,.26)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([9, 13]);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.58, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      // 轨道光点
      ctx.fillStyle = this.isClone ? 'rgba(190,150,255,.9)' : 'rgba(255,180,220,.85)';
      for (let i = 0; i < 3; i++) {
        const a = this.ringA * 2 + (i / 3) * TAU;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, 2.6, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 1 / (this.G.cam.tilt || 1));
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r);
      g.addColorStop(0, this.isClone ? '#3c2a66' : '#2b1a2e');
      g.addColorStop(0.55, this.isClone ? '#241640' : '#17101f');
      g.addColorStop(1, '#07050b');
      ctx.fillStyle = g;
      const hex = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        hex.push([Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86]);
      }
      NP.Art.poly(ctx, hex);
      ctx.fill();
      ctx.strokeStyle = this.hitFlash > 0 ? '#fff' : (this.isClone ? 'rgba(160,107,255,.9)' : 'rgba(255,47,125,.85)');
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // 装甲分割线
      ctx.save();
      NP.Art.poly(ctx, hex); ctx.clip();
      ctx.strokeStyle = 'rgba(120,160,220,.16)';
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(-r, i * r * 0.34); ctx.lineTo(r, i * r * 0.34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * r * 0.34, -r); ctx.lineTo(i * r * 0.34, r); ctx.stroke();
      }
      // 损伤裂缝
      const dmgRatio = 1 - this.hp / this.maxHp;
      if (dmgRatio > 0.3) {
        ctx.strokeStyle = `rgba(255,120,60,${0.25 + dmgRatio * 0.5})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + this.phase;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
          ctx.lineTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
          ctx.lineTo(Math.cos(a + 0.2) * r * 0.9, Math.sin(a + 0.2) * r * 0.9);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 侧臂
      const armA = Math.sin(t * 1.4 + this.phase) * 0.24;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.rotate(s * (0.5 + armA));
        ctx.fillStyle = '#1a1224';
        NP.Art.poly(ctx, [[r * 0.55, -10], [r * 1.32, -16], [r * 1.5, 0], [r * 1.3, 9], [r * 0.55, 8]]);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,47,125,.5)'; ctx.lineWidth = 1.4; ctx.stroke();
        // 爪
        ctx.fillStyle = enraged ? '#ff2f7d' : '#5c2a44';
        NP.Art.poly(ctx, [[r * 1.5, -8], [r * 1.72, -2], [r * 1.5, 0]]); ctx.fill();
        NP.Art.poly(ctx, [[r * 1.5, 8], [r * 1.72, 2], [r * 1.5, 0]]); ctx.fill();
        ctx.restore();
      }

      // 核心眼
      const eyeR = r * 0.30;
      const aimAng = Math.atan2(this.G.player.y - this.y, this.G.player.x - this.x);
      const look = Math.min(1, NP.dist(this, this.G.player) / 600) * 0.24;
      const ex = Math.cos(aimAng) * eyeR * look * 2;
      const ey = Math.sin(aimAng) * eyeR * look * 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const eg = ctx.createRadialGradient(ex, ey, 0, 0, 0, eyeR * 1.6);
      eg.addColorStop(0, '#ffffff');
      eg.addColorStop(0.25, core);
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(0, 0, eyeR * 1.6, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#05030a';
      ctx.beginPath(); ctx.arc(0, 0, eyeR, 0, TAU); ctx.fill();
      ctx.strokeStyle = core; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(ex - eyeR * 0.15, ey - eyeR * 0.15, eyeR * 0.18, 0, TAU); ctx.fill();

      // 代码环文字感装饰
      ctx.strokeStyle = `rgba(255,255,255,${0.07 + 0.05 * Math.sin(t * 3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, TAU); ctx.stroke();

      ctx.restore();

      // 护盾球
      if (this.shield > 0) {
        const k = this.shield / 20;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const a = 0.16 + 0.1 * Math.sin(this.shieldPulse * 6);
        ctx.fillStyle = `rgba(63,230,255,${a})`;
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(63,230,255,${0.55 + 0.2 * Math.sin(this.shieldPulse * 6)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.15, 0, TAU); ctx.stroke();
        ctx.restore();
        // 剩余时间弧
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.22, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.strokeStyle = 'rgba(182,255,74,.75)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 无敌闪烁
      if (this.invuln > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.3 * Math.sin(t * 40)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, 0, TAU); ctx.stroke();
        ctx.restore();
      }

      // 眩晕
      if (this.stun > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(63,230,255,.9)';
        for (let i = 0; i < 5; i++) {
          const a = t * 5 + (i / 5) * TAU;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r * 1.1, cy - r * 1.2 + Math.sin(a) * 14, 3.2, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawTelegraph(ctx, t) {
      const c = this.cast;
      const G = this.G;
      const p = G.player;
      if (!c) {
        if (this.enrageBlastT > 0) {
          // 狂暴震荡预警
          const k = 1 - this.enrageBlastT / this.enrageBlastMax;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(255,47,125,${0.85})`;
          ctx.lineWidth = 4 + 6 * k;
          ctx.beginPath(); ctx.arc(p.x, p.y, 800 * (1 - k) + 40, 0, TAU); ctx.stroke();
          ctx.fillStyle = `rgba(255,47,125,${0.12 + 0.1 * k})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 800 * (1 - k) + 40, 0, TAU); ctx.fill();
          ctx.restore();
          G.text(`狂暴震荡 ${this.enrageBlastT.toFixed(1)}s`, this.x, this.y - this.r - 46, '#ff2f7d', 18);
        }
        return;
      }
      if (c.phase !== 'windup') return;

      if (c.type === 'charge') {
        const ang = c.ang;
        const len = 1400;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const k = c.t / c.dur;
        ctx.strokeStyle = `rgba(255,80,60,${0.3 + 0.45 * k})`;
        ctx.lineWidth = 3 + 10 * k;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(ang) * len, this.y + Math.sin(ang) * len);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,200,120,.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(ang) * len, this.y + Math.sin(ang) * len);
        ctx.stroke();
        // 落点箭头
        const tx = this.x + Math.cos(ang) * len, ty = this.y + Math.sin(ang) * len;
        ctx.fillStyle = `rgba(255,80,60,${0.4 + 0.4 * k})`;
        NP.Art.poly(ctx, [[tx + Math.cos(ang) * 26, ty + Math.sin(ang) * 26],
        [tx + Math.cos(ang + 2.4) * 20, ty + Math.sin(ang + 2.4) * 20],
        [tx + Math.cos(ang - 2.4) * 20, ty + Math.sin(ang - 2.4) * 20]]);
        ctx.fill();
        ctx.restore();
      } else if (c.type === 'blink') {
        const back = Math.atan2(this.y - p.y, this.x - p.x);
        const tx = p.x + Math.cos(back) * 96, ty = p.y + Math.sin(back) * 96;
        const k = c.t / c.dur;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(160,107,255,${0.5 + 0.4 * k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tx, ty, 40 * (1.4 - k * 0.4), 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(tx, ty, 22 * k, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,47,125,${0.3 + 0.4 * k})`;
        ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      } else if (c.type === 'barrage') {
        const k = c.t / c.dur;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,47,125,${0.35 + 0.5 * k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 60 * (1 - k) + 18, 0, TAU); ctx.stroke();
        ctx.restore();
      } else if (c.type === 'clone') {
        const k = c.t / c.dur;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(160,107,255,${0.6})`;
        ctx.lineWidth = 3;
        const rr = this.r * (0.4 + k * 1.6);
        ctx.beginPath(); ctx.arc(this.x, this.y, rr, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  };
})();