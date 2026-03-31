/**
 * Claude Context Window Visualizer — Token Calculator v1.0
 *
 * Enhanced text-to-token estimator with heuristic-based token counting.
 * Paste or type any text to get an estimated Claude token count.
 *
 * Features:
 * - Real-time heuristic token estimation (English, CJK, Code, Mixed)
 * - Statistics panel: characters, words, lines, estimated tokens, content type
 * - Cost estimation based on the currently selected model
 * - Context window percentage display
 * - Quick-apply buttons to push token count into System/User/Tools sliders
 * - Recent calculation history (last 5)
 * - Dark / light theme support via CSS variables
 * - Debounced input (300ms)
 * - Inline CSS injection
 *
 * API:  window.TokenCalculator = { init, calculate, getStats, isInited }
 */

'use strict';

var TokenCalculator = (function () {

  // ============================================================
  //  CONSTANTS
  // ============================================================

  var PREFIX = 'tc-';
  var STORAGE_KEY = 'claude-ctx-tok-calc-history';
  var MAX_HISTORY = 5;
  var DEBOUNCE_MS = 300;
  var TRUNCATE_LEN = 50;

  // Token estimation ratios
  var ENGLISH_CHARS_PER_TOKEN = 4;
  var CJK_CHARS_PER_TOKEN = 1.5;
  var CODE_CHARS_PER_TOKEN = 3;

  // Threshold for code detection: if code-symbol density > 5%, treat as code
  var CODE_SYMBOL_THRESHOLD = 0.05;

  // CJK Unicode ranges
  var CJK_REGEX = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u{20000}-\u{2FA1F}]/u;
  var CJK_GLOBAL_REGEX = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u{20000}-\u{2FA1F}]/gu;

  // Code symbol pattern (common in programming)
  var CODE_SYMBOLS_REGEX = /[{}()\[\];=<>|&!?:\/\\@#$%^~`]/g;

  // ============================================================
  //  STATE
  // ============================================================

  var _inited = false;
  var _container = null;
  var _debounceTimer = null;
  var _history = [];

  // DOM element references
  var _els = {};

  // ============================================================
  //  THEME DETECTION
  // ============================================================

  function _isDark() {
    return document.documentElement.classList.contains('dark') ||
           document.body.classList.contains('dark') ||
           document.documentElement.getAttribute('data-theme') === 'dark' ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ============================================================
  //  UTILITY HELPERS
  // ============================================================

  /** Format number with comma separators */
  function _fmt(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Create an HTML element with optional class and textContent */
  function _el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Get the currently selected model from the global model-select dropdown */
  function _getSelectedModel() {
    var sel = document.getElementById('model-select');
    if (sel && typeof CLAUDE_MODELS !== 'undefined' && CLAUDE_MODELS[parseInt(sel.value, 10)]) {
      return CLAUDE_MODELS[parseInt(sel.value, 10)];
    }
    if (typeof CLAUDE_MODELS !== 'undefined' && CLAUDE_MODELS.length > 0) {
      return CLAUDE_MODELS[0];
    }
    // Fallback
    return {
      name: 'Claude Sonnet 4.6',
      contextWindow: 1000000,
      pricing: { inputPerMTok: 3, outputPerMTok: 15 }
    };
  }

  // ============================================================
  //  TOAST NOTIFICATION
  // ============================================================

  function _toast(msg) {
    var el = _el('div', PREFIX + 'toast', msg);
    document.body.appendChild(el);
    // Force reflow then animate in
    void el.offsetWidth;
    el.classList.add(PREFIX + 'toast--visible');
    setTimeout(function () {
      el.classList.remove(PREFIX + 'toast--visible');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, 2000);
  }

  // ============================================================
  //  TOKEN ESTIMATION ALGORITHM
  // ============================================================

  /**
   * Analyze text content and return detailed token estimation stats.
   *
   * Heuristic rules:
   * - English text:  ~1 token per 4 characters (or ~0.75 words)
   * - CJK text:      ~1 token per 1.5 characters
   * - Code:          ~1 token per 3 characters (detected by symbol density)
   * - Mixed:         weighted average based on character-type proportions
   *
   * @param {string} text - The input text to analyze
   * @returns {object} Stats object
   */
  function calculate(text) {
    if (!text || text.length === 0) {
      return {
        characters: 0,
        words: 0,
        lines: 0,
        tokens: 0,
        type: 'Empty',
        cjkCount: 0,
        cjkRatio: 0,
        codeSymbolDensity: 0
      };
    }

    // Basic stats
    var characters = text.length;
    var words = text.trim() ? text.trim().split(/\s+/).length : 0;
    var lines = text.split(/\n/).length;

    // Count CJK characters
    var cjkMatches = text.match(CJK_GLOBAL_REGEX);
    var cjkCount = cjkMatches ? cjkMatches.length : 0;
    var cjkRatio = characters > 0 ? cjkCount / characters : 0;

    // Count code symbols for density check
    var codeMatches = text.match(CODE_SYMBOLS_REGEX);
    var codeSymbolCount = codeMatches ? codeMatches.length : 0;
    var nonSpaceChars = text.replace(/\s/g, '').length || 1;
    var codeSymbolDensity = codeSymbolCount / nonSpaceChars;

    // Determine content type
    var type = 'English';
    var isCode = codeSymbolDensity > CODE_SYMBOL_THRESHOLD;
    var isCJK = cjkRatio > 0.15;

    if (isCode && isCJK) {
      type = 'Mixed';
    } else if (isCode && cjkCount > 0) {
      type = 'Mixed';
    } else if (isCode) {
      type = 'Code';
    } else if (isCJK) {
      type = 'CJK';
    } else if (cjkRatio > 0.05) {
      type = 'Mixed';
    }

    // Estimate tokens using weighted character classification
    // Split characters into categories and compute tokens for each
    var cjkTokens = cjkCount / CJK_CHARS_PER_TOKEN;
    var remainingChars = characters - cjkCount;

    var tokens;
    if (isCode) {
      // Code-heavy text: non-CJK portion uses code ratio
      var codePortionChars = remainingChars;
      var codeTokens = codePortionChars / CODE_CHARS_PER_TOKEN;
      tokens = cjkTokens + codeTokens;
    } else {
      // Normal text: non-CJK portion uses English ratio
      var englishTokens = remainingChars / ENGLISH_CHARS_PER_TOKEN;
      tokens = cjkTokens + englishTokens;
    }

    // Round to nearest integer, minimum 1 if text is non-empty
    tokens = Math.max(1, Math.round(tokens));

    return {
      characters: characters,
      words: words,
      lines: lines,
      tokens: tokens,
      type: type,
      cjkCount: cjkCount,
      cjkRatio: cjkRatio,
      codeSymbolDensity: codeSymbolDensity
    };
  }

  // ============================================================
  //  HISTORY MANAGEMENT
  // ============================================================

  function _loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) _history = JSON.parse(raw);
    } catch (e) {
      _history = [];
    }
    if (!Array.isArray(_history)) _history = [];
  }

  function _saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_history));
    } catch (e) { /* ignore quota */ }
  }

  function _pushHistory(text, stats) {
    if (!text || !text.trim()) return;
    var snippet = text.length > TRUNCATE_LEN
      ? text.substring(0, TRUNCATE_LEN) + '…'
      : text;

    // Avoid duplicating the most recent entry
    if (_history.length > 0 && _history[0].snippet === snippet) {
      _history[0].tokens = stats.tokens;
      _history[0].type = stats.type;
      _saveHistory();
      return;
    }

    _history.unshift({
      snippet: snippet,
      fullText: text,
      tokens: stats.tokens,
      type: stats.type,
      timestamp: Date.now()
    });

    // Keep only MAX_HISTORY entries
    if (_history.length > MAX_HISTORY) {
      _history = _history.slice(0, MAX_HISTORY);
    }
    _saveHistory();
  }

  // ============================================================
  //  APPLY TO SLIDERS
  // ============================================================

  /**
   * Set a main-app slider value and fire its input event so app.js reacts.
   * @param {string} category - 'system' | 'user' | 'tools'
   * @param {number} tokens - Token count to set
   */
  function _applyToSlider(category, tokens) {
    var slider = document.getElementById('slider-' + category);
    var input = document.getElementById('input-' + category);
    var val = Math.max(0, Math.round(tokens));

    if (slider) {
      slider.value = val;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (input) {
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    _toast('Applied ' + _fmt(val) + ' tokens to ' + category.charAt(0).toUpperCase() + category.slice(1));
  }

  // ============================================================
  //  UI UPDATE
  // ============================================================

  /** Re-render all stat values and history list */
  function _updateUI(stats) {
    if (!_els.statChars) return;

    // Stat values
    _els.statChars.textContent = _fmt(stats.characters);
    _els.statWords.textContent = _fmt(stats.words);
    _els.statLines.textContent = _fmt(stats.lines);
    _els.statTokens.textContent = _fmt(stats.tokens);
    _els.statType.textContent = stats.type;

    // Type badge color
    var typeColors = { English: '#3B82F6', CJK: '#F59E0B', Code: '#10B981', Mixed: '#A855F7', Empty: '#6B7280' };
    _els.statType.style.background = (typeColors[stats.type] || '#6B7280') + '22';
    _els.statType.style.color = typeColors[stats.type] || '#6B7280';

    // Model-related info
    var model = _getSelectedModel();
    var pct = model.contextWindow > 0
      ? (stats.tokens / model.contextWindow * 100)
      : 0;
    _els.ctxPercent.textContent = pct.toFixed(2) + '%';
    _els.ctxModel.textContent = model.name;

    // Context bar fill
    var barPct = Math.min(pct, 100);
    _els.ctxBar.style.width = barPct + '%';
    _els.ctxBar.style.background = barPct > 80 ? '#EF4444' : barPct > 50 ? '#F59E0B' : '#8B5CF6';

    // Cost estimation
    var pricing = model.pricing || {};
    var costPerToken = (pricing.inputPerMTok || 3) / 1000000;
    var cost = stats.tokens * costPerToken;
    _els.costValue.textContent = '$' + cost.toFixed(4);
    _els.costDesc.textContent = 'as input to ' + model.name +
      ' (' + pct.toFixed(1) + '% of ' + _fmtCtx(model.contextWindow) + ' context)';

    // Enable/disable apply buttons
    var hasTokens = stats.tokens > 0;
    _els.btnApplySystem.disabled = !hasTokens;
    _els.btnApplyUser.disabled = !hasTokens;
    _els.btnApplyTools.disabled = !hasTokens;
  }

  /** Format context window size: 1000000 -> "1M", 200000 -> "200K" */
  function _fmtCtx(n) {
    if (n >= 1000000) return (n / 1000000) + 'M';
    if (n >= 1000) return (n / 1000) + 'K';
    return n.toString();
  }

  /** Rebuild the history list DOM */
  function _renderHistory() {
    if (!_els.historyList) return;
    _els.historyList.innerHTML = '';

    if (_history.length === 0) {
      var empty = _el('div', PREFIX + 'history-empty', 'No recent calculations');
      _els.historyList.appendChild(empty);
      return;
    }

    for (var i = 0; i < _history.length; i++) {
      (function (idx) {
        var entry = _history[idx];
        var item = _el('div', PREFIX + 'history-item');
        item.title = 'Click to restore this text';

        var snippet = _el('span', PREFIX + 'history-snippet', entry.snippet);
        var tokens = _el('span', PREFIX + 'history-tokens', _fmt(entry.tokens) + ' tokens');
        var badge = _el('span', PREFIX + 'history-type', entry.type);

        var typeColors = { English: '#3B82F6', CJK: '#F59E0B', Code: '#10B981', Mixed: '#A855F7' };
        badge.style.background = (typeColors[entry.type] || '#6B7280') + '22';
        badge.style.color = typeColors[entry.type] || '#6B7280';

        item.appendChild(snippet);
        item.appendChild(badge);
        item.appendChild(tokens);

        // Click to restore
        item.addEventListener('click', function () {
          if (_els.textarea && entry.fullText) {
            _els.textarea.value = entry.fullText;
            _onInput();
          }
        });

        _els.historyList.appendChild(item);
      })(i);
    }
  }

  // ============================================================
  //  INPUT HANDLER
  // ============================================================

  function _onInput() {
    var text = _els.textarea ? _els.textarea.value : '';
    var stats = calculate(text);
    _updateUI(stats);

    // Auto-grow textarea
    if (_els.textarea) {
      _els.textarea.style.height = 'auto';
      _els.textarea.style.height = Math.max(120, Math.min(_els.textarea.scrollHeight, 400)) + 'px';
    }
  }

  function _onInputDebounced() {
    var text = _els.textarea ? _els.textarea.value : '';
    var stats = calculate(text);
    _updateUI(stats);

    // Auto-grow textarea
    if (_els.textarea) {
      _els.textarea.style.height = 'auto';
      _els.textarea.style.height = Math.max(120, Math.min(_els.textarea.scrollHeight, 400)) + 'px';
    }

    // Push to history (debounced so we only record final resting state)
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      if (text.trim()) {
        _pushHistory(text, stats);
        _renderHistory();
      }
    }, DEBOUNCE_MS);
  }

  function _onClear() {
    if (_els.textarea) {
      _els.textarea.value = '';
      _els.textarea.style.height = '120px';
    }
    _updateUI(calculate(''));
  }

  // ============================================================
  //  CSS INJECTION
  // ============================================================

  function _injectCSS() {
    if (document.getElementById(PREFIX + 'styles')) return;

    var style = document.createElement('style');
    style.id = PREFIX + 'styles';
    style.textContent =
      // ---- Root variables ----
      '.' + PREFIX + 'root {' +
        '--tc-bg: rgba(255,255,255,0.03);' +
        '--tc-bg2: rgba(255,255,255,0.05);' +
        '--tc-bg3: rgba(255,255,255,0.08);' +
        '--tc-border: rgba(255,255,255,0.08);' +
        '--tc-border-focus: rgba(139,92,246,0.5);' +
        '--tc-text: var(--text-primary, #F1F0F5);' +
        '--tc-text2: var(--text-secondary, #9893A6);' +
        '--tc-accent: #8B5CF6;' +
        '--tc-accent-bg: rgba(139,92,246,0.12);' +
        '--tc-radius: 0.5rem;' +
        'font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif;' +
        'color: var(--tc-text);' +
      '}' +

      // Light theme overrides
      ':root[data-theme="light"] .' + PREFIX + 'root,' +
      '.' + PREFIX + 'root.tc-light {' +
        '--tc-bg: rgba(0,0,0,0.02);' +
        '--tc-bg2: rgba(0,0,0,0.04);' +
        '--tc-bg3: rgba(0,0,0,0.06);' +
        '--tc-border: rgba(0,0,0,0.1);' +
        '--tc-border-focus: rgba(139,92,246,0.5);' +
        '--tc-text: var(--text-primary, #1A1A2E);' +
        '--tc-text2: var(--text-secondary, #555566);' +
      '}' +

      // ---- Layout ----
      '.' + PREFIX + 'layout {' +
        'display: flex; flex-direction: column; gap: 1rem;' +
      '}' +

      // ---- Textarea Area ----
      '.' + PREFIX + 'input-area {' +
        'position: relative;' +
      '}' +

      '.' + PREFIX + 'textarea {' +
        'width: 100%; min-height: 120px; max-height: 400px; padding: 0.75rem;' +
        'border: 1px solid var(--tc-border); border-radius: var(--tc-radius);' +
        'background: var(--tc-bg); color: var(--tc-text);' +
        'font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace;' +
        'font-size: 0.85rem; line-height: 1.6; resize: vertical;' +
        'transition: border-color 0.2s ease; box-sizing: border-box;' +
        'outline: none;' +
      '}' +
      '.' + PREFIX + 'textarea:focus {' +
        'border-color: var(--tc-border-focus);' +
        'box-shadow: 0 0 0 3px rgba(139,92,246,0.1);' +
      '}' +
      '.' + PREFIX + 'textarea::placeholder {' +
        'color: var(--tc-text2); opacity: 0.6;' +
      '}' +

      // Clear button
      '.' + PREFIX + 'clear-btn {' +
        'position: absolute; top: 0.5rem; right: 0.5rem;' +
        'padding: 0.25rem 0.6rem; border: 1px solid var(--tc-border);' +
        'border-radius: 0.35rem; background: var(--tc-bg2);' +
        'color: var(--tc-text2); font-size: 0.72rem; cursor: pointer;' +
        'transition: all 0.2s ease; opacity: 0.7;' +
      '}' +
      '.' + PREFIX + 'clear-btn:hover {' +
        'opacity: 1; background: var(--tc-bg3); color: var(--tc-text);' +
      '}' +

      // ---- Stats Grid ----
      '.' + PREFIX + 'stats {' +
        'display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));' +
        'gap: 0.6rem;' +
      '}' +

      '.' + PREFIX + 'stat-card {' +
        'padding: 0.65rem 0.75rem; border-radius: var(--tc-radius);' +
        'background: var(--tc-bg); border: 1px solid var(--tc-border);' +
        'text-align: center; transition: border-color 0.2s ease;' +
      '}' +
      '.' + PREFIX + 'stat-card:hover {' +
        'border-color: rgba(139,92,246,0.3);' +
      '}' +

      '.' + PREFIX + 'stat-card--main {' +
        'grid-column: 1 / -1; padding: 1rem;' +
        'background: var(--tc-accent-bg); border-color: rgba(139,92,246,0.25);' +
      '}' +
      '.' + PREFIX + 'stat-card--main .' + PREFIX + 'stat-value {' +
        'font-size: 2.2rem; color: var(--tc-accent);' +
      '}' +

      '.' + PREFIX + 'stat-label {' +
        'font-size: 0.7rem; font-weight: 600; text-transform: uppercase;' +
        'letter-spacing: 0.05em; color: var(--tc-text2); margin-bottom: 0.25rem;' +
      '}' +
      '.' + PREFIX + 'stat-value {' +
        'font-size: 1.2rem; font-weight: 700;' +
        'font-variant-numeric: tabular-nums; color: var(--tc-text);' +
      '}' +

      // Type badge
      '.' + PREFIX + 'type-badge {' +
        'display: inline-block; padding: 0.15rem 0.5rem;' +
        'border-radius: 1rem; font-size: 0.72rem; font-weight: 600;' +
      '}' +

      // ---- Context Bar ----
      '.' + PREFIX + 'ctx-section {' +
        'padding: 0.75rem; border-radius: var(--tc-radius);' +
        'background: var(--tc-bg); border: 1px solid var(--tc-border);' +
      '}' +
      '.' + PREFIX + 'ctx-header {' +
        'display: flex; justify-content: space-between; align-items: center;' +
        'margin-bottom: 0.5rem; font-size: 0.8rem;' +
      '}' +
      '.' + PREFIX + 'ctx-percent {' +
        'font-weight: 700; font-size: 1rem; color: var(--tc-accent);' +
        'font-variant-numeric: tabular-nums;' +
      '}' +
      '.' + PREFIX + 'ctx-model {' +
        'color: var(--tc-text2); font-size: 0.75rem;' +
      '}' +
      '.' + PREFIX + 'ctx-bar-bg {' +
        'height: 8px; border-radius: 4px; background: var(--tc-bg3);' +
        'overflow: hidden;' +
      '}' +
      '.' + PREFIX + 'ctx-bar {' +
        'height: 100%; border-radius: 4px; transition: width 0.4s ease, background 0.3s ease;' +
        'background: var(--tc-accent); min-width: 0;' +
      '}' +

      // ---- Cost Section ----
      '.' + PREFIX + 'cost-section {' +
        'padding: 0.75rem; border-radius: var(--tc-radius);' +
        'background: var(--tc-bg); border: 1px solid var(--tc-border);' +
        'text-align: center;' +
      '}' +
      '.' + PREFIX + 'cost-value {' +
        'font-size: 1.3rem; font-weight: 700; color: #10B981;' +
        'font-variant-numeric: tabular-nums;' +
      '}' +
      '.' + PREFIX + 'cost-desc {' +
        'font-size: 0.72rem; color: var(--tc-text2); margin-top: 0.2rem;' +
      '}' +

      // ---- Apply Buttons ----
      '.' + PREFIX + 'apply-row {' +
        'display: flex; gap: 0.5rem; flex-wrap: wrap;' +
      '}' +
      '.' + PREFIX + 'apply-btn {' +
        'flex: 1; min-width: 0; padding: 0.5rem 0.75rem;' +
        'border: 1px solid var(--tc-border); border-radius: var(--tc-radius);' +
        'background: var(--tc-bg2); color: var(--tc-text2);' +
        'font-size: 0.78rem; font-weight: 600; cursor: pointer;' +
        'transition: all 0.2s ease; white-space: nowrap;' +
      '}' +
      '.' + PREFIX + 'apply-btn:hover:not(:disabled) {' +
        'background: var(--tc-accent-bg); color: var(--tc-accent);' +
        'border-color: rgba(139,92,246,0.4);' +
      '}' +
      '.' + PREFIX + 'apply-btn:disabled {' +
        'opacity: 0.35; cursor: not-allowed;' +
      '}' +
      '.' + PREFIX + 'apply-btn--system { --btn-cat-color: #8B5CF6; }' +
      '.' + PREFIX + 'apply-btn--user   { --btn-cat-color: #3B82F6; }' +
      '.' + PREFIX + 'apply-btn--tools  { --btn-cat-color: #F59E0B; }' +
      '.' + PREFIX + 'apply-btn:hover:not(:disabled).' + PREFIX + 'apply-btn--system {' +
        'border-color: rgba(139,92,246,0.4); color: #8B5CF6; background: rgba(139,92,246,0.1);' +
      '}' +
      '.' + PREFIX + 'apply-btn:hover:not(:disabled).' + PREFIX + 'apply-btn--user {' +
        'border-color: rgba(59,130,246,0.4); color: #3B82F6; background: rgba(59,130,246,0.1);' +
      '}' +
      '.' + PREFIX + 'apply-btn:hover:not(:disabled).' + PREFIX + 'apply-btn--tools {' +
        'border-color: rgba(245,158,11,0.4); color: #F59E0B; background: rgba(245,158,11,0.1);' +
      '}' +

      // ---- History Section ----
      '.' + PREFIX + 'history {' +
        'margin-top: 0.25rem;' +
      '}' +
      '.' + PREFIX + 'history-title {' +
        'font-size: 0.75rem; font-weight: 600; text-transform: uppercase;' +
        'letter-spacing: 0.05em; color: var(--tc-text2); margin-bottom: 0.5rem;' +
      '}' +
      '.' + PREFIX + 'history-list {' +
        'display: flex; flex-direction: column; gap: 0.35rem;' +
      '}' +
      '.' + PREFIX + 'history-item {' +
        'display: flex; align-items: center; gap: 0.5rem;' +
        'padding: 0.45rem 0.65rem; border-radius: var(--tc-radius);' +
        'background: var(--tc-bg); border: 1px solid var(--tc-border);' +
        'cursor: pointer; transition: all 0.2s ease; min-width: 0;' +
      '}' +
      '.' + PREFIX + 'history-item:hover {' +
        'background: var(--tc-bg2); border-color: rgba(139,92,246,0.3);' +
      '}' +
      '.' + PREFIX + 'history-snippet {' +
        'flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;' +
        'white-space: nowrap; font-size: 0.78rem; color: var(--tc-text);' +
        'font-family: "SF Mono", "Fira Code", Consolas, monospace;' +
      '}' +
      '.' + PREFIX + 'history-type {' +
        'flex-shrink: 0; display: inline-block; padding: 0.1rem 0.4rem;' +
        'border-radius: 0.8rem; font-size: 0.65rem; font-weight: 600;' +
      '}' +
      '.' + PREFIX + 'history-tokens {' +
        'flex-shrink: 0; font-size: 0.75rem; font-weight: 600;' +
        'color: var(--tc-accent); font-variant-numeric: tabular-nums;' +
        'white-space: nowrap;' +
      '}' +
      '.' + PREFIX + 'history-empty {' +
        'font-size: 0.78rem; color: var(--tc-text2); font-style: italic;' +
        'padding: 0.5rem 0;' +
      '}' +

      // ---- Toast ----
      '.' + PREFIX + 'toast {' +
        'position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%) translateY(20px);' +
        'padding: 0.55rem 1.2rem; border-radius: 0.5rem;' +
        'background: rgba(139,92,246,0.9); color: #fff; font-size: 0.8rem;' +
        'font-weight: 600; opacity: 0; transition: all 0.3s ease;' +
        'pointer-events: none; z-index: 10000;' +
        'backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);' +
      '}' +
      '.' + PREFIX + 'toast--visible {' +
        'opacity: 1; transform: translateX(-50%) translateY(0);' +
      '}' +

      // ---- Responsive ----
      '@media (max-width: 600px) {' +
        '.' + PREFIX + 'stats { grid-template-columns: repeat(2, 1fr); }' +
        '.' + PREFIX + 'stat-card--main { grid-column: 1 / -1; }' +
        '.' + PREFIX + 'apply-row { flex-direction: column; }' +
      '}';

    document.head.appendChild(style);
  }

  // ============================================================
  //  DOM BUILD
  // ============================================================

  function _buildDOM(containerId) {
    _container = document.getElementById(containerId);
    if (!_container) return;

    var root = _el('div', PREFIX + 'root');

    // Apply light class if needed
    if (!_isDark()) root.classList.add('tc-light');

    var layout = _el('div', PREFIX + 'layout');

    // ---- 1. Text input area ----
    var inputArea = _el('div', PREFIX + 'input-area');

    var textarea = document.createElement('textarea');
    textarea.className = PREFIX + 'textarea';
    textarea.placeholder = 'Paste or type text here to estimate token count…\n\nSupports English, Chinese/Japanese/Korean, code, and mixed content.';
    textarea.setAttribute('aria-label', 'Text input for token estimation');
    textarea.spellcheck = false;
    _els.textarea = textarea;

    var clearBtn = _el('button', PREFIX + 'clear-btn', '✕ Clear');
    clearBtn.title = 'Clear text';
    clearBtn.setAttribute('aria-label', 'Clear text input');
    _els.clearBtn = clearBtn;

    inputArea.appendChild(textarea);
    inputArea.appendChild(clearBtn);
    layout.appendChild(inputArea);

    // ---- 2. Main token stat (large) ----
    var statsGrid = _el('div', PREFIX + 'stats');

    var mainCard = _el('div', PREFIX + 'stat-card ' + PREFIX + 'stat-card--main');
    var mainLabel = _el('div', PREFIX + 'stat-label', 'Estimated Tokens');
    var mainValue = _el('div', PREFIX + 'stat-value', '0');
    _els.statTokens = mainValue;
    mainCard.appendChild(mainLabel);
    mainCard.appendChild(mainValue);
    statsGrid.appendChild(mainCard);

    // Smaller stat cards
    var smallStats = [
      { key: 'statChars', label: 'Characters' },
      { key: 'statWords', label: 'Words' },
      { key: 'statLines', label: 'Lines' },
      { key: 'statTypeCard', label: 'Content Type' }
    ];

    for (var i = 0; i < smallStats.length; i++) {
      var card = _el('div', PREFIX + 'stat-card');
      var label = _el('div', PREFIX + 'stat-label', smallStats[i].label);
      card.appendChild(label);

      if (smallStats[i].key === 'statTypeCard') {
        var typeBadge = _el('span', PREFIX + 'type-badge', 'Empty');
        _els.statType = typeBadge;
        typeBadge.style.background = 'rgba(107,114,128,0.13)';
        typeBadge.style.color = '#6B7280';
        card.appendChild(typeBadge);
      } else {
        var val = _el('div', PREFIX + 'stat-value', '0');
        _els[smallStats[i].key] = val;
        card.appendChild(val);
      }
      statsGrid.appendChild(card);
    }
    layout.appendChild(statsGrid);

    // ---- 3. Context window bar ----
    var ctxSection = _el('div', PREFIX + 'ctx-section');
    var ctxHeader = _el('div', PREFIX + 'ctx-header');

    var ctxLeft = _el('span');
    var ctxPercent = _el('span', PREFIX + 'ctx-percent', '0.00%');
    _els.ctxPercent = ctxPercent;
    ctxLeft.appendChild(document.createTextNode('Context usage: '));
    ctxLeft.appendChild(ctxPercent);

    var ctxModel = _el('span', PREFIX + 'ctx-model', '');
    _els.ctxModel = ctxModel;

    ctxHeader.appendChild(ctxLeft);
    ctxHeader.appendChild(ctxModel);
    ctxSection.appendChild(ctxHeader);

    var barBg = _el('div', PREFIX + 'ctx-bar-bg');
    var bar = _el('div', PREFIX + 'ctx-bar');
    bar.style.width = '0%';
    _els.ctxBar = bar;
    barBg.appendChild(bar);
    ctxSection.appendChild(barBg);
    layout.appendChild(ctxSection);

    // ---- 4. Cost estimation ----
    var costSection = _el('div', PREFIX + 'cost-section');
    var costLabel = _el('div', PREFIX + 'stat-label', 'Estimated Input Cost');
    var costValue = _el('div', PREFIX + 'cost-value', '$0.0000');
    _els.costValue = costValue;
    var costDesc = _el('div', PREFIX + 'cost-desc', '');
    _els.costDesc = costDesc;
    costSection.appendChild(costLabel);
    costSection.appendChild(costValue);
    costSection.appendChild(costDesc);
    layout.appendChild(costSection);

    // ---- 5. Apply buttons ----
    var applyRow = _el('div', PREFIX + 'apply-row');

    var btnSystem = _el('button', PREFIX + 'apply-btn ' + PREFIX + 'apply-btn--system', '⚙️ Apply as System');
    btnSystem.title = 'Set this token count on the System Prompt slider';
    _els.btnApplySystem = btnSystem;

    var btnUser = _el('button', PREFIX + 'apply-btn ' + PREFIX + 'apply-btn--user', '👤 Apply as User');
    btnUser.title = 'Set this token count on the User Messages slider';
    _els.btnApplyUser = btnUser;

    var btnTools = _el('button', PREFIX + 'apply-btn ' + PREFIX + 'apply-btn--tools', '🔧 Apply as Tools');
    btnTools.title = 'Set this token count on the Tool Use slider';
    _els.btnApplyTools = btnTools;

    applyRow.appendChild(btnSystem);
    applyRow.appendChild(btnUser);
    applyRow.appendChild(btnTools);
    layout.appendChild(applyRow);

    // ---- 6. History ----
    var historySection = _el('div', PREFIX + 'history');
    var historyTitle = _el('div', PREFIX + 'history-title', 'Recent Calculations');
    var historyList = _el('div', PREFIX + 'history-list');
    _els.historyList = historyList;

    historySection.appendChild(historyTitle);
    historySection.appendChild(historyList);
    layout.appendChild(historySection);

    // Assemble
    root.appendChild(layout);
    _container.appendChild(root);

    // Store root for theme updates
    _els.root = root;
  }

  // ============================================================
  //  EVENT BINDING
  // ============================================================

  function _bindEvents() {
    if (!_els.textarea) return;

    // Real-time input with debounced history push
    _els.textarea.addEventListener('input', _onInputDebounced);

    // Also handle paste — force immediate recalc
    _els.textarea.addEventListener('paste', function () {
      // Paste content arrives after the event, so defer slightly
      setTimeout(_onInputDebounced, 10);
    });

    // Clear button
    if (_els.clearBtn) {
      _els.clearBtn.addEventListener('click', _onClear);
    }

    // Apply buttons
    _els.btnApplySystem.addEventListener('click', function () {
      var stats = calculate(_els.textarea.value || '');
      _applyToSlider('system', stats.tokens);
    });

    _els.btnApplyUser.addEventListener('click', function () {
      var stats = calculate(_els.textarea.value || '');
      _applyToSlider('user', stats.tokens);
    });

    _els.btnApplyTools.addEventListener('click', function () {
      var stats = calculate(_els.textarea.value || '');
      _applyToSlider('tools', stats.tokens);
    });

    // Watch for model changes so cost/context updates in real time
    var modelSelect = document.getElementById('model-select');
    if (modelSelect) {
      modelSelect.addEventListener('change', function () {
        _onInput();
      });
    }

    // Watch for theme changes
    var observer = new MutationObserver(function () {
      if (_els.root) {
        if (_isDark()) {
          _els.root.classList.remove('tc-light');
        } else {
          _els.root.classList.add('tc-light');
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  /**
   * Initialize the Token Calculator module.
   * @param {string} containerId - The DOM id of the container element
   */
  function init(containerId) {
    if (_inited) return;

    _injectCSS();
    _buildDOM(containerId);
    _loadHistory();
    _renderHistory();
    _bindEvents();

    // Initial render with empty state
    _updateUI(calculate(''));

    _inited = true;
  }

  /**
   * Get current stats from the textarea content.
   * @returns {object} Stats object from calculate()
   */
  function getStats() {
    var text = (_els.textarea && _els.textarea.value) || '';
    return calculate(text);
  }

  /**
   * Check if the module has been initialized.
   * @returns {boolean}
   */
  function isInited() {
    return _inited;
  }

  // ---- Expose public API on window ----
  return {
    init: init,
    calculate: calculate,
    getStats: getStats,
    isInited: isInited
  };

})();

// Attach to window for global access
window.TokenCalculator = TokenCalculator;
