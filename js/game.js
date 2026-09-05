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

  // ---------------------------------------------------------------------
  // Persistenza locale (funziona offline, sopravvive tra le sessioni)
  // ---------------------------------------------------------------------
  const Storage = {
    get highScore() {
      return Number(localStorage.getItem('twd-highscore') || 0);
    },
    set highScore(v) {
      localStorage.setItem('twd-highscore', String(v));
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
    const state = { left: false, right: false, thrust: false, fire: false };
    let firePressed = false; // per rilevare fronte di salita (fuoco singolo su tastiera)

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

    return { state, bindKeyboard, bindButton };
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

  // ---------------------------------------------------------------------
  // Gioco
  // ---------------------------------------------------------------------
  const Game = {
    canvas: null,
    ctx: null,
    w: 0, h: 0, dpr: 1,
    state: 'start', // start | playing | paused | gameover
    ship: null,
    daleks: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    powerups: [],
    stars: [],
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

      document.getElementById('start-highscore').textContent = Storage.highScore;
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

      Input.bindButton(document.getElementById('btn-left'), 'left');
      Input.bindButton(document.getElementById('btn-right'), 'right');
      Input.bindButton(document.getElementById('btn-thrust'), 'thrust');
      Input.bindButton(document.getElementById('btn-fire'), 'fire');
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
      this.ship = new Ship(this.w, this.h);
      this.bullets = [];
      this.enemyBullets = [];
      this.particles = [];
      this.powerups = [];
      this.daleks = [];
      this.spawnWave();
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
        this.ship.lives++;
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

    gameOver() {
      this.state = 'gameover';
      Audio_.stopThrust();
      Audio_.gameOver();
      const beat = this.score > Storage.highScore;
      if (beat) Storage.highScore = this.score;
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
      const s = this.ship;
      const inp = Input.state;

      s.thrusting = false;
      if (inp.left) s.angle -= 3.4 * dt;
      if (inp.right) s.angle += 3.4 * dt;
      if (inp.thrust) {
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

      // particelle
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        p.vx *= 0.96; p.vy *= 0.96;
        if (p.life <= 0) this.particles.splice(i, 1);
      }

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

      const w = 16, h = 20;
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

      // corpo TARDIS
      ctx.fillStyle = '#123a7a';
      ctx.strokeStyle = '#6be8ff';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      // divisori pannelli
      ctx.beginPath();
      ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2);
      ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
      ctx.strokeStyle = 'rgba(107,232,255,0.5)';
      ctx.stroke();
      // lanterna
      ctx.beginPath();
      ctx.fillStyle = '#fff4c8';
      ctx.arc(0, -h / 2 - 4, 3, 0, TAU);
      ctx.fill();

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

    updateHUD() {
      document.getElementById('hud-score').textContent = this.score;
      document.getElementById('hud-highscore').textContent = Math.max(Storage.highScore, this.score);
      document.getElementById('hud-level').textContent = this.level;
      const livesEl = document.getElementById('hud-lives');
      const n = Math.max(0, this.ship.lives);
      if (livesEl.childElementCount !== n) {
        livesEl.innerHTML = '';
        for (let i = 0; i < n; i++) {
          const d = document.createElement('div');
          d.className = 'life-icon';
          livesEl.appendChild(d);
        }
      }
    },

    render(t) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      this.drawStars(t);

      if (this.state === 'playing' || this.state === 'paused') {
        this.drawParticles();
        this.drawPowerUps();
        this.drawBullets(this.bullets, '#6be8ff');
        this.drawBullets(this.enemyBullets, '#ff5b4d');
        for (const d of this.daleks) this.drawDalek(d);
        this.drawShip();
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
