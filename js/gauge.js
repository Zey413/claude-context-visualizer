/**
 * Claude Context Window Visualizer — SVG Gauge Renderer
 * Renders an animated donut chart with color-coded segments.
 */

'use strict';

class GaugeRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn('GaugeRenderer: container #' + containerId + ' not found');
      return;
    }
    this.size = 360;
    this.cx = this.size / 2;
    this.cy = this.size / 2;
    this.radius = 140;
    this.strokeWidth = 28;
    this.circumference = 2 * Math.PI * this.radius;
    this.gapDeg = 1.5; // gap between segments in degrees

    // Animation state
    this.currentSegments = { system: 0, user: 0, assistant: 0, tools: 0 };
    this.targetSegments = { system: 0, user: 0, assistant: 0, tools: 0 };
    this.animating = false;
    this.currentPercent = 0;
    this.targetPercent = 0;

    // Tooltip element
    this.tooltip = null;

    this._build();
  }

  _build() {
    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${this.size} ${this.size}`);
    svg.classList.add('gauge-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Token usage gauge chart');

    // Defs for filters
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    // Glow filter
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'glow');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    const feGaussian = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    feGaussian.setAttribute('stdDeviation', '3');
    feGaussian.setAttribute('result', 'glow');
    filter.appendChild(feGaussian);
    const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const feMergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode1.setAttribute('in', 'glow');
    const feMergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    feMergeNode2.setAttribute('in', 'SourceGraphic');
    feMerge.appendChild(feMergeNode1);
    feMerge.appendChild(feMergeNode2);
    filter.appendChild(feMerge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // Tick marks
    this.tickGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.tickGroup.classList.add('gauge-ticks-rotating');
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * 360 - 90;
      const rad = (angle * Math.PI) / 180;
      const outerR = this.radius + this.strokeWidth / 2 + 6;
      const innerR = this.radius + this.strokeWidth / 2 + 2;
      const isMajor = i % 5 === 0;
      const r1 = isMajor ? outerR + 4 : outerR;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', this.cx + Math.cos(rad) * innerR);
      line.setAttribute('y1', this.cy + Math.sin(rad) * innerR);
      line.setAttribute('x2', this.cx + Math.cos(rad) * r1);
      line.setAttribute('y2', this.cy + Math.sin(rad) * r1);
      line.classList.add('gauge-tick');
      line.setAttribute('stroke-width', isMajor ? '1.5' : '0.8');
      this.tickGroup.appendChild(line);
    }
    svg.appendChild(this.tickGroup);

    // Background track
    this.bgCircle = this._createCircle(REMAINING_STROKE, this.circumference, 0, 0.3);
    svg.appendChild(this.bgCircle);

    // Danger ring (outer glow)
    this.dangerRing = this._createCircle('transparent', 0, 0, 1);
    this.dangerRing.setAttribute('r', this.radius + this.strokeWidth / 2 + 1);
    this.dangerRing.setAttribute('stroke-width', '2');
    this.dangerRing.classList.add('gauge-danger-ring');
    svg.appendChild(this.dangerRing);

    // Segment circles (in reverse order so system draws on top)
    this.segments = {};
    const categories = ['tools', 'assistant', 'user', 'system'];
    categories.forEach(cat => {
      const catInfo = TOKEN_CATEGORIES.find(c => c.id === cat);
      const circle = this._createCircle(catInfo.color, 0, 0, 1);
      circle.classList.add('gauge-segment');
      circle.setAttribute('filter', 'url(#glow)');
      circle.dataset.category = cat;
      this.segments[cat] = circle;
      svg.appendChild(circle);
    });

    // Center text group
    const centerG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    centerG.setAttribute('text-anchor', 'middle');

    this.percentText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    this.percentText.setAttribute('x', this.cx);
    this.percentText.setAttribute('y', this.cy - 8);
    this.percentText.classList.add('gauge-center-percent');
    this.percentText.setAttribute('font-size', '48');
    this.percentText.setAttribute('aria-live', 'polite');
    this.percentText.setAttribute('role', 'status');
    this.percentText.textContent = '0%';
    centerG.appendChild(this.percentText);

    this.labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    this.labelText.setAttribute('x', this.cx);
    this.labelText.setAttribute('y', this.cy + 16);
    this.labelText.classList.add('gauge-center-label');
    this.labelText.textContent = typeof I18n !== 'undefined' ? I18n.t('contextUsed') : 'Context Used';
    centerG.appendChild(this.labelText);

    this.tokensText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    this.tokensText.setAttribute('x', this.cx);
    this.tokensText.setAttribute('y', this.cy + 36);
    this.tokensText.classList.add('gauge-center-tokens');
    this.tokensText.textContent = '0 / 200,000';
    centerG.appendChild(this.tokensText);

    svg.appendChild(centerG);

    // Append SVG
    this.container.appendChild(svg);
    this.svg = svg;

    // Tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.classList.add('gauge-tooltip');
    this.tooltip.innerHTML = '<div class="gauge-tooltip__label"></div><div class="gauge-tooltip__value"></div>';
    this.container.appendChild(this.tooltip);

    // Event listeners for segments
    Object.entries(this.segments).forEach(([cat, circle]) => {
      circle.addEventListener('mouseenter', (e) => this._showTooltip(e, cat));
      circle.addEventListener('mousemove', (e) => this._moveTooltip(e));
      circle.addEventListener('mouseleave', () => this._hideTooltip());
    });
  }

  _createCircle(color, dashLength, dashOffset, opacity) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', this.cx);
    circle.setAttribute('cy', this.cy);
    circle.setAttribute('r', this.radius);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', this.strokeWidth);
    circle.setAttribute('stroke-linecap', 'round');
    circle.setAttribute('stroke-dasharray', `${dashLength} ${this.circumference}`);
    circle.setAttribute('stroke-dashoffset', dashOffset);
    circle.setAttribute('opacity', opacity);
    circle.setAttribute('transform', `rotate(-90 ${this.cx} ${this.cy})`);
    return circle;
  }

  /**
   * Update the gauge with new segment values (token counts) and total context window.
   */
  update(tokens, contextWindow) {
    if (!this.container) return;
    const total = tokens.system + tokens.user + tokens.assistant + tokens.tools;
    const percent = contextWindow > 0 ? (total / contextWindow) * 100 : 0;

    // Store for tooltip
    this._tokens = tokens;
    this._contextWindow = contextWindow;

    // Target values (fraction of circumference for each segment)
    const categories = ['system', 'user', 'assistant', 'tools'];
    categories.forEach(cat => {
      this.targetSegments[cat] = contextWindow > 0 ? (tokens[cat] / contextWindow) : 0;
    });
    this.targetPercent = Math.min(percent, 100);

    // Update tokens text
    this.tokensText.textContent = `${formatNumber(total)} / ${formatNumber(contextWindow)}`;

    // Danger state
    if (percent >= 90) {
      this.dangerRing.classList.add('gauge-danger-ring--active');
      this.dangerRing.setAttribute('stroke', '#EF4444');
    } else {
      this.dangerRing.classList.remove('gauge-danger-ring--active');
    }

    // Start animation
    if (!this.animating) {
      this.animating = true;
      this._animateStart = performance.now();
      this._animateFrom = { ...this.currentSegments };
      this._animateFromPercent = this.currentPercent;
      requestAnimationFrame((t) => this._animate(t));
    } else {
      // Restart animation from current interpolated state
      this._animateStart = performance.now();
      this._animateFrom = { ...this.currentSegments };
      this._animateFromPercent = this.currentPercent;
    }
  }

  _animate(now) {
    const duration = 500;
    const elapsed = now - this._animateStart;
    const t = Math.min(elapsed / duration, 1);
    // Cubic ease-out
    const ease = 1 - Math.pow(1 - t, 3);

    // Interpolate segment values
    const categories = ['system', 'user', 'assistant', 'tools'];
    categories.forEach(cat => {
      this.currentSegments[cat] = this._animateFrom[cat] + (this.targetSegments[cat] - this._animateFrom[cat]) * ease;
    });

    // Interpolate percent
    this.currentPercent = this._animateFromPercent + (this.targetPercent - this._animateFromPercent) * ease;
    this.percentText.textContent = `${Math.round(this.currentPercent)}%`;

    // Update font size based on digits
    const digits = Math.round(this.currentPercent).toString().length;
    this.percentText.setAttribute('font-size', digits >= 3 ? '42' : '48');

    // Draw segments
    this._drawSegments();

    if (t < 1) {
      requestAnimationFrame((t2) => this._animate(t2));
    } else {
      this.animating = false;
    }
  }

  _drawSegments() {
    const categories = ['system', 'user', 'assistant', 'tools'];
    let offset = 0;
    const gapLength = (this.gapDeg / 360) * this.circumference;

    categories.forEach(cat => {
      const fraction = this.currentSegments[cat];
      const length = fraction * this.circumference;

      if (length < 0.5) {
        // Too small to draw
        this.segments[cat].setAttribute('stroke-dasharray', `0 ${this.circumference}`);
      } else {
        const visibleLength = Math.max(0, length - gapLength);
        const dashOffset = -offset - gapLength / 2;
        this.segments[cat].setAttribute('stroke-dasharray', `${visibleLength} ${this.circumference - visibleLength}`);
        this.segments[cat].setAttribute('stroke-dashoffset', dashOffset);
      }
      offset += length;
    });
  }

  _showTooltip(e, category) {
    const catInfo = TOKEN_CATEGORIES.find(c => c.id === category);
    const tokens = this._tokens ? this._tokens[category] : 0;
    const pct = this._contextWindow > 0 ? ((tokens / this._contextWindow) * 100).toFixed(1) : 0;

    this.tooltip.querySelector('.gauge-tooltip__label').textContent = catInfo.label;
    this.tooltip.querySelector('.gauge-tooltip__value').innerHTML =
      `${formatNumber(tokens)} tokens <span style="color:${catInfo.color}">(${pct}%)</span>`;
    this.tooltip.classList.add('gauge-tooltip--visible');
    this._moveTooltip(e);
  }

  _moveTooltip(e) {
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left + 12;
    const y = e.clientY - rect.top - 10;
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  _hideTooltip() {
    this.tooltip.classList.remove('gauge-tooltip--visible');
  }

  /**
   * Update segment stroke colors. Accepts an array of 4 colors
   * in category order: [system, user, assistant, tools].
   */
  setSegmentColors(colors) {
    const cats = ['system', 'user', 'assistant', 'tools'];
    cats.forEach((cat, i) => {
      if (this.segments[cat] && colors[i]) {
        this.segments[cat].setAttribute('stroke', colors[i]);
      }
    });
  }
}
