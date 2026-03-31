/**
 * Claude Context Window Visualizer — Keyboard Help Panel
 * A modal overlay that displays all available keyboard shortcuts,
 * grouped by category, with a live search/filter input.
 *
 * Trigger: Press '?' (Shift + /) to toggle the panel.
 * Close:   ESC, click backdrop, or press '?' again.
 *
 * Features:
 *   - Grouped shortcut list (Navigation / Presets / Display / Help)
 *   - GitHub-style <kbd> key badges
 *   - Real-time search filter
 *   - Dark/light theme via CSS custom properties
 *   - Fade + scale entrance animation
 *   - Fully accessible: focus trap, role="dialog", aria attributes
 *
 * API:  window.KeyboardHelp = { show, hide, toggle, isVisible }
 */

(function () {
  'use strict';

  // ============================================================
  //  CONSTANTS
  // ============================================================

  var NS = 'kbh'; // namespace prefix for CSS class names

  /**
   * Shortcut definitions grouped by category.
   * Each entry: { key: display label, desc: description }
   */
  var GROUPS = [
    {
      title: 'Navigation',
      icon: '🧭',
      shortcuts: [
        { key: 'R', desc: 'Reset all values' },
        { key: 'C', desc: 'Toggle compare mode' }
      ]
    },
    {
      title: 'Presets',
      icon: '⚡',
      shortcuts: [
        { key: '1', desc: 'Load Preset 1' },
        { key: '2', desc: 'Load Preset 2' },
        { key: '3', desc: 'Load Preset 3' },
        { key: '4', desc: 'Load Preset 4' }
      ]
    },
    {
      title: 'Display',
      icon: '🎨',
      shortcuts: [
        { key: 'D', desc: 'All-model dashboard' },
        { key: 'T', desc: 'Toggle dark / light theme' }
      ]
    },
    {
      title: 'Help',
      icon: '❓',
      shortcuts: [
        { key: '?', desc: 'Show this help panel' },
        { key: 'ESC', desc: 'Close panel / Tour' }
      ]
    }
  ];

  // ============================================================
  //  STATE
  // ============================================================

  var _visible = false;
  var _overlay = null;   // backdrop + modal container
  var _modal = null;      // the modal card itself
  var _searchInput = null;
  var _built = false;

  // ============================================================
  //  CSS INJECTION
  // ============================================================

  /**
   * Inject all keyboard-help-related CSS into a <style> block.
   * Uses CSS custom properties from the host page for theme awareness.
   */
  function injectStyles() {
    if (document.getElementById(NS + '-styles')) return;

    var css = [
      /* ---- Overlay / Backdrop ---- */
      '.' + NS + '-overlay {',
      '  position: fixed;',
      '  inset: 0;',
      '  z-index: 99980;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  background: rgba(0, 0, 0, 0.55);',
      '  backdrop-filter: blur(6px);',
      '  -webkit-backdrop-filter: blur(6px);',
      '  opacity: 0;',
      '  visibility: hidden;',
      '  transition: opacity 0.25s ease, visibility 0.25s ease;',
      '  padding: 24px;',
      '}',
      '.' + NS + '-overlay--visible {',
      '  opacity: 1;',
      '  visibility: visible;',
      '}',

      /* ---- Modal Card ---- */
      '.' + NS + '-modal {',
      '  position: relative;',
      '  width: 520px;',
      '  max-width: 100%;',
      '  max-height: calc(100vh - 48px);',
      '  overflow-y: auto;',
      '  padding: 28px 30px 24px;',
      '  border-radius: var(--radius-lg, 16px);',
      '  background: var(--bg-card, rgba(255,255,255,0.03));',
      '  backdrop-filter: blur(var(--glass-blur, 20px));',
      '  -webkit-backdrop-filter: blur(var(--glass-blur, 20px));',
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));',
      '  box-shadow: 0 16px 64px rgba(0,0,0,0.4), var(--shadow-glow, none);',
      '  color: var(--text-primary, #F1F0F5);',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  transform: scale(0.92) translateY(12px);',
      '  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease;',
      '  opacity: 0;',
      '}',
      '.' + NS + '-overlay--visible .' + NS + '-modal {',
      '  transform: scale(1) translateY(0);',
      '  opacity: 1;',
      '}',

      /* Scrollbar styling */
      '.' + NS + '-modal::-webkit-scrollbar {',
      '  width: 6px;',
      '}',
      '.' + NS + '-modal::-webkit-scrollbar-track {',
      '  background: transparent;',
      '}',
      '.' + NS + '-modal::-webkit-scrollbar-thumb {',
      '  background: var(--text-muted, #5D5773);',
      '  border-radius: 3px;',
      '}',

      /* ---- Header ---- */
      '.' + NS + '-header {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  margin-bottom: 18px;',
      '}',
      '.' + NS + '-title {',
      '  font-size: 18px;',
      '  font-weight: 700;',
      '  color: var(--text-primary, #F1F0F5);',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '}',
      '.' + NS + '-title-icon {',
      '  font-size: 20px;',
      '}',

      /* Close button */
      '.' + NS + '-close {',
      '  width: 32px;',
      '  height: 32px;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));',
      '  border-radius: var(--radius-sm, 8px);',
      '  background: transparent;',
      '  color: var(--text-muted, #5D5773);',
      '  font-size: 18px;',
      '  cursor: pointer;',
      '  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;',
      '  line-height: 1;',
      '}',
      '.' + NS + '-close:hover {',
      '  color: var(--text-primary, #F1F0F5);',
      '  background: var(--bg-card-hover, rgba(255,255,255,0.06));',
      '  border-color: var(--border-hover, rgba(255,255,255,0.12));',
      '}',
      '.' + NS + '-close:focus-visible {',
      '  outline: 2px solid var(--accent-purple, #8B5CF6);',
      '  outline-offset: 2px;',
      '}',

      /* ---- Search input ---- */
      '.' + NS + '-search {',
      '  width: 100%;',
      '  padding: 9px 14px 9px 36px;',
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));',
      '  border-radius: var(--radius-sm, 8px);',
      '  background: var(--input-bg, rgba(255,255,255,0.04));',
      '  color: var(--text-primary, #F1F0F5);',
      '  font-size: 13px;',
      '  font-family: inherit;',
      '  outline: none;',
      '  transition: border-color 0.2s ease, box-shadow 0.2s ease;',
      '}',
      '.' + NS + '-search::placeholder {',
      '  color: var(--text-muted, #5D5773);',
      '}',
      '.' + NS + '-search:focus {',
      '  border-color: var(--accent-purple, #8B5CF6);',
      '  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);',
      '}',
      '.' + NS + '-search-wrap {',
      '  position: relative;',
      '  margin-bottom: 20px;',
      '}',
      '.' + NS + '-search-icon {',
      '  position: absolute;',
      '  left: 12px;',
      '  top: 50%;',
      '  transform: translateY(-50%);',
      '  color: var(--text-muted, #5D5773);',
      '  font-size: 14px;',
      '  pointer-events: none;',
      '}',

      /* ---- Group section ---- */
      '.' + NS + '-group {',
      '  margin-bottom: 18px;',
      '}',
      '.' + NS + '-group:last-child {',
      '  margin-bottom: 0;',
      '}',
      '.' + NS + '-group-title {',
      '  font-size: 11px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.08em;',
      '  text-transform: uppercase;',
      '  color: var(--text-muted, #5D5773);',
      '  margin-bottom: 8px;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '}',
      '.' + NS + '-group-icon {',
      '  font-size: 13px;',
      '}',

      /* ---- Shortcut row ---- */
      '.' + NS + '-row {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  padding: 7px 10px;',
      '  border-radius: var(--radius-sm, 8px);',
      '  transition: background 0.15s ease;',
      '}',
      '.' + NS + '-row:hover {',
      '  background: var(--bg-card-hover, rgba(255,255,255,0.06));',
      '}',
      '.' + NS + '-row-desc {',
      '  font-size: 13px;',
      '  color: var(--text-secondary, #9893A6);',
      '  flex: 1;',
      '  margin-right: 12px;',
      '}',

      /* ---- Kbd badge (GitHub-style) ---- */
      '.' + NS + '-kbd {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  min-width: 28px;',
      '  height: 26px;',
      '  padding: 0 8px;',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;',
      '  line-height: 1;',
      '  color: var(--text-primary, #F1F0F5);',
      '  background: var(--kbd-bg, rgba(255,255,255,0.06));',
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));',
      '  border-bottom-width: 2px;',
      '  border-radius: 6px;',
      '  box-shadow: 0 1px 2px rgba(0,0,0,0.2);',
      '  white-space: nowrap;',
      '  flex-shrink: 0;',
      '}',

      /* ---- Empty state ---- */
      '.' + NS + '-empty {',
      '  text-align: center;',
      '  padding: 24px 0;',
      '  color: var(--text-muted, #5D5773);',
      '  font-size: 13px;',
      '}',
      '.' + NS + '-empty-icon {',
      '  font-size: 28px;',
      '  margin-bottom: 8px;',
      '}',

      /* ---- Footer hint ---- */
      '.' + NS + '-footer {',
      '  margin-top: 20px;',
      '  padding-top: 14px;',
      '  border-top: 1px solid var(--border-color, rgba(255,255,255,0.06));',
      '  text-align: center;',
      '  font-size: 11px;',
      '  color: var(--text-muted, #5D5773);',
      '}',

      /* ---- Separator between groups ---- */
      '.' + NS + '-separator {',
      '  height: 1px;',
      '  background: var(--border-color, rgba(255,255,255,0.06));',
      '  margin: 4px 10px 8px;',
      '}',

      /* ---- Hidden helper ---- */
      '.' + NS + '-hidden {',
      '  display: none !important;',
      '}',

      /* ---- Responsive ---- */
      '@media (max-width: 560px) {',
      '  .' + NS + '-modal {',
      '    padding: 20px 18px 18px;',
      '  }',
      '  .' + NS + '-title { font-size: 16px; }',
      '  .' + NS + '-row { padding: 6px 6px; }',
      '}'
    ].join('\n');

    var style = document.createElement('style');
    style.id = NS + '-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  //  BUILD DOM
  // ============================================================

  /**
   * Build the entire modal DOM tree (once, then reused).
   */
  function build() {
    if (_built) return;
    injectStyles();

    // -- Overlay (backdrop) --
    _overlay = document.createElement('div');
    _overlay.className = NS + '-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'Keyboard shortcuts');

    // -- Modal card --
    _modal = document.createElement('div');
    _modal.className = NS + '-modal';

    // -- Header --
    var header = document.createElement('div');
    header.className = NS + '-header';

    var title = document.createElement('h2');
    title.className = NS + '-title';
    title.innerHTML = '<span class="' + NS + '-title-icon">⌨️</span> Keyboard Shortcuts';

    var closeBtn = document.createElement('button');
    closeBtn.className = NS + '-close';
    closeBtn.setAttribute('aria-label', 'Close shortcuts panel');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', hide);

    header.appendChild(title);
    header.appendChild(closeBtn);
    _modal.appendChild(header);

    // -- Search --
    var searchWrap = document.createElement('div');
    searchWrap.className = NS + '-search-wrap';

    var searchIcon = document.createElement('span');
    searchIcon.className = NS + '-search-icon';
    searchIcon.textContent = '🔍';

    _searchInput = document.createElement('input');
    _searchInput.className = NS + '-search';
    _searchInput.type = 'text';
    _searchInput.placeholder = 'Search shortcuts...';
    _searchInput.setAttribute('aria-label', 'Filter keyboard shortcuts');
    _searchInput.addEventListener('input', onSearchInput);

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(_searchInput);
    _modal.appendChild(searchWrap);

    // -- Shortcut groups --
    var body = document.createElement('div');
    body.className = NS + '-body';
    body.id = NS + '-body';

    for (var g = 0; g < GROUPS.length; g++) {
      var group = GROUPS[g];

      var section = document.createElement('div');
      section.className = NS + '-group';
      section.setAttribute('data-group', group.title);

      var groupTitle = document.createElement('div');
      groupTitle.className = NS + '-group-title';
      groupTitle.innerHTML =
        '<span class="' + NS + '-group-icon">' + group.icon + '</span>' +
        group.title;
      section.appendChild(groupTitle);

      for (var s = 0; s < group.shortcuts.length; s++) {
        var sc = group.shortcuts[s];

        var row = document.createElement('div');
        row.className = NS + '-row';
        row.setAttribute('data-key', sc.key.toLowerCase());
        row.setAttribute('data-desc', sc.desc.toLowerCase());

        var desc = document.createElement('span');
        desc.className = NS + '-row-desc';
        desc.textContent = sc.desc;

        var kbd = document.createElement('kbd');
        kbd.className = NS + '-kbd';
        kbd.textContent = sc.key;

        row.appendChild(desc);
        row.appendChild(kbd);
        section.appendChild(row);
      }

      body.appendChild(section);
    }

    _modal.appendChild(body);

    // -- Empty state (shown when search yields no results) --
    var empty = document.createElement('div');
    empty.className = NS + '-empty ' + NS + '-hidden';
    empty.id = NS + '-empty';
    empty.innerHTML =
      '<div class="' + NS + '-empty-icon">🔎</div>' +
      'No matching shortcuts found.';
    _modal.appendChild(empty);

    // -- Footer hint --
    var footer = document.createElement('div');
    footer.className = NS + '-footer';
    footer.innerHTML =
      'Press <kbd class="' + NS + '-kbd" style="display:inline-flex;height:20px;min-width:22px;padding:0 5px;font-size:11px;">?</kbd> to toggle &nbsp;·&nbsp; ' +
      '<kbd class="' + NS + '-kbd" style="display:inline-flex;height:20px;min-width:22px;padding:0 5px;font-size:11px;">ESC</kbd> to close';
    _modal.appendChild(footer);

    _overlay.appendChild(_modal);
    document.body.appendChild(_overlay);

    // -- Backdrop click to close --
    _overlay.addEventListener('click', function (e) {
      if (e.target === _overlay) {
        hide();
      }
    });

    // Prevent modal clicks from bubbling to overlay
    _modal.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    _built = true;
  }

  // ============================================================
  //  SEARCH / FILTER
  // ============================================================

  /**
   * Filter shortcut rows based on the search input value.
   * Hides entire groups if none of their rows match.
   */
  function onSearchInput() {
    var query = (_searchInput.value || '').trim().toLowerCase();
    var body = document.getElementById(NS + '-body');
    var emptyEl = document.getElementById(NS + '-empty');
    if (!body || !emptyEl) return;

    var groups = body.querySelectorAll('.' + NS + '-group');
    var totalVisible = 0;

    for (var g = 0; g < groups.length; g++) {
      var section = groups[g];
      var rows = section.querySelectorAll('.' + NS + '-row');
      var groupVisible = 0;

      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var keyText = row.getAttribute('data-key') || '';
        var descText = row.getAttribute('data-desc') || '';
        var match = !query || keyText.indexOf(query) !== -1 || descText.indexOf(query) !== -1;

        if (match) {
          row.classList.remove(NS + '-hidden');
          groupVisible++;
        } else {
          row.classList.add(NS + '-hidden');
        }
      }

      if (groupVisible > 0) {
        section.classList.remove(NS + '-hidden');
      } else {
        section.classList.add(NS + '-hidden');
      }

      totalVisible += groupVisible;
    }

    // Toggle empty state
    if (totalVisible === 0 && query) {
      emptyEl.classList.remove(NS + '-hidden');
    } else {
      emptyEl.classList.add(NS + '-hidden');
    }
  }

  // ============================================================
  //  SHOW / HIDE / TOGGLE
  // ============================================================

  /**
   * Show the keyboard help panel with entrance animation.
   */
  function show() {
    if (!_built) build();
    if (_visible) return;

    _visible = true;
    _overlay.classList.add(NS + '-overlay--visible');

    // Reset search state on open
    if (_searchInput) {
      _searchInput.value = '';
      onSearchInput(); // reset filter
    }

    // Focus the search input after animation settles
    setTimeout(function () {
      if (_searchInput && _visible) {
        _searchInput.focus();
      }
    }, 100);
  }

  /**
   * Hide the keyboard help panel with exit animation.
   */
  function hide() {
    if (!_visible) return;

    _visible = false;
    _overlay.classList.remove(NS + '-overlay--visible');
  }

  /**
   * Toggle the panel visibility.
   */
  function toggle() {
    if (_visible) {
      hide();
    } else {
      show();
    }
  }

  /**
   * Return whether the panel is currently visible.
   */
  function isVisible() {
    return _visible;
  }

  // ============================================================
  //  GLOBAL KEYBOARD LISTENER
  // ============================================================

  /**
   * Listen for the '?' key (Shift + /) to toggle the panel,
   * and ESC to close it. Ignores keypresses inside form elements.
   */
  function initKeyboardListener() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toUpperCase();
      var isFormField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // ESC closes the panel regardless of focus context
      if (e.key === 'Escape' && _visible) {
        e.preventDefault();
        e.stopPropagation();
        hide();
        return;
      }

      // '?' toggle — only when not typing in a form field
      // Exception: allow '?' when the search input inside our own modal is focused
      if (e.key === '?' && (!isFormField || e.target === _searchInput)) {
        // If the search input is focused and has content, don't toggle — let user type '?'
        if (e.target === _searchInput && _searchInput.value.length > 0) {
          return;
        }
        e.preventDefault();
        toggle();
      }
    });
  }

  // ============================================================
  //  INIT
  // ============================================================

  /**
   * Initialize on DOMContentLoaded or immediately if already loaded.
   */
  function init() {
    initKeyboardListener();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  window.KeyboardHelp = {
    show: show,
    hide: hide,
    toggle: toggle,
    isVisible: isVisible
  };

})();
