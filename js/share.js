/**
 * Claude Context Window Visualizer — Share & Export Module
 * Provides: Export PNG, Share URL, Copy Stats
 */

const ShareModule = {
  /**
   * Export the gauge as a PNG by drawing onto a canvas
   */
  exportPNG(tokens, model, percent) {
    const size = 600;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 200;
    const lineWidth = 40;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#0A0A0F';
    ctx.fillRect(0, 0, size, size);

    // Draw background circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = '#1E1B2E';
    ctx.stroke();

    // Draw segments
    const categories = ['system', 'user', 'assistant', 'tools'];
    const colors = { system: '#8B5CF6', user: '#3B82F6', assistant: '#10B981', tools: '#F59E0B' };
    let startAngle = -Math.PI / 2;
    const total = categories.reduce((s, c) => s + (tokens[c] || 0), 0);

    categories.forEach(cat => {
      const fraction = model.contextWindow > 0 ? (tokens[cat] || 0) / model.contextWindow : 0;
      const angle = fraction * Math.PI * 2;
      if (angle > 0.001) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = colors[cat];
        ctx.lineCap = 'round';
        ctx.stroke();
        startAngle += angle;
      }
    });

    // Center text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F1F0F5';
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${Math.round(percent)}%`, cx, cy - 12);

    ctx.fillStyle = '#9893A6';
    ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Context Used', cx, cy + 30);

    ctx.fillStyle = '#5D5773';
    ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${formatNumber(total)} / ${formatNumber(model.contextWindow)}`, cx, cy + 58);

    // Model name at top
    ctx.fillStyle = '#9893A6';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(model.name, cx, 30);

    // Watermark at bottom
    ctx.fillStyle = '#5D5773';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Claude Context Window Visualizer  |  github.com/Zey413', cx, size - 20);

    // Download
    const link = document.createElement('a');
    link.download = `claude-context-${model.id}-${Math.round(percent)}pct.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  },

  /**
   * Generate a shareable URL with current state encoded as query params
   */
  generateShareURL(modelIndex, tokens) {
    const params = new URLSearchParams();
    params.set('m', modelIndex);
    params.set('s', tokens.system);
    params.set('u', tokens.user);
    params.set('a', tokens.assistant);
    params.set('t', tokens.tools);
    const url = new URL(window.location.href.split('?')[0]);
    url.search = params.toString();
    return url.toString();
  },

  /**
   * Parse URL params on load and return state if present
   */
  parseURLParams() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('m')) return null;
    return {
      modelIndex: parseInt(params.get('m')) || 0,
      tokens: {
        system: parseInt(params.get('s')) || 0,
        user: parseInt(params.get('u')) || 0,
        assistant: parseInt(params.get('a')) || 0,
        tools: parseInt(params.get('t')) || 0,
      }
    };
  },

  /**
   * Copy share URL to clipboard
   */
  async copyShareLink(modelIndex, tokens) {
    const url = this.generateShareURL(modelIndex, tokens);
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    }
  },

  /**
   * Copy a text summary of usage stats to clipboard
   */
  async copyStats(tokens, model, percent) {
    const total = tokens.system + tokens.user + tokens.assistant + tokens.tools;
    const pct = (v) => model.contextWindow > 0 ? ((v / model.contextWindow) * 100).toFixed(1) : '0.0';
    const text = [
      `Claude Context Window Usage`,
      `Model: ${model.name}`,
      `─────────────────────────`,
      `System:    ${formatNumber(tokens.system).padStart(10)} (${pct(tokens.system)}%)`,
      `User:      ${formatNumber(tokens.user).padStart(10)} (${pct(tokens.user)}%)`,
      `Assistant: ${formatNumber(tokens.assistant).padStart(10)} (${pct(tokens.assistant)}%)`,
      `Tools:     ${formatNumber(tokens.tools).padStart(10)} (${pct(tokens.tools)}%)`,
      `─────────────────────────`,
      `Total:     ${formatNumber(total).padStart(10)} / ${formatNumber(model.contextWindow)} (${percent.toFixed(1)}%)`,
      ``,
      `Generated by Claude Context Visualizer`,
      `https://github.com/Zey413/claude-context-visualizer`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    }
  },

  /**
   * Show a brief toast notification
   */
  showToast(message) {
    const existing = document.querySelector('.share-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'share-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('share-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('share-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
};
