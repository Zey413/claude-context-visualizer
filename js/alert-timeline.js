/**
 * Claude Context Window Visualizer — Alert Timeline
 * Stacked area SVG timeline with smart alert system, replay controls,
 * and summary statistics for context window usage over conversation turns.
 *
 * API: window.AlertTimeline = { init, addDataPoint, startReplay, pauseReplay,
 *       setSpeed, getStats, clearHistory }
 */

'use strict';

var AlertTimeline = (function () {

  // ---- Constants ----

  var CATEGORIES = ['system', 'user', 'assistant', 'tools'];
  var CAT_COLORS = { system: '#8B5CF6', user: '#3B82F6', assistant: '#10B981', tools: '#F59E0B' };
  var CAT_LABELS = { system: 'System', user: 'User', assistant: 'Assistant', tools: 'Tools' };

  // Alert threshold definitions: level -> { percent, color, label }
  var THRESHOLDS = [
    { percent: 80, color: '#EAB308', label: 'Warning' },
    { percent: 90, color: '#F97316', label: 'Danger' },
    { percent: 95, color: '#EF4444', label: 'Critical' }
  ];

  // SVG layout
  var SVG_PADDING = { top: 20, right: 20, bottom: 40, left: 60 };
  var SVG_ASPECT_W = 800;
  var SVG_ASPECT_H = 360;

  // Replay speed options
  var SPEEDS = [0.5, 1, 2, 4];

  // Toast auto-dismiss duration (ms)
  var TOAST_DURATION = 5000;

  // ---- State ----

  var _inited = false;
  var _container = null;

  // Data: array of { turn, tokens: { system, user, assistant, tools }, total, contextWindow }
  var _history = [];
  var _contextWindow = 200000; // default, updated on addDataPoint

  // Replay state
  var _replay = {
    playing: false,
    speed: 1,
    currentFrame: 0,
    rafId: null,
    lastTimestamp: 0
  };

  // DOM references (populated during init)
  var _els = {};

  // Toast state
  var _activeToasts = [];
  var _toastContainer = null;
  var _lastAlertLevel = -1; // track to avoid duplicate toasts for same level

  // Dragging state for progress bar
  var _dragging = false;

  // ---- Utility: create SVG element in SVG namespace ----

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var key in attrs) {
        if (attrs.hasOwnProperty(key)) {
          el.setAttribute(key, attrs[key]);
        }
      }
    }
    return el;
  }

  // ---- Utility: create HTML element with optional class ----

  function htmlEl(tag, className, textContent) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== undefined) el.textContent = textContent;
    return el;
  }

  // ---- Utility: detect current theme ----

  function isLightTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function themeColor(darkVal, lightVal) {
    return isLightTheme() ? lightVal : darkVal;
  }

  // ---- Init: build the entire UI inside the container ----

  function init(containerId) {
    if (_inited) return;

    var target = document.getElementById(containerId);
    if (!target) {
      console.warn('AlertTimeline: container #' + containerId + ' not found');
      return;
    }

    _container = target;
    _container.classList.add('at-root');

    // Build wrapper structure
    _container.innerHTML = '';

    // -- Stats cards row --
    var statsRow = htmlEl('div', 'at-stats-row');
    _els.statTotal = _buildStatCard('Total Used', '0', 'tokens');
    _els.statAvg = _buildStatCard('Avg per Turn', '0', 'tokens/turn');
    _els.statPeak = _buildStatCard('Peak Usage', '0%', '');
    _els.statRemaining = _buildStatCard('Est. Turns Left', '--', 'turns');
    statsRow.appendChild(_els.statTotal.card);
    statsRow.appendChild(_els.statAvg.card);
    statsRow.appendChild(_els.statPeak.card);
    statsRow.appendChild(_els.statRemaining.card);
    _container.appendChild(statsRow);

    // -- SVG timeline area --
    var svgWrap = htmlEl('div', 'at-svg-wrap');
    _els.svg = svgEl('svg', {
      'viewBox': '0 0 ' + SVG_ASPECT_W + ' ' + SVG_ASPECT_H,
      'preserveAspectRatio': 'xMidYMid meet',
      'class': 'at-svg'
    });
    svgWrap.appendChild(_els.svg);

    // Tooltip for hover/drag
    _els.tooltip = htmlEl('div', 'at-tooltip');
    _els.tooltip.style.display = 'none';
    svgWrap.appendChild(_els.tooltip);

    _container.appendChild(svgWrap);

    // -- Replay controls --
    var controls = htmlEl('div', 'at-controls');

    // Play/Pause button
    _els.playBtn = htmlEl('button', 'at-btn at-btn--play');
    _els.playBtn.setAttribute('aria-label', 'Play replay');
    _els.playBtn.innerHTML = _playIcon();
    _els.playBtn.addEventListener('click', _togglePlay);
    controls.appendChild(_els.playBtn);

    // Speed selector
    var speedGroup = htmlEl('div', 'at-speed-group');
    var speedLabel = htmlEl('span', 'at-speed-label', 'Speed:');
    speedGroup.appendChild(speedLabel);
    _els.speedBtns = [];
    SPEEDS.forEach(function (s) {
      var btn = htmlEl('button', 'at-btn at-btn--speed', s + 'x');
      btn.setAttribute('aria-label', 'Set speed to ' + s + 'x');
      if (s === 1) btn.classList.add('at-btn--speed-active');
      btn.addEventListener('click', function () { setSpeed(s); });
      speedGroup.appendChild(btn);
      _els.speedBtns.push({ speed: s, el: btn });
    });
    controls.appendChild(speedGroup);

    // Turn counter
    _els.turnCounter = htmlEl('span', 'at-turn-counter', 'Turn 0 / 0');
    controls.appendChild(_els.turnCounter);

    _container.appendChild(controls);

    // -- Progress bar --
    var progressWrap = htmlEl('div', 'at-progress-wrap');
    _els.progressTrack = htmlEl('div', 'at-progress-track');
    _els.progressFill = htmlEl('div', 'at-progress-fill');
    _els.progressThumb = htmlEl('div', 'at-progress-thumb');
    _els.progressTrack.appendChild(_els.progressFill);
    _els.progressTrack.appendChild(_els.progressThumb);
    progressWrap.appendChild(_els.progressTrack);
    _container.appendChild(progressWrap);

    // Progress bar drag interaction
    _initProgressDrag();

    // -- Legend --
    var legend = htmlEl('div', 'at-legend');
    CATEGORIES.forEach(function (cat) {
      var item = htmlEl('div', 'at-legend-item');
      var dot = htmlEl('span', 'at-legend-dot');
      dot.style.background = CAT_COLORS[cat];
      var label = htmlEl('span', 'at-legend-label', CAT_LABELS[cat]);
      item.appendChild(dot);
      item.appendChild(label);
      legend.appendChild(item);
    });
    _container.appendChild(legend);

    // -- Toast container (fixed, outside main flow) --
    _toastContainer = document.getElementById('at-toast-container');
    if (!_toastContainer) {
      _toastContainer = htmlEl('div', 'at-toast-container');
      _toastContainer.id = 'at-toast-container';
      document.body.appendChild(_toastContainer);
    }

    // -- Inject scoped styles --
    _injectStyles();

    // SVG hover interaction for data point inspection
    _els.svg.addEventListener('mousemove', _onSvgHover);
    _els.svg.addEventListener('mouseleave', _onSvgLeave);

    // Initial empty render
    _renderSvg(_history.length);

    _inited = true;
  }

  // ---- Build a single stat card ----

  function _buildStatCard(title, value, unit) {
    var card = htmlEl('div', 'at-stat-card');
    var titleEl = htmlEl('div', 'at-stat-title', title);
    var valueEl = htmlEl('div', 'at-stat-value', value);
    var unitEl = htmlEl('div', 'at-stat-unit', unit);
    card.appendChild(titleEl);
    card.appendChild(valueEl);
    card.appendChild(unitEl);
    return { card: card, value: valueEl, unit: unitEl };
  }

  // ---- SVG Icons ----

  function _playIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>';
  }

  function _pauseIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  }

  // ---- Add a data point to history ----

  function addDataPoint(tokens, contextWindow) {
    if (!_inited) return;

    var point = {
      turn: _history.length + 1,
      tokens: {},
      total: 0,
      contextWindow: contextWindow || _contextWindow
    };

    CATEGORIES.forEach(function (cat) {
      var v = Math.max(0, tokens[cat] || 0);
      point.tokens[cat] = v;
      point.total += v;
    });

    _contextWindow = point.contextWindow;
    _history.push(point);

    // Check alert thresholds
    _checkAlerts(point);

    // Update stats
    _updateStats();

    // Re-render SVG to show all data
    _renderSvg(_history.length);

    // Update progress
    _updateProgress(_history.length);
  }

  // ---- Render SVG stacked area chart ----

  function _renderSvg(visibleCount) {
    if (!_els.svg) return;

    // Clear SVG
    while (_els.svg.firstChild) {
      _els.svg.removeChild(_els.svg.firstChild);
    }

    var W = SVG_ASPECT_W;
    var H = SVG_ASPECT_H;
    var pTop = SVG_PADDING.top;
    var pRight = SVG_PADDING.right;
    var pBottom = SVG_PADDING.bottom;
    var pLeft = SVG_PADDING.left;
    var plotW = W - pLeft - pRight;
    var plotH = H - pTop - pBottom;

    // Defs: gradients for each category area
    var defs = svgEl('defs');
    CATEGORIES.forEach(function (cat) {
      var grad = svgEl('linearGradient', {
        'id': 'at-grad-' + cat,
        'x1': '0', 'y1': '0', 'x2': '0', 'y2': '1'
      });
      var stop1 = svgEl('stop', { 'offset': '0%', 'stop-color': CAT_COLORS[cat], 'stop-opacity': '0.7' });
      var stop2 = svgEl('stop', { 'offset': '100%', 'stop-color': CAT_COLORS[cat], 'stop-opacity': '0.15' });
      grad.appendChild(stop1);
      grad.appendChild(stop2);
      defs.appendChild(grad);
    });
    _els.svg.appendChild(defs);

    // Background grid
    var gridColor = themeColor('rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)');
    var axisColor = themeColor('rgba(255,255,255,0.15)', 'rgba(0,0,0,0.2)');
    var textColor = themeColor('#9893A6', '#555566');

    // Y-axis gridlines (5 divisions)
    var maxY = _contextWindow || 200000;
    for (var i = 0; i <= 5; i++) {
      var yVal = (maxY / 5) * i;
      var yPos = pTop + plotH - (plotH * (yVal / maxY));

      // Grid line
      var gridLine = svgEl('line', {
        'x1': pLeft, 'y1': yPos.toFixed(1),
        'x2': W - pRight, 'y2': yPos.toFixed(1),
        'stroke': gridColor, 'stroke-width': '1'
      });
      _els.svg.appendChild(gridLine);

      // Y-axis label
      var yLabel = svgEl('text', {
        'x': (pLeft - 8).toString(), 'y': (yPos + 4).toFixed(1),
        'text-anchor': 'end', 'fill': textColor,
        'font-size': '10', 'font-family': 'inherit'
      });
      yLabel.textContent = formatTokensShort(yVal);
      _els.svg.appendChild(yLabel);
    }

    // Context window limit line (dashed)
    var limitY = pTop;
    var limitLine = svgEl('line', {
      'x1': pLeft, 'y1': limitY.toFixed(1),
      'x2': W - pRight, 'y2': limitY.toFixed(1),
      'stroke': 'var(--accent-red, #EF4444)', 'stroke-width': '1.5',
      'stroke-dasharray': '8 4', 'opacity': '0.7'
    });
    _els.svg.appendChild(limitLine);

    // Limit label
    var limitLabel = svgEl('text', {
      'x': (W - pRight - 4).toString(), 'y': (limitY - 5).toFixed(1),
      'text-anchor': 'end', 'fill': 'var(--accent-red, #EF4444)',
      'font-size': '10', 'font-family': 'inherit', 'opacity': '0.8'
    });
    limitLabel.textContent = 'Limit: ' + formatTokensShort(maxY);
    _els.svg.appendChild(limitLabel);

    // Threshold lines (80%, 90%, 95%)
    THRESHOLDS.forEach(function (th) {
      var thY = pTop + plotH - (plotH * (th.percent / 100));
      var thLine = svgEl('line', {
        'x1': pLeft, 'y1': thY.toFixed(1),
        'x2': W - pRight, 'y2': thY.toFixed(1),
        'stroke': th.color, 'stroke-width': '1',
        'stroke-dasharray': '4 4', 'opacity': '0.5'
      });
      _els.svg.appendChild(thLine);

      var thLabel = svgEl('text', {
        'x': (pLeft + 4).toString(), 'y': (thY - 4).toFixed(1),
        'text-anchor': 'start', 'fill': th.color,
        'font-size': '9', 'font-family': 'inherit', 'opacity': '0.7'
      });
      thLabel.textContent = th.percent + '% ' + th.label;
      _els.svg.appendChild(thLabel);
    });

    // X-axis base line
    var xAxisLine = svgEl('line', {
      'x1': pLeft, 'y1': (pTop + plotH).toFixed(1),
      'x2': W - pRight, 'y2': (pTop + plotH).toFixed(1),
      'stroke': axisColor, 'stroke-width': '1'
    });
    _els.svg.appendChild(xAxisLine);

    // Y-axis base line
    var yAxisLine = svgEl('line', {
      'x1': pLeft, 'y1': pTop.toFixed(1),
      'x2': pLeft, 'y2': (pTop + plotH).toFixed(1),
      'stroke': axisColor, 'stroke-width': '1'
    });
    _els.svg.appendChild(yAxisLine);

    // If no data, show empty state message
    if (visibleCount === 0 || _history.length === 0) {
      var emptyText = svgEl('text', {
        'x': (W / 2).toString(), 'y': (H / 2).toString(),
        'text-anchor': 'middle', 'fill': textColor,
        'font-size': '14', 'font-family': 'inherit'
      });
      emptyText.textContent = 'No data yet — add data points to see the timeline';
      _els.svg.appendChild(emptyText);
      return;
    }

    // Clamp visible count
    var count = Math.min(visibleCount, _history.length);
    var data = _history.slice(0, count);
    var n = data.length;

    // X positions for each data point
    var xStep = n > 1 ? plotW / (n - 1) : plotW;
    function xPos(idx) {
      return pLeft + (n > 1 ? idx * xStep : plotW / 2);
    }
    function yPos(val) {
      return pTop + plotH - (plotH * Math.min(val / maxY, 1));
    }

    // Precompute cumulative stacks per data point
    // Stack order from bottom: system, user, assistant, tools
    var stacks = []; // stacks[pointIdx] = { system: { y0, y1 }, user: { y0, y1 }, ... }
    for (var p = 0; p < n; p++) {
      var cumulative = 0;
      var stackItem = {};
      for (var c = 0; c < CATEGORIES.length; c++) {
        var cat = CATEGORIES[c];
        var val = data[p].tokens[cat] || 0;
        stackItem[cat] = { y0: cumulative, y1: cumulative + val };
        cumulative += val;
      }
      stacks.push(stackItem);
    }

    // Draw stacked areas (bottom to top, each category)
    // We draw from the last category (top) down so layering is correct
    for (var ci = CATEGORIES.length - 1; ci >= 0; ci--) {
      var catKey = CATEGORIES[ci];
      var pathD = '';

      // Forward pass: top edge (y1 values)
      for (var pi = 0; pi < n; pi++) {
        var x = xPos(pi);
        var y = yPos(stacks[pi][catKey].y1);
        pathD += (pi === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
      }

      // Backward pass: bottom edge (y0 values)
      for (var pj = n - 1; pj >= 0; pj--) {
        var xb = xPos(pj);
        var yb = yPos(stacks[pj][catKey].y0);
        pathD += 'L' + xb.toFixed(2) + ',' + yb.toFixed(2);
      }

      pathD += 'Z';

      var areaPath = svgEl('path', {
        'd': pathD,
        'fill': 'url(#at-grad-' + catKey + ')',
        'stroke': CAT_COLORS[catKey],
        'stroke-width': '1.5',
        'stroke-linejoin': 'round',
        'class': 'at-area at-area--' + catKey
      });
      _els.svg.appendChild(areaPath);
    }

    // Draw data point dots on the top edge (total)
    for (var di = 0; di < n; di++) {
      var dx = xPos(di);
      var dy = yPos(data[di].total);
      var dot = svgEl('circle', {
        'cx': dx.toFixed(2), 'cy': dy.toFixed(2), 'r': '3',
        'fill': '#fff', 'stroke': 'var(--accent-purple, #8B5CF6)',
        'stroke-width': '1.5', 'class': 'at-dot',
        'data-turn': di.toString()
      });
      _els.svg.appendChild(dot);
    }

    // X-axis labels (show subset if many points)
    var labelInterval = Math.max(1, Math.floor(n / 12));
    for (var li = 0; li < n; li++) {
      if (li % labelInterval !== 0 && li !== n - 1) continue;
      var lx = xPos(li);
      var xLabel = svgEl('text', {
        'x': lx.toFixed(1), 'y': (pTop + plotH + 20).toString(),
        'text-anchor': 'middle', 'fill': textColor,
        'font-size': '10', 'font-family': 'inherit'
      });
      xLabel.textContent = '#' + data[li].turn;
      _els.svg.appendChild(xLabel);

      // Tick mark
      var tick = svgEl('line', {
        'x1': lx.toFixed(1), 'y1': (pTop + plotH).toString(),
        'x2': lx.toFixed(1), 'y2': (pTop + plotH + 5).toString(),
        'stroke': axisColor, 'stroke-width': '1'
      });
      _els.svg.appendChild(tick);
    }

    // Axis titles
    var xTitle = svgEl('text', {
      'x': (pLeft + plotW / 2).toString(), 'y': (H - 2).toString(),
      'text-anchor': 'middle', 'fill': textColor,
      'font-size': '11', 'font-family': 'inherit'
    });
    xTitle.textContent = 'Conversation Turn';
    _els.svg.appendChild(xTitle);

    var yTitle = svgEl('text', {
      'x': '14', 'y': (pTop + plotH / 2).toString(),
      'text-anchor': 'middle', 'fill': textColor,
      'font-size': '11', 'font-family': 'inherit',
      'transform': 'rotate(-90 14 ' + (pTop + plotH / 2) + ')'
    });
    yTitle.textContent = 'Tokens';
    _els.svg.appendChild(yTitle);

    // Invisible overlay rect for hover detection (store for _onSvgHover)
    var overlay = svgEl('rect', {
      'x': pLeft, 'y': pTop, 'width': plotW, 'height': plotH,
      'fill': 'transparent', 'class': 'at-hover-overlay'
    });
    _els.svg.appendChild(overlay);
  }

  // ---- SVG hover: show tooltip with data point info ----

  function _onSvgHover(e) {
    if (_history.length === 0) return;

    var svgRect = _els.svg.getBoundingClientRect();
    var relX = e.clientX - svgRect.left;
    var scaleX = SVG_ASPECT_W / svgRect.width;
    var svgX = relX * scaleX;

    var plotW = SVG_ASPECT_W - SVG_PADDING.left - SVG_PADDING.right;
    var n = _history.length;
    var xStep = n > 1 ? plotW / (n - 1) : plotW;

    // Find nearest data point
    var idx = Math.round((svgX - SVG_PADDING.left) / (xStep || 1));
    idx = Math.max(0, Math.min(idx, n - 1));

    var point = _history[idx];
    var pct = point.contextWindow > 0
      ? ((point.total / point.contextWindow) * 100).toFixed(1)
      : '0.0';

    var lines = [
      '<strong>Turn #' + point.turn + '</strong>',
      'Total: ' + formatNumber(point.total) + ' (' + pct + '%)'
    ];
    CATEGORIES.forEach(function (cat) {
      lines.push(
        '<span style="color:' + CAT_COLORS[cat] + '">\u25CF</span> ' +
        CAT_LABELS[cat] + ': ' + formatNumber(point.tokens[cat])
      );
    });

    _els.tooltip.innerHTML = lines.join('<br>');
    _els.tooltip.style.display = 'block';

    // Position tooltip near cursor
    var tx = e.clientX - _container.getBoundingClientRect().left + 12;
    var ty = e.clientY - _container.getBoundingClientRect().top - 10;

    // Prevent overflow on the right
    var tooltipW = _els.tooltip.offsetWidth || 180;
    if (tx + tooltipW > _container.offsetWidth - 8) {
      tx = tx - tooltipW - 24;
    }

    _els.tooltip.style.left = tx + 'px';
    _els.tooltip.style.top = ty + 'px';
  }

  function _onSvgLeave() {
    if (_els.tooltip) {
      _els.tooltip.style.display = 'none';
    }
  }

  // ---- Update stat cards ----

  function _updateStats() {
    if (_history.length === 0) return;

    var stats = getStats();

    _els.statTotal.value.textContent = formatNumber(stats.totalTokens);
    _els.statAvg.value.textContent = formatNumber(Math.round(stats.avgPerTurn));
    _els.statPeak.value.textContent = stats.peakUsagePercent.toFixed(1) + '%';

    if (stats.estimatedTurnsLeft === Infinity || stats.estimatedTurnsLeft > 9999) {
      _els.statRemaining.value.textContent = '9999+';
    } else if (stats.estimatedTurnsLeft <= 0) {
      _els.statRemaining.value.textContent = '0';
      _els.statRemaining.value.style.color = 'var(--accent-red, #EF4444)';
    } else {
      _els.statRemaining.value.textContent = Math.floor(stats.estimatedTurnsLeft).toString();
    }

    // Color the peak stat based on severity
    var peakColor = 'var(--accent-green, #10B981)';
    if (stats.peakUsagePercent >= 95) peakColor = 'var(--accent-red, #EF4444)';
    else if (stats.peakUsagePercent >= 90) peakColor = '#F97316';
    else if (stats.peakUsagePercent >= 80) peakColor = 'var(--accent-amber, #F59E0B)';
    _els.statPeak.value.style.color = peakColor;
  }

  // ---- Get computed statistics ----

  function getStats() {
    var totalTokens = 0;
    var peakPercent = 0;
    var turnCount = _history.length;

    for (var i = 0; i < turnCount; i++) {
      totalTokens += _history[i].total;
      var pct = _history[i].contextWindow > 0
        ? (_history[i].total / _history[i].contextWindow) * 100
        : 0;
      if (pct > peakPercent) peakPercent = pct;
    }

    var avgPerTurn = turnCount > 0 ? totalTokens / turnCount : 0;

    // Estimate remaining turns based on the latest data point
    var estimatedTurnsLeft = Infinity;
    if (turnCount > 0 && avgPerTurn > 0) {
      var latest = _history[turnCount - 1];
      var remaining = latest.contextWindow - latest.total;
      // Compute average incremental growth per turn
      var avgGrowth = turnCount > 1
        ? (_history[turnCount - 1].total - _history[0].total) / (turnCount - 1)
        : avgPerTurn;
      if (avgGrowth > 0) {
        estimatedTurnsLeft = remaining / avgGrowth;
      }
    }

    return {
      totalTokens: totalTokens,
      avgPerTurn: avgPerTurn,
      peakUsagePercent: peakPercent,
      estimatedTurnsLeft: estimatedTurnsLeft,
      turnCount: turnCount,
      contextWindow: _contextWindow
    };
  }

  // ---- Alert system ----

  function _checkAlerts(point) {
    var pct = point.contextWindow > 0
      ? (point.total / point.contextWindow) * 100
      : 0;

    // Find the highest threshold crossed
    var alertLevel = -1;
    for (var i = THRESHOLDS.length - 1; i >= 0; i--) {
      if (pct >= THRESHOLDS[i].percent) {
        alertLevel = i;
        break;
      }
    }

    // Only show toast if we crossed a new threshold level
    if (alertLevel >= 0 && alertLevel > _lastAlertLevel) {
      var th = THRESHOLDS[alertLevel];
      var stats = getStats();
      var turnsMsg = stats.estimatedTurnsLeft === Infinity || stats.estimatedTurnsLeft > 9999
        ? '9999+ turns remaining'
        : '~' + Math.floor(stats.estimatedTurnsLeft) + ' turns remaining';

      _showToast(
        th.label + ': ' + pct.toFixed(1) + '% context used',
        turnsMsg,
        th.color
      );
    }

    _lastAlertLevel = alertLevel;
  }

  // ---- Toast notifications ----

  function _showToast(title, message, color) {
    if (!_toastContainer) return;

    var toast = htmlEl('div', 'at-toast');
    toast.style.borderLeftColor = color;

    // Icon
    var icon = htmlEl('div', 'at-toast-icon');
    icon.style.color = color;
    icon.innerHTML = _alertIcon();
    toast.appendChild(icon);

    // Content
    var content = htmlEl('div', 'at-toast-content');
    var titleEl = htmlEl('div', 'at-toast-title', title);
    titleEl.style.color = color;
    var msgEl = htmlEl('div', 'at-toast-msg', message);
    content.appendChild(titleEl);
    content.appendChild(msgEl);
    toast.appendChild(content);

    // Close button
    var closeBtn = htmlEl('button', 'at-toast-close');
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.addEventListener('click', function () {
      _removeToast(toast);
    });
    toast.appendChild(closeBtn);

    _toastContainer.appendChild(toast);
    _activeToasts.push(toast);

    // Trigger entrance animation on next frame
    requestAnimationFrame(function () {
      toast.classList.add('at-toast--visible');
    });

    // Auto-dismiss
    var timerId = setTimeout(function () {
      _removeToast(toast);
    }, TOAST_DURATION);

    toast._timerId = timerId;
  }

  function _removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    clearTimeout(toast._timerId);
    toast.classList.remove('at-toast--visible');
    toast.classList.add('at-toast--exit');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      var idx = _activeToasts.indexOf(toast);
      if (idx > -1) _activeToasts.splice(idx, 1);
    }, 300);
  }

  function _alertIcon() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
      '<line x1="12" y1="9" x2="12" y2="13"/>' +
      '<line x1="12" y1="17" x2="12.01" y2="17"/>' +
      '</svg>';
  }

  // ---- Replay controls ----

  function _togglePlay() {
    if (_replay.playing) {
      pauseReplay();
    } else {
      startReplay();
    }
  }

  function startReplay() {
    if (_history.length === 0) return;
    if (_replay.playing) return;

    _replay.playing = true;
    _replay.lastTimestamp = 0;

    // If at the end, restart from beginning
    if (_replay.currentFrame >= _history.length) {
      _replay.currentFrame = 0;
    }

    _els.playBtn.innerHTML = _pauseIcon();
    _els.playBtn.setAttribute('aria-label', 'Pause replay');
    _els.playBtn.classList.add('at-btn--playing');

    _replay.rafId = requestAnimationFrame(_replayTick);
  }

  function pauseReplay() {
    _replay.playing = false;
    if (_replay.rafId) {
      cancelAnimationFrame(_replay.rafId);
      _replay.rafId = null;
    }

    _els.playBtn.innerHTML = _playIcon();
    _els.playBtn.setAttribute('aria-label', 'Play replay');
    _els.playBtn.classList.remove('at-btn--playing');
  }

  function _replayTick(timestamp) {
    if (!_replay.playing) return;

    if (!_replay.lastTimestamp) {
      _replay.lastTimestamp = timestamp;
    }

    var elapsed = timestamp - _replay.lastTimestamp;
    // Base interval: 600ms per frame at 1x speed
    var interval = 600 / _replay.speed;

    if (elapsed >= interval) {
      _replay.lastTimestamp = timestamp;
      _replay.currentFrame++;

      if (_replay.currentFrame > _history.length) {
        _replay.currentFrame = _history.length;
        pauseReplay();
        return;
      }

      // Render SVG up to currentFrame
      _renderSvg(_replay.currentFrame);
      _updateProgress(_replay.currentFrame);
    }

    if (_replay.playing) {
      _replay.rafId = requestAnimationFrame(_replayTick);
    }
  }

  function setSpeed(speed) {
    // Validate speed value
    var valid = false;
    for (var i = 0; i < SPEEDS.length; i++) {
      if (SPEEDS[i] === speed) { valid = true; break; }
    }
    if (!valid) return;

    _replay.speed = speed;

    // Update active button state
    if (_els.speedBtns) {
      _els.speedBtns.forEach(function (item) {
        if (item.speed === speed) {
          item.el.classList.add('at-btn--speed-active');
        } else {
          item.el.classList.remove('at-btn--speed-active');
        }
      });
    }
  }

  // ---- Progress bar ----

  function _updateProgress(frame) {
    var total = _history.length;
    var pct = total > 0 ? (frame / total) * 100 : 0;

    if (_els.progressFill) {
      _els.progressFill.style.width = pct + '%';
    }
    if (_els.progressThumb) {
      _els.progressThumb.style.left = pct + '%';
    }
    if (_els.turnCounter) {
      _els.turnCounter.textContent = 'Turn ' + frame + ' / ' + total;
    }
  }

  function _initProgressDrag() {
    var track = _els.progressTrack;
    if (!track) return;

    function seek(e) {
      var rect = track.getBoundingClientRect();
      var x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      var pct = x / rect.width;
      var frame = Math.round(pct * _history.length);
      frame = Math.max(0, Math.min(frame, _history.length));
      _replay.currentFrame = frame;
      _renderSvg(frame);
      _updateProgress(frame);
    }

    track.addEventListener('mousedown', function (e) {
      _dragging = true;
      seek(e);
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (_dragging) seek(e);
    });

    document.addEventListener('mouseup', function () {
      _dragging = false;
    });

    // Touch support
    track.addEventListener('touchstart', function (e) {
      _dragging = true;
      if (e.touches.length > 0) {
        seek(e.touches[0]);
      }
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', function (e) {
      if (_dragging && e.touches.length > 0) seek(e.touches[0]);
    });

    document.addEventListener('touchend', function () {
      _dragging = false;
    });
  }

  // ---- Clear history ----

  function clearHistory() {
    pauseReplay();
    _history = [];
    _lastAlertLevel = -1;
    _replay.currentFrame = 0;

    if (_inited) {
      _renderSvg(0);
      _updateProgress(0);
      _els.statTotal.value.textContent = '0';
      _els.statAvg.value.textContent = '0';
      _els.statPeak.value.textContent = '0%';
      _els.statPeak.value.style.color = '';
      _els.statRemaining.value.textContent = '--';
      _els.statRemaining.value.style.color = '';
    }

    // Clear active toasts
    _activeToasts.slice().forEach(function (toast) {
      _removeToast(toast);
    });
  }

  // ---- Inject scoped CSS styles ----

  function _injectStyles() {
    if (document.getElementById('at-styles')) return;

    var css = '' +
      /* Root container */
      '.at-root {' +
      '  font-family: inherit;' +
      '  color: var(--text-primary, #F1F0F5);' +
      '}' +

      /* Stats row */
      '.at-stats-row {' +
      '  display: grid;' +
      '  grid-template-columns: repeat(4, 1fr);' +
      '  gap: 12px;' +
      '  margin-bottom: 16px;' +
      '}' +
      '@media (max-width: 640px) {' +
      '  .at-stats-row { grid-template-columns: repeat(2, 1fr); }' +
      '}' +
      '.at-stat-card {' +
      '  background: var(--bg-card, rgba(255,255,255,0.03));' +
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));' +
      '  border-radius: var(--radius-md, 12px);' +
      '  padding: 14px 16px;' +
      '  text-align: center;' +
      '  transition: border-color var(--transition-fast, 150ms ease), background var(--transition-fast, 150ms ease);' +
      '}' +
      '.at-stat-card:hover {' +
      '  border-color: var(--border-hover, rgba(255,255,255,0.12));' +
      '  background: var(--bg-card-hover, rgba(255,255,255,0.06));' +
      '}' +
      '.at-stat-title {' +
      '  font-size: 0.72rem;' +
      '  color: var(--text-secondary, #9893A6);' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.05em;' +
      '  margin-bottom: 6px;' +
      '}' +
      '.at-stat-value {' +
      '  font-size: 1.4rem;' +
      '  font-weight: 700;' +
      '  color: var(--text-primary, #F1F0F5);' +
      '  line-height: 1.2;' +
      '  transition: color var(--transition-fast, 150ms ease);' +
      '}' +
      '.at-stat-unit {' +
      '  font-size: 0.68rem;' +
      '  color: var(--text-muted, #5D5773);' +
      '  margin-top: 2px;' +
      '}' +

      /* SVG wrapper */
      '.at-svg-wrap {' +
      '  position: relative;' +
      '  background: var(--bg-card, rgba(255,255,255,0.03));' +
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));' +
      '  border-radius: var(--radius-md, 12px);' +
      '  padding: 12px;' +
      '  margin-bottom: 12px;' +
      '  overflow: hidden;' +
      '}' +
      '.at-svg {' +
      '  width: 100%;' +
      '  height: auto;' +
      '  display: block;' +
      '}' +
      '.at-area {' +
      '  transition: opacity var(--transition-fast, 150ms ease);' +
      '}' +
      '.at-dot {' +
      '  transition: r var(--transition-fast, 150ms ease);' +
      '  cursor: pointer;' +
      '}' +
      '.at-dot:hover { r: 5; }' +

      /* Tooltip */
      '.at-tooltip {' +
      '  position: absolute;' +
      '  z-index: 100;' +
      '  background: var(--tooltip-bg, rgba(13,11,20,0.95));' +
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));' +
      '  border-radius: var(--radius-sm, 8px);' +
      '  padding: 10px 14px;' +
      '  font-size: 0.78rem;' +
      '  line-height: 1.55;' +
      '  color: var(--text-primary, #F1F0F5);' +
      '  pointer-events: none;' +
      '  white-space: nowrap;' +
      '  box-shadow: 0 4px 20px rgba(0,0,0,0.3);' +
      '  backdrop-filter: blur(12px);' +
      '  -webkit-backdrop-filter: blur(12px);' +
      '}' +

      /* Controls row */
      '.at-controls {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 12px;' +
      '  margin-bottom: 8px;' +
      '  flex-wrap: wrap;' +
      '}' +
      '.at-btn {' +
      '  display: inline-flex;' +
      '  align-items: center;' +
      '  justify-content: center;' +
      '  gap: 6px;' +
      '  padding: 6px 14px;' +
      '  font-size: 0.8rem;' +
      '  font-family: inherit;' +
      '  font-weight: 600;' +
      '  color: var(--text-primary, #F1F0F5);' +
      '  background: var(--bg-card, rgba(255,255,255,0.03));' +
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));' +
      '  border-radius: var(--radius-sm, 8px);' +
      '  cursor: pointer;' +
      '  transition: all var(--transition-fast, 150ms ease);' +
      '  outline: none;' +
      '}' +
      '.at-btn:hover {' +
      '  background: var(--bg-card-hover, rgba(255,255,255,0.06));' +
      '  border-color: var(--border-hover, rgba(255,255,255,0.12));' +
      '}' +
      '.at-btn:focus-visible {' +
      '  box-shadow: 0 0 0 2px var(--accent-purple, #8B5CF6);' +
      '}' +
      '.at-btn--play {' +
      '  padding: 8px 18px;' +
      '  background: rgba(139, 92, 246, 0.15);' +
      '  border-color: rgba(139, 92, 246, 0.3);' +
      '}' +
      '.at-btn--play:hover {' +
      '  background: rgba(139, 92, 246, 0.25);' +
      '}' +
      '.at-btn--playing {' +
      '  background: rgba(16, 185, 129, 0.15) !important;' +
      '  border-color: rgba(16, 185, 129, 0.3) !important;' +
      '}' +

      /* Speed buttons */
      '.at-speed-group {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 4px;' +
      '}' +
      '.at-speed-label {' +
      '  font-size: 0.75rem;' +
      '  color: var(--text-secondary, #9893A6);' +
      '  margin-right: 4px;' +
      '}' +
      '.at-btn--speed {' +
      '  padding: 4px 10px;' +
      '  font-size: 0.72rem;' +
      '  min-width: 40px;' +
      '}' +
      '.at-btn--speed-active {' +
      '  background: rgba(139, 92, 246, 0.2);' +
      '  border-color: var(--accent-purple, #8B5CF6);' +
      '  color: var(--accent-purple, #8B5CF6);' +
      '}' +

      /* Turn counter */
      '.at-turn-counter {' +
      '  font-size: 0.78rem;' +
      '  color: var(--text-secondary, #9893A6);' +
      '  margin-left: auto;' +
      '  font-variant-numeric: tabular-nums;' +
      '}' +

      /* Progress bar */
      '.at-progress-wrap {' +
      '  margin-bottom: 14px;' +
      '}' +
      '.at-progress-track {' +
      '  position: relative;' +
      '  height: 6px;' +
      '  background: var(--slider-track-bg, rgba(255,255,255,0.06));' +
      '  border-radius: 3px;' +
      '  cursor: pointer;' +
      '  user-select: none;' +
      '  -webkit-user-select: none;' +
      '}' +
      '.at-progress-fill {' +
      '  position: absolute;' +
      '  top: 0;' +
      '  left: 0;' +
      '  height: 100%;' +
      '  width: 0%;' +
      '  background: linear-gradient(90deg, var(--accent-purple, #8B5CF6), var(--accent-blue, #3B82F6));' +
      '  border-radius: 3px;' +
      '  transition: width 80ms ease;' +
      '}' +
      '.at-progress-thumb {' +
      '  position: absolute;' +
      '  top: 50%;' +
      '  left: 0%;' +
      '  width: 14px;' +
      '  height: 14px;' +
      '  background: var(--text-primary, #F1F0F5);' +
      '  border: 2px solid var(--accent-purple, #8B5CF6);' +
      '  border-radius: 50%;' +
      '  transform: translate(-50%, -50%);' +
      '  cursor: grab;' +
      '  box-shadow: 0 2px 6px rgba(0,0,0,0.3);' +
      '  transition: left 80ms ease, transform var(--transition-fast, 150ms ease);' +
      '}' +
      '.at-progress-thumb:hover {' +
      '  transform: translate(-50%, -50%) scale(1.2);' +
      '}' +
      '.at-progress-thumb:active {' +
      '  cursor: grabbing;' +
      '  transform: translate(-50%, -50%) scale(1.3);' +
      '}' +

      /* Legend */
      '.at-legend {' +
      '  display: flex;' +
      '  justify-content: center;' +
      '  gap: 18px;' +
      '  flex-wrap: wrap;' +
      '}' +
      '.at-legend-item {' +
      '  display: flex;' +
      '  align-items: center;' +
      '  gap: 6px;' +
      '  font-size: 0.75rem;' +
      '  color: var(--text-secondary, #9893A6);' +
      '}' +
      '.at-legend-dot {' +
      '  width: 10px;' +
      '  height: 10px;' +
      '  border-radius: 3px;' +
      '  flex-shrink: 0;' +
      '}' +

      /* Toast container */
      '.at-toast-container {' +
      '  position: fixed;' +
      '  top: 16px;' +
      '  right: 16px;' +
      '  z-index: 10000;' +
      '  display: flex;' +
      '  flex-direction: column;' +
      '  gap: 10px;' +
      '  pointer-events: none;' +
      '  max-width: 380px;' +
      '}' +
      '.at-toast {' +
      '  display: flex;' +
      '  align-items: flex-start;' +
      '  gap: 10px;' +
      '  padding: 12px 16px;' +
      '  background: var(--tooltip-bg, rgba(13,11,20,0.95));' +
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));' +
      '  border-left: 4px solid #F59E0B;' +
      '  border-radius: var(--radius-sm, 8px);' +
      '  box-shadow: 0 8px 30px rgba(0,0,0,0.4);' +
      '  backdrop-filter: blur(16px);' +
      '  -webkit-backdrop-filter: blur(16px);' +
      '  pointer-events: auto;' +
      '  opacity: 0;' +
      '  transform: translateX(100%);' +
      '  transition: opacity 300ms ease, transform 300ms ease;' +
      '}' +
      '.at-toast--visible {' +
      '  opacity: 1;' +
      '  transform: translateX(0);' +
      '}' +
      '.at-toast--exit {' +
      '  opacity: 0;' +
      '  transform: translateX(100%);' +
      '}' +
      '.at-toast-icon {' +
      '  flex-shrink: 0;' +
      '  margin-top: 1px;' +
      '}' +
      '.at-toast-content {' +
      '  flex: 1;' +
      '  min-width: 0;' +
      '}' +
      '.at-toast-title {' +
      '  font-size: 0.82rem;' +
      '  font-weight: 700;' +
      '  margin-bottom: 2px;' +
      '}' +
      '.at-toast-msg {' +
      '  font-size: 0.75rem;' +
      '  color: var(--text-secondary, #9893A6);' +
      '}' +
      '.at-toast-close {' +
      '  flex-shrink: 0;' +
      '  background: none;' +
      '  border: none;' +
      '  color: var(--text-muted, #5D5773);' +
      '  font-size: 1.2rem;' +
      '  cursor: pointer;' +
      '  padding: 0 2px;' +
      '  line-height: 1;' +
      '  transition: color var(--transition-fast, 150ms ease);' +
      '}' +
      '.at-toast-close:hover {' +
      '  color: var(--text-primary, #F1F0F5);' +
      '}' +

      /* Light theme overrides for toast */
      ':root[data-theme="light"] .at-toast {' +
      '  background: rgba(255,255,255,0.95);' +
      '  box-shadow: 0 8px 30px rgba(0,0,0,0.12);' +
      '}' +

      '';

    var style = document.createElement('style');
    style.id = 'at-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Public API ----

  return {
    init: init,
    addDataPoint: addDataPoint,
    startReplay: startReplay,
    pauseReplay: pauseReplay,
    setSpeed: setSpeed,
    getStats: getStats,
    clearHistory: clearHistory
  };

})();

// Expose on window for other modules
window.AlertTimeline = AlertTimeline;
