/**
 * Claude Context Window Visualizer — Optimization Advisor
 * Analyzes current token allocation patterns and provides intelligent
 * optimization suggestions with actionable advice cards.
 *
 * Features:
 * - Multi-dimensional rule engine (usage, system prompt, caching, model,
 *   tools, conversation, output limit, balance)
 * - Severity-sorted advice cards with fade-in animation
 * - Quick-action buttons (Apply Preset, Switch Model, Run Compact)
 * - Cost optimization hints with savings comparison
 *
 * API:  window.OptimizationAdvisor = { init, analyze, getAdvice, isInited }
 */

'use strict';

var OptimizationAdvisor = (function () {

  // ============================================================
  //  CONSTANTS
  // ============================================================

  var CATEGORIES = ['system', 'user', 'assistant', 'tools'];
  var INPUT_CATS = ['system', 'user', 'tools'];
  var MAX_CARDS = 5;

  // Severity levels (higher number = more severe, sorted descending)
  var SEVERITY = {
    info:     0,
    warning:  1,
    critical: 2
  };

  // Severity badge colors
  var SEVERITY_COLORS = {
    info:     { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#60A5FA' },
    warning:  { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#FBBF24' },
    critical: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  text: '#F87171' }
  };

  // All-good state color
  var ALL_GOOD_COLOR = { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.3)', text: '#34D399' };

  // ============================================================
  //  STATE
  // ============================================================

  var _inited = false;
  var _container = null;
  var _cardsWrap = null;
  var _lastAdvice = [];

  // ============================================================
  //  INIT
  // ============================================================

  /**
   * Initialize the Optimization Advisor panel.
   * Creates DOM structure inside the given container element.
   *
   * @param {string} containerId - The id of the wrapper element to render into.
   */
  function init(containerId) {
    if (_inited) return;

    _container = document.getElementById(containerId);
    if (!_container) {
      console.warn('OptimizationAdvisor: container #' + containerId + ' not found');
      return;
    }

    _injectStyles();
    _buildDOM();
    _inited = true;
  }

  /**
   * Returns whether the module has been initialized.
   */
  function isInited() {
    return _inited;
  }

  // ============================================================
  //  ANALYSIS ENGINE
  // ============================================================

  /**
   * Analyze token allocation and produce an array of advice objects.
   *
   * @param {{ system: number, user: number, assistant: number, tools: number }} tokens
   *   Current token counts per category.
   * @param {number} modelIndex
   *   Index into the global CLAUDE_MODELS array.
   * @param {number} contextWindow
   *   Context window size (may differ from model if overridden).
   * @returns {Array<Object>} Sorted advice array (critical first).
   */
  function analyze(tokens, modelIndex, contextWindow) {
    if (typeof CLAUDE_MODELS === 'undefined') return [];

    var model = CLAUDE_MODELS[modelIndex];
    if (!model) return [];

    var cw = contextWindow || model.contextWindow;
    var total = 0;
    var i;
    for (i = 0; i < CATEGORIES.length; i++) {
      total += (tokens[CATEGORIES[i]] || 0);
    }

    var usagePercent = cw > 0 ? (total / cw) * 100 : 0;
    var remaining = cw - total;
    var advice = [];

    // ---- 1. Usage analysis ----
    _analyzeUsage(advice, usagePercent, total, cw);

    // ---- 2. System prompt optimization ----
    _analyzeSystemPrompt(advice, tokens, cw);

    // ---- 3. Cache suggestion ----
    _analyzeCacheSuggestion(advice, tokens, model);

    // ---- 4. Model suggestion (under-utilization) ----
    _analyzeModelSuggestion(advice, usagePercent, model, modelIndex, tokens);

    // ---- 5. Tool optimization ----
    _analyzeToolUsage(advice, tokens, cw);

    // ---- 6. Conversation management ----
    _analyzeConversationManagement(advice, tokens, cw, usagePercent);

    // ---- 7. Output limit warning ----
    _analyzeOutputLimit(advice, tokens, model);

    // ---- 8. Balance check ----
    _analyzeBalance(advice, tokens, total);

    // Sort by severity (critical > warning > info), then by order added
    advice.sort(function (a, b) {
      return SEVERITY[b.severity] - SEVERITY[a.severity];
    });

    // Cap at MAX_CARDS
    advice = advice.slice(0, MAX_CARDS);

    _lastAdvice = advice;
    return advice;
  }

  /**
   * Get the last computed advice without re-analyzing.
   * @returns {Array<Object>}
   */
  function getAdvice() {
    return _lastAdvice;
  }

  // ---- Rule Implementations ----

  /**
   * Rule 1: Overall usage thresholds.
   *   <30% low utilization, 30-70% normal, 70-90% warning, >90% critical.
   */
  function _analyzeUsage(advice, usagePercent, total, cw) {
    if (total === 0) return; // Skip when empty

    if (usagePercent > 90) {
      advice.push({
        id: 'usage-critical',
        icon: '🔴',
        title: 'Critical Usage',
        description: 'Context window is ' + Math.round(usagePercent) +
          '% full. You may hit truncation or degraded performance. ' +
          'Consider using /compact to summarize older messages.',
        severity: 'critical',
        action: _makeCompactAction()
      });
    } else if (usagePercent > 70) {
      advice.push({
        id: 'usage-warning',
        icon: '🟡',
        title: 'High Usage',
        description: 'Context is ' + Math.round(usagePercent) +
          '% utilized. Keep an eye on remaining capacity (' +
          _formatNum(cw - total) + ' tokens left).',
        severity: 'warning',
        action: null
      });
    } else if (usagePercent < 30 && usagePercent > 0) {
      advice.push({
        id: 'usage-low',
        icon: '💡',
        title: 'Low Utilization',
        description: 'Only ' + Math.round(usagePercent) +
          '% of context is used. You have plenty of headroom — ' +
          'consider adding more context or using a smaller model to save cost.',
        severity: 'info',
        action: _makeModelAction()
      });
    }
    // 30-70% is normal — no advice needed
  }

  /**
   * Rule 2: System prompt too large (>5% of context window).
   */
  function _analyzeSystemPrompt(advice, tokens, cw) {
    var systemTokens = tokens.system || 0;
    if (systemTokens <= 0 || cw <= 0) return;

    var systemPercent = (systemTokens / cw) * 100;
    if (systemPercent > 5) {
      var sev = systemPercent > 15 ? 'warning' : 'info';
      advice.push({
        id: 'system-too-large',
        icon: '⚙️',
        title: 'System Prompt Is Large',
        description: 'System prompt uses ' + systemPercent.toFixed(1) +
          '% of context (' + _formatNum(systemTokens) + ' tokens). ' +
          'Consider condensing instructions or moving examples to user messages.',
        severity: sev,
        action: null
      });
    }
  }

  /**
   * Rule 3: Suggest prompt caching when system tokens are significant
   * and the system prompt appears static (heuristic: >500 tokens).
   */
  function _analyzeCacheSuggestion(advice, tokens, model) {
    var systemTokens = tokens.system || 0;
    if (systemTokens < 500 || !model.pricing) return;

    // Calculate potential savings from caching
    var normalCost = (systemTokens / 1e6) * model.pricing.inputPerMTok;
    var cachedCost = (systemTokens / 1e6) * model.pricing.cacheReadPerMTok;
    var savings = normalCost - cachedCost;
    var savingsPct = normalCost > 0 ? Math.round((savings / normalCost) * 100) : 0;

    if (savingsPct > 50) {
      advice.push({
        id: 'cache-suggestion',
        icon: '💾',
        title: 'Enable Prompt Caching',
        description: 'Your system prompt (' + _formatNum(systemTokens) +
          ' tokens) could benefit from prompt caching. ' +
          'Save ~' + savingsPct + '% on system prompt costs per request ' +
          '($' + savings.toFixed(4) + '/req savings).',
        severity: 'info',
        action: null
      });
    }
  }

  /**
   * Rule 4: Suggest cheaper model if usage is below 20%.
   */
  function _analyzeModelSuggestion(advice, usagePercent, model, modelIndex, tokens) {
    if (usagePercent >= 20 || usagePercent <= 0) return;
    if (typeof CLAUDE_MODELS === 'undefined') return;

    // Find cheapest model that still fits the tokens
    var total = 0;
    for (var i = 0; i < CATEGORIES.length; i++) {
      total += (tokens[CATEGORIES[i]] || 0);
    }

    var cheapest = _findCheapestFittingModel(total, tokens);
    if (!cheapest || cheapest.index === modelIndex) return;

    var currentCost = _calcRequestCost(tokens, model);
    var cheapCost = _calcRequestCost(tokens, cheapest.model);
    var savingsPct = currentCost > 0
      ? Math.round((1 - cheapCost / currentCost) * 100)
      : 0;

    if (savingsPct > 10) {
      advice.push({
        id: 'model-downgrade',
        icon: '💰',
        title: 'Switch to a Cheaper Model',
        description: 'At only ' + Math.round(usagePercent) +
          '% utilization, consider ' + cheapest.model.name +
          ' to save ~' + savingsPct + '% per request ($' +
          cheapCost.toFixed(4) + ' vs $' + currentCost.toFixed(4) + ').',
        severity: 'info',
        action: _makeModelAction()
      });
    }
  }

  /**
   * Rule 5: Tool definitions too large (>30% of context window).
   */
  function _analyzeToolUsage(advice, tokens, cw) {
    var toolsTokens = tokens.tools || 0;
    if (toolsTokens <= 0 || cw <= 0) return;

    var toolsPercent = (toolsTokens / cw) * 100;
    if (toolsPercent > 30) {
      advice.push({
        id: 'tools-heavy',
        icon: '🔧',
        title: 'Heavy Tool Definitions',
        description: 'Tool schemas consume ' + toolsPercent.toFixed(1) +
          '% of context (' + _formatNum(toolsTokens) + ' tokens). ' +
          'Consider reducing the number of tool definitions, ' +
          'simplifying schemas, or using dynamic tool selection.',
        severity: toolsPercent > 50 ? 'critical' : 'warning',
        action: null
      });
    }
  }

  /**
   * Rule 6: Conversation approaching limits — suggest /compact.
   */
  function _analyzeConversationManagement(advice, tokens, cw, usagePercent) {
    var conversationTokens = (tokens.user || 0) + (tokens.assistant || 0);
    if (conversationTokens <= 0 || cw <= 0) return;

    var convPercent = (conversationTokens / cw) * 100;

    // If conversation tokens make up >70% of context and overall usage is high
    if (convPercent > 70 && usagePercent > 60) {
      advice.push({
        id: 'conversation-large',
        icon: '📜',
        title: 'Conversation Is Growing',
        description: 'User + Assistant messages occupy ' + convPercent.toFixed(1) +
          '% of context. Consider using /compact to summarize older ' +
          'messages and free up space.',
        severity: usagePercent > 80 ? 'warning' : 'info',
        action: _makeCompactAction()
      });
    }
  }

  /**
   * Rule 7: Assistant output approaching model.outputLimit.
   */
  function _analyzeOutputLimit(advice, tokens, model) {
    var assistantTokens = tokens.assistant || 0;
    if (assistantTokens <= 0 || !model.outputLimit) return;

    var outputPercent = (assistantTokens / model.outputLimit) * 100;
    if (outputPercent > 80) {
      var sev = outputPercent > 95 ? 'critical' : 'warning';
      advice.push({
        id: 'output-limit',
        icon: '📤',
        title: 'Nearing Output Limit',
        description: 'Assistant output is at ' + outputPercent.toFixed(1) +
          '% of the model\'s ' + _formatNum(model.outputLimit) +
          ' token output limit. Responses may be truncated.',
        severity: sev,
        action: null
      });
    }
  }

  /**
   * Rule 8: Token balance — one category dominates (>60% of used tokens).
   */
  function _analyzeBalance(advice, tokens, total) {
    if (total <= 0) return;

    for (var i = 0; i < CATEGORIES.length; i++) {
      var cat = CATEGORIES[i];
      var catTokens = tokens[cat] || 0;
      var catPercent = (catTokens / total) * 100;

      if (catPercent > 60) {
        var catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
        advice.push({
          id: 'imbalance-' + cat,
          icon: '⚖️',
          title: 'Imbalanced Allocation',
          description: catLabel + ' tokens account for ' + catPercent.toFixed(1) +
            '% of all used tokens. This imbalance may indicate ' +
            _getImbalanceHint(cat) + '.',
          severity: 'warning',
          action: _makePresetAction()
        });
        break; // Only report the most dominant category
      }
    }
  }

  /**
   * Return a context-specific hint for an imbalanced category.
   */
  function _getImbalanceHint(cat) {
    switch (cat) {
      case 'system':    return 'an oversized system prompt that could be trimmed';
      case 'user':      return 'large documents or many user messages that could be summarized';
      case 'assistant': return 'verbose responses — consider requesting shorter outputs';
      case 'tools':     return 'excessive tool schemas — consider reducing active tools';
      default:          return 'an opportunity to re-balance your token allocation';
    }
  }

  // ============================================================
  //  COST HELPERS
  // ============================================================

  /**
   * Calculate cost per request for the given token distribution and model.
   */
  function _calcRequestCost(tokens, model) {
    if (!model || !model.pricing) return 0;

    var inputTokens = 0;
    for (var i = 0; i < INPUT_CATS.length; i++) {
      inputTokens += (tokens[INPUT_CATS[i]] || 0);
    }
    var outputTokens = tokens.assistant || 0;

    return (inputTokens / 1e6) * model.pricing.inputPerMTok +
           (outputTokens / 1e6) * model.pricing.outputPerMTok;
  }

  /**
   * Find the cheapest model whose context window fits the given total tokens.
   * Returns { index, model } or null.
   */
  function _findCheapestFittingModel(totalTokens, tokens) {
    if (typeof CLAUDE_MODELS === 'undefined') return null;

    var bestIndex = -1;
    var bestCost = Infinity;
    var bestModel = null;

    for (var i = 0; i < CLAUDE_MODELS.length; i++) {
      var m = CLAUDE_MODELS[i];
      // Model must fit the total tokens
      if (m.contextWindow < totalTokens) continue;
      // Model must fit assistant output within its output limit
      if (m.outputLimit < (tokens.assistant || 0)) continue;

      var cost = _calcRequestCost(tokens, m);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = i;
        bestModel = m;
      }
    }

    return bestIndex >= 0 ? { index: bestIndex, model: bestModel } : null;
  }

  // ============================================================
  //  COST OPTIMIZATION SUMMARY
  // ============================================================

  /**
   * Compute cost optimization data for the current config.
   * Returns { currentCost, cheapestCost, cheapestModel, savingsPercent, savingsText }
   * or null if no data available.
   */
  function _computeCostOptimization(tokens, modelIndex) {
    if (typeof CLAUDE_MODELS === 'undefined') return null;

    var model = CLAUDE_MODELS[modelIndex];
    if (!model) return null;

    var total = 0;
    for (var i = 0; i < CATEGORIES.length; i++) {
      total += (tokens[CATEGORIES[i]] || 0);
    }
    if (total === 0) return null;

    var currentCost = _calcRequestCost(tokens, model);
    var cheapest = _findCheapestFittingModel(total, tokens);

    if (!cheapest || cheapest.index === modelIndex) {
      return {
        currentCost: currentCost,
        cheapestCost: currentCost,
        cheapestModel: model,
        savingsPercent: 0,
        savingsText: null
      };
    }

    var cheapCost = _calcRequestCost(tokens, cheapest.model);
    var savingsPct = currentCost > 0
      ? Math.round((1 - cheapCost / currentCost) * 100)
      : 0;

    // Generate readable savings text
    var shortName = cheapest.model.name.replace(/^Claude\s+/i, '');
    var savingsText = savingsPct > 0
      ? 'Switch to ' + shortName + ' to save ' + savingsPct + '%'
      : null;

    return {
      currentCost: currentCost,
      cheapestCost: cheapCost,
      cheapestModel: cheapest.model,
      savingsPercent: savingsPct,
      savingsText: savingsText
    };
  }

  // ============================================================
  //  ACTION FACTORIES
  // ============================================================

  /**
   * Create a "Run Compact" action object.
   */
  function _makeCompactAction() {
    return {
      label: 'Run Compact',
      icon: '📦',
      handler: function () {
        if (typeof CompactionSim !== 'undefined' &&
            CompactionSim.isInited && CompactionSim.isInited() &&
            typeof CompactionSim.runCompact === 'function') {
          CompactionSim.runCompact();
        } else {
          // Scroll to compaction section if it exists
          var el = document.getElementById('compaction-sim-section');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Open the panel if closed
            var section = document.getElementById('compaction-sim-section');
            if (section && !section.classList.contains('compaction-sim-section--open')) {
              var toggle = document.getElementById('compaction-sim-toggle');
              if (toggle) toggle.click();
            }
          }
        }
      }
    };
  }

  /**
   * Create an "Apply Preset" action object.
   */
  function _makePresetAction() {
    return {
      label: 'Apply Preset',
      icon: '🎯',
      handler: function () {
        var presetsEl = document.getElementById('presets-grid');
        if (presetsEl) {
          presetsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Brief highlight
          presetsEl.classList.add('oa-highlight-pulse');
          setTimeout(function () {
            presetsEl.classList.remove('oa-highlight-pulse');
          }, 1500);
        }
      }
    };
  }

  /**
   * Create a "Switch Model" action object.
   */
  function _makeModelAction() {
    return {
      label: 'Switch Model',
      icon: '🔄',
      handler: function () {
        var selectEl = document.getElementById('model-select');
        if (selectEl) {
          selectEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          selectEl.focus();
          // Brief highlight
          selectEl.classList.add('oa-highlight-pulse');
          setTimeout(function () {
            selectEl.classList.remove('oa-highlight-pulse');
          }, 1500);
        }
      }
    };
  }

  // ============================================================
  //  DOM CONSTRUCTION
  // ============================================================

  /**
   * Build the advisor panel DOM inside _container.
   */
  function _buildDOM() {
    if (!_container) return;

    // Wrapper
    var wrap = document.createElement('div');
    wrap.className = 'oa-panel';

    // Header with cost optimization summary
    var header = document.createElement('div');
    header.className = 'oa-header';
    header.id = 'oa-header';
    wrap.appendChild(header);

    // Cards container
    _cardsWrap = document.createElement('div');
    _cardsWrap.className = 'oa-cards';
    _cardsWrap.id = 'oa-cards';
    wrap.appendChild(_cardsWrap);

    _container.appendChild(wrap);
  }

  // ============================================================
  //  RENDERING
  // ============================================================

  /**
   * Render advice cards into the panel. Should be called after analyze().
   *
   * @param {{ system: number, user: number, assistant: number, tools: number }} tokens
   * @param {number} modelIndex
   * @param {number} contextWindow
   */
  function _render(tokens, modelIndex, contextWindow) {
    if (!_inited || !_cardsWrap) return;

    var advice = analyze(tokens, modelIndex, contextWindow);
    var costOpt = _computeCostOptimization(tokens, modelIndex);

    // ---- Update header ----
    var headerEl = document.getElementById('oa-header');
    if (headerEl) {
      headerEl.innerHTML = '';

      if (costOpt && costOpt.currentCost > 0) {
        var costLine = document.createElement('div');
        costLine.className = 'oa-cost-line';

        var currentLabel = document.createElement('span');
        currentLabel.className = 'oa-cost-current';
        currentLabel.textContent = 'Cost/request: $' + costOpt.currentCost.toFixed(4);
        costLine.appendChild(currentLabel);

        if (costOpt.savingsText && costOpt.savingsPercent > 0) {
          var savingsBadge = document.createElement('span');
          savingsBadge.className = 'oa-cost-savings';
          savingsBadge.textContent = costOpt.savingsText;
          costLine.appendChild(savingsBadge);
        }

        headerEl.appendChild(costLine);
      }
    }

    // ---- Render cards ----
    _cardsWrap.innerHTML = '';

    if (advice.length === 0) {
      // "All Good" state
      _cardsWrap.appendChild(_buildAllGoodCard());
      return;
    }

    for (var i = 0; i < advice.length; i++) {
      var card = _buildAdviceCard(advice[i], i);
      _cardsWrap.appendChild(card);
    }
  }

  /**
   * Build a single advice card DOM element.
   */
  function _buildAdviceCard(item, index) {
    var colors = SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.info;

    var card = document.createElement('div');
    card.className = 'oa-card oa-card--' + item.severity;
    card.style.borderLeftColor = colors.text;
    card.style.animationDelay = (index * 80) + 'ms';

    // Top row: icon + title + severity badge
    var topRow = document.createElement('div');
    topRow.className = 'oa-card__top';

    var icon = document.createElement('span');
    icon.className = 'oa-card__icon';
    icon.textContent = item.icon;
    icon.setAttribute('aria-hidden', 'true');
    topRow.appendChild(icon);

    var title = document.createElement('span');
    title.className = 'oa-card__title';
    title.textContent = item.title;
    topRow.appendChild(title);

    var badge = document.createElement('span');
    badge.className = 'oa-card__badge';
    badge.textContent = item.severity;
    badge.style.background = colors.bg;
    badge.style.color = colors.text;
    badge.style.borderColor = colors.border;
    topRow.appendChild(badge);

    card.appendChild(topRow);

    // Description
    var desc = document.createElement('p');
    desc.className = 'oa-card__desc';
    desc.textContent = item.description;
    card.appendChild(desc);

    // Action button (if present)
    if (item.action) {
      var btn = document.createElement('button');
      btn.className = 'oa-card__action';
      btn.innerHTML = '<span class="oa-card__action-icon">' +
        item.action.icon + '</span>' + item.action.label;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof item.action.handler === 'function') {
          item.action.handler();
        }
      });
      card.appendChild(btn);
    }

    return card;
  }

  /**
   * Build the green "All Good" card shown when no issues found.
   */
  function _buildAllGoodCard() {
    var card = document.createElement('div');
    card.className = 'oa-card oa-card--allgood';
    card.style.borderLeftColor = ALL_GOOD_COLOR.text;
    card.style.animationDelay = '0ms';

    var topRow = document.createElement('div');
    topRow.className = 'oa-card__top';

    var icon = document.createElement('span');
    icon.className = 'oa-card__icon';
    icon.textContent = '✅';
    icon.setAttribute('aria-hidden', 'true');
    topRow.appendChild(icon);

    var title = document.createElement('span');
    title.className = 'oa-card__title';
    title.textContent = 'All Good!';
    topRow.appendChild(title);

    var badge = document.createElement('span');
    badge.className = 'oa-card__badge';
    badge.textContent = 'healthy';
    badge.style.background = ALL_GOOD_COLOR.bg;
    badge.style.color = ALL_GOOD_COLOR.text;
    badge.style.borderColor = ALL_GOOD_COLOR.border;
    topRow.appendChild(badge);

    card.appendChild(topRow);

    var desc = document.createElement('p');
    desc.className = 'oa-card__desc';
    desc.textContent = 'Your token allocation looks well-balanced. ' +
      'No optimization issues detected. Keep up the good work!';
    card.appendChild(desc);

    return card;
  }

  // ============================================================
  //  PUBLIC UPDATE (called from app.js render loop)
  // ============================================================

  /**
   * Update the advisor with current state. Convenience wrapper
   * that calls analyze() + re-renders cards.
   *
   * @param {{ system: number, user: number, assistant: number, tools: number }} tokens
   * @param {number} modelIndex
   * @param {number} contextWindow
   */
  function update(tokens, modelIndex, contextWindow) {
    _render(tokens, modelIndex, contextWindow);
  }

  // ============================================================
  //  UTILITY
  // ============================================================

  /**
   * Format a number with commas. Falls back to toLocaleString when available.
   */
  function _formatNum(n) {
    if (typeof formatNumber === 'function') return formatNumber(n);
    return Math.round(n).toLocaleString();
  }

  // ============================================================
  //  CSS INJECTION
  // ============================================================

  function _injectStyles() {
    if (document.getElementById('oa-styles')) return;

    var style = document.createElement('style');
    style.id = 'oa-styles';
    style.textContent = [

      /* ---- Panel layout ---- */
      '.oa-panel {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 10px;',
      '}',

      /* ---- Header / Cost summary ---- */
      '.oa-header {',
      '  min-height: 0;',
      '}',

      '.oa-cost-line {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 10px;',
      '  flex-wrap: wrap;',
      '  padding: 8px 12px;',
      '  border-radius: var(--radius-sm, 6px);',
      '  background: var(--bg-card, rgba(30,27,46,0.6));',
      '  border: 1px solid var(--border-color, rgba(139,92,246,0.15));',
      '}',

      '.oa-cost-current {',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: var(--text-primary, #F3F0FF);',
      '  font-variant-numeric: tabular-nums;',
      '}',

      '.oa-cost-savings {',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  padding: 2px 8px;',
      '  border-radius: var(--radius-sm, 6px);',
      '  background: rgba(16,185,129,0.12);',
      '  color: #34D399;',
      '  border: 1px solid rgba(16,185,129,0.3);',
      '  white-space: nowrap;',
      '}',

      /* ---- Cards container ---- */
      '.oa-cards {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 8px;',
      '}',

      /* ---- Single card ---- */
      '.oa-card {',
      '  padding: 12px 14px;',
      '  border-radius: var(--radius-sm, 6px);',
      '  background: var(--bg-card, rgba(30,27,46,0.6));',
      '  border: 1px solid var(--border-color, rgba(139,92,246,0.15));',
      '  border-left-width: 3px;',
      '  animation: oa-fade-in 0.35s ease both;',
      '  transition: background var(--transition-fast, 0.15s),',
      '              border-color var(--transition-fast, 0.15s);',
      '}',

      '.oa-card:hover {',
      '  background: var(--bg-hover, rgba(139,92,246,0.06));',
      '}',

      /* ---- Top row ---- */
      '.oa-card__top {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  margin-bottom: 6px;',
      '}',

      '.oa-card__icon {',
      '  font-size: 16px;',
      '  line-height: 1;',
      '  flex-shrink: 0;',
      '}',

      '.oa-card__title {',
      '  font-size: 13px;',
      '  font-weight: 700;',
      '  color: var(--text-primary, #F3F0FF);',
      '  flex: 1;',
      '  min-width: 0;',
      '}',

      '.oa-card__badge {',
      '  font-size: 10px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.6px;',
      '  padding: 2px 7px;',
      '  border-radius: 999px;',
      '  border: 1px solid;',
      '  flex-shrink: 0;',
      '  line-height: 1.3;',
      '}',

      /* ---- Description ---- */
      '.oa-card__desc {',
      '  font-size: 12px;',
      '  line-height: 1.55;',
      '  color: var(--text-secondary, #A5A0C0);',
      '  margin: 0 0 0 0;',
      '}',

      /* ---- Action button ---- */
      '.oa-card__action {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 5px;',
      '  margin-top: 8px;',
      '  padding: 4px 12px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  color: var(--accent-purple, #A78BFA);',
      '  background: rgba(139,92,246,0.08);',
      '  border: 1px solid rgba(139,92,246,0.25);',
      '  border-radius: var(--radius-sm, 6px);',
      '  cursor: pointer;',
      '  transition: background 0.15s, border-color 0.15s, transform 0.1s;',
      '}',

      '.oa-card__action:hover {',
      '  background: rgba(139,92,246,0.18);',
      '  border-color: rgba(139,92,246,0.45);',
      '}',

      '.oa-card__action:active {',
      '  transform: scale(0.97);',
      '}',

      '.oa-card__action-icon {',
      '  font-size: 12px;',
      '  line-height: 1;',
      '}',

      /* ---- All Good card ---- */
      '.oa-card--allgood {',
      '  border-left-color: #34D399;',
      '}',

      /* ---- Fade-in animation ---- */
      '@keyframes oa-fade-in {',
      '  from {',
      '    opacity: 0;',
      '    transform: translateY(8px);',
      '  }',
      '  to {',
      '    opacity: 1;',
      '    transform: translateY(0);',
      '  }',
      '}',

      /* ---- Highlight pulse (used when action scrolls to a section) ---- */
      '.oa-highlight-pulse {',
      '  animation: oa-pulse-outline 1.5s ease;',
      '}',

      '@keyframes oa-pulse-outline {',
      '  0%   { outline: 2px solid rgba(139,92,246,0);  outline-offset: 0; }',
      '  30%  { outline: 2px solid rgba(139,92,246,0.5); outline-offset: 4px; }',
      '  100% { outline: 2px solid rgba(139,92,246,0);  outline-offset: 8px; }',
      '}',

      /* ---- Light theme overrides ---- */
      '[data-theme="light"] .oa-card {',
      '  background: rgba(255,255,255,0.8);',
      '  border-color: rgba(0,0,0,0.08);',
      '}',

      '[data-theme="light"] .oa-card:hover {',
      '  background: rgba(139,92,246,0.04);',
      '}',

      '[data-theme="light"] .oa-card__title {',
      '  color: #1E1B2E;',
      '}',

      '[data-theme="light"] .oa-card__desc {',
      '  color: #555;',
      '}',

      '[data-theme="light"] .oa-cost-line {',
      '  background: rgba(255,255,255,0.8);',
      '  border-color: rgba(0,0,0,0.08);',
      '}',

      '[data-theme="light"] .oa-cost-current {',
      '  color: #1E1B2E;',
      '}',

      '[data-theme="light"] .oa-card__action {',
      '  color: #7C3AED;',
      '  background: rgba(124,58,237,0.06);',
      '  border-color: rgba(124,58,237,0.2);',
      '}',

      '[data-theme="light"] .oa-card__action:hover {',
      '  background: rgba(124,58,237,0.12);',
      '  border-color: rgba(124,58,237,0.35);',
      '}',

      /* ---- Responsive ---- */
      '@media (max-width: 600px) {',
      '  .oa-card { padding: 10px 10px; }',
      '  .oa-cost-line { flex-direction: column; align-items: flex-start; gap: 4px; }',
      '}',

    ].join('\n');

    document.head.appendChild(style);
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  return {
    init: init,
    analyze: analyze,
    getAdvice: getAdvice,
    isInited: isInited,
    update: update
  };

})();

// Expose globally
window.OptimizationAdvisor = OptimizationAdvisor;
