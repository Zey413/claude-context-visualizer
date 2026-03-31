/**
 * Claude Context Window Visualizer — Model Cost Heatmap
 * Interactive heatmap comparing request costs across all Claude models
 * and usage scenarios. Color-coded from green (cheapest) to red (most expensive).
 *
 * API: window.ModelHeatmap = { init, update, isInited }
 */

'use strict';

var ModelHeatmap = (function () {

  // ---- Constants ----

  var SCENARIOS = [
    { id: 'light-chat',   name: 'Light Chat',         icon: '💬', input: 2000,   output: 500,   cacheRatio: 0   },
    { id: 'coding-agent',  name: 'Coding Agent',       icon: '💻', input: 50000,  output: 15000, cacheRatio: 0.3 },
    { id: 'rag-pipeline',  name: 'RAG Pipeline',       icon: '🔍', input: 100000, output: 5000,  cacheRatio: 0.6 },
    { id: 'doc-analysis',  name: 'Doc Analysis',       icon: '📄', input: 150000, output: 20000, cacheRatio: 0.5 },
    { id: 'long-convo',    name: 'Long Conversation',  icon: '📜', input: 80000,  output: 30000, cacheRatio: 0.2 }
  ];

  var GENERATION_FILTERS = ['All', '4.6', '4.5', '4', '3.5', '3'];

  // ---- State ----

  var _inited = false;
  var _container = null;
  var _sortCol = -1;       // -1 = no sort, 0..4 = scenario index
  var _sortAsc = true;
  var _filterGen = 'All';
  var _tooltip = null;

  // ---- Cost Calculation ----

  function calcCost(model, scenario) {
    var p = model.pricing;
    if (!p) return 0;
    var inputTokens = scenario.input;
    var outputTokens = scenario.output;
    var cacheRatio = scenario.cacheRatio;

    var cost = (inputTokens * (1 - cacheRatio) * p.inputPerMTok / 1e6)
             + (inputTokens * cacheRatio * (p.cacheReadPerMTok || 0) / 1e6)
             + (outputTokens * p.outputPerMTok / 1e6);
    return cost;
  }

  function formatCost(c) {
    if (c < 0.001) return '<$0.001';
    if (c < 0.01)  return '$' + c.toFixed(4);
    if (c < 1)     return '$' + c.toFixed(3);
    return '$' + c.toFixed(2);
  }

  // ---- Color Gradient ----

  // Map a normalized value [0, 1] to a HSL color from green (120) to red (0)
  function costColor(value) {
    var hue = Math.round((1 - value) * 120); // 120 = green, 0 = red
    return 'hsl(' + hue + ', 70%, 40%)';
  }

  function costBgColor(value) {
    var hue = Math.round((1 - value) * 120);
    return 'hsla(' + hue + ', 70%, 40%, 0.15)';
  }

  // ---- Build Cost Matrix ----

  function buildMatrix() {
    if (typeof CLAUDE_MODELS === 'undefined') return [];

    var models = CLAUDE_MODELS;
    if (_filterGen !== 'All') {
      models = models.filter(function (m) { return m.generation === _filterGen; });
    }

    var matrix = [];
    for (var i = 0; i < models.length; i++) {
      var row = { model: models[i], costs: [] };
      for (var j = 0; j < SCENARIOS.length; j++) {
        row.costs.push(calcCost(models[i], SCENARIOS[j]));
      }
      matrix.push(row);
    }

    // Sort by column if active
    if (_sortCol >= 0 && _sortCol < SCENARIOS.length) {
      matrix.sort(function (a, b) {
        var diff = a.costs[_sortCol] - b.costs[_sortCol];
        return _sortAsc ? diff : -diff;
      });
    }

    return matrix;
  }

  // ---- Find min cost per scenario for "Best Value" badge ----

  function findBestPerScenario(matrix) {
    var bests = [];
    for (var j = 0; j < SCENARIOS.length; j++) {
      var minCost = Infinity;
      var minIdx = -1;
      for (var i = 0; i < matrix.length; i++) {
        if (matrix[i].costs[j] < minCost) {
          minCost = matrix[i].costs[j];
          minIdx = i;
        }
      }
      bests.push(minIdx);
    }
    return bests;
  }

  // ---- Render ----

  function render() {
    if (!_container) return;

    var matrix = buildMatrix();
    var bests = findBestPerScenario(matrix);

    // Find global min/max for color normalization
    var allCosts = [];
    for (var i = 0; i < matrix.length; i++) {
      for (var j = 0; j < matrix[i].costs.length; j++) {
        allCosts.push(matrix[i].costs[j]);
      }
    }
    var minCost = Math.min.apply(null, allCosts) || 0;
    var maxCost = Math.max.apply(null, allCosts) || 1;
    var range = maxCost - minCost || 1;

    // Build HTML
    var html = '';

    // Filter buttons
    html += '<div class="mhm-filters">';
    for (var f = 0; f < GENERATION_FILTERS.length; f++) {
      var gen = GENERATION_FILTERS[f];
      var active = gen === _filterGen ? ' mhm-filter--active' : '';
      html += '<button class="mhm-filter' + active + '" data-gen="' + gen + '">' + gen + '</button>';
    }
    html += '</div>';

    // Table
    html += '<div class="mhm-table-wrap"><table class="mhm-table" role="grid">';

    // Header
    html += '<thead><tr><th class="mhm-th mhm-th--model">Model</th>';
    for (var s = 0; s < SCENARIOS.length; s++) {
      var sortIndicator = '';
      if (_sortCol === s) {
        sortIndicator = _sortAsc ? ' ↑' : ' ↓';
      }
      html += '<th class="mhm-th mhm-th--scenario" data-col="' + s + '">'
            + '<span class="mhm-th-icon">' + SCENARIOS[s].icon + '</span>'
            + '<span class="mhm-th-name">' + SCENARIOS[s].name + sortIndicator + '</span>'
            + '</th>';
    }
    html += '</tr></thead>';

    // Body
    html += '<tbody>';
    for (var r = 0; r < matrix.length; r++) {
      var row = matrix[r];
      var model = row.model;
      html += '<tr>';
      html += '<td class="mhm-td mhm-td--model">'
            + '<span class="mhm-model-dot" style="background:' + model.color + '"></span>'
            + '<span class="mhm-model-name">' + model.name + '</span>'
            + '<span class="mhm-tier mhm-tier--' + model.tier + '">' + model.tier + '</span>'
            + '</td>';

      for (var c = 0; c < row.costs.length; c++) {
        var cost = row.costs[c];
        var norm = (cost - minCost) / range;
        var bgColor = costBgColor(norm);
        var textColor = costColor(norm);
        var badge = '';
        if (bests[c] === r) {
          badge = '<span class="mhm-badge mhm-badge--best">Best</span>';
        }

        // Build tooltip data attributes
        var sc = SCENARIOS[c];
        html += '<td class="mhm-td mhm-td--cost" style="background:' + bgColor + ';color:' + textColor + '"'
              + ' data-model="' + model.name + '"'
              + ' data-scenario="' + sc.name + '"'
              + ' data-input="' + sc.input + '"'
              + ' data-output="' + sc.output + '"'
              + ' data-cache="' + Math.round(sc.cacheRatio * 100) + '"'
              + ' data-cost="' + cost.toFixed(6) + '"'
              + '>'
              + formatCost(cost) + badge
              + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    // Legend
    html += '<div class="mhm-legend">';
    html += '<span class="mhm-legend-label">Cheapest</span>';
    html += '<div class="mhm-legend-bar"></div>';
    html += '<span class="mhm-legend-label">Most Expensive</span>';
    html += '</div>';

    _container.innerHTML = html;

    // Bind events
    bindEvents();
  }

  function bindEvents() {
    if (!_container) return;

    // Column sort
    var ths = _container.querySelectorAll('.mhm-th--scenario');
    for (var i = 0; i < ths.length; i++) {
      ths[i].addEventListener('click', handleSort);
    }

    // Filter buttons
    var filters = _container.querySelectorAll('.mhm-filter');
    for (var f = 0; f < filters.length; f++) {
      filters[f].addEventListener('click', handleFilter);
    }

    // Tooltip on cost cells
    var cells = _container.querySelectorAll('.mhm-td--cost');
    for (var c = 0; c < cells.length; c++) {
      cells[c].addEventListener('mouseenter', showTooltip);
      cells[c].addEventListener('mouseleave', hideTooltip);
    }
  }

  function handleSort(e) {
    var col = parseInt(e.currentTarget.getAttribute('data-col'));
    if (_sortCol === col) {
      _sortAsc = !_sortAsc;
    } else {
      _sortCol = col;
      _sortAsc = true;
    }
    render();
  }

  function handleFilter(e) {
    _filterGen = e.currentTarget.getAttribute('data-gen');
    _sortCol = -1; // reset sort on filter change
    render();
  }

  function showTooltip(e) {
    var td = e.currentTarget;
    if (!_tooltip) {
      _tooltip = document.createElement('div');
      _tooltip.className = 'mhm-tooltip';
      document.body.appendChild(_tooltip);
    }

    var modelName = td.getAttribute('data-model');
    var scenarioName = td.getAttribute('data-scenario');
    var inputTok = td.getAttribute('data-input');
    var outputTok = td.getAttribute('data-output');
    var cachePct = td.getAttribute('data-cache');
    var cost = parseFloat(td.getAttribute('data-cost'));

    _tooltip.innerHTML =
      '<div class="mhm-tooltip-title">' + modelName + '</div>' +
      '<div class="mhm-tooltip-scenario">' + scenarioName + '</div>' +
      '<div class="mhm-tooltip-row">Input: ' + Number(inputTok).toLocaleString() + ' tokens</div>' +
      '<div class="mhm-tooltip-row">Output: ' + Number(outputTok).toLocaleString() + ' tokens</div>' +
      '<div class="mhm-tooltip-row">Cache: ' + cachePct + '%</div>' +
      '<div class="mhm-tooltip-cost">Cost: $' + cost.toFixed(4) + '</div>';

    _tooltip.style.display = 'block';

    var rect = td.getBoundingClientRect();
    _tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    _tooltip.style.top = (rect.top - 8) + 'px';
    _tooltip.style.transform = 'translate(-50%, -100%)';
  }

  function hideTooltip() {
    if (_tooltip) _tooltip.style.display = 'none';
  }

  // ---- Inject Styles ----

  function injectStyles() {
    if (document.getElementById('mhm-styles')) return;
    var css = '' +
    '.mhm-filters { display:flex; gap:0.3rem; margin-bottom:0.8rem; flex-wrap:wrap; }' +
    '.mhm-filter { padding:0.3rem 0.6rem; font-size:0.75rem; font-weight:600; font-family:inherit;' +
    '  border:1px solid var(--border-color); border-radius:0.3rem; background:var(--bg-card);' +
    '  color:var(--text-secondary); cursor:pointer; transition:all 0.2s; }' +
    '.mhm-filter:hover { border-color:var(--accent-purple); color:var(--text-primary); }' +
    '.mhm-filter--active { background:var(--accent-purple); color:#fff; border-color:var(--accent-purple); }' +

    '.mhm-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:var(--radius-md);' +
    '  border:1px solid var(--border-color); }' +
    '.mhm-table { width:100%; border-collapse:collapse; font-size:0.78rem; }' +

    '.mhm-th { padding:0.6rem 0.5rem; text-align:center; font-weight:600; font-size:0.72rem;' +
    '  text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted);' +
    '  border-bottom:2px solid var(--border-color); cursor:pointer; transition:color 0.2s; white-space:nowrap; }' +
    '.mhm-th:hover { color:var(--text-primary); }' +
    '.mhm-th--model { text-align:left; cursor:default; min-width:160px; }' +
    '.mhm-th-icon { margin-right:0.3rem; }' +

    '.mhm-td { padding:0.5rem; border-bottom:1px solid var(--border-color); transition:background 0.2s; }' +
    '.mhm-td--model { display:flex; align-items:center; gap:0.4rem; min-width:160px; }' +
    '.mhm-td--cost { text-align:center; font-weight:700; font-variant-numeric:tabular-nums;' +
    '  font-family:"SF Mono","Fira Code",monospace; font-size:0.75rem; cursor:default; position:relative; white-space:nowrap; }' +
    '.mhm-td--cost:hover { filter:brightness(1.2); }' +

    '.mhm-model-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }' +
    '.mhm-model-name { font-weight:600; color:var(--text-primary); white-space:nowrap; }' +

    '.mhm-tier { font-size:0.6rem; font-weight:600; padding:0.1rem 0.35rem; border-radius:0.2rem;' +
    '  text-transform:uppercase; letter-spacing:0.4px; margin-left:auto; }' +
    '.mhm-tier--flagship { background:rgba(168,85,247,0.2); color:#A855F7; }' +
    '.mhm-tier--balanced { background:rgba(99,102,241,0.2); color:#818CF8; }' +
    '.mhm-tier--speed { background:rgba(6,182,212,0.2); color:#06B6D4; }' +
    '.mhm-tier--legacy { background:rgba(100,116,139,0.2); color:#94A3B8; }' +

    '.mhm-badge { display:inline-block; font-size:0.55rem; font-weight:700; padding:0.05rem 0.3rem;' +
    '  border-radius:0.2rem; margin-left:0.3rem; vertical-align:middle; text-transform:uppercase; }' +
    '.mhm-badge--best { background:rgba(16,185,129,0.25); color:#10B981; }' +

    '.mhm-legend { display:flex; align-items:center; gap:0.5rem; justify-content:center; margin-top:0.8rem; }' +
    '.mhm-legend-label { font-size:0.7rem; color:var(--text-muted); }' +
    '.mhm-legend-bar { width:120px; height:10px; border-radius:5px;' +
    '  background:linear-gradient(90deg, hsl(120,70%,40%), hsl(60,70%,40%), hsl(0,70%,40%)); }' +

    '.mhm-tooltip { position:fixed; z-index:10001; background:var(--tooltip-bg);' +
    '  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);' +
    '  border:1px solid var(--border-hover); border-radius:var(--radius-sm);' +
    '  padding:0.5rem 0.7rem; font-size:0.72rem; color:var(--text-primary);' +
    '  pointer-events:none; display:none; box-shadow:0 4px 16px rgba(0,0,0,0.3); white-space:nowrap; }' +
    '.mhm-tooltip-title { font-weight:700; font-size:0.8rem; margin-bottom:0.15rem; }' +
    '.mhm-tooltip-scenario { color:var(--text-muted); font-size:0.68rem; margin-bottom:0.3rem; }' +
    '.mhm-tooltip-row { color:var(--text-secondary); font-size:0.7rem; line-height:1.5; }' +
    '.mhm-tooltip-cost { font-weight:700; color:var(--accent-green); margin-top:0.25rem; font-size:0.85rem; }' +

    '@media (max-width:600px) {' +
    '  .mhm-th--model { min-width:100px; }' +
    '  .mhm-model-name { font-size:0.7rem; }' +
    '  .mhm-td--cost { font-size:0.65rem; padding:0.35rem; }' +
    '  .mhm-tier { display:none; }' +
    '}';

    var style = document.createElement('style');
    style.id = 'mhm-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Public API ----

  function init(containerId) {
    if (_inited) return;
    _container = document.getElementById(containerId);
    if (!_container) return;

    injectStyles();
    render();
    _inited = true;
  }

  function update() {
    if (!_inited) return;
    render();
  }

  function isInited() { return _inited; }

  return {
    init: init,
    update: update,
    isInited: isInited
  };

})();

window.ModelHeatmap = ModelHeatmap;
