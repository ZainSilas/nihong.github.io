/* =====================================================================
   霓虹协议 · entities.js  （横版卷轴版）
   玩家 / 敌人 / 掉落 —— 采用「脚点 + 矩形碰撞体」的横版模型
   ===================================================================== */
(function () {
  'use strict';
  const NP = window.NP;
  const TAU = NP.TAU;

  const GRAV = 2600;
  const JUMP = -900;

  /* 地面 / 平台：返回给定 x 处、脚点 y 以下最近的可站立面 */
  NP.surfaceAt = function (G, x, feetY, prevFeetY, ignorePlatforms) {
    let best = G.groundY;
    if (ignorePlatforms) return best;
    // 站在地面
    for (const p of G.platforms) {
      if (x < p.x - 10 || x > p.x + p.w + 10) continue;
      if (prevFeetY <= p.y + 2 && feetY >= p.y) {
        if (p.y < best) best = p.y;
      }
    }
    return best;
  };

  /* =========================== 玩家 =========================== */
  NP.Player = class Player {
    constructor(G) {
      this.G = G;
      this.x = G.world.w * 0.5;
      this.y = G.groundY;
      this.r = 24;          // 半宽
      this.h = 118;         // 身高（脚点到头顶）
      this.vx = 0;
      this.vy = 0;
      this.onGround = true;
      this.aim = 0;
      this.facing = 1;
      this.level = 1;
      this.xp = 0;
      this.pendingCards = 0;
      this.stacks = {};
      this.mods = NP.newMods();
      this.cd = { dash: 0, q: 0, e: 0, r: 0 };
      this.over = 0;
      this.iframe = 1.2;
      this.hurt = 0;
      this.dashT = 0;
      this.dashDir = 1;
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

    get chestY() { return this.y - this.h * 0.55; }

    recalc(healDelta) {
      const oldMax = this.maxHp || 0;
      this.stats = NP.computeStats(this.level, this.mods, this.G.save.data.up);
      this.maxHp = this.stats.maxHp;
      if (healDelta !== false) this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oldMax));
      this.hp = Math.min(this.hp, this.maxHp);
    }

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

    update(dt) {
      const G = this.G;
      const st = this.stats;
      const inp = NP.Input;

      this.iframe = Math.max(0, this.iframe - dt);
      this.hurt = Math.max(0, this.hurt - dt * 3.6);
      this.over = Math.max(0, this.over - dt);
      this.muzzle = Math.max(0, this.muzzle - dt * 8);
      this.dashT = Math.max(0, this.dashT - dt);
      for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);

      if (st.shieldGen > 0) {
        this.shieldT += dt;
        if (this.shieldT >= 12) {
          this.shieldT = 0;
          this.shieldMax = Math.round(this.maxHp * st.shieldGen);
          this.shield = Math.max(this.shield, this.shieldMax);
          G.fxRing(this.x, this.y - 40, 46, 'rgba(63,230,255,.9)', 0.5);
        }
      }
      if (st.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * st.regen * dt);
      this.noHitT += dt;
      if (this.noHitT > 5 && this.hp > 0 && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.012 * dt);
      }

      /* ---------- 水平移动 + 跳跃 ---------- */
      let move = 0;
      if (inp.keys.KeyA || inp.keys.ArrowLeft) move -= 1;
      if (inp.keys.KeyD || inp.keys.ArrowRight) move += 1;
      this.walk = NP.lerp(this.walk, move !== 0 ? 1 : 0, Math.min(1, dt * 10));

      const speed = 340 * st.moveMul;
      if (this.dashT > 0) {
        this.vx = this.dashDir * 1150;
      } else {
        this.vx = move * speed;
      }

      const jumpKey = inp.keys.Space || inp.keys.KeyW || inp.keys.ArrowUp;
      if (jumpKey && this.onGround && this.dashT <= 0) {
        this.vy = JUMP;
        this.onGround = false;
        NP.Audio.sfx('dash');
        G.burst(this.x, this.y, 6, 'rgba(63,230,255,.75)', 160, { life: 0.3, size: 3 });
      }
      if (!jumpKey && this.vy < -300) this.vy = -300;   // 松键短跳

      this.vy = Math.min(1500, this.vy + GRAV * dt);

      const prevY = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.x = NP.clamp(this.x, this.r + 6, G.world.w - this.r - 6);

      // 按住下键时忽略平台，实现下穿
      if (inp.keys.KeyS || inp.keys.ArrowDown) this.dropT = 0.22;
      else this.dropT = Math.max(0, (this.dropT || 0) - dt);
      const surf = NP.surfaceAt(G, this.x, this.y, prevY, this.dropT > 0);
      if (this.vy >= 0 && this.y >= surf) {
        if (!this.onGround) {
          G.burst(this.x, surf, 8, 'rgba(120,200,255,.5)', 160, { life: 0.3, size: 3 });
        }
        this.y = surf;
        this.vy = 0;
        this.onGround = true;
      } else if (this.y > surf + 4) {
        this.onGround = false;
      }

      for (let i = this.ghosts.length - 1; i >= 0; i--) {
        this.ghosts[i].life -= dt;
        if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
      }

      /* ---------- 瞄准：自动锁定 / 手动接管 ---------- */
      const cfg = G.save.data.settings;
      // 鼠标移动超过 2.5px 就临时切回手动瞄准，避免锁定跟手打架
      const mdx = Math.abs(inp.mouse.x - (this._mx || 0)) + Math.abs(inp.mouse.y - (this._my || 0));
      this._mx = inp.mouse.x; this._my = inp.mouse.y;
      if (inp.mouse.down || mdx > 2.5) this.manualT = 0.9;
      else this.manualT = Math.max(0, (this.manualT || 0) - dt);

      this.lockTarget = null;
      let aimed = false;
      if (G.autoplay) {
        const t = G.nearestTarget(this.x, this.chestY, 2000);
        if (t) {
          this.lockTarget = t;
          this.aim = Math.atan2(t.cy - this.chestY, t.x - this.x);
          aimed = true;
        }
      } else if (cfg.lock !== false && this.manualT <= 0) {
        const t = this.findLockTarget();
        if (t) {
          this.lockTarget = t;
          this.aim = Math.atan2(t.cy - this.chestY, t.x - this.x);
          aimed = true;
        }
      }
      if (!aimed) {
        const w = G.cam.screenToWorld(inp.mouse.x, inp.mouse.y);
        this.aim = Math.atan2(w.y - this.chestY, w.x - this.x);
      }

      if (this.lockTarget) this.facing = this.lockTarget.x >= this.x ? 1 : -1;
      else if (move !== 0) this.facing = move;
      else if (Math.abs(Math.cos(this.aim)) > 0.2) this.facing = Math.cos(this.aim) > 0 ? 1 : -1;

      /* ---------- 射击 ---------- */
      this.fireT -= dt;
      const auto = cfg.auto || G.autoplay;
      // 开了锁定且场上没有目标时不自动开火，省得对着空气扫射
      const autoAllowed = cfg.lock === false || !!this.lockTarget || G.autoplay;
      const wantFire = inp.mouse.down || inp.keys.KeyJ || (auto && autoAllowed);
      const rate = st.fireRate * (this.over > 0 ? 4 : 1);
      if (wantFire && this.fireT <= 0) {
        this.fireT = 1 / rate;
        this.shoot();
      }
      if (this.fireT < -0.3) this.fireT = 0;

      /* ---------- 技能 ---------- */
      const q = NP.Input.consume();
      for (const code of q) {
        if (code === 'ShiftLeft' || code === 'ShiftRight') this.doDash();
        else if (code === 'KeyQ') this.doOverclock();
        else if (code === 'KeyE') this.doEmp();
        else if (code === 'KeyR') this.doLaser();
      }
    }

    /* 选择自动锁定目标：距离优先，背后目标降权，首领优先 */
    findLockTarget() {
      const G = this.G;
      let best = null, bestScore = Infinity;
      const consider = (e) => {
        if (!e || e.alive === false || e.dead) return;
        const cy = (e.cy !== undefined) ? e.cy : e.y;
        const dx = e.x - this.x, dy = cy - this.chestY;
        const d = Math.hypot(dx, dy);
        if (d > 1500) return;
        let score = d;
        if (Math.sign(dx) !== this.facing && Math.abs(dx) > 60) score *= 1.4;
        if (e === G.boss) score *= 0.8;
        if (score < bestScore) { bestScore = score; best = e; }
      };
      for (const m of G.mobs) consider(m);
      for (const c of G.clones) consider(c);
      if (G.boss) consider(G.boss);
      return best;
    }

    shoot() {
      const G = this.G;
      const st = this.stats;
      const overMul = this.over > 0 ? 2.5 : 1;
      const n = 1 + st.multishot;
      const base = st.atk * overMul;
      const spreadBase = n > 1 ? 0.045 : 0;
      const ox = this.x, oy = this.chestY;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * spreadBase * 2;
        const a = this.aim + off + NP.rand(-0.01, 0.01);
        const crit = Math.random() < st.crit;
        const dmg = base * (crit ? st.critDmg : 1);
        G.pBullets.push({
          x: ox + Math.cos(a) * 30,
          y: oy + Math.sin(a) * 30,
          vx: Math.cos(a) * st.bulletSpeed,
          vy: Math.sin(a) * st.bulletSpeed,
          dmg, crit, r: crit ? 6 : 5,
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
      this.iframe = Math.max(this.iframe, 0.18);
      this.dashDir = (NP.Input.keys.KeyA || NP.Input.keys.ArrowLeft) ? -1
        : (NP.Input.keys.KeyD || NP.Input.keys.ArrowRight) ? 1
          : (Math.cos(this.aim) >= 0 ? 1 : -1);
      NP.Audio.sfx('dash');
      this.G.fxRing(this.x, this.y - 40, 40, 'rgba(63,230,255,.8)', 0.35);
    }

    doOverclock() {
      if (this.cd.q > 0) return;
      this.cd.q = 30 * (1 - this.stats.cdr);
      this.over = this.stats.overDur;
      NP.Audio.sfx('overclock');
      this.G.toast('超频协议 // 攻速 +300% · 伤害 +150% · 吸血 10%');
      this.G.fxRing(this.x, this.y - 40, 70, 'rgba(255,47,125,.9)', 0.7);
      this.G.shake(3);
    }

    doEmp() {
      if (this.cd.e > 0) return;
      this.cd.e = 15 * (1 - this.stats.cdr);
      const st = this.stats;
      const heal = Math.round(this.maxHp * 0.3);
      this.hp = Math.min(this.maxHp, this.hp + heal);
      const cy = this.y - 50;
      this.G.fxRing(this.x, cy, st.empR, 'rgba(63,230,255,.95)', 0.9, 0.55);
      this.G.fxRing(this.x, cy, st.empR * 0.6, 'rgba(160,107,255,.8)', 0.7, 0.4);
      NP.Audio.sfx('emp');
      this.G.shake(6);
      this.G.healText(this.x, this.y - 90, heal);
      for (const m of this.G.mobs) {
        if (NP.dist({ x: m.x, y: m.y - m.h * 0.5 }, { x: this.x, y: cy }) < st.empR + m.r) {
          m.stun = Math.max(m.stun, 5);
          m.hitFlash = 1;
          if (st.empDmg > 0) this.G.damageMob(m, st.atk * 1.2, false, false);
        }
      }
      const targets = [this.G.boss, ...this.G.clones].filter(Boolean);
      for (const b of targets) {
        if (NP.dist(b, { x: this.x, y: cy }) < st.empR + b.r) {
          b.stun = Math.max(b.stun || 0, 1.4);
          b.hitFlash = 1;
          this.G.text('压制 1.4s', b.x, b.y - b.r - 20, '#9beeff', 15);
          if (st.empDmg > 0) this.G.damageBoss(b, st.atk * 1.5, false, false);
        }
      }
      this.G.toast('电磁脉冲 // 全域压制 5s · 生命 +30%');
    }

    doLaser() {
      if (this.cd.r > 0) return;
      this.cd.r = 8 * (1 - this.stats.cdr);
      const st = this.stats;
      const dmg = (1000 + 0.08 * st.atk + 0.02 * this.maxHp) * st.laserMul;
      const len = 1600;
      const ox = this.x + Math.cos(this.aim) * 30, oy = this.chestY + Math.sin(this.aim) * 30;
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
        if (this.dashT > 0) G.text('MISS', this.x + NP.rand(-14, 14), this.y - 120, '#8ff3ff', 15);
        return false;
      }
      let dmg = raw * this.stats.takenMul;
      if (this.shield > 0) {
        const absorbed = Math.min(this.shield, dmg);
        this.shield -= absorbed;
        dmg -= absorbed;
        if (absorbed > 0) G.text(`-${Math.round(absorbed)} 护盾`, this.x, this.y - 110, '#9beeff', 13);
      }
      if (dmg >= 1) {
        this.hp -= dmg;
        this.hurt = 1;
        this.noHitT = 0;
        this.iframe = 0.45;
        G.shake(5 + Math.min(8, dmg / this.maxHp * 40));
        G.hurtFlash = 1;
        if (G.save.data.settings.dmgNum) G.text(`-${Math.round(dmg)}`, this.x + NP.rand(-10, 10), this.y - 100, '#ff5d7b', 17);
        NP.Audio.sfx('hurt');
      }
      if (this.hp <= 0) { this.hp = 0; G.onPlayerDeath(); }
      return true;
    }

    onDamageDealt(amount) {
      const ls = this.stats.lifesteal + (this.over > 0 ? 0.1 : 0);
      if (ls > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + amount * ls);
    }

    draw(ctx, t) {
      const over = this.over > 0 ? 1 : 0;
      for (const gh of this.ghosts) {
        const a = gh.life / gh.max;
        ctx.save();
        ctx.globalAlpha = a * 0.35;
        ctx.translate(gh.x, gh.y);
        ctx.scale(this.facing, 1);
        NP.Art.drawHeroSide(ctx, { over, t, walk: 0, aim: gh.aim, dash: 1 });
        ctx.restore();
      }

      // 地面光环
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(this.x, this.y + 2, 2, this.x, this.y + 2, 46);
      rg.addColorStop(0, over ? 'rgba(255,47,125,.35)' : 'rgba(63,230,255,.26)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 2, 46, 11, 0, 0, TAU); ctx.fill();
      ctx.restore();

      if (this.shield > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const a = 0.22 + 0.12 * Math.sin(t * 8);
        ctx.strokeStyle = `rgba(63,230,255,${a + 0.22})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(this.x, this.y - 60, 46, 66, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(63,230,255,${a * 0.3})`;
        ctx.beginPath(); ctx.ellipse(this.x, this.y - 60, 46, 66, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1.6 * this.facing, 1.6);
      NP.Art.drawHeroSide(ctx, {
        over, hurt: this.hurt, t,
        walk: this.onGround ? this.walk : 0.15,
        air: !this.onGround,
        aim: this.facing >= 0 ? this.aim : Math.PI - this.aim,
        dash: this.dashT > 0 ? 1 : 0
      });
      ctx.restore();

      // 锁定标记
      const lt = this.lockTarget;
      if (lt && lt.alive !== false) {
        const cy = (lt.cy !== undefined) ? lt.cy : lt.y - 40;
        const rr = Math.max(22, (lt.r || 24) * 1.5);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,80,140,.85)';
        ctx.lineWidth = 2;
        const s2 = rr * 0.55;
        const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
        for (const [sx, sy] of corners) {
          ctx.beginPath();
          ctx.moveTo(lt.x + sx * rr, cy + sy * rr - sy * s2);
          ctx.lineTo(lt.x + sx * rr, cy + sy * rr);
          ctx.lineTo(lt.x + sx * rr - sx * s2, cy + sy * rr);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(63,230,255,.5)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(lt.x, cy, rr * (1.05 + Math.sin(t * 6) * 0.04), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      if (this.muzzle > 0.35) {
        const mx = this.x + Math.cos(this.aim) * 62;
        const my = this.chestY + Math.sin(this.aim) * 62;
        NP.Art.drawGlow(ctx, mx, my, 30 * this.muzzle, over ? 'rgba(255,120,180,.9)' : 'rgba(150,240,255,.9)', 0.85);
      }
      if (over) NP.Art.drawGlow(ctx, this.x, this.y - 60, 90, 'rgba(255,47,125,.5)', 0.35 + 0.1 * Math.sin(t * 10));
    }
  };

  /* =========================== 敌人 =========================== */
  const MOB_DEF = {
    assault: { hp: 250, atk: 74, def: 18, spd: 240, r: 20, h: 66, color: '#ff6b3c', name: '锋刃' },
    tank: { hp: 380, atk: 52, def: 125, spd: 105, r: 28, h: 88, color: '#37d9c4', name: '壁垒' },
    brute: { hp: 700, atk: 72, def: 45, spd: 120, r: 38, h: 96, color: '#b06bff', name: '肉山' }
  };
  NP.MOB_DEF = MOB_DEF;

  NP.Mob = class Mob {
    constructor(G, type, x, y, air) {
      const d = MOB_DEF[type];
      this.G = G;
      this.type = type;
      this.x = x;
      this.y = y;
      this.r = d.r;
      this.h = d.h;
      this.air = !!air;
      this.baseY = y;
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
      this.dashCd = NP.rand(1.6, 3.4);
      this.dashT = 0;
      this.dashDir = 1;
      this.vx = 0;
    }

    get alive() { return !this.dead && this.hp > 0; }
    get cy() { return this.y - this.h * 0.5; }

    update(dt) {
      const G = this.G;
      if (this.dead) return;
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      if (this.stun > 0) {
        this.stun -= dt;
        if (this.air) this.y = this.baseY + Math.sin(G.time * 3 + this.phase) * 6;
        return;
      }
      const p = G.player;
      const dx = p.x - this.x;
      const dir = dx >= 0 ? 1 : -1;
      const distX = Math.abs(dx);
      this.attackCd -= dt;
      this.dashCd -= dt;

      if (this.air) {
        // 空中单位：悬停 + 缓慢贴近
        this.baseY = NP.clamp(this.baseY + (dir * 0), 120, G.groundY - 60);
        this.x += dir * this.speed * 0.55 * dt;
        this.y = this.baseY + Math.sin(G.time * 3 + this.phase) * 10;
        if (this.attackCd <= 0 && distX < 620) {
          this.attackCd = NP.rand(2.2, 3.2);
          G.spawnMobBullet(this.x, this.cy, Math.atan2(p.chestY - this.cy, p.x - this.x), 340, this.atk, 8, MOB_DEF[this.type].color);
        }
        this.contactHit(p);
        return;
      }

      if (this.type === 'assault') {
        if (this.dashT > 0) {
          this.dashT -= dt;
          this.x += this.dashDir * 700 * dt;
          G.burst(this.x, this.cy, 1, 'rgba(255,107,60,.8)', 40, { life: 0.25, size: 2 });
        } else {
          if (this.dashCd <= 0 && distX < 420 && distX > 60) {
            this.dashCd = NP.rand(2.4, 4);
            this.dashT = 0.28;
            this.dashDir = dir;
            G.fxRing(this.x, this.cy, 26, 'rgba(255,107,60,.8)', 0.3);
          }
          this.x += dir * this.speed * dt;
        }
      } else if (this.type === 'tank') {
        const want = distX > 300 ? 1 : distX < 200 ? -0.6 : 0;
        this.x += dir * this.speed * want * dt;
        if (this.attackCd <= 0 && distX < 760) {
          this.attackCd = NP.rand(2.3, 3.1);
          G.spawnMobBullet(this.x, this.cy, Math.atan2(p.chestY - this.cy, p.x - this.x), 360, this.atk, 8, MOB_DEF.tank.color);
        }
      } else {
        this.x += dir * this.speed * dt;
        if (this.attackCd <= 0 && distX < 90) {
          this.attackCd = 1.4;
        }
      }

      this.y = G.groundY;
      this.x = NP.clamp(this.x, this.r + 4, G.world.w - this.r - 4);
      this.contactHit(p);
    }

    contactHit(p) {
      const pad = this.r + p.r;
      const overlapping = Math.abs(p.x - this.x) < pad &&
        p.y > this.y - this.h - 10 && p.y - p.h < this.y + 10;
      if (overlapping && this.attackCd <= 0) {
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
        ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * (2 - a), this.r * 0.4, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      const face = (this.G.player.x >= this.x) ? 1 : -1;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(face, 1);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(0, 2, this.r * 0.95, this.r * 0.28, 0, 0, TAU); ctx.fill();
      const flash = this.hitFlash;

      if (this.type === 'assault') this.drawAssault(ctx, t, flash);
      else if (this.type === 'tank') this.drawTank(ctx, t, flash);
      else this.drawBrute(ctx, t, flash);

      if (this.stun > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(63,230,255,.9)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const a = t * 4 + i * 2.1;
          ctx.beginPath(); ctx.arc(Math.cos(a) * 20, -this.h - 14 + Math.sin(a) * 5, 2.4, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();

      if (this.hp < this.maxHp) {
        const w = this.r * 2.2, h = 3.5;
        const x = this.x - w / 2, y = this.y - this.h - 14;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = this.type === 'tank' ? '#37d9c4' : this.type === 'brute' ? '#b06bff' : '#ff6b3c';
        ctx.fillRect(x, y, w * (this.hp / this.maxHp), h);
      }
    }

    drawAssault(ctx, t, flash) {
      const bob = Math.sin(t * 10 + this.phase) * 2;
      NP.Art.drawGlow(ctx, 0, -8, 26, 'rgba(255,107,60,.5)', 0.55);
      // 刀刃
      NP.Art.poly(ctx, [[10, -40], [32, -46], [34, -40], [12, -34]]); ctx.fillStyle = '#42160e'; ctx.fill();
      NP.Art.poly(ctx, [[10, -30], [30, -24], [28, -18], [8, -24]]); ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,90,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(31, -43); ctx.lineTo(12, -37); ctx.stroke();
      // 躯干
      const g = ctx.createLinearGradient(0, -46, 0, 0);
      g.addColorStop(0, '#5a2416');
      g.addColorStop(1, '#2a0f0a');
      ctx.fillStyle = g;
      NP.Art.poly(ctx, [[-14, -6], [-10, -44 + bob], [10, -44 + bob], [16, -14], [8, 0], [-8, 0]]);
      ctx.fill();
      ctx.strokeStyle = flash > 0 ? '#fff' : 'rgba(255,107,60,.95)';
      ctx.lineWidth = 1.8; ctx.stroke();
      // 眼
      ctx.fillStyle = '#ff3b2f';
      ctx.beginPath(); ctx.arc(6, -34 + bob, 5, 0, TAU); ctx.fill();
      NP.Art.drawGlow(ctx, 6, -34 + bob, 18, 'rgba(255,90,60,.95)', 0.8);
      // 腿
      ctx.fillStyle = '#31120c';
      Art_rr(ctx, -12, -14, 8, 14, 3);
      Art_rr(ctx, 4, -14, 8, 14, 3);
    }

    drawTank(ctx, t, flash) {
      const bob = Math.sin(t * 3 + this.phase) * 1.5;
      // 正面护盾
      NP.Art.poly(ctx, [[16, -70], [34, -60], [34, -14], [16, -6]]);
      ctx.fillStyle = 'rgba(55,217,196,.28)'; ctx.fill();
      ctx.strokeStyle = 'rgba(55,217,196,.85)'; ctx.lineWidth = 2; ctx.stroke();
      // 机体
      const g = ctx.createLinearGradient(0, -80, 0, 0);
      g.addColorStop(0, '#1d4f4c');
      g.addColorStop(1, '#0b2422');
      ctx.fillStyle = g;
      Art_rr(ctx, -26, -80 + bob, 44, 80, 9);
      ctx.strokeStyle = flash > 0 ? '#fff' : 'rgba(55,217,196,.9)';
      ctx.lineWidth = 2; ctx.stroke();
      // 装甲板
      ctx.fillStyle = 'rgba(55,217,196,.18)';
      Art_rr(ctx, -20, -70 + bob, 32, 16, 4);
      Art_rr(ctx, -20, -46 + bob, 32, 16, 4);
      // 眼
      ctx.fillStyle = '#b6fff2';
      Art_rr(ctx, 2, -62 + bob, 12, 4, 2);
      NP.Art.drawGlow(ctx, 8, -60 + bob, 20, 'rgba(55,217,196,.8)', 0.6);
      // 履带
      ctx.fillStyle = '#12332f';
      Art_rr(ctx, -28, -12, 48, 12, 5);
    }

    drawBrute(ctx, t, flash) {
      const bob = Math.sin(t * 3.2 + this.phase) * 3;
      ctx.strokeStyle = 'rgba(176,107,255,.5)';
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + t * 0.8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 18, -20 + Math.sin(a) * 12);
        ctx.quadraticCurveTo(Math.cos(a) * 30, -34 + Math.sin(a) * 20, Math.cos(a) * 34, -46 + Math.sin(a) * 24);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(-6, -60, 6, 0, -46, this.r + 14);
      g.addColorStop(0, '#8a4be0');
      g.addColorStop(0.6, '#58258f');
      g.addColorStop(1, '#2a0d44');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * TAU;
        const rr = this.r * (1 + Math.sin(a * 3 + t * 2.4 + this.phase) * 0.06);
        const px = Math.cos(a) * rr * 1.05, py = -48 + Math.sin(a) * rr * 1.15 + bob * 0.4;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = flash > 0 ? '#fff' : 'rgba(200,150,255,.85)';
      ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const ex = 6 + i * 9, ey = -62 + (i % 2) * 8;
        ctx.fillStyle = i === 1 ? '#ffe066' : '#ff5ea8';
        ctx.beginPath(); ctx.arc(ex, ey, i === 1 ? 5 : 3.5, 0, TAU); ctx.fill();
        NP.Art.drawGlow(ctx, ex, ey, i === 1 ? 20 : 14, i === 1 ? 'rgba(255,224,102,.9)' : 'rgba(255,94,168,.85)', 0.7);
      }
    }
  };

  function Art_rr(ctx, x, y, w, h, r) {
    NP.Art.rr(ctx, x, y, w, h, r);
    ctx.fill();
  }

  /* =========================== 掉落 =========================== */
  NP.Orb = class Orb {
    constructor(x, y, kind) {
      this.x = x; this.y = y;
      this.kind = kind;
      this.vx = NP.rand(-90, 90);
      this.vy = NP.rand(-320, -180);
      this.life = 12; this.t = 0; this.r = 10;
      this.magnet = false;
      this.grounded = false;
    }
    update(dt, G) {
      this.t += dt;
      this.life -= dt;
      const p = G.player;
      const d = Math.hypot(this.x - p.x, this.y - (p.y - 50));
      if (d < 240) this.magnet = true;
      if (this.magnet) {
        const a = Math.atan2((p.y - 50) - this.y, p.x - this.x);
        this.x += Math.cos(a) * 620 * dt;
        this.y += Math.sin(a) * 620 * dt;
      } else if (!this.grounded) {
        this.vy += 2200 * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.96;
        if (this.y >= G.groundY) { this.y = G.groundY; this.vy = 0; this.grounded = true; }
      }
      if (d < 30) { G.collectOrb(this); return false; }
      return this.life > 0;
    }
    draw(ctx, t) {
      const y = this.y - 12 - Math.sin(t * 3 + this.x) * 3;
      if (this.kind === 'heal') {
        const s = 1 + Math.sin(t * 8) * 0.12;
        ctx.save();
        ctx.translate(this.x, y);
        ctx.scale(s, s);
        ctx.fillStyle = 'rgba(182,255,74,.9)';
        NP.Art.rr(ctx, -9, -3, 18, 6, 3); ctx.fill();
        NP.Art.rr(ctx, -3, -9, 6, 18, 3); ctx.fill();
        NP.Art.drawGlow(ctx, 0, 0, 24, 'rgba(182,255,74,.8)', 0.55);
        ctx.restore();
      } else {
        const s = 1 + Math.sin(t * 10 + this.x) * 0.1;
        ctx.save();
        ctx.translate(this.x, y);
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