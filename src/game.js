/* =====================================================================
   霓虹协议 · game.js
   游戏主体：状态机 / 刷怪 / 战斗 / 渲染 / 界面
   ===================================================================== */
(function () {
  'use strict';
  const NP = window.NP;
  const $ = NP.$;
  const $$ = NP.$$;
  const C = NP.COL;
  const TAU = NP.TAU;

  const TOTAL_MOBS = 200;

  class Game {
    constructor() {
      this.canvas = $('#game');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.cam = new NP.Camera();
      this.world = { w: 2600, h: 1800 };
      this.save = NP.Save;
      this.diff = 1;
      this.state = 'menu';
      this.time = 0;
      this.runTime = 0;
      this.acc = 0;
      this.dpr = 1;
      this.hurtFlash = 0;
      this.bossIntroT = 0;
      this.clearT = 0;
      this.timeScale = 1;
      this.lastPhase = 'mobs';
      this.autoplay = false;
      this.bossPending = false;

      this.player = null;
      this.mobs = [];
      this.pBullets = [];
      this.mobBullets = [];
      this.orbs = [];
      this.particles = [];
      this.texts = [];
      this.rings = [];
      this.beams = [];
      this.fxBeams = [];
      this.firePatches = [];
      this.scorches = [];
      this.boss = null;
      this.clones = [];

      this.kills = 0;
      this.spawned = 0;
      this.spawnT = 0;
      this.runDiamonds = 0;
      this.bossKilledAt = 0;
      this.decor = [];
      this.ambient = [];

      this._hudCache = {};
      this.dom = {
        menu: $('#menu'), play: $('#playscreen'), hud: $('#hud'),
        mission: $('#mission'), hpFill: $('#hpFill'), hpText: $('#hpText'), xpFill: $('#xpFill'), xpText: $('#xpText'),
        lvText: $('#lvText'), atkText: $('#atkText'), defText: $('#defText'), critText: $('#critText'),
        killCount: $('#killCount'), killFill: $('#killFill'), timer: $('#timer'),
        diamondCount: $('#diamondCount'), diffChip: $('#diffChip'),
        bossBar: $('#bossBar'), bossHpFill: $('#bossHpFill'), bossHpText: $('#bossHpText'),
        bossTags: $('#bossTags'), bossShield: $('#bossShield'), bossSub: $('#bossSub'),
        banner: $('#banner'), toast: $('#toast'), bossIntro: $('#bossIntro'),
        cardOverlay: $('#cardOverlay'), cardList: $('#cardList'), cardLevel: $('#cardLevel'),
        pauseOverlay: $('#pauseOverlay'), pauseStats: $('#pauseStats'),
        resultOverlay: $('#resultOverlay'), resultTitle: $('#resultTitle'), resultSub: $('#resultSub'),
        resultStats: $('#resultStats'), resBadge: $('#resBadge'),
        shopOverlay: $('#shopOverlay'), shopList: $('#shopList'), shopDia: $('#shopDia'),
        menuDia: $('#menuDia'), diffList: $('#diffList'), clearTracks: $('#clearTracks'), clearHint: $('#clearHint'),
        heroCanvas: $('#heroCanvas'), portrait: $('#portrait'), heroStats: $('#heroStats'),
        codexBody: $('#codexBody'), saveCode: $('#saveCode'), sbMsg: $('#sbMsg'),
        skillCd: { dash: $('#cd-dash'), q: $('#cd-q'), e: $('#cd-e'), r: $('#cd-r') },
        skillEls: {
          dash: $('.skill[data-skill="dash"]'), q: $('.skill[data-skill="q"]'),
          e: $('.skill[data-skill="e"]'), r: $('.skill[data-skill="r"]')
        }
      };
      this.skillMax = { dash: 1.8, q: 15, e: 15, r: 8 };

      NP.Input.bind(this.canvas);   // 键盘 / 鼠标输入总入口
      this.bindUI();
      this.bindKeys();
      this.resize();
      window.addEventListener('resize', () => this.resize());

      this.buildMenu();
      this.drawPortrait();
      this.startMenuLoop();

      this.autotest = /[?&]test=1/.test(location.search);
      if (this.autotest) setTimeout(() => this.runSelfTest(), 60);

      // 自动开局（用于演示 / 截图）
      const qp = new URLSearchParams(location.search);
      if (qp.get('auto')) {
        setTimeout(() => {
          const d = NP.clamp(parseInt(qp.get('diff') || '1', 10) || 0, 0, 3);
          this.startRun(d);
          this.autoplay = true;
          if (qp.get('stage') === 'boss') {
            this.spawned = 200;
            this.kills = 200;
            this.player.gainXp(2000);
            this.player.pendingCards = 0;
            this.close('#cardOverlay');
            this.state = 'play';
            this.spawnBoss();
          } else if (qp.get('stage') === 'cards') {
            this.player.gainXp(400);
            this.state = 'play';
            this.openCards();
          } else if (qp.get('stage') === 'result') {
            this.state = 'play';
            this.runTime = 347;
            this.kills = 200;
            this.runDiamonds = 1104;
            this.showResult(true);
          }
          // 预演 N 秒，便于截图 / 演示
          const sim = parseFloat(qp.get('sim') || '0');
          if (sim > 0 && this.state === 'play') {
            for (let i = 0; i < sim * 60; i++) {
              this.step(1 / 60);
              if (this.state === 'cards') {
                const pool = NP.drawCards(this.player.stacks, 1);
                if (pool.length) this.player.addCard(pool[0]);
                this.player.pendingCards = 0;
                this.close('#cardOverlay');
                this.state = 'play';
              }
            }
            this.updateHud(0);
          }
        }, 80);
      }

      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    /* ================= 尺寸 ================= */
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.cam.resize(w, h);
      this.cam.zoom = NP.clamp(Math.min(w, h) / 720, 0.68, 1.6);
    }

    /* ================= 界面 ================= */
    showScreen(name) {
      this.dom.menu.classList.toggle('active', name === 'menu');
      this.dom.play.classList.toggle('active', name === 'play');
    }

    open(id) { const el = $(id); if (el) { el.classList.add('show'); } }
    close(id) { const el = $(id); if (el) { el.classList.remove('show'); } }

    bindUI() {
      $('#btnStart').onclick = () => { NP.Audio.resume(); NP.Audio.sfx('ui'); this.startRun(this.diff); };
      $('#btnShop').onclick = () => { NP.Audio.sfx('ui'); this.openShop(); };
      $('#btnCodex').onclick = () => { NP.Audio.sfx('ui'); this.openCodex(); };
      $('#btnSettings').onclick = () => { NP.Audio.sfx('ui'); this.openSettings(); };
      $('#btnPause').onclick = () => this.togglePause();
      $('#btnResume').onclick = () => this.togglePause(false);
      $('#btnRestart').onclick = () => { this.close('#pauseOverlay'); this.startRun(this.diff); };
      $('#btnQuit').onclick = () => { this.close('#pauseOverlay'); this.toMenu(); };
      $('#btnPauseSettings').onclick = () => this.openSettings();
      $('#btnAgain').onclick = () => { this.close('#resultOverlay'); this.startRun(this.diff); };
      $('#btnResMenu').onclick = () => { this.close('#resultOverlay'); this.toMenu(); };
      $('#btnResShop').onclick = () => this.openShop();
      $('#btnResShare').onclick = () => this.copyShare();
      $$('.icon-btn.close').forEach((b) => {
        b.onclick = () => { NP.Audio.sfx('ui'); this.close('#' + b.dataset.close); };
      });
      $('#btnCopyCode').onclick = () => {
        const code = NP.Save.exportCode();
        this.dom.saveCode.value = code;
        try { navigator.clipboard.writeText(code); } catch (e) { this.dom.saveCode.select(); }
        this.dom.sbMsg.textContent = '已生成存档码，复制后即可分享给朋友。';
        NP.Audio.sfx('buy');
      };
      $('#btnImportCode').onclick = () => {
        const r = NP.Save.importCode(this.dom.saveCode.value);
        if (r === true) {
          this.dom.sbMsg.textContent = '导入成功，进度已覆盖。';
          NP.Audio.sfx('buy');
          this.buildMenu(); this.buildShop(); this.syncSettings();
        } else {
          this.dom.sbMsg.textContent = '导入失败：' + r;
          NP.Audio.sfx('deny');
        }
      };
      $('#btnReset').onclick = () => {
        if (!confirm('确定清空所有进度（钻石、强化、通关记录）？')) return;
        NP.Save.reset();
        this.dom.sbMsg.textContent = '进度已清空。';
        this.buildMenu(); this.buildShop(); this.syncSettings();
      };
      $$('#codexTabs .tab').forEach((t) => {
        t.onclick = () => {
          $$('#codexTabs .tab').forEach((x) => x.classList.remove('active'));
          t.classList.add('active');
          this.renderCodex(t.dataset.tab);
          NP.Audio.sfx('ui');
        };
      });
      // 设置开关
      const bind = (id, key) => {
        const el = $(id);
        el.checked = !!this.save.data.settings[key];
        el.onchange = () => {
          this.save.data.settings[key] = el.checked;
          NP.Save.write();
          if (key === 'audio') NP.Audio.setEnabled(el.checked);
          NP.Audio.sfx('ui');
        };
      };
      bind('#setAudio', 'audio');
      bind('#setAuto', 'auto');
      bind('#setShake', 'shake');
      bind('#setDmg', 'dmgNum');
    }

    syncSettings() {
      const s = this.save.data.settings;
      $('#setAudio').checked = s.audio;
      $('#setAuto').checked = s.auto;
      $('#setShake').checked = s.shake;
      $('#setDmg').checked = s.dmgNum;
      NP.Audio.setEnabled(s.audio);
    }

    bindKeys() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const c = e.code;
        if (c === 'Escape' || c === 'KeyP') {
          // 优先关闭弹出面板（升级选卡不可关闭）
          const modal = $$('.overlay.show').filter((el) => el.id !== 'cardOverlay').pop();
          if (modal) { this.close('#' + modal.id); NP.Audio.sfx('ui'); return; }
          if (this.state === 'play') this.togglePause(true);
          else if (this.state === 'paused') this.togglePause(false);
          return;
        }
        if (c === 'KeyM') {
          const s = this.save.data.settings;
          s.audio = !s.audio; NP.Save.write(); this.syncSettings();
          this.toast(s.audio ? '音频已开启' : '音频已关闭');
          return;
        }
        if (c === 'Enter') {
          if (this.state === 'menu' && !$$('.overlay.show').length) this.startRun(this.diff);
          else if (this.state === 'result' && !$$('.overlay.show').some((el) => el.id !== 'resultOverlay')) {
            this.close('#resultOverlay'); this.startRun(this.diff);
          }
          return;
        }
        if (this.state === 'cards') {
          const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(c);
          if (idx >= 0) { const el = $$('#cardList .card')[idx]; if (el) el.click(); }
        }
      });
    }

    /* ================= 主循环 ================= */
    loop(ts) {
      const dt = Math.min(0.05, (ts - this.last) / 1000) || 0.016;
      this.last = ts;
      if (this.state === 'play' || this.state === 'clearDelay') {
        this.acc += dt * this.timeScale;
        let guard = 0;
        while (this.acc >= 1 / 60 && guard++ < 6) {
          this.step(1 / 60);
          this.acc -= 1 / 60;
        }
        this.time += dt;
        this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4.5);
        this.updateHud(dt);
      } else if (this.state === 'cards' || this.state === 'paused') {
        NP.Input.consume();
      }
      if (this.dom.play.classList.contains('active')) this.render();
      requestAnimationFrame((t) => this.loop(t));
    }

    step(dt) {
      const p = this.player;
      if (!p) return;
      p.update(dt);
      this.updateMobs(dt);
      this.updateBoss(dt);
      this.updateBullets(dt);
      this.updateBeams(dt);
      this.updatePatches(dt);
      this.updateOrbs(dt);
      this.updateFx(dt);
      this.updateSpawner(dt);
      // BOSS 战时镜头在玩家与首领之间取景，保证首领始终在画面内
      if (this.boss) {
        const bx = p.x + (this.boss.x - p.x) * 0.5;
        const by = p.y + (this.boss.y - p.y) * 0.5;
        this.cam.follow(bx, by, dt, this.world.w, this.world.h);
      } else {
        this.cam.follow(p.x, p.y, dt, this.world.w, this.world.h);
      }
      this.runTime += dt;
      this.trySpawnBoss();
      if (this.state === 'clearDelay') {
        this.clearT -= dt;
        if (this.clearT <= 0) this.showResult(true);
      }
    }

    /* ================= 开始一局 ================= */
    startRun(diffId) {
      NP.Audio.resume();
      if (this.autotest) { /* 测试模式跳过音频 */ }
      this.diff = NP.clamp(diffId | 0, 0, 3);
      this.diffData = NP.DIFFS[this.diff];
      this.state = 'play';
      this.showScreen('play');
      NP.Audio.startMusic();
      NP.Audio.intensity = 0;

      NP.Input.consume();   // 清掉菜单里残留的按键
      // 让按钮失焦，否则空格/回车会再次触发「启动清剿」
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      this.player = new NP.Player(this);
      this.player.x = this.world.w / 2;
      this.player.y = this.world.h / 2;
      this.cam.x = this.player.x; this.cam.y = this.player.y;
      this.mobs = []; this.pBullets = []; this.mobBullets = []; this.orbs = [];
      this.particles = []; this.texts = []; this.rings = []; this.beams = [];
      this.fxBeams = []; this.firePatches = []; this.scorches = [];
      this.boss = null; this.clones = [];
      this.kills = 0; this.spawned = 0; this.spawnT = 0.4; this.bossPending = false;
      this.runDiamonds = 0; this.runTime = 0; this.clearT = 0;
      this.bossKilledAt = 0; this.bossIntroT = 0;
      this.timeScale = 1;
      this.lastPhase = 'mobs';
      this.autoplay = false;
      this.bossPending = false;
      this.hurtFlash = 0;
      this.save.data.runs++;
      this.buildDecor();

      // 清空界面状态
      ['#pauseOverlay', '#cardOverlay', '#resultOverlay'].forEach((id) => this.close(id));
      this.dom.bossBar.classList.remove('show');
      this.dom.bossBar.classList.add('hidden');
      if (this.dom.mission) this.dom.mission.classList.remove('hidden');
      this.dom.bossTags.innerHTML = '';
      this.dom.bossShield.hidden = true;
      this.dom.bossIntro.classList.add('hidden');
      this.dom.diffChip.textContent = `${this.diffData.name} ×${this.diffData.mult}`;
      this.dom.diffChip.style.color = this.diff === 3 ? '#ff2f7d' : '';
      this.dom.diffChip.style.borderColor = this.diff === 3 ? 'rgba(255,47,125,.5)' : '';
      this.toast(`${this.diffData.name}模式 // 清剿 ${TOTAL_MOBS} 具义体`);
      this.banner('清剿行动 · 开始');
      this.refreshHud();
      this.updateSkillHud(true);
      NP.Save.write();
    }

    toMenu() {
      this.state = 'menu';
      this.showScreen('menu');
      NP.Audio.intensity = 0;
      this.buildMenu();
      this.timeScale = 1;
    }

    /* ================= 刷怪 ================= */
    updateSpawner(dt) {
      if (this.spawned >= TOTAL_MOBS) return;
      this.spawnT -= dt;
      if (this.spawnT > 0) return;
      const alive = this.mobs.length;
      const maxAlive = 10 + Math.floor(this.kills / 18) * 2;
      if (alive >= Math.min(24, maxAlive)) { this.spawnT = 0.25; return; }
      const batch = Math.min(2, TOTAL_MOBS - this.spawned);
      for (let i = 0; i < batch; i++) this.spawnMob();
      this.spawnT = Math.max(0.22, 0.7 - this.kills * 0.0022);
    }

    spawnMob() {
      const p = this.player;
      const r = Math.random();
      let type;
      if (r < 0.44) type = 'assault';
      else if (r < 0.74) type = 'tank';
      else type = 'brute';
      let x = 0, y = 0, ok = false;
      for (let i = 0; i < 24 && !ok; i++) {
        const a = NP.rand(0, TAU);
        const d = NP.rand(680, 1150);
        x = NP.clamp(p.x + Math.cos(a) * d, 60, this.world.w - 60);
        y = NP.clamp(p.y + Math.sin(a) * d, 60, this.world.h - 60);
        if (NP.dist({ x, y }, p) > 560) ok = true;
      }
      this.mobs.push(new NP.Mob(this, type, x, y));
      this.spawned++;
      this.burst(x, y, 6, 'rgba(255,47,125,.7)', 120, { life: 0.4, size: 2.5 });
    }

    /* ================= 更新：敌人 ================= */
    updateMobs(dt) {
      const arr = this.mobs;
      for (let i = arr.length - 1; i >= 0; i--) {
        const m = arr[i];
        m.update(dt);
        if (!m.alive) arr.splice(i, 1);
      }
    }

    updateBoss(dt) {
      const b = this.boss;
      if (b) {
        b.update(dt);
        if (b.dead && this.boss === b) this.boss = null;
      }
      for (let i = this.clones.length - 1; i >= 0; i--) {
        const c = this.clones[i];
        c.update(dt);
        if (c.dead) this.clones.splice(i, 1);
      }
    }

    spawnClone(owner) {
      if (this.clones.length >= 1) return;
      const c = new NP.Boss(this, true);
      c.life = 15 + 0.2 * owner.elapsed;
      c.maxLife = c.life;
      c.x = NP.clamp(owner.x + NP.rand(-180, 180), c.r, this.world.w - c.r);
      c.y = NP.clamp(owner.y + NP.rand(-180, 180), c.r, this.world.h - c.r);
      this.clones.push(c);
      this.fxRing(c.x, c.y, 140, 'rgba(160,107,255,.9)', 0.8);
      this.toast(`残影分身 // 持续 ${c.life.toFixed(1)}s`);
      NP.Audio.sfx('shield');
    }

    removeClone(c) {
      const i = this.clones.indexOf(c);
      if (i >= 0) this.clones.splice(i, 1);
    }

    /* ================= 更新：子弹 ================= */
    updateBullets(dt) {
      const p = this.player;

      // 玩家子弹
      for (let i = this.pBullets.length - 1; i >= 0; i--) {
        const b = this.pBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        let dead = b.life <= 0;
        if (!dead) {
          // 敌人
          for (const m of this.mobs) {
            if (!m.alive || b.hit.has(m)) continue;
            if (NP.dist2(b, m) < (m.r + b.r) * (m.r + b.r)) {
              b.hit.add(m);
              this.damageMob(m, b.dmg, b.crit, false);
              this.hitSpark(b.x, b.y, b.color);
              if (b.pierce-- <= 0) { dead = true; break; }
            }
          }
        }
        if (!dead) {
          const targets = [this.boss, ...this.clones].filter((o) => o && o.alive);
          for (const o of targets) {
            if (b.hit.has(o)) continue;
            if (NP.dist2(b, o) < (o.r + b.r) * (o.r + b.r)) {
              b.hit.add(o);
              this.damageBoss(o, b.dmg, b.crit, false);
              this.hitSpark(b.x, b.y, b.color);
              if (b.pierce-- <= 0) { dead = true; break; }
            }
          }
        }
        if (dead || b.x < 0 || b.y < 0 || b.x > this.world.w || b.y > this.world.h) this.pBullets.splice(i, 1);
      }

      // 敌方子弹
      for (let i = this.mobBullets.length - 1; i >= 0; i--) {
        const b = this.mobBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        b.t = (b.t || 0) + dt;
        let dead = b.life <= 0;
        if (!dead && NP.dist2(b, p) < (b.r + p.r * 0.8) * (b.r + p.r * 0.8)) {
          p.takeDamage(b.dmg);
          this.hitSpark(b.x, b.y, b.color);
          dead = true;
        }
        if (dead || b.x < -100 || b.y < -100 || b.x > this.world.w + 100 || b.y > this.world.h + 100) {
          this.mobBullets.splice(i, 1);
        }
      }
    }

    spawnMobBullet(x, y, ang, speed, dmg, r, color) {
      this.mobBullets.push({
        x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        dmg, r: r || 8, color: color || '#ff2f7d', life: 5, t: 0
      });
    }

    /* ================= 更新：激光 / 火焰 ================= */
    updateBeams(dt) {
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.life -= dt;
        if (!b.applied) {
          b.applied = true;
          const targets = [...this.mobs, this.boss, ...this.clones].filter((o) => o && o.alive);
          for (const o of targets) {
            const d = this.pointSegDist(o.x, o.y, b.x1, b.y1, b.x2, b.y2);
            if (d < o.r + 18) {
              if (o === this.boss || this.clones.includes(o)) this.damageBoss(o, b.dmg, true, false);
              else this.damageMob(o, b.dmg, true, false);
            }
          }
        }
        if (b.life <= 0) this.beams.splice(i, 1);
      }
      for (let i = this.fxBeams.length - 1; i >= 0; i--) {
        this.fxBeams[i].life -= dt;
        if (this.fxBeams[i].life <= 0) this.fxBeams.splice(i, 1);
      }
    }

    pointSegDist(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.hypot(px - x1, py - y1);
      let t = ((px - x1) * dx + (py - y1) * dy) / l2;
      t = NP.clamp(t, 0, 1);
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    updatePatches(dt) {
      const p = this.player;
      for (let i = this.firePatches.length - 1; i >= 0; i--) {
        const f = this.firePatches[i];
        f.life -= dt;
        f.t += dt;
        if (f.life <= 0) { this.firePatches.splice(i, 1); continue; }
        if (f.t >= 0.5) {
          f.t = 0;
          if (NP.dist(f, p) < f.r + p.r * 0.6) p.takeDamage(f.dps * 0.5);
        }
        if (Math.random() < 0.5) {
          this.burst(f.x + NP.rand(-f.r, f.r), f.y + NP.rand(-f.r * 0.6, f.r * 0.6), 1,
            Math.random() < 0.5 ? 'rgba(255,140,50,.9)' : 'rgba(255,60,40,.85)', 60, { life: 0.5, size: 3 });
        }
      }
      for (let i = this.scorches.length - 1; i >= 0; i--) {
        this.scorches[i].life -= dt;
        if (this.scorches[i].life <= 0) this.scorches.splice(i, 1);
      }
    }

    updateOrbs(dt) {
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        if (!this.orbs[i].update(dt, this)) this.orbs.splice(i, 1);
      }
    }

    updateFx(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= (1 - p.drag * dt); p.vy *= (1 - p.drag * dt);
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        t.y -= t.vy * dt;
        if (t.life <= 0) this.texts.splice(i, 1);
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.life -= dt;
        if (r.life <= 0) this.rings.splice(i, 1);
      }
    }

    /* ================= 索敌 ================= */
    nearestTarget(x, y, range) {
      let best = null, bd = (range || 900) * (range || 900);
      for (const m of this.mobs) {
        if (!m.alive || m.spawnT > 0) continue;
        const dx = m.x - x, dy = m.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = m; }
      }
      const big = [this.boss, ...this.clones].filter((o) => o && o.alive);
      for (const o of big) {
        const dx = o.x - x, dy = o.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = o; }
      }
      return best;
    }

    /* ================= 伤害 ================= */
    damageMob(m, dmg, crit, silent) {
      if (!m.alive) return;
      const pen = this.player ? this.player.stats.armorPen : 0;
      const reduce = Math.min(0.6, m.def * (1 - pen) * 0.0002);
      const final = Math.max(1, dmg * (1 - reduce));
      m.hp -= final;
      m.hitFlash = 1;
      if (!silent && this.save.data.settings.dmgNum) {
        this.text(Math.round(final), m.x + NP.rand(-8, 8), m.y - m.r - 6,
          crit ? '#ffd76b' : '#dff6ff', crit ? 16 : 13);
      }
      if (this.player) this.player.onDamageDealt && this.player.onDamageDealt(final, crit);
      if (m.hp <= 0) this.killMob(m);
    }

    damageBoss(b, dmg, crit, silent) {
      if (!b || !b.alive) return;
      b.takeDamage(dmg, crit, silent);
    }

    killMob(m) {
      if (m.dead) return;
      m.dead = true;
      m.hp = 0;
      const p = this.player;
      this.kills++;
      this.save.data.kills++;

      // 经验
      p.gainXp(10);
      // 钻石 3~8
      const dia = NP.randi(3, 8);
      this.runDiamonds += dia;
      this.save.data.diamonds += dia;

      // 掉落医疗包
      if (NP.chance(0.07)) this.orbs.push(new NP.Orb(m.x, m.y, 'heal'));

      // 击杀回复
      if (p.stats.killHeal > 0) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * p.stats.killHeal);

      // 特效
      const col = NP.MOB_DEF[m.type].color;
      this.burst(m.x, m.y, m.type === 'brute' ? 26 : 14, col, m.type === 'brute' ? 320 : 220, { life: 0.7, size: m.type === 'brute' ? 5 : 3.5 });
      this.burst(m.x, m.y, 8, 'rgba(255,255,255,.9)', 380, { life: 0.28, size: 2 });
      this.fxRing(m.x, m.y, m.r * 2, col, 0.45);
      this.scorches.push({ x: m.x, y: m.y, r: m.r * 1.5, life: 9, max: 9 });
      if (this.scorches.length > 26) this.scorches.shift();

      // 肉山自爆
      if (m.type === 'brute') {
        this.fxRing(m.x, m.y, 150, 'rgba(176,107,255,.9)', 0.6);
        this.shake(9);
        NP.Audio.sfx('bigKill');
        if (NP.dist(m, p) < 150 + p.r) p.takeDamage(m.atk * 0.8);
      } else {
        NP.Audio.sfx('kill');
      }

      this.refreshHud();

      // 全部清剿 → 首领
      // 注意：第 200 杀必定同时升级（10 经验/杀 × 200 = 20 级），
      // 升级会弹出选卡界面把 state 切成 'cards'，所以这里只做标记，
      // 真正的生成交给 trySpawnBoss()，在回到 play 后补上。
      if (this.kills >= TOTAL_MOBS) {
        this.bossPending = true;
        this.trySpawnBoss();
      }
    }

    /* 200 只清完后，若被升级选卡挡住，回到 play 时补生成首领 */
    trySpawnBoss() {
      if (!this.bossPending) return;
      if (this.boss || this.state !== 'play') return;
      this.bossPending = false;
      this.spawnBoss();
    }

    spawnBoss() {
      this.bossPending = false;
      this.lastPhase = 'boss';
      NP.Audio.intensity = 1;
      this.boss = new NP.Boss(this, false);
      this.boss.x = this.world.w / 2;
      this.boss.y = NP.clamp(this.player.y - 260, 160, this.world.h - 320);
      this.dom.bossBar.classList.remove('hidden');
      this.dom.bossBar.classList.add('show');
      if (this.dom.mission) this.dom.mission.classList.add('hidden');
      this.dom.bossSub.textContent = `${this.diffData.name} · 属性 ×${this.diffData.mult}`;
      this.dom.bossTags.innerHTML = `<span class="btag">狂暴阈值 25%</span>` +
        (this.diff === 3 ? `<span class="btag">技能频率 ×2</span>` : '');
      NP.Audio.sfx('bossSpawn');
      this.banner('LJM-12138 苏醒');
      this.dom.bossIntro.classList.remove('hidden');
      clearTimeout(this._introTimer);
      this._introTimer = setTimeout(() => this.dom.bossIntro.classList.add('hidden'), 2700);
      this.shake(14);
      this.fxRing(this.boss.x, this.boss.y, 320, 'rgba(255,47,125,.9)', 1);
      this.refreshHud();
    }

    onBossEnrage(b) {
      NP.Audio.sfx('rage');
      this.banner('狂暴 // ENRAGED');
      this.shake(16);
      this.fxRing(b.x, b.y, 260, 'rgba(255,47,125,.95)', 0.8);
      this.toast('首领进入狂暴：技能频率 +25%，即将释放「狂暴震荡」');
      this.dom.bossTags.innerHTML += `<span class="btag rage">狂暴</span>`;
      this.refreshHud();
    }

    bossBlast(b, dmg) {
      const p = this.player;
      p.takeDamage(dmg);
      this.fxRing(p.x, p.y, 620, 'rgba(255,47,125,.9)', 0.9, 0.7);
      this.shake(20);
      NP.Audio.sfx('bigKill');
    }

    onBossDead(b) {
      if (b.isClone) { this.removeClone(b); return; }
      this.boss = null;
      this.state = 'clearDelay';
      this.clearT = 1.5;
      NP.Audio.intensity = 0;
      NP.Audio.sfx('bossDie');
      NP.Audio.sfx('win');
      this.banner('目标已清除');
      this.shake(22);
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          this.burst(b.x + NP.rand(-90, 90), b.y + NP.rand(-70, 70), 26, i % 2 ? 'rgba(255,188,74,.9)' : 'rgba(255,47,125,.9)', 300, { life: 1, size: 5 });
          this.fxRing(b.x + NP.rand(-60, 60), b.y + NP.rand(-60, 60), 180, 'rgba(255,255,255,.8)', 0.7);
        }, i * 120);
      }
      this.dom.bossBar.classList.remove('show');
      this.timeScale = 0.6;

      // 记录通关
      const d = this.diff;
      this.save.data.cleared[d] = true;
      if (!this.save.data.best[d] || this.runTime < this.save.data.best[d]) this.save.data.best[d] = this.runTime;
      this.save.data.bossKills++;
      NP.Save.write();
    }

    onPlayerDeath() {
      if (this.state !== 'play') return;
      // 首领已被击破时不判定失败
      if (this.state === 'clearDelay') return;
      this.state = 'dead';
      NP.Audio.intensity = 0;
      NP.Audio.sfx('lose');
      this.shake(24);
      this.burst(this.player.x, this.player.y, 40, 'rgba(255,47,125,.9)', 340, { life: 1.1, size: 4 });
      this.fxRing(this.player.x, this.player.y, 300, 'rgba(255,47,125,.9)', 1);
      this.save.data.deaths++;
      NP.Save.write();
      setTimeout(() => this.showResult(false), 900);
    }

    onLevelUp() {
      NP.Audio.sfx('levelup');
      this.fxRing(this.player.x, this.player.y, 90, 'rgba(63,230,255,.9)', 0.6);
      this.toast(`等级提升 // LV.${String(this.player.level).padStart(2, '0')}`);
      this.refreshHud();
      if (this.state === 'play' && this.player.pendingCards > 0 && !$('#cardOverlay').classList.contains('show')) {
        this.openCards();
      }
    }

    collectOrb(o) {
      if (o.kind === 'heal') {
        const heal = Math.round(this.player.maxHp * 0.08);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.healText(o.x, o.y, heal);
        NP.Audio.sfx('pickup');
      }
    }

    /* ================= 卡片选择 ================= */
    openCards() {
      if (this.player.pendingCards <= 0) return;
      this.state = 'cards';
      NP.Input.consume();
      const cards = NP.drawCards(this.player.stacks, 3);
      if (!cards.length) {          // 卡池已满则直接放弃本次选卡，避免卡在选卡界面
        this.player.pendingCards = Math.max(0, this.player.pendingCards - 1);
        this.state = 'play';
        this.trySpawnBoss();
        return;
      }
      this.cardChoices = cards;
      this.dom.cardLevel.textContent = `LV.${String(this.player.level).padStart(2, '0')}`;
      const list = this.dom.cardList;
      list.innerHTML = '';
      cards.forEach((c, i) => {
        const el = document.createElement('button');
        el.className = 'card ' + c.rarity;
        const cur = this.player.stacks[c.id] || 0;
        el.innerHTML = `
          <span class="c-key">${i + 1}</span>
          <div class="c-icon">${c.icon}</div>
          <div class="c-name">${c.name}</div>
          <div class="c-desc">${c.desc}</div>
          <div class="c-stack"><span>${c.en}</span><span>${cur} / ${c.max}</span></div>`;
        el.onclick = () => this.applyCard(c);
        list.appendChild(el);
      });
      this.open('#cardOverlay');
    }

    /* 应用一张协议卡（DOM 点击与自动流程共用） */
    applyCard(card) {
      const p = this.player;
      if (!card || !p) return;
      NP.Audio.sfx('card');
      p.addCard(card);
      p.pendingCards = Math.max(0, p.pendingCards - 1);
      this.fxRing(p.x, p.y, 120, 'rgba(63,230,255,.8)', 0.5);
      this.close('#cardOverlay');
      if (p.pendingCards > 0) setTimeout(() => this.openCards(), 120);
      else {
        this.state = 'play';
        this.refreshHud();
        this.trySpawnBoss();
      }
    }

    /* ================= 暂停 ================= */
    togglePause(on) {
      if (on === undefined) on = this.state === 'play';
      if (on) {
        if (this.state !== 'play') return;
        this.state = 'paused';
        this.renderPauseStats();
        this.open('#pauseOverlay');
        NP.Audio.sfx('ui');
      } else {
        if (this.state !== 'paused') return;
        this.state = 'play';
        this.close('#pauseOverlay');
        NP.Input.consume();
        NP.Audio.sfx('ui');
      }
    }

    renderPauseStats() {
      const p = this.player, s = p.stats;
      const rows = [
        ['等级', 'LV.' + String(p.level).padStart(2, '0')],
        ['攻击力', NP.fmt(s.atk)],
        ['生命', `${NP.fmt(p.hp)} / ${NP.fmt(p.maxHp)}`],
        ['防御力', s.def.toFixed(1)],
        ['减伤', (s.takenMul * 100).toFixed(1) + '%'],
        ['暴击率', (s.crit * 100).toFixed(0) + '%'],
        ['攻速', s.fireRate.toFixed(2) + '/s'],
        ['冷却缩减', (s.cdr * 100).toFixed(0) + '%'],
        ['清剿', `${this.kills} / ${TOTAL_MOBS}`],
        ['钻石', this.runDiamonds]
      ];
      this.dom.pauseStats.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    }

    /* ================= 结算 ================= */
    showResult(win) {
      if ($('#resultOverlay').classList.contains('show')) return;
      this.state = 'result';
      this.timeScale = 1;
      const p = this.player;
      const d = this.diffData;
      const hpRatio = p ? p.hp / p.maxHp : 0;
      this.dom.resBadge.textContent = win ? '行动完成' : '行动失败';
      this.dom.resBadge.classList.toggle('fail', !win);
      if (win) {
        this.dom.resultTitle.textContent = '区域清剿完成';
        const rank = this.calcRank(hpRatio);
        this.dom.resultSub.innerHTML =
          `「${d.name}」难度下击破 <b style="color:#ff9ec2">LJM-12138</b> · 评价 <b style="color:#ffd76b;font-size:1.2em">${rank}</b>` +
          (d.id === 3 ? ' · 噩梦已完成' : '') +
          (this.unlockCheck() ? '<br><span style="color:#b6ff4a">噩梦难度已解锁</span>' : '');
      } else {
        this.dom.resultTitle.textContent = '义体离线';
        this.dom.resultSub.textContent =
          this.lastPhase === 'boss'
            ? `在「${d.name}」难度下被 LJM-12138 击毁 · 造成的挑战失败`
            : `在「${d.name}」难度下被义体群淹没 · 击杀 ${this.kills} / ${TOTAL_MOBS}`;
      }
      const stats = [
        [NP.mmss(this.runTime), '用时'],
        [this.kills + (this.boss ? 0 : 0), '击杀'],
        [this.runDiamonds, '获得钻石'],
        [Math.round(hpRatio * 100) + '%', '剩余生命']
      ];
      this.dom.resultStats.innerHTML = stats.map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
      this.open('#resultOverlay');
      this.win = win;
      NP.Save.write();
    }

    calcRank(hpRatio) {
      const t = this.runTime;
      const limit = [
        { S: 210, A: 330, B: 460 },
        { S: 260, A: 380, B: 520 },
        { S: 330, A: 470, B: 640 },
        { S: 420, A: 600, B: 820 }
      ][this.diff];
      if (t <= limit.S && hpRatio > 0.35) return 'S';
      if (t <= limit.A) return 'A';
      if (t <= limit.B) return 'B';
      return 'C';
    }

    unlockCheck() {
      return this.save.data.cleared[0] && this.save.data.cleared[1] && this.save.data.cleared[2];
    }

    copyShare() {
      const d = this.diffData;
      const txt = this.win
        ? `【霓虹协议】我在「${d.name}」难度下，用 ${NP.mmss(this.runTime)} 击破了 LJM-12138（剩余生命 ${Math.round(this.player.hp / this.player.maxHp * 100)}%）。来挑战我！`
        : `【霓虹协议】我在「${d.name}」难度下击杀 ${this.kills}/${TOTAL_MOBS} 具义体后倒下。来挑战我！`;
      try {
        navigator.clipboard.writeText(txt);
        this.toast('战报已复制到剪贴板');
      } catch (e) {
        this.toast('复制失败，请手动截图');
      }
      NP.Audio.sfx('buy');
    }

    /* ================= HUD ================= */
    refreshHud() {
      if (!this.player) return;
      const p = this.player, s = p.stats;
      this.dom.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      this.dom.hpFill.style.width = NP.clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
      this.dom.xpText.textContent = `${p.xp % NP.XP_PER_LEVEL} / ${NP.XP_PER_LEVEL} XP`;
      this.dom.xpFill.style.width = ((p.xp % NP.XP_PER_LEVEL) / NP.XP_PER_LEVEL * 100) + '%';
      this.dom.lvText.textContent = 'LV.' + String(p.level).padStart(2, '0');
      this.dom.atkText.textContent = NP.fmt(s.atk);
      this.dom.defText.textContent = s.def.toFixed(0);
      this.dom.critText.textContent = (s.crit * 100).toFixed(0) + '%';
      this.dom.killCount.textContent = this.kills;
      this.dom.killFill.style.width = (this.kills / TOTAL_MOBS * 100) + '%';
      this.dom.diamondCount.textContent = NP.fmt(this.save.data.diamonds);
    }

    updateHud(dt) {
      const p = this.player;
      if (!p) return;
      const s = p.stats;
      const set = (el, txt) => { if (el.textContent !== txt) el.textContent = txt; };
      set(this.dom.hpText, `${Math.ceil(p.hp)} / ${p.maxHp}`);
      this.dom.hpFill.style.width = NP.clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
      set(this.dom.xpText, `${p.xp % NP.XP_PER_LEVEL} / ${NP.XP_PER_LEVEL} XP`);
      this.dom.xpFill.style.width = ((p.xp % NP.XP_PER_LEVEL) / NP.XP_PER_LEVEL * 100) + '%';
      set(this.dom.lvText, 'LV.' + String(p.level).padStart(2, '0'));
      set(this.dom.atkText, NP.fmt(s.atk));
      set(this.dom.defText, s.def.toFixed(0));
      set(this.dom.critText, (s.crit * 100).toFixed(0) + '%');
      set(this.dom.killCount, String(this.kills));
      this.dom.killFill.style.width = (this.kills / TOTAL_MOBS * 100) + '%';
      set(this.dom.timer, NP.mmss(this.runTime));
      set(this.dom.diamondCount, NP.fmt(this.save.data.diamonds));

      // 技能冷却
      this.updateSkillHud();

      // BOSS 血条
      if (this.boss) {
        const b = this.boss;
        this.dom.bossHpFill.style.width = NP.clamp(b.hp / b.maxHp * 100, 0, 100) + '%';
        set(this.dom.bossHpText, `${NP.fmt(Math.ceil(b.hp))} / ${NP.fmt(b.maxHp)}  ·  ${(b.hp / b.maxHp * 100).toFixed(1)}%`);
        this.dom.bossShield.hidden = b.shield <= 0;
        if (b.shield > 0) {
          this.dom.bossShield.style.width = (b.shield / (b.shieldMax || 20) * 100) + '%';
        }
      }
      if (this.dom.bossBar.classList.contains('show') && !this.boss) {
        this.dom.bossBar.classList.remove('show');
        this.dom.bossBar.classList.add('hidden');
      }
    }

    updateSkillHud() {
      const p = this.player;
      if (!p) return;
      for (const k of ['dash', 'q', 'e', 'r']) {
        const cd = p.cd[k];
        const max = k === 'q' ? 15 * (1 - p.stats.cdr)
          : k === 'e' ? 15 * (1 - p.stats.cdr)
            : k === 'r' ? 8 * (1 - p.stats.cdr)
              : this.skillMax.dash;
        const el = this.dom.skillCd[k];
        const ratio = NP.clamp(cd / Math.max(0.01, max), 0, 1);
        el.style.height = (ratio * 100) + '%';
        const txt = cd > 0.05 ? (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) : '';
        if (el.textContent !== txt) el.textContent = txt;
        const skillEl = this.dom.skillEls[k];
        if (skillEl) skillEl.classList.toggle('active', k === 'q' && p.over > 0);
      }
    }

    /* ================= 特效 ================= */
    shake(a) {
      if (this.save.data.settings.shake) this.cam.shake = Math.min(30, this.cam.shake + a);
    }
    burst(x, y, n, color, speed, opt) {
      opt = opt || {};
      if (this.particles.length > 900) return;
      for (let i = 0; i < n; i++) {
        const a = NP.rand(0, TAU);
        const sp = NP.rand(speed * 0.25, speed);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: NP.rand(opt.life * 0.5, opt.life),
          max: opt.life,
          color, size: NP.rand(opt.size * 0.6, opt.size),
          drag: opt.drag === undefined ? 3.2 : opt.drag,
          glow: opt.glow !== false
        });
      }
    }
    hitSpark(x, y, color) {
      this.burst(x, y, 4, color || '#cfefff', 240, { life: 0.22, size: 2.4 });
    }
    fxRing(x, y, r, color, life, width) {
      this.rings.push({ x, y, r, color, life, max: life, width: width || 3 });
    }
    text(str, x, y, color, size) {
      if (this.texts.length > 90) this.texts.shift();
      this.texts.push({ str: String(str), x, y, color, size: size || 13, life: 0.85, max: 0.85, vy: 46 });
    }
    healText(x, y, n) { this.text('+' + NP.fmt(n), x, y - 30, '#b6ff4a', 17); }
    beamFx(x1, y1, x2, y2, color, life) {
      this.fxBeams.push({ x1, y1, x2, y2, color, life, max: life });
    }
    banner(txt) {
      const el = this.dom.banner;
      el.textContent = txt;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(() => el.classList.remove('show'), 2400);
    }
    toast(txt) {
      const el = this.dom.toast;
      const d = document.createElement('div');
      d.textContent = txt;
      el.appendChild(d);
      setTimeout(() => d.remove(), 2600);
      if (el.children.length > 3) el.firstChild.remove();
    }
  }

  /* =====================================================================
     渲染
     ===================================================================== */
  Game.prototype.buildDecor = function () {
    this.decor = [];
    const w = this.world.w, h = this.world.h;
    for (let i = 0; i < 34; i++) {
      this.decor.push({
        type: 'puddle',
        x: NP.rand(80, w - 80), y: NP.rand(80, h - 80),
        r: NP.rand(50, 150), sq: NP.rand(0.3, 0.6), rot: NP.rand(0, TAU)
      });
    }
    for (let i = 0; i < 26; i++) {
      this.decor.push({
        type: NP.chance(0.5) ? 'pillar' : 'crate',
        x: NP.rand(60, w - 60), y: NP.rand(60, h - 60),
        w: NP.rand(40, 90), h: NP.rand(40, 90),
        rot: NP.rand(-0.2, 0.2), hue: NP.pick(['cyan', 'mag', 'vio'])
      });
    }
    for (let i = 0; i < 18; i++) {
      this.decor.push({
        type: 'circuit',
        x: NP.rand(60, w - 60), y: NP.rand(60, h - 60),
        len: NP.rand(120, 320), dir: NP.randi(0, 3) * Math.PI / 2, seed: Math.random()
      });
    }
    for (let i = 0; i < 16; i++) {
      this.decor.push({
        type: 'sign',
        x: NP.rand(80, w - 80), y: NP.rand(80, h - 80),
        w: NP.rand(26, 46), h: NP.rand(70, 130), hue: NP.pick(['mag', 'cyan', 'amber'])
      });
    }
    for (let i = 0; i < 8; i++) {
      this.decor.push({
        type: 'ring', x: NP.rand(220, w - 220), y: NP.rand(220, h - 220),
        r: NP.rand(150, 330), rot: NP.rand(0, TAU)
      });
    }
    for (let i = 0; i < 7; i++) {
      this.decor.push({
        type: 'hazard', x: NP.rand(140, w - 420), y: NP.rand(140, h - 160),
        w: NP.rand(200, 420), h: NP.rand(18, 30), rot: NP.chance(0.5) ? 0 : Math.PI / 2
      });
    }
    for (let i = 0; i < 5; i++) {
      this.decor.push({
        type: 'mark', x: NP.rand(240, w - 240), y: NP.rand(240, h - 240),
        r: NP.rand(70, 120), text: NP.pick(['07', 'LJM', 'N//P', '西-07']), rot: NP.rand(-0.3, 0.3)
      });
    }
    // 环境浮尘
    this.ambient = [];
    for (let i = 0; i < 70; i++) {
      this.ambient.push({
        x: NP.rand(0, w), y: NP.rand(0, h),
        z: NP.rand(0.3, 1), sp: NP.rand(6, 22), ph: NP.rand(0, TAU)
      });
    }
  };

  Game.prototype.drawBackdrop = function (ctx) {
    const w = this.cam.w, h = this.cam.h;
    const t = this.time;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070b15');
    g.addColorStop(0.55, '#0b1120');
    g.addColorStop(1, '#060a13');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 远处光晕随相机视差
    const px = this.player ? this.player.x : this.world.w / 2;
    const py = this.player ? this.player.y : this.world.h / 2;
    const ox = -(px / this.world.w - 0.5) * 60;
    const oy = -(py / this.world.h - 0.5) * 40;
    const rg = ctx.createRadialGradient(w * 0.5 + ox, h * 0.42 + oy, 40, w * 0.5 + ox, h * 0.42 + oy, Math.max(w, h) * 0.7);
    rg.addColorStop(0, 'rgba(63,230,255,.15)');
    rg.addColorStop(0.4, 'rgba(120,60,200,.05)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // 扫描光带
    const sx = ((t * 40) % (h + 300)) - 150;
    const lg = ctx.createLinearGradient(0, sx, 0, sx + 140);
    lg.addColorStop(0, 'rgba(63,230,255,0)');
    lg.addColorStop(0.5, 'rgba(63,230,255,.035)');
    lg.addColorStop(1, 'rgba(63,230,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, sx, w, 140);
  };

  Game.prototype.drawFloor = function (ctx) {
    const { w, h } = this.world;
    const vw = this.cam.w / this.cam.zoom, vh = this.cam.h / this.cam.zoom;
    const x0 = this.cam.x - vw / 2, y0 = this.cam.y - vh / 2;
    const x1 = x0 + vw, y1 = y0 + vh;

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);

    // 大区块
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const bx = (i * 431 + 120) % (w - 500);
      const by = (i * 277 + 90) % (h - 420);
      ctx.fillStyle = i % 2 ? 'rgba(22,32,54,.6)' : 'rgba(16,24,42,.75)';
      ctx.fillRect(bx, by, 320 + (i % 3) * 90, 240 + (i % 2) * 110);
    }
    ctx.restore();

    // 网格
    const step = 90;
    ctx.strokeStyle = 'rgba(63,230,255,.085)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gx0 = Math.floor(x0 / step) * step;
    const gy0 = Math.floor(y0 / step) * step;
    for (let x = gx0; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = gy0; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();

    // 装饰
    for (const d of this.decor) {
      if (d.x < x0 - 200 || d.x > x1 + 200 || d.y < y0 - 200 || d.y > y1 + 200) continue;
      this.drawDecor(ctx, d);
    }

    // 场景边缘
    ctx.strokeStyle = 'rgba(255,47,125,.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.strokeStyle = 'rgba(63,230,255,.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, w - 24, h - 24);

    // 焦痕
    for (const s of this.scorches) {
      const a = s.life / s.max;
      ctx.save();
      ctx.globalAlpha = a * 0.5;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, 'rgba(30,10,20,.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 0.7, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // 火焰路径
    for (const f of this.firePatches) {
      const a = NP.clamp(f.life / 3, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, `rgba(255,200,90,${0.5 * a})`);
      g.addColorStop(0.5, `rgba(255,80,40,${0.3 * a})`);
      g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // 浮尘
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of this.ambient) {
      const ax = (a.x + this.time * a.sp * 0.3) % w;
      const ay = (a.y + Math.sin(this.time * 0.6 + a.ph) * 20 + h) % h;
      ctx.fillStyle = `rgba(120,220,255,${0.05 + a.z * 0.09})`;
      ctx.fillRect(ax, ay, 2 * a.z, 2 * a.z);
    }
    ctx.restore();
  };

  Game.prototype.drawDecor = function (ctx, d) {
    const hue = d.hue === 'mag' ? '255,47,125' : d.hue === 'amber' ? '255,188,74' : d.hue === 'vio' ? '160,107,255' : '63,230,255';
    if (d.type === 'puddle') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, d.r);
      g.addColorStop(0, 'rgba(30,120,160,.14)');
      g.addColorStop(0.7, 'rgba(20,70,110,.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * d.sq, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(63,230,255,.10)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, d.r * 0.8, d.r * d.sq * 0.8, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (d.type === 'pillar') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      const g = ctx.createLinearGradient(-d.w / 2, 0, d.w / 2, 0);
      g.addColorStop(0, 'rgba(8,12,20,.9)');
      g.addColorStop(0.5, 'rgba(20,30,48,.95)');
      g.addColorStop(1, 'rgba(6,10,18,.9)');
      ctx.fillStyle = g;
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.strokeStyle = `rgba(${hue},.28)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.strokeStyle = `rgba(${hue},.12)`;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-d.w / 2 + 4, -d.h / 2 + (d.h / 4) * i);
        ctx.lineTo(d.w / 2 - 4, -d.h / 2 + (d.h / 4) * i);
        ctx.stroke();
      }
      ctx.restore();
    } else if (d.type === 'crate') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.fillStyle = 'rgba(14,20,34,.95)';
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.strokeStyle = `rgba(${hue},.35)`;
      ctx.lineWidth = 2;
      ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.beginPath();
      ctx.moveTo(-d.w / 2, -d.h / 2); ctx.lineTo(d.w / 2, d.h / 2);
      ctx.moveTo(d.w / 2, -d.h / 2); ctx.lineTo(-d.w / 2, d.h / 2);
      ctx.strokeStyle = `rgba(${hue},.14)`;
      ctx.stroke();
      ctx.restore();
    } else if (d.type === 'circuit') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.dir);
      ctx.strokeStyle = 'rgba(63,230,255,.13)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      let x = 0, y = 0;
      for (let i = 0; i < 5; i++) {
        x += d.len / 5;
        y += (i % 2 ? 1 : -1) * (10 + (d.seed * 7 + i) % 22);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(63,230,255,.28)';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (d.type === 'ring') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.strokeStyle = 'rgba(63,230,255,.13)';
      ctx.lineWidth = 2;
      ctx.setLineDash([26, 18]);
      ctx.beginPath(); ctx.arc(0, 0, d.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([4, 10]);
      ctx.strokeStyle = 'rgba(255,47,125,.10)';
      ctx.beginPath(); ctx.arc(0, 0, d.r * 0.72, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(63,230,255,.16)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * d.r * 0.9, Math.sin(a) * d.r * 0.9);
        ctx.lineTo(Math.cos(a) * d.r, Math.sin(a) * d.r);
        ctx.stroke();
      }
      ctx.restore();
    } else if (d.type === 'hazard') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.beginPath();
      ctx.rect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,188,74,.05)';
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.strokeStyle = 'rgba(255,188,74,.13)';
      ctx.lineWidth = 7;
      for (let x = -d.w / 2 - 40; x < d.w / 2 + 40; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, -d.h / 2);
        ctx.lineTo(x + d.h, d.h / 2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (d.type === 'mark') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.strokeStyle = 'rgba(120,180,220,.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, d.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(120,180,220,.075)';
      ctx.font = `700 ${Math.round(d.r * 0.9)}px "Bahnschrift", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text, 0, 2);
      ctx.restore();
    } else if (d.type === 'sign') {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(6,10,18,.9)';
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.strokeStyle = `rgba(${hue},.5)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.fillStyle = `rgba(${hue},.22)`;
      for (let i = 0; i < 5; i++) {
        const hh = 4 + ((i * 37 + d.w) % 10);
        ctx.fillRect(-d.w / 2 + 5, -d.h / 2 + 8 + i * (d.h / 6), d.w - 10, hh);
      }
      NP.Art.drawGlow(ctx, 0, 0, d.h * 0.9, `rgba(${hue},.28)`, 0.35);
      ctx.restore();
    }
  };

  Game.prototype.render = function () {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackdrop(ctx);
    if (!this.player) return;

    ctx.save();
    this.cam.apply(ctx);
    this.drawFloor(ctx);

    // 掉落
    for (const o of this.orbs) o.draw(ctx, this.time);

    // 敌人
    for (const m of this.mobs) m.draw(ctx, this.time);

    // 首领与分身
    if (this.boss) this.boss.draw(ctx, this.time);
    for (const c of this.clones) c.draw(ctx, this.time);

    // 玩家
    this.player.draw(ctx, this.time);

    // 子弹
    this.drawBullets(ctx);

    // 激光
    this.drawBeams(ctx);

    // 粒子
    this.drawParticles(ctx);

    // 浮动文字
    for (const t of this.texts) {
      const a = NP.clamp(t.life / t.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `600 ${t.size}px "Bahnschrift", "Consolas", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }

    ctx.restore();

    // 屏幕效果
    this.drawScreenFx(ctx);
  };

  Game.prototype.drawBullets = function (ctx) {
    const L = 26; // 视觉抬升：让子弹从角色胸口飞出，逻辑仍在地面平面判定
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.pBullets) {
      NP.Art.drawGlow(ctx, b.x, b.y - L, b.r * 4.5, b.color, 0.55);
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.ellipse(b.x, b.y - L, b.r * 1.9, b.r, Math.atan2(b.vy, b.vx), 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x, b.y - L, b.r * 0.7, 0, TAU); ctx.fill();
    }
    for (const b of this.mobBullets) {
      NP.Art.drawGlow(ctx, b.x, b.y - L, b.r * 4, b.color, 0.6);
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y - L, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(b.x, b.y - L, b.r * 0.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };

  Game.prototype.drawBeams = function (ctx) {
    ctx.save();
    ctx.translate(0, -26);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      const k = b.life / b.max;
      const wdt = 26 * k + 6;
      const g = ctx.createLinearGradient(b.x1, b.y1, b.x2, b.y2);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
      g.addColorStop(0.3, `rgba(63,230,255,${0.8 * k})`);
      g.addColorStop(1, `rgba(160,107,255,0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = wdt;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`;
      ctx.lineWidth = Math.max(1, wdt * 0.25);
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    for (const b of this.fxBeams) {
      const k = b.life / b.max;
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = k;
      ctx.lineWidth = 14 * k + 2;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  Game.prototype.drawParticles = function (ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = NP.clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.glow) NP.Art.drawGlow(ctx, p.x, p.y, p.size * 3, p.color, a * 0.5);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.lineWidth = r.width * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * k + 6, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  Game.prototype.drawScreenFx = function (ctx) {
    const w = this.cam.w, h = this.cam.h;
    if (this.hurtFlash > 0.01) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.65);
      g.addColorStop(0, 'rgba(255,0,50,0)');
      g.addColorStop(1, `rgba(255,0,50,${0.26 * this.hurtFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // 过载时屏幕边缘洋红光
    if (this.player && this.player.over > 0) {
      const k = Math.min(1, this.player.over);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62);
      g.addColorStop(0, 'rgba(255,47,125,0)');
      g.addColorStop(1, `rgba(255,47,125,${0.16 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  };

  /* =====================================================================
     菜单 / 商店 / 档案 / 设置
     ===================================================================== */
  Game.prototype.buildMenu = function () {
    const save = this.save.data;
    const unlocked = save.cleared[0] && save.cleared[1] && save.cleared[2];

    // 难度
    this.dom.diffList.innerHTML = '';
    NP.DIFFS.forEach((d, i) => {
      const locked = d.id === 3 && !unlocked;
      const el = document.createElement('button');
      el.className = 'diff' + (i === this.diff ? ' sel' : '') + (d.id === 3 ? ' nightmare' : '') + (locked ? ' locked' : '');
      el.innerHTML = `
        <div class="diff-name">${d.name}<span class="en">${d.en}</span>${locked ? '<span class="lock">未解锁</span>' : ''}</div>
        <div class="diff-desc">${locked ? '通关简单 / 普通 / 困难后开放' : d.desc}</div>
        <div class="diff-mult">×${d.mult}<small>首领属性${d.id === 3 ? ' · 技能×2' : ''}</small></div>`;
      if (!locked) {
        el.onclick = () => {
          this.diff = i;
          NP.Audio.sfx('ui');
          this.buildMenu();
        };
      }
      this.dom.diffList.appendChild(el);
    });

    // 通关记录
    const names = ['简单', '普通', '困难', '噩梦'];
    this.dom.clearTracks.innerHTML = names.map((n, i) => {
      const done = save.cleared[i];
      const best = save.best[i] ? NP.mmss(save.best[i]) : (i === 3 ? '--:--' : '--:--');
      return `<div class="ct ${done ? 'done' : ''}"><b>${n}</b><span>${done ? best : '未通关'}</span></div>`;
    }).join('');
    this.dom.clearHint.textContent = unlocked
      ? '噩梦难度已解锁：首领属性 ×15，技能频率翻倍'
      : `通关简单 / 普通 / 困难后解锁噩梦 · 已通关 ${save.cleared.filter(Boolean).length} / 3`;

    // 钻石
    this.dom.menuDia.textContent = NP.fmt(save.diamonds);
    this.dom.shopDia.textContent = NP.fmt(save.diamonds);

    // 角色属性
    const st = NP.computeStats(1, NP.newMods(), save.up);
    this.dom.heroStats.innerHTML = [
      ['生命', st.maxHp], ['攻击力', st.atk], ['防御力', st.def.toFixed(1)], ['暴击', (st.crit * 100).toFixed(0) + '%']
    ].map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
  };

  Game.prototype.drawPortrait = function () {
    const cv = this.dom.portrait;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(cv.width / 2, cv.height - 12);
    NP.Art.drawHero(ctx, { x: 0, y: 0, scale: 1.05, aim: -0.5, facing: 1, t: 0.4, walk: 0 });
    ctx.restore();
  };

  Game.prototype.startMenuLoop = function () {
    const cv = this.dom.heroCanvas;
    const ctx = cv.getContext('2d');
    let last = performance.now();
    const tick = (now) => {
      const t = now / 1000;
      if (this.dom.menu.classList.contains('active')) {
        ctx.clearRect(0, 0, cv.width, cv.height);
        // 背景网格
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(63,230,255,.09)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath(); ctx.moveTo(0, 40 + i * 32); ctx.lineTo(cv.width, 40 + i * 32); ctx.stroke();
        }
        ctx.restore();
        // 地面光
        const g = ctx.createRadialGradient(cv.width / 2, cv.height - 30, 10, cv.width / 2, cv.height - 30, 120);
        g.addColorStop(0, 'rgba(63,230,255,.22)');
        g.addColorStop(1, 'rgba(63,230,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(cv.width / 2, cv.height - 36, 110, 26, 0, 0, TAU); ctx.fill();
        ctx.save();
        ctx.translate(cv.width / 2, cv.height - 18);
        NP.Art.drawHero(ctx, {
          x: 0, y: 0, scale: 3.0, aim: Math.sin(t * 0.6) * 0.35 - 0.15,
          facing: Math.cos(t * 0.9) > -0.2 ? 1 : -1, t, walk: 0, over: 0
        });
        ctx.restore();
      }
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  Game.prototype.openShop = function () {
    this.buildShop();
    this.open('#shopOverlay');
  };

  Game.prototype.buildShop = function () {
    const save = this.save.data;
    this.dom.shopDia.textContent = NP.fmt(save.diamonds);
    this.dom.shopList.innerHTML = '';
    NP.UPGRADES.forEach((u) => {
      const lvl = save.up[u.id] || 0;
      const maxed = lvl >= u.max;
      const cost = NP.upCost(u, lvl);
      const el = document.createElement('div');
      el.className = 'shop-item' + (maxed ? ' maxed' : '');
      let pips = '';
      for (let i = 0; i < u.max; i++) pips += `<i class="${i < lvl ? 'on' : ''}"></i>`;
      el.innerHTML = `
        <div class="si-icon">${u.icon}</div>
        <div class="si-main">
          <div class="si-name">${u.name}<em>${u.en}</em></div>
          <div class="si-effect">${maxed ? '已达上限' : `下一级：${u.effect(lvl + 1)}`}</div>
          <div class="si-pips">${pips}</div>
        </div>
        <button class="si-buy" ${maxed ? 'disabled' : ''}>
          ${maxed ? '已满级' : `◆ ${cost}<b>强化</b>`}
        </button>`;
      const btn = el.querySelector('.si-buy');
      if (!maxed) {
        btn.onclick = () => {
          const c = NP.upCost(u, lvl);
          if (save.diamonds < c) {
            NP.Audio.sfx('deny');
            this.flashShopDia();
            return;
          }
          save.diamonds -= c;
          save.up[u.id] = lvl + 1;
          NP.Save.write();
          NP.Audio.sfx('buy');
          this.buildShop();
          this.buildMenu();
          if (this.state === 'play' && this.player) this.player.recalc();
        };
      }
      this.dom.shopList.appendChild(el);
    });
  };

  Game.prototype.flashShopDia = function () {
    const el = this.dom.shopDia.parentElement;
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  };

  Game.prototype.openCodex = function () {
    this.renderCodex('brief');
    $$('#codexTabs .tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    this.open('#codexOverlay');
  };

  Game.prototype.renderCodex = function (tab) {
    const body = this.dom.codexBody;
    if (tab === 'brief') {
      body.innerHTML = `
        <h3>行动目标</h3>
        <p>进入 <b class="cy">九龙 07 区</b> 的封锁战场，清剿 <b>200 具失控义体</b>。每击杀一具获得 <span class="cy">10 点经验</span> 与 <span class="cy">3～8 枚钻石</span>；全部清剿后，原型机 <b class="mg">LJM-12138</b> 将解除休眠。</p>
        <h3>难度协议</h3>
        <div class="codex-grid">
          ${NP.DIFFS.map((d) => `
            <div class="codex-card">
              <h4>${d.name}<em>${d.en}</em></h4>
              <p>首领属性 <b class="cy">×${d.mult}</b>${d.id === 3 ? ' · 技能频率 <b class="mg">×2</b>' : ''}<br>${d.desc}</p>
            </div>`).join('')}
        </div>
        <p>首领生命降至 <b class="mg">25%</b> 时进入狂暴：立即造成自身攻击力 90% 的震荡伤害，技能频率提升 25%。</p>
        <h3>成长路线</h3>
        <ul>
          <li><b>经验</b>仅在本关有效，每 100 点提升 1 级，每次升级选择一张协议卡强化自身；关卡重开后等级与卡牌重置。</li>
          <li><b>钻石</b>永久保存，可在义体强化中提升生命 / 攻击 / 防御 / 攻速 / 暴击 / 冷却，死亡与重开都不会清零。</li>
          <li>通关简单、普通、困难三档后解锁 <b class="mg">噩梦</b>：首领属性 ×15、技能频率翻倍。</li>
        </ul>`;
    } else if (tab === 'enemy') {
      body.innerHTML = `
        <h3>普通义体（共 200 具）</h3>
        <p>三种义体按比例混编投放，全部击杀后首领登场。它们的生命、攻击与防御会随清剿进度缓慢增长。</p>
        <div class="codex-grid">
          <div class="codex-card">
            <h4>锋刃 <em>ASSAULT</em></h4>
            <p>侧重 <b class="mg">攻击</b>：高速突进，会蓄力冲刺扑向玩家，接触即造成高额伤害。防御与生命较低，适合优先点杀。</p>
          </div>
          <div class="codex-card">
            <h4>壁垒 <em>TANK</em></h4>
            <p>侧重 <b class="cy">防御</b>：正面举盾吸收伤害，移动缓慢，会发射能量弹。绕后攻击或使用穿透 / 穿甲效果更有效。</p>
          </div>
          <div class="codex-card">
            <h4>肉山 <em>BRUTE</em></h4>
            <p>侧重 <b class="vio">生命</b>：血量极高，贴近后进行重击，死亡时会自爆，对近身玩家造成伤害。</p>
          </div>
          <div class="codex-card">
            <h4>掉落 <em>DROP</em></h4>
            <p>每具义体掉落 <b class="cy">3～8 钻石</b> 与 <b>10 经验</b>；约 7% 概率额外掉落 <b style="color:#b6ff4a">医疗包</b>，回复 8% 最大生命。</p>
          </div>
        </div>
        <h3>战斗提示</h3>
        <ul>
          <li>钻石会被自动吸附，无需刻意拾取。</li>
          <li>被包围时用 <b>SHIFT 相位冲刺</b> 穿出包围圈，冲刺过程完全免疫伤害。</li>
          <li><b>Q 超频协议</b> 开启后火力暴涨，是对付高血量目标的爆发窗口。</li>
        </ul>`;
    } else if (tab === 'boss') {
      body.innerHTML = `
        <h3>LJM-12138 · 终焉核心</h3>
        <p>设定基础属性：生命 <b class="mg">1,000,000</b> · 攻击 <b class="mg">3500</b> · 防御 <b class="mg">1000</b>。难度倍率 ×1 / ×2.5 / ×5 / ×15 作用在生命与攻击上。</p>
        <p><b class="am">终焉充能</b>：清剿期间首领持续蓄能，实际生命 = 1,000,000 × 难度倍率 ×（1 + 0.01 ×（玩家等级 − 1）），21 级登场时约 ×1.2。</p>
        <p>防御按 8% 系数随难度放大，且减伤上限 70%（若直接 ×15，防御 15000 会变成 300% 减伤，完全免疫）。</p>
        <div class="codex-grid">
          <div class="codex-card">
            <h4>瞬移被刺 <em>BLINK</em></h4>
            <p>瞬移到玩家背后发起突刺，造成 <b>900 + 0.2×攻击 + 10×登场秒数</b> 伤害，并获得 <b class="am">5 秒无敌</b>（噩梦难度翻倍为 10 秒）。</p>
          </div>
          <div class="codex-card">
            <h4>残影分身 <em>CLONE</em></h4>
            <p>召唤继承本体 80% 攻击与技能的分身，持续 <b>15 + 0.2×登场秒数</b> 秒。分身是幻影投影，耐久仅为本体 4%，可快速清除；场上最多 1 个。</p>
          </div>
          <div class="codex-card">
            <h4>终焉冲锋 <em>CHARGE</em></h4>
            <p>沿预警方向高速冲刺，路径留下持续 3 秒、<b>每秒 500 点</b>伤害的火焰；撞到玩家造成 <b>2000 + 0.3×攻击 + 5×登场秒数</b> 伤害。</p>
          </div>
          <div class="codex-card">
            <h4>护盾 <em>SHIELD</em></h4>
            <p>获得持续 <b>20 秒</b>的护盾，受到伤害减少 <b>60%</b>；护盾结束时回复自身 <b>30% 生命</b>（以设定基础生命 1,000,000×难度倍率为基准）。</p>
          </div>
          <div class="codex-card">
            <h4>全向弹幕 <em>BARRAGE</em></h4>
            <p>向四周发射密集子弹，每发造成 <b>1000 + 0.15×攻击 + 8×登场秒数</b> 伤害。</p>
          </div>
          <div class="codex-card">
            <h4>被动 · 近身镇压 <em>PASSIVE</em></h4>
            <p>玩家靠近时主动攻击，造成自身攻击力 <b>35%</b> 的伤害。保持距离是生存第一原则。</p>
          </div>
        </div>
        <h3>狂暴机制</h3>
        <p>生命降至 <b class="mg">25%</b> 时，立即释放 1.15 秒预警的「狂暴震荡」，对玩家造成自身攻击力 <b>90%</b> 的伤害——用 Shift 冲刺的无敌帧可以躲过。之后技能频率提升 <b>25%</b>。</p>
        <h3>战斗提示</h3>
        <ul>
          <li>首领技能伤害都会随登场时间增长（<b>+5×秒数</b>），拖延越久越危险。</li>
          <li>「终焉冲锋」的红色预警线会缓慢跟随你，横向移动即可甩开。</li>
          <li>「护盾」结束时会回血，用 <b>Q 超频</b> 在护盾期内倾泻伤害。</li>
          <li>高难度下首领技能频率成倍提升，噩梦的护盾几乎无缝衔接——攒够钻石再挑战。</li>
        </ul>`;
    } else {
      body.innerHTML = `
        <h3>数值规则</h3>
        <ul>
          <li>生命 = <b>1500 + 350 × 等级</b>；攻击 = <b>300 + 50 × 等级</b>；防御 = <b>50 + 2.5 × 等级</b>。</li>
          <li>每 1 点防御使受到的伤害减少 <b>0.02%</b>（上限 70%）。</li>
          <li>等级 = 1 + ⌊经验 / 100⌋；每级额外提升 12% 生命的即时回复。</li>
          <li>超频协议：攻速 <b>+300%</b>（射速 ×4）、伤害 <b>+150%</b>（×2.5）、吸血 <b>20%</b>，持续 10 秒，冷却 15 秒。</li>
          <li>电磁脉冲：范围 420 内敌人停止行动 <b>5 秒</b>，并回复自身 <b>50%</b> 生命，冷却 15 秒。首领对控制有抗性，仅被压制 1.4 秒。</li>
          <li>毁灭激光：造成 <b>1000 + 0.08×攻击 + 0.02×最大生命</b> 的贯穿伤害，冷却 8 秒。</li>
          <li>相位冲刺：0.16 秒位移，期间 <b>完全免疫伤害</b>，冷却约 1.8 秒。</li>
          <li>首领单次受到的减伤上限 70%，因此高难度下需要靠协议卡与钻石强化堆叠火力。</li>
        </ul>
        <h3>设计补充说明</h3>
        <p>首领生命、攻击、防御与五个技能的伤害公式全部按设定集填入（生命 1,000,000，难度倍率照常放大）。为了让这场战斗成立，只对自己设定的部分做了以下调整：</p>
        <ul>
          <li><b>终焉充能</b>：首领生命随玩家等级充能（每级 +1%，21 级约 ×1.2）。原系数 18% 是按旧版 10 万生命标定的，基础生命提升到 100 万后重新收敛，否则简单难度要打 79 秒。</li>
          <li><b>防御收敛</b>：难度倍率对防御只按 8% 系数放大，且减伤上限 70%，避免 ×15 时出现 300% 减伤（完全免疫）。</li>
          <li><b>技能冷却固定</b>：瞬移被刺（5 秒无敌）与护盾（20 秒）的冷却不随难度频率缩短，否则噩梦下会变成永久无敌 / 永久护盾。</li>
          <li><b>分身耐久</b>：残影分身继承 80% 攻击，但只有本体 4% 的耐久，且同时最多 1 个。</li>
          <li><b>护盾回血基准</b>：按设定基础生命（1,000,000×难度倍率）的 30% 回复。</li>
          <li><b>狂暴预警</b>：90% 攻击的震荡伤害带 1.15 秒预警，可用冲刺无敌帧规避。</li>
          <li><b>小怪随进度成长</b>：生命与攻击随清剿数缓慢提升，难度也会小幅强化小怪。</li>
        </ul>`;
    }
  };

  Game.prototype.openSettings = function () {
    this.syncSettings();
    this.dom.saveCode.value = '';
    this.dom.sbMsg.textContent = '';
    this.open('#settingsOverlay');
  };

  Game.prototype.runSelfTest = function () {
    const out = [];
    try {
      this.autoplay = true;
      this.save.data.settings.auto = true;
      const diffs = [0, 1, 2, 3];
      for (const d of diffs) {
        this.startRun(d);
        this.spawned = 200;
        this.kills = 200;
        this.spawnBoss();
        const b = this.boss;
        out.push(`d${d}: bossHp=${b.maxHp} atk=${Math.round(b.atk)} def=${Math.round(b.def)} freq=${b.freq}`);
        this.player.gainXp(2000);
        this.player.pendingCards = 0;
        this.state = 'play';
        // 模拟 20 秒战斗
        for (let i = 0; i < 20 * 60; i++) {
          this.step(1 / 60);
          if (!this.boss) break;
        }
        out.push(`  after20s bossHp=${this.boss ? Math.round(this.boss.hp) : 0} playerHp=${Math.round(this.player.hp)} bullets=${this.pBullets.length} mobs=${this.mobs.length}`);
      }
      document.title = 'TEST OK | ' + out.join(' | ');
    } catch (e) {
      document.title = 'TEST FAIL ' + e.message + ' @' + (e.stack || '').split('\n')[1];
    }
  };

  /* 全局错误展示 */
  window.addEventListener('error', (e) => {
    const el = document.getElementById('bootError');
    if (el) { el.hidden = false; el.textContent = 'ERR: ' + e.message + '\n' + (e.filename || '') + ':' + (e.lineno || ''); }
    if (!/TEST/.test(document.title)) document.title = 'ERR: ' + e.message;
  });

  NP.Save.load();
  window.addEventListener('load', () => {
    NP.App = new Game();
    document.title = '霓虹协议 · NEON PROTOCOL';
  });
})();