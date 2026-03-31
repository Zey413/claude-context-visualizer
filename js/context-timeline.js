/**
 * Claude Context Window Visualizer — Context Timeline Heatmap
 * GitHub-contributions-style heatmap where each cell represents a
 * conversation turn's context window usage across categories.
 * Zero dependencies — all DOM built programmatically.
 *
 * API: window.ContextTimeline = { init, addTurn, update, reset, isInited }
 */

'use strict';

var ContextTimeline = (function () {

  // ---- Constants ----
  var COLORS = {
    system:    '#8B5CF6',
    user:      '#3B82F6',
    assistant: '#10B981',
    tools:     '#F59E0B'
  };

  var ROW_KEYS  = ['system', 'user', 'assistant', 'tools', 'total', 'remaining', 'cost'];
  var ROW_LABELS = {
    system:    'System',
    user:      'User',
    assistant: 'Assistant',
    tools:     'Tools',
    total:     'Total',
    remaining: 'Remaining',
    cost:      'Cost'
  };

  var CELL_SIZE   = 16;
  var CELL_GAP    = 2;
  var MAX_COLS    = 100;
  var MAX_TURNS   = 200;
  var ROW_COUNT   = ROW_KEYS.length;
  var STYLE_ID    = 'ct-styles';

  /** Five intensity levels per category (0-4) */
  var INTENSITY_THRESHOLDS = [0.05, 0.15, 0.30, 0.50];

  // ---- State ----
  var _inited      = false;
  var _containerId = '';
  var _container   = null;
  var _turns       = [];
  var _showValues  = false;

  // DOM references
  var _root        = null;
  var _gridWrap    = null;
  var _gridEl      = null;
  var _tooltipEl   = null;
  var _counterEl   = null;
  var _labelsCol   = null;

  // ---- Theme detection ----

  function _isDark() {
    return document.documentElement.classList.contains('dark') ||
           document.body.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ---- Utility helpers ----

  function _fmt(n) {
    if (n == null) return '0';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function _pct(val, total) {
    if (!total) return '0.0';
    return (val / total * 100).toFixed(1);
  }

  function _el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Clamp a value between min and max */
  function _clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  /** Return intensity level 0-4 for a ratio (0-1) */
  function _intensityLevel(ratio) {
    if (ratio <= INTENSITY_THRESHOLDS[0]) return 0;
    if (ratio <= INTENSITY_THRESHOLDS[1]) return 1;
    if (ratio <= INTENSITY_THRESHOLDS[2]) return 2;
    if (ratio <= INTENSITY_THRESHOLDS[3]) return 3;
    return 4;
  }

  /** Blend a hex color with opacity for intensity levels */
  function _colorAtLevel(hex, level) {
    var opacities = [0.12, 0.30, 0.52, 0.75, 1.0];
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    var a = opacities[level];
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /** Interpolate between two hex colors by ratio 0-1 */
  function _lerpColor(hexA, hexB, t) {
    var rA = parseInt(hexA.slice(1, 3), 16), gA = parseInt(hexA.slice(3, 5), 16), bA = parseInt(hexA.slice(5, 7), 16);
    var rB = parseInt(hexB.slice(1, 3), 16), gB = parseInt(hexB.slice(3, 5), 16), bB = parseInt(hexB.slice(5, 7), 16);
    var r = Math.round(rA + (rB - rA) * t);
    var g = Math.round(gA + (gB - gA) * t);
    var b = Math.round(bA + (bB - bA) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /** Estimate cost for a turn (rough MTok pricing) */
  function _estimateCost(turn) {
    if (turn.cost != null) return turn.cost;
    var inp = (turn.tokens.system || 0) + (turn.tokens.user || 0) + (turn.tokens.tools || 0);
    var out = turn.tokens.assistant || 0;
    return (inp * 3.0 / 1e6) + (out * 15.0 / 1e6);
  }

  /** Total tokens for a turn */
  function _turnTotal(turn) {
    var t = turn.tokens;
    return (t.system || 0) + (t.user || 0) + (t.assistant || 0) + (t.tools || 0);
  }

  // ============================================================
  //  STYLES (injected once)
  // ============================================================

  function _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* Root & theme vars */
      '.ct-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; position: relative; }',
      '.ct-root { --ct-bg: #ffffff; --ct-bg2: #f8fafc; --ct-border: #e2e8f0; --ct-text: #1e293b; --ct-text2: #64748b; --ct-hover: #f1f5f9; --ct-panel-bg: rgba(255,255,255,0.85); --ct-shadow: 0 4px 24px rgba(0,0,0,.08); --ct-cell-empty: #f1f5f9; }',
      '.dark .ct-root, .ct-root.ct-dark { --ct-bg: #1e1e2e; --ct-bg2: #181825; --ct-border: #313244; --ct-text: #cdd6f4; --ct-text2: #a6adc8; --ct-hover: #313244; --ct-panel-bg: rgba(30,30,46,0.88); --ct-shadow: 0 4px 24px rgba(0,0,0,.3); --ct-cell-empty: #313244; }',

      /* Controls bar */
      '.ct-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }',
      '.ct-btn { padding: 5px 14px; font-size: 0.78rem; border: 1px solid var(--ct-border); border-radius: 6px; background: var(--ct-bg2); color: var(--ct-text); cursor: pointer; transition: background .15s, border-color .15s; }',
      '.ct-btn:hover { background: var(--ct-hover); border-color: #8B5CF6; }',
      '.ct-btn:focus-visible { outline: 2px solid #8B5CF6; outline-offset: 2px; }',
      '.ct-counter { font-size: 0.78rem; color: var(--ct-text2); margin-left: auto; font-variant-numeric: tabular-nums; }',
      '.ct-toggle { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; color: var(--ct-text2); cursor: pointer; user-select: none; }',
      '.ct-toggle input { margin: 0; accent-color: #8B5CF6; }',

      /* Grid area */
      '.ct-grid-area { display: flex; gap: 0; border: 1px solid var(--ct-border); border-radius: 10px; background: var(--ct-bg); overflow: hidden; }',

      /* Row labels column */
      '.ct-row-labels { flex-shrink: 0; display: flex; flex-direction: column; gap: ' + CELL_GAP + 'px; padding: 6px 8px 6px 10px; justify-content: flex-start; padding-top: 8px; }',
      '.ct-row-label { height: ' + CELL_SIZE + 'px; display: flex; align-items: center; justify-content: flex-end; font-size: 0.65rem; font-weight: 600; color: var(--ct-text2); white-space: nowrap; user-select: none; }',

      /* Scrollable grid wrapper */
      '.ct-grid-wrap { flex: 1; overflow-x: auto; overflow-y: hidden; padding: 8px 8px 28px 0; position: relative; scroll-behavior: smooth; }',
      '.ct-grid-wrap::-webkit-scrollbar { height: 6px; }',
      '.ct-grid-wrap::-webkit-scrollbar-track { background: transparent; }',
      '.ct-grid-wrap::-webkit-scrollbar-thumb { background: var(--ct-border); border-radius: 3px; }',

      /* Grid itself */
      '.ct-grid { display: inline-grid; grid-template-rows: repeat(' + ROW_COUNT + ', ' + CELL_SIZE + 'px); grid-auto-flow: column; gap: ' + CELL_GAP + 'px; position: relative; }',

      /* Individual cell */
      '.ct-cell { width: ' + CELL_SIZE + 'px; height: ' + CELL_SIZE + 'px; border-radius: 3px; cursor: pointer; transition: transform .1s, box-shadow .15s; position: relative; display: flex; align-items: center; justify-content: center; }',
      '.ct-cell:hover { transform: scale(1.25); box-shadow: 0 0 0 2px var(--ct-text); z-index: 2; }',
      '.ct-cell:focus-visible { outline: 2px solid #8B5CF6; outline-offset: 1px; }',
      '.ct-cell-empty { background: var(--ct-cell-empty); }',

      /* Tiny text inside cell */
      '.ct-cell-val { font-size: 6px; font-weight: 700; color: #fff; text-shadow: 0 0 2px rgba(0,0,0,.5); line-height: 1; pointer-events: none; display: none; }',
      '.ct-show-values .ct-cell-val { display: block; }',

      /* Turn number labels */
      '.ct-turn-labels { position: absolute; bottom: 0; left: 0; display: flex; height: 20px; pointer-events: none; }',
      '.ct-turn-label { position: absolute; font-size: 0.6rem; color: var(--ct-text2); text-align: center; transform: translateX(-50%); bottom: 2px; white-space: nowrap; }',

      /* Tooltip */
      '.ct-tooltip { position: fixed; z-index: 10000; padding: 10px 14px; border-radius: 10px; background: var(--ct-panel-bg); color: var(--ct-text); font-size: 0.75rem; line-height: 1.55; box-shadow: var(--ct-shadow); border: 1px solid var(--ct-border); pointer-events: none; opacity: 0; transition: opacity .12s; max-width: 280px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }',
      '.ct-tooltip--visible { opacity: 1; }',
      '.ct-tooltip-title { font-weight: 700; margin-bottom: 6px; font-size: 0.8rem; }',
      '.ct-tooltip-row { display: flex; align-items: center; gap: 6px; padding: 1px 0; }',
      '.ct-tooltip-swatch { width: 8px; height: 8px; border-radius: 2px; display: inline-block; flex-shrink: 0; }',
      '.ct-tooltip-cat { flex: 1; }',
      '.ct-tooltip-val { font-variant-numeric: tabular-nums; font-weight: 600; }',
      '.ct-tooltip-divider { border: 0; border-top: 1px solid var(--ct-border); margin: 4px 0; }',

      /* Empty state */
      '.ct-empty { padding: 40px 20px; text-align: center; color: var(--ct-text2); font-size: 0.85rem; }'
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  //  BUILD DOM
  // ============================================================

  function _buildDOM() {
    _root = _el('div', 'ct-root');

    /* Controls bar */
    var controls = _el('div', 'ct-controls');

    var resetBtn = _el('button', 'ct-btn', 'Reset');
    resetBtn.setAttribute('aria-label', 'Reset timeline data');
    resetBtn.addEventListener('click', function () { reset(); });

    var importBtn = _el('button', 'ct-btn', 'Import');
    importBtn.setAttribute('aria-label', 'Import data from Token Waterfall');
    importBtn.addEventListener('click', _importFromWaterfall);

    var toggleLabel = _el('label', 'ct-toggle');
    var toggleCb = document.createElement('input');
    toggleCb.type = 'checkbox';
    toggleCb.setAttribute('aria-label', 'Show values on cells');
    toggleCb.addEventListener('change', function () {
      _showValues = toggleCb.checked;
      if (_showValues) {
        _gridEl.classList.add('ct-show-values');
      } else {
        _gridEl.classList.remove('ct-show-values');
      }
    });
    toggleLabel.appendChild(toggleCb);
    toggleLabel.appendChild(document.createTextNode(' Show values'));

    _counterEl = _el('span', 'ct-counter', '0 turns recorded');

    controls.appendChild(resetBtn);
    controls.appendChild(importBtn);
    controls.appendChild(toggleLabel);
    controls.appendChild(_counterEl);
    _root.appendChild(controls);

    /* Grid area wrapper */
    var gridArea = _el('div', 'ct-grid-area');

    /* Row labels */
    _labelsCol = _el('div', 'ct-row-labels');
    for (var r = 0; r < ROW_COUNT; r++) {
      var lbl = _el('div', 'ct-row-label', ROW_LABELS[ROW_KEYS[r]]);
      _labelsCol.appendChild(lbl);
    }
    gridArea.appendChild(_labelsCol);

    /* Scrollable grid wrap */
    _gridWrap = _el('div', 'ct-grid-wrap');

    _gridEl = _el('div', 'ct-grid');
    _gridEl.setAttribute('role', 'grid');
    _gridEl.setAttribute('aria-label', 'Context timeline heatmap — rows are categories, columns are conversation turns');
    _gridWrap.appendChild(_gridEl);

    gridArea.appendChild(_gridWrap);
    _root.appendChild(gridArea);

    /* Tooltip */
    _tooltipEl = _el('div', 'ct-tooltip');
    _tooltipEl.setAttribute('role', 'tooltip');
    _tooltipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_tooltipEl);

    _container.appendChild(_root);
  }

  // ============================================================
  //  RENDERING
  // ============================================================

  /** Full re-render of the grid */
  function _render() {
    if (!_inited) return;

    /* Clear grid */
    _gridEl.innerHTML = '';

    if (_turns.length === 0) {
      var empty = _el('div', 'ct-empty', 'No turns recorded yet. Add turns via the calculator or import data.');
      empty.style.gridColumn = '1 / -1';
      empty.style.gridRow = '1 / -1';
      _gridEl.appendChild(empty);
      _updateCounter();
      return;
    }

    /* Determine visible range (virtualized) */
    var totalCols = _turns.length;
    var scrollLeft = _gridWrap.scrollLeft;
    var viewportW = _gridWrap.clientWidth;
    var colWidth = CELL_SIZE + CELL_GAP;
    var startCol = Math.max(0, Math.floor(scrollLeft / colWidth) - 2);
    var endCol = Math.min(totalCols, Math.ceil((scrollLeft + viewportW) / colWidth) + 2);

    /* Set grid width so scrollbar is accurate */
    _gridEl.style.gridTemplateColumns = 'repeat(' + totalCols + ', ' + CELL_SIZE + 'px)';

    /* Max cost for cost-row scaling */
    var maxCost = 0;
    for (var c = 0; c < _turns.length; c++) {
      var tc = _estimateCost(_turns[c]);
      if (tc > maxCost) maxCost = tc;
    }
    if (maxCost === 0) maxCost = 1;

    /* Fragment for batch append */
    var frag = document.createDocumentFragment();

    for (var col = 0; col < totalCols; col++) {
      var turn = _turns[col];
      var cw = turn.contextWindow || 200000;
      var total = _turnTotal(turn);
      var remaining = Math.max(0, cw - total);
      var totalRatio = cw > 0 ? total / cw : 0;
      var remainRatio = cw > 0 ? remaining / cw : 1;
      var cost = _estimateCost(turn);
      var costRatio = maxCost > 0 ? cost / maxCost : 0;

      /* Visibility check: create placeholder cells for offscreen columns */
      var isVisible = (col >= startCol && col <= endCol);

      for (var row = 0; row < ROW_COUNT; row++) {
        var cell = document.createElement('div');
        cell.className = 'ct-cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('tabindex', '-1');
        cell.style.gridRow = (row + 1).toString();
        cell.style.gridColumn = (col + 1).toString();

        var key = ROW_KEYS[row];
        var ratio, bg, valText;

        if (key === 'total') {
          ratio = totalRatio;
          bg = _lerpColor('#10B981', '#EF4444', _clamp(ratio, 0, 1));
          var level = _intensityLevel(ratio);
          var opacities = [0.20, 0.40, 0.60, 0.80, 1.0];
          cell.style.backgroundColor = bg;
          cell.style.opacity = opacities[level].toString();
          valText = Math.round(ratio * 100) + '%';
        } else if (key === 'remaining') {
          ratio = remainRatio;
          /* Inverse: more remaining = more green */
          bg = _lerpColor('#EF4444', '#10B981', _clamp(ratio, 0, 1));
          var rLevel = _intensityLevel(1 - ratio);
          cell.style.backgroundColor = bg;
          cell.style.opacity = ([1.0, 0.80, 0.60, 0.40, 0.20])[rLevel].toString();
          valText = Math.round(ratio * 100) + '%';
        } else if (key === 'cost') {
          ratio = costRatio;
          bg = _lerpColor('#10B981', '#F59E0B', _clamp(ratio, 0, 1));
          var cLevel = _intensityLevel(ratio);
          cell.style.backgroundColor = bg;
          cell.style.opacity = ([0.20, 0.40, 0.60, 0.80, 1.0])[cLevel].toString();
          valText = '$' + cost.toFixed(3);
        } else {
          /* Category row */
          var catTokens = turn.tokens[key] || 0;
          ratio = cw > 0 ? catTokens / cw : 0;
          var catLevel = _intensityLevel(ratio);
          bg = _colorAtLevel(COLORS[key], catLevel);
          cell.style.backgroundColor = bg;
          valText = Math.round(ratio * 100) + '%';
        }

        if (!isVisible) {
          cell.style.visibility = 'hidden';
        }

        /* Build aria label */
        var ariaLabel = 'Turn ' + (col + 1) + ': ' + ROW_LABELS[key] + ' ';
        if (key === 'cost') {
          ariaLabel += valText;
        } else {
          ariaLabel += Math.round(ratio * 100) + '% of context';
        }
        cell.setAttribute('aria-label', ariaLabel);

        /* Tiny value text */
        var valSpan = _el('span', 'ct-cell-val', Math.round(ratio * 100).toString());
        cell.appendChild(valSpan);

        /* Hover events */
        cell.dataset.col = col.toString();
        cell.dataset.row = row.toString();
        cell.addEventListener('mouseenter', _onCellEnter);
        cell.addEventListener('mouseleave', _onCellLeave);
        cell.addEventListener('focus', _onCellEnter);
        cell.addEventListener('blur', _onCellLeave);

        frag.appendChild(cell);
      }
    }

    _gridEl.appendChild(frag);

    /* Turn number labels */
    _renderTurnLabels(totalCols);
    _updateCounter();
  }

  /** Render turn number labels below grid */
  function _renderTurnLabels(totalCols) {
    /* Remove old labels */
    var oldLabels = _gridWrap.querySelectorAll('.ct-turn-label');
    for (var i = 0; i < oldLabels.length; i++) {
      oldLabels[i].parentNode.removeChild(oldLabels[i]);
    }

    var colWidth = CELL_SIZE + CELL_GAP;
    for (var col = 0; col < totalCols; col++) {
      /* Label every 5 turns, plus first and last */
      if (col === 0 || col === totalCols - 1 || (col + 1) % 5 === 0) {
        var lbl = _el('span', 'ct-turn-label', (col + 1).toString());
        lbl.style.left = (col * colWidth + CELL_SIZE / 2) + 'px';
        _gridWrap.appendChild(lbl);
      }
    }
  }

  /** Update the counter display */
  function _updateCounter() {
    if (_counterEl) {
      var n = _turns.length;
      _counterEl.textContent = n + ' turn' + (n !== 1 ? 's' : '') + ' recorded';
    }
  }

  /** Scroll grid to make the last column visible */
  function _scrollToEnd() {
    if (!_gridWrap) return;
    var colWidth = CELL_SIZE + CELL_GAP;
    var target = _turns.length * colWidth - _gridWrap.clientWidth + 20;
    if (target > 0) {
      _gridWrap.scrollTo({ left: target, behavior: 'smooth' });
    }
  }

  // ============================================================
  //  SCROLL-BASED VIRTUALIZATION
  // ============================================================

  function _onGridScroll() {
    if (!_gridEl) return;
    var scrollLeft = _gridWrap.scrollLeft;
    var viewportW = _gridWrap.clientWidth;
    var colWidth = CELL_SIZE + CELL_GAP;
    var startCol = Math.max(0, Math.floor(scrollLeft / colWidth) - 2);
    var endCol = Math.min(_turns.length, Math.ceil((scrollLeft + viewportW) / colWidth) + 2);

    var cells = _gridEl.querySelectorAll('.ct-cell');
    for (var i = 0; i < cells.length; i++) {
      var col = parseInt(cells[i].dataset.col, 10);
      if (col >= startCol && col <= endCol) {
        cells[i].style.visibility = 'visible';
      } else {
        cells[i].style.visibility = 'hidden';
      }
    }
  }

  // ============================================================
  //  TOOLTIP
  // ============================================================

  function _onCellEnter(e) {
    var cell = e.currentTarget;
    var col = parseInt(cell.dataset.col, 10);
    var turn = _turns[col];
    if (!turn) return;

    var cw = turn.contextWindow || 200000;
    var total = _turnTotal(turn);
    var remaining = Math.max(0, cw - total);
    var cost = _estimateCost(turn);

    var html = '<div class="ct-tooltip-title">Turn ' + (col + 1) + '</div>';

    /* Per-category rows */
    var cats = ['system', 'user', 'assistant', 'tools'];
    for (var i = 0; i < cats.length; i++) {
      var k = cats[i];
      var v = turn.tokens[k] || 0;
      html += '<div class="ct-tooltip-row">' +
        '<span class="ct-tooltip-swatch" style="background:' + COLORS[k] + '"></span>' +
        '<span class="ct-tooltip-cat">' + ROW_LABELS[k] + '</span>' +
        '<span class="ct-tooltip-val">' + _fmt(v) + ' (' + _pct(v, cw) + '%)</span>' +
      '</div>';
    }

    html += '<hr class="ct-tooltip-divider">';

    /* Total */
    html += '<div class="ct-tooltip-row">' +
      '<span class="ct-tooltip-swatch" style="background:' + _lerpColor('#10B981', '#EF4444', _clamp(total / cw, 0, 1)) + '"></span>' +
      '<span class="ct-tooltip-cat"><b>Total</b></span>' +
      '<span class="ct-tooltip-val"><b>' + _fmt(total) + ' (' + _pct(total, cw) + '%)</b></span>' +
    '</div>';

    /* Remaining */
    html += '<div class="ct-tooltip-row">' +
      '<span class="ct-tooltip-swatch" style="background:' + (remaining / cw > 0.3 ? '#10B981' : '#EF4444') + '"></span>' +
      '<span class="ct-tooltip-cat">Remaining</span>' +
      '<span class="ct-tooltip-val">' + _fmt(remaining) + ' (' + _pct(remaining, cw) + '%)</span>' +
    '</div>';

    /* Cost */
    html += '<div class="ct-tooltip-row">' +
      '<span class="ct-tooltip-swatch" style="background:#F59E0B"></span>' +
      '<span class="ct-tooltip-cat">Est. Cost</span>' +
      '<span class="ct-tooltip-val">$' + cost.toFixed(4) + '</span>' +
    '</div>';

    /* Timestamp */
    if (turn.timestamp) {
      var d = new Date(turn.timestamp);
      html += '<div style="margin-top:4px;font-size:0.65rem;color:var(--ct-text2)">' +
        d.toLocaleTimeString() + '</div>';
    }

    _tooltipEl.innerHTML = html;
    _tooltipEl.classList.add('ct-tooltip--visible');
    _tooltipEl.setAttribute('aria-hidden', 'false');

    _positionTooltip(cell);
  }

  function _onCellLeave() {
    _tooltipEl.classList.remove('ct-tooltip--visible');
    _tooltipEl.setAttribute('aria-hidden', 'true');
  }

  /** Position tooltip near cell, keeping it within viewport */
  function _positionTooltip(cell) {
    var rect = cell.getBoundingClientRect();
    var tipW = _tooltipEl.offsetWidth;
    var tipH = _tooltipEl.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var gap = 8;

    /* Prefer above; fall back to below */
    var top = rect.top - tipH - gap;
    if (top < 4) {
      top = rect.bottom + gap;
    }
    if (top + tipH > vh - 4) {
      top = vh - tipH - 4;
    }

    /* Horizontal: center on cell */
    var left = rect.left + rect.width / 2 - tipW / 2;
    left = _clamp(left, 4, vw - tipW - 4);

    _tooltipEl.style.top = top + 'px';
    _tooltipEl.style.left = left + 'px';
  }

  // ============================================================
  //  IMPORT FROM TOKEN WATERFALL
  // ============================================================

  function _importFromWaterfall() {
    /* Try to pull data from TokenWaterfall if available */
    if (window.TokenWaterfall && typeof window.TokenWaterfall.exportData === 'function') {
      var data = window.TokenWaterfall.exportData();
      if (data && Array.isArray(data) && data.length > 0) {
        _turns = [];
        var contextWindow = 200000;
        for (var i = 0; i < data.length && i < MAX_TURNS; i++) {
          var d = data[i];
          _turns.push({
            tokens: {
              system:    d.system    || 0,
              user:      d.user      || 0,
              assistant: d.assistant || 0,
              tools:     d.tools     || 0
            },
            contextWindow: d.contextWindow || contextWindow,
            timestamp: d.timestamp || Date.now(),
            cost: d.cost || null
          });
        }
        _render();
        _scrollToEnd();
        return;
      }
    }

    /* Fallback: prompt user with paste dialog */
    var input = prompt(
      'Paste JSON array of turns.\n' +
      'Format: [{"system":1000,"user":5000,"assistant":3000,"tools":200,"contextWindow":200000}]'
    );
    if (!input) return;

    try {
      var parsed = JSON.parse(input);
      if (!Array.isArray(parsed)) {
        alert('Expected a JSON array.');
        return;
      }
      _turns = [];
      for (var j = 0; j < parsed.length && j < MAX_TURNS; j++) {
        var p = parsed[j];
        _turns.push({
          tokens: {
            system:    p.system    || 0,
            user:      p.user      || 0,
            assistant: p.assistant || 0,
            tools:     p.tools     || 0
          },
          contextWindow: p.contextWindow || 200000,
          timestamp: p.timestamp || Date.now(),
          cost: p.cost || null
        });
      }
      _render();
      _scrollToEnd();
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  /**
   * Initialize the Context Timeline.
   * @param {string} containerId - DOM id of the host element.
   */
  function init(containerId) {
    if (_inited) return;

    var host = document.getElementById(containerId);
    if (!host) {
      console.warn('ContextTimeline: container #' + containerId + ' not found');
      return;
    }
    _containerId = containerId;
    _container = host;

    _injectStyles();
    _buildDOM();

    /* Scroll-based virtualization */
    _gridWrap.addEventListener('scroll', _onGridScroll);

    /* Re-render on theme change */
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    if (mql.addEventListener) {
      mql.addEventListener('change', function () { _render(); });
    }

    _inited = true;
    _render();
  }

  /**
   * Add a new conversation turn to the timeline.
   * @param {Object} tokens - { system, user, assistant, tools } token counts.
   * @param {number} contextWindow - Total context window size.
   * @param {number} [cost] - Optional cost for this turn.
   */
  function addTurn(tokens, contextWindow, cost) {
    if (!_inited) return;

    var turn = {
      tokens: {
        system:    (tokens && tokens.system)    || 0,
        user:      (tokens && tokens.user)      || 0,
        assistant: (tokens && tokens.assistant) || 0,
        tools:     (tokens && tokens.tools)     || 0
      },
      contextWindow: contextWindow || 200000,
      timestamp: Date.now(),
      cost: cost != null ? cost : null
    };

    _turns.push(turn);

    /* Enforce max turns */
    if (_turns.length > MAX_TURNS) {
      _turns = _turns.slice(_turns.length - MAX_TURNS);
    }

    _render();
    _scrollToEnd();
  }

  /**
   * Update the latest turn's data (for streaming updates).
   * If no turns exist, adds a new turn.
   * @param {Object} tokens - { system, user, assistant, tools } token counts.
   * @param {number} contextWindow - Total context window size.
   */
  function update(tokens, contextWindow) {
    if (!_inited) return;

    if (_turns.length === 0) {
      addTurn(tokens, contextWindow);
      return;
    }

    var last = _turns[_turns.length - 1];
    last.tokens.system    = (tokens && tokens.system)    || 0;
    last.tokens.user      = (tokens && tokens.user)      || 0;
    last.tokens.assistant = (tokens && tokens.assistant) || 0;
    last.tokens.tools     = (tokens && tokens.tools)     || 0;
    last.contextWindow    = contextWindow || last.contextWindow;
    last.cost             = null;

    _render();
  }

  /**
   * Reset all timeline data and re-render empty state.
   */
  function reset() {
    _turns = [];
    if (_inited) {
      _render();
    }
  }

  // ---- Module export ----

  return {
    init:     init,
    addTurn:  addTurn,
    update:   update,
    reset:    reset,
    isInited: function () { return _inited; }
  };

})();

/* Expose on window for cross-module access */
window.ContextTimeline = ContextTimeline;
