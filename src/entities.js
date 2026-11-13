/* =====================================================================
   霓虹协议 · entities.js
   玩家 / 敌人 / 子弹 / 掉落
   ===================================================================== */
(function () {
  'use strict';
  const NP = window.NP;
  const TAU = NP.TAU;
  const C = NP.COL;

  /* =========================== 玩家 =========================== */
  NP.Player = class Player {
    constructor(G) {
      this.G = G;
      this.x = G.world.w / 2;
      this.y = G.world.h / 2;
      this.r = 20;
      this.aim = 0;
      this.facing = 1;
      this.level = 1;
      this.xp = 0;
      this.pendingCards = 0;
      this.stacks = {};
      this.mods = NP.newMods();
      this.cd = { dash: 0, q: 0, e: 0, r: 0 };
      this.over = 0;
      this.iframe = 1.4;
      this.hurt = 0;
      this.dashT = 0;
      this.dashAng = 0;
      this.dashTrail = 0;
      this.walk = 0;
      this.fireT = 0;
      this.shield = 0;
      this.shieldMax = 0;
      this.shieldT = 0;
      this.ghosts = [];
      this.muzzle = 0;
      this.noHitT = 0;
      this.stats = NP.computeStats(1, this.mods, G.save.data.up);
      this.maxHp = this.stats.maxHp;
      this.hp = this.maxHp;
      this.recalc(false);
      this.hp = this.maxHp;
    }

    recalc(healDelta) {
      const oldMax = this.maxHp || 0;
      this.stats = NP.computeStats(this.level, this.mods, this.G.save.data.up);
      this.maxHp = this.stats.maxHp;
      if (healDelta !== false) this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oldMax));
      this.hp = Math.min(this.hp, this.maxHp);
    }

    /* 叠加一张卡 */
    addCard(card) {
      this.stacks[card.id] = (this.stacks[card.id] || 0) + 1;
      this.mods = NP.newMods();
      for (const id in this.stacks) {
        const c = NP.CARDS_BY_ID[id];
        if (!c) continue;
        for (let i = 0; i < this.stacks[id]; i++) c.apply(this.mods);
      }
      this.recalc();
      this.G.refreshHud();
    }

    gainXp(amount) {
      this.xp += amount;
      const newLevel = 1 + Math.floor(this.xp / NP.XP_PER_LEVEL);
      while (this.level < newLevel) {
        this.level++;
        this.pendingCards++;
        this.recalc();
        this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.12));
        if (this.G) this.G.onLevelUp();
      }
      if (this.G) this.G.refreshHud();
    }

    get overActive() { return this.over > 0; }

    update(dt) {
      const G = this.G;
      const st = this.stats;
      const inp = NP.Input;

      this.iframe = Math.max(0, this.iframe - dt);
      this.hurt = Math.max(0, this.hurt - dt * 3.6);
      this.over = Math.max(0, this.over - dt);
      this.muzzle = Math.max(0, this.muzzle - dt * 8);
      this.dashT = Math.max(0, this.dashT - dt);
      this.dashTrail = Math.max(0, this.dashTrail - dt);
      for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);

      // 护盾发生器
      if (st.shieldGen > 0) {
        this.shieldT += dt;
        if (this.shieldT >= 12) {
          this.shieldT = 0;
          this.shieldMax = Math.round(this.maxHp * st.shieldGen);
          this.shield = Math.max(this.shield, this.shieldMax);
          G.fxRing(this.x, this.y, 46, 'rgba(63,230,255,.9)', 0.5);
        }
      }

      if (st.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * st.regen * dt);
      // 脱战 5 秒后缓慢自愈
      this.noHitT += dt;
      if (this.noHitT > 5 && this.hp > 0 && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.012 * dt);
      }

      // 移动输入
      let mx = 0, my = 0;
      if (inp.keys.KeyA || inp.keys.ArrowLeft) mx -= 1;
      if (inp.keys.KeyD || inp.keys.ArrowRight) mx += 1;
      if (inp.keys.KeyW || inp.keys.ArrowUp) my -= 1;
      if (inp.keys.KeyS || inp.keys.ArrowDown) my += 1;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      this.walk = NP.lerp(this.walk, ml > 0.1 ? 1 : 0, Math.min(1, dt * 10));

      const speed = 340 * st.moveMul;
      if (this.dashT > 0) {
        const ds = 1250;
        this.x += Math.cos(this.dashAng) * ds * dt;
        this.y += Math.sin(this.dashAng) * ds * dt;
        this.ghosts.push({ x: this.x, y: this.y, aim: this.aim, life: 0.28, max: 0.28 });
      } else {
        this.x += mx * speed * dt;
        this.y += my * speed * dt;
      }
      const pad = 26;
      this.x = NP.clamp(this.x, pad, G.world.w - pad);
      this.y = NP.clamp(this.y, pad, G.world.h - pad);

      for (let i = this.ghosts.length - 1; i >= 0; i--) {
        this.ghosts[i].life -= dt;
        if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
      }

      // 瞄准
      let aimed = false;
      if (G.autoplay) {
        const target = G.nearestTarget(this.x, this.y, 1400);
        if (target) { this.aim = Math.atan2(target.y - this.y, target.x - this.x); aimed = true; }
      }
      if (!aimed) {
        const w = G.cam.screenToWorld(inp.mouse.x, inp.mouse.y);
        this.aim = Math.atan2(w.y - this.y, w.x - this.x);
      }
      this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;

      // 射击
      this.fireT -= dt;
      const auto = G.save.data.settings.auto || G.autoplay;
      const wantFire = inp.mouse.down || auto || inp.keys.Space || inp.keys.KeyJ;
      const rate = st.fireRate * (this.over > 0 ? 4 : 1);
      if (wantFire && this.fireT <= 0 && this.dashT <= 0) {
        this.fireT = 1 / rate;
        this.shoot();
      }
      if (this.fireT < -0.3) this.fireT = 0;

      // 技能按键
      const q = NP.Input.consume();
      for (const code of q) {
        if (code === 'ShiftLeft' || code === 'ShiftRight') this.doDash();
        else if (code === 'KeyQ') this.doOverclock();
        else if (code === 'KeyE') this.doEmp();
        else if (code === 'KeyR') this.doLaser();
      }
    }

    shoot() {
      const G = this.G;
      const st = this.stats;
      const overMul = this.over > 0 ? 2.5 : 1;
      const n = 1 + st.multishot;
      const base = st.atk * overMul;
      const spreadBase = n > 1 ? 0.055 : 0;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * spreadBase * 2;
        const a = this.aim + off + NP.rand(-0.012, 0.012);
        const crit = Math.random() < st.crit;
        const dmg = base * (crit ? st.critDmg : 1);
        G.pBullets.push({
          x: this.x + Math.cos(this.aim) * 22,
          y: this.y + Math.sin(this.aim) * 22,
          vx: Math.cos(a) * st.bulletSpeed,
          vy: Math.sin(a) * st.bulletSpeed,
          dmg, crit, r: crit ? 5 : 4.2,
          life: st.range / st.bulletSpeed,
          pierce: st.pierce, hit: new Set(),
          color: this.over > 0 ? '#ff6ba8' : (crit ? '#ffd76b' : '#8ff3ff')
        });
      }
      this.muzzle = 1;
      G.shake(1.1);
      NP.Audio.sfx(this.over > 0 ? 'shootOver' : 'shoot');
    }

    doDash() {
      if (this.cd.dash > 0 || this.dashT > 0) return;
      const st = this.stats;
      this.cd.dash = Math.max(0.35, 1.8 * (1 - st.cdr) * (1 - Math.min(0.6, this.mods.dashCdr)));
      this.dashT = 0.16;
      this.dashTrail = 0.16;
      this.iframe = Math.max(this.iframe, 0.16);
      let mx = 0, my = 0;
      if (NP.Input.keys.KeyA || NP.Input.keys.ArrowLeft) mx -= 1;
      if (NP.Input.keys.KeyD || NP.Input.keys.ArrowRight) mx += 1;
      if (NP.Input.keys.KeyW || NP.Input.keys.ArrowUp) my -= 1;
      if (NP.Input.keys.KeyS || NP.Input.keys.ArrowDown) my += 1;
      this.dashAng = (mx || my) ? Math.atan2(my, mx) : this.aim;
      NP.Audio.sfx('dash');
      this.G.fxRing(this.x, this.y, 40, 'rgba(63,230,255,.8)', 0.35);
    }

    doOverclock() {
      if (this.cd.q > 0) return;
      this.cd.q = 15 * (1 - this.stats.cdr);
      this.over = this.stats.overDur;
      NP.Audio.sfx('overclock');
      this.G.toast('超频协议 // 攻速 +300% · 伤害 +150% · 吸血 20%');
      this.G.fxRing(this.x, this.y, 70, 'rgba(255,47,125,.9)', 0.7);
      this.G.shake(3);
    }

    doEmp() {
      if (this.cd.e > 0) return;
      this.cd.e = 15 * (1 - this.stats.cdr);
      const st = this.stats;
      const heal = Math.round(this.maxHp * 0.5);
      this.hp = Math.min(this.maxHp, this.hp + heal);
      this.G.fxRing(this.x, this.y, st.empR, 'rgba(63,230,255,.95)', 0.9, 0.55);
      this.G.fxRing(this.x, this.y, st.empR * 0.6, 'rgba(160,107,255,.8)', 0.7, 0.4);
      NP.Audio.sfx('emp');
      this.G.shake(6);
      this.G.healText(this.x, this.y - 60, heal);
      for (const m of this.G.mobs) {
        if (NP.dist(m, this) < st.empR + m.r) {
          m.stun = Math.max(m.stun, 5);
          m.hitFlash = 1;
          if (st.empDmg > 0) this.G.damageMob(m, st.atk * 1.2, false, false);
        }
      }
      const targets = [this.G.boss, ...this.G.clones].filter(Boolean);
      for (const b of targets) {
        if (NP.dist(b, this) < st.empR + b.r) {
          b.stun = Math.max(b.stun || 0, 1.4);
          b.hitFlash = 1;
          this.G.text('压制 1.4s', b.x, b.y - b.r - 20, '#9beeff', 15);
          if (st.empDmg > 0) this.G.damageBoss(b, st.atk * 1.5, false, false);
        }
      }
      this.G.toast('电磁脉冲 // 全域压制 5s · 生命 +50%');
    }

    doLaser() {
      if (this.cd.r > 0) return;
      this.cd.r = 8 * (1 - this.stats.cdr);
      const st = this.stats;
      const dmg = (1000 + 0.08 * st.atk + 0.02 * this.maxHp) * st.laserMul;
      const len = 1500;
      const ox = this.x + Math.cos(this.aim) * 26, oy = this.y + Math.sin(this.aim) * 26;
      this.G.beams.push({
        x1: ox, y1: oy,
        x2: ox + Math.cos(this.aim) * len, y2: oy + Math.sin(this.aim) * len,
        life: 0.45, max: 0.45, dmg, hit: new Set()
      });
      NP.Audio.sfx('laser');
      this.G.shake(8);
      this.G.toast('毁灭激光 // 贯穿射击');
    }

    takeDamage(raw) {
      const G = this.G;
      if (this.dashT > 0 || this.iframe > 0) {
        if (this.dashT > 0) G.text('MISS', this.x + NP.rand(-14, 14), this.y - 70, '#8ff3ff', 15);
        return false;
      }
      let dmg = raw * this.stats.takenMul;
      if (this.shield > 0) {
        const absorbed = Math.min(this.shield, dmg);
        this.shield -= absorbed;
        dmg -= absorbed;
        if (absorbed > 0) G.text(`-${Math.round(absorbed)} 护盾`, this.x, this.y - 66, '#9beeff', 13);
      }
      if (dmg >= 1) {
        this.hp -= dmg;
        this.noHitT = 0;
        this.hurt = 1;
        this.iframe = 0.4;
        G.shake(5 + Math.min(8, dmg / this.maxHp * 40));
        G.hurtFlash = 1;
        if (G.save.data.settings.dmgNum) G.text(`-${Math.round(dmg)}`, this.x + NP.rand(-10, 10), this.y - 62, '#ff5d7b', 17);
        NP.Audio.sfx('hurt');
      }
      if (this.hp <= 0) { this.hp = 0; G.onPlayerDeath(); }
      return true;
    }

    /* 造成伤害后触发吸血 */
    onDamageDealt(amount, crit) {
      const ls = this.stats.lifesteal + (this.over > 0 ? 0.2 : 0);
      if (ls > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + amount * ls);
    }

    draw(ctx, t) {
      const over = this.over > 0 ? 1 : 0;
      for (const gh of this.ghosts) {
        const a = gh.life / gh.max;
        ctx.save();
        ctx.globalAlpha = a * 0.4;
        NP.Art.drawHero(ctx, { x: gh.x, y: gh.y, scale: 1, aim: gh.aim, facing: Math.cos(gh.aim) >= 0 ? 1 : -1, t, over, showGun: false });
        ctx.restore();
      }
      if (this.shield > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const a = 0.25 + 0.15 * Math.sin(t * 8);
        ctx.strokeStyle = `rgba(63,230,255,${a + 0.25})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y - 24, 52, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(63,230,255,${a * 0.35})`;
        ctx.beginPath(); ctx.arc(this.x, this.y - 24, 52, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // 脚下光环，突出角色位置
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(this.x, this.y + 2, 2, this.x, this.y + 2, 40);
      rg.addColorStop(0, over ? 'rgba(255,47,125,.35)' : 'rgba(63,230,255,.28)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 2, 40, 14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = over ? 'rgba(255,47,125,.5)' : 'rgba(63,230,255,.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 2, 30, 10, 0, 0, TAU); ctx.stroke();
      ctx.restore();

      NP.Art.drawHero(ctx, {
        x: this.x, y: this.y, scale: 1.12, aim: this.aim, facing: this.facing, t,
        over, hurt: this.hurt, dash: this.dashT > 0 ? 1 : 0, walk: this.walk
      });
      if (this.muzzle > 0.35) {
        const mx = this.x + Math.cos(this.aim) * 34;
        const my = this.y - 38 + Math.sin(this.aim) * 34;
        NP.Art.drawGlow(ctx, mx, my, 26 * this.muzzle, this.over > 0 ? 'rgba(255,120,180,.9)' : 'rgba(150,240,255,.9)', 0.85);
      }
      if (over) {
        NP.Art.drawGlow(ctx, this.x, this.y - 30, 80, 'rgba(255,47,125,.5)', 0.35 + 0.1 * Math.sin(t * 10));
      }
    }
  };

  /* =========================== 敌人 =========================== */
  const MOB_DEF = {
    assault: { hp: 250, atk: 74, def: 18, spd: 215, r: 19, color: '#ff6b3c', name: '锋刃' },
    tank: { hp: 380, atk: 52, def: 125, spd: 100, r: 27, color: '#37d9c4', name: '壁垒' },
    brute: { hp: 700, atk: 72, def: 45, spd: 118, r: 33, color: '#b06bff', name: '肉山' }
  };
  NP.MOB_DEF = MOB_DEF;

  NP.Mob = class Mob {
    constructor(G, type, x, y) {
      const d = MOB_DEF[type];
      this.G = G;
      this.type = type;
      this.x = x; this.y = y;
      this.r = d.r;
      this.vx = 0; this.vy = 0;
      const diff = G.diffData;
      const growth = 1 + G.kills * 0.0055;
      this.maxHp = Math.round(d.hp * diff.mobHp * growth);
      this.hp = this.maxHp;
      this.atk = d.atk * diff.mobAtk * (1 + G.kills * 0.0035);
      this.def = d.def * (1 + G.kills * 0.004);
      this.speed = d.spd * NP.rand(0.9, 1.1);
      this.stun = 0;
      this.hitFlash = 0;
      this.attackCd = NP.rand(0.6, 1.4);
      this.phase = NP.rand(0, TAU);
      this.spawnT = 0.45;
      this.dead = false;
      this.orbit = NP.rand(-1, 1) > 0 ? 1 : -1;
      this.dashCd = NP.rand(1.5, 3.6);
      this.dashT = 0;
      this.dashAng = 0;
    }

    get alive() { return !this.dead && this.hp > 0; }

    update(dt) {
      const G = this.G;
      if (this.dead) return;
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      if (this.stun > 0) {
        this.stun -= dt;
        this.vx *= 0.9; this.vy *= 0.9;
        this.x += this.vx * dt; this.y += this.vy * dt;
        return;
      }
      const p = G.player;
      const ang = Math.atan2(p.y - this.y, p.x - this.x);
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      this.attackCd -= dt;
      this.dashCd -= dt;

      if (this.type === 'assault') {
        if (this.dashT > 0) {
          this.dashT -= dt;
          this.x += Math.cos(this.dashAng) * 620 * dt;
          this.y += Math.sin(this.dashAng) * 620 * dt;
          G.burst(this.x, this.y, 1, 'rgba(255,107,60,.8)', 40, { life: 0.25, size: 2 });
        } else {
          if (this.dashCd <= 0 && d < 420 && d > 90) {
            this.dashCd = NP.rand(2.6, 4.4);
            this.dashT = 0.26;
            this.dashAng = ang;
            G.fxRing(this.x, this.y, 26, 'rgba(255,107,60,.8)', 0.3);
          }
          const targetAng = ang + Math.sin(G.time * 1.4 + this.phase) * 0.35;
          this.vx = Math.cos(targetAng) * this.speed;
          this.vy = Math.sin(targetAng) * this.speed;
        }
      } else if (this.type === 'tank') {
        const want = d > 330 ? 1 : d < 240 ? -0.5 : 0;
        this.vx = Math.cos(ang) * this.speed * want;
        this.vy = Math.sin(ang) * this.speed * want;
        this.vx += Math.cos(ang + Math.PI / 2) * this.speed * 0.35 * this.orbit;
        this.vy += Math.sin(ang + Math.PI / 2) * this.speed * 0.35 * this.orbit;
        if (this.attackCd <= 0 && d < 760) {
          this.attackCd = NP.rand(2.4, 3.2);
          G.spawnMobBullet(this.x, this.y, ang + NP.rand(-0.06, 0.06), 320, this.atk, 8, '#37d9c4');
        }
      } else {
        const wob = Math.sin(G.time * 2 + this.phase) * 0.25;
        this.vx = Math.cos(ang + wob) * this.speed;
        this.vy = Math.sin(ang + wob) * this.speed;
      }

      for (const o of G.mobs) {
        if (o === this || !o.alive) continue;
        const dx = this.x - o.x, dy = this.y - o.y;
        const dd = dx * dx + dy * dy;
        const minD = this.r + o.r;
        if (dd > 0.01 && dd < minD * minD) {
          const dl = Math.sqrt(dd);
          const push = (minD - dl) / dl * 0.5;
          this.vx += dx * push * 8;
          this.vy += dy * push * 8;
        }
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.x = NP.clamp(this.x, 20, G.world.w - 20);
      this.y = NP.clamp(this.y, 20, G.world.h - 20);

      if (d < this.r + p.r + 2 && this.attackCd <= 0) {
        this.attackCd = this.type === 'assault' ? 1.0 : 1.35;
        p.takeDamage(this.atk * (this.type === 'brute' ? 1.25 : 1));
      }
    }

    draw(ctx, t) {
      if (this.spawnT > 0) {
        const a = 1 - this.spawnT / 0.45;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,47,125,${a * 0.9})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(this.x, this.y + this.r * 0.6, this.r * (2 - a), this.r * 0.5, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      const p = this.G.player;
      const ang = Math.atan2(p.y - this.y, p.x - this.x);
      const flash = this.hitFlash;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, this.r * 0.75, this.r * 0.9, this.r * 0.34, 0, 0, TAU); ctx.fill();

      if (this.type === 'assault') this.drawAssault(ctx, t, ang, flash);
      else if (this.type === 'tank') this.drawTank(ctx, t, ang, flash);
      else this.drawBrute(ctx, t, ang, flash);

      if (this.stun > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(63,230,255,.9)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const a = t * 4 + i * 2.1;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 20, -this.r - 16 + Math.sin(a) * 5, 2.4, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();

      if (this.hp < this.maxHp) {
        const w = this.r * 2.2, h = 3.5;
        const x = this.x - w / 2, y = this.y - this.r - 16;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = this.type === 'tank' ? '#37d9c4' : this.type === 'brute' ? '#b06bff' : '#ff6b3c';
        ctx.fillRect(x, y, w * (this.hp / this.maxHp), h);
      }
    }

    drawAssault(ctx, t, ang, flash) {
      const bob = Math.sin(t * 8 + this.phase) * 2;
      NP.Art.drawGlow(ctx, 0, 4 + bob, 24, 'rgba(255,107,60,.55)', 0.6);
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = '#42160e';
      NP.Art.poly(ctx, [[8, -16], [30, -9], [30, -4], [8, -4]]); ctx.fill();
      NP.Art.poly(ctx, [[8, 16], [30, 9], [30, 4], [8, 4]]); ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,90,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(28, -7); ctx.lineTo(9, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(28, 7); ctx.lineTo(9, 6); ctx.stroke();
      ctx.restore();
      const g = ctx.createLinearGradient(0, -18, 0, 18);
      g.addColorStop(0, '#5a2416');
      g.addColorStop(1, '#2a0f0a');
      ctx.fillStyle = g;
      NP.Art.poly(ctx, [[0, -17], [15, -8], [15, 8], [0, 17], [-15, 8], [-15, -8]]);
      ctx.fill();
      ctx.strokeStyle = flash > 0 ? '#fff' : 'rgba(255,107,60,.95)';
      ctx.lineWidth = 1.8; ctx.stroke();
      const ex = Math.cos(ang) * 4, ey = Math.sin(ang) * 4;
      ctx.fillStyle = '#ff3b2f';
      ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, TAU); ctx.fill();
      NP.Art.drawGlow(ctx, ex, ey, 18, 'rgba(255,90,60,.95)', 0.8 + 0.2 * Math.sin(t * 6));
      ctx.fillStyle = '#ffe0c0';
      ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * 1.5, ey + Math.sin(ang) * 1.5, 2, 0, TAU); ctx.fill();
    }

    drawTank(ctx, t, ang, flash) {
      ctx.save();
      ctx.rotate(ang);
      const sg = ctx.createLinearGradient(10, 0, 40, 0);
      sg.addColorStop(0, 'rgba(55,217,196,.35)');
      sg.addColorStop(1, 'rgba(55,217,196,.05)');
      ctx.fillStyle = sg;
      NP.Art.poly(ctx, [[12, -24], [34, -16], [36, 0], [34, 16], [12, 24], [8, 0]]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(55,217,196,.85)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(180,255,245,.5)'; ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(20, i * 7); ctx.lineTo(31, i * 6); ctx.stroke();
      }
      ctx.restore();
      const g = ctx.createLinearGradient(0, -22, 0, 22);
      g.addColorStop(0, '#1d4f4c');
      g.addColorStop(1, '#0b2422');
      ctx.fillStyle = g;
      NP.Art.rr(ctx, -20, -22, 40, 44, 9); ctx.fill();
      ctx.strokeStyle = flash > 0 ? '#fff' : 'rgba(55,217,196,.9)';
      ctx.lineWidth = 2; NP.Art.rr(ctx, -20, -22, 40, 44, 9); ctx.stroke();
      ctx.fillStyle = 'rgba(55,217,196,.15)';
      NP.Art.rr(ctx, -15, -16, 30, 12, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(55,217,196,.4)'; ctx.lineWidth = 1;
      NP.Art.rr(ctx, -15, -16, 30, 12, 4); ctx.stroke();
      NP.Art.rr(ctx, -15, 3, 30, 12, 4); ctx.fill(); ctx.stroke();
      const ex = Math.cos(ang) * 6, ey = Math.sin(ang) * 3;
      ctx.fillStyle = '#b6fff2';
      NP.Art.rr(ctx, ex - 5, ey - 2, 10, 4, 2); ctx.fill();
      NP.Art.drawGlow(ctx, ex, ey, 20, 'rgba(55,217,196,.8)', 0.6);
      ctx.fillStyle = '#12332f';
      NP.Art.rr(ctx, -24, -10, 6, 20, 3); ctx.fill();
      NP.Art.rr(ctx, 18, -10, 6, 20, 3); ctx.fill();
    }

    drawBrute(ctx, t, ang, flash) {
      const bob = Math.sin(t * 3.2 + this.phase) * 3;
      ctx.save();
      ctx.translate(0, bob * 0.4);
      ctx.strokeStyle = 'rgba(176,107,255,.55)';
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + t * 0.8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 12 + 6);
        ctx.quadraticCurveTo(Math.cos(a) * 26, Math.sin(a) * 22 + 12 + Math.sin(t * 3 + i) * 5, Math.cos(a) * 34, Math.sin(a) * 30 + 16);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(-6, -8, 4, 0, 0, this.r + 6);
      g.addColorStop(0, '#8a4be0');
      g.addColorStop(0.6, '#58258f');
      g.addColorStop(1, '#2a0d44');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * TAU;
        const rr = this.r * (1 + Math.sin(a * 3 + t * 2.4 + this.phase) * 0.06);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.92;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = flash > 0 ? '#fff' : 'rgba(200,150,255,.85)';
      ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const ea = ang + (i - 1) * 0.5;
        const ex = Math.cos(ea) * 13, ey = Math.sin(ea) * 10 - 2;
        ctx.fillStyle = i === 1 ? '#ffe066' : '#ff5ea8';
        ctx.beginPath(); ctx.arc(ex, ey, i === 1 ? 5 : 3.5, 0, TAU); ctx.fill();
        NP.Art.drawGlow(ctx, ex, ey, i === 1 ? 20 : 14, i === 1 ? 'rgba(255,224,102,.9)' : 'rgba(255,94,168,.85)', 0.7);
      }
      ctx.fillStyle = 'rgba(10,4,18,.9)';
      ctx.beginPath(); ctx.ellipse(Math.cos(ang) * 8, Math.sin(ang) * 8 + 8, 9, 5, ang, 0, TAU); ctx.fill();
      ctx.restore();
    }
  };

  /* =========================== 掉落 =========================== */
  NP.Orb = class Orb {
    constructor(x, y, kind) {
      this.x = x; this.y = y;
      this.kind = kind;
      this.vx = NP.rand(-70, 70); this.vy = NP.rand(-130, -40);
      this.life = 10; this.t = 0; this.r = 9;
      this.magnet = false;
    }
    update(dt, G) {
      this.t += dt;
      this.life -= dt;
      const p = G.player;
      const d = NP.dist(this, p);
      if (d < 190) this.magnet = true;
      if (this.magnet) {
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        this.x += Math.cos(a) * 520 * dt;
        this.y += Math.sin(a) * 520 * dt;
      } else {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= 0.94; this.vy *= 0.94;
      }
      if (d < 26) { G.collectOrb(this); return false; }
      return this.life > 0;
    }
    draw(ctx, t) {
      if (this.kind === 'heal') {
        const s = 1 + Math.sin(t * 8) * 0.12;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(s, s);
        ctx.fillStyle = 'rgba(182,255,74,.9)';
        NP.Art.rr(ctx, -8, -2.5, 16, 5, 2); ctx.fill();
        NP.Art.rr(ctx, -2.5, -8, 5, 16, 2); ctx.fill();
        NP.Art.drawGlow(ctx, 0, 0, 22, 'rgba(182,255,74,.8)', 0.55);
        ctx.restore();
      } else {
        const s = 1 + Math.sin(t * 10 + this.x) * 0.1;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.PI / 4);
        ctx.scale(s, s);
        const g = ctx.createLinearGradient(-7, -7, 7, 7);
        g.addColorStop(0, '#e8fdff');
        g.addColorStop(0.5, '#5ce9ff');
        g.addColorStop(1, '#0d8ea8');
        ctx.fillStyle = g;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeStyle = 'rgba(200,250,255,.9)'; ctx.lineWidth = 1;
        ctx.strokeRect(-6, -6, 12, 12);
        NP.Art.drawGlow(ctx, 0, 0, 20, 'rgba(63,230,255,.75)', 0.5);
        ctx.restore();
      }
    }
  };
})();