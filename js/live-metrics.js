/**
 * Claude Context Window Visualizer — Live Metrics Dashboard
 * Compact real-time metrics: token rate, turns remaining, cost accumulator,
 * context health score, fill-rate trend, and budget usage.
 * Zero dependencies — vanilla JS IIFE with programmatic DOM and SVG.
 */

window.LiveMetrics = (function () {
  'use strict';

  // ---- Module State ----
  var _inited = false;
  var _containerId = '';
  var _container = null;
  var _els = {};                // DOM element cache keyed by card id

  // History buffer (fixed-size ring)
  var MAX_HISTORY = 30;
  var _history = [];            // { timestamp, tokens, total, contextWindow }
  var _lastUpdateTime = 0;

  // Running cost accumulator
  var _totalInputTokens = 0;
  var _totalOutputTokens = 0;
  var _animatedCost = 0;        // smoothly interpolated display cost
  var _targetCost = 0;

  // Budget (user-configurable, default $1)
  var _budget = 1;

  // Rate sparkline data (last 20 rates)
  var SPARKLINE_POINTS = 20;
  var _rateHistory = [];

  // Fill-rate sparkline data (last 20 fill percentages)
  var _fillHistory = [];

  // Animation frame id
  var _rafId = null;

  // SVG namespace
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ---- Card Definitions ----
  var CARD_DEFS = [
    { id: 'rate',    title: 'Tokens / Second' },
    { id: 'turns',   title: 'Turns Remaining' },
    { id: 'cost',    title: 'Cost Accumulator' },
    { id: 'health',  title: 'Context Health' },
    { id: 'fill',    title: 'Fill Rate Trend' },
    { id: 'budget',  title: 'Budget Usage' }
  ];

  // ---- Utility Helpers ----

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /**
   * Format a dollar amount: < $0.01 shows "<$0.01", otherwise 2-4 decimals.
   */
  function fmtCost(v) {
    if (v <= 0) return '$0.00';
    if (v < 0.01) return '<$0.01';
    if (v < 1) return '$' + v.toFixed(4);
    return '$' + v.toFixed(2);
  }

  /**
   * Get the active model object from CLAUDE_MODELS by index.
   */
  function getModel(modelIndex) {
    if (typeof CLAUDE_MODELS === 'undefined') return null;
    return CLAUDE_MODELS[modelIndex] || null;
  }

  /**
   * Determine status color class from a 0-1 ratio (0 = good, 1 = bad).
   */
  function statusLevel(ratio) {
    if (ratio < 0.6) return 'green';
    if (ratio < 0.85) return 'amber';
    return 'red';
  }

  /**
   * Create a DOM element with optional class names.
   */
  function el(tag, className) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  /**
   * Create an SVG element with attributes.
   */
  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  // ================================================================
  //  DOM Construction
  // ================================================================

  function buildDOM() {
    _container = document.getElementById(_containerId);
    if (!_container) {
      console.warn('LiveMetrics: container #' + _containerId + ' not found');
      return false;
    }

    _container.innerHTML = '';
    _container.classList.add('lm');

    // Grid wrapper
    var grid = el('div', 'lm__grid');

    for (var i = 0; i < CARD_DEFS.length; i++) {
      var def = CARD_DEFS[i];
      var card = buildCard(def);
      grid.appendChild(card);
    }

    _container.appendChild(grid);
    injectStyles();
    return true;
  }

  /**
   * Build a single metric card.
   */
  function buildCard(def) {
    var card = el('div', 'lm__card lm__card--' + def.id);
    card.setAttribute('role', 'status');
    card.setAttribute('aria-label', def.title + ' metric');

    // Title
    var title = el('div', 'lm__card-title');
    title.textContent = def.title;
    card.appendChild(title);

    // Value container (aria-live for screen readers)
    var value = el('div', 'lm__card-value');
    value.setAttribute('aria-live', 'polite');
    card.appendChild(value);

    // Visual area (sparkline / ring / bar)
    var visual = el('div', 'lm__card-visual');
    card.appendChild(visual);

    // Store references
    _els[def.id] = { card: card, value: value, visual: visual };

    // Build card-specific internals
    switch (def.id) {
      case 'rate':   buildRateVisual(visual);   break;
      case 'turns':  buildTurnsVisual(visual);  break;
      case 'cost':   break; // value-only, no special visual
      case 'health': buildHealthVisual(visual);  break;
      case 'fill':   buildFillVisual(visual);    break;
      case 'budget': buildBudgetVisual(visual);  break;
    }

    // Set initial placeholder values
    updateCardValue(def.id, getDefaultValue(def.id));

    return card;
  }

  function getDefaultValue(id) {
    switch (id) {
      case 'rate':   return '-- tok/s';
      case 'turns':  return '~-- turns';
      case 'cost':   return '$0.00';
      case 'health': return '--';
      case 'fill':   return '-- Steady';
      case 'budget': return '$0 / $' + _budget.toFixed(0);
    }
    return '--';
  }

  function updateCardValue(id, html) {
    if (_els[id] && _els[id].value) {
      _els[id].value.innerHTML = html;
    }
  }

  // ---- Sparkline Builder (rate & fill) ----

  function buildSparklineSVG(container, gradientId) {
    var svg = svgEl('svg', {
      width: '120', height: '30', viewBox: '0 0 120 30',
      'role': 'img', 'aria-label': 'Sparkline chart showing recent trend'
    });
    svg.classList.add('lm__sparkline');

    // Gradient fill
    var defs = svgEl('defs');
    var grad = svgEl('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
    var stop1 = svgEl('stop', { offset: '0%', 'stop-color': 'var(--accent-purple)', 'stop-opacity': '0.4' });
    var stop2 = svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent-purple)', 'stop-opacity': '0.05' });
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Area path (filled region under the line)
    var area = svgEl('path', {
      d: 'M0,30 L120,30', fill: 'url(#' + gradientId + ')', stroke: 'none'
    });
    area.classList.add('lm__sparkline-area');
    svg.appendChild(area);

    // Line polyline
    var line = svgEl('polyline', {
      points: '', fill: 'none', stroke: 'var(--accent-purple)',
      'stroke-width': '1.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    });
    line.classList.add('lm__sparkline-line');
    svg.appendChild(line);

    container.appendChild(svg);
    return { svg: svg, line: line, area: area };
  }

  function buildRateVisual(container) {
    _els.rateSparkline = buildSparklineSVG(container, 'lm-rate-grad');
  }

  function buildFillVisual(container) {
    _els.fillSparkline = buildSparklineSVG(container, 'lm-fill-grad');
  }

  // ---- Ring Gauge Builder (turns & health) ----

  function buildRingGauge(container, id, size, radius, stroke) {
    var svg = svgEl('svg', {
      width: String(size), height: String(size),
      viewBox: '0 0 ' + size + ' ' + size,
      'role': 'img', 'aria-label': 'Progress ring gauge'
    });
    svg.classList.add('lm__ring');

    var cx = size / 2;
    var cy = size / 2;
    var circumference = 2 * Math.PI * radius;

    // Background track
    svg.appendChild(svgEl('circle', {
      cx: cx, cy: cy, r: radius,
      fill: 'none', stroke: 'var(--border-color)',
      'stroke-width': stroke
    }));

    // Progress arc
    var progress = svgEl('circle', {
      cx: cx, cy: cy, r: radius,
      fill: 'none', stroke: 'var(--accent-green)',
      'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': '0 ' + circumference,
      'transform': 'rotate(-90 ' + cx + ' ' + cy + ')'
    });
    progress.classList.add('lm__ring-progress');
    svg.appendChild(progress);

    container.appendChild(svg);

    return {
      svg: svg,
      progress: progress,
      circumference: circumference
    };
  }

  function buildTurnsVisual(container) {
    _els.turnsRing = buildRingGauge(container, 'turns', 36, 14, 3);
  }

  function buildHealthVisual(container) {
    _els.healthRing = buildRingGauge(container, 'health', 36, 14, 3);
  }

  // ---- Budget Bar Builder ----

  function buildBudgetVisual(container) {
    var track = el('div', 'lm__budget-track');
    var fill = el('div', 'lm__budget-fill');
    track.appendChild(fill);
    container.appendChild(track);
    _els.budgetFill = fill;
  }

  // ================================================================
  //  Update Logic
  // ================================================================

  /**
   * Main update entry point. Called externally whenever token data changes.
   *
   * @param {{ system: number, user: number, assistant: number, tools: number }} tokens
   * @param {number} modelIndex - Index into CLAUDE_MODELS
   * @param {number} contextWindow - Total context window size in tokens
   */
  function update(tokens, modelIndex, contextWindow) {
    if (!_inited) return;

    var now = Date.now();
    var total = (tokens.system || 0) + (tokens.user || 0) +
                (tokens.assistant || 0) + (tokens.tools || 0);

    // Push to history ring buffer
    _history.push({
      timestamp: now,
      tokens: { system: tokens.system || 0, user: tokens.user || 0,
                assistant: tokens.assistant || 0, tools: tokens.tools || 0 },
      total: total,
      contextWindow: contextWindow || 200000
    });
    if (_history.length > MAX_HISTORY) _history.shift();

    var model = getModel(modelIndex);
    var cw = contextWindow || (model ? model.contextWindow : 200000);
    var percent = cw > 0 ? (total / cw) * 100 : 0;

    // Update each card
    updateRate(now, total);
    updateTurns(tokens, total, cw);
    updateCost(tokens, model);
    updateHealth(tokens, total, cw);
    updateFillTrend(percent);
    updateBudget(model);

    _lastUpdateTime = now;

    // Kick animation loop for cost counter
    if (!_rafId) {
      _rafId = requestAnimationFrame(animateCostCounter);
    }
  }

  // ---- 1. Tokens/Second Rate ----

  function updateRate(now, total) {
    var rate = 0;
    if (_history.length >= 2) {
      var oldest = _history[0];
      var dtSec = (now - oldest.timestamp) / 1000;
      if (dtSec > 0) {
        rate = Math.round((total - oldest.total) / dtSec);
        if (rate < 0) rate = 0; // handle resets
      }
    }

    // Push to sparkline buffer
    _rateHistory.push(rate);
    if (_rateHistory.length > SPARKLINE_POINTS) _rateHistory.shift();

    // Trend arrow
    var arrow = '\u2192'; // →
    if (_rateHistory.length >= 3) {
      var recent = _rateHistory[_rateHistory.length - 1];
      var prev = _rateHistory[_rateHistory.length - 3];
      var diff = recent - prev;
      if (diff > 5) arrow = '\u2191';       // ↑
      else if (diff > 1) arrow = '\u2197';   // ↗
      else if (diff < -5) arrow = '\u2193';  // ↓
      else if (diff < -1) arrow = '\u2198';  // ↘
    }

    updateCardValue('rate', '<span class="lm__trend-arrow">' + arrow + '</span> ' + rate + ' tok/s');
    updateSparkline(_els.rateSparkline, _rateHistory);
    setBorderStatus('rate', rate > 500 ? 'amber' : rate > 1000 ? 'red' : 'green');
  }

  // ---- 2. Turns Remaining ----

  function updateTurns(tokens, total, contextWindow) {
    var userTok = tokens.user || 0;
    var assistantTok = tokens.assistant || 0;
    var avgTurnCost = userTok + assistantTok;
    var remaining = Math.max(0, contextWindow - total);
    var turnsLeft = -1;
    var turnsUsed = 0;
    var turnsTotal = 0;

    if (avgTurnCost > 0 && remaining > 0) {
      turnsLeft = Math.floor(remaining / avgTurnCost);
      turnsUsed = Math.ceil(total / avgTurnCost);
      turnsTotal = turnsUsed + turnsLeft;
    }

    var display = turnsLeft >= 0 ? '~' + turnsLeft + ' turns left' : '~-- turns';
    updateCardValue('turns', display);

    // Update ring gauge
    if (_els.turnsRing && turnsTotal > 0) {
      var fraction = clamp(turnsUsed / turnsTotal, 0, 1);
      var dashLen = fraction * _els.turnsRing.circumference;
      _els.turnsRing.progress.setAttribute('stroke-dasharray',
        dashLen + ' ' + (_els.turnsRing.circumference - dashLen));

      var color = statusLevel(fraction);
      _els.turnsRing.progress.setAttribute('stroke',
        color === 'green' ? 'var(--accent-green)' :
        color === 'amber' ? 'var(--accent-amber)' : 'var(--accent-red)');
    }

    setBorderStatus('turns', turnsLeft < 0 ? 'green' :
      turnsLeft <= 3 ? 'red' : turnsLeft <= 10 ? 'amber' : 'green');
  }

  // ---- 3. Cost Accumulator ----

  function updateCost(tokens, model) {
    if (!model || !model.pricing) {
      updateCardValue('cost', '$0.00');
      return;
    }

    var inputTok = (tokens.system || 0) + (tokens.user || 0) + (tokens.tools || 0);
    var outputTok = tokens.assistant || 0;

    _totalInputTokens = inputTok;
    _totalOutputTokens = outputTok;

    var inputCost = (inputTok / 1000000) * model.pricing.inputPerMTok;
    var outputCost = (outputTok / 1000000) * model.pricing.outputPerMTok;
    _targetCost = inputCost + outputCost;

    // Build display with breakdown
    var html = '<span class="lm__cost-total">' + fmtCost(_animatedCost) + '</span>' +
      '<span class="lm__cost-breakdown">in ' + fmtCost(inputCost) +
      ' &middot; out ' + fmtCost(outputCost) + '</span>';
    updateCardValue('cost', html);

    setBorderStatus('cost', _targetCost > _budget * 0.9 ? 'red' :
      _targetCost > _budget * 0.6 ? 'amber' : 'green');
  }

  /**
   * Animate the cost counter towards the target value using requestAnimationFrame.
   */
  function animateCostCounter() {
    var diff = _targetCost - _animatedCost;
    if (Math.abs(diff) < 0.00001) {
      _animatedCost = _targetCost;
      _rafId = null;
      return;
    }

    _animatedCost = lerp(_animatedCost, _targetCost, 0.15);

    // Re-render cost card value
    var model = null;
    if (typeof CLAUDE_MODELS !== 'undefined' && CLAUDE_MODELS.length > 0) {
      // Use first model pricing just for breakdown display during animation
      model = CLAUDE_MODELS[0];
    }

    var inputCost = model && model.pricing
      ? (_totalInputTokens / 1000000) * model.pricing.inputPerMTok : 0;
    var outputCost = model && model.pricing
      ? (_totalOutputTokens / 1000000) * model.pricing.outputPerMTok : 0;

    var html = '<span class="lm__cost-total">' + fmtCost(_animatedCost) + '</span>' +
      '<span class="lm__cost-breakdown">in ' + fmtCost(inputCost) +
      ' &middot; out ' + fmtCost(outputCost) + '</span>';
    updateCardValue('cost', html);

    _rafId = requestAnimationFrame(animateCostCounter);
  }

  // ---- 4. Context Health Score ----

  function updateHealth(tokens, total, contextWindow) {
    // Score 0-100 based on three factors:
    //   Remaining capacity (40%): more remaining = higher score
    //   Category balance (30%): even distribution = higher score
    //   Cost efficiency (30%): lower cost per token = higher score

    var remaining = Math.max(0, contextWindow - total);
    var capacityScore = contextWindow > 0 ? (remaining / contextWindow) * 100 : 100;

    // Category balance: use coefficient of variation (lower = more balanced)
    var cats = [tokens.system || 0, tokens.user || 0,
                tokens.assistant || 0, tokens.tools || 0];
    var nonZero = cats.filter(function (c) { return c > 0; });
    var balanceScore = 100;
    if (nonZero.length > 1) {
      var mean = total / nonZero.length;
      var variance = 0;
      for (var i = 0; i < nonZero.length; i++) {
        variance += Math.pow(nonZero[i] - mean, 2);
      }
      var cv = mean > 0 ? Math.sqrt(variance / nonZero.length) / mean : 0;
      // cv of 0 = perfectly balanced (score 100), cv of 2+ = very unbalanced (score 0)
      balanceScore = clamp((1 - cv / 2) * 100, 0, 100);
    }

    // Cost efficiency: penalize expensive models proportionally
    // Normalize against cheapest model pricing ($0.80/MTok input)
    var efficiencyScore = 80; // default neutral score
    if (_targetCost > 0 && total > 0) {
      var costPerKTok = (_targetCost / total) * 1000;
      // $0.001/KTok = excellent (100), $0.075/KTok = poor (0)
      efficiencyScore = clamp((1 - costPerKTok / 0.075) * 100, 0, 100);
    }

    var score = Math.round(
      capacityScore * 0.4 + balanceScore * 0.3 + efficiencyScore * 0.3
    );
    score = clamp(score, 0, 100);

    var color = score >= 70 ? 'green' : score >= 40 ? 'amber' : 'red';
    updateCardValue('health', '<span class="lm__health-score lm__health-score--' +
      color + '">' + score + '</span><span class="lm__health-label">/100</span>');

    // Update health ring
    if (_els.healthRing) {
      var fraction = score / 100;
      var dashLen = fraction * _els.healthRing.circumference;
      _els.healthRing.progress.setAttribute('stroke-dasharray',
        dashLen + ' ' + (_els.healthRing.circumference - dashLen));
      _els.healthRing.progress.setAttribute('stroke',
        color === 'green' ? 'var(--accent-green)' :
        color === 'amber' ? 'var(--accent-amber)' : 'var(--accent-red)');
    }

    setBorderStatus('health', color);
  }

  // ---- 5. Fill Rate Trend ----

  function updateFillTrend(percent) {
    _fillHistory.push(percent);
    if (_fillHistory.length > SPARKLINE_POINTS) _fillHistory.shift();

    // Determine trend from recent fill rate changes
    var trend = 'Steady';
    var arrow = '\u2192'; // →
    if (_fillHistory.length >= 4) {
      var len = _fillHistory.length;
      // Compare rate of change: recent half vs older half
      var mid = Math.floor(len / 2);
      var olderRate = (_fillHistory[mid] - _fillHistory[0]) / mid;
      var newerRate = (_fillHistory[len - 1] - _fillHistory[mid]) / (len - mid);

      if (newerRate > olderRate + 0.5) {
        trend = 'Accelerating';
        arrow = '\u2191'; // ↑
      } else if (newerRate < olderRate - 0.5) {
        trend = 'Decelerating';
        arrow = '\u2193'; // ↓
      } else if (newerRate > 0.1) {
        trend = 'Steady';
        arrow = '\u2197'; // ↗
      } else if (newerRate < -0.1) {
        trend = 'Steady';
        arrow = '\u2198'; // ↘
      }
    }

    var color = trend === 'Accelerating' ? 'amber' :
                trend === 'Decelerating' ? 'green' : 'green';
    updateCardValue('fill', '<span class="lm__trend-arrow">' + arrow +
      '</span> ' + trend);
    updateSparkline(_els.fillSparkline, _fillHistory);
    setBorderStatus('fill', color);
  }

  // ---- 6. Budget Usage ----

  function updateBudget(model) {
    var spent = _targetCost;
    var pct = _budget > 0 ? clamp((spent / _budget) * 100, 0, 100) : 0;

    // Estimate cost at completion: if we know current fill%, extrapolate
    var estCompletion = spent;
    if (_fillHistory.length > 0) {
      var currentFill = _fillHistory[_fillHistory.length - 1];
      if (currentFill > 1) {
        estCompletion = (spent / currentFill) * 100;
      }
    }

    var html = fmtCost(spent) + ' / ' + fmtCost(_budget);
    if (estCompletion > spent && estCompletion < _budget * 10) {
      html += '<span class="lm__budget-est">est. ' + fmtCost(estCompletion) + '</span>';
    }
    updateCardValue('budget', html);

    // Update budget bar fill
    if (_els.budgetFill) {
      _els.budgetFill.style.width = pct.toFixed(1) + '%';
      var barColor = pct < 60 ? 'var(--accent-green)' :
                     pct < 85 ? 'var(--accent-amber)' : 'var(--accent-red)';
      _els.budgetFill.style.background = barColor;
    }

    setBorderStatus('budget', pct >= 85 ? 'red' : pct >= 60 ? 'amber' : 'green');
  }

  // ---- Sparkline Rendering ----

  /**
   * Update an SVG sparkline with new data points.
   */
  function updateSparkline(refs, data) {
    if (!refs || !refs.line || data.length < 2) return;

    var w = 120;
    var h = 30;
    var pad = 2;
    var chartW = w - pad * 2;
    var chartH = h - pad * 2;

    // Find data range
    var max = -Infinity;
    var min = Infinity;
    for (var i = 0; i < data.length; i++) {
      if (data[i] > max) max = data[i];
      if (data[i] < min) min = data[i];
    }
    var range = max - min;
    if (range < 1) range = 1; // prevent division by zero

    // Build polyline points
    var points = [];
    for (var j = 0; j < data.length; j++) {
      var x = pad + (j / (SPARKLINE_POINTS - 1)) * chartW;
      var y = pad + chartH - ((data[j] - min) / range) * chartH;
      points.push(x.toFixed(1) + ',' + y.toFixed(1));
    }

    refs.line.setAttribute('points', points.join(' '));

    // Build area path (close along the bottom)
    var firstX = pad + (0 / (SPARKLINE_POINTS - 1)) * chartW;
    var lastX = pad + ((data.length - 1) / (SPARKLINE_POINTS - 1)) * chartW;
    var areaD = 'M' + firstX.toFixed(1) + ',' + (pad + chartH);
    for (var k = 0; k < data.length; k++) {
      var ax = pad + (k / (SPARKLINE_POINTS - 1)) * chartW;
      var ay = pad + chartH - ((data[k] - min) / range) * chartH;
      areaD += ' L' + ax.toFixed(1) + ',' + ay.toFixed(1);
    }
    areaD += ' L' + lastX.toFixed(1) + ',' + (pad + chartH) + ' Z';
    refs.area.setAttribute('d', areaD);
  }

  // ---- Border Status Helper ----

  /**
   * Set the border color status on a card: green, amber, or red.
   */
  function setBorderStatus(cardId, status) {
    if (!_els[cardId] || !_els[cardId].card) return;
    var card = _els[cardId].card;
    card.classList.remove('lm__card--green', 'lm__card--amber', 'lm__card--red');
    card.classList.add('lm__card--' + status);
  }

  // ================================================================
  //  Budget Setter
  // ================================================================

  /**
   * Allow external callers to set the budget cap.
   */
  function setBudget(amount) {
    _budget = Math.max(0.01, amount);
  }

  // ================================================================
  //  Styles (injected once)
  // ================================================================

  function injectStyles() {
    if (document.getElementById('lm-styles')) return;

    var css = [
      '/* Live Metrics Dashboard */',

      /* Grid layout */
      '.lm__grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(3, 1fr);',
      '  gap: 12px;',
      '}',

      /* Tablet: 2 columns */
      '@media (max-width: 900px) {',
      '  .lm__grid { grid-template-columns: repeat(2, 1fr); }',
      '}',

      /* Mobile: 1 column */
      '@media (max-width: 540px) {',
      '  .lm__grid { grid-template-columns: 1fr; }',
      '}',

      /* Card base — glass-morphism */
      '.lm__card {',
      '  position: relative;',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 4px;',
      '  padding: 12px 14px;',
      '  min-height: 120px;',
      '  background: var(--bg-card);',
      '  backdrop-filter: blur(var(--glass-blur));',
      '  -webkit-backdrop-filter: blur(var(--glass-blur));',
      '  border: 1px solid var(--border-color);',
      '  border-radius: var(--radius-md);',
      '  transition: border-color var(--transition-normal), box-shadow var(--transition-normal);',
      '  overflow: hidden;',
      '}',

      '.lm__card:hover {',
      '  background: var(--bg-card-hover);',
      '  border-color: var(--border-hover);',
      '}',

      /* Color-coded border states */
      '.lm__card--green { border-left: 3px solid var(--accent-green); }',
      '.lm__card--amber { border-left: 3px solid var(--accent-amber); }',
      '.lm__card--red   { border-left: 3px solid var(--accent-red); }',

      /* Title */
      '.lm__card-title {',
      '  font-size: 0.65rem;',
      '  font-weight: 600;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.06em;',
      '  color: var(--text-muted);',
      '  line-height: 1;',
      '}',

      /* Value */
      '.lm__card-value {',
      '  font-size: 1.15rem;',
      '  font-weight: 700;',
      '  color: var(--text-primary);',
      '  font-variant-numeric: tabular-nums;',
      '  line-height: 1.3;',
      '  flex: 1;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  flex-wrap: wrap;',
      '}',

      /* Visual area */
      '.lm__card-visual {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  min-height: 30px;',
      '}',

      /* Trend arrows */
      '.lm__trend-arrow {',
      '  font-size: 1.1rem;',
      '  line-height: 1;',
      '}',

      /* Sparkline SVGs */
      '.lm__sparkline {',
      '  width: 100%;',
      '  height: 30px;',
      '  display: block;',
      '}',

      '.lm__sparkline-line {',
      '  transition: points var(--transition-normal);',
      '}',

      /* Ring gauges */
      '.lm__ring {',
      '  flex-shrink: 0;',
      '}',

      '.lm__ring-progress {',
      '  transition: stroke-dasharray var(--transition-normal), stroke var(--transition-fast);',
      '}',

      /* Cost breakdown */
      '.lm__cost-total {',
      '  font-size: 1.3rem;',
      '  font-weight: 800;',
      '}',

      '.lm__cost-breakdown {',
      '  font-size: 0.65rem;',
      '  font-weight: 500;',
      '  color: var(--text-muted);',
      '  width: 100%;',
      '}',

      /* Health score coloring */
      '.lm__health-score { font-size: 1.5rem; font-weight: 800; }',
      '.lm__health-score--green { color: var(--accent-green); }',
      '.lm__health-score--amber { color: var(--accent-amber); }',
      '.lm__health-score--red   { color: var(--accent-red); }',
      '.lm__health-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }',

      /* Budget bar */
      '.lm__budget-track {',
      '  width: 100%;',
      '  height: 6px;',
      '  background: var(--border-color);',
      '  border-radius: 3px;',
      '  overflow: hidden;',
      '}',

      '.lm__budget-fill {',
      '  height: 100%;',
      '  width: 0%;',
      '  border-radius: 3px;',
      '  background: var(--accent-green);',
      '  transition: width var(--transition-normal), background var(--transition-fast);',
      '}',

      '.lm__budget-est {',
      '  display: block;',
      '  font-size: 0.6rem;',
      '  color: var(--text-muted);',
      '  font-weight: 500;',
      '  width: 100%;',
      '}',

      /* Light theme adjustments */
      '[data-theme="light"] .lm__card {',
      '  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);',
      '}',

      '[data-theme="light"] .lm__card:hover {',
      '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);',
      '}'
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'lm-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ================================================================
  //  Public API
  // ================================================================

  /**
   * Initialize the Live Metrics dashboard inside a container element.
   * @param {string} containerId - The ID of the container element.
   */
  function init(containerId) {
    if (_inited) return;
    _containerId = containerId;

    if (!buildDOM()) return;

    _inited = true;
  }

  /**
   * Reset all accumulated data and history.
   */
  function reset() {
    _history = [];
    _rateHistory = [];
    _fillHistory = [];
    _totalInputTokens = 0;
    _totalOutputTokens = 0;
    _animatedCost = 0;
    _targetCost = 0;
    _lastUpdateTime = 0;

    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }

    // Reset card displays
    for (var i = 0; i < CARD_DEFS.length; i++) {
      updateCardValue(CARD_DEFS[i].id, getDefaultValue(CARD_DEFS[i].id));
      setBorderStatus(CARD_DEFS[i].id, 'green');
    }
  }

  return {
    init: init,
    update: update,
    reset: reset,
    setBudget: setBudget,
    isInited: function () { return _inited; }
  };
})();
