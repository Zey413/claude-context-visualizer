/**
 * Claude Context Window Visualizer — Cost Forecast & Budget Tracker
 * Projects daily/monthly costs, compares across models, tracks budget.
 */

'use strict';

var CostForecast = (function () {
  var _inited = false;
  var _container = null;
  var _dailyRequests = 100;
  var _monthlyBudget = 50;

  function init() {
    var toggle = document.getElementById('forecast-toggle');
    var card = document.getElementById('forecast-card');
    if (!toggle || !card) return;

    toggle.addEventListener('click', function () {
      var isOpen = card.classList.toggle('forecast-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen && !_inited) {
        _inited = true;
        _container = document.getElementById('forecast-container');
        _build();
      }
    });
  }

  function isInited() { return _inited; }

  function _build() {
    if (!_container) return;

    _container.innerHTML =
      '<div class="forecast-input-row">' +
        '<label for="forecast-daily-input">Daily Requests:</label>' +
        '<input type="number" id="forecast-daily-input" value="' + _dailyRequests + '" min="1" max="100000">' +
        '<label for="forecast-budget-input">Monthly Budget ($):</label>' +
        '<input type="number" id="forecast-budget-input" value="' + _monthlyBudget + '" min="1" max="100000" step="10">' +
      '</div>' +
      '<div class="forecast-projections" id="forecast-projections"></div>' +
      '<h4 style="font-size:0.85rem;color:var(--text-secondary);margin:0.5rem 0 0.3rem">' +
        '📊 Monthly Cost by Model</h4>' +
      '<div class="forecast-model-bars" id="forecast-model-bars"></div>' +
      '<div class="forecast-budget" id="forecast-budget-bar"></div>' +
      '<div class="forecast-recommendation" id="forecast-rec"></div>';

    var dailyInput = document.getElementById('forecast-daily-input');
    var budgetInput = document.getElementById('forecast-budget-input');

    dailyInput.addEventListener('input', function () {
      _dailyRequests = Math.max(1, parseInt(dailyInput.value) || 1);
    });

    budgetInput.addEventListener('input', function () {
      _monthlyBudget = Math.max(1, parseInt(budgetInput.value) || 1);
    });
  }

  function update(tokens, modelIndex) {
    if (!_inited || !_container) return;

    var model = CLAUDE_MODELS[modelIndex];
    var categories = ['system', 'user', 'assistant', 'tools'];
    var inputTokens = (tokens.system || 0) + (tokens.user || 0) + (tokens.tools || 0);
    var outputTokens = tokens.assistant || 0;

    var costPerReq = (inputTokens / 1e6) * model.pricing.inputPerMTok +
                     (outputTokens / 1e6) * model.pricing.outputPerMTok;
    var daily = costPerReq * _dailyRequests;
    var weekly = daily * 7;
    var monthly = daily * 30;
    var yearly = daily * 365;

    // Projections
    var projEl = document.getElementById('forecast-projections');
    if (projEl) {
      projEl.innerHTML =
        _projCard('Per Request', costPerReq) +
        _projCard('Daily', daily) +
        _projCard('Weekly', weekly) +
        _projCard('Monthly', monthly) +
        _projCard('Yearly', yearly);
    }

    // Model comparison bars
    var barsEl = document.getElementById('forecast-model-bars');
    if (barsEl) {
      var modelCosts = CLAUDE_MODELS.map(function (m) {
        var c = (inputTokens / 1e6) * m.pricing.inputPerMTok +
                (outputTokens / 1e6) * m.pricing.outputPerMTok;
        return { name: m.name, cost: c * _dailyRequests * 30, color: m.color, id: m.id };
      });

      var maxCost = 0;
      var cheapestIdx = 0;
      modelCosts.forEach(function (mc, i) {
        if (mc.cost > maxCost) maxCost = mc.cost;
        if (mc.cost < modelCosts[cheapestIdx].cost) cheapestIdx = i;
      });

      barsEl.innerHTML = modelCosts.map(function (mc, i) {
        var pct = maxCost > 0 ? (mc.cost / maxCost) * 100 : 0;
        var isActive = i === modelIndex;
        var isCheapest = i === cheapestIdx;
        var nameStyle = isActive ? 'color:var(--accent-purple);font-weight:600' : '';
        var badge = isCheapest ? ' ✅' : '';
        return '<div class="forecast-model-bar">' +
          '<span class="forecast-model-bar__name" style="' + nameStyle + '">' +
            mc.name + badge +
          '</span>' +
          '<div class="forecast-model-bar__track">' +
            '<div class="forecast-model-bar__fill" style="width:' + pct.toFixed(1) + '%;background:' + mc.color + '"></div>' +
          '</div>' +
          '<span class="forecast-model-bar__cost">$' + mc.cost.toFixed(2) + '</span>' +
        '</div>';
      }).join('');

      // Recommendation
      var recEl = document.getElementById('forecast-rec');
      if (recEl && maxCost > 0) {
        var cheapest = modelCosts[cheapestIdx];
        var savingsPct = maxCost > 0 ? Math.round((1 - cheapest.cost / maxCost) * 100) : 0;
        recEl.innerHTML = '💡 <strong>' + cheapest.name + '</strong> is the best value at <strong>$' +
          cheapest.cost.toFixed(2) + '/mo</strong>' +
          (savingsPct > 0 ? ' (' + savingsPct + '% cheaper than most expensive)' : '');
      }
    }

    // Budget bar
    var budgetEl = document.getElementById('forecast-budget-bar');
    if (budgetEl) {
      var budgetPct = _monthlyBudget > 0 ? Math.min((monthly / _monthlyBudget) * 100, 100) : 0;
      var barColor = budgetPct < 70 ? 'var(--accent-green)' :
                     budgetPct < 90 ? 'var(--accent-amber)' : 'var(--accent-red)';
      var statusText = budgetPct < 70 ? 'Within budget' :
                       budgetPct < 90 ? 'Approaching limit' : 'Over budget!';

      budgetEl.innerHTML =
        '<span class="forecast-budget__text">💰 Budget:</span>' +
        '<div class="forecast-budget__bar">' +
          '<div class="forecast-budget__fill" style="width:' + budgetPct.toFixed(1) + '%;background:' + barColor + '"></div>' +
        '</div>' +
        '<span class="forecast-budget__text">' +
          '$' + monthly.toFixed(2) + ' / $' + _monthlyBudget + ' (' + statusText + ')' +
        '</span>';
    }
  }

  function _projCard(label, value) {
    var formatted = value < 0.01 ? '<$0.01' : '$' + value.toFixed(2);
    return '<div class="forecast-proj-card">' +
      '<div class="forecast-proj-card__label">' + label + '</div>' +
      '<div class="forecast-proj-card__value">' + formatted + '</div>' +
    '</div>';
  }

  return {
    init: init,
    update: update,
    isInited: isInited
  };
})();
