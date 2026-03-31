/**
 * Claude Context Window Visualizer — SVG Sankey Flow Diagram
 * Visualizes the token lifecycle as a flow diagram: input categories
 * merge into a context window, with a separate output flow.
 * Pure SVG, no dependencies.
 */

'use strict';

var SankeyDiagram = (function () {
  // ---- Constants ----
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

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VIEW_W = 900;
  var VIEW_H = 420;
  var ANIM_DURATION = 600; // ms

  // Layout columns (x-positions)
  var COL_LEFT   = 30;   // left nodes (Input Tokens)
  var COL_MID    = 310;  // middle nodes (categories)
  var COL_RIGHT  = 700;  // right node  (Context Window)
  var COL_OUTPUT = 700;  // output node (Output)

  var NODE_W       = 140;
  var NODE_RADIUS  = 8;
  var MIN_NODE_H   = 32;
  var NODE_PAD     = 12;  // vertical gap between stacked nodes

  // ---- State ----
  var _inited = false;
  var _svg = null;
  var _container = null;
  var _defs = null;
  var _linkGroup = null;
  var _nodeGroup = null;
  var _labelGroup = null;
  var _particleGroup = null;

  // Animation state
  var _currentTokens = { system: 0, user: 0, assistant: 0, tools: 0 };
  var _targetTokens  = { system: 0, user: 0, assistant: 0, tools: 0 };
  var _currentCtx    = 0;
  var _targetCtx     = 200000;
  var _animStart     = 0;
  var _animFrom      = { system: 0, user: 0, assistant: 0, tools: 0 };
  var _animFromCtx   = 0;
  var _rafId         = null;

  // Cached geometry for particles
  var _linkPaths = {};

  // ---- Init ----
  function init() {
    var toggle = document.getElementById('sankey-toggle');
    var card   = document.getElementById('sankey-card');
    if (!toggle || !card) return;

    toggle.addEventListener('click', function () {
      var isOpen = card.classList.toggle('sankey-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen && !_inited) {
        _inited = true;
        _container = document.getElementById('sankey-container');
        if (_container) _build();
      }
    });
  }

  // ---- Build SVG scaffold ----
  function _build() {
    _svg = _createEl('svg');
    _svg.setAttribute('viewBox', '0 0 ' + VIEW_W + ' ' + VIEW_H);
    _svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    _svg.classList.add('sankey-svg');
    _svg.setAttribute('role', 'img');
    _svg.setAttribute('aria-label', 'Token lifecycle Sankey flow diagram');

    // Defs: gradients + filters
    _defs = _createEl('defs');
    _svg.appendChild(_defs);

    // Glow filter
    _addGlowFilter('sankey-glow', 4, 0.35);

    // Groups in draw order
    _linkGroup     = _createEl('g'); _linkGroup.setAttribute('class', 'sankey-links');
    _nodeGroup     = _createEl('g'); _nodeGroup.setAttribute('class', 'sankey-nodes');
    _labelGroup    = _createEl('g'); _labelGroup.setAttribute('class', 'sankey-labels');
    _particleGroup = _createEl('g'); _particleGroup.setAttribute('class', 'sankey-particles');

    _svg.appendChild(_linkGroup);
    _svg.appendChild(_nodeGroup);
    _svg.appendChild(_labelGroup);
    _svg.appendChild(_particleGroup);

    _container.appendChild(_svg);
  }

  // ---- Public update ----
  function update(tokens, contextWindow) {
    if (!_inited || !_svg) return;

    _targetTokens = {
      system:    tokens.system    || 0,
      user:      tokens.user      || 0,
      assistant: tokens.assistant || 0,
      tools:     tokens.tools     || 0
    };
    _targetCtx = contextWindow || 200000;

    // Kickoff animation
    _animFrom    = { system: _currentTokens.system, user: _currentTokens.user, assistant: _currentTokens.assistant, tools: _currentTokens.tools };
    _animFromCtx = _currentCtx;
    _animStart   = performance.now();
    if (!_rafId) {
      _rafId = requestAnimationFrame(_animLoop);
    }
  }

  // ---- Animation loop ----
  function _animLoop(now) {
    var elapsed = now - _animStart;
    var t = Math.min(elapsed / ANIM_DURATION, 1);
    var ease = 1 - Math.pow(1 - t, 3); // cubic ease-out

    // Interpolate
    var cats = ['system', 'user', 'assistant', 'tools'];
    cats.forEach(function (c) {
      _currentTokens[c] = _animFrom[c] + (_targetTokens[c] - _animFrom[c]) * ease;
    });
    _currentCtx = _animFromCtx + (_targetCtx - _animFromCtx) * ease;

    _render(_currentTokens, _currentCtx);

    if (t < 1) {
      _rafId = requestAnimationFrame(_animLoop);
    } else {
      _rafId = null;
    }
  }

  // ---- Full render ----
  function _render(tokens, contextWindow) {
    // Clear groups
    _clearEl(_linkGroup);
    _clearEl(_nodeGroup);
    _clearEl(_labelGroup);
    // Keep particles across frames (they self-manage)

    var totalInput = tokens.system + tokens.user + tokens.tools;
    var totalAll   = totalInput + tokens.assistant;

    // Scale: map tokens to pixel heights inside the diagram
    // The tallest column dictates the scale
    var usableH  = VIEW_H - 60; // vertical padding
    var topPad   = 30;

    // Max token value sets scale (context window)
    var maxTokens = Math.max(contextWindow, totalAll, 1);
    var scale     = usableH / maxTokens;

    // Minimum visible height for any non-zero value
    function h(val) {
      if (val <= 0) return 0;
      return Math.max(MIN_NODE_H, val * scale);
    }

    // ==============================
    //  LEFT COLUMN — "Input Tokens"
    // ==============================
    var inputH = h(totalInput);
    var inputY = topPad + (usableH - inputH) / 2;
    // Shift up a bit to visually balance with output
    var inputNodeY = topPad + (usableH - inputH) / 2 - 20;
    if (inputNodeY < topPad) inputNodeY = topPad;

    _drawNode(COL_LEFT, inputNodeY, NODE_W, inputH, '#6366F1', 'Input Tokens', totalInput, 'left');

    // ==============================
    //  MIDDLE COLUMN — categories
    // ==============================
    // Stack: system, user, tools (input categories) and assistant (output)
    var inputCats = ['system', 'user', 'tools'];
    var midInputVals = inputCats.map(function (c) { return tokens[c]; });
    var midInputHs   = midInputVals.map(function (v) { return h(v); });
    var midInputTotalH = midInputHs.reduce(function (s, v) { return s + v; }, 0);
    var gaps = inputCats.filter(function (c) { return tokens[c] > 0; }).length - 1;
    if (gaps < 0) gaps = 0;
    var midInputStackH = midInputTotalH + gaps * NODE_PAD;

    // Assistant node
    var assistH = h(tokens.assistant);
    var outputSectionGap = 28;
    var totalMidH = midInputStackH + (assistH > 0 ? outputSectionGap + assistH : 0);

    var midStartY = topPad + (usableH - totalMidH) / 2;
    if (midStartY < topPad) midStartY = topPad;

    // Draw input-category nodes
    var midY = midStartY;
    var midNodes = {}; // {cat: {x, y, w, h}}
    inputCats.forEach(function (cat, i) {
      var nh = midInputHs[i];
      if (nh <= 0) return;
      midNodes[cat] = { x: COL_MID, y: midY, w: NODE_W, h: nh };
      _drawNode(COL_MID, midY, NODE_W, nh, COLORS[cat], LABELS[cat], tokens[cat], 'mid');
      midY += nh + NODE_PAD;
    });

    // Draw assistant node (offset below)
    if (assistH > 0) {
      var assistY = midY - NODE_PAD + outputSectionGap;
      midNodes['assistant'] = { x: COL_MID, y: assistY, w: NODE_W, h: assistH };

      // Dashed separator
      var sepY = assistY - outputSectionGap / 2;
      var sep = _createEl('line');
      sep.setAttribute('x1', COL_MID);
      sep.setAttribute('y1', sepY);
      sep.setAttribute('x2', COL_MID + NODE_W);
      sep.setAttribute('y2', sepY);
      sep.setAttribute('stroke', 'rgba(255,255,255,0.15)');
      sep.setAttribute('stroke-dasharray', '4,4');
      sep.setAttribute('stroke-width', '1');
      _nodeGroup.appendChild(sep);

      _drawNode(COL_MID, assistY, NODE_W, assistH, COLORS.assistant, LABELS.assistant, tokens.assistant, 'mid');
    }

    // ==============================
    //  RIGHT COLUMN — Context Window
    // ==============================
    var ctxH   = h(contextWindow);
    var fillH  = totalAll > 0 ? (totalAll / contextWindow) * ctxH : 0;
    var ctxY   = topPad + (usableH - ctxH) / 2;
    if (ctxY < topPad) ctxY = topPad;

    _drawContextNode(COL_RIGHT, ctxY, NODE_W, ctxH, fillH, totalAll, contextWindow);

    // ==============================
    //  LINKS: Left → Middle (input)
    // ==============================
    var leftPort = { x: COL_LEFT + NODE_W, yTop: inputNodeY, h: inputH };
    var leftUsed = 0;

    inputCats.forEach(function (cat) {
      if (!midNodes[cat]) return;
      var mn = midNodes[cat];
      var linkH = mn.h;

      // Create gradient for this link
      var gradId = 'sankey-grad-left-' + cat;
      _addLinkGradient(gradId, '#6366F1', COLORS[cat]);

      var fromY = leftPort.yTop + (inputH > 0 ? (leftUsed / inputH) * inputH : 0);
      var path  = _cubicLinkPath(leftPort.x, fromY, COL_MID, mn.y, linkH, linkH);

      var pathEl = _createEl('path');
      pathEl.setAttribute('d', path);
      pathEl.setAttribute('fill', 'url(#' + gradId + ')');
      pathEl.setAttribute('opacity', '0.45');
      pathEl.classList.add('sankey-link');
      _linkGroup.appendChild(pathEl);

      // Animated shimmer overlay
      _addShimmerPath(path, COLORS[cat], cat + '-left');

      leftUsed += linkH;
    });

    // ==============================
    //  LINKS: Middle → Right (to context window)
    // ==============================
    // All categories flow into context window
    var rightPort = { x: COL_RIGHT, yTop: ctxY, h: ctxH };
    var rightUsed = 0;

    var allCats = ['system', 'user', 'tools', 'assistant'];
    allCats.forEach(function (cat) {
      if (!midNodes[cat]) return;
      var mn = midNodes[cat];
      var proportion = contextWindow > 0 ? (tokens[cat] / contextWindow) : 0;
      var linkH = proportion * ctxH;
      if (linkH < 2) linkH = mn.h > 0 ? 2 : 0;
      if (linkH <= 0) return;

      var gradId = 'sankey-grad-right-' + cat;
      _addLinkGradient(gradId, COLORS[cat], _colorWithAlpha(COLORS[cat], 0.6));

      var toY  = rightPort.yTop + rightUsed;
      var path = _cubicLinkPath(COL_MID + NODE_W, mn.y, COL_RIGHT, toY, mn.h, linkH);

      var pathEl = _createEl('path');
      pathEl.setAttribute('d', path);
      pathEl.setAttribute('fill', 'url(#' + gradId + ')');
      pathEl.setAttribute('opacity', '0.4');
      pathEl.classList.add('sankey-link');
      _linkGroup.appendChild(pathEl);

      // Shimmer
      _addShimmerPath(path, COLORS[cat], cat + '-right');

      rightUsed += linkH;
    });

    // ==============================
    //  FLOW PARTICLES (decorative)
    // ==============================
    _updateParticles(tokens, contextWindow);
  }

  // ---- Draw a rounded-rect node ----
  function _drawNode(x, y, w, nh, color, label, value, position) {
    if (nh <= 0) return;

    // Gradient fill
    var gradId = 'sankey-node-' + label.toLowerCase().replace(/\s+/g, '-');
    var grad = _createEl('linearGradient');
    grad.setAttribute('id', gradId);
    grad.setAttribute('x1', '0');  grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0');  grad.setAttribute('y2', '1');
    var stop1 = _createEl('stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', color);
    stop1.setAttribute('stop-opacity', '0.9');
    var stop2 = _createEl('stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', _darken(color, 0.25));
    stop2.setAttribute('stop-opacity', '0.85');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    _defs.appendChild(grad);

    // Rect
    var rect = _createEl('rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', nh);
    rect.setAttribute('rx', NODE_RADIUS);
    rect.setAttribute('ry', NODE_RADIUS);
    rect.setAttribute('fill', 'url(#' + gradId + ')');
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('stroke-opacity', '0.6');
    rect.setAttribute('filter', 'url(#sankey-glow)');
    rect.classList.add('sankey-node');
    _nodeGroup.appendChild(rect);

    // Inner highlight (top edge glow)
    var highlight = _createEl('rect');
    highlight.setAttribute('x', x + 2);
    highlight.setAttribute('y', y + 1);
    highlight.setAttribute('width', w - 4);
    highlight.setAttribute('height', Math.min(3, nh / 4));
    highlight.setAttribute('rx', 2);
    highlight.setAttribute('fill', 'rgba(255,255,255,0.2)');
    _nodeGroup.appendChild(highlight);

    // Label
    var textY = y + nh / 2;
    var labelEl = _createEl('text');
    labelEl.setAttribute('x', x + w / 2);
    labelEl.setAttribute('y', textY - 6);
    labelEl.setAttribute('text-anchor', 'middle');
    labelEl.setAttribute('fill', '#fff');
    labelEl.setAttribute('font-size', '12');
    labelEl.setAttribute('font-weight', '600');
    labelEl.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    labelEl.setAttribute('pointer-events', 'none');
    labelEl.textContent = label;
    _labelGroup.appendChild(labelEl);

    // Value
    if (value > 0) {
      var valEl = _createEl('text');
      valEl.setAttribute('x', x + w / 2);
      valEl.setAttribute('y', textY + 10);
      valEl.setAttribute('text-anchor', 'middle');
      valEl.setAttribute('fill', 'rgba(255,255,255,0.8)');
      valEl.setAttribute('font-size', '10');
      valEl.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
      valEl.setAttribute('pointer-events', 'none');
      valEl.textContent = formatNumber(Math.round(value)) + ' tokens';
      _labelGroup.appendChild(valEl);
    }
  }

  // ---- Draw Context Window node with fill level ----
  function _drawContextNode(x, y, w, nh, fillH, totalAll, contextWindow) {
    if (nh <= 0) return;

    var pct = contextWindow > 0 ? Math.min((totalAll / contextWindow) * 100, 100) : 0;

    // Container
    var outer = _createEl('rect');
    outer.setAttribute('x', x);
    outer.setAttribute('y', y);
    outer.setAttribute('width', w);
    outer.setAttribute('height', nh);
    outer.setAttribute('rx', NODE_RADIUS);
    outer.setAttribute('ry', NODE_RADIUS);
    outer.setAttribute('fill', 'rgba(30, 30, 50, 0.6)');
    outer.setAttribute('stroke', 'rgba(255,255,255,0.2)');
    outer.setAttribute('stroke-width', '1.5');
    _nodeGroup.appendChild(outer);

    // Fill (from bottom)
    if (fillH > 1) {
      var clipId = 'sankey-ctx-clip';
      var clipPath = _createEl('clipPath');
      clipPath.setAttribute('id', clipId);
      var clipRect = _createEl('rect');
      clipRect.setAttribute('x', x);
      clipRect.setAttribute('y', y);
      clipRect.setAttribute('width', w);
      clipRect.setAttribute('height', nh);
      clipRect.setAttribute('rx', NODE_RADIUS);
      clipRect.setAttribute('ry', NODE_RADIUS);
      clipPath.appendChild(clipRect);
      _defs.appendChild(clipPath);

      // Gradient fill based on percentage
      var fillColor = pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#22D3EE';
      var fillGradId = 'sankey-ctx-fill-grad';
      var fillGrad = _createEl('linearGradient');
      fillGrad.setAttribute('id', fillGradId);
      fillGrad.setAttribute('x1', '0'); fillGrad.setAttribute('y1', '1');
      fillGrad.setAttribute('x2', '0'); fillGrad.setAttribute('y2', '0');
      var fs1 = _createEl('stop');
      fs1.setAttribute('offset', '0%');
      fs1.setAttribute('stop-color', fillColor);
      fs1.setAttribute('stop-opacity', '0.7');
      var fs2 = _createEl('stop');
      fs2.setAttribute('offset', '100%');
      fs2.setAttribute('stop-color', fillColor);
      fs2.setAttribute('stop-opacity', '0.3');
      fillGrad.appendChild(fs1);
      fillGrad.appendChild(fs2);
      _defs.appendChild(fillGrad);

      var fillRect = _createEl('rect');
      fillRect.setAttribute('x', x);
      fillRect.setAttribute('y', y + nh - fillH);
      fillRect.setAttribute('width', w);
      fillRect.setAttribute('height', fillH);
      fillRect.setAttribute('fill', 'url(#' + fillGradId + ')');
      fillRect.setAttribute('clip-path', 'url(#' + clipId + ')');
      _nodeGroup.appendChild(fillRect);

      // Animated wave line at fill level
      var waveY = y + nh - fillH;
      if (fillH > 4 && fillH < nh - 2) {
        var wave = _createEl('path');
        var waveD = 'M' + x + ',' + waveY;
        for (var wx = 0; wx <= w; wx += 2) {
          var wy = waveY + Math.sin((wx / w) * Math.PI * 4 + performance.now() * 0.002) * 2;
          waveD += ' L' + (x + wx) + ',' + wy;
        }
        wave.setAttribute('d', waveD);
        wave.setAttribute('stroke', fillColor);
        wave.setAttribute('stroke-width', '1.5');
        wave.setAttribute('stroke-opacity', '0.6');
        wave.setAttribute('fill', 'none');
        wave.setAttribute('clip-path', 'url(#' + clipId + ')');
        _nodeGroup.appendChild(wave);
      }
    }

    // Labels
    var textY = y + nh / 2;
    var titleEl = _createEl('text');
    titleEl.setAttribute('x', x + w / 2);
    titleEl.setAttribute('y', textY - 16);
    titleEl.setAttribute('text-anchor', 'middle');
    titleEl.setAttribute('fill', '#fff');
    titleEl.setAttribute('font-size', '12');
    titleEl.setAttribute('font-weight', '600');
    titleEl.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    titleEl.textContent = 'Context Window';
    _labelGroup.appendChild(titleEl);

    var pctEl = _createEl('text');
    pctEl.setAttribute('x', x + w / 2);
    pctEl.setAttribute('y', textY + 2);
    pctEl.setAttribute('text-anchor', 'middle');
    pctEl.setAttribute('fill', '#fff');
    pctEl.setAttribute('font-size', '22');
    pctEl.setAttribute('font-weight', '700');
    pctEl.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    pctEl.textContent = Math.round(pct) + '%';
    _labelGroup.appendChild(pctEl);

    var detailEl = _createEl('text');
    detailEl.setAttribute('x', x + w / 2);
    detailEl.setAttribute('y', textY + 20);
    detailEl.setAttribute('text-anchor', 'middle');
    detailEl.setAttribute('fill', 'rgba(255,255,255,0.65)');
    detailEl.setAttribute('font-size', '10');
    detailEl.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    detailEl.textContent = formatTokensShort(Math.round(totalAll)) + ' / ' + formatTokensShort(Math.round(contextWindow));
    _labelGroup.appendChild(detailEl);
  }

  // ---- Cubic bezier link path (filled area between two curves) ----
  function _cubicLinkPath(x0, y0, x1, y1, h0, h1) {
    // Top edge: from (x0, y0) to (x1, y1)
    // Bottom edge: from (x0, y0+h0) to (x1, y1+h1)
    var cpx = (x0 + x1) / 2;

    var d = 'M' + x0 + ',' + y0 +
            ' C' + cpx + ',' + y0 + ' ' + cpx + ',' + y1 + ' ' + x1 + ',' + y1 +
            ' L' + x1 + ',' + (y1 + h1) +
            ' C' + cpx + ',' + (y1 + h1) + ' ' + cpx + ',' + (y0 + h0) + ' ' + x0 + ',' + (y0 + h0) +
            ' Z';
    return d;
  }

  // ---- Shimmer overlay on a link path ----
  function _addShimmerPath(d, color, id) {
    var shimmer = _createEl('path');
    shimmer.setAttribute('d', d);
    shimmer.setAttribute('fill', color);
    shimmer.setAttribute('opacity', '0');
    shimmer.classList.add('sankey-shimmer');

    // Animate opacity for a shimmer/pulse effect
    var anim = _createEl('animate');
    anim.setAttribute('attributeName', 'opacity');
    anim.setAttribute('values', '0;0.18;0');
    anim.setAttribute('dur', (2.5 + Math.random() * 1.5) + 's');
    anim.setAttribute('repeatCount', 'indefinite');
    anim.setAttribute('begin', (Math.random() * 2) + 's');
    shimmer.appendChild(anim);

    _linkGroup.appendChild(shimmer);
  }

  // ---- Flow Particles ----
  var _particles = [];
  var _particleRaf = null;

  function _updateParticles(tokens, contextWindow) {
    if (!_particleRaf) {
      _particleRaf = requestAnimationFrame(_particleTick);
    }

    // Spawn new particles periodically (low count for perf)
    var now = performance.now();
    var cats = ['system', 'user', 'tools', 'assistant'];
    cats.forEach(function (cat) {
      if (tokens[cat] <= 0) return;
      // Spawn probability proportional to token count
      var rate = Math.min(tokens[cat] / (contextWindow || 200000), 1) * 0.08;
      if (Math.random() < rate && _particles.length < 40) {
        _spawnParticle(cat, tokens, contextWindow);
      }
    });
  }

  function _spawnParticle(cat, tokens, contextWindow) {
    var p = {
      cat: cat,
      t: 0,
      speed: 0.003 + Math.random() * 0.004,
      phase: Math.random(), // for vertical wiggle
      size: 2 + Math.random() * 2.5,
      el: null
    };

    var circle = _createEl('circle');
    circle.setAttribute('r', p.size);
    circle.setAttribute('fill', COLORS[cat]);
    circle.setAttribute('opacity', '0.7');
    circle.setAttribute('filter', 'url(#sankey-glow)');
    _particleGroup.appendChild(circle);
    p.el = circle;

    _particles.push(p);
  }

  function _particleTick() {
    var toRemove = [];

    _particles.forEach(function (p, i) {
      p.t += p.speed;

      if (p.t >= 1) {
        toRemove.push(i);
        return;
      }

      // Simple horizontal interpolation across the full width
      var x = COL_LEFT + NODE_W + p.t * (COL_RIGHT - COL_LEFT - NODE_W);
      // Gentle sine wave for vertical movement
      var baseY = VIEW_H / 2 + (p.phase - 0.5) * 120;
      var y = baseY + Math.sin(p.t * Math.PI * 3 + p.phase * 6.28) * 15;

      // Fade in/out
      var alpha = p.t < 0.15 ? (p.t / 0.15) : p.t > 0.85 ? ((1 - p.t) / 0.15) : 1;
      alpha *= 0.7;

      p.el.setAttribute('cx', x);
      p.el.setAttribute('cy', y);
      p.el.setAttribute('opacity', alpha);
    });

    // Remove expired
    for (var i = toRemove.length - 1; i >= 0; i--) {
      var idx = toRemove[i];
      if (_particles[idx].el.parentNode) {
        _particles[idx].el.parentNode.removeChild(_particles[idx].el);
      }
      _particles.splice(idx, 1);
    }

    _particleRaf = requestAnimationFrame(_particleTick);
  }

  // ---- SVG Utility Helpers ----
  function _createEl(tag) {
    return document.createElementNS(SVG_NS, tag);
  }

  function _clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function _addGlowFilter(id, blur, opacity) {
    var filter = _createEl('filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '-30%');
    filter.setAttribute('y', '-30%');
    filter.setAttribute('width', '160%');
    filter.setAttribute('height', '160%');

    var feBlur = _createEl('feGaussianBlur');
    feBlur.setAttribute('in', 'SourceGraphic');
    feBlur.setAttribute('stdDeviation', blur);
    feBlur.setAttribute('result', 'blur');
    filter.appendChild(feBlur);

    var feComp = _createEl('feComponentTransfer');
    feComp.setAttribute('in', 'blur');
    feComp.setAttribute('result', 'dimBlur');
    var feFuncA = _createEl('feFuncA');
    feFuncA.setAttribute('type', 'linear');
    feFuncA.setAttribute('slope', opacity);
    feComp.appendChild(feFuncA);
    filter.appendChild(feComp);

    var feMerge = _createEl('feMerge');
    var node1 = _createEl('feMergeNode'); node1.setAttribute('in', 'dimBlur');
    var node2 = _createEl('feMergeNode'); node2.setAttribute('in', 'SourceGraphic');
    feMerge.appendChild(node1);
    feMerge.appendChild(node2);
    filter.appendChild(feMerge);

    _defs.appendChild(filter);
  }

  function _addLinkGradient(id, color1, color2) {
    // Remove existing gradient with same id
    var existing = _defs.querySelector('#' + id);
    if (existing) _defs.removeChild(existing);

    var grad = _createEl('linearGradient');
    grad.setAttribute('id', id);
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '1'); grad.setAttribute('y2', '0');

    var s1 = _createEl('stop');
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', color1);
    var s2 = _createEl('stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', color2);
    grad.appendChild(s1);
    grad.appendChild(s2);
    _defs.appendChild(grad);
  }

  // ---- Color helpers ----
  function _darken(hex, amount) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = Math.round(r * (1 - amount));
    g = Math.round(g * (1 - amount));
    b = Math.round(b * (1 - amount));
    return '#' + _hex2(r) + _hex2(g) + _hex2(b);
  }

  function _colorWithAlpha(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function _hex2(n) {
    var s = n.toString(16);
    return s.length < 2 ? '0' + s : s;
  }

  function isInited() { return _inited; }

  // ---- Public API ----
  return {
    init:     init,
    update:   update,
    isInited: isInited
  };
})();
