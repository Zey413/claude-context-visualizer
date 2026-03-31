/**
 * Claude Context Window Visualizer — Model Cost Heatmap
 * Interactive heatmap comparing all Claude models across usage scenarios.
 * Shows per-request cost with color-coded cells (green=cheap, red=expensive),
 * sortable columns, generation filtering, and best-value / recommended badges.
 *
 * API: window.ModelHeatmap = { init, update, isInited }
 */

'use strict';

var ModelHeatmap = (function () {

  // ---- Constants ----

  /** Usage scenarios with token profiles */
  var SCENARIOS = [
    { id: 'light-chat',        name: 'Light Chat',        inputTokens: 2000,   outputTokens: 500,   cacheRatio: 0.00 },
    { id: 'coding-agent',      name: 'Coding Agent',      inputTokens: 50000,  outputTokens: 15000, cacheRatio: 0.30 },
    { id: 'rag-pipeline',      name: 'RAG Pipeline',      inputTokens: 100000, outputTokens: 5000,  cacheRatio: 0.60 },
    { id: 'document-analysis', name: 'Document Analysis',  inputTokens: 150000, outputTokens: 20000, cacheRatio: 0.50 },
    { id: 'long-conversation', name: 'Long Conversation',  inputTokens: 80000,  outputTokens: 30000, cacheRatio: 0.20 }
  ];

  /**
   * Capability score per tier — used for "recommended" (best capability/cost ratio) badge.
   * Higher = more capable. Rough relative scores for ranking purposes.
   */
  var TIER_CAPABILITY = {
    'flagship': 100,
    'balanced': 75,
    'speed':    50,
    'legacy':   40
  };

  // ---- State ----

  var _inited = false;
  var _container = null;
  var _sortScenario = null;   // index into SCENARIOS, or null for default order
  var _sortAsc = true;        // true = cheapest first
  var _filterGen = 'all';     // 'all' | '4.6' | '4.5' | '4' | '3.x'

  // DOM references
  var _tableEl = null;
  var _filterBar = null;
  var _tooltipEl = null;

  // ---- Theme detection ----

  function _isDark() {
    return document.documentElement.classList.contains('dark') ||
           document.body.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ---- Cost calculation ----

  /**
   * Calculate the cost of a single request for a given model and scenario.
   * Formula:
   *   cost = (input * (1 - cacheRatio) * inputPerMTok / 1e6)
   *        + (input * cacheRatio * cacheReadPerMTok / 1e6)
   *        + (output * outputPerMTok / 1e6)
   */
  function _calcCost(model, scenario) {
    var p = model.pricing;
    var inp = scenario.inputTokens;
    var out = scenario.outputTokens;
    var cr = scenario.cacheRatio;

    return (inp * (1 - cr) * p.inputPerMTok / 1e6) +
           (inp * cr * p.cacheReadPerMTok / 1e6) +
           (out * p.outputPerMTok / 1e6);
  }

  /**
   * Return a detailed cost breakdown object for tooltip display.
   */
  function _calcCostBreakdown(model, scenario) {
    var p = model.pricing;
    var inp = scenario.inputTokens;
    var out = scenario.outputTokens;
    var cr = scenario.cacheRatio;

    var directInput = inp * (1 - cr);
    var cachedInput = inp * cr;

    var directCost = directInput * p.inputPerMTok / 1e6;
    var cacheCost  = cachedInput * p.cacheReadPerMTok / 1e6;
    var outputCost = out * p.outputPerMTok / 1e6;
    var total      = directCost + cacheCost + outputCost;

    return {
      directInputTokens: directInput,
      cachedInputTokens: cachedInput,
      outputTokens: out,
      directCost: directCost,
      cacheCost: cacheCost,
      outputCost: outputCost,
      total: total
    };
  }

  /**
   * Format a dollar amount for display.
   */
  function _fmtCost(cost) {
    if (cost < 0.001) return '<$0.001';
    if (cost < 0.01)  return '$' + cost.toFixed(4);
    if (cost < 1)     return '$' + cost.toFixed(3);
    return '$' + cost.toFixed(2);
  }

  /**
   * Format a number with commas.
   */
  function _fmtNum(n) {
    return Math.round(n).toLocaleString();
  }

  // ---- Color mapping ----

  /**
   * Map a cost value to an HSL color, green (low) to red (high).
   * Uses logarithmic scale for better visual distribution across the range.
   * @param {number} cost    - the cost value
   * @param {number} minCost - minimum cost in the column
   * @param {number} maxCost - maximum cost in the column
   * @returns {string} HSL color string
   */
  function _costToColor(cost, minCost, maxCost) {
    if (maxCost <= minCost) return 'hsl(120, 70%, 42%)'; // all same -> green

    // Use log scale for better visual distribution
    var logMin = Math.log(minCost + 0.0001);
    var logMax = Math.log(maxCost + 0.0001);
    var logVal = Math.log(cost + 0.0001);

    // Normalize 0..1 (0 = cheapest, 1 = most expensive)
    var t = (logVal - logMin) / (logMax - logMin);
    t = Math.max(0, Math.min(1, t));

    // Hue: 120 (green) -> 0 (red)
    var hue = (1 - t) * 120;
    var saturation = 70;
    var lightness = _isDark() ? 38 : 42;

    return 'hsl(' + Math.round(hue) + ', ' + saturation + '%, ' + lightness + '%)';
  }

  // ---- Filtering & sorting helpers ----

  /**
   * Return the list of CLAUDE_MODELS filtered by the current generation filter.
   */
  function _filteredModels() {
    if (_filterGen === 'all') return CLAUDE_MODELS.slice();

    return CLAUDE_MODELS.filter(function (m) {
      if (_filterGen === '3.x') {
        return m.generation === '3' || m.generation === '3.5';
      }
      return m.generation === _filterGen;
    });
  }

  /**
   * Sort models by cost in a specific scenario column.
   */
  function _sortedModels(models) {
    if (_sortScenario === null) return models;

    var scenario = SCENARIOS[_sortScenario];
    var sorted = models.slice();
    sorted.sort(function (a, b) {
      var ca = _calcCost(a, scenario);
      var cb = _calcCost(b, scenario);
      return _sortAsc ? (ca - cb) : (cb - ca);
    });
    return sorted;
  }

  /**
   * Find the best-value (cheapest) model id for a given scenario.
   */
  function _bestValueId(models, scenarioIdx) {
    var scenario = SCENARIOS[scenarioIdx];
    var bestId = null;
    var bestCost = Infinity;

    for (var i = 0; i < models.length; i++) {
      var c = _calcCost(models[i], scenario);
      if (c < bestCost) {
        bestCost = c;
        bestId = models[i].id;
      }
    }
    return bestId;
  }

  /**
   * Find the "recommended" model (best capability/cost ratio) for a scenario.
   * Excludes the best-value model to avoid duplicate badges on the same cell.
   */
  function _recommendedId(models, scenarioIdx, bestValId) {
    var scenario = SCENARIOS[scenarioIdx];
    var bestId = null;
    var bestRatio = -1;

    for (var i = 0; i < models.length; i++) {
      if (models[i].id === bestValId) continue;
      var c = _calcCost(models[i], scenario);
      var cap = TIER_CAPABILITY[models[i].tier] || 50;
      var ratio = (c > 0) ? (cap / c) : 0;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestId = models[i].id;
      }
    }
    return bestId;
  }

  // ---- DOM helpers ----

  function _el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---- Tooltip ----

  function _showTooltip(evt, model, scenario) {
    if (!_tooltipEl) return;

    var bd = _calcCostBreakdown(model, scenario);
    var html =
      '<div class="mh-tt-title">' + model.name + ' \u2014 ' + scenario.name + '</div>' +
      '<table class="mh-tt-table">' +
        '<tr><td>Direct input</td><td>' + _fmtNum(bd.directInputTokens) + ' tok</td><td>' + _fmtCost(bd.directCost) + '</td></tr>' +
        '<tr><td>Cached input</td><td>' + _fmtNum(bd.cachedInputTokens) + ' tok</td><td>' + _fmtCost(bd.cacheCost) + '</td></tr>' +
        '<tr><td>Output</td><td>' + _fmtNum(bd.outputTokens) + ' tok</td><td>' + _fmtCost(bd.outputCost) + '</td></tr>' +
        '<tr class="mh-tt-total"><td>Total</td><td></td><td>' + _fmtCost(bd.total) + '</td></tr>' +
      '</table>' +
      '<div class="mh-tt-meta">Cache ratio: ' + Math.round(scenario.cacheRatio * 100) + '%</div>';

    _tooltipEl.innerHTML = html;
    _tooltipEl.style.display = 'block';
    _positionTooltip(evt);
  }

  function _positionTooltip(evt) {
    if (!_tooltipEl) return;
    var pad = 12;
    var x = evt.clientX + pad;
    var y = evt.clientY + pad;

    // Prevent tooltip from overflowing viewport edges
    var rect = _tooltipEl.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    if (x + rect.width > vw - pad) x = evt.clientX - rect.width - pad;
    if (y + rect.height > vh - pad) y = evt.clientY - rect.height - pad;

    _tooltipEl.style.left = x + 'px';
    _tooltipEl.style.top = y + 'px';
  }

  function _hideTooltip() {
    if (_tooltipEl) _tooltipEl.style.display = 'none';
  }

  // ============================================================
  //  BUILD DOM
  // ============================================================

  function _buildDOM() {
    _container.innerHTML = '';

    // Root wrapper
    var root = _el('div', 'mh-root');
    _container.appendChild(root);

    // Title row
    var header = _el('div', 'mh-header');
    var title = _el('h3', 'mh-title', 'Model Cost Heatmap');
    var subtitle = _el('span', 'mh-subtitle', 'Per-request cost across usage scenarios');
    header.appendChild(title);
    header.appendChild(subtitle);
    root.appendChild(header);

    // Filter bar
    _filterBar = _el('div', 'mh-filter-bar');
    var filterLabel = _el('span', 'mh-filter-label', 'Generation:');
    _filterBar.appendChild(filterLabel);

    var gens = ['all', '4.6', '4.5', '4', '3.x'];
    var genLabels = ['All', '4.6', '4.5', '4.0', '3.x'];
    for (var g = 0; g < gens.length; g++) {
      (function (genVal, label) {
        var btn = _el('button', 'mh-filter-btn' + (genVal === _filterGen ? ' mh-filter-btn--active' : ''), label);
        btn.setAttribute('data-gen', genVal);
        btn.addEventListener('click', function () {
          _filterGen = genVal;
          _render();
        });
        _filterBar.appendChild(btn);
      })(gens[g], genLabels[g]);
    }

    root.appendChild(_filterBar);

    // Legend
    var legend = _el('div', 'mh-legend');
    legend.innerHTML =
      '<span class="mh-legend-item"><span class="mh-legend-swatch" style="background:hsl(120,70%,42%)"></span> Low cost</span>' +
      '<span class="mh-legend-grad"></span>' +
      '<span class="mh-legend-item"><span class="mh-legend-swatch" style="background:hsl(0,70%,42%)"></span> High cost</span>' +
      '<span class="mh-legend-spacer"></span>' +
      '<span class="mh-legend-item"><span class="mh-badge mh-badge--best">Best Value</span> Cheapest</span>' +
      '<span class="mh-legend-item"><span class="mh-badge mh-badge--rec">Recommended</span> Best capability/cost</span>';
    root.appendChild(legend);

    // Table wrapper (horizontal scroll on small screens)
    var tableWrap = _el('div', 'mh-table-wrap');
    _tableEl = _el('table', 'mh-table');
    _tableEl.setAttribute('role', 'grid');
    _tableEl.setAttribute('aria-label', 'Model cost comparison heatmap');
    tableWrap.appendChild(_tableEl);
    root.appendChild(tableWrap);

    // Tooltip (fixed position, appended to body for proper layering)
    _tooltipEl = _el('div', 'mh-tooltip');
    _tooltipEl.style.display = 'none';
    document.body.appendChild(_tooltipEl);

    // Initial render
    _render();
  }

  // ============================================================
  //  RENDER TABLE
  // ============================================================

  function _render() {
    if (!_tableEl) return;

    var models = _sortedModels(_filteredModels());

    // Pre-compute cost matrix and per-column min/max for color scaling
    var costMatrix = []; // costMatrix[modelIdx][scenarioIdx]
    var colMin = [];
    var colMax = [];

    for (var s = 0; s < SCENARIOS.length; s++) {
      colMin[s] = Infinity;
      colMax[s] = 0;
    }

    for (var mi = 0; mi < models.length; mi++) {
      costMatrix[mi] = [];
      for (var si = 0; si < SCENARIOS.length; si++) {
        var c = _calcCost(models[mi], SCENARIOS[si]);
        costMatrix[mi][si] = c;
        if (c < colMin[si]) colMin[si] = c;
        if (c > colMax[si]) colMax[si] = c;
      }
    }

    // Best-value and recommended ids per scenario column
    var bestIds = [];
    var recIds = [];
    for (var bi = 0; bi < SCENARIOS.length; bi++) {
      bestIds[bi] = _bestValueId(models, bi);
      recIds[bi] = _recommendedId(models, bi, bestIds[bi]);
    }

    // Update filter bar active button state
    if (_filterBar) {
      var btns = _filterBar.querySelectorAll('.mh-filter-btn');
      for (var fb = 0; fb < btns.length; fb++) {
        var isActive = btns[fb].getAttribute('data-gen') === _filterGen;
        btns[fb].className = 'mh-filter-btn' + (isActive ? ' mh-filter-btn--active' : '');
      }
    }

    // Build HTML string for performance (avoids many individual DOM mutations)
    var html = '';

    // -- THEAD --
    html += '<thead><tr>';
    html += '<th class="mh-th mh-th-model" scope="col">Model</th>';
    for (var hi = 0; hi < SCENARIOS.length; hi++) {
      var sortIcon = '';
      if (_sortScenario === hi) {
        sortIcon = _sortAsc ? ' &#9650;' : ' &#9660;';
      }
      html += '<th class="mh-th mh-th-scenario" scope="col" data-scenario="' + hi + '" ' +
              'title="Click to sort by ' + SCENARIOS[hi].name + ' cost">' +
              SCENARIOS[hi].name + sortIcon +
              '<div class="mh-th-meta">' + _fmtNum(SCENARIOS[hi].inputTokens) + ' in / ' +
              _fmtNum(SCENARIOS[hi].outputTokens) + ' out</div>' +
              '</th>';
    }
    html += '</tr></thead>';

    // -- TBODY --
    html += '<tbody>';
    for (var ri = 0; ri < models.length; ri++) {
      var m = models[ri];
      html += '<tr class="mh-row">';

      // Model name cell (sticky left column)
      html += '<td class="mh-td mh-td-model">' +
              '<span class="mh-model-swatch" style="background:' + m.color + '"></span>' +
              '<span class="mh-model-name">' + m.name + '</span>' +
              '<span class="mh-model-gen">' + m.generation + '</span>' +
              '</td>';

      // Scenario cost cells
      for (var ci = 0; ci < SCENARIOS.length; ci++) {
        var cost = costMatrix[ri][ci];
        var bgColor = _costToColor(cost, colMin[ci], colMax[ci]);

        var badges = '';
        if (m.id === bestIds[ci]) {
          badges += '<span class="mh-badge mh-badge--best">Best Value</span>';
        }
        if (m.id === recIds[ci]) {
          badges += '<span class="mh-badge mh-badge--rec">Recommended</span>';
        }

        html += '<td class="mh-td mh-td-cost" ' +
                'style="background:' + bgColor + '" ' +
                'data-model="' + m.id + '" ' +
                'data-scenario="' + ci + '">' +
                '<span class="mh-cost-value">' + _fmtCost(cost) + '</span>' +
                badges +
                '</td>';
      }

      html += '</tr>';
    }
    html += '</tbody>';

    _tableEl.innerHTML = html;

    // -- Bind events --

    // Column header click -> sort toggle
    var ths = _tableEl.querySelectorAll('.mh-th-scenario');
    for (var ti = 0; ti < ths.length; ti++) {
      (function (th) {
        th.addEventListener('click', function () {
          var idx = parseInt(th.getAttribute('data-scenario'), 10);
          if (_sortScenario === idx) {
            _sortAsc = !_sortAsc;
          } else {
            _sortScenario = idx;
            _sortAsc = true;
          }
          _render();
        });
      })(ths[ti]);
    }

    // Cost cell hover -> tooltip
    var cells = _tableEl.querySelectorAll('.mh-td-cost');
    for (var ci2 = 0; ci2 < cells.length; ci2++) {
      (function (cell) {
        cell.addEventListener('mouseenter', function (evt) {
          var modelId = cell.getAttribute('data-model');
          var scenarioIdx = parseInt(cell.getAttribute('data-scenario'), 10);

          var model = null;
          for (var mm = 0; mm < CLAUDE_MODELS.length; mm++) {
            if (CLAUDE_MODELS[mm].id === modelId) { model = CLAUDE_MODELS[mm]; break; }
          }
          if (model) _showTooltip(evt, model, SCENARIOS[scenarioIdx]);
        });

        cell.addEventListener('mousemove', function (evt) {
          _positionTooltip(evt);
        });

        cell.addEventListener('mouseleave', function () {
          _hideTooltip();
        });
      })(cells[ci2]);
    }
  }

  // ============================================================
  //  STYLES (injected once into <head>)
  // ============================================================

  function _injectStyles() {
    if (document.getElementById('mh-styles')) return;

    var dark = '.dark .mh-root, .mh-root.mh-dark';

    var css = [
      // ---- Root & theme variables ----
      '.mh-root {',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  --mh-bg: #ffffff; --mh-bg2: #f8fafc; --mh-border: #e2e8f0;',
      '  --mh-text: #1e293b; --mh-text2: #64748b; --mh-hover: #f1f5f9;',
      '  --mh-shadow: 0 4px 24px rgba(0,0,0,.08);',
      '}',
      dark + ' {',
      '  --mh-bg: #1e1e2e; --mh-bg2: #181825; --mh-border: #313244;',
      '  --mh-text: #cdd6f4; --mh-text2: #a6adc8; --mh-hover: #313244;',
      '  --mh-shadow: 0 4px 24px rgba(0,0,0,.3);',
      '}',

      // ---- Header ----
      '.mh-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }',
      '.mh-title { font-size: 1.1rem; font-weight: 700; color: var(--mh-text); margin: 0; }',
      '.mh-subtitle { font-size: 0.8rem; color: var(--mh-text2); }',

      // ---- Filter bar ----
      '.mh-filter-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }',
      '.mh-filter-label { font-size: 0.78rem; color: var(--mh-text2); font-weight: 600; margin-right: 2px; }',
      '.mh-filter-btn {',
      '  padding: 4px 12px; font-size: 0.75rem; border: 1px solid var(--mh-border);',
      '  border-radius: 6px; background: var(--mh-bg2); color: var(--mh-text);',
      '  cursor: pointer; transition: all .15s;',
      '}',
      '.mh-filter-btn:hover { border-color: #8B5CF6; }',
      '.mh-filter-btn--active {',
      '  background: #8B5CF6; color: #fff; border-color: #8B5CF6;',
      '}',

      // ---- Legend ----
      '.mh-legend {',
      '  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;',
      '  margin-bottom: 12px; font-size: 0.73rem; color: var(--mh-text2);',
      '}',
      '.mh-legend-item { display: flex; align-items: center; gap: 4px; }',
      '.mh-legend-swatch { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; }',
      '.mh-legend-grad {',
      '  width: 80px; height: 14px; border-radius: 3px; flex-shrink: 0;',
      '  background: linear-gradient(90deg, hsl(120,70%,42%), hsl(60,70%,42%), hsl(0,70%,42%));',
      '}',
      '.mh-legend-spacer { width: 16px; }',

      // ---- Table wrapper ----
      '.mh-table-wrap {',
      '  overflow-x: auto; border: 1px solid var(--mh-border); border-radius: 10px;',
      '  background: var(--mh-bg); box-shadow: var(--mh-shadow);',
      '}',

      // ---- Table ----
      '.mh-table {',
      '  width: 100%; border-collapse: separate; border-spacing: 0;',
      '  table-layout: fixed; min-width: 700px;',
      '}',

      // ---- TH ----
      '.mh-th {',
      '  padding: 12px 10px 8px; font-size: 0.78rem; font-weight: 700;',
      '  color: var(--mh-text); text-align: center;',
      '  border-bottom: 2px solid var(--mh-border); background: var(--mh-bg2);',
      '  position: sticky; top: 0; z-index: 2;',
      '}',
      '.mh-th-model { text-align: left; width: 190px; min-width: 160px; }',
      '.mh-th-scenario {',
      '  cursor: pointer; user-select: none; transition: background .12s;',
      '}',
      '.mh-th-scenario:hover { background: var(--mh-hover); }',
      '.mh-th-meta {',
      '  font-size: 0.65rem; font-weight: 400; color: var(--mh-text2);',
      '  margin-top: 2px; white-space: nowrap;',
      '}',

      // ---- TD ----
      '.mh-td {',
      '  padding: 10px 8px; font-size: 0.78rem; border-bottom: 1px solid var(--mh-border);',
      '}',
      '.mh-td-model {',
      '  display: flex; align-items: center; gap: 8px; background: var(--mh-bg);',
      '  position: sticky; left: 0; z-index: 1;',
      '}',
      '.mh-model-swatch {',
      '  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;',
      '}',
      '.mh-model-name {',
      '  font-weight: 600; color: var(--mh-text); white-space: nowrap;',
      '  overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.mh-model-gen {',
      '  font-size: 0.65rem; color: var(--mh-text2); background: var(--mh-bg2);',
      '  padding: 1px 6px; border-radius: 4px; flex-shrink: 0;',
      '}',

      // ---- Cost cell ----
      '.mh-td-cost {',
      '  text-align: center; font-variant-numeric: tabular-nums;',
      '  cursor: default; transition: opacity .12s; position: relative;',
      '}',
      '.mh-td-cost:hover { opacity: 0.85; }',
      '.mh-cost-value {',
      '  font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.45);',
      '  font-size: 0.82rem;',
      '}',

      // ---- Badges ----
      '.mh-badge {',
      '  display: inline-block; font-size: 0.6rem; font-weight: 700;',
      '  padding: 1px 6px; border-radius: 4px; margin-left: 4px;',
      '  vertical-align: middle; text-transform: uppercase; letter-spacing: 0.02em;',
      '}',
      '.mh-badge--best { background: #22c55e; color: #fff; }',
      '.mh-badge--rec  { background: #3b82f6; color: #fff; }',

      // ---- Tooltip ----
      '.mh-tooltip {',
      '  position: fixed; z-index: 10000; pointer-events: none;',
      '  background: #fff; color: #1e293b;',
      '  border: 1px solid #e2e8f0; border-radius: 10px;',
      '  padding: 12px 14px; min-width: 240px; max-width: 340px;',
      '  box-shadow: 0 8px 32px rgba(0,0,0,.18); font-size: 0.75rem;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '}',
      // Dark tooltip — match on common dark-mode ancestors
      '.dark .mh-tooltip, body.dark .mh-tooltip {',
      '  background: #1e1e2e; color: #cdd6f4; border-color: #313244;',
      '}',
      '.mh-tt-title {',
      '  font-weight: 700; font-size: 0.82rem; margin-bottom: 8px;',
      '  padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;',
      '}',
      '.dark .mh-tt-title { border-bottom-color: #313244; }',
      '.mh-tt-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }',
      '.mh-tt-table td {',
      '  padding: 2px 6px 2px 0; font-size: 0.72rem; color: #64748b;',
      '}',
      '.dark .mh-tt-table td { color: #a6adc8; }',
      '.mh-tt-table td:last-child {',
      '  text-align: right; font-weight: 600; color: #1e293b;',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.dark .mh-tt-table td:last-child { color: #cdd6f4; }',
      '.mh-tt-total td {',
      '  padding-top: 4px; border-top: 1px solid #e2e8f0;',
      '  font-weight: 700; color: #1e293b !important;',
      '}',
      '.dark .mh-tt-total td { border-top-color: #313244; color: #cdd6f4 !important; }',
      '.mh-tt-meta {',
      '  font-size: 0.68rem; color: #64748b; margin-top: 2px;',
      '}',
      '.dark .mh-tt-meta { color: #a6adc8; }',

      // ---- Row hover highlight ----
      '.mh-row { transition: background .1s; }',
      '.mh-row:hover .mh-td-model { background: var(--mh-hover); }',

      // ---- Responsive ----
      '@media (max-width: 640px) {',
      '  .mh-th-model { width: 130px; min-width: 110px; }',
      '  .mh-table { min-width: 560px; }',
      '  .mh-model-name { font-size: 0.72rem; }',
      '}'
    ].join('\n');

    var styleEl = document.createElement('style');
    styleEl.id = 'mh-styles';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  /**
   * Initialize the heatmap into a container element.
   * @param {string} containerId - ID of the container DOM element
   */
  function init(containerId) {
    if (_inited) return;

    var host = document.getElementById(containerId);
    if (!host) {
      console.warn('ModelHeatmap: container #' + containerId + ' not found');
      return;
    }
    _container = host;

    _injectStyles();
    _buildDOM();
    _inited = true;
  }

  /**
   * Re-render the heatmap (e.g. after theme change or external data update).
   */
  function update() {
    if (!_inited) return;
    _render();
  }

  /**
   * Whether the module has been initialized.
   * @returns {boolean}
   */
  function isInited() {
    return _inited;
  }

  // ---- Expose public interface ----
  return {
    init: init,
    update: update,
    isInited: isInited
  };

})();

// Expose globally
window.ModelHeatmap = ModelHeatmap;
