/**
 * Claude Context Window Visualizer — Realtime Monitor
 * Real-time parsing and visualization of Claude Code context window usage.
 * Features: context output parser, ring gauge (Canvas), category bar chart,
 * consumption rate indicator, capacity prediction, danger alerts,
 * and trend sparkline from a rolling 60-point history.
 */

(function () {
  'use strict';

  // ---- Constants ----
  var HISTORY_SIZE = 60;
  var SIMULATION_INTERVAL = 1000; // ms
  var RING_SIZE = 220;
  var RING_LINE_WIDTH = 18;
  var SPARKLINE_W = 240;
  var SPARKLINE_H = 48;

  var CATEGORIES = ['system', 'user', 'assistant', 'tools'];
  var CAT_LABELS = { system: 'System', user: 'User', assistant: 'Assistant', tools: 'Tools' };
  var CAT_COLORS = { system: '#8B5CF6', user: '#3B82F6', assistant: '#10B981', tools: '#F59E0B' };

  // Thresholds for danger alerts
  var WARN_THRESHOLD = 80;
  var DANGER_THRESHOLD = 95;

  // ---- Module State ----
  var _inited = false;
  var _container = null;
  var _els = {};           // DOM element cache
  var _canvas = null;
  var _canvasCtx = null;
  var _sparkCanvas = null;
  var _sparkCtx = null;
  var _rafId = null;
  var _simTimer = null;

  // Data state
  var _data = {
    contextWindow: 200000,
    tokens: { system: 0, user: 0, assistant: 0, tools: 0 },
    percent: 0,
    history: [],           // Array of { timestamp, tokens, total, percent }
    rateTokensPerMin: 0,
    predictedMinutes: Infinity,
  };

  // Animation state (smooth transitions)
  var _anim = {
    currentPercent: 0,
    targetPercent: 0,
    currentBars: { system: 0, user: 0, assistant: 0, tools: 0 },
    targetBars: { system: 0, user: 0, assistant: 0, tools: 0 },
  };

  // ---- Theme Helper ----
  function isDarkTheme() {
    var theme = document.documentElement.dataset.theme;
    return theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function themeColor(dark, light) {
    return isDarkTheme() ? dark : light;
  }

  // ---- Utility ----
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  /**
   * Get gradient color for a percentage value (green -> yellow -> red).
   */
  function getGradientColor(percent) {
    if (percent <= 50) {
      // Green to Yellow
      var t = percent / 50;
      var r = Math.round(lerp(16, 245, t));
      var g = Math.round(lerp(185, 158, t));
      var b = Math.round(lerp(129, 11, t));
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    } else {
      // Yellow to Red
      var t2 = (percent - 50) / 50;
      var r2 = Math.round(lerp(245, 239, t2));
      var g2 = Math.round(lerp(158, 68, t2));
      var b2 = Math.round(lerp(11, 68, t2));
      return 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
    }
  }

  // ---- Parse /context Command Output ----

  /**
   * Parse the output of Claude Code's /context command.
   * Supports multiple formats:
   *   "System: 12,345 tokens (6.2%)"
   *   "system_tokens: 12345"
   *   "Total: 45,000 / 200,000 tokens (22.5%)"
   * Returns { contextWindow, tokens: { system, user, assistant, tools }, total, percent } or null.
   */
  function parseContextOutput(text) {
    if (!text || typeof text !== 'string') return null;

    var result = {
      contextWindow: _data.contextWindow,
      tokens: { system: 0, user: 0, assistant: 0, tools: 0 },
      total: 0,
      percent: 0,
    };

    // Try to extract context window size from "X / 200,000" or "context window: 200000"
    var cwMatch = text.match(/(?:\/|of|context\s*window[:\s]*)\s*([\d,]+)\s*(?:tokens)?/i);
    if (cwMatch) {
      var cwVal = parseInt(cwMatch[1].replace(/,/g, ''), 10);
      if (cwVal > 0) result.contextWindow = cwVal;
    }

    // Extract per-category token counts
    CATEGORIES.forEach(function (cat) {
      // Match patterns like "System: 12,345 tokens" or "system_tokens: 12345" or "System  12345"
      var patterns = [
        new RegExp(cat + '[:\\s_]*tokens?[:\\s]*(\\d[\\d,]*)', 'i'),
        new RegExp(cat + '[:\\s]+(\\d[\\d,]*)\\s*(?:tokens|\\()', 'i'),
        new RegExp(cat + '\\s*[:=]\\s*(\\d[\\d,]*)', 'i'),
      ];
      for (var i = 0; i < patterns.length; i++) {
        var m = text.match(patterns[i]);
        if (m) {
          result.tokens[cat] = parseInt(m[1].replace(/,/g, ''), 10);
          break;
        }
      }
    });

    // Extract total if explicitly stated
    var totalMatch = text.match(/total[:\s]*([\d,]+)\s*(?:\/|tokens)/i);
    if (totalMatch) {
      result.total = parseInt(totalMatch[1].replace(/,/g, ''), 10);
    } else {
      result.total = CATEGORIES.reduce(function (sum, cat) { return sum + result.tokens[cat]; }, 0);
    }

    // Extract percentage if stated
    var pctMatch = text.match(/([\d.]+)\s*%/);
    if (pctMatch) {
      result.percent = parseFloat(pctMatch[1]);
    } else if (result.contextWindow > 0) {
      result.percent = (result.total / result.contextWindow) * 100;
    }

    // Validate: at least some data was parsed
    if (result.total === 0 && result.percent === 0) return null;

    return result;
  }

  // ---- DOM Construction ----

  function buildDOM(containerId) {
    _container = document.getElementById(containerId);
    if (!_container) {
      console.warn('RealtimeMonitor: container #' + containerId + ' not found');
      return false;
    }

    _container.innerHTML = '';
    _container.classList.add('rtm');

    // ---- Header ----
    var header = el('div', 'rtm__header');
    var title = el('h3', 'rtm__title');
    title.textContent = 'Realtime Context Monitor';
    var controls = el('div', 'rtm__controls');

    var btnSim = el('button', 'rtm__btn rtm__btn--sim');
    btnSim.textContent = '\u25B6 Simulate';
    btnSim.title = 'Start / stop simulated data stream';
    btnSim.addEventListener('click', toggleSimulation);
    _els.btnSim = btnSim;

    var btnReset = el('button', 'rtm__btn rtm__btn--reset');
    btnReset.textContent = '\u21BA Reset';
    btnReset.title = 'Reset all data';
    btnReset.addEventListener('click', resetData);

    controls.appendChild(btnSim);
    controls.appendChild(btnReset);
    header.appendChild(title);
    header.appendChild(controls);
    _container.appendChild(header);

    // ---- Alert Banner ----
    var alert = el('div', 'rtm__alert rtm__alert--hidden');
    alert.setAttribute('role', 'alert');
    _els.alert = alert;
    _container.appendChild(alert);

    // ---- Main Grid ----
    var grid = el('div', 'rtm__grid');

    // Left column: Ring Gauge
    var ringCol = el('div', 'rtm__ring-col');
    var canvasWrap = el('div', 'rtm__canvas-wrap');
    _canvas = document.createElement('canvas');
    _canvas.width = RING_SIZE * 2;   // 2x for retina
    _canvas.height = RING_SIZE * 2;
    _canvas.style.width = RING_SIZE + 'px';
    _canvas.style.height = RING_SIZE + 'px';
    _canvas.classList.add('rtm__canvas');
    _canvasCtx = _canvas.getContext('2d');
    canvasWrap.appendChild(_canvas);

    // Center label overlay
    var centerLabel = el('div', 'rtm__ring-label');
    var pctNum = el('span', 'rtm__pct-num');
    pctNum.textContent = '0';
    _els.pctNum = pctNum;
    var pctSign = el('span', 'rtm__pct-sign');
    pctSign.textContent = '%';
    var subLabel = el('div', 'rtm__ring-sub');
    subLabel.textContent = '0 / 200K tokens';
    _els.ringSubLabel = subLabel;
    centerLabel.appendChild(pctNum);
    centerLabel.appendChild(pctSign);
    canvasWrap.appendChild(centerLabel);
    canvasWrap.appendChild(subLabel);

    ringCol.appendChild(canvasWrap);
    grid.appendChild(ringCol);

    // Right column: Bars + Stats
    var infoCol = el('div', 'rtm__info-col');

    // Category bar chart
    var barsSection = el('div', 'rtm__bars-section');
    var barsTitle = el('div', 'rtm__section-title');
    barsTitle.textContent = 'Category Breakdown';
    barsSection.appendChild(barsTitle);

    CATEGORIES.forEach(function (cat) {
      var row = el('div', 'rtm__bar-row');
      var label = el('span', 'rtm__bar-label');
      label.textContent = CAT_LABELS[cat];
      var barOuter = el('div', 'rtm__bar-outer');
      var barInner = el('div', 'rtm__bar-inner');
      barInner.style.backgroundColor = CAT_COLORS[cat];
      barInner.style.width = '0%';
      barOuter.appendChild(barInner);
      var value = el('span', 'rtm__bar-value');
      value.textContent = '0';
      row.appendChild(label);
      row.appendChild(barOuter);
      row.appendChild(value);
      barsSection.appendChild(row);
      _els['bar_' + cat] = barInner;
      _els['barVal_' + cat] = value;
    });

    infoCol.appendChild(barsSection);

    // Stats cards row
    var statsRow = el('div', 'rtm__stats-row');

    // Rate card
    var rateCard = buildStatCard('\u26A1', 'Rate', '0', 'tok/min');
    _els.rateValue = rateCard.querySelector('.rtm__stat-num');
    statsRow.appendChild(rateCard);

    // Prediction card
    var predCard = buildStatCard('\u23F3', 'Time Left', '\u221E', 'min');
    _els.predValue = predCard.querySelector('.rtm__stat-num');
    statsRow.appendChild(predCard);

    // Total card
    var totalCard = buildStatCard('\u2211', 'Total', '0', 'tokens');
    _els.totalValue = totalCard.querySelector('.rtm__stat-num');
    statsRow.appendChild(totalCard);

    infoCol.appendChild(statsRow);
    grid.appendChild(infoCol);
    _container.appendChild(grid);

    // ---- Sparkline ----
    var sparkSection = el('div', 'rtm__spark-section');
    var sparkTitle = el('div', 'rtm__section-title');
    sparkTitle.textContent = 'Usage Trend (last 60 samples)';
    sparkSection.appendChild(sparkTitle);

    _sparkCanvas = document.createElement('canvas');
    _sparkCanvas.width = SPARKLINE_W * 2;
    _sparkCanvas.height = SPARKLINE_H * 2;
    _sparkCanvas.style.width = '100%';
    _sparkCanvas.style.height = SPARKLINE_H + 'px';
    _sparkCanvas.classList.add('rtm__sparkline');
    _sparkCtx = _sparkCanvas.getContext('2d');
    sparkSection.appendChild(_sparkCanvas);
    _container.appendChild(sparkSection);

    // ---- Input Panel ----
    var inputSection = el('div', 'rtm__input-section');
    var inputTitle = el('div', 'rtm__section-title');
    inputTitle.textContent = 'Paste /context Output';
    inputSection.appendChild(inputTitle);

    var textarea = document.createElement('textarea');
    textarea.className = 'rtm__textarea';
    textarea.placeholder = 'Paste the output of Claude Code\'s /context command here...\n\nExample:\nSystem: 12,345 tokens (6.2%)\nUser: 28,000 tokens (14.0%)\nAssistant: 45,600 tokens (22.8%)\nTools: 8,200 tokens (4.1%)\nTotal: 94,145 / 200,000 tokens (47.1%)';
    textarea.rows = 6;
    textarea.addEventListener('input', onTextareaInput);
    _els.textarea = textarea;
    inputSection.appendChild(textarea);

    var parseStatus = el('div', 'rtm__parse-status');
    _els.parseStatus = parseStatus;
    inputSection.appendChild(parseStatus);

    _container.appendChild(inputSection);

    // ---- Inject Styles ----
    injectStyles();

    return true;
  }

  /**
   * Helper: create element with class name(s).
   */
  function el(tag, className) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  /**
   * Build a small stat card with icon, label, value, and unit.
   */
  function buildStatCard(icon, label, value, unit) {
    var card = el('div', 'rtm__stat-card');
    var iconEl = el('span', 'rtm__stat-icon');
    iconEl.textContent = icon;
    var body = el('div', 'rtm__stat-body');
    var labelEl = el('div', 'rtm__stat-label');
    labelEl.textContent = label;
    var row = el('div', 'rtm__stat-row');
    var num = el('span', 'rtm__stat-num');
    num.textContent = value;
    var unitEl = el('span', 'rtm__stat-unit');
    unitEl.textContent = unit;
    row.appendChild(num);
    row.appendChild(unitEl);
    body.appendChild(labelEl);
    body.appendChild(row);
    card.appendChild(iconEl);
    card.appendChild(body);
    return card;
  }

  // ---- Styles ----

  function injectStyles() {
    if (document.getElementById('rtm-styles')) return;

    var css = [
      '/* Realtime Monitor Styles */',
      '.rtm { font-family: inherit; }',

      '.rtm__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }',
      '.rtm__title { margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-primary, #1a1a2e); }',
      '.rtm__controls { display: flex; gap: 8px; }',

      '.rtm__btn { padding: 6px 14px; border: 1px solid var(--border, #d1d5db); border-radius: 8px;',
      '  background: var(--surface, #fff); color: var(--text-primary, #1a1a2e); font-size: 0.8rem;',
      '  cursor: pointer; transition: all 0.2s ease; font-weight: 500; }',
      '.rtm__btn:hover { background: var(--surface-hover, #f3f4f6); transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }',
      '.rtm__btn--sim.active { background: #ef4444; color: #fff; border-color: #ef4444; }',

      '.rtm__alert { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 0.85rem;',
      '  text-align: center; margin-bottom: 12px; transition: all 0.3s ease; }',
      '.rtm__alert--hidden { display: none; }',
      '.rtm__alert--warn { display: block; background: #fef3c7; color: #92400e; border: 1px solid #fbbf24; }',
      '.rtm__alert--danger { display: block; background: #fef2f2; color: #991b1b; border: 1px solid #ef4444; animation: rtm-blink 0.8s ease-in-out infinite; }',

      '@keyframes rtm-blink {',
      '  0%, 100% { opacity: 1; }',
      '  50% { opacity: 0.6; }',
      '}',

      '.rtm__grid { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: start; margin-bottom: 16px; }',
      '@media (max-width: 640px) { .rtm__grid { grid-template-columns: 1fr; justify-items: center; } }',

      '.rtm__ring-col { display: flex; flex-direction: column; align-items: center; }',
      '.rtm__canvas-wrap { position: relative; width: ' + RING_SIZE + 'px; height: ' + RING_SIZE + 'px; }',
      '.rtm__canvas { display: block; }',

      '.rtm__ring-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -60%);',
      '  text-align: center; pointer-events: none; }',
      '.rtm__pct-num { font-size: 2.8rem; font-weight: 800; line-height: 1; color: var(--text-primary, #1a1a2e); }',
      '.rtm__pct-sign { font-size: 1.2rem; font-weight: 600; color: var(--text-secondary, #6b7280); margin-left: 2px; }',
      '.rtm__ring-sub { position: absolute; bottom: 28%; left: 50%; transform: translateX(-50%);',
      '  font-size: 0.7rem; color: var(--text-secondary, #6b7280); white-space: nowrap; pointer-events: none; }',

      '.rtm__info-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }',

      '.rtm__section-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase;',
      '  letter-spacing: 0.05em; color: var(--text-secondary, #6b7280); margin-bottom: 8px; }',

      '.rtm__bars-section { }',
      '.rtm__bar-row { display: grid; grid-template-columns: 72px 1fr 56px; gap: 8px; align-items: center; margin-bottom: 6px; }',
      '.rtm__bar-label { font-size: 0.78rem; font-weight: 500; color: var(--text-primary, #1a1a2e); }',
      '.rtm__bar-outer { height: 12px; background: var(--surface-alt, #f3f4f6); border-radius: 6px; overflow: hidden; position: relative; }',
      '.rtm__bar-inner { height: 100%; border-radius: 6px; transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1); min-width: 0; }',
      '.rtm__bar-value { font-size: 0.72rem; font-weight: 600; color: var(--text-secondary, #6b7280); text-align: right; font-variant-numeric: tabular-nums; }',

      '.rtm__stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }',
      '.rtm__stat-card { display: flex; align-items: center; gap: 8px; padding: 10px 12px;',
      '  background: var(--surface-alt, #f9fafb); border-radius: 10px; border: 1px solid var(--border, #e5e7eb); }',
      '.rtm__stat-icon { font-size: 1.3rem; }',
      '.rtm__stat-body { min-width: 0; }',
      '.rtm__stat-label { font-size: 0.65rem; font-weight: 500; color: var(--text-secondary, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; }',
      '.rtm__stat-row { display: flex; align-items: baseline; gap: 3px; }',
      '.rtm__stat-num { font-size: 1.1rem; font-weight: 700; color: var(--text-primary, #1a1a2e); font-variant-numeric: tabular-nums; }',
      '.rtm__stat-unit { font-size: 0.65rem; color: var(--text-secondary, #6b7280); }',

      '.rtm__spark-section { margin-bottom: 16px; }',
      '.rtm__sparkline { display: block; width: 100%; border-radius: 8px;',
      '  background: var(--surface-alt, #f9fafb); border: 1px solid var(--border, #e5e7eb); }',

      '.rtm__input-section { }',
      '.rtm__textarea { width: 100%; padding: 10px 14px; border: 1px solid var(--border, #d1d5db); border-radius: 10px;',
      '  background: var(--surface, #fff); color: var(--text-primary, #1a1a2e); font-family: "SF Mono", "Fira Code", monospace;',
      '  font-size: 0.78rem; resize: vertical; outline: none; transition: border-color 0.2s; box-sizing: border-box; }',
      '.rtm__textarea:focus { border-color: #8B5CF6; box-shadow: 0 0 0 3px rgba(139,92,246,0.15); }',
      '.rtm__textarea::placeholder { color: var(--text-muted, #9ca3af); }',

      '.rtm__parse-status { font-size: 0.75rem; margin-top: 6px; min-height: 1.2em; }',
      '.rtm__parse-status--ok { color: #10B981; }',
      '.rtm__parse-status--err { color: #ef4444; }',

      '/* Dark theme overrides */',
      '[data-theme="dark"] .rtm__btn { background: var(--surface, #1e1e2e); border-color: var(--border, #374151); color: var(--text-primary, #e5e7eb); }',
      '[data-theme="dark"] .rtm__btn:hover { background: var(--surface-hover, #2d2d3f); }',
      '[data-theme="dark"] .rtm__alert--warn { background: #451a03; color: #fbbf24; border-color: #92400e; }',
      '[data-theme="dark"] .rtm__alert--danger { background: #450a0a; color: #fca5a5; border-color: #991b1b; }',
      '[data-theme="dark"] .rtm__textarea { background: var(--surface, #1e1e2e); color: var(--text-primary, #e5e7eb); border-color: var(--border, #374151); }',
      '[data-theme="dark"] .rtm__textarea:focus { border-color: #a78bfa; box-shadow: 0 0 0 3px rgba(167,139,250,0.2); }',
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'rtm-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Canvas: Ring Gauge ----

  /**
   * Draw the ring progress gauge on the canvas.
   * Uses a gradient that shifts green -> yellow -> red based on percentage.
   */
  function drawRing(percent) {
    var ctx = _canvasCtx;
    var size = RING_SIZE * 2; // retina
    var cx = size / 2;
    var cy = size / 2;
    var radius = (size - RING_LINE_WIDTH * 2 - 16) / 2;
    var lw = RING_LINE_WIDTH * 2; // retina scale

    ctx.clearRect(0, 0, size, size);

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = themeColor('rgba(255,255,255,0.08)', 'rgba(0,0,0,0.06)');
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (percent <= 0) return;

    // Foreground arc with gradient
    var startAngle = -Math.PI / 2;
    var endAngle = startAngle + (Math.PI * 2 * clamp(percent, 0, 100) / 100);

    // Create a conic-style gradient by computing start and end points
    var grad = ctx.createConicGradient(startAngle, cx, cy);

    // Fallback: use linear gradient between the arc endpoints if createConicGradient is not supported
    if (!grad || typeof ctx.createConicGradient !== 'function') {
      var x1 = cx + radius * Math.cos(startAngle);
      var y1 = cy + radius * Math.sin(startAngle);
      var x2 = cx + radius * Math.cos(endAngle);
      var y2 = cy + radius * Math.sin(endAngle);
      grad = ctx.createLinearGradient(x1, y1, x2, y2);
    }

    grad.addColorStop(0, '#10B981');          // green
    grad.addColorStop(0.4, '#F59E0B');        // yellow
    grad.addColorStop(0.75, '#EF4444');       // red
    grad.addColorStop(1, '#DC2626');          // deep red

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = grad;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Glow effect at the tip
    if (percent > 2) {
      var tipAngle = endAngle;
      var tipX = cx + radius * Math.cos(tipAngle);
      var tipY = cy + radius * Math.sin(tipAngle);
      var glowColor = getGradientColor(percent);

      ctx.beginPath();
      ctx.arc(tipX, tipY, lw * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---- Canvas: Sparkline ----

  /**
   * Draw a trend sparkline from the history data.
   */
  function drawSparkline() {
    var ctx = _sparkCtx;
    var w = _sparkCanvas.width;
    var h = _sparkCanvas.height;

    ctx.clearRect(0, 0, w, h);

    var history = _data.history;
    if (history.length < 2) return;

    var maxPts = HISTORY_SIZE;
    var pts = history.slice(-maxPts);
    var len = pts.length;

    // Compute Y range
    var maxPct = 0;
    for (var i = 0; i < len; i++) {
      if (pts[i].percent > maxPct) maxPct = pts[i].percent;
    }
    maxPct = Math.max(maxPct, 10); // minimum scale

    var padX = 8;
    var padY = 8;
    var chartW = w - padX * 2;
    var chartH = h - padY * 2;

    // Build path
    function getX(idx) { return padX + (idx / (maxPts - 1)) * chartW; }
    function getY(pct) { return padY + chartH - (pct / maxPct) * chartH; }

    // Fill area under curve
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(pts[0].percent));
    for (var j = 1; j < len; j++) {
      ctx.lineTo(getX(j), getY(pts[j].percent));
    }
    ctx.lineTo(getX(len - 1), padY + chartH);
    ctx.lineTo(getX(0), padY + chartH);
    ctx.closePath();

    var fillGrad = ctx.createLinearGradient(0, padY, 0, padY + chartH);
    fillGrad.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
    fillGrad.addColorStop(1, 'rgba(139, 92, 246, 0.02)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(pts[0].percent));
    for (var k = 1; k < len; k++) {
      ctx.lineTo(getX(k), getY(pts[k].percent));
    }
    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw last-point dot
    var lastPt = pts[len - 1];
    var lastX = getX(len - 1);
    var lastY = getY(lastPt.percent);

    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fillStyle = getGradientColor(lastPt.percent);
    ctx.fill();
    ctx.strokeStyle = themeColor('#1e1e2e', '#fff');
    ctx.lineWidth = 2;
    ctx.stroke();

    // Threshold lines
    drawThresholdLine(ctx, padX, chartW, getY(WARN_THRESHOLD), '#F59E0B', w);
    drawThresholdLine(ctx, padX, chartW, getY(DANGER_THRESHOLD), '#EF4444', w);
  }

  /**
   * Draw a horizontal dashed threshold line on the sparkline.
   */
  function drawThresholdLine(ctx, padX, chartW, y, color, totalW) {
    if (y < 0 || y > _sparkCanvas.height) return;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(padX + chartW, y);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Data Update ----

  /**
   * Update the monitor with new token data.
   * @param {Object} params - { contextWindow, tokens: {system, user, assistant, tools} }
   */
  function update(params) {
    if (!_inited) return;

    if (params.contextWindow != null) {
      _data.contextWindow = params.contextWindow;
    }

    if (params.tokens) {
      CATEGORIES.forEach(function (cat) {
        if (params.tokens[cat] != null) {
          _data.tokens[cat] = params.tokens[cat];
        }
      });
    }

    // Compute totals
    var total = 0;
    CATEGORIES.forEach(function (cat) { total += _data.tokens[cat]; });
    var percent = _data.contextWindow > 0 ? (total / _data.contextWindow) * 100 : 0;
    percent = clamp(percent, 0, 100);

    _data.percent = percent;

    // Push to history
    var now = Date.now();
    _data.history.push({
      timestamp: now,
      tokens: Object.assign({}, _data.tokens),
      total: total,
      percent: percent,
    });
    if (_data.history.length > HISTORY_SIZE) {
      _data.history.shift();
    }

    // Compute rate (tokens per minute) from last 10 data points
    computeRate();

    // Set animation targets
    _anim.targetPercent = percent;
    CATEGORIES.forEach(function (cat) {
      _anim.targetBars[cat] = _data.contextWindow > 0
        ? (_data.tokens[cat] / _data.contextWindow) * 100
        : 0;
    });

    // Update non-animated DOM
    updateDOM(total, percent);

    // Ensure animation loop is running
    if (!_rafId) {
      _rafId = requestAnimationFrame(animationLoop);
    }
  }

  /**
   * Compute token consumption rate from recent history.
   */
  function computeRate() {
    var h = _data.history;
    if (h.length < 2) {
      _data.rateTokensPerMin = 0;
      _data.predictedMinutes = Infinity;
      return;
    }

    // Use up to the last 10 points for smoothing
    var window = Math.min(h.length, 10);
    var oldest = h[h.length - window];
    var newest = h[h.length - 1];
    var dt = (newest.timestamp - oldest.timestamp) / 60000; // minutes
    var dTokens = newest.total - oldest.total;

    if (dt > 0 && dTokens > 0) {
      _data.rateTokensPerMin = Math.round(dTokens / dt);
      var remaining = _data.contextWindow - newest.total;
      _data.predictedMinutes = remaining > 0
        ? Math.round(remaining / _data.rateTokensPerMin)
        : 0;
    } else {
      _data.rateTokensPerMin = 0;
      _data.predictedMinutes = Infinity;
    }
  }

  /**
   * Update static DOM elements (alerts, stats, labels).
   */
  function updateDOM(total, percent) {
    // Percentage display
    _els.pctNum.textContent = Math.round(percent);
    _els.ringSubLabel.textContent = formatNumber(total) + ' / ' + formatNumber(_data.contextWindow) + ' tokens';

    // Stats
    _els.rateValue.textContent = formatNumber(_data.rateTokensPerMin);
    _els.predValue.textContent = _data.predictedMinutes === Infinity
      ? '\u221E'
      : (_data.predictedMinutes <= 0 ? '0' : String(_data.predictedMinutes));
    _els.totalValue.textContent = formatNumber(total);

    // Alert banner
    updateAlert(percent);

    // Color-code percentage number
    _els.pctNum.style.color = getGradientColor(percent);
  }

  /**
   * Show/hide danger alert banners based on usage percentage.
   */
  function updateAlert(percent) {
    var alert = _els.alert;
    if (percent >= DANGER_THRESHOLD) {
      alert.className = 'rtm__alert rtm__alert--danger';
      alert.textContent = '⚠️ CRITICAL: Context window is ' + Math.round(percent) + '% full! Tokens will be truncated soon.';
    } else if (percent >= WARN_THRESHOLD) {
      alert.className = 'rtm__alert rtm__alert--warn';
      alert.textContent = '⚠ Warning: Context window usage at ' + Math.round(percent) + '%. Consider summarizing or resetting context.';
    } else {
      alert.className = 'rtm__alert rtm__alert--hidden';
    }
  }

  // ---- Animation Loop ----

  /**
   * Main animation loop: smoothly interpolates ring gauge and bar widths.
   */
  function animationLoop() {
    var speed = 0.1; // interpolation speed per frame
    var changed = false;

    // Animate ring percent
    if (Math.abs(_anim.currentPercent - _anim.targetPercent) > 0.1) {
      _anim.currentPercent = lerp(_anim.currentPercent, _anim.targetPercent, speed);
      changed = true;
    } else if (_anim.currentPercent !== _anim.targetPercent) {
      _anim.currentPercent = _anim.targetPercent;
      changed = true;
    }

    // Animate bars
    CATEGORIES.forEach(function (cat) {
      if (Math.abs(_anim.currentBars[cat] - _anim.targetBars[cat]) > 0.05) {
        _anim.currentBars[cat] = lerp(_anim.currentBars[cat], _anim.targetBars[cat], speed);
        changed = true;
      } else if (_anim.currentBars[cat] !== _anim.targetBars[cat]) {
        _anim.currentBars[cat] = _anim.targetBars[cat];
        changed = true;
      }
    });

    // Redraw canvas
    drawRing(_anim.currentPercent);

    // Update bars
    CATEGORIES.forEach(function (cat) {
      var pct = _anim.currentBars[cat];
      _els['bar_' + cat].style.width = Math.max(pct, 0).toFixed(2) + '%';
      _els['barVal_' + cat].textContent = formatNumber(_data.tokens[cat]);
    });

    // Redraw sparkline
    drawSparkline();

    if (changed) {
      _rafId = requestAnimationFrame(animationLoop);
    } else {
      _rafId = null;
    }
  }

  // ---- Textarea Input Handling ----

  function onTextareaInput() {
    var text = _els.textarea.value.trim();
    if (!text) {
      _els.parseStatus.textContent = '';
      _els.parseStatus.className = 'rtm__parse-status';
      return;
    }

    var parsed = parseContextOutput(text);
    if (parsed) {
      update({
        contextWindow: parsed.contextWindow,
        tokens: parsed.tokens,
      });
      _els.parseStatus.textContent = '\u2713 Parsed: ' + formatNumber(parsed.total) + ' tokens (' + parsed.percent.toFixed(1) + '%)';
      _els.parseStatus.className = 'rtm__parse-status rtm__parse-status--ok';
    } else {
      _els.parseStatus.textContent = '\u2717 Could not parse the input. Check format.';
      _els.parseStatus.className = 'rtm__parse-status rtm__parse-status--err';
    }
  }

  // ---- WebSocket Simulation ----

  /**
   * Start a simulated real-time data stream that updates every second.
   * Tokens gradually increase with randomized fluctuations.
   */
  function startSimulation() {
    if (_simTimer) return;

    _els.btnSim.textContent = '\u25A0 Stop';
    _els.btnSim.classList.add('active');

    // Initialize simulation base values if currently empty
    if (_data.tokens.system === 0 && _data.tokens.user === 0) {
      _data.tokens = { system: 4000, user: 8000, assistant: 12000, tools: 2000 };
      _data.contextWindow = 200000;
    }

    _simTimer = setInterval(function () {
      // Simulate token growth with some randomness
      var tokens = Object.assign({}, _data.tokens);

      tokens.system += Math.round(Math.random() * 50 + 10);
      tokens.user += Math.round(Math.random() * 200 + 50);
      tokens.assistant += Math.round(Math.random() * 350 + 100);
      tokens.tools += Math.round(Math.random() * 80 + 20);

      // Occasional "tool call" bursts
      if (Math.random() < 0.1) {
        tokens.tools += Math.round(Math.random() * 2000 + 500);
      }

      // Cap at context window
      var total = tokens.system + tokens.user + tokens.assistant + tokens.tools;
      if (total >= _data.contextWindow) {
        // Simulate context window reset/summarization
        tokens.system = Math.round(tokens.system * 0.3);
        tokens.user = Math.round(tokens.user * 0.2);
        tokens.assistant = Math.round(tokens.assistant * 0.2);
        tokens.tools = Math.round(tokens.tools * 0.1);
      }

      update({ tokens: tokens });
    }, SIMULATION_INTERVAL);
  }

  /**
   * Stop the simulation.
   */
  function stopSimulation() {
    if (_simTimer) {
      clearInterval(_simTimer);
      _simTimer = null;
    }
    if (_els.btnSim) {
      _els.btnSim.textContent = '\u25B6 Simulate';
      _els.btnSim.classList.remove('active');
    }
  }

  /**
   * Toggle simulation on/off.
   */
  function toggleSimulation() {
    if (_simTimer) {
      stopSimulation();
    } else {
      startSimulation();
    }
  }

  /**
   * Reset all data and redraw.
   */
  function resetData() {
    stopSimulation();
    _data.tokens = { system: 0, user: 0, assistant: 0, tools: 0 };
    _data.percent = 0;
    _data.history = [];
    _data.rateTokensPerMin = 0;
    _data.predictedMinutes = Infinity;
    _anim.currentPercent = 0;
    _anim.targetPercent = 0;
    _anim.currentBars = { system: 0, user: 0, assistant: 0, tools: 0 };
    _anim.targetBars = { system: 0, user: 0, assistant: 0, tools: 0 };
    if (_els.textarea) _els.textarea.value = '';
    if (_els.parseStatus) {
      _els.parseStatus.textContent = '';
      _els.parseStatus.className = 'rtm__parse-status';
    }
    update({ tokens: _data.tokens });
  }

  // ---- Public API ----

  /**
   * Initialize the Realtime Monitor inside a container element.
   * @param {string} containerId - The ID of the container element.
   */
  function init(containerId) {
    if (_inited) {
      console.warn('RealtimeMonitor: already initialized');
      return;
    }

    if (!buildDOM(containerId)) return;

    _inited = true;

    // Initial draw
    drawRing(0);
    drawSparkline();
  }

  // Expose public API
  window.RealtimeMonitor = {
    init: init,
    update: update,
    isInited: function () { return _inited; },
    startSimulation: startSimulation,
    stopSimulation: stopSimulation,
    parseContextOutput: parseContextOutput,
  };

})();
