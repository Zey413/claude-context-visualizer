/**
 * Claude Context Window Visualizer — All-Model Comparison Dashboard
 * Full-screen overlay showing every model side-by-side with proportional
 * context bars, cost comparison, and current token overlay.
 */

'use strict';

const Dashboard = (function () {
  let _visible = false;
  let _overlay = null;
  let _grid = null;
  let _built = false;

  /**
   * Toggle the dashboard overlay.
   */
  function toggle(state) {
    if (!_built) build();
    _visible = !_visible;
    _overlay.classList.toggle('dashboard--visible', _visible);
    document.body.classList.toggle('dashboard-open', _visible);
    if (_visible) update(state);
  }

  function isVisible() { return _visible; }

  /**
   * Build the overlay DOM (once, then reused).
   */
  function build() {
    _overlay = document.createElement('div');
    _overlay.className = 'dashboard';
    _overlay.id = 'dashboard-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-label', 'All-model comparison dashboard');

    // Header
    var header = document.createElement('div');
    header.className = 'dashboard__header';
    header.innerHTML =
      '<h2 class="dashboard__title">\uD83D\uDCCA All-Model Comparison</h2>' +
      '<button class="dashboard__close-btn" id="dashboard-close" aria-label="Close dashboard">&times;</button>';
    _overlay.appendChild(header);

    // Grid
    _grid = document.createElement('div');
    _grid.className = 'dashboard__grid';
    _overlay.appendChild(_grid);

    // Cost summary
    var summary = document.createElement('div');
    summary.className = 'dashboard__summary';
    summary.id = 'dashboard-summary';
    _overlay.appendChild(summary);

    document.body.appendChild(_overlay);

    // Close handler
    document.getElementById('dashboard-close').addEventListener('click', function () {
      _visible = false;
      _overlay.classList.remove('dashboard--visible');
      document.body.classList.remove('dashboard-open');
    });

    // Click outside to close
    _overlay.addEventListener('click', function (e) {
      if (e.target === _overlay) {
        _visible = false;
        _overlay.classList.remove('dashboard--visible');
        document.body.classList.remove('dashboard-open');
      }
    });

    _built = true;
  }

  /**
   * Update the dashboard content with current token state.
   */
  function update(state) {
    if (!_grid) return;
    _grid.innerHTML = '';

    var tokens = state.tokens;
    var categories = ['system', 'user', 'assistant', 'tools'];
    var catColors = { system: '#8B5CF6', user: '#3B82F6', assistant: '#10B981', tools: '#F59E0B' };
    var catIcons = { system: '\u2699\uFE0F', user: '\uD83D\uDC64', assistant: '\uD83E\uDD16', tools: '\uD83D\uDD27' };
    var totalTokens = categories.reduce(function (s, c) { return s + (tokens[c] || 0); }, 0);

    // Find max context window for proportional scaling
    var maxContext = 0;
    CLAUDE_MODELS.forEach(function (m) {
      if (m.contextWindow > maxContext) maxContext = m.contextWindow;
    });

    var cheapest = { cost: Infinity, index: -1 };
    var costData = [];

    CLAUDE_MODELS.forEach(function (model, idx) {
      // Calculate cost for this model
      var inputTok = (tokens.system || 0) + (tokens.user || 0) + (tokens.tools || 0);
      var outputTok = tokens.assistant || 0;
      var cost = (inputTok / 1e6) * model.pricing.inputPerMTok + (outputTok / 1e6) * model.pricing.outputPerMTok;
      costData.push({ index: idx, cost: cost });
      if (cost < cheapest.cost) {
        cheapest = { cost: cost, index: idx };
      }

      // Card
      var card = document.createElement('div');
      card.className = 'dashboard__card glass-card';
      if (idx === state.modelIndex) card.classList.add('dashboard__card--active');

      // Tier badge
      var tierLabel = model.tier ? model.tier.charAt(0).toUpperCase() + model.tier.slice(1) : '';
      var tierClass = 'dashboard__tier dashboard__tier--' + (model.tier || 'balanced');

      // Header row: name + context size
      var headerHTML =
        '<div class="dashboard__card-header">' +
          '<div class="dashboard__card-name">' +
            '<span class="dashboard__card-dot" style="background:' + model.color + '"></span>' +
            model.name +
            (idx === state.modelIndex ? ' <span class="dashboard__active-badge">Active</span>' : '') +
          '</div>' +
          '<span class="' + tierClass + '">' + tierLabel + '</span>' +
        '</div>';

      // Context bar (proportional to max)
      var barWidthPct = (model.contextWindow / maxContext) * 100;
      var usedPct = model.contextWindow > 0 ? Math.min((totalTokens / model.contextWindow) * 100, 100) : 0;
      var fitsAll = totalTokens <= model.contextWindow;

      // Stacked usage segments within the bar
      var segHTML = '';
      var cumPct = 0;
      categories.forEach(function (cat) {
        var catPct = model.contextWindow > 0 ? ((tokens[cat] || 0) / model.contextWindow) * 100 : 0;
        catPct = Math.min(catPct, 100 - cumPct);
        if (catPct > 0) {
          segHTML += '<div class="dashboard__bar-seg" style="width:' + catPct.toFixed(2) +
            '%;background:' + catColors[cat] + '" title="' + cat + ': ' + formatNumber(tokens[cat] || 0) + '"></div>';
        }
        cumPct += catPct;
      });

      var barHTML =
        '<div class="dashboard__bar-wrapper">' +
          '<div class="dashboard__bar-label">' +
            '<span>' + formatTokensShort(model.contextWindow) + ' context</span>' +
            '<span class="dashboard__bar-used ' + (fitsAll ? '' : 'dashboard__bar-used--overflow') + '">' +
              usedPct.toFixed(1) + '% used' +
            '</span>' +
          '</div>' +
          '<div class="dashboard__bar-track" style="width:' + barWidthPct.toFixed(1) + '%">' +
            '<div class="dashboard__bar-fill">' + segHTML + '</div>' +
          '</div>' +
        '</div>';

      // Stats row
      var statsHTML =
        '<div class="dashboard__card-stats">' +
          '<div class="dashboard__stat">' +
            '<span class="dashboard__stat-label">Output</span>' +
            '<span class="dashboard__stat-value">' + formatTokensShort(model.outputLimit) + '</span>' +
          '</div>' +
          '<div class="dashboard__stat">' +
            '<span class="dashboard__stat-label">Input</span>' +
            '<span class="dashboard__stat-value">$' + model.pricing.inputPerMTok + '/MTok</span>' +
          '</div>' +
          '<div class="dashboard__stat">' +
            '<span class="dashboard__stat-label">Output</span>' +
            '<span class="dashboard__stat-value">$' + model.pricing.outputPerMTok + '/MTok</span>' +
          '</div>' +
          '<div class="dashboard__stat">' +
            '<span class="dashboard__stat-label">Est. Cost</span>' +
            '<span class="dashboard__stat-value dashboard__stat-value--cost">$' + cost.toFixed(4) + '</span>' +
          '</div>' +
        '</div>';

      card.innerHTML = headerHTML + barHTML + statsHTML;
      _grid.appendChild(card);
    });

    // Summary
    var summaryEl = document.getElementById('dashboard-summary');
    if (summaryEl && totalTokens > 0) {
      var cheapestModel = CLAUDE_MODELS[cheapest.index];
      var fitsModels = CLAUDE_MODELS.filter(function (m) { return totalTokens <= m.contextWindow; });
      summaryEl.innerHTML =
        '<div class="dashboard__summary-row">' +
          '<span>\uD83D\uDCE6 Current usage: <strong>' + formatNumber(totalTokens) + ' tokens</strong></span>' +
          '<span>\u2705 Fits in: <strong>' + fitsModels.length + '/' + CLAUDE_MODELS.length + ' models</strong></span>' +
          '<span>\uD83D\uDCB0 Best value: <strong>' + cheapestModel.name + '</strong> ($' + cheapest.cost.toFixed(4) + ')</span>' +
        '</div>';
    } else if (summaryEl) {
      summaryEl.innerHTML =
        '<div class="dashboard__summary-row">' +
          '<span>Adjust sliders to see cost comparison across all models</span>' +
        '</div>';
    }
  }

  return {
    toggle: toggle,
    update: update,
    isVisible: isVisible
  };
})();
