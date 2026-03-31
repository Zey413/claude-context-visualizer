/**
 * Claude Context Window Visualizer — Token Waterfall Module
 * Renders a waterfall / Gantt-style chart showing per-turn token distribution.
 * Features: stacked horizontal bars, cumulative curve overlay, turn detail
 * expand with pie chart, bulk JSON import, staggered row animation.
 *
 * API:  window.TokenWaterfall = { init, addTurn, importData, clearData, exportData, scrollToTurn }
 */

'use strict';

var TokenWaterfall = (function () {

  // ---- Constants ----
  var COLORS = {
    system:    '#8B5CF6',
    user:      '#3B82F6',
    assistant: '#10B981',
    tools:     '#F59E0B'
  };

  var LABELS = {
    system:    'System',
    user:      'User',
    assistant: 'Assistant',
    tools:     'Tools'
  };

  var CATEGORIES = ['system', 'user', 'assistant', 'tools'];
  var ROW_HEIGHT = 32;           // px per row
  var ROW_GAP    = 4;            // px between rows
  var ANIM_ROW_DELAY = 100;      // ms between row animations
  var BAR_ANIM_DURATION = 400;   // ms for bar fill animation
  var CURVE_HEIGHT = 60;         // px reserved for cumulative curve area

  // ---- State ----
  var _inited = false;
  var _container = null;
  var _options = { contextWindow: 200000, maxTurns: 50 };
  var _turns = [];               // Array of turn objects
  var _expandedTurn = -1;        // Index of the currently expanded turn (-1 = none)

  // DOM references
  var _root = null;
  var _headerEl = null;
  var _legendEl = null;
  var _chartArea = null;
  var _curveCanvas = null;       // SVG element for cumulative curve
  var _rowsContainer = null;
  var _detailPanel = null;
  var _importArea = null;
  var _tooltipEl = null;

  // Theme detection
  function _isDark() {
    return document.documentElement.classList.contains('dark') ||
           document.body.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ---- Utility helpers ----

  /** Format large numbers with commas */
  function _fmt(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Compute the total tokens for a turn */
  function _turnTotal(t) {
    return (t.system || 0) + (t.user || 0) + (t.assistant || 0) + (t.tools || 0);
  }

  /** Get the max single-turn total across all turns */
  function _maxTurnTotal() {
    var m = 0;
    for (var i = 0; i < _turns.length; i++) {
      var t = _turnTotal(_turns[i]);
      if (t > m) m = t;
    }
    return m || 1; // avoid division by zero
  }

  /** Cumulative token sum up to (and including) turn index */
  function _cumulativeAt(idx) {
    var sum = 0;
    for (var i = 0; i <= idx && i < _turns.length; i++) {
      sum += _turnTotal(_turns[i]);
    }
    return sum;
  }

  /** Percentage with 1 decimal */
  function _pct(val, total) {
    if (!total) return '0.0';
    return (val / total * 100).toFixed(1);
  }

  /** Create DOM element with optional class and text */
  function _el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Create SVG element */
  function _svg(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  // ============================================================
  //  INIT
  // ============================================================

  function init(containerId, options) {
    if (_inited) return;

    var host = document.getElementById(containerId);
    if (!host) {
      console.warn('TokenWaterfall: container #' + containerId + ' not found');
      return;
    }
    _container = host;

    if (options) {
      if (options.contextWindow) _options.contextWindow = options.contextWindow;
      if (options.maxTurns) _options.maxTurns = options.maxTurns;
    }

    _injectStyles();
    _buildDOM();
    _inited = true;
  }

  // ============================================================
  //  STYLES  (injected once)
  // ============================================================

  function _injectStyles() {
    if (document.getElementById('tw-styles')) return;

    var css = [
      // ---- Root ----
      '.tw-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; position: relative; }',

      // ---- Theme variables ----
      '.tw-root { --tw-bg: #ffffff; --tw-bg2: #f8fafc; --tw-border: #e2e8f0; --tw-text: #1e293b; --tw-text2: #64748b; --tw-hover: #f1f5f9; --tw-panel-bg: #ffffff; --tw-shadow: 0 4px 24px rgba(0,0,0,.08); }',
      '.dark .tw-root, .tw-root.tw-dark { --tw-bg: #1e1e2e; --tw-bg2: #181825; --tw-border: #313244; --tw-text: #cdd6f4; --tw-text2: #a6adc8; --tw-hover: #313244; --tw-panel-bg: #1e1e2e; --tw-shadow: 0 4px 24px rgba(0,0,0,.3); }',

      // ---- Header / legend ----
      '.tw-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }',
      '.tw-title { font-size: 1rem; font-weight: 700; color: var(--tw-text); margin: 0; }',
      '.tw-legend { display: flex; gap: 14px; flex-wrap: wrap; }',
      '.tw-legend-item { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; color: var(--tw-text2); }',
      '.tw-legend-swatch { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }',

      // ---- Button row ----
      '.tw-btn-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }',
      '.tw-btn { padding: 5px 14px; font-size: 0.78rem; border: 1px solid var(--tw-border); border-radius: 6px; background: var(--tw-bg2); color: var(--tw-text); cursor: pointer; transition: background .15s, border-color .15s; }',
      '.tw-btn:hover { background: var(--tw-hover); border-color: #8B5CF6; }',

      // ---- Chart area ----
      '.tw-chart-area { position: relative; border: 1px solid var(--tw-border); border-radius: 10px; background: var(--tw-bg); overflow: hidden; }',

      // ---- Cumulative curve overlay ----
      '.tw-curve-svg { display: block; width: 100%; pointer-events: none; }',

      // ---- Rows container ----
      '.tw-rows { padding: 6px 12px 12px; }',

      // ---- Single row ----
      '.tw-row { display: flex; align-items: center; gap: 8px; cursor: pointer; border-radius: 6px; padding: 2px 4px; transition: background .12s; }',
      '.tw-row:hover { background: var(--tw-hover); }',
      '.tw-row-label { width: 46px; flex-shrink: 0; font-size: 0.7rem; font-weight: 600; color: var(--tw-text2); text-align: right; user-select: none; }',
      '.tw-row-track { flex: 1; height: ' + ROW_HEIGHT + 'px; background: var(--tw-bg2); border-radius: 5px; position: relative; overflow: hidden; display: flex; }',
      '.tw-row-seg { height: 100%; transition: width ' + BAR_ANIM_DURATION + 'ms cubic-bezier(.22,1,.36,1); }',
      '.tw-row-total { width: 72px; flex-shrink: 0; font-size: 0.7rem; color: var(--tw-text2); text-align: right; font-variant-numeric: tabular-nums; }',

      // Row expand animation
      '.tw-row--expanded { background: var(--tw-hover); }',

      // ---- Tooltip ----
      '.tw-tooltip { position: fixed; z-index: 10000; padding: 10px 14px; border-radius: 8px; background: var(--tw-panel-bg); color: var(--tw-text); font-size: 0.75rem; line-height: 1.55; box-shadow: var(--tw-shadow); border: 1px solid var(--tw-border); pointer-events: none; opacity: 0; transition: opacity .12s; max-width: 280px; }',
      '.tw-tooltip--visible { opacity: 1; }',
      '.tw-tooltip b { font-weight: 700; }',
      '.tw-tooltip-cat { display: flex; align-items: center; gap: 5px; }',
      '.tw-tooltip-swatch { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }',

      // ---- Detail panel ----
      '.tw-detail { overflow: hidden; max-height: 0; transition: max-height .35s ease; border-top: 1px solid transparent; }',
      '.tw-detail--open { max-height: 600px; border-top-color: var(--tw-border); }',
      '.tw-detail-inner { padding: 14px 12px; display: flex; gap: 16px; flex-wrap: wrap; }',
      '.tw-detail-col { flex: 1; min-width: 200px; }',
      '.tw-detail-heading { font-size: 0.78rem; font-weight: 700; color: var(--tw-text); margin: 0 0 6px; }',
      '.tw-detail-preview { font-size: 0.72rem; color: var(--tw-text2); white-space: pre-wrap; word-break: break-word; max-height: 90px; overflow-y: auto; padding: 6px 8px; background: var(--tw-bg2); border-radius: 6px; border: 1px solid var(--tw-border); }',
      '.tw-detail-tool { font-size: 0.72rem; color: var(--tw-text2); padding: 3px 0; border-bottom: 1px solid var(--tw-border); }',
      '.tw-detail-tool:last-child { border-bottom: none; }',

      // ---- Pie in detail panel ----
      '.tw-pie-wrap { width: 120px; height: 120px; flex-shrink: 0; }',
      '.tw-pie-svg { width: 100%; height: 100%; }',

      // ---- Import area ----
      '.tw-import { margin-top: 10px; }',
      '.tw-import textarea { width: 100%; min-height: 80px; font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 0.72rem; border: 1px solid var(--tw-border); border-radius: 8px; background: var(--tw-bg2); color: var(--tw-text); padding: 8px 10px; resize: vertical; box-sizing: border-box; }',
      '.tw-import textarea::placeholder { color: var(--tw-text2); }',
      '.tw-import-err { font-size: 0.72rem; color: #EF4444; margin-top: 4px; }',

      // ---- Stagger animation ----
      '.tw-row-seg { width: 0; }', // start collapsed; JS sets width
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'tw-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  //  DOM CONSTRUCTION
  // ============================================================

  function _buildDOM() {
    _root = _el('div', 'tw-root');

    // Apply dark class if needed
    if (_isDark()) _root.classList.add('tw-dark');

    // Observe dark mode changes
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) {
      mq.addEventListener('change', function () {
        _root.classList.toggle('tw-dark', _isDark());
      });
    }
    // Also observe body/html class changes via MutationObserver
    var observer = new MutationObserver(function () {
      _root.classList.toggle('tw-dark', _isDark());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // ---- Header ----
    _headerEl = _el('div', 'tw-header');
    var title = _el('h3', 'tw-title', 'Token Waterfall');

    _legendEl = _el('div', 'tw-legend');
    CATEGORIES.forEach(function (cat) {
      var item = _el('span', 'tw-legend-item');
      var swatch = _el('span', 'tw-legend-swatch');
      swatch.style.background = COLORS[cat];
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(LABELS[cat]));
      _legendEl.appendChild(item);
    });

    _headerEl.appendChild(title);
    _headerEl.appendChild(_legendEl);
    _root.appendChild(_headerEl);

    // ---- Button row ----
    var btnRow = _el('div', 'tw-btn-row');

    var btnClear = _el('button', 'tw-btn', 'Clear');
    btnClear.addEventListener('click', function () { clearData(); });

    var btnExport = _el('button', 'tw-btn', 'Export JSON');
    btnExport.addEventListener('click', function () {
      var json = exportData();
      if (!json) return;
      _copyToClipboard(json);
      btnExport.textContent = 'Copied!';
      setTimeout(function () { btnExport.textContent = 'Export JSON'; }, 1500);
    });

    var btnImportToggle = _el('button', 'tw-btn', 'Import JSON');
    btnImportToggle.addEventListener('click', function () {
      _importArea.style.display = _importArea.style.display === 'none' ? 'block' : 'none';
    });

    var btnSample = _el('button', 'tw-btn', 'Load Sample');
    btnSample.addEventListener('click', function () { _loadSampleData(); });

    btnRow.appendChild(btnClear);
    btnRow.appendChild(btnExport);
    btnRow.appendChild(btnImportToggle);
    btnRow.appendChild(btnSample);
    _root.appendChild(btnRow);

    // ---- Chart area ----
    _chartArea = _el('div', 'tw-chart-area');
    _rowsContainer = _el('div', 'tw-rows');
    _chartArea.appendChild(_rowsContainer);
    _root.appendChild(_chartArea);

    // ---- Import area (hidden by default) ----
    _importArea = _el('div', 'tw-import');
    _importArea.style.display = 'none';
    var ta = document.createElement('textarea');
    ta.placeholder = 'Paste JSON array:\n[{ "turn": 1, "system": 500, "user": 800, "assistant": 1200, "tools": 0 }, ...]';
    ta.setAttribute('rows', '5');

    var importBtn = _el('button', 'tw-btn', 'Parse & Render');
    var importErr = _el('div', 'tw-import-err');

    importBtn.addEventListener('click', function () {
      importErr.textContent = '';
      try {
        var data = JSON.parse(ta.value);
        importData(data);
        ta.value = '';
        _importArea.style.display = 'none';
      } catch (e) {
        importErr.textContent = 'Invalid JSON: ' + e.message;
      }
    });

    _importArea.appendChild(ta);
    _importArea.appendChild(importBtn);
    _importArea.appendChild(importErr);
    _root.appendChild(_importArea);

    // ---- Tooltip (appended to body for correct positioning) ----
    _tooltipEl = _el('div', 'tw-tooltip');
    document.body.appendChild(_tooltipEl);

    _container.appendChild(_root);
  }

  // ============================================================
  //  RENDERING
  // ============================================================

  /** Full re-render with staggered row animation */
  function _renderAll(animate) {
    if (!_inited) return;

    _rowsContainer.innerHTML = '';
    _expandedTurn = -1;

    // Remove existing curve SVG if present
    var oldCurve = _chartArea.querySelector('.tw-curve-svg');
    if (oldCurve) oldCurve.remove();

    if (_turns.length === 0) {
      var empty = _el('div', '', 'No data. Add turns or import JSON.');
      empty.style.cssText = 'text-align:center;padding:32px;color:var(--tw-text2);font-size:0.82rem;';
      _rowsContainer.appendChild(empty);
      return;
    }

    // Build rows
    var maxTotal = _maxTurnTotal();
    var displayTurns = _turns.slice(0, _options.maxTurns);

    // Cumulative curve data (build before rows for overlay)
    var cumulativeData = [];
    var runningSum = 0;

    displayTurns.forEach(function (turn, idx) {
      runningSum += _turnTotal(turn);
      cumulativeData.push(runningSum);
    });

    // Insert cumulative curve SVG before rows
    _renderCumulativeCurve(cumulativeData, displayTurns.length);

    // Render rows
    displayTurns.forEach(function (turn, idx) {
      var row = _buildRow(turn, idx, maxTotal, animate);
      _rowsContainer.appendChild(row.wrapper);
    });

    // Staggered width animation
    if (animate) {
      var segments = _rowsContainer.querySelectorAll('.tw-row');
      segments.forEach(function (rowEl, ri) {
        setTimeout(function () {
          var segs = rowEl.querySelectorAll('.tw-row-seg');
          segs.forEach(function (seg) {
            seg.style.width = seg.dataset.targetWidth;
          });
        }, ri * ANIM_ROW_DELAY);
      });
    }
  }

  /** Build a single row + its detail panel */
  function _buildRow(turn, index, maxTotal, animate) {
    var wrapper = _el('div');
    wrapper.style.marginBottom = ROW_GAP + 'px';

    // ---- Row ----
    var row = _el('div', 'tw-row');
    row.setAttribute('data-idx', index);
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', 'Turn ' + (turn.turn || index + 1));

    var label = _el('span', 'tw-row-label', '#' + (turn.turn || index + 1));
    var track = _el('div', 'tw-row-track');

    var total = _turnTotal(turn);
    var widthPct = (total / maxTotal * 100);

    CATEGORIES.forEach(function (cat) {
      var val = turn[cat] || 0;
      if (val <= 0) return;
      var seg = _el('div', 'tw-row-seg');
      seg.style.background = COLORS[cat];
      var segWidth = (val / maxTotal * 100).toFixed(3) + '%';
      if (animate) {
        seg.style.width = '0';
        seg.dataset.targetWidth = segWidth;
      } else {
        seg.style.width = segWidth;
      }
      track.appendChild(seg);
    });

    var totalLabel = _el('span', 'tw-row-total', _fmt(total));

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(totalLabel);

    // ---- Tooltip events ----
    row.addEventListener('mouseenter', function (e) { _showTooltip(e, turn, index); });
    row.addEventListener('mousemove', function (e) { _moveTooltip(e); });
    row.addEventListener('mouseleave', function () { _hideTooltip(); });

    // ---- Detail panel (collapsed) ----
    var detail = _el('div', 'tw-detail');
    detail.setAttribute('data-detail-idx', index);

    // Click to expand/collapse
    row.addEventListener('click', function () {
      _toggleDetail(index, detail, row);
    });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _toggleDetail(index, detail, row);
      }
    });

    wrapper.appendChild(row);
    wrapper.appendChild(detail);

    return { wrapper: wrapper, row: row, detail: detail };
  }

  // ============================================================
  //  CUMULATIVE CURVE
  // ============================================================

  function _renderCumulativeCurve(data, count) {
    if (count < 2) return;

    var svgEl = _svg('svg');
    svgEl.classList.add('tw-curve-svg');
    svgEl.setAttribute('viewBox', '0 0 1000 ' + CURVE_HEIGHT);
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.style.height = CURVE_HEIGHT + 'px';

    // Defs for gradient
    var defs = _svg('defs');
    var grad = _svg('linearGradient');
    grad.id = 'tw-curve-grad-' + Date.now();
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '0%');

    // Color stops: green -> amber -> red based on cumulative / contextWindow
    var totalCum = data[data.length - 1];
    data.forEach(function (val, i) {
      var stop = _svg('stop');
      var pct = count > 1 ? (i / (count - 1) * 100) : 0;
      var usage = val / _options.contextWindow;
      // Interpolate from green (#10B981) to amber (#F59E0B) to red (#EF4444)
      var color;
      if (usage < 0.5) {
        color = '#10B981';
      } else if (usage < 0.8) {
        color = '#F59E0B';
      } else {
        color = '#EF4444';
      }
      stop.setAttribute('offset', pct.toFixed(1) + '%');
      stop.setAttribute('stop-color', color);
      grad.appendChild(stop);
    });

    defs.appendChild(grad);
    svgEl.appendChild(defs);

    // Build polyline points
    var maxY = Math.max(totalCum, _options.contextWindow);
    var padding = 4;
    var points = [];
    data.forEach(function (val, i) {
      var x = count > 1 ? (i / (count - 1) * 1000) : 500;
      var y = CURVE_HEIGHT - padding - (val / maxY * (CURVE_HEIGHT - padding * 2));
      points.push(x.toFixed(1) + ',' + y.toFixed(1));
    });

    // Filled area under curve
    var areaPath = _svg('polygon');
    var firstX = count > 1 ? '0' : '500';
    var lastX = count > 1 ? '1000' : '500';
    var areaPoints = firstX + ',' + (CURVE_HEIGHT - padding) + ' ' + points.join(' ') + ' ' + lastX + ',' + (CURVE_HEIGHT - padding);
    areaPath.setAttribute('points', areaPoints);
    areaPath.setAttribute('fill', 'url(#' + grad.id + ')');
    areaPath.setAttribute('opacity', '0.15');
    svgEl.appendChild(areaPath);

    // Curve line
    var polyline = _svg('polyline');
    polyline.setAttribute('points', points.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', 'url(#' + grad.id + ')');
    polyline.setAttribute('stroke-width', '2.5');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    svgEl.appendChild(polyline);

    // Context window threshold line (dashed)
    var threshY = CURVE_HEIGHT - padding - (_options.contextWindow / maxY * (CURVE_HEIGHT - padding * 2));
    if (totalCum > _options.contextWindow * 0.3) {
      var dashLine = _svg('line');
      dashLine.setAttribute('x1', '0');
      dashLine.setAttribute('y1', threshY.toFixed(1));
      dashLine.setAttribute('x2', '1000');
      dashLine.setAttribute('y2', threshY.toFixed(1));
      dashLine.setAttribute('stroke', '#EF4444');
      dashLine.setAttribute('stroke-width', '1');
      dashLine.setAttribute('stroke-dasharray', '6,4');
      dashLine.setAttribute('opacity', '0.5');
      svgEl.appendChild(dashLine);

      // Label
      var lbl = _svg('text');
      lbl.setAttribute('x', '996');
      lbl.setAttribute('y', (threshY - 4).toFixed(1));
      lbl.setAttribute('text-anchor', 'end');
      lbl.setAttribute('font-size', '9');
      lbl.setAttribute('fill', '#EF4444');
      lbl.setAttribute('opacity', '0.7');
      lbl.textContent = 'Context limit';
      svgEl.appendChild(lbl);
    }

    // Dot markers on each data point
    data.forEach(function (val, i) {
      var x = count > 1 ? (i / (count - 1) * 1000) : 500;
      var y = CURVE_HEIGHT - padding - (val / maxY * (CURVE_HEIGHT - padding * 2));
      var circle = _svg('circle');
      circle.setAttribute('cx', x.toFixed(1));
      circle.setAttribute('cy', y.toFixed(1));
      circle.setAttribute('r', '3');
      var usage = val / _options.contextWindow;
      circle.setAttribute('fill', usage < 0.5 ? '#10B981' : usage < 0.8 ? '#F59E0B' : '#EF4444');
      svgEl.appendChild(circle);
    });

    // Insert SVG at the top of chart area (before rows)
    _chartArea.insertBefore(svgEl, _rowsContainer);
  }

  // ============================================================
  //  TOOLTIP
  // ============================================================

  function _showTooltip(e, turn, index) {
    var total = _turnTotal(turn);
    var cumulative = _cumulativeAt(index);
    var html = '<b>Turn #' + (turn.turn || index + 1) + '</b><br>';
    CATEGORIES.forEach(function (cat) {
      var val = turn[cat] || 0;
      html += '<span class="tw-tooltip-cat">' +
              '<span class="tw-tooltip-swatch" style="background:' + COLORS[cat] + '"></span>' +
              LABELS[cat] + ': ' + _fmt(val) + ' (' + _pct(val, total) + '%)' +
              '</span><br>';
    });
    html += '<b>Total: ' + _fmt(total) + '</b><br>';
    html += 'Cumulative: ' + _fmt(cumulative) + ' / ' + _fmt(_options.contextWindow) +
            ' (' + _pct(cumulative, _options.contextWindow) + '%)';

    _tooltipEl.innerHTML = html;
    _tooltipEl.classList.add('tw-tooltip--visible');
    _moveTooltip(e);
  }

  function _moveTooltip(e) {
    var x = e.clientX + 14;
    var y = e.clientY + 14;
    // Keep within viewport
    var rect = _tooltipEl.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) {
      x = e.clientX - rect.width - 10;
    }
    if (y + rect.height > window.innerHeight - 8) {
      y = e.clientY - rect.height - 10;
    }
    _tooltipEl.style.left = x + 'px';
    _tooltipEl.style.top = y + 'px';
  }

  function _hideTooltip() {
    _tooltipEl.classList.remove('tw-tooltip--visible');
  }

  // ============================================================
  //  DETAIL PANEL  (expand on click)
  // ============================================================

  function _toggleDetail(index, detailEl, rowEl) {
    // Collapse previously expanded turn
    if (_expandedTurn === index) {
      detailEl.classList.remove('tw-detail--open');
      rowEl.classList.remove('tw-row--expanded');
      _expandedTurn = -1;
      return;
    }

    // Collapse any other open detail
    var allDetails = _rowsContainer.querySelectorAll('.tw-detail--open');
    allDetails.forEach(function (d) { d.classList.remove('tw-detail--open'); });
    var allExpanded = _rowsContainer.querySelectorAll('.tw-row--expanded');
    allExpanded.forEach(function (r) { r.classList.remove('tw-row--expanded'); });

    _expandedTurn = index;
    rowEl.classList.add('tw-row--expanded');

    // Populate detail content
    var turn = _turns[index];
    _populateDetail(detailEl, turn, index);

    detailEl.classList.add('tw-detail--open');
  }

  function _populateDetail(detailEl, turn, index) {
    detailEl.innerHTML = '';
    var inner = _el('div', 'tw-detail-inner');

    // ---- Info column ----
    var infoCol = _el('div', 'tw-detail-col');
    infoCol.appendChild(_el('h4', 'tw-detail-heading', 'Turn #' + (turn.turn || index + 1) + ' Details'));

    // User message preview
    if (turn.userMessage) {
      infoCol.appendChild(_el('h5', 'tw-detail-heading', 'User Message'));
      var userPre = _el('div', 'tw-detail-preview', _truncate(turn.userMessage, 300));
      infoCol.appendChild(userPre);
    }

    // Assistant reply preview
    if (turn.assistantReply) {
      infoCol.appendChild(_el('h5', 'tw-detail-heading', 'Assistant Reply'));
      var assistPre = _el('div', 'tw-detail-preview', _truncate(turn.assistantReply, 300));
      infoCol.appendChild(assistPre);
    }

    // Tool calls list
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      infoCol.appendChild(_el('h5', 'tw-detail-heading', 'Tool Calls'));
      var toolList = _el('div');
      turn.toolCalls.forEach(function (tc) {
        var entry = _el('div', 'tw-detail-tool', typeof tc === 'string' ? tc : (tc.name || JSON.stringify(tc)));
        toolList.appendChild(entry);
      });
      infoCol.appendChild(toolList);
    }

    // Token breakdown table
    var table = _el('div');
    table.style.cssText = 'font-size:0.72rem;color:var(--tw-text2);margin-top:8px;';
    var total = _turnTotal(turn);
    CATEGORIES.forEach(function (cat) {
      var val = turn[cat] || 0;
      var line = _el('div');
      line.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' +
                       COLORS[cat] + ';margin-right:5px;vertical-align:middle;"></span>' +
                       LABELS[cat] + ': <b>' + _fmt(val) + '</b> (' + _pct(val, total) + '%)';
      table.appendChild(line);
    });
    var totalLine = _el('div');
    totalLine.style.fontWeight = '700';
    totalLine.style.marginTop = '4px';
    totalLine.textContent = 'Total: ' + _fmt(total);
    table.appendChild(totalLine);
    infoCol.appendChild(table);

    inner.appendChild(infoCol);

    // ---- Pie chart column ----
    var pieWrap = _el('div', 'tw-pie-wrap');
    pieWrap.appendChild(_buildMiniPie(turn));
    inner.appendChild(pieWrap);

    detailEl.appendChild(inner);
  }

  /** Build a small SVG pie chart for a single turn */
  function _buildMiniPie(turn) {
    var svgEl = _svg('svg');
    svgEl.classList.add('tw-pie-svg');
    svgEl.setAttribute('viewBox', '0 0 120 120');

    var cx = 60, cy = 60, r = 50;
    var total = _turnTotal(turn);
    if (total === 0) return svgEl;

    var startAngle = -Math.PI / 2; // start at 12 o'clock

    CATEGORIES.forEach(function (cat) {
      var val = turn[cat] || 0;
      if (val <= 0) return;
      var sweep = (val / total) * Math.PI * 2;
      var endAngle = startAngle + sweep;

      var x1 = cx + r * Math.cos(startAngle);
      var y1 = cy + r * Math.sin(startAngle);
      var x2 = cx + r * Math.cos(endAngle);
      var y2 = cy + r * Math.sin(endAngle);
      var largeArc = sweep > Math.PI ? 1 : 0;

      var path = _svg('path');
      var d = 'M ' + cx + ' ' + cy +
              ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
              ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) +
              ' Z';
      path.setAttribute('d', d);
      path.setAttribute('fill', COLORS[cat]);
      path.setAttribute('opacity', '0.85');
      svgEl.appendChild(path);

      startAngle = endAngle;
    });

    return svgEl;
  }

  // ============================================================
  //  IMPORT / EXPORT
  // ============================================================

  /**
   * Import an array of turn objects.
   * Expected format: [{ turn: 1, system: 500, user: 800, assistant: 1200, tools: 0 }, ...]
   * Optional fields per turn: userMessage, assistantReply, toolCalls
   */
  function importData(data) {
    if (!_inited) {
      console.warn('TokenWaterfall: not initialized. Call init() first.');
      return;
    }
    if (!Array.isArray(data)) {
      console.error('TokenWaterfall.importData: expected an array');
      return;
    }

    _turns = [];

    data.forEach(function (item, i) {
      _turns.push({
        turn:           item.turn || i + 1,
        system:         Math.max(0, parseInt(item.system) || 0),
        user:           Math.max(0, parseInt(item.user) || 0),
        assistant:      Math.max(0, parseInt(item.assistant) || 0),
        tools:          Math.max(0, parseInt(item.tools) || 0),
        userMessage:    item.userMessage || '',
        assistantReply: item.assistantReply || '',
        toolCalls:      Array.isArray(item.toolCalls) ? item.toolCalls : []
      });
    });

    // Truncate to maxTurns
    if (_turns.length > _options.maxTurns) {
      _turns = _turns.slice(0, _options.maxTurns);
    }

    _renderAll(true);
  }

  /** Export current turns as a JSON string */
  function exportData() {
    if (_turns.length === 0) return null;
    var out = _turns.map(function (t) {
      var obj = {
        turn: t.turn,
        system: t.system,
        user: t.user,
        assistant: t.assistant,
        tools: t.tools
      };
      if (t.userMessage) obj.userMessage = t.userMessage;
      if (t.assistantReply) obj.assistantReply = t.assistantReply;
      if (t.toolCalls && t.toolCalls.length) obj.toolCalls = t.toolCalls;
      return obj;
    });
    return JSON.stringify(out, null, 2);
  }

  /** Add a single turn (appended at the end). Triggers animated render. */
  function addTurn(turnData) {
    if (!_inited) {
      console.warn('TokenWaterfall: not initialized. Call init() first.');
      return;
    }

    var idx = _turns.length;
    _turns.push({
      turn:           turnData.turn || idx + 1,
      system:         Math.max(0, parseInt(turnData.system) || 0),
      user:           Math.max(0, parseInt(turnData.user) || 0),
      assistant:      Math.max(0, parseInt(turnData.assistant) || 0),
      tools:          Math.max(0, parseInt(turnData.tools) || 0),
      userMessage:    turnData.userMessage || '',
      assistantReply: turnData.assistantReply || '',
      toolCalls:      Array.isArray(turnData.toolCalls) ? turnData.toolCalls : []
    });

    // Enforce maxTurns
    if (_turns.length > _options.maxTurns) {
      _turns = _turns.slice(-_options.maxTurns);
    }

    _renderAll(true);
  }

  /** Clear all data and re-render */
  function clearData() {
    _turns = [];
    _expandedTurn = -1;
    _renderAll(false);
  }

  /** Scroll the chart so that a specific turn index is visible */
  function scrollToTurn(turnIndex) {
    if (!_inited || turnIndex < 0 || turnIndex >= _turns.length) return;
    var rows = _rowsContainer.querySelectorAll('.tw-row');
    if (rows[turnIndex]) {
      rows[turnIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Brief highlight flash
      rows[turnIndex].style.outline = '2px solid #8B5CF6';
      setTimeout(function () {
        rows[turnIndex].style.outline = '';
      }, 1200);
    }
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  /** Truncate a string with ellipsis */
  function _truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
  }

  /** Copy text to clipboard with fallback */
  function _copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        _fallbackCopy(text);
      });
    } else {
      _fallbackCopy(text);
    }
  }

  function _fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  /** Load sample data for demonstration */
  function _loadSampleData() {
    var sample = [];
    var cats = ['system', 'user', 'assistant', 'tools'];
    for (var i = 1; i <= 20; i++) {
      var turn = { turn: i };
      // System tokens decrease over conversation (cached)
      turn.system = i === 1 ? 1800 : Math.max(100, Math.floor(1800 - i * 80 + Math.random() * 200));
      // User tokens fluctuate
      turn.user = Math.floor(300 + Math.random() * 1500);
      // Assistant tokens tend to grow
      turn.assistant = Math.floor(600 + i * 100 + Math.random() * 800);
      // Tools used sporadically
      turn.tools = Math.random() > 0.5 ? Math.floor(200 + Math.random() * 1000) : 0;

      // Sample messages
      turn.userMessage = 'Sample user message for turn ' + i + '. This is a placeholder showing what the user might have said.';
      turn.assistantReply = 'Sample assistant reply for turn ' + i + '. The model provided a detailed response addressing the user query.';
      if (turn.tools > 0) {
        turn.toolCalls = ['search_documents', 'code_interpreter'].slice(0, Math.ceil(Math.random() * 2));
      }

      sample.push(turn);
    }
    importData(sample);
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  return {
    init: init,
    addTurn: addTurn,
    importData: importData,
    clearData: clearData,
    exportData: exportData,
    scrollToTurn: scrollToTurn
  };

})();

// Expose on window
window.TokenWaterfall = TokenWaterfall;
