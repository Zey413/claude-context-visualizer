/**
 * Claude Context Window Visualizer — Health Monitor HUD
 * Compact always-visible bar at the top of .main showing real-time
 * context health: usage ring, cost ticker, remaining tokens, model badge,
 * danger alert, and estimated remaining turns.
 */

'use strict';

var HealthMonitor = (function () {
  var _inited = false;
  var _bar = null;

  // DOM element references (populated during init)
  var _els = {
    ring: null,
    ringPath: null,
    ringLabel: null,
    costValue: null,
    remainingValue: null,
    modelBadge: null,
    dangerIcon: null,
    turnsValue: null,
  };

  // Cached previous values for change detection
  var _prev = {
    percent: -1,
    cost: -1,
    remaining: -1,
    modelName: '',
    turns: -1,
  };

  // Ring geometry constants
  var RING_SIZE = 30;
  var RING_RADIUS = 11;
  var RING_STROKE = 3;
  var RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  // Color thresholds
  var THRESHOLD_GREEN = 70;
  var THRESHOLD_AMBER = 90;
  var DANGER_THRESHOLD = 85;

  // Cost categories (matches app.js)
  var INPUT_CATS = ['system', 'user', 'tools'];
  var OUTPUT_CATS = ['assistant'];
  var ALL_CATS = ['system', 'user', 'assistant', 'tools'];

  /**
   * Get the color for a given usage percentage.
   */
  function getUsageColor(percent) {
    if (percent >= THRESHOLD_AMBER) return 'var(--accent-red)';
    if (percent >= THRESHOLD_GREEN) return 'var(--accent-amber)';
    return 'var(--accent-green)';
  }

  /**
   * Build the health monitor bar DOM and insert it at the top of .main.
   */
  function init() {
    if (_inited) return;

    var main = document.querySelector('.main');
    if (!main) {
      console.warn('HealthMonitor: .main container not found');
      return;
    }

    // Create bar container
    _bar = document.createElement('div');
    _bar.className = 'health-monitor';
    _bar.setAttribute('role', 'status');
    _bar.setAttribute('aria-label', 'Context health monitor');

    // ---- Usage Ring (SVG) ----
    var ringWrap = document.createElement('div');
    ringWrap.className = 'health-monitor__ring-wrap';
    ringWrap.title = 'Context usage percentage';

    var cx = RING_SIZE / 2;
    var cy = RING_SIZE / 2;

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', RING_SIZE);
    svg.setAttribute('height', RING_SIZE);
    svg.setAttribute('viewBox', '0 0 ' + RING_SIZE + ' ' + RING_SIZE);
    svg.classList.add('health-monitor__ring-svg');
    svg.setAttribute('aria-hidden', 'true');

    // Background track
    var bgCircle = document.createElementNS(svgNS, 'circle');
    bgCircle.setAttribute('cx', cx);
    bgCircle.setAttribute('cy', cy);
    bgCircle.setAttribute('r', RING_RADIUS);
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('stroke', 'var(--border-color)');
    bgCircle.setAttribute('stroke-width', RING_STROKE);
    svg.appendChild(bgCircle);

    // Progress arc
    var progressCircle = document.createElementNS(svgNS, 'circle');
    progressCircle.setAttribute('cx', cx);
    progressCircle.setAttribute('cy', cy);
    progressCircle.setAttribute('r', RING_RADIUS);
    progressCircle.setAttribute('fill', 'none');
    progressCircle.setAttribute('stroke', 'var(--accent-green)');
    progressCircle.setAttribute('stroke-width', RING_STROKE);
    progressCircle.setAttribute('stroke-linecap', 'round');
    progressCircle.setAttribute('stroke-dasharray', '0 ' + RING_CIRCUMFERENCE);
    progressCircle.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
    progressCircle.classList.add('health-monitor__ring-progress');
    svg.appendChild(progressCircle);
    _els.ringPath = progressCircle;

    ringWrap.appendChild(svg);

    // Ring percentage label
    var ringLabel = document.createElement('span');
    ringLabel.className = 'health-monitor__ring-label';
    ringLabel.textContent = '0%';
    ringWrap.appendChild(ringLabel);
    _els.ringLabel = ringLabel;

    _els.ring = ringWrap;

    // ---- Cost Ticker ----
    var costSection = _buildSection(
      'health-monitor__cost',
      '$',
      '0.000',
      'Estimated cost'
    );
    _els.costValue = costSection.querySelector('.health-monitor__value');

    // ---- Remaining Tokens ----
    var remainSection = _buildSection(
      'health-monitor__remaining',
      '',
      '0',
      'Remaining tokens'
    );
    _els.remainingValue = remainSection.querySelector('.health-monitor__value');

    // ---- Model Badge ----
    var modelBadge = document.createElement('span');
    modelBadge.className = 'health-monitor__model-badge';
    modelBadge.title = 'Active model';
    modelBadge.textContent = '--';
    _els.modelBadge = modelBadge;

    // ---- Danger Alert Icon ----
    var dangerIcon = document.createElement('span');
    dangerIcon.className = 'health-monitor__danger';
    dangerIcon.setAttribute('aria-hidden', 'true');
    dangerIcon.title = 'High context usage warning';
    dangerIcon.innerHTML = '&#x26A0;'; // ⚠
    _els.dangerIcon = dangerIcon;

    // ---- Estimated Remaining Turns ----
    var turnsSection = _buildSection(
      'health-monitor__turns',
      '',
      '--',
      'Estimated remaining turns'
    );
    var turnsLabel = turnsSection.querySelector('.health-monitor__label');
    if (turnsLabel) turnsLabel.textContent = 'turns left';
    _els.turnsValue = turnsSection.querySelector('.health-monitor__value');

    // ---- Assemble Bar ----
    _bar.appendChild(ringWrap);
    _bar.appendChild(costSection);
    _bar.appendChild(_buildSep());
    _bar.appendChild(remainSection);
    _bar.appendChild(_buildSep());
    _bar.appendChild(modelBadge);
    _bar.appendChild(_buildSep());
    _bar.appendChild(turnsSection);
    _bar.appendChild(dangerIcon);

    // Inject styles (only once)
    _injectStyles();

    // Insert at the very top of .main, before its first child
    main.insertBefore(_bar, main.firstChild);

    _inited = true;
  }

  /**
   * Build a small section element with a value and a label.
   * Returns the section container.
   */
  function _buildSection(cls, prefix, defaultValue, titleText) {
    var section = document.createElement('div');
    section.className = 'health-monitor__section ' + cls;
    section.title = titleText;

    var value = document.createElement('span');
    value.className = 'health-monitor__value';
    value.textContent = prefix + defaultValue;

    var label = document.createElement('span');
    label.className = 'health-monitor__label';
    label.textContent = titleText;

    section.appendChild(value);
    section.appendChild(label);
    return section;
  }

  /**
   * Build a vertical separator dot.
   */
  function _buildSep() {
    var sep = document.createElement('span');
    sep.className = 'health-monitor__sep';
    sep.setAttribute('aria-hidden', 'true');
    return sep;
  }

  /**
   * Update the health monitor with current token and model data.
   *
   * @param {{ system: number, user: number, assistant: number, tools: number }} tokens
   *   Token counts for each category.
   * @param {object} model
   *   A model object from CLAUDE_MODELS (must have contextWindow, name, pricing).
   */
  function update(tokens, model) {
    if (!_inited || !_bar) return;

    var total = 0;
    var i;
    for (i = 0; i < ALL_CATS.length; i++) {
      total += (tokens[ALL_CATS[i]] || 0);
    }

    var contextWindow = model.contextWindow || 0;
    var percent = contextWindow > 0 ? (total / contextWindow) * 100 : 0;
    percent = Math.min(percent, 100);

    // ---- Usage Ring ----
    var roundedPercent = Math.round(percent);
    if (roundedPercent !== _prev.percent) {
      _prev.percent = roundedPercent;

      var usageColor = getUsageColor(percent);
      var dashLen = (percent / 100) * RING_CIRCUMFERENCE;
      _els.ringPath.setAttribute('stroke-dasharray', dashLen + ' ' + (RING_CIRCUMFERENCE - dashLen));
      _els.ringPath.setAttribute('stroke', usageColor);
      _els.ringLabel.textContent = roundedPercent + '%';
      _els.ringLabel.style.color = usageColor;
    }

    // ---- Cost Ticker ----
    var inputTokens = 0;
    for (i = 0; i < INPUT_CATS.length; i++) {
      inputTokens += (tokens[INPUT_CATS[i]] || 0);
    }
    var outputTokens = 0;
    for (i = 0; i < OUTPUT_CATS.length; i++) {
      outputTokens += (tokens[OUTPUT_CATS[i]] || 0);
    }

    var cost = 0;
    if (model.pricing) {
      cost = (inputTokens / 1000000) * model.pricing.inputPerMTok +
             (outputTokens / 1000000) * model.pricing.outputPerMTok;
    }

    // Only update DOM if cost changed (compare rounded to 4 decimals)
    var costRounded = Math.round(cost * 10000);
    if (costRounded !== _prev.cost) {
      _prev.cost = costRounded;
      _els.costValue.textContent = '$' + cost.toFixed(3);
    }

    // ---- Remaining Tokens ----
    var remaining = Math.max(0, contextWindow - total);
    if (remaining !== _prev.remaining) {
      _prev.remaining = remaining;
      _els.remainingValue.textContent = formatTokensShort(remaining);
      // Color-code remaining
      if (percent >= 90) {
        _els.remainingValue.style.color = 'var(--accent-red)';
      } else if (percent >= 70) {
        _els.remainingValue.style.color = 'var(--accent-amber)';
      } else {
        _els.remainingValue.style.color = 'var(--accent-green)';
      }
    }

    // ---- Model Badge ----
    var modelName = model.name || '--';
    if (modelName !== _prev.modelName) {
      _prev.modelName = modelName;
      // Shorten name for compact display: "Claude Opus 4.6" -> "Opus 4.6"
      var shortName = modelName.replace(/^Claude\s+/i, '');
      _els.modelBadge.textContent = shortName;
      // Tint badge border with model color if available
      if (model.color) {
        _els.modelBadge.style.borderColor = model.color;
        _els.modelBadge.style.color = model.color;
      }
    }

    // ---- Danger Alert ----
    if (percent >= DANGER_THRESHOLD) {
      _els.dangerIcon.classList.add('health-monitor__danger--active');
    } else {
      _els.dangerIcon.classList.remove('health-monitor__danger--active');
    }

    // ---- Estimated Remaining Turns ----
    var turnsEstimate = _estimateTurns(tokens, remaining);
    if (turnsEstimate !== _prev.turns) {
      _prev.turns = turnsEstimate;
      if (turnsEstimate < 0) {
        _els.turnsValue.textContent = '--';
        _els.turnsValue.style.color = '';
      } else {
        _els.turnsValue.textContent = '~' + turnsEstimate;
        // Color-code turns
        if (turnsEstimate <= 3) {
          _els.turnsValue.style.color = 'var(--accent-red)';
        } else if (turnsEstimate <= 10) {
          _els.turnsValue.style.color = 'var(--accent-amber)';
        } else {
          _els.turnsValue.style.color = 'var(--accent-green)';
        }
      }
    }
  }

  /**
   * Estimate remaining conversation turns based on current per-turn token cost.
   * Returns -1 if not estimable.
   */
  function _estimateTurns(tokens, remaining) {
    var userTokens = tokens.user || 0;
    var assistantTokens = tokens.assistant || 0;
    var turnCost = userTokens + assistantTokens;

    if (turnCost <= 0 || remaining <= 0) return -1;
    return Math.floor(remaining / turnCost);
  }

  /**
   * Inject component-scoped CSS into the document head.
   * Keeps styles co-located with the module.
   */
  function _injectStyles() {
    if (document.getElementById('health-monitor-styles')) return;

    var style = document.createElement('style');
    style.id = 'health-monitor-styles';
    style.textContent = [
      /* Bar container */
      '.health-monitor {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 12px;',
      '  padding: 6px 16px;',
      '  background: var(--bg-card);',
      '  backdrop-filter: blur(var(--glass-blur));',
      '  -webkit-backdrop-filter: blur(var(--glass-blur));',
      '  border: 1px solid var(--border-color);',
      '  border-radius: var(--radius-md);',
      '  margin-bottom: 16px;',
      '  position: sticky;',
      '  top: 0;',
      '  z-index: 50;',
      '  min-height: 42px;',
      '  flex-shrink: 0;',
      '  transition: border-color var(--transition-fast);',
      '  overflow: hidden;',
      '}',

      /* Ring wrapper */
      '.health-monitor__ring-wrap {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  flex-shrink: 0;',
      '  cursor: default;',
      '}',

      '.health-monitor__ring-svg {',
      '  flex-shrink: 0;',
      '}',

      '.health-monitor__ring-progress {',
      '  transition: stroke-dasharray var(--transition-normal), stroke var(--transition-fast);',
      '}',

      '.health-monitor__ring-label {',
      '  font-size: 13px;',
      '  font-weight: 700;',
      '  font-variant-numeric: tabular-nums;',
      '  min-width: 36px;',
      '  transition: color var(--transition-fast);',
      '}',

      /* Sections (cost, remaining, turns) */
      '.health-monitor__section {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: flex-start;',
      '  gap: 1px;',
      '  min-width: 0;',
      '}',

      '.health-monitor__value {',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: var(--text-primary);',
      '  font-variant-numeric: tabular-nums;',
      '  white-space: nowrap;',
      '  transition: color var(--transition-fast);',
      '}',

      '.health-monitor__label {',
      '  font-size: 10px;',
      '  color: var(--text-muted);',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '  white-space: nowrap;',
      '}',

      /* Model badge */
      '.health-monitor__model-badge {',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  padding: 2px 8px;',
      '  border-radius: var(--radius-sm);',
      '  border: 1px solid var(--border-color);',
      '  background: var(--bg-card);',
      '  white-space: nowrap;',
      '  transition: color var(--transition-fast), border-color var(--transition-fast);',
      '}',

      /* Separator */
      '.health-monitor__sep {',
      '  width: 3px;',
      '  height: 3px;',
      '  border-radius: 50%;',
      '  background: var(--text-muted);',
      '  opacity: 0.5;',
      '  flex-shrink: 0;',
      '}',

      /* Danger icon */
      '.health-monitor__danger {',
      '  font-size: 16px;',
      '  line-height: 1;',
      '  opacity: 0;',
      '  transform: scale(0.6);',
      '  transition: opacity var(--transition-fast), transform var(--transition-fast);',
      '  pointer-events: none;',
      '  flex-shrink: 0;',
      '  color: var(--accent-red);',
      '  margin-left: auto;',
      '}',

      '.health-monitor__danger--active {',
      '  opacity: 1;',
      '  transform: scale(1);',
      '  pointer-events: auto;',
      '  animation: hm-pulse 1.2s ease-in-out infinite;',
      '}',

      /* Pulse animation */
      '@keyframes hm-pulse {',
      '  0%, 100% { opacity: 1; transform: scale(1); }',
      '  50% { opacity: 0.5; transform: scale(1.15); }',
      '}',

      /* Responsive: hide labels on narrow viewports, collapse sections */
      '@media (max-width: 900px) {',
      '  .health-monitor__label { display: none; }',
      '  .health-monitor { gap: 8px; padding: 4px 12px; }',
      '}',

      '@media (max-width: 600px) {',
      '  .health-monitor__turns { display: none; }',
      '  .health-monitor__model-badge { display: none; }',
      '  .health-monitor { gap: 6px; padding: 4px 8px; }',
      '}',
    ].join('\n');

    document.head.appendChild(style);
  }

  // ---- Public API ----
  return {
    init: init,
    update: update,
  };
})();
