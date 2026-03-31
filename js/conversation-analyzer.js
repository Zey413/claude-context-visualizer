/**
 * Claude Context Window Visualizer — Conversation Analyzer Module
 * Batch-analyzes Claude API conversation logs and generates statistical reports.
 * Supports Claude API response format and simplified turn-based format.
 * Features: drag-and-drop JSON import, statistics dashboard, SVG trend chart,
 * conversation card list with expandable detail, cross-module integration,
 * and Markdown report export.
 *
 * API:  window.ConversationAnalyzer = { init, parse, getStats, loadSampleData, isInited }
 */

'use strict';

var ConversationAnalyzer = (function () {

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

  // SVG trend chart dimensions
  var SVG_W = 720;
  var SVG_H = 200;
  var SVG_PAD = { top: 20, right: 20, bottom: 30, left: 55 };

  // CSS class prefix
  var P = 'ca-';

  // ---- State ----

  var _inited = false;
  var _container = null;
  var _turns = [];       // Normalized: [{ turn, system, user, assistant, tools }]
  var _expandedIdx = -1; // Currently expanded card index

  // DOM element references
  var _els = {};

  // ---- Theme detection ----

  function _isDark() {
    return document.documentElement.classList.contains('dark') ||
           document.body.classList.contains('dark') ||
           document.documentElement.getAttribute('data-theme') === 'dark' ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ---- Utility helpers ----

  /** Format number with comma separators */
  function _fmt(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Create an HTML element with optional class and text */
  function _el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Create SVG element in SVG namespace */
  function _svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
      }
    }
    return el;
  }

  /** Compute total tokens for a single turn */
  function _turnTotal(t) {
    return (t.system || 0) + (t.user || 0) + (t.assistant || 0) + (t.tools || 0);
  }

  /** Percentage string with 1 decimal */
  function _pct(val, total) {
    if (!total) return '0.0';
    return (val / total * 100).toFixed(1);
  }

  /** Get currently selected model from global CLAUDE_MODELS + app state */
  function _getSelectedModel() {
    // Try to read from the model-select dropdown directly
    var sel = document.getElementById('model-select');
    if (sel && typeof CLAUDE_MODELS !== 'undefined' && CLAUDE_MODELS[sel.value]) {
      return CLAUDE_MODELS[parseInt(sel.value, 10)] || CLAUDE_MODELS[0];
    }
    // Fallback: first model
    if (typeof CLAUDE_MODELS !== 'undefined' && CLAUDE_MODELS.length > 0) {
      return CLAUDE_MODELS[0];
    }
    // Ultimate fallback
    return {
      name: 'Claude Sonnet 4.6',
      contextWindow: 1000000,
      pricing: { inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 }
    };
  }

  // ============================================================
  //  CSS — injected once into <head>
  // ============================================================

  function _injectStyles() {
    if (document.getElementById(P + 'styles')) return;

    var css = [
      // ---- Theme variables ----
      '.' + P + 'root {',
      '  --ca-bg: #ffffff; --ca-bg2: #f8fafc; --ca-bg3: #f1f5f9;',
      '  --ca-border: #e2e8f0; --ca-text: #1e293b; --ca-text2: #64748b; --ca-text3: #94a3b8;',
      '  --ca-hover: #f1f5f9; --ca-shadow: 0 4px 24px rgba(0,0,0,.08);',
      '  --ca-accent: #8B5CF6; --ca-accent-light: rgba(139,92,246,.12);',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  position: relative; color: var(--ca-text);',
      '}',
      '.dark .' + P + 'root, .' + P + 'root.' + P + 'dark {',
      '  --ca-bg: #1e1e2e; --ca-bg2: #181825; --ca-bg3: #11111b;',
      '  --ca-border: #313244; --ca-text: #cdd6f4; --ca-text2: #a6adc8; --ca-text3: #585b70;',
      '  --ca-hover: #313244; --ca-shadow: 0 4px 24px rgba(0,0,0,.35);',
      '  --ca-accent: #8B5CF6; --ca-accent-light: rgba(139,92,246,.18);',
      '}',

      // ---- Header ----
      '.' + P + 'header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:16px; }',
      '.' + P + 'title { font-size:1.1rem; font-weight:700; margin:0; color:var(--ca-text); }',
      '.' + P + 'title-icon { margin-right:6px; }',

      // ---- Legend ----
      '.' + P + 'legend { display:flex; gap:14px; flex-wrap:wrap; }',
      '.' + P + 'legend-item { display:flex; align-items:center; gap:5px; font-size:.75rem; color:var(--ca-text2); }',
      '.' + P + 'legend-dot { width:10px; height:10px; border-radius:3px; flex-shrink:0; }',

      // ---- Input zone (textarea + drag-drop) ----
      '.' + P + 'input-zone { margin-bottom:16px; }',
      '.' + P + 'drop-area { position:relative; border:2px dashed var(--ca-border); border-radius:10px; padding:10px; background:var(--ca-bg2); transition:border-color .2s, background .2s; }',
      '.' + P + 'drop-area--over { border-color:var(--ca-accent); background:var(--ca-accent-light); }',
      '.' + P + 'drop-hint { text-align:center; font-size:.78rem; color:var(--ca-text3); padding:4px 0 6px; user-select:none; }',
      '.' + P + 'drop-hint b { color:var(--ca-accent); }',
      '.' + P + 'textarea { width:100%; min-height:100px; max-height:240px; resize:vertical; border:1px solid var(--ca-border); border-radius:8px; padding:10px 12px; font-size:.78rem; font-family:"SF Mono",SFMono-Regular,Menlo,Consolas,monospace; line-height:1.5; background:var(--ca-bg); color:var(--ca-text); box-sizing:border-box; outline:none; transition:border-color .15s; }',
      '.' + P + 'textarea:focus { border-color:var(--ca-accent); }',
      '.' + P + 'textarea::placeholder { color:var(--ca-text3); }',

      // ---- Button row ----
      '.' + P + 'btn-row { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }',
      '.' + P + 'btn { padding:6px 16px; font-size:.78rem; font-weight:500; border:1px solid var(--ca-border); border-radius:6px; background:var(--ca-bg2); color:var(--ca-text); cursor:pointer; transition:background .15s, border-color .15s, transform .1s; user-select:none; }',
      '.' + P + 'btn:hover { background:var(--ca-hover); border-color:var(--ca-accent); }',
      '.' + P + 'btn:active { transform:scale(.97); }',
      '.' + P + 'btn--primary { background:var(--ca-accent); color:#fff; border-color:var(--ca-accent); }',
      '.' + P + 'btn--primary:hover { background:#7C3AED; border-color:#7C3AED; }',
      '.' + P + 'btn--sm { padding:4px 12px; font-size:.72rem; }',

      // ---- Error / status message ----
      '.' + P + 'msg { font-size:.78rem; padding:8px 12px; border-radius:6px; margin-top:8px; display:none; }',
      '.' + P + 'msg--err { display:block; background:#FEE2E2; color:#991B1B; border:1px solid #FECACA; }',
      '.' + P + 'msg--ok  { display:block; background:#D1FAE5; color:#065F46; border:1px solid #A7F3D0; }',
      '.dark .' + P + 'msg--err, .' + P + 'dark .' + P + 'msg--err { background:rgba(239,68,68,.15); color:#FCA5A5; border-color:rgba(239,68,68,.3); }',
      '.dark .' + P + 'msg--ok, .' + P + 'dark .' + P + 'msg--ok  { background:rgba(16,185,129,.15); color:#6EE7B7; border-color:rgba(16,185,129,.3); }',

      // ---- Stats panel ----
      '.' + P + 'stats { display:none; margin-bottom:18px; }',
      '.' + P + 'stats--visible { display:block; }',
      '.' + P + 'stats-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; margin-bottom:14px; }',
      '.' + P + 'stat-card { background:var(--ca-bg2); border:1px solid var(--ca-border); border-radius:8px; padding:12px 14px; }',
      '.' + P + 'stat-label { font-size:.68rem; color:var(--ca-text3); text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px; }',
      '.' + P + 'stat-value { font-size:1.25rem; font-weight:700; color:var(--ca-text); font-variant-numeric:tabular-nums; }',
      '.' + P + 'stat-sub { font-size:.68rem; color:var(--ca-text2); margin-top:2px; }',

      // ---- Category summary row ----
      '.' + P + 'cat-summary { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }',
      '.' + P + 'cat-item { flex:1; min-width:130px; border-radius:8px; padding:10px 12px; border:1px solid var(--ca-border); background:var(--ca-bg); }',
      '.' + P + 'cat-header { display:flex; align-items:center; gap:6px; margin-bottom:4px; }',
      '.' + P + 'cat-dot { width:8px; height:8px; border-radius:50%; }',
      '.' + P + 'cat-name { font-size:.72rem; font-weight:600; color:var(--ca-text2); }',
      '.' + P + 'cat-total { font-size:1.1rem; font-weight:700; color:var(--ca-text); }',
      '.' + P + 'cat-avg { font-size:.68rem; color:var(--ca-text3); }',

      // ---- SVG chart wrapper ----
      '.' + P + 'chart-wrap { border:1px solid var(--ca-border); border-radius:10px; background:var(--ca-bg); overflow:hidden; margin-bottom:16px; padding:10px; }',
      '.' + P + 'chart-title { font-size:.78rem; font-weight:600; color:var(--ca-text2); margin-bottom:8px; }',
      '.' + P + 'chart-svg { display:block; width:100%; height:auto; }',

      // ---- Cost summary ----
      '.' + P + 'cost-box { background:var(--ca-bg2); border:1px solid var(--ca-border); border-radius:8px; padding:12px 16px; margin-bottom:14px; }',
      '.' + P + 'cost-title { font-size:.78rem; font-weight:600; color:var(--ca-text); margin-bottom:6px; }',
      '.' + P + 'cost-row { display:flex; justify-content:space-between; font-size:.75rem; padding:3px 0; }',
      '.' + P + 'cost-label { color:var(--ca-text2); }',
      '.' + P + 'cost-val { font-weight:600; color:var(--ca-text); font-variant-numeric:tabular-nums; }',
      '.' + P + 'cost-total { border-top:1px solid var(--ca-border); margin-top:4px; padding-top:6px; font-weight:700; }',

      // ---- Conversation list ----
      '.' + P + 'list { display:none; }',
      '.' + P + 'list--visible { display:block; }',
      '.' + P + 'list-title { font-size:.85rem; font-weight:700; color:var(--ca-text); margin-bottom:10px; }',

      // ---- Single conversation card ----
      '.' + P + 'card { border:1px solid var(--ca-border); border-radius:8px; margin-bottom:6px; background:var(--ca-bg); overflow:hidden; transition:box-shadow .15s; }',
      '.' + P + 'card:hover { box-shadow:var(--ca-shadow); }',
      '.' + P + 'card-header { display:flex; align-items:center; gap:10px; padding:10px 14px; cursor:pointer; user-select:none; transition:background .12s; }',
      '.' + P + 'card-header:hover { background:var(--ca-hover); }',
      '.' + P + 'card-turn { font-size:.72rem; font-weight:700; color:var(--ca-accent); min-width:44px; }',
      '.' + P + 'card-bar-wrap { flex:1; height:18px; background:var(--ca-bg3); border-radius:4px; overflow:hidden; display:flex; }',
      '.' + P + 'card-bar-seg { height:100%; transition:width .3s ease; }',
      '.' + P + 'card-total { font-size:.72rem; font-weight:600; color:var(--ca-text2); min-width:65px; text-align:right; font-variant-numeric:tabular-nums; }',
      '.' + P + 'card-chevron { font-size:.7rem; color:var(--ca-text3); transition:transform .2s; }',
      '.' + P + 'card-chevron--open { transform:rotate(90deg); }',

      // ---- Card detail (expandable) ----
      '.' + P + 'card-detail { max-height:0; overflow:hidden; transition:max-height .35s ease; }',
      '.' + P + 'card-detail--open { max-height:300px; }',
      '.' + P + 'card-detail-inner { padding:10px 14px 14px; display:flex; gap:12px; flex-wrap:wrap; border-top:1px solid var(--ca-border); }',
      '.' + P + 'detail-item { flex:1; min-width:90px; }',
      '.' + P + 'detail-cat { font-size:.68rem; color:var(--ca-text3); margin-bottom:2px; display:flex; align-items:center; gap:4px; }',
      '.' + P + 'detail-cat-dot { width:6px; height:6px; border-radius:50%; }',
      '.' + P + 'detail-val { font-size:.95rem; font-weight:700; color:var(--ca-text); }',
      '.' + P + 'detail-pct { font-size:.65rem; color:var(--ca-text3); }',

      // ---- Integration button row ----
      '.' + P + 'actions { display:none; margin-bottom:14px; }',
      '.' + P + 'actions--visible { display:flex; gap:8px; flex-wrap:wrap; }',

      // ---- Responsive ----
      '@media(max-width:600px){',
      '  .' + P + 'stats-grid { grid-template-columns:repeat(2,1fr); }',
      '  .' + P + 'cat-summary { flex-direction:column; }',
      '}'
    ].join('\n');

    var style = document.createElement('style');
    style.id = P + 'styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  //  DOM BUILDING
  // ============================================================

  function _buildDOM() {
    _container.innerHTML = '';
    var root = _el('div', P + 'root');
    if (_isDark()) root.classList.add(P + 'dark');

    // ---- Header + legend ----
    var header = _el('div', P + 'header');
    var title = _el('h3', P + 'title');
    title.innerHTML = '<span class="' + P + 'title-icon">📊</span>Conversation Analyzer';
    header.appendChild(title);

    var legend = _el('div', P + 'legend');
    CATEGORIES.forEach(function (cat) {
      var item = _el('span', P + 'legend-item');
      var dot = _el('span', P + 'legend-dot');
      dot.style.background = COLORS[cat];
      item.appendChild(dot);
      item.appendChild(document.createTextNode(LABELS[cat]));
      legend.appendChild(item);
    });
    header.appendChild(legend);
    root.appendChild(header);

    // ---- Input zone (drag-drop + textarea) ----
    var inputZone = _el('div', P + 'input-zone');
    var dropArea = _el('div', P + 'drop-area');
    _els.dropArea = dropArea;

    var dropHint = _el('div', P + 'drop-hint');
    dropHint.innerHTML = 'Drag & drop <b>.json</b> files here, or paste JSON below';
    dropArea.appendChild(dropHint);

    var textarea = _el('textarea', P + 'textarea');
    textarea.placeholder = 'Paste Claude API response JSON or simplified turn data...\n\nSupported formats:\n  { "usage": { "input_tokens": N, "output_tokens": N } }\n  [{ "turn": 1, "system": N, "user": N, "assistant": N, "tools": N }]';
    textarea.spellcheck = false;
    _els.textarea = textarea;
    dropArea.appendChild(textarea);

    // Button row
    var btnRow = _el('div', P + 'btn-row');

    var btnParse = _el('button', P + 'btn ' + P + 'btn--primary', 'Analyze');
    btnParse.addEventListener('click', function () { _handleParse(); });

    var btnSample = _el('button', P + 'btn', 'Load Sample Data');
    btnSample.addEventListener('click', function () { loadSampleData(); });

    var btnClear = _el('button', P + 'btn', 'Clear');
    btnClear.addEventListener('click', function () { _clearAll(); });

    btnRow.appendChild(btnParse);
    btnRow.appendChild(btnSample);
    btnRow.appendChild(btnClear);
    dropArea.appendChild(btnRow);
    inputZone.appendChild(dropArea);

    // Status message
    var msg = _el('div', P + 'msg');
    _els.msg = msg;
    inputZone.appendChild(msg);

    root.appendChild(inputZone);

    // ---- Integration action buttons ----
    var actions = _el('div', P + 'actions');
    _els.actions = actions;

    var btnWaterfall = _el('button', P + 'btn', '💧 Load to Waterfall');
    btnWaterfall.addEventListener('click', function () { _loadToWaterfall(); });

    var btnTimeline = _el('button', P + 'btn', '⏱ Load to Timeline');
    btnTimeline.addEventListener('click', function () { _loadToTimeline(); });

    var btnExport = _el('button', P + 'btn', '📋 Export Report');
    btnExport.addEventListener('click', function () { _exportReport(); });

    actions.appendChild(btnWaterfall);
    actions.appendChild(btnTimeline);
    actions.appendChild(btnExport);
    root.appendChild(actions);

    // ---- Stats panel ----
    var stats = _el('div', P + 'stats');
    _els.stats = stats;
    root.appendChild(stats);

    // ---- Conversation list ----
    var list = _el('div', P + 'list');
    _els.list = list;
    root.appendChild(list);

    _container.appendChild(root);
    _els.root = root;

    // ---- Wire up drag-and-drop events ----
    _initDragDrop(dropArea);
  }

  // ============================================================
  //  DRAG & DROP
  // ============================================================

  function _initDragDrop(dropArea) {
    var dragCounter = 0;

    dropArea.addEventListener('dragenter', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      dropArea.classList.add(P + 'drop-area--over');
    });

    dropArea.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
    });

    dropArea.addEventListener('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropArea.classList.remove(P + 'drop-area--over');
      }
    });

    dropArea.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      dropArea.classList.remove(P + 'drop-area--over');

      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;

      // Read the first .json file
      var file = null;
      for (var i = 0; i < files.length; i++) {
        if (files[i].name.endsWith('.json') || files[i].type === 'application/json') {
          file = files[i];
          break;
        }
      }

      if (!file) {
        _showMsg('err', 'Please drop a .json file.');
        return;
      }

      var reader = new FileReader();
      reader.onload = function (ev) {
        _els.textarea.value = ev.target.result;
        _handleParse();
      };
      reader.onerror = function () {
        _showMsg('err', 'Failed to read file.');
      };
      reader.readAsText(file);
    });
  }

  // ============================================================
  //  PARSE INPUT
  // ============================================================

  /**
   * Parse raw JSON text into normalized turn data.
   * Supports:
   *   1. Single Claude API response:  { "usage": { "input_tokens", "output_tokens", ... } }
   *   2. Array of Claude API responses: [{ "usage": ... }, ...]
   *   3. Simplified turn array: [{ "turn", "system", "user", "assistant", "tools" }]
   *   4. Single simplified turn: { "turn", "system", "user", "assistant", "tools" }
   *
   * @param {string} jsonStr - Raw JSON string
   * @returns {Array} Normalized turn data array
   */
  function parse(jsonStr) {
    var raw;
    try {
      raw = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('Invalid JSON: ' + e.message);
    }

    // Wrap single object into array
    if (!Array.isArray(raw)) {
      raw = [raw];
    }

    var turns = [];

    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];

      if (item && item.usage) {
        // ---- Claude API response format ----
        var usage = item.usage;
        var inputTokens = (usage.input_tokens || 0);
        var outputTokens = (usage.output_tokens || 0);
        var cacheRead = (usage.cache_read_input_tokens || 0);

        // Heuristic breakdown of input tokens:
        // cache_read_input_tokens likely represents system prompt (cached).
        // Remaining input tokens split between user (70%) and tools (30%).
        var remainingInput = Math.max(0, inputTokens - cacheRead);
        var systemEstimate = cacheRead;
        var userEstimate = Math.round(remainingInput * 0.7);
        var toolsEstimate = Math.round(remainingInput * 0.3);

        turns.push({
          turn: turns.length + 1,
          system: systemEstimate,
          user: userEstimate,
          assistant: outputTokens,
          tools: toolsEstimate
        });

      } else if (item && (item.turn !== undefined || item.system !== undefined ||
                          item.user !== undefined || item.assistant !== undefined ||
                          item.tools !== undefined)) {
        // ---- Simplified turn format ----
        turns.push({
          turn: item.turn || (turns.length + 1),
          system: Math.max(0, parseInt(item.system) || 0),
          user: Math.max(0, parseInt(item.user) || 0),
          assistant: Math.max(0, parseInt(item.assistant) || 0),
          tools: Math.max(0, parseInt(item.tools) || 0)
        });

      } else {
        // Unknown format — skip with warning
        console.warn('ConversationAnalyzer: skipping unrecognized item at index ' + i);
      }
    }

    if (turns.length === 0) {
      throw new Error('No valid conversation data found in the provided JSON.');
    }

    return turns;
  }

  /** Trigger parsing from the textarea value */
  function _handleParse() {
    var text = (_els.textarea.value || '').trim();
    if (!text) {
      _showMsg('err', 'Please paste JSON data or drop a .json file.');
      return;
    }

    try {
      _turns = parse(text);
    } catch (e) {
      _showMsg('err', e.message);
      return;
    }

    _showMsg('ok', 'Parsed ' + _turns.length + ' turn' + (_turns.length > 1 ? 's' : '') + ' successfully.');
    _expandedIdx = -1;
    _renderStats();
    _renderList();
    _showActions(true);
  }

  // ============================================================
  //  STATISTICS
  // ============================================================

  /**
   * Compute comprehensive statistics from the current turn data.
   * @returns {Object|null} Statistics object, or null if no data
   */
  function getStats() {
    if (_turns.length === 0) return null;

    var totalSystem = 0, totalUser = 0, totalAssistant = 0, totalTools = 0;
    var turnTotals = [];

    for (var i = 0; i < _turns.length; i++) {
      var t = _turns[i];
      totalSystem += t.system;
      totalUser += t.user;
      totalAssistant += t.assistant;
      totalTools += t.tools;
      turnTotals.push(_turnTotal(t));
    }

    var grandTotal = totalSystem + totalUser + totalAssistant + totalTools;
    var n = _turns.length;

    // Sort for median / min / max
    var sorted = turnTotals.slice().sort(function (a, b) { return a - b; });
    var min = sorted[0];
    var max = sorted[sorted.length - 1];
    var median;
    if (n % 2 === 0) {
      median = Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2);
    } else {
      median = sorted[Math.floor(n / 2)];
    }

    // Cost calculation using selected model pricing
    var model = _getSelectedModel();
    var pricing = model.pricing || {};
    var inputTokens = totalSystem + totalUser + totalTools;
    var outputTokens = totalAssistant;
    var inputCost = (inputTokens / 1000000) * (pricing.inputPerMTok || 3);
    var outputCost = (outputTokens / 1000000) * (pricing.outputPerMTok || 15);
    var cacheCost = (totalSystem / 1000000) * (pricing.cacheReadPerMTok || 0.30);
    var totalCost = inputCost + outputCost + cacheCost;

    return {
      totalTurns: n,
      grandTotal: grandTotal,
      byCategory: {
        system: totalSystem,
        user: totalUser,
        assistant: totalAssistant,
        tools: totalTools
      },
      avgPerTurn: {
        total: Math.round(grandTotal / n),
        system: Math.round(totalSystem / n),
        user: Math.round(totalUser / n),
        assistant: Math.round(totalAssistant / n),
        tools: Math.round(totalTools / n)
      },
      min: min,
      max: max,
      median: median,
      cost: {
        model: model.name,
        input: inputCost,
        output: outputCost,
        cache: cacheCost,
        total: totalCost
      },
      turnTotals: turnTotals
    };
  }

  // ============================================================
  //  RENDER STATS PANEL
  // ============================================================

  function _renderStats() {
    var stats = getStats();
    if (!stats) return;

    var panel = _els.stats;
    panel.innerHTML = '';

    // ---- Summary stat cards ----
    var grid = _el('div', P + 'stats-grid');
    grid.appendChild(_buildStatCard('Total Turns', _fmt(stats.totalTurns), ''));
    grid.appendChild(_buildStatCard('Total Tokens', _fmt(stats.grandTotal), ''));
    grid.appendChild(_buildStatCard('Avg / Turn', _fmt(stats.avgPerTurn.total), 'tokens'));
    grid.appendChild(_buildStatCard('Min Turn', _fmt(stats.min), 'tokens'));
    grid.appendChild(_buildStatCard('Max Turn', _fmt(stats.max), 'tokens'));
    grid.appendChild(_buildStatCard('Median Turn', _fmt(stats.median), 'tokens'));
    panel.appendChild(grid);

    // ---- Category breakdown ----
    var catRow = _el('div', P + 'cat-summary');
    CATEGORIES.forEach(function (cat) {
      var total = stats.byCategory[cat];
      var avg = stats.avgPerTurn[cat];
      var item = _el('div', P + 'cat-item');

      var hdr = _el('div', P + 'cat-header');
      var dot = _el('span', P + 'cat-dot');
      dot.style.background = COLORS[cat];
      hdr.appendChild(dot);
      hdr.appendChild(_el('span', P + 'cat-name', LABELS[cat]));
      item.appendChild(hdr);

      item.appendChild(_el('div', P + 'cat-total', _fmt(total) + ' (' + _pct(total, stats.grandTotal) + '%)'));
      item.appendChild(_el('div', P + 'cat-avg', 'Avg: ' + _fmt(avg) + '/turn'));
      catRow.appendChild(item);
    });
    panel.appendChild(catRow);

    // ---- Cost summary ----
    var costBox = _el('div', P + 'cost-box');
    costBox.appendChild(_el('div', P + 'cost-title', 'Estimated Cost (' + stats.cost.model + ')'));
    costBox.appendChild(_buildCostRow('Input tokens', '$' + stats.cost.input.toFixed(4)));
    costBox.appendChild(_buildCostRow('Output tokens', '$' + stats.cost.output.toFixed(4)));
    costBox.appendChild(_buildCostRow('Cache read', '$' + stats.cost.cache.toFixed(4)));
    var totalRow = _buildCostRow('Total', '$' + stats.cost.total.toFixed(4));
    totalRow.classList.add(P + 'cost-total');
    costBox.appendChild(totalRow);
    panel.appendChild(costBox);

    // ---- SVG trend chart ----
    var chartWrap = _el('div', P + 'chart-wrap');
    chartWrap.appendChild(_el('div', P + 'chart-title', 'Token Consumption Trend'));
    chartWrap.appendChild(_buildTrendSvg(stats));
    panel.appendChild(chartWrap);

    panel.classList.add(P + 'stats--visible');
  }

  /** Build a single stat card */
  function _buildStatCard(label, value, sub) {
    var card = _el('div', P + 'stat-card');
    card.appendChild(_el('div', P + 'stat-label', label));
    card.appendChild(_el('div', P + 'stat-value', value));
    if (sub) card.appendChild(_el('div', P + 'stat-sub', sub));
    return card;
  }

  /** Build a cost row */
  function _buildCostRow(label, value) {
    var row = _el('div', P + 'cost-row');
    row.appendChild(_el('span', P + 'cost-label', label));
    row.appendChild(_el('span', P + 'cost-val', value));
    return row;
  }

  // ============================================================
  //  SVG TREND CHART
  // ============================================================

  function _buildTrendSvg(stats) {
    var totals = stats.turnTotals;
    var n = totals.length;
    if (n === 0) return _el('div');

    var dark = _isDark();
    var textColor = dark ? '#a6adc8' : '#64748b';
    var gridColor = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';

    var svg = _svgEl('svg', {
      viewBox: '0 0 ' + SVG_W + ' ' + SVG_H,
      preserveAspectRatio: 'xMidYMid meet',
      'class': P + 'chart-svg'
    });

    var plotL = SVG_PAD.left;
    var plotT = SVG_PAD.top;
    var plotW = SVG_W - SVG_PAD.left - SVG_PAD.right;
    var plotH = SVG_H - SVG_PAD.top - SVG_PAD.bottom;

    var maxVal = stats.max || 1;

    // Background grid lines (4 horizontal)
    for (var g = 0; g <= 4; g++) {
      var gy = plotT + plotH - (plotH * g / 4);
      svg.appendChild(_svgEl('line', {
        x1: plotL, y1: gy, x2: plotL + plotW, y2: gy,
        stroke: gridColor, 'stroke-width': 1
      }));
      // Y-axis label
      var labelVal = Math.round(maxVal * g / 4);
      var yLabel = _svgEl('text', {
        x: plotL - 8, y: gy + 3,
        fill: textColor, 'font-size': '10', 'text-anchor': 'end',
        'font-family': '-apple-system, sans-serif'
      });
      yLabel.textContent = labelVal >= 1000 ? Math.round(labelVal / 1000) + 'k' : labelVal;
      svg.appendChild(yLabel);
    }

    // Stacked area paths (bottom to top: system, user, assistant, tools)
    // Build cumulative stacks per turn
    var stacks = []; // stacks[turnIdx] = { system, user, assistant, tools } cumulative Y values
    for (var i = 0; i < n; i++) {
      var t = _turns[i];
      var cumSys = t.system;
      var cumUsr = cumSys + t.user;
      var cumAst = cumUsr + t.assistant;
      var cumTool = cumAst + t.tools;
      stacks.push({ system: cumSys, user: cumUsr, assistant: cumAst, tools: cumTool });
    }

    // X position for each data point
    function xPos(idx) {
      if (n === 1) return plotL + plotW / 2;
      return plotL + (plotW * idx / (n - 1));
    }

    // Y position for a value
    function yPos(val) {
      return plotT + plotH - (plotH * val / maxVal);
    }

    // Draw stacked areas in reverse order (tools on top)
    var layers = [
      { cat: 'tools',     field: 'tools',     prev: 'assistant' },
      { cat: 'assistant', field: 'assistant',  prev: 'user' },
      { cat: 'user',      field: 'user',       prev: 'system' },
      { cat: 'system',    field: 'system',     prev: null }
    ];

    for (var li = 0; li < layers.length; li++) {
      var layer = layers[li];
      var d = 'M';

      // Top edge (left to right)
      for (var j = 0; j < n; j++) {
        var x = xPos(j);
        var y = yPos(stacks[j][layer.field]);
        d += (j === 0 ? '' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }

      // Bottom edge (right to left) — previous layer top, or baseline
      for (var j2 = n - 1; j2 >= 0; j2--) {
        var x2 = xPos(j2);
        var y2 = layer.prev ? yPos(stacks[j2][layer.prev]) : yPos(0);
        d += 'L' + x2.toFixed(1) + ',' + y2.toFixed(1);
      }

      d += 'Z';
      svg.appendChild(_svgEl('path', {
        d: d,
        fill: COLORS[layer.cat],
        opacity: '0.7'
      }));
    }

    // Total line on top
    var lineD = '';
    for (var k = 0; k < n; k++) {
      var lx = xPos(k);
      var ly = yPos(totals[k]);
      lineD += (k === 0 ? 'M' : 'L') + lx.toFixed(1) + ',' + ly.toFixed(1);
    }
    svg.appendChild(_svgEl('path', {
      d: lineD,
      fill: 'none',
      stroke: dark ? '#cdd6f4' : '#1e293b',
      'stroke-width': '2',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round'
    }));

    // Data point dots
    for (var dp = 0; dp < n; dp++) {
      svg.appendChild(_svgEl('circle', {
        cx: xPos(dp), cy: yPos(totals[dp]),
        r: n > 30 ? '2' : '3',
        fill: dark ? '#cdd6f4' : '#1e293b'
      }));
    }

    // X-axis labels (show up to ~12 labels)
    var step = Math.max(1, Math.ceil(n / 12));
    for (var xl = 0; xl < n; xl += step) {
      var xLabel = _svgEl('text', {
        x: xPos(xl), y: plotT + plotH + 18,
        fill: textColor, 'font-size': '10', 'text-anchor': 'middle',
        'font-family': '-apple-system, sans-serif'
      });
      xLabel.textContent = 'T' + _turns[xl].turn;
      svg.appendChild(xLabel);
    }

    return svg;
  }

  // ============================================================
  //  CONVERSATION LIST
  // ============================================================

  function _renderList() {
    var list = _els.list;
    list.innerHTML = '';

    if (_turns.length === 0) return;

    list.appendChild(_el('div', P + 'list-title', 'Conversation Turns (' + _turns.length + ')'));

    for (var i = 0; i < _turns.length; i++) {
      list.appendChild(_buildCard(i));
    }

    list.classList.add(P + 'list--visible');
  }

  /** Build a single conversation card */
  function _buildCard(idx) {
    var t = _turns[idx];
    var total = _turnTotal(t);

    var card = _el('div', P + 'card');
    card.setAttribute('data-idx', idx);

    // ---- Header row ----
    var header = _el('div', P + 'card-header');

    var turnLabel = _el('span', P + 'card-turn', 'T' + t.turn);
    header.appendChild(turnLabel);

    // Proportional bar
    var barWrap = _el('div', P + 'card-bar-wrap');
    CATEGORIES.forEach(function (cat) {
      var seg = _el('div', P + 'card-bar-seg');
      seg.style.background = COLORS[cat];
      seg.style.width = (total > 0 ? (t[cat] / total * 100) : 0) + '%';
      barWrap.appendChild(seg);
    });
    header.appendChild(barWrap);

    var totalLabel = _el('span', P + 'card-total', _fmt(total));
    header.appendChild(totalLabel);

    var chevron = _el('span', P + 'card-chevron', '▶');
    header.appendChild(chevron);

    // ---- Detail panel (collapsed by default) ----
    var detail = _el('div', P + 'card-detail');
    var detailInner = _el('div', P + 'card-detail-inner');

    CATEGORIES.forEach(function (cat) {
      var di = _el('div', P + 'detail-item');
      var catLabel = _el('div', P + 'detail-cat');
      var catDot = _el('span', P + 'detail-cat-dot');
      catDot.style.background = COLORS[cat];
      catLabel.appendChild(catDot);
      catLabel.appendChild(document.createTextNode(LABELS[cat]));
      di.appendChild(catLabel);
      di.appendChild(_el('div', P + 'detail-val', _fmt(t[cat])));
      di.appendChild(_el('div', P + 'detail-pct', _pct(t[cat], total) + '% of turn'));
      detailInner.appendChild(di);
    });

    detail.appendChild(detailInner);

    // ---- Toggle expand ----
    header.addEventListener('click', function () {
      var isOpen = detail.classList.contains(P + 'card-detail--open');
      // Close previously expanded card
      if (_expandedIdx >= 0 && _expandedIdx !== idx) {
        var prevCard = _els.list.querySelector('[data-idx="' + _expandedIdx + '"]');
        if (prevCard) {
          var prevDetail = prevCard.querySelector('.' + P + 'card-detail');
          var prevChevron = prevCard.querySelector('.' + P + 'card-chevron');
          if (prevDetail) prevDetail.classList.remove(P + 'card-detail--open');
          if (prevChevron) prevChevron.classList.remove(P + 'card-chevron--open');
        }
      }

      if (isOpen) {
        detail.classList.remove(P + 'card-detail--open');
        chevron.classList.remove(P + 'card-chevron--open');
        _expandedIdx = -1;
      } else {
        detail.classList.add(P + 'card-detail--open');
        chevron.classList.add(P + 'card-chevron--open');
        _expandedIdx = idx;
      }
    });

    card.appendChild(header);
    card.appendChild(detail);
    return card;
  }

  // ============================================================
  //  INTEGRATION: Load to Waterfall / Timeline / Export
  // ============================================================

  /** Send current data to TokenWaterfall module */
  function _loadToWaterfall() {
    if (_turns.length === 0) {
      _showMsg('err', 'No data to load. Parse conversation data first.');
      return;
    }

    if (typeof TokenWaterfall === 'undefined' || !TokenWaterfall.importData) {
      _showMsg('err', 'TokenWaterfall module is not available.');
      return;
    }

    TokenWaterfall.importData(_turns);
    _showMsg('ok', 'Data loaded into Token Waterfall (' + _turns.length + ' turns).');
  }

  /** Send current data to AlertTimeline module */
  function _loadToTimeline() {
    if (_turns.length === 0) {
      _showMsg('err', 'No data to load. Parse conversation data first.');
      return;
    }

    if (typeof AlertTimeline === 'undefined' || !AlertTimeline.addDataPoint) {
      _showMsg('err', 'AlertTimeline module is not available.');
      return;
    }

    // Clear existing history if possible
    if (AlertTimeline.clearHistory) {
      AlertTimeline.clearHistory();
    }

    var model = _getSelectedModel();
    var ctxWin = model.contextWindow || 200000;

    _turns.forEach(function (t) {
      AlertTimeline.addDataPoint({
        system: t.system,
        user: t.user,
        assistant: t.assistant,
        tools: t.tools
      }, ctxWin);
    });

    _showMsg('ok', 'Data loaded into Alert Timeline (' + _turns.length + ' data points).');
  }

  /** Export a Markdown report of the analysis */
  function _exportReport() {
    var stats = getStats();
    if (!stats) {
      _showMsg('err', 'No data to export. Parse conversation data first.');
      return;
    }

    var lines = [];
    lines.push('# Conversation Analysis Report');
    lines.push('');
    lines.push('Generated: ' + new Date().toISOString().split('T')[0]);
    lines.push('');

    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push('| Total Turns | ' + stats.totalTurns + ' |');
    lines.push('| Total Tokens | ' + _fmt(stats.grandTotal) + ' |');
    lines.push('| Avg Tokens/Turn | ' + _fmt(stats.avgPerTurn.total) + ' |');
    lines.push('| Min Turn | ' + _fmt(stats.min) + ' |');
    lines.push('| Max Turn | ' + _fmt(stats.max) + ' |');
    lines.push('| Median Turn | ' + _fmt(stats.median) + ' |');
    lines.push('');

    lines.push('## Token Breakdown by Category');
    lines.push('');
    lines.push('| Category | Total | % | Avg/Turn |');
    lines.push('|----------|-------|---|----------|');
    CATEGORIES.forEach(function (cat) {
      var total = stats.byCategory[cat];
      lines.push('| ' + LABELS[cat] + ' | ' + _fmt(total) + ' | ' +
                  _pct(total, stats.grandTotal) + '% | ' + _fmt(stats.avgPerTurn[cat]) + ' |');
    });
    lines.push('');

    lines.push('## Cost Estimate');
    lines.push('');
    lines.push('Model: **' + stats.cost.model + '**');
    lines.push('');
    lines.push('| Component | Cost |');
    lines.push('|-----------|------|');
    lines.push('| Input | $' + stats.cost.input.toFixed(4) + ' |');
    lines.push('| Output | $' + stats.cost.output.toFixed(4) + ' |');
    lines.push('| Cache Read | $' + stats.cost.cache.toFixed(4) + ' |');
    lines.push('| **Total** | **$' + stats.cost.total.toFixed(4) + '** |');
    lines.push('');

    lines.push('## Per-Turn Detail');
    lines.push('');
    lines.push('| Turn | System | User | Assistant | Tools | Total |');
    lines.push('|------|--------|------|-----------|-------|-------|');
    _turns.forEach(function (t) {
      lines.push('| ' + t.turn + ' | ' + _fmt(t.system) + ' | ' + _fmt(t.user) +
                  ' | ' + _fmt(t.assistant) + ' | ' + _fmt(t.tools) + ' | ' + _fmt(_turnTotal(t)) + ' |');
    });
    lines.push('');
    lines.push('---');
    lines.push('*Report generated by Claude Context Window Visualizer*');

    var markdown = lines.join('\n');

    // Copy to clipboard and trigger download
    _downloadText(markdown, 'conversation-report.md', 'text/markdown');
    _showMsg('ok', 'Report exported as Markdown (download triggered).');
  }

  /** Trigger a text file download */
  function _downloadText(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  // ============================================================
  //  SAMPLE DATA
  // ============================================================

  /** Load sample data using DataGenerator (if available) or built-in fallback */
  function loadSampleData() {
    var data;

    if (typeof DataGenerator !== 'undefined' && DataGenerator.generate) {
      // Use the codingSession scenario from DataGenerator
      data = DataGenerator.generate('codingSession');
    } else {
      // Fallback sample data
      data = [
        { turn: 1, system: 650,  user: 1200,  assistant: 2800, tools: 0 },
        { turn: 2, system: 0,    user: 800,   assistant: 3500, tools: 1200 },
        { turn: 3, system: 0,    user: 1500,  assistant: 4200, tools: 2400 },
        { turn: 4, system: 0,    user: 600,   assistant: 2100, tools: 900 },
        { turn: 5, system: 0,    user: 2000,  assistant: 5100, tools: 3800 },
        { turn: 6, system: 0,    user: 450,   assistant: 1800, tools: 600 },
        { turn: 7, system: 0,    user: 1100,  assistant: 3900, tools: 2100 },
        { turn: 8, system: 0,    user: 900,   assistant: 2600, tools: 1500 },
        { turn: 9, system: 0,    user: 1700,  assistant: 4500, tools: 2800 },
        { turn: 10, system: 0,   user: 350,   assistant: 1500, tools: 400 }
      ];
    }

    _turns = data;
    // Pretty-print the data into the textarea for visibility
    _els.textarea.value = JSON.stringify(data, null, 2);
    _showMsg('ok', 'Sample data loaded (' + data.length + ' turns). Click "Analyze" or data is already rendered.');
    _expandedIdx = -1;
    _renderStats();
    _renderList();
    _showActions(true);
  }

  // ============================================================
  //  UI HELPERS
  // ============================================================

  /** Display a status message (err | ok) */
  function _showMsg(type, text) {
    var el = _els.msg;
    el.className = P + 'msg ' + P + 'msg--' + type;
    el.textContent = text;
    // Auto-dismiss success messages after 5s
    if (type === 'ok') {
      setTimeout(function () {
        if (el.textContent === text) {
          el.className = P + 'msg';
        }
      }, 5000);
    }
  }

  /** Show or hide the action buttons */
  function _showActions(show) {
    if (show) {
      _els.actions.classList.add(P + 'actions--visible');
    } else {
      _els.actions.classList.remove(P + 'actions--visible');
    }
  }

  /** Clear all data and reset UI */
  function _clearAll() {
    _turns = [];
    _expandedIdx = -1;
    _els.textarea.value = '';
    _els.msg.className = P + 'msg';
    _els.stats.innerHTML = '';
    _els.stats.classList.remove(P + 'stats--visible');
    _els.list.innerHTML = '';
    _els.list.classList.remove(P + 'list--visible');
    _showActions(false);
  }

  // ============================================================
  //  THEME OBSERVER
  // ============================================================

  /** Watch for theme changes and update the root class */
  function _watchTheme() {
    var observer = new MutationObserver(function () {
      if (_els.root) {
        if (_isDark()) {
          _els.root.classList.add(P + 'dark');
        } else {
          _els.root.classList.remove(P + 'dark');
        }
        // Re-render chart if data exists (theme-sensitive colors)
        if (_turns.length > 0) {
          _renderStats();
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    // Also observe <body> class changes
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  // ============================================================
  //  INIT
  // ============================================================

  /**
   * Initialize the Conversation Analyzer module.
   * @param {string} containerId - ID of the DOM element to render into
   */
  function init(containerId) {
    if (_inited) return;

    var host = document.getElementById(containerId);
    if (!host) {
      console.warn('ConversationAnalyzer: container #' + containerId + ' not found');
      return;
    }
    _container = host;

    _injectStyles();
    _buildDOM();
    _watchTheme();
    _inited = true;
  }

  /** Check if the module has been initialized */
  function isInited() {
    return _inited;
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  return {
    /** Initialize the module into a container element */
    init: init,

    /**
     * Parse raw JSON string into normalized turn data.
     * @param {string} jsonStr
     * @returns {Array} Normalized turn objects
     */
    parse: parse,

    /**
     * Get comprehensive statistics for the currently loaded data.
     * @returns {Object|null}
     */
    getStats: getStats,

    /** Load sample data (from DataGenerator or built-in fallback) */
    loadSampleData: loadSampleData,

    /** Check if init() has been called */
    isInited: isInited
  };

})();

// Attach to window for global access
window.ConversationAnalyzer = ConversationAnalyzer;
