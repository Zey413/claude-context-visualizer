/**
 * Claude Context Window Visualizer — Context Efficiency Score v4.0
 * Gamified scoring system: 0-100 score + letter grade (S/A/B/C/D/F)
 * based on 5 factors. Animated ring, factor breakdown bars, tips.
 *
 * API: window.ContextScore = { init, update, isInited }
 */

'use strict';

var ContextScore = (function () {

  // ---- Constants ----
  var CATEGORIES = ['system', 'user', 'assistant', 'tools'];
  var RING_RADIUS = 80;
  var RING_STROKE = 10;
  var RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  var GRADE_MAP = [
    { min: 95, grade: 'S', cls: 's' },
    { min: 80, grade: 'A', cls: 'a' },
    { min: 65, grade: 'B', cls: 'b' },
    { min: 50, grade: 'C', cls: 'c' },
    { min: 35, grade: 'D', cls: 'd' },
    { min: 0,  grade: 'F', cls: 'f' }
  ];

  var FACTORS = [
    { id: 'outputInput',   label: 'Output/Input Ratio',     weight: 0.20 },
    { id: 'systemEff',     label: 'System Prompt Efficiency', weight: 0.20 },
    { id: 'toolOverhead',  label: 'Tool Overhead',           weight: 0.20 },
    { id: 'contextUtil',   label: 'Context Utilization',     weight: 0.20 },
    { id: 'costEff',       label: 'Cost Efficiency',         weight: 0.20 }
  ];

  // ---- State ----
  var _inited = false;
  var _containerId = '';
  var _animatedScore = 0;
  var _targetScore = 0;
  var _animRAF = null;
  var _prevGrade = '';
  var _els = {};

  // ---- DOM Helpers ----
  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text) d.textContent = text;
    return d;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (var k in attrs) {
        if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  // ---- Score Calculation ----

  function calcOutputInputScore(tokens) {
    var input = (tokens.user || 0) + (tokens.tools || 0);
    var output = tokens.assistant || 0;
    if (input === 0 && output === 0) return 50;
    if (input === 0) return 100;
    var ratio = output / input;
    if (ratio >= 1.5 && ratio <= 3.0) return 100;
    if (ratio < 1.5) return Math.max(0, Math.round(100 - (1.5 - ratio) * 60));
    return Math.max(0, Math.round(100 - (ratio - 3.0) * 20));
  }

  function calcSystemEffScore(tokens, contextWindow) {
    var sys = tokens.system || 0;
    if (contextWindow === 0) return 50;
    var pct = (sys / contextWindow) * 100;
    if (pct <= 2) return 100;
    if (pct >= 15) return 0;
    return Math.round(100 * (1 - (pct - 2) / 13));
  }

  function calcToolOverheadScore(tokens) {
    var total = CATEGORIES.reduce(function (s, c) { return s + (tokens[c] || 0); }, 0);
    if (total === 0) return 50;
    var toolPct = ((tokens.tools || 0) / total) * 100;
    if (toolPct <= 10) return 100;
    if (toolPct >= 50) return 0;
    return Math.round(100 * (1 - (toolPct - 10) / 40));
  }

  function calcContextUtilScore(tokens, contextWindow) {
    var total = CATEGORIES.reduce(function (s, c) { return s + (tokens[c] || 0); }, 0);
    if (contextWindow === 0) return 50;
    var pct = (total / contextWindow) * 100;
    if (pct >= 40 && pct <= 80) {
      var dist = Math.abs(pct - 60) / 20;
      return Math.round(100 * (1 - dist * 0.3));
    }
    if (pct < 40) return Math.max(0, Math.round(pct * 2.5));
    return Math.max(0, Math.round(100 - (pct - 80) * 4));
  }

  function calcCostEffScore(tokens, modelIndex) {
    var model = (typeof CLAUDE_MODELS !== 'undefined' && CLAUDE_MODELS[modelIndex])
      ? CLAUDE_MODELS[modelIndex] : null;
    if (!model || !model.pricing) return 50;
    var inputTok = (tokens.system || 0) + (tokens.user || 0) + (tokens.tools || 0);
    var outputTok = tokens.assistant || 0;
    var total = inputTok + outputTok;
    if (total === 0) return 50;
    var cost = (inputTok / 1e6) * model.pricing.inputPerMTok +
               (outputTok / 1e6) * model.pricing.outputPerMTok;
    var costPerKTok = (cost / total) * 1000;
    return Math.round(Math.max(0, Math.min(100, (1 - costPerKTok / 0.075) * 100)));
  }

  function calculateScores(tokens, modelIndex, contextWindow) {
    var scores = {
      outputInput: calcOutputInputScore(tokens),
      systemEff: calcSystemEffScore(tokens, contextWindow),
      toolOverhead: calcToolOverheadScore(tokens),
      contextUtil: calcContextUtilScore(tokens, contextWindow),
      costEff: calcCostEffScore(tokens, modelIndex)
    };
    var total = 0;
    for (var i = 0; i < FACTORS.length; i++) {
      total += scores[FACTORS[i].id] * FACTORS[i].weight;
    }
    scores.total = Math.round(Math.max(0, Math.min(100, total)));
    return scores;
  }

  function getGrade(score) {
    for (var i = 0; i < GRADE_MAP.length; i++) {
      if (score >= GRADE_MAP[i].min) return GRADE_MAP[i];
    }
    return GRADE_MAP[GRADE_MAP.length - 1];
  }

  function getScoreColor(score) {
    if (score >= 80) return '#10B981';
    if (score >= 65) return '#84CC16';
    if (score >= 50) return '#F59E0B';
    if (score >= 35) return '#F97316';
    return '#EF4444';
  }

  // ---- Tips ----

  function generateTips(scores, tokens, contextWindow) {
    var tips = [];
    var cats = FACTORS.slice().sort(function (a, b) { return scores[a.id] - scores[b.id]; });
    for (var i = 0; i < Math.min(3, cats.length); i++) {
      var f = cats[i];
      var s = scores[f.id];
      if (s >= 80) continue;
      var gain = Math.round((100 - s) * f.weight);
      var tip = { icon: '', text: '', gain: gain };
      switch (f.id) {
        case 'outputInput':
          tip.icon = '\uD83D\uDCAC'; tip.text = s < 50
            ? 'Output/input ratio is low. Encourage longer, detailed responses.'
            : 'Optimize prompts for a 1.5-3.0x output/input ratio.'; break;
        case 'systemEff':
          var sysPct = contextWindow > 0 ? ((tokens.system || 0) / contextWindow * 100).toFixed(1) : 0;
          tip.icon = '\u2699\uFE0F'; tip.text = 'System prompt uses ' + sysPct + '% of context. Condense to < 5%.'; break;
        case 'toolOverhead':
          tip.icon = '\uD83D\uDD27'; tip.text = 'High tool overhead. Batch tool calls or reduce schema verbosity.'; break;
        case 'contextUtil':
          var tot = CATEGORIES.reduce(function (sum, c) { return sum + (tokens[c] || 0); }, 0);
          var pct = contextWindow > 0 ? (tot / contextWindow * 100).toFixed(0) : 0;
          tip.icon = '\uD83D\uDCCA'; tip.text = pct < 40
            ? 'Only ' + pct + '% used. Sweet spot is 40-80%.'
            : 'At ' + pct + '% \u2014 consider compacting to stay efficient.'; break;
        case 'costEff':
          tip.icon = '\uD83D\uDCB0'; tip.text = 'Try a more cost-effective model or enable prompt caching.'; break;
      }
      if (tip.text) tips.push(tip);
    }
    return tips;
  }

  // ---- Build DOM ----

  function buildDOM() {
    var container = document.getElementById(_containerId);
    if (!container) return false;

    var wrap = el('div', 'context-score-wrap');

    // Score ring
    var ringArea = el('div', 'context-score__ring-area');
    ringArea.setAttribute('role', 'meter');
    ringArea.setAttribute('aria-valuemin', '0');
    ringArea.setAttribute('aria-valuemax', '100');
    ringArea.setAttribute('aria-valuenow', '0');
    ringArea.setAttribute('aria-label', 'Context efficiency score');

    var svg = svgEl('svg', { width: '200', height: '200', viewBox: '0 0 200 200', 'class': 'context-score__ring-svg' });
    svg.appendChild(svgEl('circle', { cx: '100', cy: '100', r: String(RING_RADIUS), 'class': 'context-score__ring-bg' }));
    var ringFill = svgEl('circle', {
      cx: '100', cy: '100', r: String(RING_RADIUS),
      'class': 'context-score__ring-fill',
      'stroke-dasharray': '0 ' + RING_CIRCUMFERENCE,
      stroke: '#10B981'
    });
    svg.appendChild(ringFill);
    _els.ringFill = ringFill;
    ringArea.appendChild(svg);

    var center = el('div', 'context-score__center');
    var scoreNum = el('div', 'context-score__number', '0');
    _els.scoreNum = scoreNum;
    var gradeEl = el('div', 'context-score__grade', '--');
    _els.gradeEl = gradeEl;
    center.appendChild(scoreNum);
    center.appendChild(gradeEl);
    ringArea.appendChild(center);
    wrap.appendChild(ringArea);

    // Factor bars
    var factorsWrap = el('div', 'context-score__factors');
    _els.factorBars = {};
    _els.factorValues = {};
    for (var i = 0; i < FACTORS.length; i++) {
      var f = FACTORS[i];
      var row = el('div', 'context-score__factor');
      row.appendChild(el('span', 'context-score__factor-label', f.label));
      var barWrap = el('div', 'context-score__factor-bar-wrap');
      barWrap.setAttribute('role', 'meter');
      barWrap.setAttribute('aria-valuemin', '0');
      barWrap.setAttribute('aria-valuemax', '100');
      barWrap.setAttribute('aria-valuenow', '0');
      barWrap.setAttribute('aria-label', f.label + ' score');
      var bar = el('div', 'context-score__factor-bar');
      bar.style.width = '0%';
      barWrap.appendChild(bar);
      row.appendChild(barWrap);
      var val = el('span', 'context-score__factor-value', '0');
      row.appendChild(val);
      factorsWrap.appendChild(row);
      _els.factorBars[f.id] = bar;
      _els.factorValues[f.id] = val;
    }
    wrap.appendChild(factorsWrap);

    // Tips
    var tipsWrap = el('div', 'context-score__tips');
    _els.tipsWrap = tipsWrap;
    wrap.appendChild(tipsWrap);

    container.appendChild(wrap);
    return true;
  }

  // ---- Animation ----

  function animateScore() {
    var diff = _targetScore - _animatedScore;
    if (Math.abs(diff) < 0.5) {
      _animatedScore = _targetScore;
      renderScoreDisplay(_targetScore);
      _animRAF = null;
      return;
    }
    _animatedScore += diff * 0.12;
    renderScoreDisplay(Math.round(_animatedScore));
    _animRAF = requestAnimationFrame(animateScore);
  }

  function renderScoreDisplay(score) {
    if (!_els.scoreNum) return;
    _els.scoreNum.textContent = String(score);
    var dashLen = (score / 100) * RING_CIRCUMFERENCE;
    _els.ringFill.setAttribute('stroke-dasharray', dashLen + ' ' + (RING_CIRCUMFERENCE - dashLen));
    _els.ringFill.setAttribute('stroke', getScoreColor(score));
    var ringArea = _els.scoreNum.closest('.context-score__ring-area');
    if (ringArea) ringArea.setAttribute('aria-valuenow', String(score));
    var g = getGrade(score);
    _els.gradeEl.textContent = g.grade;
    _els.gradeEl.className = 'context-score__grade context-score__grade--' + g.cls;
    if (g.grade !== _prevGrade && _prevGrade !== '') {
      _els.gradeEl.classList.add('context-score__grade--pop');
      setTimeout(function () {
        if (_els.gradeEl) _els.gradeEl.classList.remove('context-score__grade--pop');
      }, 500);
    }
    _prevGrade = g.grade;
  }

  // ---- Update ----

  function update(tokens, modelIndex, contextWindow) {
    if (!_inited) return;
    var scores = calculateScores(tokens, modelIndex, contextWindow);

    for (var i = 0; i < FACTORS.length; i++) {
      var f = FACTORS[i];
      var s = scores[f.id];
      var color = getScoreColor(s);
      if (_els.factorBars[f.id]) {
        _els.factorBars[f.id].style.width = s + '%';
        _els.factorBars[f.id].style.background = color;
      }
      if (_els.factorValues[f.id]) {
        _els.factorValues[f.id].textContent = String(s);
        _els.factorValues[f.id].style.color = color;
      }
    }

    // Tips
    var tips = generateTips(scores, tokens, contextWindow);
    if (_els.tipsWrap) {
      _els.tipsWrap.innerHTML = '';
      if (tips.length === 0) {
        var goodTip = el('div', 'context-score__tip');
        goodTip.innerHTML = '<span class="context-score__tip-icon">\u2705</span><span>Great job! Your context usage is well-optimized.</span>';
        _els.tipsWrap.appendChild(goodTip);
      } else {
        for (var j = 0; j < tips.length; j++) {
          var tipEl = el('div', 'context-score__tip');
          tipEl.setAttribute('role', 'status');
          tipEl.innerHTML = '<span class="context-score__tip-icon">' + tips[j].icon + '</span><span>' + tips[j].text + (tips[j].gain > 0 ? ' <strong>(+' + tips[j].gain + ' pts)</strong>' : '') + '</span>';
          _els.tipsWrap.appendChild(tipEl);
        }
      }
    }

    _targetScore = scores.total;
    if (!_animRAF) {
      _animRAF = requestAnimationFrame(animateScore);
    }
  }

  // ---- Init ----

  function init(containerId) {
    if (_inited) return;
    _containerId = containerId;
    if (!buildDOM()) return;
    _inited = true;
  }

  return {
    init: init,
    update: update,
    isInited: function () { return _inited; }
  };
})();
