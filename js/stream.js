/**
 * Claude Context Window Visualizer — Token Flow Stream
 * Canvas-based animated token flow visualization.
 * Particles flow from left (input) → right (context window),
 * color-coded by category, with speed/density reflecting usage.
 */

'use strict';

const TokenStream = (function () {
  let _inited = false;
  let _canvas = null;
  let _ctx = null;
  let _running = false;
  let _rafId = null;
  let _particles = [];
  let _tokens = { system: 0, user: 0, assistant: 0, tools: 0 };
  let _contextWindow = 200000;

  var MAX_PARTICLES = 60;
  var PARTICLE_LIFE = 120; // frames

  var CAT_COLORS = {
    system:    { r: 139, g: 92,  b: 246 },
    user:      { r: 59,  g: 130, b: 246 },
    assistant: { r: 16,  g: 185, b: 129 },
    tools:     { r: 245, g: 158, b: 11  },
  };

  var CATEGORIES = ['system', 'user', 'assistant', 'tools'];

  function init() {
    var toggle = document.getElementById('stream-toggle');
    var card = document.getElementById('stream-card');
    if (!toggle || !card) return;

    toggle.addEventListener('click', function () {
      var isOpen = card.classList.toggle('stream-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen && !_inited) {
        _inited = true;
        _setupCanvas();
        _start();
      } else if (isOpen && _inited) {
        _start();
      } else {
        _stop();
      }
    });
  }

  function _setupCanvas() {
    _canvas = document.getElementById('stream-canvas');
    if (!_canvas) return;
    _ctx = _canvas.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);
  }

  function _resize() {
    if (!_canvas) return;
    var rect = _canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    _canvas.width = rect.width * dpr;
    _canvas.height = rect.height * dpr;
    _canvas.style.width = rect.width + 'px';
    _canvas.style.height = rect.height + 'px';
    _ctx.scale(dpr, dpr);
  }

  function _start() {
    if (_running) return;
    _running = true;
    _loop();
  }

  function _stop() {
    _running = false;
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
  }

  /**
   * Update token state from external (called by app.js render).
   */
  function setTokens(tokens, contextWindow) {
    _tokens = tokens;
    _contextWindow = contextWindow;
  }

  function isInited() { return _inited; }

  function _loop() {
    if (!_running || !_ctx || !_canvas) return;

    var w = _canvas.width / (window.devicePixelRatio || 1);
    var h = _canvas.height / (window.devicePixelRatio || 1);

    // Clear
    _ctx.clearRect(0, 0, w, h);

    // Draw context window container (right side)
    _drawContainer(w, h);

    // Spawn new particles based on current token distribution
    _spawnParticles(w, h);

    // Update and draw particles
    _updateParticles(w, h);

    // Draw usage meter on the right
    _drawMeter(w, h);

    _rafId = requestAnimationFrame(_loop);
  }

  function _drawContainer(w, h) {
    var cx = w * 0.75;
    var cy = h * 0.5;
    var rw = w * 0.35;
    var rh = h * 0.65;

    _ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)';
    _ctx.lineWidth = 1.5;
    _ctx.setLineDash([4, 4]);
    _ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
    _ctx.setLineDash([]);

    // Label
    _ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
    _ctx.font = '10px system-ui, sans-serif';
    _ctx.textAlign = 'center';
    _ctx.fillText('Context Window', cx, cy - rh / 2 - 6);

    // Fill level
    var total = CATEGORIES.reduce(function (s, c) { return s + (_tokens[c] || 0); }, 0);
    var fillPct = _contextWindow > 0 ? Math.min(total / _contextWindow, 1) : 0;

    if (fillPct > 0) {
      var fillH = rh * fillPct;
      var fy = cy + rh / 2 - fillH;

      // Gradient fill from bottom
      var grad = _ctx.createLinearGradient(cx, cy + rh / 2, cx, fy);
      grad.addColorStop(0, 'rgba(139, 92, 246, 0.08)');
      grad.addColorStop(1, 'rgba(139, 92, 246, 0.02)');
      _ctx.fillStyle = grad;
      _ctx.fillRect(cx - rw / 2 + 1, fy, rw - 2, fillH - 1);

      // Percentage text
      _ctx.fillStyle = fillPct > 0.8 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(139, 92, 246, 0.5)';
      _ctx.font = 'bold 14px system-ui, sans-serif';
      _ctx.fillText(Math.round(fillPct * 100) + '%', cx, cy + 5);
    }
  }

  function _spawnParticles(w, h) {
    var total = CATEGORIES.reduce(function (s, c) { return s + (_tokens[c] || 0); }, 0);
    if (total === 0 || _particles.length >= MAX_PARTICLES) return;

    // Spawn rate proportional to usage
    var rate = Math.max(0.3, Math.min(3, total / _contextWindow * 5));

    if (Math.random() < rate * 0.15) {
      // Pick category weighted by token count
      var cat = _pickCategory(total);
      var col = CAT_COLORS[cat];

      _particles.push({
        x: w * 0.05 + Math.random() * w * 0.15,
        y: h * 0.2 + Math.random() * h * 0.6,
        vx: 1.2 + Math.random() * 1.5,
        vy: (Math.random() - 0.5) * 0.4,
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE,
        r: col.r,
        g: col.g,
        b: col.b,
        size: 2 + Math.random() * 3,
        cat: cat,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  function _pickCategory(total) {
    var r = Math.random() * total;
    var cum = 0;
    for (var i = 0; i < CATEGORIES.length; i++) {
      cum += _tokens[CATEGORIES[i]] || 0;
      if (r <= cum) return CATEGORIES[i];
    }
    return CATEGORIES[0];
  }

  function _updateParticles(w, h) {
    var targetX = w * 0.75;
    var alive = [];

    for (var i = 0; i < _particles.length; i++) {
      var p = _particles[i];
      p.life--;

      if (p.life <= 0 || p.x > w) continue;

      // Move toward target
      var dx = targetX - p.x;
      if (dx > 0) {
        p.vx = Math.min(p.vx + 0.02, 3);
      }

      p.wobble += 0.05;
      p.x += p.vx;
      p.y += p.vy + Math.sin(p.wobble) * 0.3;

      // Keep in bounds
      if (p.y < 5) p.y = 5;
      if (p.y > h - 5) p.y = h - 5;

      // Draw
      var alpha = Math.min(1, p.life / (p.maxLife * 0.2));
      var fadeIn = Math.min(1, (p.maxLife - p.life) / 10);
      var a = alpha * fadeIn * 0.8;

      _ctx.beginPath();
      _ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      _ctx.fillStyle = 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + a + ')';
      _ctx.fill();

      // Trail
      _ctx.beginPath();
      _ctx.moveTo(p.x, p.y);
      _ctx.lineTo(p.x - p.vx * 3, p.y);
      _ctx.strokeStyle = 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + (a * 0.3) + ')';
      _ctx.lineWidth = p.size * 0.6;
      _ctx.stroke();

      alive.push(p);
    }

    _particles = alive;
  }

  function _drawMeter(w, h) {
    // Small category legend at bottom-left
    var lx = 10;
    var ly = h - 12;

    _ctx.font = '9px system-ui, sans-serif';
    _ctx.textAlign = 'left';

    CATEGORIES.forEach(function (cat) {
      var col = CAT_COLORS[cat];
      var tok = _tokens[cat] || 0;
      if (tok === 0) return;

      _ctx.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ', 0.7)';
      _ctx.beginPath();
      _ctx.arc(lx + 4, ly - 3, 3, 0, Math.PI * 2);
      _ctx.fill();

      _ctx.fillStyle = 'rgba(180, 175, 200, 0.5)';
      _ctx.fillText(cat.charAt(0).toUpperCase() + cat.slice(1), lx + 10, ly);

      lx += _ctx.measureText(cat).width + 24;
    });
  }

  return {
    init: init,
    setTokens: setTokens,
    isInited: isInited
  };
})();
