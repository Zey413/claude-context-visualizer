/**
 * context-ring.js
 * Pseudo-3D ring visualization of context window usage.
 * Pure CSS 3D transforms, zero dependencies.
 */
window.ContextRing = (function () {
  'use strict';

  /* ── state ────────────────────────────────────────────── */
  var _inited = false;
  var _containerId = '';
  var _container = null;
  var _ringEl = null;
  var _rafId = null;

  var SLICE_COUNT = 36;
  var DEG_PER_SLICE = 360 / SLICE_COUNT;
  var TRANSLATE_Z = 120;
  var SLICE_WIDTH = 22;
  var MIN_HEIGHT = 40;
  var MAX_EXTRA = 80;
  var ROTATION_PERIOD = 20000; // ms per full revolution
  var TRANSITION_MS = 300;

  var CATEGORIES = [
    { key: 'system',    label: 'System',    color: '#8B5CF6' },
    { key: 'user',      label: 'User',      color: '#3B82F6' },
    { key: 'assistant', label: 'Assistant',  color: '#10B981' },
    { key: 'tools',     label: 'Tools',     color: '#F59E0B' }
  ];
  var REMAINING_COLOR = '#1E1B2E';
  var REMAINING_COLOR_LIGHT = '#D1D5DB';

  /* rotation tracking */
  var _autoAngle = 0;
  var _dragOffset = 0;
  var _currentAngle = 0;
  var _paused = false;
  var _dragging = false;
  var _dragStartX = 0;
  var _dragBaseOffset = 0;
  var _lastTimestamp = 0;

  /* cached data */
  var _sliceEls = [];
  var _labelEls = [];
  var _statEls = {};
  var _legendPercentEl = null;
  var _srSummaryEl = null;
  var _lastTokens = null;
  var _lastContext = 0;

  /* ── helpers ──────────────────────────────────────────── */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') { node.className = attrs[k]; }
        else if (k === 'textContent') { node.textContent = attrs[k]; }
        else if (k === 'innerHTML') { node.innerHTML = attrs[k]; }
        else if (k.indexOf('data') === 0) { node.setAttribute(k.replace(/([A-Z])/g, '-$1').toLowerCase(), attrs[k]); }
        else { node.setAttribute(k, attrs[k]); }
      });
    }
    if (children) {
      children.forEach(function (c) { if (c) node.appendChild(c); });
    }
    return node;
  }

  function pct(value, total) {
    if (!total) return 0;
    return Math.round((value / total) * 1000) / 10;
  }

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function isDarkTheme() {
    return document.documentElement.classList.contains('dark') ||
           document.body.classList.contains('dark-theme') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* ── style injection ─────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('context-ring-styles')) return;
    var css = [
      '.cr-root {',
      '  display: flex; flex-direction: column; align-items: center;',
      '  gap: 24px; padding: 16px; user-select: none;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '}',

      /* viewport */
      '.cr-viewport {',
      '  position: relative; width: 300px; height: 300px;',
      '  perspective: 800px; cursor: grab;',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '.cr-viewport:active { cursor: grabbing; }',
      '.cr-viewport:focus { outline: 2px solid #8B5CF6; outline-offset: 4px; border-radius: 8px; }',

      /* ring */
      '.cr-ring {',
      '  position: relative; width: 0; height: 0;',
      '  transform-style: preserve-3d;',
      '  will-change: transform;',
      '}',

      /* slices */
      '.cr-slice {',
      '  position: absolute;',
      '  width: ' + SLICE_WIDTH + 'px;',
      '  border-radius: 3px;',
      '  left: ' + (-SLICE_WIDTH / 2) + 'px;',
      '  transition: height ' + TRANSITION_MS + 'ms ease-out,',
      '              box-shadow ' + TRANSITION_MS + 'ms ease-out,',
      '              background-color ' + TRANSITION_MS + 'ms ease-out;',
      '  backface-visibility: visible;',
      '}',

      /* floating labels */
      '.cr-label {',
      '  position: absolute;',
      '  pointer-events: none;',
      '  white-space: nowrap;',
      '  font-size: 12px; font-weight: 600;',
      '  padding: 4px 10px; border-radius: 6px;',
      '  transition: opacity 200ms ease;',
      '  z-index: 10;',
      '}',
      '.cr-label-dark {',
      '  background: rgba(15,10,30,0.85); color: #e2e0f0;',
      '  border: 1px solid rgba(139,92,246,0.3);',
      '}',
      '.cr-label-light {',
      '  background: rgba(255,255,255,0.92); color: #1e1b2e;',
      '  border: 1px solid rgba(0,0,0,0.12);',
      '  box-shadow: 0 1px 4px rgba(0,0,0,0.08);',
      '}',
      '.cr-label-dot {',
      '  display: inline-block; width: 8px; height: 8px;',
      '  border-radius: 50%; margin-right: 6px; vertical-align: middle;',
      '}',

      /* legend */
      '.cr-legend {',
      '  display: flex; flex-wrap: wrap; gap: 16px;',
      '  justify-content: center; align-items: center;',
      '}',
      '.cr-legend-item {',
      '  display: flex; align-items: center; gap: 6px;',
      '  font-size: 13px;',
      '}',
      '.cr-legend-dot {',
      '  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;',
      '}',
      '.cr-legend-total {',
      '  font-size: 22px; font-weight: 700; letter-spacing: -0.5px;',
      '}',
      '.cr-legend-total-label {',
      '  font-size: 12px; opacity: 0.7; margin-top: 2px; text-align: center;',
      '}',

      /* stats */
      '.cr-stats {',
      '  display: grid; grid-template-columns: repeat(4, 1fr);',
      '  gap: 10px; width: 100%; max-width: 480px;',
      '}',
      '.cr-stat {',
      '  padding: 10px 12px; border-radius: 10px;',
      '  text-align: center; min-width: 0;',
      '}',
      '.cr-stat-dark { background: rgba(30,27,46,0.6); border: 1px solid rgba(255,255,255,0.06); }',
      '.cr-stat-light { background: #f3f4f6; border: 1px solid rgba(0,0,0,0.06); }',
      '.cr-stat-label {',
      '  font-size: 11px; opacity: 0.7; margin-bottom: 4px;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.cr-stat-value { font-size: 16px; font-weight: 700; }',
      '.cr-stat-pct { font-size: 11px; opacity: 0.6; margin-top: 2px; }',

      /* screen reader summary */
      '.cr-sr-only {',
      '  position: absolute; width: 1px; height: 1px;',
      '  padding: 0; margin: -1px; overflow: hidden;',
      '  clip: rect(0,0,0,0); white-space: nowrap; border: 0;',
      '}',

      /* responsive */
      '@media (max-width: 480px) {',
      '  .cr-stats { grid-template-columns: repeat(2, 1fr); }',
      '  .cr-viewport { width: 260px; height: 260px; }',
      '}'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.id = 'context-ring-styles';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  /* ── DOM construction ────────────────────────────────── */
  function buildDOM() {
    var dark = isDarkTheme();
    var root = el('div', { className: 'cr-root' });

    /* Viewport */
    var viewport = el('div', {
      className: 'cr-viewport',
      role: 'img',
      'aria-label': 'Context window usage 3D ring showing 0% used',
      tabindex: '0'
    });

    var ring = el('div', { className: 'cr-ring' });

    /* Build 36 slices */
    for (var i = 0; i < SLICE_COUNT; i++) {
      var deg = i * DEG_PER_SLICE;
      var slice = el('div', {
        className: 'cr-slice',
        'aria-hidden': 'true'
      });
      slice.style.height = MIN_HEIGHT + 'px';
      slice.style.top = (-MIN_HEIGHT / 2) + 'px';
      slice.style.transform = 'rotateY(' + deg + 'deg) translateZ(' + TRANSLATE_Z + 'px)';
      slice.style.backgroundColor = dark ? REMAINING_COLOR : REMAINING_COLOR_LIGHT;
      _sliceEls.push(slice);
      ring.appendChild(slice);
    }

    viewport.appendChild(ring);
    _ringEl = ring;

    /* Floating labels (one per category) */
    var labelPositions = [
      { x: 0,   y: -160 }, // top
      { x: 170, y: 0    }, // right
      { x: 0,   y: 160  }, // bottom
      { x: -170,y: 0    }  // left
    ];
    for (var c = 0; c < CATEGORIES.length; c++) {
      var cat = CATEGORIES[c];
      var lbl = el('div', {
        className: 'cr-label ' + (dark ? 'cr-label-dark' : 'cr-label-light')
      });
      lbl.innerHTML =
        '<span class="cr-label-dot" style="background:' + cat.color + '"></span>' +
        '<span class="cr-label-name">' + cat.label + '</span> ' +
        '<span class="cr-label-pct">0%</span> ' +
        '<span class="cr-label-count" style="opacity:0.6">(0)</span>';
      lbl.style.position = 'absolute';
      lbl.style.left = '50%';
      lbl.style.top = '50%';
      lbl.style.transform = 'translate(-50%,-50%) translate(' + labelPositions[c].x + 'px,' + labelPositions[c].y + 'px)';
      lbl.style.opacity = '0.9';
      _labelEls.push(lbl);
      viewport.appendChild(lbl);
    }

    root.appendChild(viewport);

    /* Legend section */
    var legendWrap = el('div', { style: 'text-align:center;' });
    var totalPctEl = el('div', { className: 'cr-legend-total', textContent: '0%' });
    var totalLabel = el('div', { className: 'cr-legend-total-label', textContent: 'Context Used' });
    _legendPercentEl = totalPctEl;
    legendWrap.appendChild(totalPctEl);
    legendWrap.appendChild(totalLabel);

    var legend = el('div', { className: 'cr-legend' });
    CATEGORIES.forEach(function (cat) {
      var dot = el('span', { className: 'cr-legend-dot' });
      dot.style.backgroundColor = cat.color;
      var item = el('div', { className: 'cr-legend-item' }, [
        dot,
        el('span', { textContent: cat.label })
      ]);
      legend.appendChild(item);
    });
    // remaining
    var remDot = el('span', { className: 'cr-legend-dot' });
    remDot.style.backgroundColor = dark ? REMAINING_COLOR : REMAINING_COLOR_LIGHT;
    legend.appendChild(el('div', { className: 'cr-legend-item' }, [
      remDot,
      el('span', { textContent: 'Remaining' })
    ]));

    root.appendChild(legendWrap);
    root.appendChild(legend);

    /* Stats row */
    var stats = el('div', { className: 'cr-stats' });
    CATEGORIES.forEach(function (cat) {
      var card = el('div', {
        className: 'cr-stat ' + (dark ? 'cr-stat-dark' : 'cr-stat-light')
      });
      var labelSpan = el('div', { className: 'cr-stat-label', textContent: cat.label });
      var valueSpan = el('div', { className: 'cr-stat-value', textContent: '0' });
      valueSpan.style.color = cat.color;
      var pctSpan = el('div', { className: 'cr-stat-pct', textContent: '0%' });
      card.appendChild(labelSpan);
      card.appendChild(valueSpan);
      card.appendChild(pctSpan);
      _statEls[cat.key] = { value: valueSpan, pct: pctSpan };
      stats.appendChild(card);
    });
    root.appendChild(stats);

    /* Screen-reader summary */
    var srSummary = el('div', {
      className: 'cr-sr-only',
      role: 'status',
      'aria-live': 'polite'
    });
    srSummary.textContent = 'Context window: no data loaded.';
    _srSummaryEl = srSummary;
    root.appendChild(srSummary);

    return root;
  }

  /* ── slice assignment ────────────────────────────────── */
  function computeSliceAssignment(tokens, contextWindow) {
    var assignments = [];
    var total = 0;
    var catSlices = [];

    CATEGORIES.forEach(function (cat) {
      var count = tokens[cat.key] || 0;
      total += count;
      var fraction = contextWindow > 0 ? count / contextWindow : 0;
      var numSlices = Math.round(fraction * SLICE_COUNT);
      catSlices.push({ key: cat.key, color: cat.color, count: count, fraction: fraction, slices: numSlices });
    });

    /* Adjust so we don't exceed SLICE_COUNT for used slices */
    var usedSlices = catSlices.reduce(function (s, c) { return s + c.slices; }, 0);
    /* Ensure at least 1 slice for any category with tokens, if there's room */
    catSlices.forEach(function (c) {
      if (c.count > 0 && c.slices === 0 && usedSlices < SLICE_COUNT) {
        c.slices = 1;
        usedSlices++;
      }
    });
    /* Trim if over */
    while (usedSlices > SLICE_COUNT) {
      var maxCat = catSlices.reduce(function (a, b) { return a.slices > b.slices ? a : b; });
      maxCat.slices--;
      usedSlices--;
    }

    /* Build ordered assignment array */
    var idx = 0;
    catSlices.forEach(function (c) {
      for (var s = 0; s < c.slices; s++) {
        assignments[idx] = {
          key: c.key,
          color: c.color,
          fraction: c.fraction,
          active: true
        };
        idx++;
      }
    });
    /* Fill remainder */
    while (idx < SLICE_COUNT) {
      assignments[idx] = {
        key: 'remaining',
        color: isDarkTheme() ? REMAINING_COLOR : REMAINING_COLOR_LIGHT,
        fraction: 0,
        active: false
      };
      idx++;
    }

    return { assignments: assignments, total: total, catSlices: catSlices };
  }

  /* ── update slices visual ────────────────────────────── */
  function applySliceVisuals(assignments, contextWindow) {
    for (var i = 0; i < SLICE_COUNT; i++) {
      var a = assignments[i];
      var sliceEl = _sliceEls[i];
      var h;
      if (a.active) {
        h = MIN_HEIGHT + (a.fraction * MAX_EXTRA);
        if (h > MIN_HEIGHT + MAX_EXTRA) h = MIN_HEIGHT + MAX_EXTRA;
      } else {
        h = MIN_HEIGHT;
      }
      sliceEl.style.height = h + 'px';
      sliceEl.style.top = (-h / 2) + 'px';
      sliceEl.style.backgroundColor = a.color;

      if (a.active) {
        sliceEl.style.boxShadow = '0 0 10px ' + a.color + '88, 0 0 20px ' + a.color + '44';
      } else {
        sliceEl.style.boxShadow = 'none';
      }
    }
  }

  /* ── update labels ───────────────────────────────────── */
  function updateLabels(tokens, contextWindow) {
    CATEGORIES.forEach(function (cat, i) {
      var lbl = _labelEls[i];
      if (!lbl) return;
      var count = tokens[cat.key] || 0;
      var p = pct(count, contextWindow);
      lbl.querySelector('.cr-label-pct').textContent = p + '%';
      lbl.querySelector('.cr-label-count').textContent = '(' + formatNum(count) + ')';
    });
  }

  /* ── update stats ────────────────────────────────────── */
  function updateStats(tokens, contextWindow) {
    CATEGORIES.forEach(function (cat) {
      var s = _statEls[cat.key];
      if (!s) return;
      var count = tokens[cat.key] || 0;
      s.value.textContent = formatNum(count);
      s.pct.textContent = pct(count, contextWindow) + '%';
    });
  }

  /* ── label fade based on rotation ────────────────────── */
  var _labelBaseAngles = [270, 0, 90, 180]; // which rotateY angle each label faces

  function updateLabelVisibility(angle) {
    var normalised = ((angle % 360) + 360) % 360;
    for (var i = 0; i < _labelEls.length; i++) {
      var lbl = _labelEls[i];
      var faceAngle = _labelBaseAngles[i];
      var diff = Math.abs(normalised - faceAngle);
      if (diff > 180) diff = 360 - diff;
      /* Visible when the ring face is roughly toward camera (within 70 deg) */
      var opacity = diff < 50 ? 1 : diff < 80 ? 1 - ((diff - 50) / 30) : 0;
      lbl.style.opacity = opacity.toFixed(2);
    }
  }

  /* ── rotation loop ───────────────────────────────────── */
  function tick(timestamp) {
    if (!_inited) return;

    if (_lastTimestamp === 0) _lastTimestamp = timestamp;
    var dt = timestamp - _lastTimestamp;
    _lastTimestamp = timestamp;

    if (!_paused && !_dragging) {
      _autoAngle += (dt / ROTATION_PERIOD) * 360;
    }

    _currentAngle = _autoAngle + _dragOffset;
    _ringEl.style.transform = 'rotateX(-12deg) rotateY(' + _currentAngle.toFixed(2) + 'deg)';

    updateLabelVisibility(_currentAngle);

    _rafId = requestAnimationFrame(tick);
  }

  /* ── interaction handlers ────────────────────────────── */
  function onMouseEnter() {
    if (!_dragging) _paused = true;
  }
  function onMouseLeave() {
    _paused = false;
    if (_dragging) stopDrag();
  }

  function startDrag(clientX) {
    _dragging = true;
    _dragStartX = clientX;
    _dragBaseOffset = _dragOffset;
  }
  function moveDrag(clientX) {
    if (!_dragging) return;
    var dx = clientX - _dragStartX;
    _dragOffset = _dragBaseOffset + dx * 0.5;
  }
  function stopDrag() {
    _dragging = false;
  }

  function onMouseDown(e) {
    e.preventDefault();
    startDrag(e.clientX);
  }
  function onMouseMove(e) {
    moveDrag(e.clientX);
  }
  function onMouseUp() {
    stopDrag();
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    _paused = true;
    startDrag(e.touches[0].clientX);
  }
  function onTouchMove(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    moveDrag(e.touches[0].clientX);
  }
  function onTouchEnd() {
    stopDrag();
    _paused = false;
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowLeft') {
      _dragOffset -= 15;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      _dragOffset += 15;
      e.preventDefault();
    }
  }

  function bindEvents(viewport) {
    viewport.addEventListener('mouseenter', onMouseEnter);
    viewport.addEventListener('mouseleave', onMouseLeave);
    viewport.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd);

    viewport.addEventListener('keydown', onKeyDown);
  }

  /* ── theme observer ──────────────────────────────────── */
  function observeTheme() {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) {
      mq.addEventListener('change', function () {
        if (_lastTokens && _lastContext) update(_lastTokens, _lastContext);
      });
    }
    /* Also observe class changes on html/body */
    var observer = new MutationObserver(function () {
      if (_lastTokens && _lastContext) refreshTheme();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function refreshTheme() {
    var dark = isDarkTheme();
    /* Update label classes */
    _labelEls.forEach(function (lbl) {
      lbl.className = 'cr-label ' + (dark ? 'cr-label-dark' : 'cr-label-light');
    });
    /* Update stat cards */
    var statCards = _container.querySelectorAll('.cr-stat');
    for (var i = 0; i < statCards.length; i++) {
      statCards[i].className = 'cr-stat ' + (dark ? 'cr-stat-dark' : 'cr-stat-light');
    }
    /* Re-apply slices with current data */
    if (_lastTokens && _lastContext) {
      var result = computeSliceAssignment(_lastTokens, _lastContext);
      applySliceVisuals(result.assignments, _lastContext);
    }
  }

  /* ── public: init ────────────────────────────────────── */
  function init(containerId) {
    if (_inited) return;
    _containerId = containerId;
    _container = document.getElementById(containerId);
    if (!_container) {
      console.warn('[ContextRing] Container "' + containerId + '" not found.');
      return;
    }

    injectStyles();

    var dom = buildDOM();
    _container.innerHTML = '';
    _container.appendChild(dom);

    var viewport = _container.querySelector('.cr-viewport');
    bindEvents(viewport);
    observeTheme();

    _inited = true;
    _lastTimestamp = 0;
    _rafId = requestAnimationFrame(tick);
  }

  /* ── public: update ──────────────────────────────────── */
  function update(tokens, contextWindow) {
    if (!_inited) return;
    if (!tokens || !contextWindow) return;

    _lastTokens = tokens;
    _lastContext = contextWindow;

    var result = computeSliceAssignment(tokens, contextWindow);
    applySliceVisuals(result.assignments, contextWindow);
    updateLabels(tokens, contextWindow);
    updateStats(tokens, contextWindow);

    /* Total usage */
    var totalPct = pct(result.total, contextWindow);
    if (_legendPercentEl) _legendPercentEl.textContent = totalPct + '%';

    /* Aria */
    var viewport = _container.querySelector('.cr-viewport');
    if (viewport) {
      viewport.setAttribute('aria-label',
        'Context window usage 3D ring showing ' + totalPct + '% used');
    }

    /* Screen reader summary */
    if (_srSummaryEl) {
      var parts = CATEGORIES.map(function (cat) {
        var c = tokens[cat.key] || 0;
        return cat.label + ': ' + formatNum(c) + ' (' + pct(c, contextWindow) + '%)';
      });
      _srSummaryEl.textContent =
        'Context window usage: ' + totalPct + '% of ' + formatNum(contextWindow) +
        ' tokens. ' + parts.join('. ') + '.';
    }
  }

  /* ── public: destroy ─────────────────────────────────── */
  function destroy() {
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = null;
    _inited = false;
    _sliceEls = [];
    _labelEls = [];
    _statEls = {};
    _autoAngle = 0;
    _dragOffset = 0;
    _currentAngle = 0;
    _lastTimestamp = 0;
    if (_container) _container.innerHTML = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  /* ── exports ─────────────────────────────────────────── */
  return {
    init: init,
    update: update,
    destroy: destroy,
    isInited: function () { return _inited; }
  };
})();
