/**
 * Claude Context Window Visualizer — Config Exporter v3.2
 * Export current visualization config as JSON, YAML, Markdown, or Claude API Config.
 * Supports inline CSS injection, dark/light theme, clipboard copy, and file download.
 */

'use strict';

var ConfigExporter = (function () {

  // ---- Private State ----
  var _inited = false;
  var _container = null;
  var _previewEl = null;
  var _currentFormat = null;  // 'json' | 'yaml' | 'markdown' | 'api'
  var _currentOutput = '';    // The last generated export string

  // Data references (set by caller or read from globals)
  var _tokens = { system: 0, user: 0, assistant: 0, tools: 0 };
  var _modelIndex = 0;

  var VERSION = '3.2.0';
  var CATEGORIES = ['system', 'user', 'assistant', 'tools'];
  var INPUT_CATEGORIES = ['system', 'user', 'tools'];
  var OUTPUT_CATEGORIES = ['assistant'];

  // File extensions for each format
  var FORMAT_EXT = {
    json: '.json',
    yaml: '.yaml',
    markdown: '.md',
    api: '.json'
  };

  // MIME types for downloads
  var FORMAT_MIME = {
    json: 'application/json',
    yaml: 'text/yaml',
    markdown: 'text/markdown',
    api: 'application/json'
  };

  // ---- CSS Injection ----

  var _cssInjected = false;

  function _injectCSS() {
    if (_cssInjected) return;
    _cssInjected = true;

    var css =
      /* Container */
      '.cfg-exporter { font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif; }' +

      /* Button row */
      '.cfg-exporter__btns { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }' +
      '.cfg-exporter__btn {' +
        'display: inline-flex; align-items: center; gap: 0.35rem;' +
        'padding: 0.45rem 0.85rem; border: 1px solid rgba(255,255,255,0.1);' +
        'border-radius: 0.5rem; background: rgba(255,255,255,0.04);' +
        'color: var(--text-secondary, #9893A6); font-size: 0.8rem; font-weight: 500;' +
        'cursor: pointer; transition: all 0.2s ease;' +
      '}' +
      '.cfg-exporter__btn:hover {' +
        'background: rgba(255,255,255,0.08); color: var(--text-primary, #F1F0F5);' +
        'border-color: rgba(255,255,255,0.2);' +
      '}' +
      '.cfg-exporter__btn--active {' +
        'background: rgba(139,92,246,0.15); color: #C084FC;' +
        'border-color: rgba(139,92,246,0.4);' +
      '}' +
      '.cfg-exporter__btn-icon { font-size: 1rem; line-height: 1; }' +

      /* Preview area */
      '.cfg-exporter__preview-wrap {' +
        'display: none; position: relative; border-radius: 0.5rem;' +
        'border: 1px solid rgba(255,255,255,0.08);' +
        'background: rgba(0,0,0,0.2); overflow: hidden;' +
      '}' +
      '.cfg-exporter__preview-wrap--visible { display: block; }' +

      /* Action bar above preview */
      '.cfg-exporter__actions {' +
        'display: flex; align-items: center; justify-content: space-between;' +
        'padding: 0.4rem 0.65rem; background: rgba(255,255,255,0.03);' +
        'border-bottom: 1px solid rgba(255,255,255,0.06);' +
      '}' +
      '.cfg-exporter__actions-label {' +
        'font-size: 0.72rem; font-weight: 600; text-transform: uppercase;' +
        'letter-spacing: 0.05em; color: var(--text-muted, #5D5773);' +
      '}' +
      '.cfg-exporter__actions-btns { display: flex; gap: 0.4rem; }' +
      '.cfg-exporter__action-btn {' +
        'display: inline-flex; align-items: center; gap: 0.3rem;' +
        'padding: 0.3rem 0.65rem; border: 1px solid rgba(255,255,255,0.1);' +
        'border-radius: 0.35rem; background: rgba(255,255,255,0.04);' +
        'color: var(--text-secondary, #9893A6); font-size: 0.72rem; font-weight: 500;' +
        'cursor: pointer; transition: all 0.2s ease;' +
      '}' +
      '.cfg-exporter__action-btn:hover {' +
        'background: rgba(255,255,255,0.08); color: var(--text-primary, #F1F0F5);' +
      '}' +

      /* Pre element */
      '.cfg-exporter__pre {' +
        'margin: 0; padding: 0.75rem; overflow-x: auto; max-height: 420px;' +
        'font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace;' +
        'font-size: 0.75rem; line-height: 1.55; color: var(--text-secondary, #9893A6);' +
        'white-space: pre; tab-size: 2; -moz-tab-size: 2;' +
      '}' +

      /* Toast */
      '.cfg-exporter__toast {' +
        'position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(20px);' +
        'padding: 0.55rem 1.2rem; border-radius: 0.5rem;' +
        'background: rgba(16,185,129,0.92); color: #fff;' +
        'font-size: 0.8rem; font-weight: 500; pointer-events: none;' +
        'opacity: 0; transition: all 0.3s ease; z-index: 10000;' +
        'box-shadow: 0 4px 20px rgba(16,185,129,0.25);' +
      '}' +
      '.cfg-exporter__toast--visible {' +
        'opacity: 1; transform: translateX(-50%) translateY(0);' +
      '}' +

      /* Light theme overrides */
      '[data-theme="light"] .cfg-exporter__btn {' +
        'background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12);' +
        'color: #555;' +
      '}' +
      '[data-theme="light"] .cfg-exporter__btn:hover {' +
        'background: rgba(0,0,0,0.06); color: #222; border-color: rgba(0,0,0,0.2);' +
      '}' +
      '[data-theme="light"] .cfg-exporter__btn--active {' +
        'background: rgba(139,92,246,0.1); color: #7C3AED;' +
        'border-color: rgba(139,92,246,0.3);' +
      '}' +
      '[data-theme="light"] .cfg-exporter__preview-wrap {' +
        'background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.1);' +
      '}' +
      '[data-theme="light"] .cfg-exporter__actions {' +
        'background: rgba(0,0,0,0.02); border-bottom-color: rgba(0,0,0,0.06);' +
      '}' +
      '[data-theme="light"] .cfg-exporter__actions-label { color: #888; }' +
      '[data-theme="light"] .cfg-exporter__action-btn {' +
        'background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12); color: #555;' +
      '}' +
      '[data-theme="light"] .cfg-exporter__action-btn:hover {' +
        'background: rgba(0,0,0,0.06); color: #222;' +
      '}' +
      '[data-theme="light"] .cfg-exporter__pre { color: #444; }';

    var style = document.createElement('style');
    style.setAttribute('data-cfg-exporter', '');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Helpers ----

  /**
   * Get the current model object from CLAUDE_MODELS.
   * @returns {Object} Model definition
   */
  function _getModel() {
    return (typeof CLAUDE_MODELS !== 'undefined' && CLAUDE_MODELS[_modelIndex])
      ? CLAUDE_MODELS[_modelIndex]
      : { id: 'unknown', name: 'Unknown', contextWindow: 200000, outputLimit: 8192,
          pricing: { inputPerMTok: 3, outputPerMTok: 15 } };
  }

  /**
   * Build the shared export data object used by all formatters.
   * @returns {Object} Structured export payload
   */
  function _buildExportData() {
    var model = _getModel();
    var totalUsed = CATEGORIES.reduce(function (s, c) { return s + (_tokens[c] || 0); }, 0);
    var remaining = Math.max(0, model.contextWindow - totalUsed);
    var percentage = model.contextWindow > 0
      ? parseFloat(((totalUsed / model.contextWindow) * 100).toFixed(2))
      : 0;

    // Cost calculation
    var inputTokens = INPUT_CATEGORIES.reduce(function (s, c) { return s + (_tokens[c] || 0); }, 0);
    var outputTokens = OUTPUT_CATEGORIES.reduce(function (s, c) { return s + (_tokens[c] || 0); }, 0);
    var inputCost = (inputTokens / 1e6) * model.pricing.inputPerMTok;
    var outputCost = (outputTokens / 1e6) * model.pricing.outputPerMTok;
    var totalCost = inputCost + outputCost;
    var dailyRequests = 100;

    return {
      model: model.id,
      modelName: model.name,
      contextWindow: model.contextWindow,
      outputLimit: model.outputLimit,
      tokens: {
        system: _tokens.system || 0,
        user: _tokens.user || 0,
        assistant: _tokens.assistant || 0,
        tools: _tokens.tools || 0
      },
      usage: {
        totalUsed: totalUsed,
        percentage: percentage,
        remaining: remaining
      },
      cost: {
        inputCostPerRequest: parseFloat(inputCost.toFixed(6)),
        outputCostPerRequest: parseFloat(outputCost.toFixed(6)),
        totalCostPerRequest: parseFloat(totalCost.toFixed(6)),
        estimatedDailyCost: parseFloat((totalCost * dailyRequests).toFixed(6))
      },
      exportedAt: new Date().toISOString(),
      version: VERSION
    };
  }

  /**
   * Format a number with commas. Falls back to simple impl if formatNumber is unavailable.
   * @param {number} n
   * @returns {string}
   */
  function _fmtNum(n) {
    if (typeof formatNumber === 'function') return formatNumber(n);
    return Math.round(n).toLocaleString();
  }

  // ---- Export Formatters ----

  /**
   * Export as JSON string.
   * @returns {string} Pretty-printed JSON
   */
  function exportJSON() {
    var data = _buildExportData();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export as YAML string (manual string construction, no library).
   * @returns {string} YAML-formatted config
   */
  function exportYAML() {
    var d = _buildExportData();
    var lines = [];

    lines.push('# Claude Context Window Configuration');
    lines.push('# Exported: ' + d.exportedAt);
    lines.push('');
    lines.push('model: "' + d.model + '"');
    lines.push('modelName: "' + d.modelName + '"');
    lines.push('contextWindow: ' + d.contextWindow);
    lines.push('outputLimit: ' + d.outputLimit);
    lines.push('');
    lines.push('tokens:');
    lines.push('  system: ' + d.tokens.system);
    lines.push('  user: ' + d.tokens.user);
    lines.push('  assistant: ' + d.tokens.assistant);
    lines.push('  tools: ' + d.tokens.tools);
    lines.push('');
    lines.push('usage:');
    lines.push('  totalUsed: ' + d.usage.totalUsed);
    lines.push('  percentage: ' + d.usage.percentage);
    lines.push('  remaining: ' + d.usage.remaining);
    lines.push('');
    lines.push('cost:');
    lines.push('  inputCostPerRequest: ' + d.cost.inputCostPerRequest);
    lines.push('  outputCostPerRequest: ' + d.cost.outputCostPerRequest);
    lines.push('  totalCostPerRequest: ' + d.cost.totalCostPerRequest);
    lines.push('  estimatedDailyCost: ' + d.cost.estimatedDailyCost);
    lines.push('');
    lines.push('exportedAt: "' + d.exportedAt + '"');
    lines.push('version: "' + d.version + '"');

    return lines.join('\n');
  }

  /**
   * Export as a human-readable Markdown report.
   * @returns {string} Markdown document
   */
  function exportMarkdown() {
    var d = _buildExportData();
    var totalUsed = d.usage.totalUsed;
    var contextWindow = d.contextWindow;
    var dailyCost = d.cost.estimatedDailyCost;
    var monthlyCost = parseFloat((dailyCost * 30).toFixed(2));

    // Calculate per-category percentages relative to total used
    var catPcts = {};
    CATEGORIES.forEach(function (cat) {
      catPcts[cat] = totalUsed > 0
        ? parseFloat(((d.tokens[cat] / totalUsed) * 100).toFixed(1))
        : 0;
    });

    // Context usage percentage
    var ctxPct = d.usage.percentage;

    // Friendly date string (YYYY-MM-DD)
    var dateStr = d.exportedAt.split('T')[0];

    var lines = [];

    lines.push('# Context Window Report');
    lines.push('');
    lines.push('**Model**: ' + d.modelName + ' (' + _fmtShort(contextWindow) + ' context)');
    lines.push('**Date**: ' + dateStr);
    lines.push('**Version**: ' + d.version);
    lines.push('');
    lines.push('## Token Allocation');
    lines.push('');
    lines.push('| Category  | Tokens    | % of Used  | % of Context |');
    lines.push('|-----------|-----------|------------|--------------|');

    var catLabels = { system: 'System', user: 'User', assistant: 'Assistant', tools: 'Tools' };
    CATEGORIES.forEach(function (cat) {
      var tokens = d.tokens[cat];
      var pctOfUsed = catPcts[cat] + '%';
      var pctOfCtx = contextWindow > 0
        ? ((tokens / contextWindow) * 100).toFixed(1) + '%'
        : '0.0%';
      lines.push(
        '| ' + _padRight(catLabels[cat], 9) +
        ' | ' + _padRight(_fmtNum(tokens), 9) +
        ' | ' + _padRight(pctOfUsed, 10) +
        ' | ' + _padRight(pctOfCtx, 12) + ' |'
      );
    });

    lines.push('');
    lines.push('**Total Used**: ' + _fmtNum(totalUsed) + ' / ' + _fmtNum(contextWindow) +
               ' (' + ctxPct + '%)');
    lines.push('**Remaining**: ' + _fmtNum(d.usage.remaining) + ' tokens');
    lines.push('');

    lines.push('## Cost Estimate');
    lines.push('');
    lines.push('- Per request: $' + d.cost.totalCostPerRequest.toFixed(4));
    lines.push('  - Input: $' + d.cost.inputCostPerRequest.toFixed(4));
    lines.push('  - Output: $' + d.cost.outputCostPerRequest.toFixed(4));
    lines.push('- Daily (100 req): $' + dailyCost.toFixed(4));
    lines.push('- Monthly: $' + monthlyCost.toFixed(2));
    lines.push('');

    lines.push('## Model Info');
    lines.push('');
    lines.push('| Property       | Value                |');
    lines.push('|----------------|----------------------|');
    lines.push('| Model ID       | ' + _padRight(d.model, 20) + ' |');
    lines.push('| Context Window | ' + _padRight(_fmtNum(contextWindow), 20) + ' |');
    lines.push('| Output Limit   | ' + _padRight(_fmtNum(d.outputLimit), 20) + ' |');
    lines.push('| Input Price    | ' +
               _padRight('$' + _getModel().pricing.inputPerMTok + '/MTok', 20) + ' |');
    lines.push('| Output Price   | ' +
               _padRight('$' + _getModel().pricing.outputPerMTok + '/MTok', 20) + ' |');
    lines.push('');

    lines.push('---');
    lines.push('*Generated by Claude Context Window Visualizer v' + d.version + '*');

    return lines.join('\n');
  }

  /**
   * Export as a Claude (Anthropic) API config snippet.
   * @returns {string} JSON snippet for Anthropic API call
   */
  function exportAPIConfig() {
    var d = _buildExportData();
    var model = _getModel();

    // Calculate a sensible max_tokens from the remaining context budget,
    // capped by the model's output limit
    var maxTokens = Math.min(d.usage.remaining, model.outputLimit);
    if (maxTokens <= 0) maxTokens = model.outputLimit;

    var config = {
      model: d.model,
      max_tokens: maxTokens,
      system: '// Your system prompt here (' + _fmtNum(d.tokens.system) + ' tokens allocated)',
      messages: [
        {
          role: 'user',
          content: '// Your user message here (' + _fmtNum(d.tokens.user) + ' tokens allocated)'
        }
      ],
      metadata: {
        context_budget: {
          context_window: d.contextWindow,
          allocated: {
            system: d.tokens.system,
            user: d.tokens.user,
            assistant: d.tokens.assistant,
            tools: d.tokens.tools
          },
          remaining: d.usage.remaining,
          usage_percentage: d.usage.percentage
        },
        cost_estimate: {
          per_request: '$' + d.cost.totalCostPerRequest.toFixed(4),
          daily_100_requests: '$' + d.cost.estimatedDailyCost.toFixed(4)
        },
        generated_by: 'Claude Context Window Visualizer v' + d.version,
        generated_at: d.exportedAt
      }
    };

    // Add tools field only if tool tokens are allocated
    if (d.tokens.tools > 0) {
      config.tools = [
        {
          name: 'example_tool',
          description: '// Define your tools here (' + _fmtNum(d.tokens.tools) + ' tokens allocated for tool schemas & calls)',
          input_schema: {
            type: 'object',
            properties: {}
          }
        }
      ];
    }

    return JSON.stringify(config, null, 2);
  }

  // ---- String Helpers ----

  /**
   * Pad a string to a minimum width on the right.
   * @param {string} str
   * @param {number} width
   * @returns {string}
   */
  function _padRight(str, width) {
    str = String(str);
    while (str.length < width) str += ' ';
    return str;
  }

  /**
   * Format tokens in short form: 200000 -> "200K", 1000000 -> "1M".
   * Falls back to formatTokensShort if available globally.
   * @param {number} n
   * @returns {string}
   */
  function _fmtShort(n) {
    if (typeof formatTokensShort === 'function') return formatTokensShort(n);
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
    return String(n);
  }

  // ---- DOM Building ----

  /**
   * Build the exporter UI inside the given container.
   * @param {HTMLElement} containerEl - The DOM element to populate
   */
  function _buildUI(containerEl) {
    containerEl.innerHTML = '';
    containerEl.className = 'cfg-exporter';

    // ---- Export Format Buttons ----
    var btnsRow = document.createElement('div');
    btnsRow.className = 'cfg-exporter__btns';

    var formats = [
      { id: 'json',     icon: '{ }',  label: 'JSON' },
      { id: 'yaml',     icon: '---',  label: 'YAML' },
      { id: 'markdown', icon: '#',    label: 'Markdown' },
      { id: 'api',      icon: '< >',  label: 'API Config' }
    ];

    formats.forEach(function (fmt) {
      var btn = document.createElement('button');
      btn.className = 'cfg-exporter__btn';
      btn.dataset.format = fmt.id;
      btn.setAttribute('aria-label', 'Export as ' + fmt.label);
      btn.innerHTML =
        '<span class="cfg-exporter__btn-icon" aria-hidden="true">' + fmt.icon + '</span>' +
        fmt.label;

      btn.addEventListener('click', function () {
        _handleFormatClick(fmt.id);
      });

      btnsRow.appendChild(btn);
    });

    containerEl.appendChild(btnsRow);

    // ---- Preview Area ----
    var previewWrap = document.createElement('div');
    previewWrap.className = 'cfg-exporter__preview-wrap';
    previewWrap.id = 'cfg-exporter-preview-wrap';

    // Action bar (label + copy/download buttons)
    var actionsBar = document.createElement('div');
    actionsBar.className = 'cfg-exporter__actions';

    var actionsLabel = document.createElement('span');
    actionsLabel.className = 'cfg-exporter__actions-label';
    actionsLabel.id = 'cfg-exporter-format-label';
    actionsLabel.textContent = '';

    var actionsBtns = document.createElement('div');
    actionsBtns.className = 'cfg-exporter__actions-btns';

    // Copy button
    var copyBtn = document.createElement('button');
    copyBtn.className = 'cfg-exporter__action-btn';
    copyBtn.id = 'cfg-exporter-copy-btn';
    copyBtn.innerHTML = '<span aria-hidden="true">📋</span> Copy';
    copyBtn.setAttribute('aria-label', 'Copy to clipboard');
    copyBtn.addEventListener('click', _handleCopy);

    // Download button
    var dlBtn = document.createElement('button');
    dlBtn.className = 'cfg-exporter__action-btn';
    dlBtn.id = 'cfg-exporter-download-btn';
    dlBtn.innerHTML = '<span aria-hidden="true">💾</span> Download';
    dlBtn.setAttribute('aria-label', 'Download as file');
    dlBtn.addEventListener('click', _handleDownload);

    actionsBtns.appendChild(copyBtn);
    actionsBtns.appendChild(dlBtn);
    actionsBar.appendChild(actionsLabel);
    actionsBar.appendChild(actionsBtns);
    previewWrap.appendChild(actionsBar);

    // Pre element for code preview
    var pre = document.createElement('pre');
    pre.className = 'cfg-exporter__pre';
    pre.id = 'cfg-exporter-pre';
    pre.setAttribute('tabindex', '0');
    _previewEl = pre;
    previewWrap.appendChild(pre);

    containerEl.appendChild(previewWrap);
  }

  // ---- Event Handlers ----

  /**
   * Handle clicking one of the 4 format buttons.
   * Generates the export string and shows the preview.
   * @param {string} format - 'json' | 'yaml' | 'markdown' | 'api'
   */
  function _handleFormatClick(format) {
    _currentFormat = format;

    // Generate output
    switch (format) {
      case 'json':     _currentOutput = exportJSON();      break;
      case 'yaml':     _currentOutput = exportYAML();      break;
      case 'markdown': _currentOutput = exportMarkdown();   break;
      case 'api':      _currentOutput = exportAPIConfig();  break;
      default:         _currentOutput = '';
    }

    // Update active button state
    var allBtns = _container.querySelectorAll('.cfg-exporter__btn');
    allBtns.forEach(function (btn) {
      btn.classList.toggle('cfg-exporter__btn--active', btn.dataset.format === format);
    });

    // Show preview
    var previewWrap = document.getElementById('cfg-exporter-preview-wrap');
    if (previewWrap) previewWrap.classList.add('cfg-exporter__preview-wrap--visible');

    // Update label
    var formatLabels = { json: 'JSON', yaml: 'YAML', markdown: 'MARKDOWN', api: 'API CONFIG' };
    var label = document.getElementById('cfg-exporter-format-label');
    if (label) label.textContent = formatLabels[format] || format.toUpperCase();

    // Update preview content
    if (_previewEl) _previewEl.textContent = _currentOutput;
  }

  /**
   * Copy the current export output to the clipboard.
   */
  function _handleCopy() {
    if (!_currentOutput) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(_currentOutput).then(function () {
        _showToast('Copied to clipboard!');
      }).catch(function () {
        _fallbackCopy(_currentOutput);
        _showToast('Copied to clipboard!');
      });
    } else {
      _fallbackCopy(_currentOutput);
      _showToast('Copied to clipboard!');
    }
  }

  /**
   * Fallback copy using a temporary textarea (for older browsers / non-HTTPS).
   * @param {string} text - The text to copy
   */
  function _fallbackCopy(text) {
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
  }

  /**
   * Download the current export output as a file.
   */
  function _handleDownload() {
    if (!_currentOutput || !_currentFormat) return;

    var model = _getModel();
    var ext = FORMAT_EXT[_currentFormat] || '.txt';
    var mime = FORMAT_MIME[_currentFormat] || 'text/plain';
    var filename = 'claude-config-' + model.id + '-' +
                   new Date().toISOString().slice(0, 10) + ext;

    var blob = new Blob([_currentOutput], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoke object URL after short delay to ensure download started
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    _showToast('Downloaded ' + filename);
  }

  /**
   * Show a green toast notification.
   * @param {string} message - The message to display
   */
  function _showToast(message) {
    // Remove any existing exporter toast
    var existing = document.querySelector('.cfg-exporter__toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'cfg-exporter__toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger enter animation on next frame
    requestAnimationFrame(function () {
      toast.classList.add('cfg-exporter__toast--visible');
    });

    // Auto-hide after 2.5 seconds
    setTimeout(function () {
      toast.classList.remove('cfg-exporter__toast--visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2500);
  }

  // ---- Public API ----

  /**
   * Initialize the Config Exporter and build the UI into the given container.
   * @param {string} containerId - The DOM element ID to render into
   * @param {Object} [options] - Optional initial data
   * @param {Object} [options.tokens] - Token allocation { system, user, assistant, tools }
   * @param {number} [options.modelIndex] - Index into CLAUDE_MODELS
   */
  function init(containerId, options) {
    if (_inited) return;

    var el = document.getElementById(containerId);
    if (!el) {
      console.warn('[ConfigExporter] Container not found: #' + containerId);
      return;
    }

    _injectCSS();

    _container = el;

    // Apply initial data if provided
    if (options) {
      if (options.tokens) {
        CATEGORIES.forEach(function (cat) {
          if (typeof options.tokens[cat] === 'number') {
            _tokens[cat] = options.tokens[cat];
          }
        });
      }
      if (typeof options.modelIndex === 'number') {
        _modelIndex = options.modelIndex;
      }
    }

    _buildUI(el);
    _inited = true;
  }

  /**
   * Update the exporter with new token data and model index.
   * Re-generates the current export if a format is already selected.
   * @param {Object} tokens - { system, user, assistant, tools }
   * @param {number} modelIndex - Index into CLAUDE_MODELS
   */
  function update(tokens, modelIndex) {
    if (tokens) {
      CATEGORIES.forEach(function (cat) {
        if (typeof tokens[cat] === 'number') {
          _tokens[cat] = tokens[cat];
        }
      });
    }
    if (typeof modelIndex === 'number') {
      _modelIndex = modelIndex;
    }

    // If a format is already selected, regenerate the preview
    if (_inited && _currentFormat) {
      _handleFormatClick(_currentFormat);
    }
  }

  /**
   * Check whether the module has been initialized.
   * @returns {boolean}
   */
  function isInited() {
    return _inited;
  }

  // ---- Module Export ----

  return {
    init: init,
    update: update,
    exportJSON: exportJSON,
    exportYAML: exportYAML,
    exportMarkdown: exportMarkdown,
    exportAPIConfig: exportAPIConfig,
    isInited: isInited
  };

})();

// Expose on window for global access
window.ConfigExporter = ConfigExporter;
