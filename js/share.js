/**
 * Claude Context Window Visualizer — Share & Export Module
 * Provides: Export PNG (with full category breakdown), Share URL, Copy Stats.
 * No external dependencies — uses native Canvas API and Clipboard API.
 */

const ShareModule = {

  // ---- Helper: rounded rectangle path ----
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // ---- Helper: draw a soft radial glow ----
  _drawGlow(ctx, x, y, radius, color) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  },

  /**
   * Export the gauge as a high-quality PNG with donut chart, category breakdown,
   * and summary statistics — all drawn on a temporary canvas.
   */
  exportPNG(tokens, model, percent) {
    const categories = ['system', 'user', 'assistant', 'tools'];
    const colors = { system: '#8B5CF6', user: '#3B82F6', assistant: '#10B981', tools: '#F59E0B' };
    const labels = { system: 'System Prompt', user: 'User Messages', assistant: 'Assistant Output', tools: 'Tool Use' };
    const total = categories.reduce(function (s, c) { return s + (tokens[c] || 0); }, 0);

    var width = 800;
    var height = 600;
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');

    // --- Background gradient ---
    var bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#0A0A0F');
    bgGrad.addColorStop(0.5, '#13111C');
    bgGrad.addColorStop(1, '#0D0B14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle glow spots
    this._drawGlow(ctx, 100, 80, 200, 'rgba(139, 92, 246, 0.08)');
    this._drawGlow(ctx, width - 100, height - 80, 180, 'rgba(59, 130, 246, 0.06)');

    // --- Title ---
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F1F0F5';
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText('Claude Context Window Usage', width / 2, 40);

    // Model name subtitle
    ctx.fillStyle = '#9893A6';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText(model.name, width / 2, 62);

    // --- Donut Chart ---
    var cx = 260;
    var cy = 280;
    var outerR = 140;
    var innerR = 100;
    var ringR = (outerR + innerR) / 2;
    var ringW = outerR - innerR;

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = '#2D2A3E';
    ctx.lineWidth = ringW;
    ctx.stroke();

    // Draw colored segments
    var startAngle = -Math.PI / 2;
    categories.forEach(function (cat) {
      var fraction = model.contextWindow > 0 ? (tokens[cat] || 0) / model.contextWindow : 0;
      if (fraction < 0.001) { startAngle += fraction * Math.PI * 2; return; }

      var sweep = fraction * Math.PI * 2;
      var gap = 0.02;
      var segStart = startAngle + gap / 2;
      var segEnd = startAngle + sweep - gap / 2;

      if (segEnd > segStart) {
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, segStart, segEnd);
        ctx.strokeStyle = colors[cat];
        ctx.lineWidth = ringW;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
      startAngle += sweep;
    });

    // Center text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F1F0F5';
    ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText(Math.round(percent) + '%', cx, cy - 8);

    ctx.fillStyle = '#9893A6';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText('Context Used', cx, cy + 22);

    ctx.fillStyle = '#5D5773';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText(formatNumber(total) + ' / ' + formatNumber(model.contextWindow), cx, cy + 42);

    // --- Category Breakdown (right side) ---
    var bx = 480;
    var by = 130;
    var self = this;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    categories.forEach(function (cat) {
      var val = tokens[cat] || 0;
      var pct = model.contextWindow > 0 ? (val / model.contextWindow) * 100 : 0;

      // Color dot
      ctx.beginPath();
      ctx.arc(bx, by + 8, 5, 0, Math.PI * 2);
      ctx.fillStyle = colors[cat];
      ctx.fill();

      // Label
      ctx.fillStyle = '#9893A6';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      ctx.fillText(labels[cat], bx + 16, by);

      // Value
      ctx.fillStyle = '#F1F0F5';
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      ctx.fillText(formatNumber(val), bx + 16, by + 18);

      // Percent
      ctx.fillStyle = '#5D5773';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
      ctx.fillText(pct.toFixed(1) + '%', bx + 16, by + 40);

      // Progress bar track
      var barX = bx + 16;
      var barY = by + 58;
      var barW = 270;
      var barH = 4;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      self._roundRect(ctx, barX, barY, barW, barH, 2);
      ctx.fill();

      // Progress bar fill
      var fillW = Math.max(0, (pct / 100) * barW);
      if (fillW > 0) {
        ctx.fillStyle = colors[cat];
        self._roundRect(ctx, barX, barY, fillW, barH, 2);
        ctx.fill();
      }

      by += 85;
    });

    // --- Summary bar at bottom ---
    var sy = height - 60;
    var remaining = Math.max(0, model.contextWindow - total);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Total Used
    ctx.fillStyle = '#5D5773';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText('TOTAL USED', width * 0.25, sy);
    ctx.fillStyle = '#F1F0F5';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText(formatNumber(total), width * 0.25, sy + 16);

    // Remaining
    ctx.fillStyle = '#5D5773';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText('REMAINING', width * 0.5, sy);
    ctx.fillStyle = percent >= 90 ? '#EF4444' : percent >= 70 ? '#F59E0B' : '#10B981';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText(formatNumber(remaining), width * 0.5, sy + 16);

    // Context Window
    ctx.fillStyle = '#5D5773';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText('CONTEXT WINDOW', width * 0.75, sy);
    ctx.fillStyle = '#F1F0F5';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText(formatTokensShort(model.contextWindow), width * 0.75, sy + 16);

    // --- Watermark ---
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(93, 87, 115, 0.5)';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText('Claude Context Window Visualizer', width - 16, height - 12);

    // --- Download as PNG ---
    canvas.toBlob(function (blob) {
      if (!blob) {
        ShareModule.showToast('Failed to generate image');
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'claude-context-' + model.id + '-' + Math.round(percent) + 'pct.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ShareModule.showToast('PNG exported successfully');
    }, 'image/png');
  },

  /**
   * Generate a shareable URL with current state encoded as query params.
   */
  generateShareURL(modelIndex, tokens) {
    var params = new URLSearchParams();
    params.set('m', modelIndex);
    params.set('s', tokens.system);
    params.set('u', tokens.user);
    params.set('a', tokens.assistant);
    params.set('t', tokens.tools);
    var url = new URL(window.location.href.split('?')[0]);
    url.search = params.toString();
    return url.toString();
  },

  /**
   * Parse URL params on load and return a state object if valid share params exist.
   * Returns null if no share params are present or they are invalid.
   */
  parseURLParams() {
    var params = new URLSearchParams(window.location.search);
    if (!params.has('m')) return null;

    var modelIndex = parseInt(params.get('m'));
    if (isNaN(modelIndex) || modelIndex < 0 || modelIndex >= CLAUDE_MODELS.length) return null;

    var maxCtx = CLAUDE_MODELS[modelIndex].contextWindow;
    var clamp = function (val) {
      var n = parseInt(val);
      if (isNaN(n) || n < 0) return 0;
      return Math.min(n, maxCtx);
    };

    var tokens = {
      system: clamp(params.get('s')),
      user: clamp(params.get('u')),
      assistant: clamp(params.get('a')),
      tools: clamp(params.get('t')),
    };

    // Scale down if total exceeds context window
    var total = tokens.system + tokens.user + tokens.assistant + tokens.tools;
    if (total > maxCtx && total > 0) {
      var scale = maxCtx / total;
      tokens.system = Math.round(tokens.system * scale);
      tokens.user = Math.round(tokens.user * scale);
      tokens.assistant = Math.round(tokens.assistant * scale);
      tokens.tools = Math.round(tokens.tools * scale);
    }

    return {
      modelIndex: modelIndex,
      tokens: tokens,
    };
  },

  /**
   * Copy shareable URL to clipboard and update browser URL bar.
   */
  copyShareLink(modelIndex, tokens) {
    var url = this.generateShareURL(modelIndex, tokens);

    // Update the browser URL without page reload
    try {
      var params = new URLSearchParams();
      params.set('m', modelIndex);
      params.set('s', tokens.system);
      params.set('u', tokens.user);
      params.set('a', tokens.assistant);
      params.set('t', tokens.tools);
      history.replaceState(null, '', '?' + params.toString());
    } catch (e) { /* ignore */ }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        ShareModule.showToast('Share link copied to clipboard');
      }).catch(function () {
        ShareModule._fallbackCopy(url);
        ShareModule.showToast('Share link copied to clipboard');
      });
    } else {
      this._fallbackCopy(url);
      this.showToast('Share link copied to clipboard');
    }
  },

  /**
   * Copy a formatted text summary of current usage stats to clipboard.
   */
  copyStats(tokens, model, percent) {
    var total = tokens.system + tokens.user + tokens.assistant + tokens.tools;
    var pct = function (v) {
      return model.contextWindow > 0 ? ((v / model.contextWindow) * 100).toFixed(1) : '0.0';
    };
    var text = [
      'Claude Context Window Usage',
      'Model: ' + model.name,
      'System: ' + formatNumber(tokens.system) + ' (' + pct(tokens.system) + '%)',
      'User: ' + formatNumber(tokens.user) + ' (' + pct(tokens.user) + '%)',
      'Assistant: ' + formatNumber(tokens.assistant) + ' (' + pct(tokens.assistant) + '%)',
      'Tools: ' + formatNumber(tokens.tools) + ' (' + pct(tokens.tools) + '%)',
      'Total: ' + formatNumber(total) + ' / ' + formatNumber(model.contextWindow) + ' (' + percent.toFixed(1) + '%)',
    ].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        ShareModule.showToast('Stats copied to clipboard');
      }).catch(function () {
        ShareModule._fallbackCopy(text);
        ShareModule.showToast('Stats copied to clipboard');
      });
    } else {
      this._fallbackCopy(text);
      this.showToast('Stats copied to clipboard');
    }
  },

  /**
   * Fallback copy using a temporary textarea (for older browsers / non-HTTPS).
   */
  _fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  },

  /**
   * Flash a button with a success state briefly.
   */
  flashButton(btn) {
    btn.classList.add('action-btn--success');
    setTimeout(function () { btn.classList.remove('action-btn--success'); }, 1200);
  },

  /**
   * Show a brief toast notification at the bottom of the screen.
   */
  showToast(message) {
    // Remove any existing toast
    var existing = document.querySelector('.share-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'share-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger enter animation on next frame
    requestAnimationFrame(function () {
      toast.classList.add('share-toast--visible');
    });

    setTimeout(function () {
      toast.classList.remove('share-toast--visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
  }
};
