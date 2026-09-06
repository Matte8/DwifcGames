'use strict';

/* =========================================================================
   TARDIS vs DALEK
   Arcade ispirato ad Asteroids, ambientato nell'universo di Doctor Who.
   Progetto amatoriale non ufficiale. Nessuna dipendenza esterna: tutta
   la grafica è disegnata su canvas e l'audio è sintetizzato via Web Audio,
   così il gioco funziona anche del tutto offline.
   ========================================================================= */

(() => {
  const TAU = Math.PI * 2;

  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

  // Sprite pixel-art (8-bit) del TARDIS: generato con scripts/generate_sprites.py,
  // nessun asset di terze parti. Caricato una sola volta e riutilizzato ad ogni frame.
  const tardisSprite = new Image();
  tardisSprite.src = 'assets/sprites/tardis.png';

  // ---------------------------------------------------------------------
  // Persistenza locale (funziona offline, sopravvive tra le sessioni)
  // ---------------------------------------------------------------------
  const Storage = {
    getHighScore(mode) {
      const key = `twd-highscore-${mode}`;
      if (localStorage.getItem(key) === null && mode === 'asteroids') {
        // migrazione dalla vecchia chiave unica (prima che esistessero più modalità)
        const legacy = localStorage.getItem('twd-highscore');
        if (legacy !== null) return Number(legacy);
      }
      return Number(localStorage.getItem(key) || 0);
    },
    setHighScore(mode, v) {
      localStorage.setItem(`twd-highscore-${mode}`, String(v));
    },
    get muted() {
      return localStorage.getItem('twd-muted') === '1';
    },
    set muted(v) {
      localStorage.setItem('twd-muted', v ? '1' : '0');
    },
  };

  // ---------------------------------------------------------------------
  // Audio sintetizzato (nessun file audio: solo oscillatori/rumore)
  // ---------------------------------------------------------------------
  const Audio_ = (() => {
    let ctx = null;
    let master = null;
    let muted = Storage.muted;
    let thrustNode = null;

    function ensureCtx() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    }

    function resume() {
      ensureCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    function setMuted(v) {
      muted = v;
      Storage.muted = v;
      if (master) master.gain.value = muted ? 0 : 0.5;
    }

    function blip({ freq = 440, end = freq, dur = 0.1, type = 'square', gain = 0.25 }) {
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), ctx.currentTime + dur);
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(g).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    }

    function noiseBurst({ dur = 0.3, gain = 0.3, lp = 1200 }) {
      if (!ctx) return;
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(lp, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(filter).connect(g).connect(master);
      src.start();
    }

    return {
      resume,
      setMuted,
      get muted() { return muted; },
      fire: () => blip({ freq: 900, end: 300, dur: 0.09, type: 'square', gain: 0.18 }),
      enemyFire: () => blip({ freq: 260, end: 120, dur: 0.16, type: 'sawtooth', gain: 0.16 }),
      explosionSmall: () => noiseBurst({ dur: 0.25, gain: 0.28, lp: 2200 }),
      explosionBig: () => noiseBurst({ dur: 0.55, gain: 0.35, lp: 900 }),
      hit: () => blip({ freq: 200, end: 40, dur: 0.5, type: 'sawtooth', gain: 0.3 }),
      powerup: () => {
        blip({ freq: 500, end: 900, dur: 0.12, type: 'triangle', gain: 0.22 });
        setTimeout(() => blip({ freq: 700, end: 1200, dur: 0.14, type: 'triangle', gain: 0.2 }), 90);
      },
      select: () => blip({ freq: 600, end: 700, dur: 0.06, type: 'square', gain: 0.15 }),
      gameOver: () => {
        [440, 370, 300, 220].forEach((f, i) => {
          setTimeout(() => blip({ freq: f, end: f * 0.8, dur: 0.35, type: 'sawtooth', gain: 0.22 }), i * 180);
        });
      },
      levelUp: () => {
        [500, 650, 800, 1000].forEach((f, i) => {
          setTimeout(() => blip({ freq: f, end: f, dur: 0.1, type: 'triangle', gain: 0.2 }), i * 80);
        });
      },
      startThrust() {
        if (!ctx || thrustNode) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 70;
        g.gain.value = 0.05;
        osc.connect(g).connect(master);
        osc.start();
        thrustNode = { osc, g };
      },
      stopThrust() {
        if (!thrustNode || !ctx) return;
        const { osc, g } = thrustNode;
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.stop(ctx.currentTime + 0.1);
        thrustNode = null;
      },
    };
  })();

  // ---------------------------------------------------------------------
  // Input: tastiera + touch unificati in un'unica mappa di stato
  // ---------------------------------------------------------------------
  const Input = (() => {
    const state = {
      left: false, right: false, thrust: false, fire: false,
      joyActive: false, joyAngle: 0, joyMagnitude: 0,
    };

    const keyMap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'thrust', KeyW: 'thrust',
      Space: 'fire',
    };

    function bindKeyboard(onPause) {
      window.addEventListener('keydown', (e) => {
        const action = keyMap[e.code];
        if (action) {
          state[action] = true;
          e.preventDefault();
        }
        if (e.code === 'KeyP' || e.code === 'Escape') onPause();
      });
      window.addEventListener('keyup', (e) => {
        const action = keyMap[e.code];
        if (action) {
          state[action] = false;
          e.preventDefault();
        }
      });
    }

    function bindButton(el, action) {
      if (!el) return;
      const press = (e) => { e.preventDefault(); state[action] = true; el.classList.add('pressed'); };
      const release = (e) => { if (e) e.preventDefault(); state[action] = false; el.classList.remove('pressed'); };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    function bindJoystick(baseEl, knobEl) {
      if (!baseEl || !knobEl) return;
      const maxRadius = 40; // px, raggio massimo di escursione della manopola
      const deadzone = 0.25;
      let activeId = null;

      function setKnob(dx, dy) {
        knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      }

      function update(e) {
        const rect = baseEl.getBoundingClientRect();
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);
        setKnob(Math.cos(angle) * clamped, Math.sin(angle) * clamped);
        state.joyAngle = angle;
        state.joyMagnitude = clamped / maxRadius;
        state.joyActive = state.joyMagnitude > deadzone;
      }

      function release(e) {
        if (e && e.pointerId !== activeId) return;
        activeId = null;
        state.joyActive = false;
        state.joyMagnitude = 0;
        setKnob(0, 0);
      }

      baseEl.addEventListener('pointerdown', (e) => {
        activeId = e.pointerId;
        baseEl.setPointerCapture(activeId);
        update(e);
        e.preventDefault();
      });
      baseEl.addEventListener('pointermove', (e) => {
        if (e.pointerId !== activeId) return;
        update(e);
        e.preventDefault();
      });
      baseEl.addEventListener('pointerup', release);
      baseEl.addEventListener('pointercancel', release);
      baseEl.addEventListener('lostpointercapture', release);
      baseEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    return { state, bindKeyboard, bindButton, bindJoystick };
  })();

  // ---------------------------------------------------------------------
  // Entità
  // ---------------------------------------------------------------------
  class Ship {
    constructor(w, h) {
      this.reset(w, h);
      this.lives = 3;
    }
    reset(w, h) {
      this.x = w / 2;
      this.y = h / 2;
      this.vx = 0;
      this.vy = 0;
      this.angle = -Math.PI / 2;
      this.radius = 15;
      this.thrusting = false;
      this.invulnerable = 2.5;
      this.fireCooldown = 0;
      this.rapidFireTimer = 0;
      this.shieldTimer = 0;
    }
    get isShielded() { return this.shieldTimer > 0 || this.invulnerable > 0; }
  }

  class Dalek {
    constructor(x, y, tier, vx, vy) {
      this.x = x;
      this.y = y;
      this.tier = tier; // 2 = grande, 1 = medio, 0 = piccolo
      this.radius = tier === 2 ? 34 : tier === 1 ? 22 : 13;
      this.vx = vx;
      this.vy = vy;
      this.spin = rand(-0.6, 0.6);
      this.rotation = rand(0, TAU);
      this.fireCooldown = rand(1.5, 3.5);
      this.hue = tier === 2 ? '#c9a13b' : tier === 1 ? '#b5b8bd' : '#d8483f';
      this.hueDark = tier === 2 ? '#7a5f1c' : tier === 1 ? '#75787c' : '#8a2b25';
    }
    get points() { return this.tier === 2 ? 20 : this.tier === 1 ? 50 : 100; }
    get speedFactor() { return this.tier === 2 ? 1 : this.tier === 1 ? 1.5 : 2.1; }
  }

  class Bullet {
    constructor(x, y, vx, vy, life) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.life = life; this.radius = 3;
    }
  }

  class Particle {
    constructor(x, y, vx, vy, life, color, size) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.life = life; this.maxLife = life; this.color = color; this.size = size;
    }
  }

  class PowerUp {
    constructor(x, y, type) {
      this.x = x; this.y = y; this.type = type;
      this.vx = rand(-20, 20); this.vy = rand(-20, 20);
      this.radius = 14; this.life = 9; this.spin = 0;
    }
  }

  class Star {
    constructor(w, h) {
      this.x = rand(0, w); this.y = rand(0, h);
      this.z = rand(0.3, 1);
      this.phase = rand(0, TAU);
    }
  }

  class Shield {
    constructor(x, y, cols, rows, cellSize) {
      this.x = x; this.y = y;
      this.cols = cols; this.rows = rows; this.cellSize = cellSize;
      this.cells = [];
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
          // sagoma a bunker: angoli superiori smussati e tacca centrale in basso
          let alive = true;
          if (r === 0 && (c === 0 || c === cols - 1)) alive = false;
          if (r === rows - 1 && Math.abs(c - (cols - 1) / 2) < 1) alive = false;
          row.push(alive);
        }
        this.cells.push(row);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Gioco
  // ---------------------------------------------------------------------
  const Game = {
    canvas: null,
    ctx: null,
    w: 0, h: 0, dpr: 1,
    state: 'start', // start | playing | paused | gameover
    mode: 'asteroids', // asteroids | invaders
    ship: null,
    daleks: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    powerups: [],
    stars: [],
    invaders: null,
    score: 0,
    level: 1,
    nextExtraLifeScore: 10000,
    lastTime: 0,
    respawning: false,

    init() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));

      this.ship = new Ship(this.w, this.h);
      this.stars = Array.from({ length: 140 }, () => new Star(this.w, this.h));

      this.bindUI();
      Input.bindKeyboard(() => this.togglePause());

      document.getElementById('start-highscore').textContent = Storage.getHighScore(this.mode);
      this.updateMuteIcon();
      this.checkOrientation();

      requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = Math.floor(this.w * this.dpr);
      this.canvas.height = Math.floor(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      this.checkOrientation();
    },

    checkOrientation() {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const portraitSmall = this.h > this.w && Math.min(this.w, this.h) < 700;
      const screenEl = document.getElementById('screen-orientation');
      if (isTouch && portraitSmall && this.state === 'playing') {
        screenEl.classList.remove('hidden');
      } else {
        screenEl.classList.add('hidden');
      }
    },

    bindUI() {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (isTouch) document.getElementById('touch-controls').classList.remove('hidden');

      document.getElementById('btn-start').addEventListener('click', () => { Audio_.resume(); Audio_.select(); this.startGame(); });
      document.getElementById('btn-restart').addEventListener('click', () => { Audio_.select(); this.startGame(); });
      document.getElementById('btn-menu').addEventListener('click', () => { Audio_.select(); this.showScreen('start'); this.state = 'start'; });
      document.getElementById('btn-resume').addEventListener('click', () => this.togglePause());
      document.getElementById('btn-quit').addEventListener('click', () => { this.showScreen('start'); this.state = 'start'; });
      document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());
      document.getElementById('btn-orientation-dismiss').addEventListener('click', () => {
        document.getElementById('screen-orientation').classList.add('hidden');
      });
      document.getElementById('btn-mute').addEventListener('click', () => {
        Audio_.setMuted(!Audio_.muted);
        this.updateMuteIcon();
      });

      Input.bindJoystick(document.getElementById('joystick-base'), document.getElementById('joystick-knob'));
      Input.bindButton(document.getElementById('btn-fire'), 'fire');

      document.querySelectorAll('.mode-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.mode = btn.dataset.mode;
          document.querySelectorAll('.mode-tab').forEach((b) => {
            const active = b === btn;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
          });
          document.getElementById('mode-desc-asteroids').classList.toggle('hidden', this.mode !== 'asteroids');
          document.getElementById('mode-desc-invaders').classList.toggle('hidden', this.mode !== 'invaders');
          document.getElementById('instructions-asteroids').classList.toggle('hidden', this.mode !== 'asteroids');
          document.getElementById('instructions-invaders').classList.toggle('hidden', this.mode !== 'invaders');
          document.getElementById('mode-label').textContent = this.mode === 'asteroids' ? 'Asteroidi' : 'Space Invaders';
          document.getElementById('start-highscore').textContent = Storage.getHighScore(this.mode);
          Audio_.select();
        });
      });
    },

    updateMuteIcon() {
      document.getElementById('btn-mute').textContent = Audio_.muted ? '🔇' : '🔊';
    },

    showScreen(name) {
      ['start', 'pause', 'gameover', 'orientation'].forEach((s) => {
        document.getElementById(`screen-${s}`).classList.toggle('hidden', s !== name);
      });
      document.getElementById('hud').classList.toggle('hidden', name !== null);
    },

    startGame() {
      this.score = 0;
      this.level = 1;
      this.nextExtraLifeScore = 10000;
      this.particles = [];

      if (this.mode === 'asteroids') {
        this.ship = new Ship(this.w, this.h);
        this.bullets = [];
        this.enemyBullets = [];
        this.powerups = [];
        this.daleks = [];
        this.spawnWave();
      } else {
        this.resetInvaders();
      }

      this.state = 'playing';
      document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
      document.getElementById('hud').classList.remove('hidden');
      this.checkOrientation();
    },

    togglePause() {
      if (this.state === 'playing') {
        this.state = 'paused';
        document.getElementById('screen-pause').classList.remove('hidden');
      } else if (this.state === 'paused') {
        this.state = 'playing';
        document.getElementById('screen-pause').classList.add('hidden');
      }
    },

    spawnWave() {
      const count = 2 + this.level;
      for (let i = 0; i < count; i++) {
        let x, y;
        do {
          x = rand(0, this.w);
          y = rand(0, this.h);
        } while (dist2(x, y, this.ship.x, this.ship.y) < 200 * 200);
        const speed = rand(20, 40) + this.level * 3;
        const a = rand(0, TAU);
        this.daleks.push(new Dalek(x, y, 2, Math.cos(a) * speed, Math.sin(a) * speed));
      }
    },

    resetInvaders() {
      this.invaders = {
        player: { x: this.w / 2, y: this.h - 70, radius: 16, lives: 3, invulnerable: 2, fireCooldown: 0 },
        bullets: [],
        enemyBullets: [],
        enemies: [],
        offsetX: 0,
        offsetY: 0,
        dir: 1,
        speed: 30,
        fireTimer: 1.5,
      };
      this.spawnInvadersWave();
      this.spawnShields();
    },

    spawnInvadersWave() {
      const inv = this.invaders;
      inv.enemies = [];
      const rows = 5;
      const cols = clamp(Math.floor((this.w - 80) / 70), 5, 8);
      const spacingX = Math.min(70, (this.w - 80) / cols);
      const spacingY = 44;
      const originX = (this.w - spacingX * (cols - 1)) / 2;
      const originY = 100;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tier = r === 0 ? 2 : r < 3 ? 1 : 0;
          const d = new Dalek(originX + c * spacingX, originY + r * spacingY, tier, 0, 0);
          d.radius = 16;
          d.gridRow = r;
          d.gridCol = c;
          d.baseX = d.x;
          d.baseY = d.y;
          d.alive = true;
          d.scoreValue = tier === 2 ? 30 : tier === 1 ? 20 : 10;
          inv.enemies.push(d);
        }
      }
      inv.offsetX = 0;
      inv.offsetY = 0;
      inv.dir = 1;
      inv.speed = 30 + this.level * 6;
      inv.fireTimer = 1.2;
      inv.cols = cols;
    },

    spawnShields() {
      const inv = this.invaders;
      inv.shields = [];
      const count = 4;
      const cols = 8, rows = 5, cellSize = 6;
      const shieldW = cols * cellSize;
      const spacing = this.w / (count + 1);
      for (let i = 1; i <= count; i++) {
        inv.shields.push(new Shield(spacing * i - shieldW / 2, inv.player.y - 110, cols, rows, cellSize));
      }
    },

    shieldHit(b) {
      for (const s of this.invaders.shields) {
        const c = Math.floor((b.x - s.x) / s.cellSize);
        const r = Math.floor((b.y - s.y) / s.cellSize);
        if (r < 0 || r >= s.rows || c < 0 || c >= s.cols || !s.cells[r][c]) continue;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < s.rows && cc >= 0 && cc < s.cols && Math.random() < 0.7) s.cells[rr][cc] = false;
          }
        }
        s.cells[r][c] = false;
        this.spawnExplosion(b.x, b.y, 4, '#6be8ff');
        return true;
      }
      return false;
    },

    splitDalek(d) {
      Audio_.explosionSmall();
      const bits = 2;
      if (d.tier > 0) {
        for (let i = 0; i < bits; i++) {
          const a = rand(0, TAU);
          const speed = rand(40, 90) * (1 + (2 - d.tier) * 0.2);
          this.daleks.push(new Dalek(d.x, d.y, d.tier - 1, Math.cos(a) * speed, Math.sin(a) * speed));
        }
      } else if (Math.random() < 0.18) {
        const types = ['sonic', 'shield', 'life'];
        this.powerups.push(new PowerUp(d.x, d.y, types[randInt(0, types.length - 1)]));
      }
      this.spawnExplosion(d.x, d.y, d.tier === 2 ? 22 : d.tier === 1 ? 14 : 9, d.hue);
    },

    spawnExplosion(x, y, count, color) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const speed = rand(30, 220);
        this.particles.push(new Particle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, rand(0.3, 0.9), color, rand(1.5, 3.5)));
      }
    },

    addScore(v) {
      this.score += v;
      if (this.score >= this.nextExtraLifeScore) {
        if (this.mode === 'asteroids') this.ship.lives++;
        else this.invaders.player.lives++;
        this.nextExtraLifeScore += 10000;
        Audio_.powerup();
      }
    },

    hitShip() {
      if (this.ship.isShielded) return;
      Audio_.hit();
      this.spawnExplosion(this.ship.x, this.ship.y, 26, '#6be8ff');
      this.ship.lives--;
      if (this.ship.lives <= 0) {
        this.gameOver();
      } else {
        this.ship.reset(this.w, this.h);
      }
    },

    hitInvadersPlayer() {
      const p = this.invaders.player;
      if (p.invulnerable > 0) return;
      Audio_.hit();
      this.spawnExplosion(p.x, p.y, 26, '#6be8ff');
      p.lives--;
      if (p.lives <= 0) {
        this.gameOver();
      } else {
        p.x = this.w / 2;
        p.invulnerable = 2;
      }
    },

    gameOver() {
      this.state = 'gameover';
      Audio_.stopThrust();
      Audio_.gameOver();
      const beat = this.score > Storage.getHighScore(this.mode);
      if (beat) Storage.setHighScore(this.mode, this.score);
      document.getElementById('final-score').textContent = this.score;
      document.getElementById('new-record').classList.toggle('hidden', !beat);
      document.getElementById('screen-gameover').classList.remove('hidden');
      document.getElementById('hud').classList.add('hidden');
    },

    wrap(o) {
      const pad = o.radius || 0;
      if (o.x < -pad) o.x = this.w + pad;
      if (o.x > this.w + pad) o.x = -pad;
      if (o.y < -pad) o.y = this.h + pad;
      if (o.y > this.h + pad) o.y = -pad;
    },

    update(dt) {
      if (this.mode === 'asteroids') this.updateAsteroids(dt);
      else this.updateInvaders(dt);
    },

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        p.vx *= 0.96; p.vy *= 0.96;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    },

    updateAsteroids(dt) {
      const s = this.ship;
      const inp = Input.state;

      s.thrusting = false;
      const turnRate = 3.4;
      let wantsThrust = false;
      if (inp.joyActive) {
        // il pad virtuale punta la direzione: la nave ruota verso l'angolo
        // trascinato invece di girare a incrementi fissi come da tastiera.
        const diff = Math.atan2(Math.sin(inp.joyAngle - s.angle), Math.cos(inp.joyAngle - s.angle));
        const maxStep = turnRate * dt;
        s.angle += clamp(diff, -maxStep, maxStep);
        wantsThrust = inp.joyMagnitude > 0.25;
      } else {
        if (inp.left) s.angle -= turnRate * dt;
        if (inp.right) s.angle += turnRate * dt;
        wantsThrust = inp.thrust;
      }
      if (wantsThrust) {
        const acc = 220;
        s.vx += Math.cos(s.angle) * acc * dt;
        s.vy += Math.sin(s.angle) * acc * dt;
        s.thrusting = true;
        Audio_.startThrust();
      } else {
        Audio_.stopThrust();
      }
      s.vx *= 0.992;
      s.vy *= 0.992;
      const speed = Math.hypot(s.vx, s.vy);
      const maxSpeed = 420;
      if (speed > maxSpeed) {
        s.vx = (s.vx / speed) * maxSpeed;
        s.vy = (s.vy / speed) * maxSpeed;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      this.wrap(s);

      if (s.invulnerable > 0) s.invulnerable -= dt;
      if (s.shieldTimer > 0) s.shieldTimer -= dt;
      if (s.rapidFireTimer > 0) s.rapidFireTimer -= dt;
      if (s.fireCooldown > 0) s.fireCooldown -= dt;

      const fireRate = s.rapidFireTimer > 0 ? 0.09 : 0.28;
      if (inp.fire && s.fireCooldown <= 0) {
        s.fireCooldown = fireRate;
        const bx = s.x + Math.cos(s.angle) * s.radius;
        const by = s.y + Math.sin(s.angle) * s.radius;
        this.bullets.push(new Bullet(bx, by, Math.cos(s.angle) * 480 + s.vx * 0.5, Math.sin(s.angle) * 480 + s.vy * 0.5, 1.1));
        Audio_.fire();
      }

      // proiettili giocatore
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        this.wrap(b);
        if (b.life <= 0) this.bullets.splice(i, 1);
      }

      // dalek
      for (const d of this.daleks) {
        d.x += d.vx * dt * d.speedFactor;
        d.y += d.vy * dt * d.speedFactor;
        d.rotation += d.spin * dt;
        this.wrap(d);
        d.fireCooldown -= dt;
        if (d.fireCooldown <= 0 && dist2(d.x, d.y, s.x, s.y) < 520 * 520) {
          d.fireCooldown = rand(1.8, 3.6) - this.level * 0.05;
          const a = Math.atan2(s.y - d.y, s.x - d.x) + rand(-0.08, 0.08);
          this.enemyBullets.push(new Bullet(d.x, d.y, Math.cos(a) * 200, Math.sin(a) * 200, 2.2));
          Audio_.enemyFire();
        }
      }

      // proiettili nemici
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
        const b = this.enemyBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        this.wrap(b);
        if (b.life <= 0) { this.enemyBullets.splice(i, 1); continue; }
        if (dist2(b.x, b.y, s.x, s.y) < (b.radius + s.radius) ** 2) {
          this.enemyBullets.splice(i, 1);
          this.hitShip();
        }
      }

      // powerup
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.spin += dt;
        this.wrap(p);
        if (p.life <= 0) { this.powerups.splice(i, 1); continue; }
        if (dist2(p.x, p.y, s.x, s.y) < (p.radius + s.radius) ** 2) {
          this.applyPowerUp(p.type);
          this.powerups.splice(i, 1);
        }
      }

      this.updateParticles(dt);

      // collisioni proiettile-dalek
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        for (let j = this.daleks.length - 1; j >= 0; j--) {
          const d = this.daleks[j];
          if (dist2(b.x, b.y, d.x, d.y) < (b.radius + d.radius) ** 2) {
            this.addScore(d.points);
            this.splitDalek(d);
            this.daleks.splice(j, 1);
            this.bullets.splice(i, 1);
            break;
          }
        }
      }

      // collisione nave-dalek
      for (let j = this.daleks.length - 1; j >= 0; j--) {
        const d = this.daleks[j];
        if (dist2(s.x, s.y, d.x, d.y) < (s.radius + d.radius) ** 2) {
          if (!s.isShielded) {
            this.addScore(Math.floor(d.points / 2));
            this.spawnExplosion(d.x, d.y, 14, d.hue);
            this.daleks.splice(j, 1);
            this.hitShip();
          }
        }
      }

      if (this.daleks.length === 0) {
        this.level++;
        Audio_.levelUp();
        this.spawnWave();
      }
    },

    updateInvaders(dt) {
      const inv = this.invaders;
      const p = inv.player;
      const inp = Input.state;

      let moveDir = 0;
      if (inp.joyActive) {
        moveDir = Math.cos(inp.joyAngle) * inp.joyMagnitude;
      } else {
        if (inp.left) moveDir -= 1;
        if (inp.right) moveDir += 1;
      }
      p.x = clamp(p.x + moveDir * 300 * dt, 24, this.w - 24);

      if (p.invulnerable > 0) p.invulnerable -= dt;
      if (p.fireCooldown > 0) p.fireCooldown -= dt;
      if (inp.fire && p.fireCooldown <= 0) {
        p.fireCooldown = 0.35;
        inv.bullets.push(new Bullet(p.x, p.y - 20, 0, -480, 1.4));
        Audio_.fire();
      }

      // movimento formazione: avanza finché non tocca un bordo, poi inverte e scende
      let minX = Infinity, maxX = -Infinity;
      for (const e of inv.enemies) {
        if (!e.alive) continue;
        const x = e.baseX + inv.offsetX;
        minX = Math.min(minX, x - e.radius);
        maxX = Math.max(maxX, x + e.radius);
      }
      if (isFinite(minX)) {
        const step = inv.dir * inv.speed * dt;
        if (minX + step < 24 || maxX + step > this.w - 24) {
          inv.dir *= -1;
          inv.offsetY += 16;
        } else {
          inv.offsetX += step;
        }
      }
      for (const e of inv.enemies) {
        if (!e.alive) continue;
        e.x = e.baseX + inv.offsetX;
        e.y = e.baseY + inv.offsetY;
        e.rotation += e.spin * dt;
        if (e.y + e.radius > p.y - 30) {
          this.gameOver();
          return;
        }
      }

      // fuoco nemico: un Dalek vivo a caso, il più avanzato della sua colonna
      const aliveCount = inv.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
      inv.fireTimer -= dt;
      if (inv.fireTimer <= 0 && aliveCount > 0) {
        const col = randInt(0, inv.cols - 1);
        let shooter = null;
        for (const e of inv.enemies) {
          if (e.alive && e.gridCol === col && (!shooter || e.gridRow > shooter.gridRow)) shooter = e;
        }
        if (shooter) {
          inv.enemyBullets.push(new Bullet(shooter.x, shooter.y + shooter.radius, 0, 160 + this.level * 10, 3));
          Audio_.enemyFire();
        }
        const ratio = aliveCount / inv.enemies.length;
        inv.fireTimer = rand(0.5, 1.4) * (0.4 + ratio * 0.8);
      }

      // proiettili giocatore
      for (let i = inv.bullets.length - 1; i >= 0; i--) {
        const b = inv.bullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.y < -10) { inv.bullets.splice(i, 1); continue; }
        if (this.shieldHit(b)) { inv.bullets.splice(i, 1); continue; }
        for (const e of inv.enemies) {
          if (!e.alive) continue;
          if (dist2(b.x, b.y, e.x, e.y) < (b.radius + e.radius) ** 2) {
            e.alive = false;
            this.addScore(e.scoreValue);
            this.spawnExplosion(e.x, e.y, e.tier === 2 ? 18 : e.tier === 1 ? 12 : 8, e.hue);
            Audio_.explosionSmall();
            inv.bullets.splice(i, 1);
            break;
          }
        }
      }

      // proiettili nemici
      for (let i = inv.enemyBullets.length - 1; i >= 0; i--) {
        const b = inv.enemyBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.y > this.h + 10) { inv.enemyBullets.splice(i, 1); continue; }
        if (this.shieldHit(b)) { inv.enemyBullets.splice(i, 1); continue; }
        if (dist2(b.x, b.y, p.x, p.y) < (b.radius + p.radius) ** 2) {
          inv.enemyBullets.splice(i, 1);
          this.hitInvadersPlayer();
        }
      }

      this.updateParticles(dt);

      if (inv.enemies.every((e) => !e.alive)) {
        this.level++;
        Audio_.levelUp();
        this.spawnInvadersWave();
        this.spawnShields();
      }
    },

    applyPowerUp(type) {
      Audio_.powerup();
      if (type === 'sonic') this.ship.rapidFireTimer = 8;
      else if (type === 'shield') this.ship.shieldTimer = 6;
      else if (type === 'life') this.ship.lives++;
    },

    // -------------------------------------------------------------------
    // Disegno
    // -------------------------------------------------------------------
    drawStars(t) {
      const ctx = this.ctx;
      ctx.save();
      for (const st of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + st.phase);
        ctx.globalAlpha = 0.3 + tw * 0.6 * st.z;
        ctx.fillStyle = '#bfe9ff';
        const r = st.z * 1.6;
        ctx.beginPath();
        ctx.arc(st.x, st.y, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    drawShip() {
      const s = this.ship;
      const ctx = this.ctx;
      if (s.invulnerable > 0 && Math.floor(s.invulnerable * 8) % 2 === 0) return;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle + Math.PI / 2);

      if (s.shieldTimer > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, s.radius + 8, 0, TAU);
        ctx.strokeStyle = 'rgba(107, 232, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const w = 26, h = w * (tardisSprite.naturalHeight / tardisSprite.naturalWidth || 1.375);
      // scia di spinta
      if (s.thrusting) {
        ctx.beginPath();
        ctx.moveTo(-w * 0.3, h / 2);
        ctx.lineTo(0, h / 2 + rand(10, 18));
        ctx.lineTo(w * 0.3, h / 2);
        ctx.closePath();
        ctx.fillStyle = '#ffcf6b';
        ctx.fill();
      }

      // corpo TARDIS (sprite pixel-art)
      if (tardisSprite.complete && tardisSprite.naturalWidth) {
        ctx.drawImage(tardisSprite, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#123a7a';
        ctx.strokeStyle = '#6be8ff';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
      }

      ctx.restore();
    },

    drawDalek(d) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);

      ctx.fillStyle = d.hue;
      ctx.strokeStyle = d.hueDark;
      ctx.lineWidth = 2;

      // gonna/base
      ctx.beginPath();
      ctx.arc(0, 0, d.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();

      // protuberanze
      const bumps = 8;
      ctx.fillStyle = d.hueDark;
      for (let i = 0; i < bumps; i++) {
        const a = (i / bumps) * TAU;
        const bx = Math.cos(a) * d.radius * 0.7;
        const by = Math.sin(a) * d.radius * 0.7;
        ctx.beginPath();
        ctx.arc(bx, by, d.radius * 0.12, 0, TAU);
        ctx.fill();
      }

      // cupola
      ctx.fillStyle = d.hue;
      ctx.beginPath();
      ctx.arc(0, 0, d.radius * 0.45, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = d.hueDark;
      ctx.stroke();

      // braccio/gun arm
      ctx.strokeStyle = d.hueDark;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(d.radius * 1.3, 0);
      ctx.stroke();

      ctx.restore();
    },

    drawBullets(list, color) {
      const ctx = this.ctx;
      ctx.fillStyle = color;
      for (const b of list) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, TAU);
        ctx.fill();
      }
    },

    drawParticles() {
      const ctx = this.ctx;
      for (const p of this.particles) {
        ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    drawPowerUps() {
      const ctx = this.ctx;
      const icons = { sonic: '⚡', shield: '🛡', life: '➕' };
      for (const p of this.powerups) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(p.spin) * 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, TAU);
        ctx.fillStyle = 'rgba(11,42,92,0.7)';
        ctx.strokeStyle = '#6be8ff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#eaf6ff';
        ctx.fillText(icons[p.type] || '?', 0, 1);
        ctx.restore();
      }
    },

    drawShields() {
      const ctx = this.ctx;
      ctx.fillStyle = '#1c4d94';
      for (const s of this.invaders.shields) {
        for (let r = 0; r < s.rows; r++) {
          for (let c = 0; c < s.cols; c++) {
            if (s.cells[r][c]) ctx.fillRect(s.x + c * s.cellSize, s.y + r * s.cellSize, s.cellSize, s.cellSize);
          }
        }
      }
    },

    drawInvadersPlayer() {
      const p = this.invaders.player;
      if (p.invulnerable > 0 && Math.floor(p.invulnerable * 8) % 2 === 0) return;
      const ctx = this.ctx;
      const w = 26, h = w * (tardisSprite.naturalHeight / tardisSprite.naturalWidth || 1.375);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (tardisSprite.complete && tardisSprite.naturalWidth) {
        ctx.drawImage(tardisSprite, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#123a7a';
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    },

    updateHUD() {
      document.getElementById('hud-score').textContent = this.score;
      document.getElementById('hud-highscore').textContent = Math.max(Storage.getHighScore(this.mode), this.score);
      document.getElementById('hud-level').textContent = this.level;
      const lives = this.mode === 'asteroids' ? this.ship.lives : this.invaders.player.lives;
      const livesEl = document.getElementById('hud-lives');
      const n = Math.max(0, lives);
      if (livesEl.childElementCount !== n) {
        livesEl.innerHTML = '';
        for (let i = 0; i < n; i++) {
          const d = document.createElement('div');
          d.className = 'life-icon';
          livesEl.appendChild(d);
        }
      }
    },

    renderAsteroids() {
      this.drawPowerUps();
      this.drawBullets(this.bullets, '#6be8ff');
      this.drawBullets(this.enemyBullets, '#ff5b4d');
      for (const d of this.daleks) this.drawDalek(d);
      this.drawShip();
    },

    renderInvaders() {
      this.drawShields();
      this.drawBullets(this.invaders.bullets, '#6be8ff');
      this.drawBullets(this.invaders.enemyBullets, '#ff5b4d');
      for (const e of this.invaders.enemies) if (e.alive) this.drawDalek(e);
      this.drawInvadersPlayer();
    },

    render(t) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      this.drawStars(t);

      if (this.state === 'playing' || this.state === 'paused') {
        this.drawParticles();
        if (this.mode === 'asteroids') this.renderAsteroids();
        else this.renderInvaders();
        this.updateHUD();
      }
    },

    loop(time) {
      const t = time / 1000;
      let dt = t - this.lastTime;
      this.lastTime = t;
      if (!isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);

      if (this.state === 'playing') this.update(dt);
      this.render(t);

      requestAnimationFrame((nt) => this.loop(nt));
    },
  };

  document.addEventListener('DOMContentLoaded', () => Game.init());

  // Service worker: attivo solo su http(s), non su file:// (dove non è
  // necessario: gli asset sono già tutti locali e caricati senza rete).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
