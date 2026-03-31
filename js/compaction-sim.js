/**
 * Claude Context Window Visualizer — Compaction Simulator
 * Simulates the /compact command effect, visualizing context window
 * compaction with before/after comparison, animated transitions,
 * configurable compression parameters, and smart recommendations.
 *
 * API:  window.CompactionSim = { init, setTokens, runCompact, reset, isInited }
 */

'use strict';

var CompactionSim = (function () {

  // ============================================================
  //  CONSTANTS
  // ============================================================

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

  var PRIORITY_MODES = {
    balanced:       { label: 'Balanced',        desc: 'Compress all categories evenly' },
    keepSystem:     { label: 'Keep System',     desc: 'Preserve system prompts; compress others more' },
    keepRecent:     { label: 'Keep Recent',     desc: 'Preserve recent User/Assistant messages' },
    minimizeTools:  { label: 'Minimize Tools',  desc: 'Aggressively compress tool outputs first' }
  };

  // Per-mode compression multipliers (lower = more compression)
  // These are multiplied against the base ratio to get per-category ratios.
  // A value of 0.5 means this category is compressed 2x more than base.
  // A value of 1.5 means this category is compressed 1.5x less.
  var PRIORITY_WEIGHTS = {
    balanced:      { system: 1.0,  user: 1.0,  assistant: 1.0,  tools: 1.0  },
    keepSystem:    { system: 1.6,  user: 0.8,  assistant: 0.8,  tools: 0.7  },
    keepRecent:    { system: 0.7,  user: 1.5,  assistant: 1.5,  tools: 0.6  },
    minimizeTools: { system: 1.1,  user: 1.1,  assistant: 1.1,  tools: 0.3  }
  };

  var ANIM_DURATION = 1500; // ms

  // ============================================================
  //  STATE
  // ============================================================

  var _inited = false;
  var _container = null;

  var _state = {
    tokens: { system: 0, user: 0, assistant: 0, tools: 0 },
    contextWindow: 200000,
    ratio: 60,          // compression target: keep 60% => 40% reduction
    priority: 'balanced',
    compacted: false,    // whether compaction has been run
    animating: false
  };

  // Computed after-compaction values (set during runCompact)
  var _compactedTokens = { system: 0, user: 0, assistant: 0, tools: 0 };

  // Animation state
  var _anim = {
    startTime: 0,
    startValues: { system: 0, user: 0, assistant: 0, tools: 0 },
    endValues:   { system: 0, user: 0, assistant: 0, tools: 0 },
    rafId: null
  };

  // DOM references
  var _els = {};

  // ============================================================
  //  STYLES (injected once)
  // ============================================================

  var _stylesInjected = false;

  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;

    var css = [
      // -- CSS custom properties for theme adaptation --
      '.compaction-sim {',
      '  --cs-bg: #ffffff;',
      '  --cs-bg-alt: #f9fafb;',
      '  --cs-border: #e5e7eb;',
      '  --cs-text: #1f2937;',
      '  --cs-text-muted: #6b7280;',
      '  --cs-bar-bg: #f3f4f6;',
      '  --cs-shadow: 0 1px 3px rgba(0,0,0,0.08);',
      '  --cs-progress-bg: #e5e7eb;',
      '  --cs-btn-bg: #6366f1;',
      '  --cs-btn-hover: #4f46e5;',
      '  --cs-btn-text: #ffffff;',
      '  --cs-badge-bg: rgba(99,102,241,0.1);',
      '  --cs-badge-text: #6366f1;',
      '  --cs-tip-bg: #eff6ff;',
      '  --cs-tip-border: #93c5fd;',
      '  --cs-tip-text: #1e40af;',
      '  --cs-warn-bg: #fef3c7;',
      '  --cs-warn-border: #fbbf24;',
      '  --cs-warn-text: #92400e;',
      '  --cs-danger-bg: #fee2e2;',
      '  --cs-danger-border: #f87171;',
      '  --cs-danger-text: #991b1b;',
      '  --cs-ok-bg: #ecfdf5;',
      '  --cs-ok-border: #6ee7b7;',
      '  --cs-ok-text: #065f46;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  color: var(--cs-text);',
      '}',

      // Dark theme overrides
      '.dark .compaction-sim,',
      '[data-theme="dark"] .compaction-sim {',
      '  --cs-bg: #1f2937;',
      '  --cs-bg-alt: #111827;',
      '  --cs-border: #374151;',
      '  --cs-text: #f3f4f6;',
      '  --cs-text-muted: #9ca3af;',
      '  --cs-bar-bg: #374151;',
      '  --cs-shadow: 0 1px 3px rgba(0,0,0,0.3);',
      '  --cs-progress-bg: #374151;',
      '  --cs-badge-bg: rgba(99,102,241,0.2);',
      '  --cs-badge-text: #a5b4fc;',
      '  --cs-tip-bg: rgba(59,130,246,0.1);',
      '  --cs-tip-border: #3b82f6;',
      '  --cs-tip-text: #93c5fd;',
      '  --cs-warn-bg: rgba(245,158,11,0.1);',
      '  --cs-warn-border: #f59e0b;',
      '  --cs-warn-text: #fcd34d;',
      '  --cs-danger-bg: rgba(239,68,68,0.1);',
      '  --cs-danger-border: #ef4444;',
      '  --cs-danger-text: #fca5a5;',
      '  --cs-ok-bg: rgba(16,185,129,0.1);',
      '  --cs-ok-border: #10b981;',
      '  --cs-ok-text: #6ee7b7;',
      '}',

      // Container
      '.compaction-sim {',
      '  background: var(--cs-bg);',
      '  border: 1px solid var(--cs-border);',
      '  border-radius: 12px;',
      '  padding: 24px;',
      '  box-shadow: var(--cs-shadow);',
      '}',

      // Header
      '.cs-header {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 12px;',
      '  margin-bottom: 20px;',
      '}',
      '.cs-header__title {',
      '  font-size: 18px;',
      '  font-weight: 700;',
      '  margin: 0;',
      '}',
      '.cs-header__badge {',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  padding: 2px 8px;',
      '  border-radius: 9999px;',
      '  background: var(--cs-badge-bg);',
      '  color: var(--cs-badge-text);',
      '  letter-spacing: 0.5px;',
      '  text-transform: uppercase;',
      '}',

      // Controls row
      '.cs-controls {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 16px;',
      '  margin-bottom: 20px;',
      '  align-items: flex-end;',
      '}',
      '.cs-control-group {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 4px;',
      '  flex: 1;',
      '  min-width: 180px;',
      '}',
      '.cs-control-label {',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  color: var(--cs-text-muted);',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '}',
      '.cs-control-label__value {',
      '  font-weight: 700;',
      '  color: var(--cs-text);',
      '}',

      // Slider styling
      '.cs-slider {',
      '  -webkit-appearance: none;',
      '  appearance: none;',
      '  width: 100%;',
      '  height: 6px;',
      '  border-radius: 3px;',
      '  background: var(--cs-progress-bg);',
      '  outline: none;',
      '  cursor: pointer;',
      '}',
      '.cs-slider::-webkit-slider-thumb {',
      '  -webkit-appearance: none;',
      '  appearance: none;',
      '  width: 18px;',
      '  height: 18px;',
      '  border-radius: 50%;',
      '  background: var(--cs-btn-bg);',
      '  cursor: pointer;',
      '  border: 2px solid #fff;',
      '  box-shadow: 0 1px 3px rgba(0,0,0,0.2);',
      '}',
      '.cs-slider::-moz-range-thumb {',
      '  width: 18px;',
      '  height: 18px;',
      '  border-radius: 50%;',
      '  background: var(--cs-btn-bg);',
      '  cursor: pointer;',
      '  border: 2px solid #fff;',
      '  box-shadow: 0 1px 3px rgba(0,0,0,0.2);',
      '}',

      // Select (priority mode)
      '.cs-select {',
      '  padding: 6px 10px;',
      '  border-radius: 6px;',
      '  border: 1px solid var(--cs-border);',
      '  background: var(--cs-bg);',
      '  color: var(--cs-text);',
      '  font-size: 13px;',
      '  cursor: pointer;',
      '  outline: none;',
      '}',
      '.cs-select:focus {',
      '  border-color: var(--cs-btn-bg);',
      '  box-shadow: 0 0 0 2px rgba(99,102,241,0.2);',
      '}',

      // Priority description
      '.cs-priority-desc {',
      '  font-size: 11px;',
      '  color: var(--cs-text-muted);',
      '  font-style: italic;',
      '  min-height: 16px;',
      '}',

      // Buttons
      '.cs-btn {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  padding: 8px 20px;',
      '  border-radius: 8px;',
      '  border: none;',
      '  font-size: 14px;',
      '  font-weight: 600;',
      '  cursor: pointer;',
      '  transition: background 0.2s, transform 0.1s, opacity 0.2s;',
      '  white-space: nowrap;',
      '}',
      '.cs-btn:active { transform: scale(0.97); }',
      '.cs-btn--primary {',
      '  background: var(--cs-btn-bg);',
      '  color: var(--cs-btn-text);',
      '}',
      '.cs-btn--primary:hover { background: var(--cs-btn-hover); }',
      '.cs-btn--primary:disabled {',
      '  opacity: 0.5;',
      '  cursor: not-allowed;',
      '  transform: none;',
      '}',
      '.cs-btn--secondary {',
      '  background: var(--cs-bar-bg);',
      '  color: var(--cs-text);',
      '}',
      '.cs-btn--secondary:hover { opacity: 0.8; }',
      '.cs-btn-row {',
      '  display: flex;',
      '  gap: 10px;',
      '  margin-bottom: 20px;',
      '}',

      // Progress bar (shown during animation)
      '.cs-progress-wrap {',
      '  width: 100%;',
      '  height: 6px;',
      '  border-radius: 3px;',
      '  background: var(--cs-progress-bg);',
      '  overflow: hidden;',
      '  margin-bottom: 20px;',
      '  opacity: 0;',
      '  transition: opacity 0.3s;',
      '}',
      '.cs-progress-wrap--active { opacity: 1; }',
      '.cs-progress-bar {',
      '  height: 100%;',
      '  width: 0%;',
      '  border-radius: 3px;',
      '  background: linear-gradient(90deg, #6366f1, #8b5cf6);',
      '  transition: none;',
      '}',

      // Comparison layout (dual columns)
      '.cs-compare {',
      '  display: grid;',
      '  grid-template-columns: 1fr 1fr;',
      '  gap: 24px;',
      '  margin-bottom: 20px;',
      '}',
      '@media (max-width: 600px) {',
      '  .cs-compare { grid-template-columns: 1fr; }',
      '}',
      '.cs-column {',
      '  background: var(--cs-bg-alt);',
      '  border: 1px solid var(--cs-border);',
      '  border-radius: 8px;',
      '  padding: 16px;',
      '}',
      '.cs-column__title {',
      '  font-size: 13px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '  color: var(--cs-text-muted);',
      '  margin: 0 0 4px 0;',
      '}',
      '.cs-column__total {',
      '  font-size: 22px;',
      '  font-weight: 800;',
      '  margin: 0 0 12px 0;',
      '}',

      // Vertical stacked bars
      '.cs-bars {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 6px;',
      '}',
      '.cs-bar-row {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '}',
      '.cs-bar-label {',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  width: 70px;',
      '  flex-shrink: 0;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '}',
      '.cs-bar-label__dot {',
      '  width: 8px;',
      '  height: 8px;',
      '  border-radius: 50%;',
      '  flex-shrink: 0;',
      '}',
      '.cs-bar-track {',
      '  flex: 1;',
      '  height: 22px;',
      '  background: var(--cs-bar-bg);',
      '  border-radius: 4px;',
      '  overflow: hidden;',
      '  position: relative;',
      '}',
      '.cs-bar-fill {',
      '  height: 100%;',
      '  border-radius: 4px;',
      '  transition: width 0.1s linear;',
      '  min-width: 0;',
      '}',
      '.cs-bar-value {',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  width: 70px;',
      '  text-align: right;',
      '  flex-shrink: 0;',
      '  font-variant-numeric: tabular-nums;',
      '}',

      // Stats grid
      '.cs-stats {',
      '  display: grid;',
      '  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));',
      '  gap: 12px;',
      '  margin-bottom: 20px;',
      '}',
      '.cs-stat {',
      '  background: var(--cs-bg-alt);',
      '  border: 1px solid var(--cs-border);',
      '  border-radius: 8px;',
      '  padding: 12px;',
      '  text-align: center;',
      '}',
      '.cs-stat__value {',
      '  font-size: 20px;',
      '  font-weight: 800;',
      '  margin-bottom: 2px;',
      '  font-variant-numeric: tabular-nums;',
      '}',
      '.cs-stat__label {',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  color: var(--cs-text-muted);',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.3px;',
      '}',
      '.cs-stat__value--green { color: #10b981; }',
      '.cs-stat__value--red { color: #ef4444; }',
      '.cs-stat__value--blue { color: #3b82f6; }',

      // Per-category breakdown table
      '.cs-breakdown {',
      '  width: 100%;',
      '  border-collapse: collapse;',
      '  margin-bottom: 20px;',
      '  font-size: 13px;',
      '}',
      '.cs-breakdown th, .cs-breakdown td {',
      '  padding: 8px 12px;',
      '  text-align: left;',
      '  border-bottom: 1px solid var(--cs-border);',
      '}',
      '.cs-breakdown th {',
      '  font-size: 11px;',
      '  font-weight: 700;',
      '  color: var(--cs-text-muted);',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '}',
      '.cs-breakdown td { font-variant-numeric: tabular-nums; }',
      '.cs-breakdown__cat {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  font-weight: 600;',
      '}',
      '.cs-breakdown__diff { font-weight: 700; }',
      '.cs-breakdown__diff--positive { color: #10b981; }',

      // Suggestion panel
      '.cs-suggestions {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 8px;',
      '}',
      '.cs-suggestion {',
      '  display: flex;',
      '  align-items: flex-start;',
      '  gap: 10px;',
      '  padding: 10px 14px;',
      '  border-radius: 8px;',
      '  font-size: 13px;',
      '  line-height: 1.5;',
      '  border: 1px solid;',
      '}',
      '.cs-suggestion--info {',
      '  background: var(--cs-tip-bg);',
      '  border-color: var(--cs-tip-border);',
      '  color: var(--cs-tip-text);',
      '}',
      '.cs-suggestion--warn {',
      '  background: var(--cs-warn-bg);',
      '  border-color: var(--cs-warn-border);',
      '  color: var(--cs-warn-text);',
      '}',
      '.cs-suggestion--danger {',
      '  background: var(--cs-danger-bg);',
      '  border-color: var(--cs-danger-border);',
      '  color: var(--cs-danger-text);',
      '}',
      '.cs-suggestion--ok {',
      '  background: var(--cs-ok-bg);',
      '  border-color: var(--cs-ok-border);',
      '  color: var(--cs-ok-text);',
      '}',
      '.cs-suggestion__icon {',
      '  font-size: 16px;',
      '  flex-shrink: 0;',
      '  line-height: 1.4;',
      '}',
      '.cs-suggestion__text { flex: 1; }',

      // Legend
      '.cs-legend {',
      '  display: flex;',
      '  gap: 16px;',
      '  flex-wrap: wrap;',
      '  margin-bottom: 16px;',
      '}',
      '.cs-legend__item {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  font-size: 12px;',
      '  font-weight: 500;',
      '  color: var(--cs-text-muted);',
      '}',
      '.cs-legend__swatch {',
      '  width: 10px;',
      '  height: 10px;',
      '  border-radius: 3px;',
      '}',

      // Section titles
      '.cs-section-title {',
      '  font-size: 14px;',
      '  font-weight: 700;',
      '  margin: 0 0 10px 0;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '}'
    ].join('\n');

    var style = document.createElement('style');
    style.setAttribute('data-module', 'compaction-sim');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  //  UTILITY HELPERS
  // ============================================================

  /** Format number with locale-aware commas */
  function _fmt(n) {
    return Math.round(n).toLocaleString();
  }

  /** Sum all category tokens from a token object */
  function _totalTokens(tokens) {
    var sum = 0;
    for (var i = 0; i < CATEGORIES.length; i++) {
      sum += (tokens[CATEGORIES[i]] || 0);
    }
    return sum;
  }

  /** Clamp a value between min and max */
  function _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /** Create a DOM element with optional className and text */
  function _el(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // ============================================================
  //  COMPRESSION CALCULATION
  // ============================================================

  /**
   * Compute per-category compacted token counts based on the current
   * compression ratio and priority mode.
   *
   * The base ratio is _state.ratio / 100 (fraction to keep).
   * Each category is weighted by the priority mode multiplier, then
   * the results are normalized so the total matches the target.
   */
  function _computeCompacted() {
    var keepFraction = _state.ratio / 100;
    var weights = PRIORITY_WEIGHTS[_state.priority] || PRIORITY_WEIGHTS.balanced;
    var totalBefore = _totalTokens(_state.tokens);

    if (totalBefore === 0) {
      for (var i = 0; i < CATEGORIES.length; i++) {
        _compactedTokens[CATEGORIES[i]] = 0;
      }
      return;
    }

    var targetTotal = Math.round(totalBefore * keepFraction);

    // Step 1: compute raw weighted keep amounts
    var raw = {};
    var rawSum = 0;
    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var catTokens = _state.tokens[cat] || 0;
      // Each category keep fraction = base * weight, clamped to [0.1, 1.0]
      var catKeep = _clamp(keepFraction * weights[cat], 0.1, 1.0);
      raw[cat] = catTokens * catKeep;
      rawSum += raw[cat];
    }

    // Step 2: normalize so total = targetTotal (avoid exceeding original per-cat)
    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var original = _state.tokens[cat] || 0;
      if (rawSum > 0) {
        var normalized = (raw[cat] / rawSum) * targetTotal;
        // Never exceed the original amount for a category
        _compactedTokens[cat] = Math.round(Math.min(normalized, original));
      } else {
        _compactedTokens[cat] = 0;
      }
    }

    // Step 3: adjust for rounding — distribute remainder to largest category
    var actualSum = _totalTokens(_compactedTokens);
    var diff = targetTotal - actualSum;
    if (diff !== 0) {
      // Find the category with the most tokens to absorb the rounding error
      var maxCat = CATEGORIES[0];
      for (var i = 1; i < CATEGORIES.length; i++) {
        if (_compactedTokens[CATEGORIES[i]] > _compactedTokens[maxCat]) {
          maxCat = CATEGORIES[i];
        }
      }
      _compactedTokens[maxCat] = Math.max(0, _compactedTokens[maxCat] + diff);
    }
  }

  // ============================================================
  //  DOM BUILDING
  // ============================================================

  /**
   * Build the entire UI inside the container. Called once during init().
   */
  function _buildDOM() {
    _container.innerHTML = '';
    _container.classList.add('compaction-sim');

    // Header
    var header = _el('div', 'cs-header');
    header.appendChild(_el('h3', 'cs-header__title', '/compact Simulator'));
    header.appendChild(_el('span', 'cs-header__badge', 'Interactive'));
    _container.appendChild(header);

    // Legend
    var legend = _el('div', 'cs-legend');
    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var item = _el('div', 'cs-legend__item');
      var swatch = _el('span', 'cs-legend__swatch');
      swatch.style.backgroundColor = COLORS[cat];
      item.appendChild(swatch);
      item.appendChild(_el('span', null, LABELS[cat]));
      legend.appendChild(item);
    }
    _container.appendChild(legend);

    // Controls
    _buildControls();

    // Button row
    _buildButtons();

    // Progress bar
    var progressWrap = _el('div', 'cs-progress-wrap');
    var progressBar = _el('div', 'cs-progress-bar');
    progressWrap.appendChild(progressBar);
    _container.appendChild(progressWrap);
    _els.progressWrap = progressWrap;
    _els.progressBar = progressBar;

    // Comparison columns (before / after)
    var compare = _el('div', 'cs-compare');
    var colBefore = _buildColumn('Before /compact', 'before');
    var colAfter  = _buildColumn('After /compact', 'after');
    compare.appendChild(colBefore);
    compare.appendChild(colAfter);
    _container.appendChild(compare);

    // Stats summary
    var statsTitle = _el('p', 'cs-section-title');
    statsTitle.innerHTML = '📊 Compaction Statistics';
    _container.appendChild(statsTitle);
    var stats = _el('div', 'cs-stats');
    _els.stats = stats;
    _container.appendChild(stats);

    // Per-category breakdown
    var breakTitle = _el('p', 'cs-section-title');
    breakTitle.innerHTML = '📋 Category Breakdown';
    _container.appendChild(breakTitle);
    var breakdownWrap = _el('div');
    _els.breakdownWrap = breakdownWrap;
    _container.appendChild(breakdownWrap);

    // Suggestions panel
    var sugTitle = _el('p', 'cs-section-title');
    sugTitle.innerHTML = '💡 Recommendations';
    _container.appendChild(sugTitle);
    var suggestions = _el('div', 'cs-suggestions');
    _els.suggestions = suggestions;
    _container.appendChild(suggestions);

    // Initial render
    _render();
  }

  /**
   * Build the controls section: ratio slider + priority mode select.
   */
  function _buildControls() {
    var controls = _el('div', 'cs-controls');

    // Ratio slider
    var ratioGroup = _el('div', 'cs-control-group');
    var ratioLabel = _el('label', 'cs-control-label');
    ratioLabel.innerHTML = 'Keep Ratio: <span class="cs-control-label__value" id="cs-ratio-value">' + _state.ratio + '%</span>';
    ratioLabel.setAttribute('for', 'cs-ratio-slider');
    ratioGroup.appendChild(ratioLabel);

    var ratioSlider = document.createElement('input');
    ratioSlider.type = 'range';
    ratioSlider.id = 'cs-ratio-slider';
    ratioSlider.className = 'cs-slider';
    ratioSlider.min = '20';
    ratioSlider.max = '80';
    ratioSlider.value = String(_state.ratio);
    ratioGroup.appendChild(ratioSlider);

    var ratioRange = _el('div');
    ratioRange.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--cs-text-muted);';
    ratioRange.appendChild(_el('span', null, '20% (aggressive)'));
    ratioRange.appendChild(_el('span', null, '80% (gentle)'));
    ratioGroup.appendChild(ratioRange);
    controls.appendChild(ratioGroup);

    // Priority mode select
    var prioGroup = _el('div', 'cs-control-group');
    var prioLabel = _el('label', 'cs-control-label', 'Priority Mode');
    prioLabel.setAttribute('for', 'cs-priority-select');
    prioGroup.appendChild(prioLabel);

    var prioSelect = document.createElement('select');
    prioSelect.id = 'cs-priority-select';
    prioSelect.className = 'cs-select';
    var modes = Object.keys(PRIORITY_MODES);
    for (var i = 0; i < modes.length; i++) {
      var opt = document.createElement('option');
      opt.value = modes[i];
      opt.textContent = PRIORITY_MODES[modes[i]].label;
      if (modes[i] === _state.priority) opt.selected = true;
      prioSelect.appendChild(opt);
    }
    prioGroup.appendChild(prioSelect);

    var prioDesc = _el('div', 'cs-priority-desc');
    prioDesc.id = 'cs-priority-desc';
    prioDesc.textContent = PRIORITY_MODES[_state.priority].desc;
    prioGroup.appendChild(prioDesc);
    controls.appendChild(prioGroup);

    _container.appendChild(controls);

    // Event listeners
    _els.ratioSlider = ratioSlider;
    _els.prioSelect = prioSelect;
    _els.prioDesc = prioDesc;

    ratioSlider.addEventListener('input', function () {
      _state.ratio = parseInt(ratioSlider.value) || 60;
      document.getElementById('cs-ratio-value').textContent = _state.ratio + '%';
      if (_state.compacted && !_state.animating) {
        // Re-compute in real-time if already compacted
        _computeCompacted();
        _render();
      }
    });

    prioSelect.addEventListener('change', function () {
      _state.priority = prioSelect.value;
      var desc = document.getElementById('cs-priority-desc');
      if (desc) {
        desc.textContent = (PRIORITY_MODES[_state.priority] || PRIORITY_MODES.balanced).desc;
      }
      if (_state.compacted && !_state.animating) {
        _computeCompacted();
        _render();
      }
    });
  }

  /**
   * Build the button row: Run Compact + Reset.
   */
  function _buildButtons() {
    var btnRow = _el('div', 'cs-btn-row');

    var runBtn = _el('button', 'cs-btn cs-btn--primary');
    runBtn.innerHTML = '▶ Run /compact';
    runBtn.id = 'cs-run-btn';
    runBtn.addEventListener('click', function () {
      runCompact();
    });
    btnRow.appendChild(runBtn);

    var resetBtn = _el('button', 'cs-btn cs-btn--secondary');
    resetBtn.textContent = '↺ Reset';
    resetBtn.addEventListener('click', function () {
      reset();
    });
    btnRow.appendChild(resetBtn);

    _container.appendChild(btnRow);
    _els.runBtn = runBtn;
  }

  /**
   * Build one comparison column (before or after).
   * Returns the column DOM element.
   */
  function _buildColumn(title, side) {
    var col = _el('div', 'cs-column');

    var colTitle = _el('p', 'cs-column__title', title);
    col.appendChild(colTitle);

    var colTotal = _el('p', 'cs-column__total');
    colTotal.id = 'cs-total-' + side;
    col.appendChild(colTotal);

    var bars = _el('div', 'cs-bars');
    bars.id = 'cs-bars-' + side;

    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var row = _el('div', 'cs-bar-row');

      // Label with color dot
      var label = _el('div', 'cs-bar-label');
      var dot = _el('span', 'cs-bar-label__dot');
      dot.style.backgroundColor = COLORS[cat];
      label.appendChild(dot);
      label.appendChild(_el('span', null, LABELS[cat]));
      row.appendChild(label);

      // Bar track + fill
      var track = _el('div', 'cs-bar-track');
      var fill = _el('div', 'cs-bar-fill');
      fill.id = 'cs-fill-' + side + '-' + cat;
      fill.style.backgroundColor = COLORS[cat];
      track.appendChild(fill);
      row.appendChild(track);

      // Value text
      var val = _el('span', 'cs-bar-value');
      val.id = 'cs-val-' + side + '-' + cat;
      row.appendChild(val);

      bars.appendChild(row);
    }

    col.appendChild(bars);
    return col;
  }

  // ============================================================
  //  RENDERING
  // ============================================================

  /**
   * Full re-render of all dynamic sections.
   */
  function _render() {
    _renderBars();
    _renderStats();
    _renderBreakdown();
    _renderSuggestions();
  }

  /**
   * Render the before/after bar charts.
   * During animation, the "after" bars show interpolated values.
   */
  function _renderBars() {
    var totalBefore = _totalTokens(_state.tokens);
    var totalAfter  = _totalTokens(_compactedTokens);
    // Use the "before" total as the 100% width reference for both columns
    var maxVal = totalBefore || 1;

    // Before column — always shows original values
    var beforeTotal = document.getElementById('cs-total-before');
    if (beforeTotal) beforeTotal.textContent = _fmt(totalBefore) + ' tokens';

    // After column
    var afterTotal = document.getElementById('cs-total-after');
    if (afterTotal) {
      afterTotal.textContent = _state.compacted || _state.animating
        ? _fmt(totalAfter) + ' tokens'
        : '—';
    }

    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var beforeVal = _state.tokens[cat] || 0;
      var afterVal  = _compactedTokens[cat] || 0;

      // Before bars
      var bFill = document.getElementById('cs-fill-before-' + cat);
      var bVal  = document.getElementById('cs-val-before-' + cat);
      if (bFill) bFill.style.width = ((beforeVal / maxVal) * 100) + '%';
      if (bVal)  bVal.textContent = _fmt(beforeVal);

      // After bars
      var aFill = document.getElementById('cs-fill-after-' + cat);
      var aVal  = document.getElementById('cs-val-after-' + cat);
      if (_state.compacted || _state.animating) {
        if (aFill) aFill.style.width = ((afterVal / maxVal) * 100) + '%';
        if (aVal)  aVal.textContent = _fmt(afterVal);
      } else {
        if (aFill) aFill.style.width = ((beforeVal / maxVal) * 100) + '%';
        if (aVal)  aVal.textContent = '—';
      }
    }
  }

  /**
   * Render the statistics summary cards.
   */
  function _renderStats() {
    if (!_els.stats) return;

    var totalBefore = _totalTokens(_state.tokens);
    var totalAfter  = _state.compacted ? _totalTokens(_compactedTokens) : totalBefore;
    var reduction   = totalBefore > 0 ? ((totalBefore - totalAfter) / totalBefore * 100) : 0;
    var freed       = totalBefore - totalAfter;

    var html = '';

    html += _statCard(_fmt(totalBefore), 'Before Total', '');
    html += _statCard(
      _state.compacted ? _fmt(totalAfter) : '—',
      'After Total',
      _state.compacted ? 'blue' : ''
    );
    html += _statCard(
      _state.compacted ? (reduction.toFixed(1) + '% reduction') : '—',
      'Compression',
      _state.compacted ? 'green' : ''
    );
    html += _statCard(
      _state.compacted ? _fmt(freed) : '—',
      'Tokens Freed',
      _state.compacted ? 'green' : ''
    );

    _els.stats.innerHTML = html;
  }

  /** Build a single stat card HTML string */
  function _statCard(value, label, colorClass) {
    var cls = 'cs-stat__value';
    if (colorClass) cls += ' cs-stat__value--' + colorClass;
    return '<div class="cs-stat">' +
      '<div class="' + cls + '">' + value + '</div>' +
      '<div class="cs-stat__label">' + label + '</div>' +
      '</div>';
  }

  /**
   * Render the per-category breakdown table.
   */
  function _renderBreakdown() {
    if (!_els.breakdownWrap) return;

    var html = '<table class="cs-breakdown">';
    html += '<thead><tr>' +
      '<th>Category</th>' +
      '<th>Before</th>' +
      '<th>After</th>' +
      '<th>Reduction</th>' +
      '</tr></thead><tbody>';

    var totalBefore = 0;
    var totalAfter = 0;

    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var before = _state.tokens[cat] || 0;
      var after  = _state.compacted ? (_compactedTokens[cat] || 0) : before;
      var diff   = before - after;
      var pct    = before > 0 ? ((diff / before) * 100).toFixed(1) : '0.0';

      totalBefore += before;
      totalAfter += after;

      html += '<tr>';
      html += '<td><span class="cs-breakdown__cat">' +
        '<span class="cs-bar-label__dot" style="background:' + COLORS[cat] + '"></span>' +
        LABELS[cat] +
        '</span></td>';
      html += '<td>' + _fmt(before) + '</td>';
      html += '<td>' + (_state.compacted ? _fmt(after) : '—') + '</td>';
      html += '<td class="cs-breakdown__diff' +
        (_state.compacted && diff > 0 ? ' cs-breakdown__diff--positive' : '') +
        '">' +
        (_state.compacted ? '-' + _fmt(diff) + ' (' + pct + '%)' : '—') +
        '</td>';
      html += '</tr>';
    }

    // Total row
    var totalDiff = totalBefore - totalAfter;
    var totalPct = totalBefore > 0 ? ((totalDiff / totalBefore) * 100).toFixed(1) : '0.0';
    html += '<tr style="font-weight:700;border-top:2px solid var(--cs-border)">';
    html += '<td>Total</td>';
    html += '<td>' + _fmt(totalBefore) + '</td>';
    html += '<td>' + (_state.compacted ? _fmt(totalAfter) : '—') + '</td>';
    html += '<td class="cs-breakdown__diff' +
      (_state.compacted && totalDiff > 0 ? ' cs-breakdown__diff--positive' : '') +
      '">' +
      (_state.compacted ? '-' + _fmt(totalDiff) + ' (' + totalPct + '%)' : '—') +
      '</td>';
    html += '</tr>';

    html += '</tbody></table>';
    _els.breakdownWrap.innerHTML = html;
  }

  /**
   * Render smart suggestions based on current token distribution.
   */
  function _renderSuggestions() {
    if (!_els.suggestions) return;

    var totalTokens  = _totalTokens(_state.tokens);
    var contextWin   = _state.contextWindow || 200000;
    var usagePercent = totalTokens > 0 ? (totalTokens / contextWin * 100) : 0;
    var toolsPercent = totalTokens > 0 ? ((_state.tokens.tools || 0) / totalTokens * 100) : 0;
    var systemPct    = totalTokens > 0 ? ((_state.tokens.system || 0) / totalTokens * 100) : 0;

    var suggestions = [];

    // Urgency-based suggestions
    if (usagePercent > 90) {
      suggestions.push({
        type: 'danger',
        icon: '🚨',
        text: 'Urgent: Context window nearly full (' + usagePercent.toFixed(0) +
              '% used). Run <code>/compact</code> now to free up space and avoid truncation.'
      });
    } else if (usagePercent > 70) {
      suggestions.push({
        type: 'warn',
        icon: '⚠️',
        text: 'Context usage is high (' + usagePercent.toFixed(0) +
              '%). Consider running <code>/compact</code> soon to maintain headroom.'
      });
    } else if (usagePercent < 50 && totalTokens > 0) {
      suggestions.push({
        type: 'ok',
        icon: '✅',
        text: 'No compaction needed yet. Context usage is healthy at ' + usagePercent.toFixed(0) + '%.'
      });
    }

    // Tool-specific suggestions
    if (toolsPercent > 40) {
      suggestions.push({
        type: 'warn',
        icon: '🔧',
        text: 'Tool outputs occupy ' + toolsPercent.toFixed(0) +
              '% of context. Consider using <code>/compact</code> with "Minimize Tools" priority to aggressively compress tool results.'
      });
    } else if (toolsPercent > 25) {
      suggestions.push({
        type: 'info',
        icon: '🔧',
        text: 'Tool outputs make up ' + toolsPercent.toFixed(0) +
              '% of context. The "Minimize Tools" mode can help reclaim space from verbose tool outputs.'
      });
    }

    // System prompt suggestions
    if (systemPct > 30) {
      suggestions.push({
        type: 'info',
        icon: '⚙️',
        text: 'System prompts take up ' + systemPct.toFixed(0) +
              '% of context. Use "Keep System" mode if these prompts contain critical instructions.'
      });
    }

    // If compacted, show result feedback
    if (_state.compacted) {
      var freed = _totalTokens(_state.tokens) - _totalTokens(_compactedTokens);
      var freedPct = totalTokens > 0 ? (freed / totalTokens * 100) : 0;
      if (freedPct >= 30) {
        suggestions.push({
          type: 'ok',
          icon: '🎉',
          text: 'Compaction freed ' + _fmt(freed) + ' tokens (' + freedPct.toFixed(1) +
                '% reduction). You have significantly more room for conversation.'
        });
      } else if (freedPct > 0) {
        suggestions.push({
          type: 'info',
          icon: '📉',
          text: 'Compaction freed ' + _fmt(freed) + ' tokens (' + freedPct.toFixed(1) +
                '% reduction). Try a lower keep ratio for more aggressive compression.'
        });
      }
    }

    // Default suggestion if nothing else applies
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'info',
        icon: '💡',
        text: 'Set token values and adjust the compression parameters, then click "Run /compact" to simulate context compaction.'
      });
    }

    var html = '';
    for (var i = 0; i < suggestions.length; i++) {
      var s = suggestions[i];
      html += '<div class="cs-suggestion cs-suggestion--' + s.type + '">' +
        '<span class="cs-suggestion__icon">' + s.icon + '</span>' +
        '<span class="cs-suggestion__text">' + s.text + '</span>' +
        '</div>';
    }
    _els.suggestions.innerHTML = html;
  }

  // ============================================================
  //  ANIMATION
  // ============================================================

  /**
   * Animate the transition from before-values to after-values
   * using requestAnimationFrame over ANIM_DURATION ms.
   */
  function _animateCompaction() {
    _state.animating = true;

    // Disable the Run button during animation
    if (_els.runBtn) _els.runBtn.disabled = true;

    // Show progress bar
    if (_els.progressWrap) _els.progressWrap.classList.add('cs-progress-wrap--active');

    // Capture start values (the "after" column currently shows original values)
    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      _anim.startValues[cat] = _state.tokens[cat] || 0;
      _anim.endValues[cat]   = _compactedTokens[cat] || 0;
    }

    _anim.startTime = performance.now();

    function tick(now) {
      var elapsed = now - _anim.startTime;
      var t = _clamp(elapsed / ANIM_DURATION, 0, 1);

      // Ease-out cubic
      var eased = 1 - Math.pow(1 - t, 3);

      // Interpolate compacted token values for display
      for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        _compactedTokens[cat] = Math.round(
          _anim.startValues[cat] + (_anim.endValues[cat] - _anim.startValues[cat]) * eased
        );
      }

      // Update progress bar
      if (_els.progressBar) {
        _els.progressBar.style.width = (eased * 100) + '%';
      }

      // Render current frame
      _renderBars();

      if (t < 1) {
        _anim.rafId = requestAnimationFrame(tick);
      } else {
        // Animation complete — finalize
        _state.animating = false;
        _state.compacted = true;

        // Restore exact final values
        for (var i = 0; i < CATEGORIES.length; i++) {
          _compactedTokens[CATEGORIES[i]] = _anim.endValues[CATEGORIES[i]];
        }

        // Re-enable button
        if (_els.runBtn) _els.runBtn.disabled = false;

        // Fade out progress bar after a short delay
        setTimeout(function () {
          if (_els.progressWrap) _els.progressWrap.classList.remove('cs-progress-wrap--active');
          if (_els.progressBar) _els.progressBar.style.width = '0%';
        }, 400);

        // Full re-render to show stats, breakdown, and suggestions
        _render();
      }
    }

    _anim.rafId = requestAnimationFrame(tick);
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  /**
   * Initialize the compaction simulator.
   * Creates all DOM elements inside the given container.
   * @param {string} containerId - ID of the container element
   */
  function init(containerId) {
    if (_inited) return;

    var el = document.getElementById(containerId);
    if (!el) {
      console.warn('CompactionSim: container #' + containerId + ' not found');
      return;
    }

    _container = el;
    _injectStyles();
    _buildDOM();
    _inited = true;
  }

  /**
   * Set the current token distribution.
   * Call this whenever the main app's token values change.
   * @param {{ system: number, user: number, assistant: number, tools: number }} tokens
   * @param {number} [contextWindow] - Total context window size (default 200000)
   */
  function setTokens(tokens, contextWindow) {
    _state.tokens = {
      system:    (tokens && tokens.system)    || 0,
      user:      (tokens && tokens.user)      || 0,
      assistant: (tokens && tokens.assistant) || 0,
      tools:     (tokens && tokens.tools)     || 0
    };

    if (contextWindow !== undefined && contextWindow > 0) {
      _state.contextWindow = contextWindow;
    }

    // If already compacted, recompute and re-render
    if (_state.compacted && !_state.animating) {
      _computeCompacted();
    }

    if (_inited) _render();
  }

  /**
   * Run the compaction simulation with animation.
   * Computes target values and triggers the animated transition.
   */
  function runCompact() {
    if (!_inited || _state.animating) return;

    var totalBefore = _totalTokens(_state.tokens);
    if (totalBefore === 0) {
      // Nothing to compact
      return;
    }

    // Compute final compacted values
    _computeCompacted();

    // If already compacted, save current "after" as start for animation
    if (_state.compacted) {
      // Reset the after column to originals for re-animation
      for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        _anim.startValues[cat] = _state.tokens[cat] || 0;
      }
    }

    _state.compacted = false; // will be set to true after animation
    _animateCompaction();
  }

  /**
   * Reset the simulator to its initial state.
   * Cancels any running animation.
   */
  function reset() {
    // Cancel running animation
    if (_anim.rafId) {
      cancelAnimationFrame(_anim.rafId);
      _anim.rafId = null;
    }

    _state.compacted = false;
    _state.animating = false;

    // Reset compacted tokens to zero
    for (var i = 0; i < CATEGORIES.length; i++) {
      _compactedTokens[CATEGORIES[i]] = 0;
    }

    // Re-enable button
    if (_els.runBtn) _els.runBtn.disabled = false;

    // Hide progress bar
    if (_els.progressWrap) _els.progressWrap.classList.remove('cs-progress-wrap--active');
    if (_els.progressBar) _els.progressBar.style.width = '0%';

    if (_inited) _render();
  }

  /**
   * Check whether the module has been initialized.
   * @returns {boolean}
   */
  function isInited() {
    return _inited;
  }

  // ============================================================
  //  EXPOSE PUBLIC API
  // ============================================================

  return {
    init: init,
    setTokens: setTokens,
    runCompact: runCompact,
    reset: reset,
    isInited: isInited
  };

})();

// Expose on window for external access
window.CompactionSim = CompactionSim;
