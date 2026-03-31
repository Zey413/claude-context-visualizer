/**
 * Claude Context Window Visualizer — Scroll Animations & Micro-Interactions
 * IntersectionObserver-based entrance animations + global micro-interaction polish.
 * Respects prefers-reduced-motion.
 */

'use strict';

var ScrollFX = (function () {
  var _observer = null;
  var _prefersReduced = false;

  function init() {
    // Check reduced motion preference
    _prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (_prefersReduced) return; // Skip all animations

    _initScrollReveal();
    _initButtonFeedback();
    _initCardHover();
  }

  /**
   * Fade-in elements as they scroll into view.
   */
  function _initScrollReveal() {
    if (!('IntersectionObserver' in window)) return;

    // Tag all animatable elements
    var targets = document.querySelectorAll(
      '.glass-card, .gauge-card, .stat-item, .preset-btn, ' +
      '.token-card, .timeline-bar, .heatmap, .footer'
    );

    targets.forEach(function (el) {
      el.classList.add('scroll-reveal');
    });

    _observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          // Stagger based on index in parent
          var siblings = entry.target.parentElement
            ? Array.from(entry.target.parentElement.children)
            : [];
          var idx = siblings.indexOf(entry.target);
          var delay = Math.min(idx * 50, 300); // max 300ms stagger

          entry.target.style.transitionDelay = delay + 'ms';
          entry.target.classList.add('scroll-reveal--visible');
          _observer.unobserve(entry.target); // Only animate once
        }
      });
    }, {
      threshold: 0.05,
      rootMargin: '0px 0px -40px 0px'
    });

    targets.forEach(function (el) {
      _observer.observe(el);
    });
  }

  /**
   * Scale-down micro-interaction on button press.
   */
  function _initButtonFeedback() {
    document.addEventListener('mousedown', function (e) {
      var btn = e.target.closest('button, .preset-btn, .template-card__apply-btn, .charts-tab');
      if (!btn) return;
      btn.classList.add('btn-pressed');
    });

    document.addEventListener('mouseup', function () {
      document.querySelectorAll('.btn-pressed').forEach(function (el) {
        el.classList.remove('btn-pressed');
      });
    });

    document.addEventListener('mouseleave', function () {
      document.querySelectorAll('.btn-pressed').forEach(function (el) {
        el.classList.remove('btn-pressed');
      });
    });
  }

  /**
   * Subtle lift on hovering glass cards.
   */
  function _initCardHover() {
    // Already handled by CSS — this just ensures the class is set
    // for cards that are dynamically created
    var mutObs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.classList && node.classList.contains('glass-card')) {
            node.classList.add('card-hover-fx');
          }
        });
      });
    });

    mutObs.observe(document.body, { childList: true, subtree: true });

    // Tag existing cards
    document.querySelectorAll('.glass-card').forEach(function (el) {
      el.classList.add('card-hover-fx');
    });
  }

  return { init: init };
})();

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { ScrollFX.init(); });
} else {
  ScrollFX.init();
}
