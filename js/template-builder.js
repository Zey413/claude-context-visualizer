/**
 * Claude Context Window Visualizer — Custom Template Builder v1.0
 * Lets users create, save, edit, delete, apply, share, and export
 * custom token-allocation templates (presets) with live donut-chart preview.
 *
 * Features:
 * - Template creation form (name, icon, description, 4 sliders, % / absolute mode)
 * - Live SVG donut preview while editing
 * - Save up to 10 custom templates in localStorage
 * - Card-grid list with edit / delete / apply / share / export actions
 * - Drag-and-drop reorder
 * - Apply to main gauge via slider value + input event dispatch
 * - Share via URL (URLSearchParams) or JSON export
 * - Dark / light theme support via CSS variables
 *
 * API:  window.TemplateBuilder = { init, getTemplates, applyTemplate, isInited }
 */

'use strict';

var TemplateBuilder = (function () {

  // ============================================================
  //  CONSTANTS
  // ============================================================

  var STORAGE_KEY = 'claude-ctx-custom-templates';
  var MAX_TEMPLATES = 10;

  var CATEGORIES = ['system', 'user', 'assistant', 'tools'];
  var CAT_LABELS = { system: 'System', user: 'User', assistant: 'Assistant', tools: 'Tools' };
  var CAT_COLORS = { system: '#8B5CF6', user: '#3B82F6', assistant: '#10B981', tools: '#F59E0B' };

  var ICON_CHOICES = [
    '\uD83D\uDCBB', // 💻
    '\uD83D\uDCCA', // 📊
    '\uD83C\uDFA7', // 🎧
    '\u270D\uFE0F', // ✍️
    '\uD83D\uDD0D', // 🔍
    '\uD83E\uDD16', // 🤖
    '\uD83D\uDCC4', // 📄
    '\uD83D\uDEE0\uFE0F', // 🛠️
    '\uD83C\uDFAE', // 🎮
    '\uD83C\uDFE5', // 🏥
    '\uD83D\uDCDA', // 📚
    '\uD83C\uDFAF'  // 🎯
  ];

  // SVG donut geometry
  var DONUT_SIZE = 140;
  var DONUT_RADIUS = 52;
  var DONUT_STROKE = 18;
  var DONUT_CIRCUM = 2 * Math.PI * DONUT_RADIUS;

  // ============================================================
  //  STATE
  // ============================================================

  var _inited = false;
  var _container = null;

  // Current form state
  var _form = {
    id: null,               // null = new, string = editing existing
    name: '',
    icon: ICON_CHOICES[0],
    description: '',
    mode: 'percent',        // 'percent' | 'absolute'
    values: { system: 25, user: 25, assistant: 25, tools: 25 },   // percent
    absValues: { system: 5000, user: 5000, assistant: 5000, tools: 5000 }  // absolute
  };

  // Saved templates
  var _templates = [];

  // Drag-and-drop state
  var _dragSrcIndex = null;

  // DOM references (populated during build)
  var _els = {};

  // ============================================================
  //  CSS INJECTION
  // ============================================================

  var _cssInjected = false;

  function _injectCSS() {
    if (_cssInjected) return;
    _cssInjected = true;

    var style = document.createElement('style');
    style.id = 'template-builder-styles';
    style.textContent =
      // ---- Container ----
      '.tb { font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif; color: var(--text-primary, #F1F0F5); }' +

      // ---- Form layout ----
      '.tb__form-area { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }' +
      '.tb__form-left { flex: 1 1 340px; min-width: 0; }' +
      '.tb__form-right { flex: 0 0 180px; display: flex; align-items: center; justify-content: center; }' +

      // ---- Form rows ----
      '.tb__row { margin-bottom: 0.75rem; }' +
      '.tb__label { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; ' +
        'color: var(--text-secondary, #9893A6); margin-bottom: 0.3rem; }' +
      '.tb__input { width: 100%; padding: 0.5rem 0.7rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.1); ' +
        'background: rgba(255,255,255,0.04); color: var(--text-primary, #F1F0F5); font-size: 0.85rem; outline: none; ' +
        'transition: border-color 0.2s; box-sizing: border-box; }' +
      '.tb__input:focus { border-color: rgba(139,92,246,0.5); }' +
      '.tb__input::placeholder { color: var(--text-secondary, #9893A6); opacity: 0.6; }' +

      // ---- Icon picker ----
      '.tb__icons { display: flex; flex-wrap: wrap; gap: 0.35rem; }' +
      '.tb__icon-btn { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; ' +
        'border-radius: 0.4rem; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); ' +
        'font-size: 1.1rem; cursor: pointer; transition: all 0.15s; }' +
      '.tb__icon-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); }' +
      '.tb__icon-btn--active { background: rgba(139,92,246,0.2); border-color: rgba(139,92,246,0.5); box-shadow: 0 0 6px rgba(139,92,246,0.25); }' +

      // ---- Mode toggle ----
      '.tb__mode-toggle { display: inline-flex; border-radius: 0.4rem; border: 1px solid rgba(255,255,255,0.1); overflow: hidden; margin-bottom: 0.5rem; }' +
      '.tb__mode-btn { padding: 0.35rem 0.75rem; font-size: 0.75rem; font-weight: 600; border: none; cursor: pointer; ' +
        'background: rgba(255,255,255,0.03); color: var(--text-secondary, #9893A6); transition: all 0.15s; }' +
      '.tb__mode-btn:hover { background: rgba(255,255,255,0.07); }' +
      '.tb__mode-btn--active { background: rgba(139,92,246,0.2); color: #C084FC; }' +

      // ---- Slider rows ----
      '.tb__slider-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.55rem; }' +
      '.tb__slider-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }' +
      '.tb__slider-name { width: 64px; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary, #9893A6); flex-shrink: 0; }' +
      '.tb__slider { flex: 1; -webkit-appearance: none; appearance: none; height: 6px; border-radius: 3px; ' +
        'background: rgba(255,255,255,0.08); outline: none; transition: background 0.2s; }' +
      '.tb__slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; ' +
        'border-radius: 50%; background: var(--thumb-color, #8B5CF6); cursor: pointer; border: 2px solid rgba(0,0,0,0.3); }' +
      '.tb__slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--thumb-color, #8B5CF6); ' +
        'cursor: pointer; border: 2px solid rgba(0,0,0,0.3); }' +
      '.tb__slider-val { width: 60px; text-align: right; font-size: 0.8rem; font-variant-numeric: tabular-nums; ' +
        'color: var(--text-primary, #F1F0F5); font-weight: 500; }' +
      '.tb__slider-input { width: 72px; padding: 0.25rem 0.4rem; border-radius: 0.35rem; border: 1px solid rgba(255,255,255,0.1); ' +
        'background: rgba(255,255,255,0.04); color: var(--text-primary, #F1F0F5); font-size: 0.78rem; text-align: right; ' +
        'outline: none; box-sizing: border-box; font-variant-numeric: tabular-nums; }' +
      '.tb__slider-input:focus { border-color: rgba(139,92,246,0.5); }' +

      // ---- Total warning ----
      '.tb__total-row { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; ' +
        'font-size: 0.78rem; font-weight: 600; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 0.25rem; }' +
      '.tb__total-val { font-variant-numeric: tabular-nums; }' +
      '.tb__total-val--over { color: #F87171; }' +
      '.tb__total-val--ok { color: #34D399; }' +

      // ---- SVG donut ----
      '.tb__donut-wrap { position: relative; width: ' + DONUT_SIZE + 'px; height: ' + DONUT_SIZE + 'px; }' +
      '.tb__donut-svg { transform: rotate(-90deg); }' +
      '.tb__donut-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); text-align: center; }' +
      '.tb__donut-icon { font-size: 1.6rem; line-height: 1; display: block; }' +
      '.tb__donut-label { font-size: 0.6rem; color: var(--text-secondary, #9893A6); margin-top: 2px; }' +

      // ---- Action buttons ----
      '.tb__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }' +
      '.tb__btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.5rem 1rem; border-radius: 0.5rem; ' +
        'border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: var(--text-secondary, #9893A6); ' +
        'font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }' +
      '.tb__btn:hover { background: rgba(255,255,255,0.08); color: var(--text-primary, #F1F0F5); border-color: rgba(255,255,255,0.2); }' +
      '.tb__btn--primary { background: rgba(139,92,246,0.18); color: #C084FC; border-color: rgba(139,92,246,0.4); }' +
      '.tb__btn--primary:hover { background: rgba(139,92,246,0.3); }' +
      '.tb__btn--danger { color: #F87171; border-color: rgba(239,68,68,0.3); }' +
      '.tb__btn--danger:hover { background: rgba(239,68,68,0.12); }' +
      '.tb__btn:disabled { opacity: 0.4; cursor: not-allowed; }' +

      // ---- Saved templates grid ----
      '.tb__list-title { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; ' +
        'color: var(--text-secondary, #9893A6); margin-bottom: 0.75rem; }' +
      '.tb__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }' +

      // ---- Template card ----
      '.tb__card { position: relative; padding: 0.85rem 1rem; border-radius: 0.65rem; ' +
        'border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); ' +
        'transition: all 0.2s; cursor: default; }' +
      '.tb__card:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); }' +
      '.tb__card--dragging { opacity: 0.5; transform: scale(0.97); }' +
      '.tb__card--dragover { border-color: rgba(139,92,246,0.6); background: rgba(139,92,246,0.08); }' +
      '.tb__card-head { display: flex; align-items: flex-start; gap: 0.6rem; margin-bottom: 0.5rem; }' +
      '.tb__card-icon { font-size: 1.5rem; line-height: 1; flex-shrink: 0; cursor: grab; }' +
      '.tb__card-icon:active { cursor: grabbing; }' +
      '.tb__card-info { flex: 1; min-width: 0; }' +
      '.tb__card-name { font-size: 0.85rem; font-weight: 700; color: var(--text-primary, #F1F0F5); ' +
        'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
      '.tb__card-desc { font-size: 0.72rem; color: var(--text-secondary, #9893A6); margin-top: 2px; ' +
        'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +

      // ---- Token bar in card ----
      '.tb__card-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 0.55rem; ' +
        'background: rgba(255,255,255,0.06); }' +
      '.tb__card-seg { transition: width 0.3s ease; }' +

      // ---- Card buttons ----
      '.tb__card-btns { display: flex; gap: 0.35rem; flex-wrap: wrap; }' +
      '.tb__card-btn { padding: 0.28rem 0.55rem; border-radius: 0.35rem; border: 1px solid rgba(255,255,255,0.08); ' +
        'background: rgba(255,255,255,0.03); color: var(--text-secondary, #9893A6); font-size: 0.7rem; font-weight: 600; ' +
        'cursor: pointer; transition: all 0.15s; }' +
      '.tb__card-btn:hover { background: rgba(255,255,255,0.08); color: var(--text-primary, #F1F0F5); }' +
      '.tb__card-btn--apply { color: #34D399; border-color: rgba(16,185,129,0.3); }' +
      '.tb__card-btn--apply:hover { background: rgba(16,185,129,0.12); }' +
      '.tb__card-btn--apply-active { background: rgba(16,185,129,0.18); color: #6EE7B7; border-color: rgba(16,185,129,0.5); }' +
      '.tb__card-btn--edit { color: #60A5FA; border-color: rgba(59,130,246,0.3); }' +
      '.tb__card-btn--edit:hover { background: rgba(59,130,246,0.12); }' +
      '.tb__card-btn--del { color: #F87171; border-color: rgba(239,68,68,0.2); }' +
      '.tb__card-btn--del:hover { background: rgba(239,68,68,0.12); }' +

      // ---- Empty state ----
      '.tb__empty { text-align: center; padding: 2rem 1rem; color: var(--text-secondary, #9893A6); font-size: 0.85rem; ' +
        'border: 1px dashed rgba(255,255,255,0.1); border-radius: 0.65rem; }' +
      '.tb__empty-icon { font-size: 2rem; display: block; margin-bottom: 0.5rem; }' +

      // ---- Toast notification ----
      '.tb__toast { position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%) translateY(20px); ' +
        'padding: 0.55rem 1.1rem; border-radius: 0.5rem; background: rgba(16,185,129,0.9); color: #fff; font-size: 0.8rem; ' +
        'font-weight: 600; z-index: 10001; pointer-events: none; opacity: 0; transition: all 0.3s ease; }' +
      '.tb__toast--visible { opacity: 1; transform: translateX(-50%) translateY(0); }' +

      // ---- Separator ----
      '.tb__sep { border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 1rem 0; }' +

      // ---- Light theme overrides ----
      '@media (prefers-color-scheme: light) {' +
        '.tb__input { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12); color: #1e1b2e; }' +
        '.tb__input::placeholder { color: #7c7a85; }' +
        '.tb__icon-btn { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.1); }' +
        '.tb__icon-btn:hover { background: rgba(0,0,0,0.06); }' +
        '.tb__icon-btn--active { background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.4); }' +
        '.tb__mode-btn { background: rgba(0,0,0,0.02); color: #7c7a85; }' +
        '.tb__mode-btn:hover { background: rgba(0,0,0,0.06); }' +
        '.tb__mode-btn--active { background: rgba(139,92,246,0.12); color: #7C3AED; }' +
        '.tb__slider { background: rgba(0,0,0,0.08); }' +
        '.tb__slider-input { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12); color: #1e1b2e; }' +
        '.tb__btn { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1); color: #7c7a85; }' +
        '.tb__btn:hover { background: rgba(0,0,0,0.06); color: #1e1b2e; }' +
        '.tb__btn--primary { background: rgba(139,92,246,0.1); color: #7C3AED; border-color: rgba(139,92,246,0.3); }' +
        '.tb__btn--primary:hover { background: rgba(139,92,246,0.18); }' +
        '.tb__card { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); }' +
        '.tb__card:hover { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.14); }' +
        '.tb__card-bar { background: rgba(0,0,0,0.06); }' +
        '.tb__card-btn { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); color: #7c7a85; }' +
        '.tb__card-btn:hover { background: rgba(0,0,0,0.06); color: #1e1b2e; }' +
        '.tb__empty { border-color: rgba(0,0,0,0.12); color: #7c7a85; }' +
        '.tb__toast { background: rgba(16,185,129,0.95); }' +
      '}' +

      // ---- Also support data-theme="light" attribute ----
      '[data-theme="light"] .tb__input { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12); color: #1e1b2e; }' +
      '[data-theme="light"] .tb__input::placeholder { color: #7c7a85; }' +
      '[data-theme="light"] .tb__icon-btn { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.1); }' +
      '[data-theme="light"] .tb__icon-btn:hover { background: rgba(0,0,0,0.06); }' +
      '[data-theme="light"] .tb__icon-btn--active { background: rgba(139,92,246,0.12); border-color: rgba(139,92,246,0.4); }' +
      '[data-theme="light"] .tb__mode-btn { background: rgba(0,0,0,0.02); color: #7c7a85; }' +
      '[data-theme="light"] .tb__mode-btn:hover { background: rgba(0,0,0,0.06); }' +
      '[data-theme="light"] .tb__mode-btn--active { background: rgba(139,92,246,0.12); color: #7C3AED; }' +
      '[data-theme="light"] .tb__slider { background: rgba(0,0,0,0.08); }' +
      '[data-theme="light"] .tb__slider-input { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.12); color: #1e1b2e; }' +
      '[data-theme="light"] .tb__btn { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1); color: #7c7a85; }' +
      '[data-theme="light"] .tb__btn:hover { background: rgba(0,0,0,0.06); color: #1e1b2e; }' +
      '[data-theme="light"] .tb__btn--primary { background: rgba(139,92,246,0.1); color: #7C3AED; border-color: rgba(139,92,246,0.3); }' +
      '[data-theme="light"] .tb__btn--primary:hover { background: rgba(139,92,246,0.18); }' +
      '[data-theme="light"] .tb__card { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); }' +
      '[data-theme="light"] .tb__card:hover { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.14); }' +
      '[data-theme="light"] .tb__card-bar { background: rgba(0,0,0,0.06); }' +
      '[data-theme="light"] .tb__card-btn { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.08); color: #7c7a85; }' +
      '[data-theme="light"] .tb__card-btn:hover { background: rgba(0,0,0,0.06); color: #1e1b2e; }' +
      '[data-theme="light"] .tb__empty { border-color: rgba(0,0,0,0.12); color: #7c7a85; }' +

      '';
    document.head.appendChild(style);
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  /** Generate a short random ID. */
  function _uid() {
    return 'tpl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /** Sanitize user text to prevent XSS when inserting into innerHTML. */
  function _esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /** Format number with locale-aware separators. */
  function _fmtNum(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return n.toLocaleString('en-US');
  }

  /** Clamp a number between min and max. */
  function _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /** Show a brief toast notification at the bottom of the page. */
  function _toast(msg) {
    var el = document.createElement('div');
    el.className = 'tb__toast';
    el.textContent = msg;
    document.body.appendChild(el);
    // Trigger reflow then show
    void el.offsetWidth;
    el.classList.add('tb__toast--visible');
    setTimeout(function () {
      el.classList.remove('tb__toast--visible');
      setTimeout(function () { el.remove(); }, 350);
    }, 1800);
  }

  /** Read current context window from the CLAUDE_MODELS global (fallback 200000). */
  function _getContextWindow() {
    try {
      var modelSelect = document.getElementById('model-select');
      var idx = modelSelect ? parseInt(modelSelect.value, 10) : 0;
      if (typeof CLAUDE_MODELS !== 'undefined' && CLAUDE_MODELS[idx]) {
        return CLAUDE_MODELS[idx].contextWindow;
      }
    } catch (e) { /* ignore */ }
    return 200000;
  }

  // ============================================================
  //  LOCALSTORAGE PERSISTENCE
  // ============================================================

  /** Load saved templates from localStorage. */
  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          _templates = arr.slice(0, MAX_TEMPLATES);
          return;
        }
      }
    } catch (e) { /* corrupt data — reset */ }
    _templates = [];
  }

  /** Persist current templates array to localStorage. */
  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_templates));
    } catch (e) { /* quota exceeded — silently fail */ }
  }

  // ============================================================
  //  SVG DONUT PREVIEW
  // ============================================================

  /** Build the SVG donut preview element (static shell). */
  function _buildDonut() {
    var wrap = document.createElement('div');
    wrap.className = 'tb__donut-wrap';

    // SVG
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tb__donut-svg');
    svg.setAttribute('width', DONUT_SIZE);
    svg.setAttribute('height', DONUT_SIZE);
    svg.setAttribute('viewBox', '0 0 ' + DONUT_SIZE + ' ' + DONUT_SIZE);

    // Background circle (track)
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', DONUT_SIZE / 2);
    bg.setAttribute('cy', DONUT_SIZE / 2);
    bg.setAttribute('r', DONUT_RADIUS);
    bg.setAttribute('fill', 'none');
    bg.setAttribute('stroke', 'rgba(255,255,255,0.06)');
    bg.setAttribute('stroke-width', DONUT_STROKE);
    svg.appendChild(bg);

    // Category arcs
    var arcs = {};
    CATEGORIES.forEach(function (cat) {
      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', DONUT_SIZE / 2);
      circle.setAttribute('cy', DONUT_SIZE / 2);
      circle.setAttribute('r', DONUT_RADIUS);
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', CAT_COLORS[cat]);
      circle.setAttribute('stroke-width', DONUT_STROKE);
      circle.setAttribute('stroke-dasharray', '0 ' + DONUT_CIRCUM);
      circle.setAttribute('stroke-dashoffset', '0');
      circle.setAttribute('stroke-linecap', 'butt');
      circle.style.transition = 'stroke-dasharray 0.25s ease, stroke-dashoffset 0.25s ease';
      svg.appendChild(circle);
      arcs[cat] = circle;
    });

    wrap.appendChild(svg);

    // Center label
    var center = document.createElement('div');
    center.className = 'tb__donut-center';
    center.innerHTML = '<span class="tb__donut-icon">' + _form.icon + '</span>' +
                       '<span class="tb__donut-label">Preview</span>';
    wrap.appendChild(center);

    _els.donutWrap = wrap;
    _els.donutArcs = arcs;
    _els.donutIcon = center.querySelector('.tb__donut-icon');
    _els.donutLabel = center.querySelector('.tb__donut-label');
    return wrap;
  }

  /** Update the SVG donut arcs based on current form values. */
  function _updateDonut() {
    if (!_els.donutArcs) return;

    var pcts = _getPercents();
    var offset = 0;

    CATEGORIES.forEach(function (cat) {
      var arc = _els.donutArcs[cat];
      var pct = pcts[cat];
      var len = (pct / 100) * DONUT_CIRCUM;
      var gap = DONUT_CIRCUM - len;
      arc.setAttribute('stroke-dasharray', len.toFixed(2) + ' ' + gap.toFixed(2));
      arc.setAttribute('stroke-dashoffset', (-offset).toFixed(2));
      offset += len;
    });

    // Update center icon
    if (_els.donutIcon) _els.donutIcon.textContent = _form.icon;
  }

  // ============================================================
  //  FORM HELPERS
  // ============================================================

  /** Convert current form values to percentages (always 4 values summing to <=100). */
  function _getPercents() {
    if (_form.mode === 'percent') {
      return {
        system: _form.values.system,
        user: _form.values.user,
        assistant: _form.values.assistant,
        tools: _form.values.tools
      };
    }
    // Absolute mode: convert to percent of context window
    var ctx = _getContextWindow();
    var result = {};
    CATEGORIES.forEach(function (cat) {
      result[cat] = ctx > 0 ? (_form.absValues[cat] / ctx) * 100 : 0;
    });
    return result;
  }

  /** Get absolute token values from the current form. */
  function _getAbsoluteTokens() {
    if (_form.mode === 'absolute') {
      return {
        system: _form.absValues.system,
        user: _form.absValues.user,
        assistant: _form.absValues.assistant,
        tools: _form.absValues.tools
      };
    }
    // Percent mode: convert to tokens using context window
    var ctx = _getContextWindow();
    var result = {};
    CATEGORIES.forEach(function (cat) {
      result[cat] = Math.round((_form.values[cat] / 100) * ctx);
    });
    return result;
  }

  /** Compute total percent used. */
  function _getTotalPercent() {
    var pcts = _getPercents();
    return pcts.system + pcts.user + pcts.assistant + pcts.tools;
  }

  /** Reset form to defaults (for new template). */
  function _resetForm() {
    _form.id = null;
    _form.name = '';
    _form.icon = ICON_CHOICES[0];
    _form.description = '';
    _form.mode = 'percent';
    _form.values = { system: 25, user: 25, assistant: 25, tools: 25 };
    _form.absValues = { system: 5000, user: 5000, assistant: 5000, tools: 5000 };
  }

  /** Populate form fields from an existing template object (for editing). */
  function _populateForm(tpl) {
    _form.id = tpl.id;
    _form.name = tpl.name || '';
    _form.icon = tpl.icon || ICON_CHOICES[0];
    _form.description = tpl.description || '';
    _form.mode = tpl.mode || 'percent';

    if (tpl.mode === 'absolute') {
      _form.absValues = {};
      CATEGORIES.forEach(function (cat) {
        _form.absValues[cat] = tpl.tokens[cat] || 0;
      });
      // Also derive percent for donut
      var ctx = _getContextWindow();
      _form.values = {};
      CATEGORIES.forEach(function (cat) {
        _form.values[cat] = ctx > 0 ? Math.round((_form.absValues[cat] / ctx) * 100) : 0;
      });
    } else {
      _form.values = {};
      CATEGORIES.forEach(function (cat) {
        _form.values[cat] = tpl.percents ? (tpl.percents[cat] || 0) : 25;
      });
      // Derive absolute tokens
      var ctx2 = _getContextWindow();
      _form.absValues = {};
      CATEGORIES.forEach(function (cat) {
        _form.absValues[cat] = Math.round((_form.values[cat] / 100) * ctx2);
      });
    }
  }

  /** Sync all form DOM elements to current _form state. */
  function _syncFormToDOM() {
    if (_els.nameInput) _els.nameInput.value = _form.name;
    if (_els.descInput) _els.descInput.value = _form.description;

    // Icon buttons
    if (_els.iconBtns) {
      _els.iconBtns.forEach(function (btn) {
        btn.classList.toggle('tb__icon-btn--active', btn.dataset.icon === _form.icon);
      });
    }

    // Mode toggle
    if (_els.modeBtns) {
      _els.modeBtns.forEach(function (btn) {
        btn.classList.toggle('tb__mode-btn--active', btn.dataset.mode === _form.mode);
      });
    }

    // Sliders and inputs
    CATEGORIES.forEach(function (cat) {
      if (_form.mode === 'percent') {
        if (_els.sliders[cat]) {
          _els.sliders[cat].max = 100;
          _els.sliders[cat].value = _form.values[cat];
        }
        if (_els.sliderInputs[cat]) _els.sliderInputs[cat].value = _form.values[cat] + '%';
      } else {
        var ctx = _getContextWindow();
        if (_els.sliders[cat]) {
          _els.sliders[cat].max = ctx;
          _els.sliders[cat].value = _form.absValues[cat];
        }
        if (_els.sliderInputs[cat]) _els.sliderInputs[cat].value = _fmtNum(_form.absValues[cat]);
      }
    });

    // Total row
    _updateTotalRow();

    // Donut
    _updateDonut();

    // Save button label
    if (_els.saveBtn) {
      _els.saveBtn.textContent = _form.id ? '\u2713 Update Template' : '+ Save Template';
    }

    // Cancel button visibility
    if (_els.cancelBtn) {
      _els.cancelBtn.style.display = _form.id ? 'inline-flex' : 'none';
    }
  }

  /** Update the total row (percent sum or token sum). */
  function _updateTotalRow() {
    if (!_els.totalVal) return;
    if (_form.mode === 'percent') {
      var total = _getTotalPercent();
      _els.totalVal.textContent = total.toFixed(0) + '%';
      _els.totalVal.className = 'tb__total-val ' + (total > 100 ? 'tb__total-val--over' : 'tb__total-val--ok');
    } else {
      var ctx = _getContextWindow();
      var totalAbs = 0;
      CATEGORIES.forEach(function (cat) { totalAbs += _form.absValues[cat]; });
      _els.totalVal.textContent = _fmtNum(totalAbs) + ' / ' + _fmtNum(ctx);
      _els.totalVal.className = 'tb__total-val ' + (totalAbs > ctx ? 'tb__total-val--over' : 'tb__total-val--ok');
    }
  }

  // ============================================================
  //  BUILD DOM
  // ============================================================

  /** Build the entire Template Builder DOM tree inside the container. */
  function _buildDOM() {
    _container.innerHTML = '';
    _container.classList.add('tb');

    _els = {
      sliders: {},
      sliderInputs: {},
      iconBtns: [],
      modeBtns: []
    };

    // ---- FORM AREA ----
    var formArea = document.createElement('div');
    formArea.className = 'tb__form-area';

    // Left: form fields
    var formLeft = document.createElement('div');
    formLeft.className = 'tb__form-left';

    // Name
    var nameRow = _mkRow('Template Name');
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'tb__input';
    nameInput.placeholder = 'e.g. My Coding Agent';
    nameInput.maxLength = 60;
    nameInput.value = _form.name;
    nameRow.appendChild(nameInput);
    _els.nameInput = nameInput;
    formLeft.appendChild(nameRow);

    // Icon picker
    var iconRow = _mkRow('Icon');
    var iconWrap = document.createElement('div');
    iconWrap.className = 'tb__icons';
    ICON_CHOICES.forEach(function (icon) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb__icon-btn' + (icon === _form.icon ? ' tb__icon-btn--active' : '');
      btn.textContent = icon;
      btn.dataset.icon = icon;
      btn.setAttribute('aria-label', 'Select icon ' + icon);
      btn.addEventListener('click', function () {
        _form.icon = icon;
        _els.iconBtns.forEach(function (b) {
          b.classList.toggle('tb__icon-btn--active', b.dataset.icon === icon);
        });
        _updateDonut();
      });
      iconWrap.appendChild(btn);
      _els.iconBtns.push(btn);
    });
    iconRow.appendChild(iconWrap);
    formLeft.appendChild(iconRow);

    // Description
    var descRow = _mkRow('Description');
    var descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'tb__input';
    descInput.placeholder = 'Short description of this template';
    descInput.maxLength = 120;
    descInput.value = _form.description;
    descRow.appendChild(descInput);
    _els.descInput = descInput;
    formLeft.appendChild(descRow);

    // Mode toggle (percent / absolute)
    var modeRow = _mkRow('Allocation Mode');
    var modeToggle = document.createElement('div');
    modeToggle.className = 'tb__mode-toggle';
    ['percent', 'absolute'].forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb__mode-btn' + (_form.mode === m ? ' tb__mode-btn--active' : '');
      btn.textContent = m === 'percent' ? 'Percentage (%)' : 'Absolute (tokens)';
      btn.dataset.mode = m;
      btn.addEventListener('click', function () {
        if (_form.mode === m) return;
        // Before switching, sync values between modes
        if (m === 'absolute') {
          // percent -> absolute: derive tokens
          var ctx = _getContextWindow();
          CATEGORIES.forEach(function (cat) {
            _form.absValues[cat] = Math.round((_form.values[cat] / 100) * ctx);
          });
        } else {
          // absolute -> percent: derive percent
          var ctx2 = _getContextWindow();
          CATEGORIES.forEach(function (cat) {
            _form.values[cat] = ctx2 > 0 ? Math.round((_form.absValues[cat] / ctx2) * 100) : 0;
          });
        }
        _form.mode = m;
        _syncFormToDOM();
      });
      modeToggle.appendChild(btn);
      _els.modeBtns.push(btn);
    });
    modeRow.appendChild(modeToggle);
    formLeft.appendChild(modeRow);

    // Token sliders
    var sliderLabel = _mkRow('Token Allocation');
    formLeft.appendChild(sliderLabel);

    CATEGORIES.forEach(function (cat) {
      var row = document.createElement('div');
      row.className = 'tb__slider-row';

      // Color dot
      var dot = document.createElement('span');
      dot.className = 'tb__slider-dot';
      dot.style.background = CAT_COLORS[cat];
      row.appendChild(dot);

      // Name
      var name = document.createElement('span');
      name.className = 'tb__slider-name';
      name.textContent = CAT_LABELS[cat];
      row.appendChild(name);

      // Range slider
      var slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'tb__slider';
      slider.min = 0;
      slider.style.setProperty('--thumb-color', CAT_COLORS[cat]);
      if (_form.mode === 'percent') {
        slider.max = 100;
        slider.value = _form.values[cat];
      } else {
        slider.max = _getContextWindow();
        slider.value = _form.absValues[cat];
      }
      slider.setAttribute('aria-label', CAT_LABELS[cat] + ' token allocation');
      row.appendChild(slider);

      // Editable value input
      var valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.className = 'tb__slider-input';
      if (_form.mode === 'percent') {
        valInput.value = _form.values[cat] + '%';
      } else {
        valInput.value = _fmtNum(_form.absValues[cat]);
      }
      row.appendChild(valInput);

      // Wire slider input event
      slider.addEventListener('input', function () {
        var v = parseInt(slider.value, 10) || 0;
        if (_form.mode === 'percent') {
          _form.values[cat] = _clamp(v, 0, 100);
          valInput.value = _form.values[cat] + '%';
        } else {
          var ctx = _getContextWindow();
          _form.absValues[cat] = _clamp(v, 0, ctx);
          valInput.value = _fmtNum(_form.absValues[cat]);
          // Also update percent mirror for donut
          _form.values[cat] = ctx > 0 ? Math.round((_form.absValues[cat] / ctx) * 100) : 0;
        }
        _updateDonut();
        _updateTotalRow();
      });

      // Wire text input change
      valInput.addEventListener('change', function () {
        var raw = valInput.value.replace(/[^0-9.]/g, '');
        var v = parseFloat(raw) || 0;
        if (_form.mode === 'percent') {
          _form.values[cat] = _clamp(Math.round(v), 0, 100);
          slider.value = _form.values[cat];
          valInput.value = _form.values[cat] + '%';
        } else {
          var ctx = _getContextWindow();
          _form.absValues[cat] = _clamp(Math.round(v), 0, ctx);
          slider.value = _form.absValues[cat];
          valInput.value = _fmtNum(_form.absValues[cat]);
          _form.values[cat] = ctx > 0 ? Math.round((_form.absValues[cat] / ctx) * 100) : 0;
        }
        _updateDonut();
        _updateTotalRow();
      });

      // Focus: select text for easy editing
      valInput.addEventListener('focus', function () {
        setTimeout(function () { valInput.select(); }, 0);
      });

      formLeft.appendChild(row);
      _els.sliders[cat] = slider;
      _els.sliderInputs[cat] = valInput;
    });

    // Total row
    var totalRow = document.createElement('div');
    totalRow.className = 'tb__total-row';
    totalRow.innerHTML = '<span>Total</span>';
    var totalVal = document.createElement('span');
    totalVal.className = 'tb__total-val tb__total-val--ok';
    totalRow.appendChild(totalVal);
    _els.totalVal = totalVal;
    formLeft.appendChild(totalRow);

    formArea.appendChild(formLeft);

    // Right: donut preview
    var formRight = document.createElement('div');
    formRight.className = 'tb__form-right';
    formRight.appendChild(_buildDonut());
    formArea.appendChild(formRight);

    _container.appendChild(formArea);

    // ---- ACTION BUTTONS ----
    var actions = document.createElement('div');
    actions.className = 'tb__actions';

    // Save / Update
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'tb__btn tb__btn--primary';
    saveBtn.textContent = '+ Save Template';
    saveBtn.addEventListener('click', _handleSave);
    actions.appendChild(saveBtn);
    _els.saveBtn = saveBtn;

    // Cancel editing
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tb__btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.display = 'none';
    cancelBtn.addEventListener('click', function () {
      _resetForm();
      _syncFormToDOM();
      _renderList();
    });
    actions.appendChild(cancelBtn);
    _els.cancelBtn = cancelBtn;

    // Reset form
    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'tb__btn';
    resetBtn.textContent = '\u21BB Reset Form';
    resetBtn.addEventListener('click', function () {
      _resetForm();
      _syncFormToDOM();
    });
    actions.appendChild(resetBtn);

    _container.appendChild(actions);

    // ---- SEPARATOR ----
    var sep = document.createElement('hr');
    sep.className = 'tb__sep';
    _container.appendChild(sep);

    // ---- SAVED TEMPLATES LIST ----
    var listTitle = document.createElement('div');
    listTitle.className = 'tb__list-title';
    listTitle.textContent = 'Saved Templates (' + _templates.length + '/' + MAX_TEMPLATES + ')';
    _els.listTitle = listTitle;
    _container.appendChild(listTitle);

    var grid = document.createElement('div');
    grid.className = 'tb__grid';
    grid.id = 'tb-template-grid';
    _els.grid = grid;
    _container.appendChild(grid);

    // Bind name and description inputs
    nameInput.addEventListener('input', function () { _form.name = nameInput.value; });
    descInput.addEventListener('input', function () { _form.description = descInput.value; });

    // Initial sync
    _updateTotalRow();
    _updateDonut();
    _renderList();
  }

  /** Helper: create a form row with a label. */
  function _mkRow(label) {
    var row = document.createElement('div');
    row.className = 'tb__row';
    var lbl = document.createElement('label');
    lbl.className = 'tb__label';
    lbl.textContent = label;
    row.appendChild(lbl);
    return row;
  }

  // ============================================================
  //  TEMPLATE LIST RENDERING
  // ============================================================

  /** Render the saved templates grid. */
  function _renderList() {
    if (!_els.grid) return;
    _els.grid.innerHTML = '';

    // Update title count
    if (_els.listTitle) {
      _els.listTitle.textContent = 'Saved Templates (' + _templates.length + '/' + MAX_TEMPLATES + ')';
    }

    // Empty state
    if (_templates.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'tb__empty';
      empty.innerHTML = '<span class="tb__empty-icon">\uD83D\uDCC1</span>' +
                        'No custom templates yet. Create one above!';
      _els.grid.appendChild(empty);
      return;
    }

    _templates.forEach(function (tpl, idx) {
      _els.grid.appendChild(_buildCard(tpl, idx));
    });
  }

  /** Build a single template card element. */
  function _buildCard(tpl, idx) {
    var card = document.createElement('div');
    card.className = 'tb__card';
    card.dataset.index = idx;

    // Draggable for reorder
    card.draggable = true;
    card.addEventListener('dragstart', function (e) {
      _dragSrcIndex = idx;
      card.classList.add('tb__card--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('tb__card--dragging');
      _dragSrcIndex = null;
      // Remove all dragover styles
      var allCards = _els.grid.querySelectorAll('.tb__card');
      allCards.forEach(function (c) { c.classList.remove('tb__card--dragover'); });
    });
    card.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('tb__card--dragover');
    });
    card.addEventListener('dragleave', function () {
      card.classList.remove('tb__card--dragover');
    });
    card.addEventListener('drop', function (e) {
      e.preventDefault();
      card.classList.remove('tb__card--dragover');
      var fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      var toIdx = idx;
      if (fromIdx === toIdx || isNaN(fromIdx)) return;
      // Reorder array
      var item = _templates.splice(fromIdx, 1)[0];
      _templates.splice(toIdx, 0, item);
      _save();
      _renderList();
    });

    // Compute percents for bar
    var tokens = tpl.tokens || {};
    var total = 0;
    CATEGORIES.forEach(function (cat) { total += (tokens[cat] || 0); });

    // Header
    var head = document.createElement('div');
    head.className = 'tb__card-head';
    head.innerHTML =
      '<span class="tb__card-icon" title="Drag to reorder">' + _esc(tpl.icon || ICON_CHOICES[0]) + '</span>' +
      '<div class="tb__card-info">' +
        '<div class="tb__card-name">' + _esc(tpl.name || 'Untitled') + '</div>' +
        '<div class="tb__card-desc">' + _esc(tpl.description || '') + '</div>' +
      '</div>';
    card.appendChild(head);

    // Token bar
    var bar = document.createElement('div');
    bar.className = 'tb__card-bar';
    CATEGORIES.forEach(function (cat) {
      var seg = document.createElement('div');
      seg.className = 'tb__card-seg';
      var pct = total > 0 ? ((tokens[cat] || 0) / total) * 100 : 0;
      seg.style.width = pct.toFixed(1) + '%';
      seg.style.background = CAT_COLORS[cat];
      seg.title = CAT_LABELS[cat] + ': ' + _fmtNum(tokens[cat] || 0) + ' tokens';
      bar.appendChild(seg);
    });
    card.appendChild(bar);

    // Action buttons
    var btns = document.createElement('div');
    btns.className = 'tb__card-btns';

    // Apply
    var applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'tb__card-btn tb__card-btn--apply';
    applyBtn.textContent = '\u25B6 Apply';
    applyBtn.title = 'Apply this template to main sliders';
    applyBtn.addEventListener('click', function () {
      applyTemplate(tpl.id);
      // Brief visual feedback
      applyBtn.classList.add('tb__card-btn--apply-active');
      applyBtn.textContent = '\u2713 Applied';
      setTimeout(function () {
        applyBtn.classList.remove('tb__card-btn--apply-active');
        applyBtn.textContent = '\u25B6 Apply';
      }, 1500);
    });
    btns.appendChild(applyBtn);

    // Edit
    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'tb__card-btn tb__card-btn--edit';
    editBtn.textContent = '\u270E Edit';
    editBtn.addEventListener('click', function () {
      _populateForm(tpl);
      _syncFormToDOM();
      // Scroll form into view
      if (_container) _container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    btns.appendChild(editBtn);

    // Copy Link
    var linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'tb__card-btn';
    linkBtn.textContent = '\uD83D\uDD17 Copy Link';
    linkBtn.addEventListener('click', function () {
      _copyShareLink(tpl);
    });
    btns.appendChild(linkBtn);

    // Export JSON
    var exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'tb__card-btn';
    exportBtn.textContent = '\uD83D\uDCE4 Export';
    exportBtn.addEventListener('click', function () {
      _exportJSON(tpl);
    });
    btns.appendChild(exportBtn);

    // Delete
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'tb__card-btn tb__card-btn--del';
    delBtn.textContent = '\uD83D\uDDD1 Delete';
    delBtn.addEventListener('click', function () {
      if (!confirm('Delete template "' + (tpl.name || 'Untitled') + '"?')) return;
      _templates = _templates.filter(function (t) { return t.id !== tpl.id; });
      _save();
      // If we were editing this template, reset form
      if (_form.id === tpl.id) {
        _resetForm();
        _syncFormToDOM();
      }
      _renderList();
      _toast('Template deleted');
    });
    btns.appendChild(delBtn);

    card.appendChild(btns);
    return card;
  }

  // ============================================================
  //  SAVE / UPDATE HANDLER
  // ============================================================

  function _handleSave() {
    // Validate name
    var name = (_form.name || '').trim();
    if (!name) {
      _toast('Please enter a template name');
      if (_els.nameInput) _els.nameInput.focus();
      return;
    }

    var tokens = _getAbsoluteTokens();
    var percents = _getPercents();

    if (_form.id) {
      // --- UPDATE existing ---
      var found = false;
      _templates = _templates.map(function (t) {
        if (t.id === _form.id) {
          found = true;
          return {
            id: t.id,
            name: name,
            icon: _form.icon,
            description: (_form.description || '').trim(),
            mode: _form.mode,
            tokens: tokens,
            percents: percents,
            updatedAt: Date.now()
          };
        }
        return t;
      });
      if (!found) {
        _toast('Template not found, saving as new');
        _form.id = null;
        _handleSave();
        return;
      }
      _save();
      _resetForm();
      _syncFormToDOM();
      _renderList();
      _toast('Template updated!');
    } else {
      // --- CREATE new ---
      if (_templates.length >= MAX_TEMPLATES) {
        _toast('Maximum ' + MAX_TEMPLATES + ' templates reached. Delete one first.');
        return;
      }

      var tpl = {
        id: _uid(),
        name: name,
        icon: _form.icon,
        description: (_form.description || '').trim(),
        mode: _form.mode,
        tokens: tokens,
        percents: percents,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      _templates.push(tpl);
      _save();
      _resetForm();
      _syncFormToDOM();
      _renderList();
      _toast('Template saved!');
    }
  }

  // ============================================================
  //  APPLY TEMPLATE TO MAIN GAUGE
  // ============================================================

  /**
   * Apply a saved template's token allocation to the main slider controls.
   * Works by setting each slider's value and dispatching an 'input' event so
   * the main app.js state updates reactively.
   */
  function applyTemplate(templateId) {
    var tpl = _templates.find(function (t) { return t.id === templateId; });
    if (!tpl) return false;

    var tokens = tpl.tokens || {};
    var categories = ['system', 'user', 'assistant', 'tools'];

    categories.forEach(function (cat) {
      var slider = document.getElementById('slider-' + cat);
      var input = document.getElementById('input-' + cat);
      var val = tokens[cat] || 0;

      if (slider) {
        slider.value = val;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (input) {
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    _toast('Applied: ' + (tpl.name || 'Template'));
    return true;
  }

  // ============================================================
  //  SHARING & EXPORT
  // ============================================================

  /**
   * Generate a shareable URL with template config encoded as URLSearchParams.
   * Format: ?tpl_name=...&tpl_icon=...&tpl_desc=...&tpl_sys=...&tpl_usr=...&tpl_asst=...&tpl_tools=...&tpl_mode=...
   */
  function _copyShareLink(tpl) {
    var params = new URLSearchParams();
    params.set('tpl_name', tpl.name || '');
    params.set('tpl_icon', tpl.icon || '');
    params.set('tpl_desc', tpl.description || '');
    params.set('tpl_mode', tpl.mode || 'percent');

    if (tpl.tokens) {
      params.set('tpl_sys', String(tpl.tokens.system || 0));
      params.set('tpl_usr', String(tpl.tokens.user || 0));
      params.set('tpl_asst', String(tpl.tokens.assistant || 0));
      params.set('tpl_tools', String(tpl.tokens.tools || 0));
    }

    var url = window.location.origin + window.location.pathname + '?' + params.toString();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        _toast('Share link copied to clipboard!');
      }).catch(function () {
        _fallbackCopy(url);
      });
    } else {
      _fallbackCopy(url);
    }
  }

  /** Fallback copy using a temporary textarea (for older browsers / non-HTTPS). */
  function _fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      _toast('Share link copied!');
    } catch (e) {
      _toast('Failed to copy link');
    }
    ta.remove();
  }

  /** Export a single template as a downloadable JSON file. */
  function _exportJSON(tpl) {
    var exportData = {
      _format: 'claude-ctx-template',
      _version: '1.0',
      name: tpl.name,
      icon: tpl.icon,
      description: tpl.description,
      mode: tpl.mode,
      tokens: tpl.tokens,
      percents: tpl.percents,
      exportedAt: new Date().toISOString()
    };

    var json = JSON.stringify(exportData, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = url;
    a.download = 'template-' + (tpl.name || 'custom').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    _toast('Template exported as JSON');
  }

  // ============================================================
  //  URL IMPORT (on init, check for shared template in URL params)
  // ============================================================

  /** Parse URLSearchParams for a shared template and offer to import it. */
  function _checkURLImport() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (!params.has('tpl_name')) return;

      var name = params.get('tpl_name') || 'Imported Template';
      var icon = params.get('tpl_icon') || ICON_CHOICES[0];
      var desc = params.get('tpl_desc') || '';
      var mode = params.get('tpl_mode') || 'absolute';

      var tokens = {
        system:    parseInt(params.get('tpl_sys'), 10) || 0,
        user:      parseInt(params.get('tpl_usr'), 10) || 0,
        assistant: parseInt(params.get('tpl_asst'), 10) || 0,
        tools:     parseInt(params.get('tpl_tools'), 10) || 0
      };

      // Derive percents
      var ctx = _getContextWindow();
      var percents = {};
      CATEGORIES.forEach(function (cat) {
        percents[cat] = ctx > 0 ? Math.round((tokens[cat] / ctx) * 100) : 0;
      });

      // Check for duplicate
      var isDupe = _templates.some(function (t) {
        return t.name === name &&
          t.tokens.system === tokens.system &&
          t.tokens.user === tokens.user;
      });

      if (isDupe) return; // Already have this template

      if (_templates.length >= MAX_TEMPLATES) {
        _toast('Cannot import: max ' + MAX_TEMPLATES + ' templates');
        return;
      }

      // Auto-import the shared template
      _templates.push({
        id: _uid(),
        name: name,
        icon: icon,
        description: desc,
        mode: mode,
        tokens: tokens,
        percents: percents,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      _save();
      _renderList();
      _toast('Imported shared template: ' + name);

      // Clean URL (remove tpl_ params without reloading)
      var cleanParams = new URLSearchParams(window.location.search);
      ['tpl_name', 'tpl_icon', 'tpl_desc', 'tpl_mode', 'tpl_sys', 'tpl_usr', 'tpl_asst', 'tpl_tools'].forEach(function (k) {
        cleanParams.delete(k);
      });
      var cleanURL = window.location.pathname + (cleanParams.toString() ? '?' + cleanParams.toString() : '');
      window.history.replaceState(null, '', cleanURL);
    } catch (e) {
      // Silently ignore malformed URL params
    }
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  /**
   * Initialize the Template Builder.
   * @param {string} containerId - ID of the container element to render into.
   */
  function init(containerId) {
    if (_inited) return;

    var el = document.getElementById(containerId);
    if (!el) {
      console.warn('[TemplateBuilder] Container #' + containerId + ' not found.');
      return;
    }

    _container = el;
    _injectCSS();
    _load();
    _buildDOM();
    _checkURLImport();
    _inited = true;
  }

  /**
   * Get all saved custom templates.
   * @returns {Array} Array of template objects.
   */
  function getTemplates() {
    return _templates.slice();
  }

  /**
   * Check if the module has been initialized.
   * @returns {boolean}
   */
  function isInited() {
    return _inited;
  }

  // ---- Expose public API ----
  return {
    init: init,
    getTemplates: getTemplates,
    applyTemplate: applyTemplate,
    isInited: isInited
  };

})();

// Attach to window for global access
window.TemplateBuilder = TemplateBuilder;
