/**
 * Claude Context Window Visualizer — Context Pressure Vessel
 * A "pressure vessel" metaphor visualization showing context usage
 * as pressure building in a container with animated liquid, bubbles,
 * sine-wave surface, PSI dial, and multi-level warning system.
 *
 * API:  window.ContextPressure = { init, update, isInited }
 */

window.ContextPressure = (function () {
  'use strict';

  // ===========================================================
  //  CONSTANTS
  // ===========================================================

  var VESSEL_W = 400;
  var VESSEL_H = 300;
  var VESSEL_RX = 24;
  var VESSEL_PADDING = 16;
  var VESSEL_INNER_X = VESSEL_PADDING;
  var VESSEL_INNER_Y = VESSEL_PADDING;
  var VESSEL_INNER_W = VESSEL_W - VESSEL_PADDING * 2;
  var VESSEL_INNER_H = VESSEL_H - VESSEL_PADDING * 2;

  var DIAL_SIZE = 150;
  var DIAL_CX = DIAL_SIZE / 2;
  var DIAL_CY = DIAL_SIZE / 2 + 10;
  var DIAL_RADIUS = 55;

  var MAX_BUBBLES = 30;
  var BUBBLE_MIN_SIZE = 3;
  var BUBBLE_MAX_SIZE = 8;

  var WAVE_SEGMENTS = 40;
  var WAVE_SPEED_1 = 0.0025;
  var WAVE_SPEED_2 = 0.0018;

  var COLOR_BLUE = '#3B82F6';
  var COLOR_AMBER = '#F59E0B';
  var COLOR_RED = '#EF4444';
  var COLOR_GREEN = '#22C55E';

  var THRESHOLD_AMBER = 60;
  var THRESHOLD_RED = 85;

  var ALL_CATS = ['system', 'user', 'assistant', 'tools'];

  // ===========================================================
  //  STATE
  // ===========================================================

  var _inited = false;
  var _containerId = '';
  var _container = null;
  var _rafId = null;
  var _time = 0;
  var _visible = true;
  var _observer = null;

  // Current data
  var _percent = 0;
  var _targetPercent = 0;
  var _totalUsed = 0;
  var _remaining = 0;
  var _contextWindow = 0;
  var _fillRateHistory = [];
  var _lastUpdateTime = 0;
  var _fillRatePerSec = 0;

  // Bubbles
  var _bubbles = [];

  // Needle animation
  var _needleAngle = 0;
  var _targetNeedleAngle = 0;
  var _needleVelocity = 0;

  // DOM references
  var _els = {
    vesselSvg: null,
    liquidPath: null,
    wavePath1: null,
    wavePath2: null,
    bubbleGroup: null,
    vesselBorder: null,
    vesselGlow: null,
    vesselLabel: null,
    dialSvg: null,
    dialNeedle: null,
    dialReadout: null,
    warningOverlay: null,
    warningText: null,
    warningLights: null,
    statUsed: null,
    statRemaining: null,
    statRate: null,
    statEta: null
  };

  // ===========================================================
  //  HELPERS
  // ===========================================================

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function formatTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function getPressureColor(pct) {
    if (pct >= THRESHOLD_RED) return COLOR_RED;
    if (pct >= THRESHOLD_AMBER) return COLOR_AMBER;
    return COLOR_BLUE;
  }

  function getDialZoneColor(pct) {
    if (pct >= THRESHOLD_RED) return COLOR_RED;
    if (pct >= THRESHOLD_AMBER) return COLOR_AMBER;
    return COLOR_GREEN;
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
      }
    }
    return el;
  }

  function divEl(cls, text) {
    var el = document.createElement('div');
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  // ===========================================================
  //  STYLE INJECTION
  // ===========================================================

  var _stylesInjected = false;

  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;

    var css = [
      '.cp-wrap{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;justify-content:center;padding:12px 0}',
      '.cp-vessel-col{position:relative}',
      '.cp-dial-col{display:flex;flex-direction:column;align-items:center;gap:8px}',

      /* Vessel glow effects */
      '.cp-vessel-glow{filter:none;transition:filter .6s ease}',
      '.cp-vessel-glow--amber{filter:drop-shadow(0 0 12px rgba(245,158,11,.55))}',
      '.cp-vessel-glow--red{filter:drop-shadow(0 0 16px rgba(239,68,68,.65))}',
      '.cp-vessel-glow--critical{animation:cp-pulse-border 0.6s ease-in-out infinite alternate}',

      '@keyframes cp-pulse-border{0%{filter:drop-shadow(0 0 10px rgba(239,68,68,.4))}100%{filter:drop-shadow(0 0 24px rgba(239,68,68,.9))}}',

      /* Warning overlay */
      '.cp-warning{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .4s ease}',
      '.cp-warning--active{opacity:1}',
      '.cp-warning__text{font-weight:700;font-size:14px;letter-spacing:1px;padding:6px 14px;border-radius:6px;text-transform:uppercase;background:rgba(239,68,68,.15);color:#EF4444;border:2px solid #EF4444;animation:cp-flash 0.8s ease-in-out infinite alternate}',
      '@keyframes cp-flash{0%{opacity:.6}100%{opacity:1}}',

      /* Warning lights */
      '.cp-lights{display:none;position:absolute;top:-6px;right:-6px}',
      '.cp-lights--active{display:block}',
      '.cp-lights__beacon{width:16px;height:16px;border-radius:50%;background:#EF4444;animation:cp-beacon 0.4s linear infinite alternate}',
      '@keyframes cp-beacon{0%{opacity:.3;transform:scale(.8)}100%{opacity:1;transform:scale(1.2)}}',

      /* Shake for critical */
      '.cp-shake{animation:cp-shake-anim 0.15s linear infinite}',
      '@keyframes cp-shake-anim{0%{transform:translateX(0)}25%{transform:translateX(-2px)}50%{transform:translateX(2px)}75%{transform:translateX(-1px)}100%{transform:translateX(0)}}',

      /* Stats bar */
      '.cp-stats{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:12px;width:100%}',
      '.cp-stat{display:flex;align-items:center;gap:6px;font-size:13px;padding:6px 10px;border-radius:8px;background:var(--card-bg,#1E293B);border:1px solid var(--card-border,#334155)}',
      '.cp-stat__icon{font-size:16px;opacity:.7;flex-shrink:0}',
      '.cp-stat__label{opacity:.6;font-size:11px;text-transform:uppercase;letter-spacing:.5px}',
      '.cp-stat__value{font-weight:600;font-variant-numeric:tabular-nums}',
      '.cp-stat__body{display:flex;flex-direction:column}',

      /* Dial readout */
      '.cp-dial-readout{font-family:monospace;font-size:22px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums}',

      /* Dark/light theme vessel adjustments */
      '[data-theme="light"] .cp-stat{background:#F1F5F9;border-color:#CBD5E1}',
      '[data-theme="light"] .cp-warning__text{background:rgba(239,68,68,.1)}'
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'cp-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ===========================================================
  //  BUILD DOM
  // ===========================================================

  function _buildAll() {
    _injectStyles();

    var wrap = divEl('cp-wrap');

    // --- Vessel column ---
    var vesselCol = divEl('cp-vessel-col');
    _buildVesselSvg(vesselCol);
    _buildWarningOverlay(vesselCol);
    _buildWarningLights(vesselCol);
    wrap.appendChild(vesselCol);

    // --- Dial column ---
    var dialCol = divEl('cp-dial-col');
    _buildDialSvg(dialCol);
    _buildDialReadout(dialCol);
    wrap.appendChild(dialCol);

    _container.appendChild(wrap);

    // --- Stats bar ---
    _buildStatsBar();
  }

  // ===========================================================
  //  VESSEL SVG
  // ===========================================================

  function _buildVesselSvg(parent) {
    var svg = svgEl('svg', {
      width: VESSEL_W,
      height: VESSEL_H,
      viewBox: '0 0 ' + VESSEL_W + ' ' + VESSEL_H,
      role: 'img',
      'aria-label': 'Context pressure at 0 percent'
    });
    svg.classList.add('cp-vessel-glow');
    _els.vesselSvg = svg;

    // Defs: gradients
    var defs = svgEl('defs');

    // Metallic border gradient
    var borderGrad = svgEl('linearGradient', { id: 'cp-border-grad', x1: '0', y1: '0', x2: '1', y2: '1' });
    var stops = [
      { offset: '0%', color: '#94A3B8' },
      { offset: '30%', color: '#E2E8F0' },
      { offset: '50%', color: '#CBD5E1' },
      { offset: '70%', color: '#E2E8F0' },
      { offset: '100%', color: '#94A3B8' }
    ];
    for (var i = 0; i < stops.length; i++) {
      var s = svgEl('stop', { offset: stops[i].offset, 'stop-color': stops[i].color });
      borderGrad.appendChild(s);
    }
    defs.appendChild(borderGrad);

    // Liquid gradient (will be updated dynamically)
    var liquidGrad = svgEl('linearGradient', { id: 'cp-liquid-grad', x1: '0', y1: '0', x2: '0', y2: '1' });
    var lStop1 = svgEl('stop', { offset: '0%', 'stop-color': COLOR_BLUE, 'stop-opacity': '0.7' });
    var lStop2 = svgEl('stop', { offset: '100%', 'stop-color': COLOR_BLUE, 'stop-opacity': '0.95' });
    liquidGrad.appendChild(lStop1);
    liquidGrad.appendChild(lStop2);
    defs.appendChild(liquidGrad);

    // Glass highlight
    var glassGrad = svgEl('linearGradient', { id: 'cp-glass-grad', x1: '0', y1: '0', x2: '0.3', y2: '1' });
    var gS1 = svgEl('stop', { offset: '0%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.15' });
    var gS2 = svgEl('stop', { offset: '100%', 'stop-color': '#FFFFFF', 'stop-opacity': '0.02' });
    glassGrad.appendChild(gS1);
    glassGrad.appendChild(gS2);
    defs.appendChild(glassGrad);

    // Clip path for liquid inside vessel
    var clipPath = svgEl('clipPath', { id: 'cp-vessel-clip' });
    var clipRect = svgEl('rect', {
      x: VESSEL_INNER_X + 3,
      y: VESSEL_INNER_Y + 3,
      width: VESSEL_INNER_W - 6,
      height: VESSEL_INNER_H - 6,
      rx: VESSEL_RX - 4
    });
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);

    svg.appendChild(defs);

    // Vessel body (background)
    var vesselBg = svgEl('rect', {
      x: VESSEL_INNER_X,
      y: VESSEL_INNER_Y,
      width: VESSEL_INNER_W,
      height: VESSEL_INNER_H,
      rx: VESSEL_RX,
      fill: '#0F172A',
      'fill-opacity': '0.6'
    });
    svg.appendChild(vesselBg);

    // Liquid fill path (clipped)
    var liquidGroup = svgEl('g', { 'clip-path': 'url(#cp-vessel-clip)' });
    var liquidPath = svgEl('path', {
      d: '',
      fill: 'url(#cp-liquid-grad)'
    });
    _els.liquidPath = liquidPath;
    liquidGroup.appendChild(liquidPath);

    // Wave paths (two overlapping for realism)
    var wavePath1 = svgEl('path', {
      d: '',
      fill: 'url(#cp-liquid-grad)',
      'fill-opacity': '0.5'
    });
    _els.wavePath1 = wavePath1;
    liquidGroup.appendChild(wavePath1);

    var wavePath2 = svgEl('path', {
      d: '',
      fill: 'url(#cp-liquid-grad)',
      'fill-opacity': '0.3'
    });
    _els.wavePath2 = wavePath2;
    liquidGroup.appendChild(wavePath2);

    // Bubble group
    var bubbleGroup = svgEl('g', { 'aria-hidden': 'true' });
    _els.bubbleGroup = bubbleGroup;
    liquidGroup.appendChild(bubbleGroup);

    svg.appendChild(liquidGroup);

    // Glass overlay
    var glassOverlay = svgEl('rect', {
      x: VESSEL_INNER_X,
      y: VESSEL_INNER_Y,
      width: VESSEL_INNER_W,
      height: VESSEL_INNER_H,
      rx: VESSEL_RX,
      fill: 'url(#cp-glass-grad)',
      'pointer-events': 'none'
    });
    svg.appendChild(glassOverlay);

    // Vessel border (metallic)
    var vesselBorder = svgEl('rect', {
      x: VESSEL_INNER_X,
      y: VESSEL_INNER_Y,
      width: VESSEL_INNER_W,
      height: VESSEL_INNER_H,
      rx: VESSEL_RX,
      fill: 'none',
      stroke: 'url(#cp-border-grad)',
      'stroke-width': '3'
    });
    _els.vesselBorder = vesselBorder;
    svg.appendChild(vesselBorder);

    // Tick marks on vessel side (every 25%)
    for (var t = 0; t <= 4; t++) {
      var tickY = VESSEL_INNER_Y + VESSEL_INNER_H - (t / 4) * VESSEL_INNER_H;
      var tick = svgEl('line', {
        x1: VESSEL_INNER_X + VESSEL_INNER_W - 2,
        y1: tickY,
        x2: VESSEL_INNER_X + VESSEL_INNER_W + 8,
        y2: tickY,
        stroke: '#94A3B8',
        'stroke-width': '1.5',
        'stroke-linecap': 'round'
      });
      svg.appendChild(tick);
      if (t > 0) {
        var tickLabel = svgEl('text', {
          x: VESSEL_INNER_X + VESSEL_INNER_W + 12,
          y: tickY + 4,
          fill: '#94A3B8',
          'font-size': '10',
          'font-family': 'system-ui, sans-serif'
        });
        tickLabel.textContent = (t * 25) + '%';
        svg.appendChild(tickLabel);
      }
    }

    parent.appendChild(svg);
  }

  // ===========================================================
  //  WARNING OVERLAY & LIGHTS
  // ===========================================================

  function _buildWarningOverlay(parent) {
    var overlay = divEl('cp-warning');
    overlay.setAttribute('role', 'alert');
    overlay.setAttribute('aria-live', 'assertive');
    var text = divEl('cp-warning__text');
    text.textContent = '';
    overlay.appendChild(text);
    _els.warningOverlay = overlay;
    _els.warningText = text;
    parent.appendChild(overlay);
  }

  function _buildWarningLights(parent) {
    var lights = divEl('cp-lights');
    var beacon = divEl('cp-lights__beacon');
    lights.appendChild(beacon);
    _els.warningLights = lights;
    parent.appendChild(lights);
  }

  // ===========================================================
  //  PSI DIAL
  // ===========================================================

  function _buildDialSvg(parent) {
    var svg = svgEl('svg', {
      width: DIAL_SIZE,
      height: DIAL_SIZE,
      viewBox: '0 0 ' + DIAL_SIZE + ' ' + DIAL_SIZE
    });
    _els.dialSvg = svg;

    // Arc zones: green, amber, red
    var zones = [
      { start: 0, end: THRESHOLD_AMBER, color: COLOR_GREEN },
      { start: THRESHOLD_AMBER, end: THRESHOLD_RED, color: COLOR_AMBER },
      { start: THRESHOLD_RED, end: 100, color: COLOR_RED }
    ];

    for (var z = 0; z < zones.length; z++) {
      var zone = zones[z];
      var startAngle = _psiToAngle(zone.start);
      var endAngle = _psiToAngle(zone.end);
      var arc = _describeArc(DIAL_CX, DIAL_CY, DIAL_RADIUS, startAngle, endAngle);
      var arcPath = svgEl('path', {
        d: arc,
        fill: 'none',
        stroke: zone.color,
        'stroke-width': '10',
        'stroke-opacity': '0.3',
        'stroke-linecap': 'butt'
      });
      svg.appendChild(arcPath);
    }

    // Outer rim
    var rim = _describeArc(DIAL_CX, DIAL_CY, DIAL_RADIUS + 7, _psiToAngle(0), _psiToAngle(100));
    var rimPath = svgEl('path', {
      d: rim,
      fill: 'none',
      stroke: '#475569',
      'stroke-width': '2'
    });
    svg.appendChild(rimPath);

    // Tick marks
    var tickValues = [0, 25, 50, 75, 100];
    for (var t = 0; t < tickValues.length; t++) {
      var angle = _psiToAngle(tickValues[t]);
      var rOuter = DIAL_RADIUS + 7;
      var rInner = DIAL_RADIUS - 6;
      var rLabel = DIAL_RADIUS + 20;

      var rad = (angle * Math.PI) / 180;
      var x1 = DIAL_CX + rInner * Math.cos(rad);
      var y1 = DIAL_CY + rInner * Math.sin(rad);
      var x2 = DIAL_CX + rOuter * Math.cos(rad);
      var y2 = DIAL_CY + rOuter * Math.sin(rad);

      var tickLine = svgEl('line', {
        x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: '#94A3B8',
        'stroke-width': '2',
        'stroke-linecap': 'round'
      });
      svg.appendChild(tickLine);

      var lx = DIAL_CX + rLabel * Math.cos(rad);
      var ly = DIAL_CY + rLabel * Math.sin(rad);
      var label = svgEl('text', {
        x: lx,
        y: ly + 3,
        fill: '#94A3B8',
        'font-size': '10',
        'font-family': 'system-ui, sans-serif',
        'text-anchor': 'middle'
      });
      label.textContent = tickValues[t];
      svg.appendChild(label);
    }

    // Center pivot
    var pivot = svgEl('circle', {
      cx: DIAL_CX,
      cy: DIAL_CY,
      r: 5,
      fill: '#475569'
    });
    svg.appendChild(pivot);

    // Needle
    var needle = svgEl('line', {
      x1: DIAL_CX,
      y1: DIAL_CY,
      x2: DIAL_CX,
      y2: DIAL_CY - DIAL_RADIUS + 4,
      stroke: '#EF4444',
      'stroke-width': '2.5',
      'stroke-linecap': 'round'
    });
    _els.dialNeedle = needle;
    svg.appendChild(needle);

    // Needle cap
    var cap = svgEl('circle', {
      cx: DIAL_CX,
      cy: DIAL_CY,
      r: 3,
      fill: '#EF4444'
    });
    svg.appendChild(cap);

    parent.appendChild(svg);
  }

  function _buildDialReadout(parent) {
    var readout = divEl('cp-dial-readout');
    readout.setAttribute('aria-live', 'polite');
    readout.setAttribute('aria-atomic', 'true');
    readout.textContent = '0.0 PSI';
    _els.dialReadout = readout;
    parent.appendChild(readout);
  }

  /** Map 0-100 PSI to arc angle. Gauge spans from 225° to 315° (semi-circle at bottom). */
  function _psiToAngle(psi) {
    return 225 - (psi / 100) * 270;
  }

  function _describeArc(cx, cy, r, startAngle, endAngle) {
    var s = (startAngle * Math.PI) / 180;
    var e = (endAngle * Math.PI) / 180;
    var sx = cx + r * Math.cos(s);
    var sy = cy - r * Math.sin(s);
    var ex = cx + r * Math.cos(e);
    var ey = cy - r * Math.sin(e);
    var diff = startAngle - endAngle;
    var largeArc = Math.abs(diff) > 180 ? 1 : 0;
    // sweep-flag: 0 because we go from larger angle to smaller
    return 'M ' + sx + ' ' + sy + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 0 ' + ex + ' ' + ey;
  }

  // ===========================================================
  //  STATS BAR
  // ===========================================================

  function _buildStatsBar() {
    var bar = divEl('cp-stats');

    _els.statUsed = _buildStat(bar, '\u{1F4CA}', 'Total Used', '0');
    _els.statRemaining = _buildStat(bar, '\u{1F4E6}', 'Remaining', '0');
    _els.statRate = _buildStat(bar, '\u26A1', 'Fill Rate', '0/s');
    _els.statEta = _buildStat(bar, '\u23F1', 'Est. Full', '--');

    _container.appendChild(bar);
  }

  function _buildStat(parent, icon, label, value) {
    var stat = divEl('cp-stat');
    var iconEl = divEl('cp-stat__icon', icon);
    var body = divEl('cp-stat__body');
    var labelEl = divEl('cp-stat__label', label);
    var valueEl = divEl('cp-stat__value', value);
    body.appendChild(valueEl);
    body.appendChild(labelEl);
    stat.appendChild(iconEl);
    stat.appendChild(body);
    parent.appendChild(stat);
    return valueEl;
  }

  // ===========================================================
  //  ANIMATION LOOP
  // ===========================================================

  function _startLoop() {
    if (_rafId) return;
    _time = performance.now();
    _tick();
  }

  function _stopLoop() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
  }

  function _tick() {
    _rafId = requestAnimationFrame(_tick);

    var now = performance.now();
    var dt = now - _time;
    _time = now;

    if (!_visible) return;

    // Smoothly approach target percent
    _percent = lerp(_percent, _targetPercent, clamp(dt * 0.004, 0, 1));

    _updateLiquid(now);
    _updateBubbles(dt);
    _updateNeedle(dt);
    _updateWarnings();
  }

  // ===========================================================
  //  LIQUID & WAVES
  // ===========================================================

  function _updateLiquid(now) {
    var fillFrac = clamp(_percent / 100, 0, 1);

    var left = VESSEL_INNER_X + 3;
    var right = VESSEL_INNER_X + VESSEL_INNER_W - 3;
    var bottom = VESSEL_INNER_Y + VESSEL_INNER_H - 3;
    var top = VESSEL_INNER_Y + 3;
    var fillHeight = (bottom - top) * fillFrac;
    var waterY = bottom - fillHeight;

    // Wave amplitude — less room at high fill
    var amp = Math.max(1, 8 * (1 - fillFrac * 0.8));
    var width = right - left;

    // Main liquid body path (with wave on top)
    var d = _wavePath(left, right, waterY, amp, now * WAVE_SPEED_1, 0);
    d += ' L ' + right + ',' + bottom + ' L ' + left + ',' + bottom + ' Z';
    _els.liquidPath.setAttribute('d', d);

    // Second wave overlay (slightly offset)
    var d2 = _wavePath(left, right, waterY - 1, amp * 0.6, now * WAVE_SPEED_2, 2.5);
    d2 += ' L ' + right + ',' + bottom + ' L ' + left + ',' + bottom + ' Z';
    _els.wavePath1.setAttribute('d', d2);

    // Third wave for extra depth
    var d3 = _wavePath(left, right, waterY + 1, amp * 0.4, now * WAVE_SPEED_1 * 0.7, 5.0);
    d3 += ' L ' + right + ',' + bottom + ' L ' + left + ',' + bottom + ' Z';
    _els.wavePath2.setAttribute('d', d3);

    // Update liquid color based on pressure
    _updateLiquidColor();

    // Update vessel ARIA label
    _els.vesselSvg.setAttribute('aria-label',
      'Context pressure at ' + Math.round(_percent) + ' percent');
  }

  function _wavePath(left, right, baseY, amplitude, timeOffset, phaseOffset) {
    var width = right - left;
    var segW = width / WAVE_SEGMENTS;
    var d = 'M ' + left + ',' + baseY;
    for (var i = 1; i <= WAVE_SEGMENTS; i++) {
      var x = left + i * segW;
      var wave = Math.sin((i / WAVE_SEGMENTS) * Math.PI * 4 + timeOffset + phaseOffset) * amplitude;
      var y = baseY + wave;
      if (i === 1) {
        var cpx = left + segW * 0.5;
        d += ' Q ' + cpx + ',' + (baseY + wave * 0.5) + ' ' + x + ',' + y;
      } else {
        var prevX = left + (i - 1) * segW;
        var prevWave = Math.sin(((i - 1) / WAVE_SEGMENTS) * Math.PI * 4 + timeOffset + phaseOffset) * amplitude;
        var prevY = baseY + prevWave;
        var cx1 = prevX + segW * 0.4;
        var cx2 = x - segW * 0.4;
        d += ' C ' + cx1 + ',' + prevY + ' ' + cx2 + ',' + y + ' ' + x + ',' + y;
      }
    }
    return d;
  }

  function _updateLiquidColor() {
    var grad = _els.vesselSvg.querySelector('#cp-liquid-grad');
    if (!grad) return;
    var stops = grad.querySelectorAll('stop');
    var color = getPressureColor(_percent);
    if (stops.length >= 2) {
      stops[0].setAttribute('stop-color', color);
      stops[1].setAttribute('stop-color', color);
    }
  }

  // ===========================================================
  //  BUBBLES
  // ===========================================================

  function _updateBubbles(dt) {
    var fillFrac = clamp(_percent / 100, 0, 1);
    if (fillFrac < 0.02) {
      // No liquid — no bubbles
      _clearBubbles();
      return;
    }

    var left = VESSEL_INNER_X + 8;
    var right = VESSEL_INNER_X + VESSEL_INNER_W - 8;
    var bottom = VESSEL_INNER_Y + VESSEL_INNER_H - 6;
    var top = VESSEL_INNER_Y + 6;
    var waterTop = bottom - (bottom - top) * fillFrac;

    // Spawn rate increases with pressure
    var targetCount = Math.floor(clamp(fillFrac * MAX_BUBBLES, 2, MAX_BUBBLES));
    var speedMult = 0.5 + fillFrac * 2.0;

    // Spawn new bubbles if needed
    while (_bubbles.length < targetCount) {
      _bubbles.push({
        x: left + Math.random() * (right - left),
        y: bottom - Math.random() * (bottom - waterTop) * 0.3,
        size: BUBBLE_MIN_SIZE + Math.random() * (BUBBLE_MAX_SIZE - BUBBLE_MIN_SIZE),
        speed: (0.02 + Math.random() * 0.04) * speedMult,
        opacity: 0.3 + Math.random() * 0.5,
        wobble: Math.random() * Math.PI * 2
      });
    }

    // Update positions
    for (var i = _bubbles.length - 1; i >= 0; i--) {
      var b = _bubbles[i];
      b.y -= b.speed * dt;
      b.wobble += dt * 0.003;
      b.x += Math.sin(b.wobble) * 0.3;

      // Remove if above water line or out of bounds
      if (b.y < waterTop - 5 || b.y < top) {
        _bubbles.splice(i, 1);
      }
    }

    // Render bubbles to SVG
    _renderBubbles();
  }

  function _renderBubbles() {
    var group = _els.bubbleGroup;
    // Reconcile: reuse existing circle elements
    var existing = group.childNodes;
    var i;

    // Remove excess
    while (existing.length > _bubbles.length) {
      group.removeChild(group.lastChild);
    }

    // Add missing
    while (existing.length < _bubbles.length) {
      var circle = svgEl('circle', { fill: '#FFFFFF' });
      group.appendChild(circle);
    }

    // Update all
    for (i = 0; i < _bubbles.length; i++) {
      var b = _bubbles[i];
      var el = existing[i];
      el.setAttribute('cx', b.x.toFixed(1));
      el.setAttribute('cy', b.y.toFixed(1));
      el.setAttribute('r', b.size.toFixed(1));
      el.setAttribute('fill-opacity', b.opacity.toFixed(2));
    }
  }

  function _clearBubbles() {
    _bubbles = [];
    var group = _els.bubbleGroup;
    while (group.firstChild) group.removeChild(group.firstChild);
  }

  // ===========================================================
  //  NEEDLE (spring easing)
  // ===========================================================

  function _updateNeedle(dt) {
    // Spring physics for needle
    var stiffness = 0.008;
    var damping = 0.12;

    _targetNeedleAngle = _psiToAngle(_percent);
    var diff = _targetNeedleAngle - _needleAngle;
    _needleVelocity += diff * stiffness * dt;
    _needleVelocity *= (1 - damping);
    _needleAngle += _needleVelocity;

    // Convert angle to needle endpoint
    var rad = (_needleAngle * Math.PI) / 180;
    var len = DIAL_RADIUS - 4;
    var tipX = DIAL_CX + len * Math.cos(rad);
    var tipY = DIAL_CY - len * Math.sin(rad);

    _els.dialNeedle.setAttribute('x2', tipX.toFixed(1));
    _els.dialNeedle.setAttribute('y2', tipY.toFixed(1));

    // Update readout
    _els.dialReadout.textContent = _percent.toFixed(1) + ' PSI';
    _els.dialReadout.style.color = getPressureColor(_percent);
  }

  // ===========================================================
  //  WARNINGS
  // ===========================================================

  function _updateWarnings() {
    var pct = _percent;
    var svg = _els.vesselSvg;
    var overlay = _els.warningOverlay;
    var lights = _els.warningLights;
    var vesselCol = svg.parentElement;

    // Clear all states
    svg.classList.remove('cp-vessel-glow--amber', 'cp-vessel-glow--red', 'cp-vessel-glow--critical');
    overlay.classList.remove('cp-warning--active');
    lights.classList.remove('cp-lights--active');
    if (vesselCol) vesselCol.classList.remove('cp-shake');
    _els.warningText.textContent = '';

    if (pct > 95) {
      // CRITICAL — full klaxon
      svg.classList.add('cp-vessel-glow--critical');
      overlay.classList.add('cp-warning--active');
      _els.warningText.textContent = 'PRESSURE CRITICAL \u2014 Context at ' + Math.round(pct) + '%!';
      lights.classList.add('cp-lights--active');
      if (vesselCol) vesselCol.classList.add('cp-shake');
    } else if (pct > 90) {
      // Red pulse + CRITICAL label
      svg.classList.add('cp-vessel-glow--critical');
      overlay.classList.add('cp-warning--active');
      _els.warningText.textContent = 'CRITICAL \u2014 ' + Math.round(pct) + '%';
    } else if (pct > 80) {
      // Amber glow
      svg.classList.add('cp-vessel-glow--amber');
    }
  }

  // ===========================================================
  //  STATS
  // ===========================================================

  function _updateStats() {
    _els.statUsed.textContent = formatTokens(_totalUsed);
    _els.statRemaining.textContent = formatTokens(_remaining);
    _els.statRate.textContent = formatTokens(Math.round(_fillRatePerSec)) + '/s';

    // Estimated time to full
    if (_fillRatePerSec > 0 && _remaining > 0) {
      var secsLeft = _remaining / _fillRatePerSec;
      if (secsLeft < 60) {
        _els.statEta.textContent = Math.round(secsLeft) + 's';
      } else if (secsLeft < 3600) {
        _els.statEta.textContent = Math.round(secsLeft / 60) + 'm';
      } else {
        _els.statEta.textContent = (secsLeft / 3600).toFixed(1) + 'h';
      }
    } else {
      _els.statEta.textContent = '--';
    }
  }

  // ===========================================================
  //  VISIBILITY (IntersectionObserver)
  // ===========================================================

  function _setupVisibility() {
    if (!_container) return;

    if (typeof IntersectionObserver !== 'undefined') {
      _observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          _visible = entries[i].isIntersecting;
        }
      }, { threshold: 0.1 });
      _observer.observe(_container);
    }
  }

  // ===========================================================
  //  FILL RATE TRACKING
  // ===========================================================

  function _trackFillRate(total) {
    var now = Date.now();
    if (_lastUpdateTime > 0) {
      var elapsed = (now - _lastUpdateTime) / 1000;
      if (elapsed > 0.1 && elapsed < 30) {
        var delta = total - _totalUsed;
        if (delta > 0) {
          var rate = delta / elapsed;
          _fillRateHistory.push(rate);
          if (_fillRateHistory.length > 10) _fillRateHistory.shift();

          // Smoothed moving average
          var sum = 0;
          for (var i = 0; i < _fillRateHistory.length; i++) sum += _fillRateHistory[i];
          _fillRatePerSec = sum / _fillRateHistory.length;
        }
      }
    }
    _lastUpdateTime = now;
  }

  // ===========================================================
  //  PUBLIC API
  // ===========================================================

  /**
   * Initialize the pressure vessel visualization.
   * @param {string} containerId - DOM id of the container element.
   */
  function init(containerId) {
    if (_inited) return;
    _containerId = containerId;
    _container = document.getElementById(containerId);
    if (!_container) {
      console.warn('ContextPressure: container "' + containerId + '" not found');
      return;
    }

    _inited = true;
    _buildAll();
    _setupVisibility();
    _startLoop();
  }

  /**
   * Update with current token data.
   * @param {{ system: number, user: number, assistant: number, tools: number }} tokens
   * @param {{ contextWindow: number }} contextWindow - Model object or { contextWindow: N }.
   */
  function update(tokens, contextWindow) {
    if (!_inited) return;

    var total = 0;
    for (var i = 0; i < ALL_CATS.length; i++) {
      total += (tokens[ALL_CATS[i]] || 0);
    }

    var cw = (typeof contextWindow === 'object')
      ? (contextWindow.contextWindow || 0)
      : (contextWindow || 0);

    _trackFillRate(total);

    _totalUsed = total;
    _contextWindow = cw;
    _remaining = Math.max(0, cw - total);
    _targetPercent = cw > 0 ? clamp((total / cw) * 100, 0, 100) : 0;

    _updateStats();
  }

  /**
   * Clean up: stop animation loop, disconnect observer.
   */
  function destroy() {
    _stopLoop();
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
    _inited = false;
  }

  return {
    init: init,
    update: update,
    destroy: destroy,
    isInited: function () { return _inited; }
  };
})();
