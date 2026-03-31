/**
 * Claude Context Window Visualizer — Guided Tour
 * A step-by-step onboarding tour that highlights key UI elements
 * and teaches first-time visitors how to use the application.
 *
 * Features:
 *   - 7-step walkthrough with spotlight highlighting
 *   - Overlay with cut-out effect via box-shadow
 *   - Auto-start on first visit (localStorage gate)
 *   - Light/dark theme support via CSS custom properties
 *   - Keyboard (ESC) and resize handling
 *   - Smooth scroll-into-view for each step
 *
 * API:  window.GuidedTour = { start, stop, isCompleted, reset }
 */

(function () {
  'use strict';

  // ============================================================
  //  CONSTANTS
  // ============================================================

  var STORAGE_KEY = 'claude-ctx-tour-completed';
  var NS = 'gt'; // namespace prefix for CSS class names

  /**
   * Tour step definitions.
   * Each step targets a CSS selector, has a title, description,
   * and an optional preferred placement for the tooltip card.
   * Placement values: 'bottom' | 'top' | 'left' | 'right'
   */
  var STEPS = [
    {
      selector: '#gauge-container',
      title: 'Usage Gauge',
      description: 'This is your context window usage gauge. It shows how much of the context window is being used.',
      placement: 'right'
    },
    {
      selector: '.sliders-card',
      title: 'Token Sliders',
      description: 'Drag these sliders to adjust token allocation for each category.',
      placement: 'left'
    },
    {
      selector: '#presets-grid',
      title: 'Quick Presets',
      description: 'Click a preset to quickly load a common usage scenario.',
      placement: 'top'
    },
    {
      selector: '#model-select',
      title: 'Model Selector',
      description: 'Choose different Claude models to see how context window size affects usage.',
      placement: 'bottom'
    },
    {
      selector: '#health-hud',
      title: 'Health HUD',
      description: 'This bar shows real-time health of your context window.',
      placement: 'bottom'
    },
    {
      selector: '#realtime-monitor-section',
      title: 'Realtime Monitor',
      description: 'NEW: Paste your /context output here for real-time monitoring.',
      placement: 'top'
    },
    {
      selector: '#compaction-sim-section',
      title: 'Compaction Simulator',
      description: 'NEW: Simulate the /compact command to see how much space you can free up.',
      placement: 'top'
    }
  ];

  // ============================================================
  //  STATE
  // ============================================================

  var _active = false;      // whether tour is currently running
  var _stepIndex = 0;       // current step (0-based)
  var _els = {};            // cached DOM refs created during start()

  // Bound handler references (for cleanup)
  var _onKeyDown = null;
  var _onResize = null;
  var _resizeTimer = null;

  // ============================================================
  //  CSS INJECTION
  // ============================================================

  /**
   * Inject all tour-related CSS into a <style> block.
   * Uses CSS custom properties from the host page for theme awareness.
   */
  function injectStyles() {
    if (document.getElementById(NS + '-styles')) return;

    var css = [
      /* ---- Overlay ---- */
      '.' + NS + '-overlay {',
      '  position: fixed;',
      '  inset: 0;',
      '  z-index: 99990;',
      '  pointer-events: auto;',
      '  transition: opacity 0.3s ease;',
      '  opacity: 0;',
      '}',
      '.' + NS + '-overlay--visible {',
      '  opacity: 1;',
      '}',

      /* ---- Spotlight (cut-out highlight) ---- */
      '.' + NS + '-spotlight {',
      '  position: fixed;',
      '  z-index: 99991;',
      '  border-radius: 8px;',
      '  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);',
      '  transition: top 0.35s cubic-bezier(0.4,0,0.2,1),',
      '              left 0.35s cubic-bezier(0.4,0,0.2,1),',
      '              width 0.35s cubic-bezier(0.4,0,0.2,1),',
      '              height 0.35s cubic-bezier(0.4,0,0.2,1),',
      '              opacity 0.3s ease;',
      '  pointer-events: none;',
      '  opacity: 0;',
      '}',
      '.' + NS + '-spotlight--visible {',
      '  opacity: 1;',
      '}',

      /* Pulsing ring around spotlight */
      '.' + NS + '-spotlight::after {',
      '  content: "";',
      '  position: absolute;',
      '  inset: -4px;',
      '  border-radius: 12px;',
      '  border: 2px solid var(--accent-purple, #8B5CF6);',
      '  animation: ' + NS + '-pulse 2s ease-in-out infinite;',
      '}',
      '@keyframes ' + NS + '-pulse {',
      '  0%, 100% { opacity: 0.4; transform: scale(1); }',
      '  50%      { opacity: 1;   transform: scale(1.02); }',
      '}',

      /* ---- Tooltip card ---- */
      '.' + NS + '-card {',
      '  position: fixed;',
      '  z-index: 99992;',
      '  width: 320px;',
      '  max-width: calc(100vw - 32px);',
      '  padding: 20px 22px 16px;',
      '  border-radius: var(--radius-md, 12px);',
      '  background: var(--bg-card, rgba(255,255,255,0.03));',
      '  backdrop-filter: blur(var(--glass-blur, 20px));',
      '  -webkit-backdrop-filter: blur(var(--glass-blur, 20px));',
      '  border: 1px solid var(--border-color, rgba(255,255,255,0.06));',
      '  box-shadow: 0 8px 32px rgba(0,0,0,0.3), var(--shadow-glow, none);',
      '  color: var(--text-primary, #F1F0F5);',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  transition: top 0.35s cubic-bezier(0.4,0,0.2,1),',
      '              left 0.35s cubic-bezier(0.4,0,0.2,1),',
      '              opacity 0.3s ease,',
      '              transform 0.3s ease;',
      '  opacity: 0;',
      '  transform: translateY(8px);',
      '  pointer-events: auto;',
      '}',
      '.' + NS + '-card--visible {',
      '  opacity: 1;',
      '  transform: translateY(0);',
      '}',

      /* Step badge */
      '.' + NS + '-card__step {',
      '  display: inline-block;',
      '  font-size: 11px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.05em;',
      '  text-transform: uppercase;',
      '  color: var(--accent-purple, #8B5CF6);',
      '  margin-bottom: 6px;',
      '}',

      /* Title */
      '.' + NS + '-card__title {',
      '  font-size: 16px;',
      '  font-weight: 700;',
      '  margin-bottom: 8px;',
      '  color: var(--text-primary, #F1F0F5);',
      '}',

      /* Description */
      '.' + NS + '-card__desc {',
      '  font-size: 13px;',
      '  line-height: 1.55;',
      '  color: var(--text-secondary, #9893A6);',
      '  margin-bottom: 16px;',
      '}',

      /* Footer row (buttons + dots) */
      '.' + NS + '-card__footer {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  gap: 8px;',
      '}',

      /* Progress dots */
      '.' + NS + '-dots {',
      '  display: flex;',
      '  gap: 6px;',
      '}',
      '.' + NS + '-dot {',
      '  width: 7px;',
      '  height: 7px;',
      '  border-radius: 50%;',
      '  background: var(--text-muted, #5D5773);',
      '  transition: background 0.25s ease, transform 0.25s ease;',
      '}',
      '.' + NS + '-dot--active {',
      '  background: var(--accent-purple, #8B5CF6);',
      '  transform: scale(1.35);',
      '}',
      '.' + NS + '-dot--done {',
      '  background: var(--accent-green, #10B981);',
      '}',

      /* Buttons container */
      '.' + NS + '-card__btns {',
      '  display: flex;',
      '  gap: 8px;',
      '}',

      /* Shared button base */
      '.' + NS + '-btn {',
      '  padding: 6px 16px;',
      '  border: none;',
      '  border-radius: var(--radius-sm, 8px);',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  cursor: pointer;',
      '  transition: background 0.2s ease, transform 0.15s ease, opacity 0.2s ease;',
      '  outline: none;',
      '  line-height: 1.4;',
      '}',
      '.' + NS + '-btn:focus-visible {',
      '  outline: 2px solid var(--accent-purple, #8B5CF6);',
      '  outline-offset: 2px;',
      '}',
      '.' + NS + '-btn:active {',
      '  transform: scale(0.96);',
      '}',

      /* Skip button */
      '.' + NS + '-btn--skip {',
      '  background: transparent;',
      '  color: var(--text-muted, #5D5773);',
      '}',
      '.' + NS + '-btn--skip:hover {',
      '  color: var(--text-secondary, #9893A6);',
      '  background: var(--bg-card-hover, rgba(255,255,255,0.06));',
      '}',

      /* Next / Done button */
      '.' + NS + '-btn--next {',
      '  background: var(--accent-purple, #8B5CF6);',
      '  color: #fff;',
      '}',
      '.' + NS + '-btn--next:hover {',
      '  opacity: 0.9;',
      '}',

      /* ---- Small screen adjustments ---- */
      '@media (max-width: 600px) {',
      '  .' + NS + '-card {',
      '    width: calc(100vw - 24px);',
      '    padding: 16px;',
      '  }',
      '}'
    ].join('\n');

    var style = document.createElement('style');
    style.id = NS + '-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  //  DOM BUILDERS
  // ============================================================

  /**
   * Create the overlay, spotlight, and tooltip card elements.
   * Appended to document.body.
   */
  function createDOM() {
    // Overlay (captures clicks to prevent interaction with background)
    var overlay = document.createElement('div');
    overlay.className = NS + '-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    // Spotlight cut-out
    var spotlight = document.createElement('div');
    spotlight.className = NS + '-spotlight';
    spotlight.setAttribute('aria-hidden', 'true');

    // Tooltip card
    var card = document.createElement('div');
    card.className = NS + '-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Guided tour step');

    card.innerHTML = [
      '<div class="' + NS + '-card__step"></div>',
      '<div class="' + NS + '-card__title"></div>',
      '<div class="' + NS + '-card__desc"></div>',
      '<div class="' + NS + '-card__footer">',
      '  <div class="' + NS + '-dots"></div>',
      '  <div class="' + NS + '-card__btns">',
      '    <button class="' + NS + '-btn ' + NS + '-btn--skip" type="button">Skip Tour</button>',
      '    <button class="' + NS + '-btn ' + NS + '-btn--next" type="button">Next</button>',
      '  </div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    document.body.appendChild(spotlight);
    document.body.appendChild(card);

    _els.overlay = overlay;
    _els.spotlight = spotlight;
    _els.card = card;
    _els.stepLabel = card.querySelector('.' + NS + '-card__step');
    _els.title = card.querySelector('.' + NS + '-card__title');
    _els.desc = card.querySelector('.' + NS + '-card__desc');
    _els.dots = card.querySelector('.' + NS + '-dots');
    _els.skipBtn = card.querySelector('.' + NS + '-btn--skip');
    _els.nextBtn = card.querySelector('.' + NS + '-btn--next');

    // Build progress dots
    buildDots();

    // Event listeners
    _els.skipBtn.addEventListener('click', stop);
    _els.nextBtn.addEventListener('click', nextStep);
    overlay.addEventListener('click', stop); // click on overlay = skip
  }

  /**
   * Build the progress dot indicators.
   */
  function buildDots() {
    _els.dots.innerHTML = '';
    for (var i = 0; i < STEPS.length; i++) {
      var dot = document.createElement('span');
      dot.className = NS + '-dot';
      _els.dots.appendChild(dot);
    }
  }

  /**
   * Remove all tour DOM elements from the document.
   */
  function destroyDOM() {
    if (_els.overlay && _els.overlay.parentNode) {
      _els.overlay.parentNode.removeChild(_els.overlay);
    }
    if (_els.spotlight && _els.spotlight.parentNode) {
      _els.spotlight.parentNode.removeChild(_els.spotlight);
    }
    if (_els.card && _els.card.parentNode) {
      _els.card.parentNode.removeChild(_els.card);
    }
    _els = {};
  }

  // ============================================================
  //  POSITIONING
  // ============================================================

  /**
   * Get bounding rect of the target element for the current step.
   * Returns null if element not found.
   */
  function getTargetRect(step) {
    var el = document.querySelector(step.selector);
    if (!el) return null;
    return el.getBoundingClientRect();
  }

  /**
   * Move the spotlight to cover the given rect, with some padding.
   */
  function positionSpotlight(rect) {
    var pad = 8;
    _els.spotlight.style.top = (rect.top - pad) + 'px';
    _els.spotlight.style.left = (rect.left - pad) + 'px';
    _els.spotlight.style.width = (rect.width + pad * 2) + 'px';
    _els.spotlight.style.height = (rect.height + pad * 2) + 'px';
  }

  /**
   * Position the tooltip card relative to the spotlight.
   * Tries the preferred placement first, falls back to best-fit.
   */
  function positionCard(rect, placement) {
    var card = _els.card;
    var cardW = card.offsetWidth || 320;
    var cardH = card.offsetHeight || 180;
    var gap = 16; // space between spotlight and card
    var pad = 12; // viewport edge padding
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    // Candidate positions (top-left corner of card)
    var positions = {
      bottom: {
        top: rect.bottom + gap,
        left: rect.left + rect.width / 2 - cardW / 2
      },
      top: {
        top: rect.top - gap - cardH,
        left: rect.left + rect.width / 2 - cardW / 2
      },
      right: {
        top: rect.top + rect.height / 2 - cardH / 2,
        left: rect.right + gap
      },
      left: {
        top: rect.top + rect.height / 2 - cardH / 2,
        left: rect.left - gap - cardW
      }
    };

    /**
     * Check if a given card position fits within the viewport.
     */
    function fits(pos) {
      return (
        pos.top >= pad &&
        pos.left >= pad &&
        pos.top + cardH <= vh - pad &&
        pos.left + cardW <= vw - pad
      );
    }

    // Try preferred placement first
    var order = [placement, 'bottom', 'right', 'left', 'top'];
    var chosen = null;

    for (var i = 0; i < order.length; i++) {
      var candidate = positions[order[i]];
      if (candidate && fits(candidate)) {
        chosen = candidate;
        break;
      }
    }

    // If no placement fits, force bottom and clamp
    if (!chosen) {
      chosen = positions.bottom;
    }

    // Clamp to viewport
    chosen.top = Math.max(pad, Math.min(chosen.top, vh - cardH - pad));
    chosen.left = Math.max(pad, Math.min(chosen.left, vw - cardW - pad));

    card.style.top = chosen.top + 'px';
    card.style.left = chosen.left + 'px';
  }

  // ============================================================
  //  STEP RENDERING
  // ============================================================

  /**
   * Show the current step: scroll target into view, highlight it,
   * update card content, and reposition everything.
   */
  function showStep() {
    var step = STEPS[_stepIndex];
    var target = document.querySelector(step.selector);

    // If the target element doesn't exist, skip to next step
    if (!target) {
      if (_stepIndex < STEPS.length - 1) {
        _stepIndex++;
        showStep();
      } else {
        stop();
      }
      return;
    }

    // Smooth-scroll the target element into the visible area
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    // Wait for scroll to settle before positioning
    setTimeout(function () {
      var rect = target.getBoundingClientRect();

      // Position spotlight
      positionSpotlight(rect);

      // Update card content
      _els.stepLabel.textContent = 'Step ' + (_stepIndex + 1) + ' of ' + STEPS.length;
      _els.title.textContent = step.title;
      _els.desc.textContent = step.description;

      // Update button label for last step
      var isLast = (_stepIndex === STEPS.length - 1);
      _els.nextBtn.textContent = isLast ? 'Done' : 'Next';

      // Update progress dots
      var dots = _els.dots.children;
      for (var i = 0; i < dots.length; i++) {
        dots[i].className = NS + '-dot';
        if (i < _stepIndex) {
          dots[i].className += ' ' + NS + '-dot--done';
        } else if (i === _stepIndex) {
          dots[i].className += ' ' + NS + '-dot--active';
        }
      }

      // Position card relative to target
      positionCard(rect, step.placement);

      // Show spotlight and card with transition
      _els.spotlight.classList.add(NS + '-spotlight--visible');
      _els.card.classList.add(NS + '-card--visible');
    }, 350); // allow scroll animation to mostly complete
  }

  /**
   * Advance to next step, or finish tour if at last step.
   */
  function nextStep() {
    if (_stepIndex < STEPS.length - 1) {
      // Briefly fade out card for cleaner transition
      _els.card.classList.remove(NS + '-card--visible');

      setTimeout(function () {
        _stepIndex++;
        showStep();
      }, 200);
    } else {
      stop();
    }
  }

  // ============================================================
  //  EVENT HANDLERS
  // ============================================================

  /**
   * Handle keydown events: ESC to skip tour.
   */
  function handleKeyDown(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      e.preventDefault();
      stop();
    }
  }

  /**
   * Handle window resize: reposition spotlight + card.
   */
  function handleResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      if (!_active) return;
      var step = STEPS[_stepIndex];
      var rect = getTargetRect(step);
      if (!rect) return;
      positionSpotlight(rect);
      positionCard(rect, step.placement);
    }, 100);
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================

  /**
   * Start the guided tour.
   * Injects styles, builds DOM, and shows the first step.
   */
  function start() {
    if (_active) return;
    _active = true;
    _stepIndex = 0;

    injectStyles();
    createDOM();

    // Show overlay with fade-in
    requestAnimationFrame(function () {
      _els.overlay.classList.add(NS + '-overlay--visible');
      showStep();
    });

    // Bind global event listeners
    _onKeyDown = handleKeyDown;
    _onResize = handleResize;
    document.addEventListener('keydown', _onKeyDown, true);
    window.addEventListener('resize', _onResize);
  }

  /**
   * Stop the guided tour.
   * Fades out, removes DOM, cleans up events, and marks tour as completed.
   */
  function stop() {
    if (!_active) return;
    _active = false;

    // Mark as completed in localStorage
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (e) {
      // localStorage not available — fail silently
    }

    // Fade out overlay, spotlight, and card
    if (_els.overlay) _els.overlay.classList.remove(NS + '-overlay--visible');
    if (_els.spotlight) _els.spotlight.classList.remove(NS + '-spotlight--visible');
    if (_els.card) _els.card.classList.remove(NS + '-card--visible');

    // Remove DOM after transition completes
    setTimeout(function () {
      destroyDOM();
    }, 350);

    // Clean up event listeners
    if (_onKeyDown) {
      document.removeEventListener('keydown', _onKeyDown, true);
      _onKeyDown = null;
    }
    if (_onResize) {
      window.removeEventListener('resize', _onResize);
      _onResize = null;
    }
    clearTimeout(_resizeTimer);
  }

  /**
   * Check whether the tour has been completed previously.
   * @returns {boolean}
   */
  function isCompleted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * Reset the tour state so it will auto-start on next page load.
   */
  function reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }

  // ============================================================
  //  AUTO-START ON FIRST VISIT
  // ============================================================

  /**
   * Auto-start the tour for first-time visitors once the DOM
   * and other scripts have fully loaded.
   */
  function autoStart() {
    if (isCompleted()) return;

    // Delay slightly so the page has time to render and initialize
    // other modules (gauges, health monitor, etc.)
    setTimeout(function () {
      // Double-check that at least the first target element exists
      if (document.querySelector(STEPS[0].selector)) {
        start();
      }
    }, 1200);
  }

  // Trigger auto-start after page load
  if (document.readyState === 'complete') {
    autoStart();
  } else {
    window.addEventListener('load', autoStart);
  }

  // ============================================================
  //  EXPOSE PUBLIC API
  // ============================================================

  window.GuidedTour = {
    start: start,
    stop: stop,
    isCompleted: isCompleted,
    reset: reset
  };

})();
