/**
 * Claude Context Window Visualizer — Prompt Caching Cost Savings Visualizer
 * Shows how prompt caching reduces API costs with interactive sliders,
 * side-by-side cost bars, savings breakdown, and recommendations.
 */

'use strict';

const CacheViz = (function () {
  let _inited = false;
  let _container = null;

  // Current state
  var _state = {
    hitRate: 80,           // 0-100 %
    cachedTokens: 0,       // 0 to total input tokens
    tokens: { system: 0, user: 0, assistant: 0, tools: 0 },
    modelIndex: 0,
  };

  // Category groupings
  var INPUT_CATEGORIES = ['system', 'user', 'tools'];
  var OUTPUT_CATEGORIES = ['assistant'];

  /**
   * Initialize the cache visualizer panel toggle.
   */
  function init() {
    var toggle = document.getElementById('cache-toggle');
    var card = document.getElementById('cache-card');
    if (!toggle || !card) return;

    toggle.addEventListener('click', function () {
      var isOpen = card.classList.toggle('cache-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen && !_inited) {
        _inited = true;
        _container = document.getElementById('cache-container');
        _buildBody();
        _render();
      }
    });
  }

  /**
   * Update with the current token state and model.
   * Called from the main render loop in app.js.
   * @param {{ system: number, user: number, assistant: number, tools: number }} tokens
   * @param {number} modelIndex - Index into CLAUDE_MODELS
   */
  function update(tokens, modelIndex) {
    if (!_inited || !_container) return;

    _state.tokens = {
      system: tokens.system || 0,
      user: tokens.user || 0,
      assistant: tokens.assistant || 0,
      tools: tokens.tools || 0,
    };
    _state.modelIndex = modelIndex;

    // Clamp cached tokens to total input tokens
    var totalInput = _getTotalInput();
    if (_state.cachedTokens > totalInput) {
      _state.cachedTokens = totalInput;
    }

    // Update the cached tokens slider max
    var cachedSlider = document.getElementById('cache-cached-slider');
    if (cachedSlider) {
      cachedSlider.max = totalInput;
      if (parseInt(cachedSlider.value) > totalInput) {
        cachedSlider.value = _state.cachedTokens;
      }
    }

    _render();
  }

  function isInited() { return _inited; }

  // ---- Internal Helpers ----

  function _getTotalInput() {
    return INPUT_CATEGORIES.reduce(function (s, c) { return s + (_state.tokens[c] || 0); }, 0);
  }

  function _getTotalOutput() {
    return OUTPUT_CATEGORIES.reduce(function (s, c) { return s + (_state.tokens[c] || 0); }, 0);
  }

  function _getModel() {
    return CLAUDE_MODELS[_state.modelIndex] || CLAUDE_MODELS[0];
  }

  /**
   * Build the panel body HTML with sliders and placeholders.
   */
  function _buildBody() {
    if (!_container) return;

    var totalInput = _getTotalInput();

    var html = '';

    // -- Sliders Section --
    html += '<div class="cache-sliders">';

    // Cache Hit Rate slider
    html += '<div class="cache-slider-group">';
    html += '<div class="cache-slider-header">';
    html += '<label for="cache-hit-slider" class="cache-slider-label">Cache Hit Rate</label>';
    html += '<span class="cache-slider-value" id="cache-hit-value">' + _state.hitRate + '%</span>';
    html += '</div>';
    html += '<input type="range" id="cache-hit-slider" class="cache-slider" min="0" max="100" value="' + _state.hitRate + '" />';
    html += '<div class="cache-slider-range"><span>0%</span><span>100%</span></div>';
    html += '</div>';

    // Cached Tokens slider
    html += '<div class="cache-slider-group">';
    html += '<div class="cache-slider-header">';
    html += '<label for="cache-cached-slider" class="cache-slider-label">Cached Tokens</label>';
    html += '<span class="cache-slider-value" id="cache-cached-value">' + formatNumber(_state.cachedTokens) + '</span>';
    html += '</div>';
    html += '<input type="range" id="cache-cached-slider" class="cache-slider" min="0" max="' + totalInput + '" value="' + _state.cachedTokens + '" />';
    html += '<div class="cache-slider-range"><span>0</span><span id="cache-cached-max">' + formatNumber(totalInput) + '</span></div>';
    html += '</div>';

    html += '</div>'; // .cache-sliders

    // -- Visual Comparison Bars --
    html += '<div class="cache-comparison" id="cache-comparison"></div>';

    // -- Savings Summary --
    html += '<div class="cache-savings" id="cache-savings"></div>';

    // -- Breakdown Table --
    html += '<div class="cache-breakdown" id="cache-breakdown"></div>';

    // -- Recommendation --
    html += '<div class="cache-recommendation" id="cache-recommendation"></div>';

    _container.innerHTML = html;

    // Wire up slider events
    var hitSlider = document.getElementById('cache-hit-slider');
    var cachedSlider = document.getElementById('cache-cached-slider');

    if (hitSlider) {
      hitSlider.addEventListener('input', function () {
        _state.hitRate = parseInt(hitSlider.value) || 0;
        document.getElementById('cache-hit-value').textContent = _state.hitRate + '%';
        _render();
      });
    }

    if (cachedSlider) {
      cachedSlider.addEventListener('input', function () {
        _state.cachedTokens = parseInt(cachedSlider.value) || 0;
        document.getElementById('cache-cached-value').textContent = formatNumber(_state.cachedTokens);
        _render();
      });
    }
  }

  /**
   * Recalculate costs and re-render all sections.
   */
  function _render() {
    if (!_container) return;

    var costs = _calculateCosts();
    _renderComparison(costs);
    _renderSavings(costs);
    _renderBreakdown(costs);
    _renderRecommendation(costs);

    // Update cached tokens slider max label
    var maxLabel = document.getElementById('cache-cached-max');
    if (maxLabel) {
      maxLabel.textContent = formatNumber(_getTotalInput());
    }
  }

  /**
   * Core cost calculation.
   * Returns an object with all cost components.
   */
  function _calculateCosts() {
    var model = _getModel();
    var pricing = model.pricing;

    var totalInput = _getTotalInput();
    var totalOutput = _getTotalOutput();
    var cachedTokens = Math.min(_state.cachedTokens, totalInput);
    var uncachedInput = totalInput - cachedTokens;
    var hitRate = _state.hitRate / 100;

    // ---- Without Cache ----
    var noCacheInputCost = (totalInput / 1e6) * pricing.inputPerMTok;
    var noCacheOutputCost = (totalOutput / 1e6) * pricing.outputPerMTok;
    var noCacheTotalCost = noCacheInputCost + noCacheOutputCost;

    // ---- With Cache ----
    // First request (cache miss): write cached tokens + read uncached at input price
    var cacheWriteCost = (cachedTokens / 1e6) * pricing.cacheWritePerMTok;
    var uncachedInputCost = (uncachedInput / 1e6) * pricing.inputPerMTok;
    var firstRequestInputCost = cacheWriteCost + uncachedInputCost;

    // Subsequent requests (cache hit): read cached tokens + read uncached at input price
    var cacheReadCost = (cachedTokens / 1e6) * pricing.cacheReadPerMTok;
    var subsequentRequestInputCost = cacheReadCost + uncachedInputCost;

    // Output cost is the same regardless of caching
    var outputCost = noCacheOutputCost;

    // Blended cost = (1 - hitRate) * firstCost + hitRate * subsequentCost + outputCost
    var blendedInputCost = (1 - hitRate) * firstRequestInputCost + hitRate * subsequentRequestInputCost;
    var withCacheTotalCost = blendedInputCost + outputCost;

    // Savings
    var savingsAmount = noCacheTotalCost - withCacheTotalCost;
    var savingsPercent = noCacheTotalCost > 0 ? (savingsAmount / noCacheTotalCost) * 100 : 0;

    return {
      // No cache
      noCacheInputCost: noCacheInputCost,
      noCacheOutputCost: noCacheOutputCost,
      noCacheTotalCost: noCacheTotalCost,

      // With cache components
      cacheWriteCost: cacheWriteCost,
      cacheReadCost: cacheReadCost,
      uncachedInputCost: uncachedInputCost,
      outputCost: outputCost,
      blendedInputCost: blendedInputCost,
      withCacheTotalCost: withCacheTotalCost,

      // First/subsequent breakdown
      firstRequestInputCost: firstRequestInputCost,
      subsequentRequestInputCost: subsequentRequestInputCost,

      // Savings
      savingsAmount: savingsAmount,
      savingsPercent: savingsPercent,

      // State refs
      hitRate: hitRate,
      cachedTokens: cachedTokens,
      uncachedInput: uncachedInput,
      totalInput: totalInput,
      totalOutput: totalOutput,
    };
  }

  /**
   * Render the side-by-side cost comparison bars.
   */
  function _renderComparison(costs) {
    var el = document.getElementById('cache-comparison');
    if (!el) return;

    var maxCost = Math.max(costs.noCacheTotalCost, costs.withCacheTotalCost, 0.001);

    var noCachePct = (costs.noCacheTotalCost / maxCost) * 100;
    var withCachePct = (costs.withCacheTotalCost / maxCost) * 100;

    var html = '<div class="cache-comparison__title">Cost Comparison (per request)</div>';

    // No Cache bar
    html += '<div class="cache-comparison__row">';
    html += '<span class="cache-comparison__label">No Cache</span>';
    html += '<div class="cache-comparison__bar-track">';
    html += '<div class="cache-comparison__bar-fill cache-comparison__bar-fill--no-cache" style="width:' + noCachePct.toFixed(1) + '%"></div>';
    html += '</div>';
    html += '<span class="cache-comparison__cost">$' + costs.noCacheTotalCost.toFixed(4) + '</span>';
    html += '</div>';

    // With Cache bar
    html += '<div class="cache-comparison__row">';
    html += '<span class="cache-comparison__label">With Cache</span>';
    html += '<div class="cache-comparison__bar-track">';
    html += '<div class="cache-comparison__bar-fill cache-comparison__bar-fill--with-cache" style="width:' + withCachePct.toFixed(1) + '%"></div>';
    html += '</div>';
    html += '<span class="cache-comparison__cost">$' + costs.withCacheTotalCost.toFixed(4) + '</span>';
    html += '</div>';

    el.innerHTML = html;
  }

  /**
   * Render the savings summary.
   */
  function _renderSavings(costs) {
    var el = document.getElementById('cache-savings');
    if (!el) return;

    var savingsClass = costs.savingsAmount > 0 ? 'cache-savings--positive' : 'cache-savings--neutral';

    if (costs.noCacheTotalCost === 0) {
      el.innerHTML = '<div class="cache-savings__text cache-savings--neutral">Adjust token sliders to see cache savings</div>';
      return;
    }

    var html = '<div class="cache-savings__text ' + savingsClass + '">';

    if (costs.savingsAmount > 0) {
      html += '<span class="cache-savings__amount">$' + costs.savingsAmount.toFixed(4) + ' saved</span>';
      html += '<span class="cache-savings__percent">' + costs.savingsPercent.toFixed(1) + '% reduction</span>';
    } else if (costs.savingsAmount < 0) {
      html += '<span class="cache-savings__amount">$' + Math.abs(costs.savingsAmount).toFixed(4) + ' extra cost</span>';
      html += '<span class="cache-savings__percent">Cache write overhead exceeds savings at this hit rate</span>';
    } else {
      html += '<span class="cache-savings__amount">No savings</span>';
      html += '<span class="cache-savings__percent">Adjust cache hit rate and cached tokens</span>';
    }

    html += '</div>';
    el.innerHTML = html;
  }

  /**
   * Render the cost breakdown table.
   */
  function _renderBreakdown(costs) {
    var el = document.getElementById('cache-breakdown');
    if (!el) return;

    var model = _getModel();

    var html = '<table class="cache-breakdown__table">';
    html += '<thead>';
    html += '<tr>';
    html += '<th class="cache-breakdown__th">Component</th>';
    html += '<th class="cache-breakdown__th cache-breakdown__th--right">Tokens</th>';
    html += '<th class="cache-breakdown__th cache-breakdown__th--right">Rate ($/MTok)</th>';
    html += '<th class="cache-breakdown__th cache-breakdown__th--right">Cost</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';

    // Cache Write (blended: only on miss)
    var blendedWriteCost = (1 - costs.hitRate) * costs.cacheWriteCost;
    html += _breakdownRow(
      'Cache Write',
      costs.cachedTokens,
      model.pricing.cacheWritePerMTok,
      blendedWriteCost,
      'cache-breakdown__row--write'
    );

    // Cache Read (blended: only on hit)
    var blendedReadCost = costs.hitRate * costs.cacheReadCost;
    html += _breakdownRow(
      'Cache Read',
      costs.cachedTokens,
      model.pricing.cacheReadPerMTok,
      blendedReadCost,
      'cache-breakdown__row--read'
    );

    // Uncached Input
    html += _breakdownRow(
      'Uncached Input',
      costs.uncachedInput,
      model.pricing.inputPerMTok,
      costs.uncachedInputCost,
      'cache-breakdown__row--input'
    );

    // Output
    html += _breakdownRow(
      'Output',
      costs.totalOutput,
      model.pricing.outputPerMTok,
      costs.outputCost,
      'cache-breakdown__row--output'
    );

    // Total
    html += '<tr class="cache-breakdown__row cache-breakdown__row--total">';
    html += '<td class="cache-breakdown__td"><strong>Blended Total</strong></td>';
    html += '<td class="cache-breakdown__td cache-breakdown__td--right"></td>';
    html += '<td class="cache-breakdown__td cache-breakdown__td--right"></td>';
    html += '<td class="cache-breakdown__td cache-breakdown__td--right"><strong>$' + costs.withCacheTotalCost.toFixed(4) + '</strong></td>';
    html += '</tr>';

    html += '</tbody>';
    html += '</table>';

    // Footnote
    html += '<div class="cache-breakdown__note">';
    html += 'Write/read costs are blended by hit rate (' + Math.round(costs.hitRate * 100) + '% hit). ';
    html += 'First request: $' + (costs.firstRequestInputCost + costs.outputCost).toFixed(4) + ' | ';
    html += 'Subsequent: $' + (costs.subsequentRequestInputCost + costs.outputCost).toFixed(4);
    html += '</div>';

    el.innerHTML = html;
  }

  /**
   * Helper to build a single breakdown table row.
   */
  function _breakdownRow(label, tokens, rate, cost, rowClass) {
    var html = '<tr class="cache-breakdown__row ' + (rowClass || '') + '">';
    html += '<td class="cache-breakdown__td">' + label + '</td>';
    html += '<td class="cache-breakdown__td cache-breakdown__td--right">' + formatNumber(tokens) + '</td>';
    html += '<td class="cache-breakdown__td cache-breakdown__td--right">$' + rate.toFixed(2) + '</td>';
    html += '<td class="cache-breakdown__td cache-breakdown__td--right">$' + cost.toFixed(4) + '</td>';
    html += '</tr>';
    return html;
  }

  /**
   * Render the recommendation text based on cache hit rate and savings.
   */
  function _renderRecommendation(costs) {
    var el = document.getElementById('cache-recommendation');
    if (!el) return;

    if (costs.totalInput === 0 && costs.totalOutput === 0) {
      el.innerHTML = '<div class="cache-rec cache-rec--neutral">' +
        '<span class="cache-rec__icon">💡</span>' +
        '<span class="cache-rec__text">Adjust the token sliders above to see caching recommendations.</span>' +
        '</div>';
      return;
    }

    var hitRate = costs.hitRate;
    var savingsPct = costs.savingsPercent;
    var icon, cls, text;

    if (costs.cachedTokens === 0) {
      icon = '⚠️';
      cls = 'cache-rec--warning';
      text = 'No tokens are set to be cached. Move the "Cached Tokens" slider to see potential savings. ' +
             'System prompts and tool definitions are great candidates for caching since they rarely change.';
    } else if (hitRate >= 0.90 && savingsPct > 30) {
      icon = '🚀';
      cls = 'cache-rec--excellent';
      text = 'Excellent setup! At ' + Math.round(hitRate * 100) + '% hit rate with ' +
             formatNumber(costs.cachedTokens) + ' cached tokens, you\'re saving ' +
             savingsPct.toFixed(1) + '% per request. ' +
             'This is ideal for production workloads with stable system prompts.';
    } else if (hitRate >= 0.70 && savingsPct > 15) {
      icon = '✅';
      cls = 'cache-rec--good';
      text = 'Good caching configuration. At ' + Math.round(hitRate * 100) + '% hit rate, ' +
             'you\'re saving ' + savingsPct.toFixed(1) + '% per request. ' +
             'Consider increasing the hit rate by keeping prompts stable across requests.';
    } else if (hitRate >= 0.50) {
      icon = '💡';
      cls = 'cache-rec--moderate';
      text = 'Moderate savings at ' + Math.round(hitRate * 100) + '% hit rate. ' +
             'To improve, ensure your cached content (system prompt, instructions) stays consistent. ' +
             'Cache misses trigger write costs (' + _getModel().pricing.cacheWritePerMTok.toFixed(2) +
             '$/MTok) which reduce savings.';
    } else if (hitRate > 0 && costs.savingsAmount > 0) {
      icon = '⚠️';
      cls = 'cache-rec--warning';
      text = 'Low hit rate (' + Math.round(hitRate * 100) + '%) — cache write overhead is significant. ' +
             'Caching is most effective when the same prefix is reused across many requests. ' +
             'If your prompts vary frequently, caching may not be cost-effective.';
    } else if (costs.savingsAmount <= 0) {
      icon = '❌';
      cls = 'cache-rec--negative';
      text = 'At the current hit rate (' + Math.round(hitRate * 100) + '%), caching costs more than it saves. ' +
             'The cache write premium (' + _getModel().pricing.cacheWritePerMTok.toFixed(2) +
             '$/MTok vs ' + _getModel().pricing.inputPerMTok.toFixed(2) +
             '$/MTok input) requires a higher hit rate to break even. ' +
             'Increase hit rate or reduce cached tokens.';
    } else {
      icon = '💡';
      cls = 'cache-rec--neutral';
      text = 'Adjust the sliders to explore different caching scenarios. ' +
             'Prompt caching works best with stable, reusable prefixes like system prompts and tool definitions.';
    }

    el.innerHTML = '<div class="cache-rec ' + cls + '">' +
      '<span class="cache-rec__icon">' + icon + '</span>' +
      '<span class="cache-rec__text">' + text + '</span>' +
      '</div>';
  }

  // ---- Public API ----
  return {
    init: init,
    update: update,
    isInited: isInited,
  };
})();
