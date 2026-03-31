/**
 * Claude Context Window Visualizer — SVG Charts Module
 * Pure SVG charts: Pie, Radar, and Trend Line.
 * No dependencies — uses inline SVG with CSS theming.
 */

'use strict';

const Charts = (function () {
  let _inited = false;
  let _activeChart = 'pie';
  let _container = null;

  const CAT_COLORS = { system: '#8B5CF6', user: '#3B82F6', assistant: '#10B981', tools: '#F59E0B' };
  const CAT_LABELS = { system: 'System', user: 'User', assistant: 'Assistant', tools: 'Tools' };
  const CAT_ICONS = { system: '\u2699\uFE0F', user: '\uD83D\uDC64', assistant: '\uD83E\uDD16', tools: '\uD83D\uDD27' };
  const CATEGORIES = ['system', 'user', 'assistant', 'tools'];

  function init() {
    var toggle = document.getElementById('charts-toggle');
    var card = document.getElementById('charts-card');
    if (!toggle || !card) return;

    toggle.addEventListener('click', function () {
      var isOpen = card.classList.toggle('charts-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen && !_inited) {
        _inited = true;
        _container = document.getElementById('charts-container');
        _initTabs();
      }
    });
  }

  function _initTabs() {
    var tabs = document.querySelectorAll('.charts-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('charts-tab--active'); });
        tab.classList.add('charts-tab--active');
        _activeChart = tab.dataset.chart;
      });
    });
  }

  /**
   * Update charts with current state.
   */
  function update(tokens, contextWindow, timeline) {
    if (!_inited || !_container) return;

    switch (_activeChart) {
      case 'pie':
        renderPie(tokens, contextWindow);
        break;
      case 'radar':
        renderRadar(tokens, contextWindow);
        break;
      case 'trend':
        renderTrend(timeline);
        break;
    }
  }

  function isInited() { return _inited; }
  function getActiveChart() { return _activeChart; }

  // ---- Pie Chart ----
  function renderPie(tokens, contextWindow) {
    var total = CATEGORIES.reduce(function (s, c) { return s + (tokens[c] || 0); }, 0);
    var remaining = Math.max(0, contextWindow - total);
    var W = 260, H = 260, cx = 130, cy = 130, r = 100;

    var segments = [];
    CATEGORIES.forEach(function (cat) {
      if (tokens[cat] > 0) {
        segments.push({ id: cat, value: tokens[cat], color: CAT_COLORS[cat], label: CAT_LABELS[cat] });
      }
    });
    if (remaining > 0) {
      segments.push({ id: 'remaining', value: remaining, color: '#2D2A3E', label: 'Remaining' });
    }

    var grandTotal = total + remaining;
    if (grandTotal === 0) {
      _container.innerHTML = '<div class="charts-empty">Adjust sliders to see chart</div>';
      return;
    }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="charts-pie-svg">';

    // Draw segments
    var startAngle = -90; // Start from top
    segments.forEach(function (seg) {
      var angle = (seg.value / grandTotal) * 360;
      if (angle <= 0) return;

      var endAngle = startAngle + angle;
      var largeArc = angle > 180 ? 1 : 0;

      var x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
      var y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
      var x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
      var y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);

      if (angle >= 359.99) {
        // Full circle
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + seg.color + '" opacity="0.9">';
        svg += '<title>' + seg.label + ': ' + formatNumber(seg.value) + ' (' + ((seg.value / grandTotal) * 100).toFixed(1) + '%)</title>';
        svg += '</circle>';
      } else {
        svg += '<path d="M ' + cx + ' ' + cy + ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
          ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z"' +
          ' fill="' + seg.color + '" opacity="0.9" class="charts-pie-seg">';
        svg += '<title>' + seg.label + ': ' + formatNumber(seg.value) + ' (' + ((seg.value / grandTotal) * 100).toFixed(1) + '%)</title>';
        svg += '</path>';
      }

      startAngle = endAngle;
    });

    // Center hole (donut style)
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="55" fill="var(--bg-primary, #0A0914)"/>';

    // Center text
    var pct = contextWindow > 0 ? ((total / contextWindow) * 100).toFixed(1) : '0.0';
    svg += '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" fill="var(--text-primary, #E4E0F0)" font-size="22" font-weight="700">' + pct + '%</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" fill="var(--text-secondary, #8B87A0)" font-size="11">used</text>';

    svg += '</svg>';

    // Legend
    var legend = '<div class="charts-legend">';
    segments.forEach(function (seg) {
      var pctStr = ((seg.value / grandTotal) * 100).toFixed(1);
      legend += '<div class="charts-legend-item">' +
        '<span class="charts-legend-dot" style="background:' + seg.color + '"></span>' +
        '<span class="charts-legend-label">' + seg.label + '</span>' +
        '<span class="charts-legend-value">' + formatNumber(seg.value) + ' (' + pctStr + '%)</span>' +
        '</div>';
    });
    legend += '</div>';

    _container.innerHTML = '<div class="charts-pie-wrapper">' + svg + legend + '</div>';
  }

  // ---- Radar Chart ----
  function renderRadar(tokens, contextWindow) {
    var total = CATEGORIES.reduce(function (s, c) { return s + (tokens[c] || 0); }, 0);
    if (total === 0 || contextWindow === 0) {
      _container.innerHTML = '<div class="charts-empty">Adjust sliders to see radar chart</div>';
      return;
    }

    var axes = [
      { label: 'Utilization', value: Math.min((total / contextWindow) * 100, 100) },
      { label: 'Diversity', value: _calcDiversity(tokens) },
      { label: 'Efficiency', value: _calcEfficiency(tokens, contextWindow) },
      { label: 'Headroom', value: Math.max(0, ((contextWindow - total) / contextWindow) * 100) },
      { label: 'Balance', value: _calcBalance(tokens) },
    ];

    var W = 300, H = 300, cx = 150, cy = 150, maxR = 110;
    var n = axes.length;
    var angleStep = (2 * Math.PI) / n;

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="charts-radar-svg">';

    // Background rings (20%, 40%, 60%, 80%, 100%)
    [0.2, 0.4, 0.6, 0.8, 1.0].forEach(function (pct) {
      var r = maxR * pct;
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(1) + '" fill="none" stroke="var(--glass-border, #2D2A3E)" stroke-width="0.5" opacity="0.5"/>';
    });

    // Axis lines and labels
    axes.forEach(function (axis, i) {
      var angle = -Math.PI / 2 + i * angleStep;
      var x = cx + maxR * Math.cos(angle);
      var y = cy + maxR * Math.sin(angle);
      svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="var(--glass-border, #2D2A3E)" stroke-width="0.5" opacity="0.5"/>';

      // Label position (pushed out a bit)
      var lx = cx + (maxR + 20) * Math.cos(angle);
      var ly = cy + (maxR + 20) * Math.sin(angle);
      var anchor = lx < cx - 5 ? 'end' : lx > cx + 5 ? 'start' : 'middle';
      svg += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="' + anchor + '" fill="var(--text-secondary, #8B87A0)" font-size="10">' + axis.label + '</text>';
    });

    // Data polygon
    var points = axes.map(function (axis, i) {
      var angle = -Math.PI / 2 + i * angleStep;
      var r = maxR * (axis.value / 100);
      return (cx + r * Math.cos(angle)).toFixed(1) + ',' + (cy + r * Math.sin(angle)).toFixed(1);
    }).join(' ');

    svg += '<polygon points="' + points + '" fill="rgba(139, 92, 246, 0.15)" stroke="#A855F7" stroke-width="2" stroke-linejoin="round"/>';

    // Data points
    axes.forEach(function (axis, i) {
      var angle = -Math.PI / 2 + i * angleStep;
      var r = maxR * (axis.value / 100);
      var px = cx + r * Math.cos(angle);
      var py = cy + r * Math.sin(angle);
      svg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4" fill="#A855F7" stroke="#0A0914" stroke-width="1.5">';
      svg += '<title>' + axis.label + ': ' + axis.value.toFixed(0) + '%</title>';
      svg += '</circle>';
    });

    svg += '</svg>';

    // Score cards
    var cards = '<div class="charts-radar-scores">';
    axes.forEach(function (axis) {
      var color = axis.value >= 70 ? 'var(--accent-green)' : axis.value >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)';
      cards += '<div class="charts-radar-score">' +
        '<span class="charts-radar-score-value" style="color:' + color + '">' + axis.value.toFixed(0) + '</span>' +
        '<span class="charts-radar-score-label">' + axis.label + '</span>' +
        '</div>';
    });
    cards += '</div>';

    _container.innerHTML = '<div class="charts-radar-wrapper">' + svg + cards + '</div>';
  }

  function _calcDiversity(tokens) {
    var nonZero = CATEGORIES.filter(function (c) { return (tokens[c] || 0) > 0; }).length;
    return (nonZero / CATEGORIES.length) * 100;
  }

  function _calcEfficiency(tokens, contextWindow) {
    var total = CATEGORIES.reduce(function (s, c) { return s + (tokens[c] || 0); }, 0);
    var remainPct = ((contextWindow - total) / contextWindow) * 100;
    if (remainPct >= 10 && remainPct <= 30) return 95;
    if (remainPct > 30 && remainPct <= 50) return 70;
    if (remainPct > 50) return 40;
    if (remainPct >= 5 && remainPct < 10) return 60;
    return 25;
  }

  function _calcBalance(tokens) {
    var total = CATEGORIES.reduce(function (s, c) { return s + (tokens[c] || 0); }, 0);
    if (total === 0) return 0;
    var maxPct = Math.max.apply(null, CATEGORIES.map(function (c) { return (tokens[c] || 0) / total; }));
    return Math.round((1 - maxPct) * 100 * 1.5); // Scale up, cap at 100
  }

  // ---- Trend Line Chart ----
  function renderTrend(timeline) {
    if (!timeline || timeline.length < 2) {
      _container.innerHTML = '<div class="charts-empty">Need at least 2 timeline snapshots for trend chart</div>';
      return;
    }

    var W = 500, H = 220, padL = 50, padR = 20, padT = 20, padB = 35;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    // Find max for y-axis
    var maxVal = 0;
    timeline.forEach(function (snap) {
      var total = CATEGORIES.reduce(function (s, c) { return s + (snap.tokens[c] || 0); }, 0);
      if (total > maxVal) maxVal = total;
    });
    maxVal = maxVal || 1;

    // Nice y-axis rounding
    var yStep = Math.ceil(maxVal / 4);
    maxVal = yStep * 4;

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="charts-trend-svg" preserveAspectRatio="xMidYMid meet">';

    // Grid lines
    for (var g = 0; g <= 4; g++) {
      var gy = padT + plotH - (g / 4) * plotH;
      var label = formatTokensShort(Math.round((g / 4) * maxVal));
      svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '" stroke="var(--glass-border, #2D2A3E)" stroke-width="0.5" opacity="0.4"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" fill="var(--text-muted, #5B5775)" font-size="9">' + label + '</text>';
    }

    // X-axis labels
    var count = timeline.length;
    [0, Math.floor(count / 2), count - 1].forEach(function (i) {
      if (i >= count) return;
      var x = padL + (i / (count - 1)) * plotW;
      svg += '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" fill="var(--text-muted, #5B5775)" font-size="9">#' + (i + 1) + '</text>';
    });

    // Stacked area — draw from bottom category up
    var stackedBase = new Array(count).fill(0);
    var reverseCats = ['system', 'user', 'assistant', 'tools'];

    reverseCats.forEach(function (cat) {
      var newBase = [];
      var areaPath = 'M';

      // Top line (left to right)
      for (var i = 0; i < count; i++) {
        var val = stackedBase[i] + (timeline[i].tokens[cat] || 0);
        newBase.push(val);
        var x = padL + (i / Math.max(count - 1, 1)) * plotW;
        var y = padT + plotH - (val / maxVal) * plotH;
        areaPath += (i === 0 ? '' : ' L') + ' ' + x.toFixed(1) + ' ' + y.toFixed(1);
      }

      // Bottom line (right to left, following previous stack level)
      for (var j = count - 1; j >= 0; j--) {
        var x2 = padL + (j / Math.max(count - 1, 1)) * plotW;
        var y2 = padT + plotH - (stackedBase[j] / maxVal) * plotH;
        areaPath += ' L ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
      }

      areaPath += ' Z';
      svg += '<path d="' + areaPath + '" fill="' + CAT_COLORS[cat] + '" opacity="0.5"/>';

      stackedBase = newBase;
    });

    // Top outline (total)
    var linePath = '';
    for (var k = 0; k < count; k++) {
      var totalK = CATEGORIES.reduce(function (s, c) { return s + (timeline[k].tokens[c] || 0); }, 0);
      var lx = padL + (k / Math.max(count - 1, 1)) * plotW;
      var ly = padT + plotH - (totalK / maxVal) * plotH;
      linePath += (k === 0 ? 'M' : ' L') + ' ' + lx.toFixed(1) + ' ' + ly.toFixed(1);
    }
    svg += '<path d="' + linePath + '" fill="none" stroke="var(--text-primary, #E4E0F0)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';

    // Data points
    for (var p = 0; p < count; p++) {
      var totalP = CATEGORIES.reduce(function (s, c) { return s + (timeline[p].tokens[c] || 0); }, 0);
      var px = padL + (p / Math.max(count - 1, 1)) * plotW;
      var py = padT + plotH - (totalP / maxVal) * plotH;
      svg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3" fill="var(--accent-purple, #A855F7)" stroke="var(--bg-primary, #0A0914)" stroke-width="1.5">';
      svg += '<title>Snapshot #' + (p + 1) + ': ' + formatNumber(totalP) + ' tokens</title>';
      svg += '</circle>';
    }

    svg += '</svg>';

    // Legend
    var legend = '<div class="charts-legend charts-legend--horizontal">';
    CATEGORIES.forEach(function (cat) {
      legend += '<div class="charts-legend-item">' +
        '<span class="charts-legend-dot" style="background:' + CAT_COLORS[cat] + '"></span>' +
        '<span class="charts-legend-label">' + CAT_LABELS[cat] + '</span>' +
        '</div>';
    });
    legend += '</div>';

    _container.innerHTML = '<div class="charts-trend-wrapper">' + svg + legend + '</div>';
  }

  return {
    init: init,
    update: update,
    isInited: isInited,
    getActiveChart: getActiveChart
  };
})();
