/**
 * Claude Context Window Visualizer — Particle System
 * Lightweight canvas-based particle effect that reacts to context usage.
 * Max 50 particles. Particles turn red and speed up when usage > 80%.
 */

class ParticleSystem {
  constructor() {
    this.canvas = document.getElementById('particle-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.maxParticles = 50;
    this.usagePercent = 0;
    this.running = false;

    // Base colors for normal state (purples and blues matching the theme)
    this.normalColors = [
      { r: 139, g: 92, b: 246 },   // purple
      { r: 99, g: 102, b: 241 },    // indigo
      { r: 59, g: 130, b: 246 },    // blue
      { r: 16, g: 185, b: 129 },    // green (subtle)
    ];

    // Danger color
    this.dangerColor = { r: 239, g: 68, b: 68 }; // red

    this._resize();
    this._initParticles();

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    if (!this.canvas) return;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  _initParticles() {
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(this._createParticle());
    }
  }

  _createParticle(fromEdge = false) {
    const colorIndex = Math.floor(Math.random() * this.normalColors.length);
    return {
      x: fromEdge ? (Math.random() < 0.5 ? -10 : this.width + 10) : Math.random() * this.width,
      y: Math.random() * this.height,
      baseVx: (Math.random() - 0.5) * 0.3,
      baseVy: -Math.random() * 0.2 - 0.1, // drift upward
      size: Math.random() * 2.5 + 1,
      baseAlpha: Math.random() * 0.3 + 0.1,
      alpha: 0,
      colorIndex: colorIndex,
      phase: Math.random() * Math.PI * 2, // for sine-wave wobble
      phaseSpeed: Math.random() * 0.01 + 0.005,
      life: 0,
      maxLife: Math.random() * 400 + 200, // frames
    };
  }

  /**
   * Update the usage percentage (0-100). Affects particle color and speed.
   */
  setUsage(percent) {
    this.usagePercent = Math.min(100, Math.max(0, percent));
  }

  /**
   * Start the animation loop.
   */
  start() {
    if (this.running || !this.canvas) return;
    this.running = true;
    this._loop();
  }

  /**
   * Stop the animation loop.
   */
  stop() {
    this.running = false;
  }

  _loop() {
    if (!this.running) return;
    this._update();
    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  _update() {
    const isDanger = this.usagePercent > 80;
    const dangerIntensity = isDanger ? Math.min((this.usagePercent - 80) / 20, 1) : 0;

    // Speed multiplier: 1x at normal, up to 3x at 100%
    const speedMult = 1 + dangerIntensity * 2;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Update phase for wobble
      p.phase += p.phaseSpeed;

      // Movement
      const wobble = Math.sin(p.phase) * 0.3;
      p.x += (p.baseVx + wobble) * speedMult;
      p.y += p.baseVy * speedMult;

      // Life cycle
      p.life++;
      const lifeFraction = p.life / p.maxLife;

      // Fade in/out
      if (lifeFraction < 0.1) {
        p.alpha = p.baseAlpha * (lifeFraction / 0.1);
      } else if (lifeFraction > 0.8) {
        p.alpha = p.baseAlpha * (1 - (lifeFraction - 0.8) / 0.2);
      } else {
        p.alpha = p.baseAlpha;
      }

      // Respawn if dead or out of bounds
      if (p.life >= p.maxLife || p.y < -20 || p.y > this.height + 20 ||
          p.x < -20 || p.x > this.width + 20) {
        this.particles[i] = this._createParticle(false);
      }
    }
  }

  _draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const isDanger = this.usagePercent > 80;
    const dangerIntensity = isDanger ? Math.min((this.usagePercent - 80) / 20, 1) : 0;

    for (const p of this.particles) {
      // Interpolate color between normal and danger
      const normalColor = this.normalColors[p.colorIndex];
      const r = Math.round(normalColor.r + (this.dangerColor.r - normalColor.r) * dangerIntensity);
      const g = Math.round(normalColor.g + (this.dangerColor.g - normalColor.g) * dangerIntensity);
      const b = Math.round(normalColor.b + (this.dangerColor.b - normalColor.b) * dangerIntensity);

      // Draw particle with glow
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;

      // Outer glow
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.15})`;
      this.ctx.fill();

      // Core
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
      this.ctx.fill();

      this.ctx.restore();
    }
  }
}
