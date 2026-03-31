/**
 * Claude Context Window Visualizer — App Controller
 * State management, sliders, events, presets, localStorage.
 * Enhanced with: particle system, usage timeline, model comparison mode.
 */

(function () {
  'use strict';

  // ---- State ----
  const state = {
    modelIndex: 0,
    tokens: { system: 0, user: 0, assistant: 0, tools: 0 },
    activePreset: null,
    compareMode: false,
    compareModelIndex: 1,
    timeline: [],          // Array of snapshot objects { tokens, modelIndex, percent }
    customColors: {},      // { system: '#...', user: '#...', ... } — persisted separately
  };

  const STORAGE_KEY = 'claude-ctx-viz';
  const COLORS_KEY = 'claude-ctx-colors';
  const MAX_TIMELINE = 10;

  // Preset color palettes users can cycle through per category
  const COLOR_PRESETS = {
    system:    ['#8B5CF6', '#A855F7', '#D946EF', '#6D28D9', '#7C3AED'],
    user:      ['#3B82F6', '#6366F1', '#0EA5E9', '#2563EB', '#0284C7'],
    assistant: ['#10B981', '#34D399', '#14B8A6', '#059669', '#22C55E'],
    tools:     ['#F59E0B', '#F97316', '#EAB308', '#D97706', '#FB923C'],
  };

  // Track whether we were previously in danger zone (for shake trigger)
  let _wasDanger = false;

  // Track previous efficiency score label for confetti trigger
  let _prevScoreLabel = '';

  // rAF-based throttle: coalesce rapid slider events into one render per frame
  let _renderRAF = null;
  function scheduleRender() {
    if (_renderRAF) return; // already scheduled for this frame
    _renderRAF = requestAnimationFrame(() => {
      _renderRAF = null;
      render();
    });
  }

  // Lazy-init flags for collapsible panels
  let _estimatorInited = false;
  let _analyticsInited = false;
  let _apiParserInited = false;
  let _replayInited = false;
  let _templatesInited = false;
  let _plannerInited = false;

  // ---- Prompt Templates ----
  const PROMPT_TEMPLATES = [
    {
      id: 'coding-assistant',
      name: 'Coding Assistant',
      icon: '\uD83D\uDCBB',
      description: 'Full-stack dev with code review capabilities',
      systemTokens: 1200,
      avgUserTokens: 800,
      avgAssistantTokens: 2000,
      avgToolTokens: 500
    },
    {
      id: 'customer-support',
      name: 'Customer Support',
      icon: '\uD83C\uDFA7',
      description: 'Help desk agent with knowledge base',
      systemTokens: 2500,
      avgUserTokens: 300,
      avgAssistantTokens: 600,
      avgToolTokens: 200
    },
    {
      id: 'data-analyst',
      name: 'Data Analyst',
      icon: '\uD83D\uDCCA',
      description: 'SQL generation and data interpretation',
      systemTokens: 1800,
      avgUserTokens: 500,
      avgAssistantTokens: 1500,
      avgToolTokens: 3000
    },
    {
      id: 'creative-writer',
      name: 'Creative Writer',
      icon: '\u270D\uFE0F',
      description: 'Long-form content generation',
      systemTokens: 800,
      avgUserTokens: 400,
      avgAssistantTokens: 4000,
      avgToolTokens: 0
    },
    {
      id: 'rag-agent',
      name: 'RAG Agent',
      icon: '\uD83D\uDD0D',
      description: 'Retrieval-augmented generation with large context',
      systemTokens: 3000,
      avgUserTokens: 15000,
      avgAssistantTokens: 2000,
      avgToolTokens: 8000
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      icon: '\uD83E\uDD16',
      description: 'Autonomous coding agent with many tool calls',
      systemTokens: 5000,
      avgUserTokens: 3000,
      avgAssistantTokens: 8000,
      avgToolTokens: 25000
    }
  ];

  // Track which template is currently applied
  let _activeTemplateId = null;

  // ---- Conversation Replay Scenarios ----
  const REPLAY_SCENARIOS = [
    {
      id: 'simple-qa',
      name: 'Simple Q&A',
      description: '10 turns of short questions and answers',
      systemTokens: 500,
      turns: [
        { user: 800,  assistant: 1200, tools: 0 },
        { user: 400,  assistant: 1500, tools: 0 },
        { user: 600,  assistant: 1100, tools: 0 },
        { user: 350,  assistant: 900,  tools: 0 },
        { user: 500,  assistant: 1300, tools: 0 },
        { user: 450,  assistant: 1000, tools: 0 },
        { user: 700,  assistant: 1400, tools: 0 },
        { user: 300,  assistant: 800,  tools: 0 },
        { user: 550,  assistant: 1200, tools: 0 },
        { user: 400,  assistant: 1100, tools: 0 },
      ]
    },
    {
      id: 'code-assistant',
      name: 'Code Assistant',
      description: '8 turns with tool calls for code editing',
      systemTokens: 1200,
      turns: [
        { user: 1500, assistant: 2000, tools: 800 },
        { user: 600,  assistant: 3500, tools: 1200 },
        { user: 900,  assistant: 2800, tools: 1500 },
        { user: 400,  assistant: 4000, tools: 2000 },
        { user: 1200, assistant: 3000, tools: 1800 },
        { user: 500,  assistant: 3500, tools: 2200 },
        { user: 800,  assistant: 2500, tools: 1000 },
        { user: 350,  assistant: 4500, tools: 2500 },
      ]
    },
    {
      id: 'document-analysis',
      name: 'Document Analysis',
      description: '5 turns with a large document and deep analysis',
      systemTokens: 3000,
      turns: [
        { user: 25000, assistant: 3000, tools: 0 },
        { user: 2000,  assistant: 5000, tools: 0 },
        { user: 1500,  assistant: 8000, tools: 0 },
        { user: 800,   assistant: 6000, tools: 500 },
        { user: 1200,  assistant: 7000, tools: 0 },
      ]
    },
  ];

  // Replay state
  let _replayState = {
    scenarioIndex: 0,
    currentTurn: 0,        // 0 = not started, 1+ = turn in progress
    currentHalf: 'user',   // 'user' or 'assistant' within a turn
    playing: false,
    timerId: null,
    cumulativeTokens: { system: 0, user: 0, assistant: 0, tools: 0 },
  };

  // ---- Smooth Number Counter Animation ----
  const _activeAnimations = {};

  /**
   * Animate a numeric value counting up/down over a given duration.
   * @param {HTMLElement} element - DOM element whose textContent to animate
   * @param {number} start - Starting value
   * @param {number} end - Ending value
   * @param {number} duration - Animation duration in ms (default 300)
   */
  function animateValue(element, start, end, duration) {
    if (!element) return;
    duration = duration || 300;

    var id = element.id || ('_anim_' + Math.random());
    if (_activeAnimations[id]) {
      cancelAnimationFrame(_activeAnimations[id]);
      delete _activeAnimations[id];
    }

    if (start === end) {
      element.textContent = formatNumber(end);
      return;
    }

    var startTime = performance.now();
    var diff = end - start;

    function step(now) {
      var elapsed = now - startTime;
      var progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(start + diff * eased);
      element.textContent = formatNumber(current);

      if (progress < 1) {
        _activeAnimations[id] = requestAnimationFrame(step);
      } else {
        element.textContent = formatNumber(end);
        delete _activeAnimations[id];
      }
    }

    _activeAnimations[id] = requestAnimationFrame(step);
  }

  /**
   * Parse a formatted number string back to an integer (e.g. "1,234" -> 1234).
   */
  function parseDisplayedNumber(el) {
    if (!el) return 0;
    return parseInt(el.textContent.replace(/,/g, '').trim(), 10) || 0;
  }

  // ---- Confetti Effect ----
  /**
   * Trigger a brief CSS confetti burst — 20 colored dots falling from top.
   */
  function triggerConfetti() {
    var container = document.createElement('div');
    container.className = 'confetti-container';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    var colors = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];
    for (var i = 0; i < 20; i++) {
      var dot = document.createElement('div');
      dot.className = 'confetti-dot';
      dot.style.left = (Math.random() * 100) + '%';
      dot.style.background = colors[i % colors.length];
      dot.style.animationDelay = (Math.random() * 0.5) + 's';
      dot.style.animationDuration = (1 + Math.random() * 1) + 's';
      container.appendChild(dot);
    }

    // Remove after animations complete
    setTimeout(function () {
      if (container.parentNode) container.parentNode.removeChild(container);
    }, 2500);
  }

  // ---- Welcome Onboarding Tooltip ----
  function initOnboardingTooltip() {
    var ONBOARD_KEY = 'claude-ctx-onboarded';
    try {
      if (localStorage.getItem(ONBOARD_KEY)) return;
    } catch (e) { return; }

    var tooltip = document.createElement('div');
    tooltip.className = 'onboarding-tooltip';
    tooltip.innerHTML =
      '<span class="onboarding-tooltip__text">Drag the sliders to adjust token allocation \u2192</span>' +
      '<button class="onboarding-tooltip__btn" id="onboarding-dismiss">Got it</button>';

    // Insert near the gauge
    var gaugeCard = document.getElementById('gauge-card-primary');
    if (gaugeCard) {
      gaugeCard.style.position = 'relative';
      gaugeCard.appendChild(tooltip);
    }

    // Force reflow then show
    void tooltip.offsetWidth;
    tooltip.classList.add('onboarding-tooltip--visible');

    var _onboardDismissed = false;
    function dismiss() {
      if (_onboardDismissed) return;
      _onboardDismissed = true;
      tooltip.classList.remove('onboarding-tooltip--visible');
      try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) { /* ignore */ }
      setTimeout(function () {
        if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
      }, 300);
    }

    var dismissBtn = document.getElementById('onboarding-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', dismiss);
    }

    // Auto-dismiss after 8 seconds
    setTimeout(dismiss, 8000);
  }

  // ---- DOM References ----
  const modelSelect = document.getElementById('model-select');
  const gaugeStatus = document.getElementById('gauge-status');
  const presetsGrid = document.getElementById('presets-grid');
  const compareToggle = document.getElementById('compare-toggle');
  const gaugeSection = document.getElementById('gauge-section');
  const gaugeCardPrimary = document.getElementById('gauge-card-primary');
  const gaugeCardCompare = document.getElementById('gauge-card-compare');
  const gaugeLabelPrimary = document.getElementById('gauge-label-primary');
  const gaugeLabelCompare = document.getElementById('gauge-label-compare');
  const gaugeStatusCompare = document.getElementById('gauge-status-compare');
  const compareModelSelect = document.getElementById('compare-model-select');
  const timelineChart = document.getElementById('timeline-chart');
  const timelineCount = document.getElementById('timeline-count');
  const gaugeContainer = document.getElementById('gauge-container');

  const sliders = {};
  const inputs = {};
  const valueEls = {};
  const barEls = {};
  const percentEls = {};
  const dotEls = {};

  const categories = ['system', 'user', 'assistant', 'tools'];
  const SPARKLINE_COLORS = {
    system: '#8B5CF6',
    user: '#3B82F6',
    assistant: '#10B981',
    tools: '#F59E0B',
  };
  categories.forEach(cat => {
    sliders[cat] = document.getElementById(`slider-${cat}`);
    inputs[cat] = document.getElementById(`input-${cat}`);
    valueEls[cat] = document.getElementById(`${cat}-value`);
    barEls[cat] = document.getElementById(`${cat}-bar`);
    percentEls[cat] = document.getElementById(`${cat}-percent`);
  });

  // Collect slider dots for color cycling
  document.querySelectorAll('.slider-row').forEach(row => {
    const cat = row.dataset.category;
    if (cat) {
      dotEls[cat] = row.querySelector('.slider-label__dot');
    }
  });

  const statTotalUsed = document.getElementById('stat-total-used');
  const statRemaining = document.getElementById('stat-remaining');
  const statContextWindow = document.getElementById('stat-context-window');
  const statOutputLimit = document.getElementById('stat-output-limit');

  // Usage breakdown elements
  const breakdownSegments = {};
  const breakdownLabels = {};
  categories.forEach(cat => {
    breakdownSegments[cat] = document.getElementById(`breakdown-seg-${cat}`);
    breakdownLabels[cat] = document.getElementById(`breakdown-lbl-${cat}`);
  });
  const breakdownSegRemaining = document.getElementById('breakdown-seg-remaining');
  const breakdownCostLine = document.getElementById('breakdown-cost-line');

  // ---- Gauge ----
  const gauge = new GaugeRenderer('gauge-container');
  let gaugeCompare = null; // Created lazily when compare mode is activated

  // ---- Particle System ----
  const particles = new ParticleSystem();
  particles.start();

  // ---- Context Window Heatmap ----
  const _heatmap = {
    grid: null,
    tooltip: null,
    cells: [],           // Array of cell DOM elements
    cellCount: 0,        // Current number of cells in the grid
    cellCategories: [],  // Category string per cell ('system','user','assistant','tools','remaining')
  };

  /**
   * Determine the grid size based on the model's context window.
   * 1M models get 10x10=100 cells, 200K models get 8x8=64.
   */
  function getHeatmapCellCount(contextWindow) {
    return contextWindow >= 500000 ? 100 : 64;
  }

  /**
   * Initialize the heatmap: create the grid container reference and tooltip.
   */
  function initHeatmap() {
    _heatmap.grid = document.getElementById('heatmap-grid');
    if (!_heatmap.grid) return;

    // Create shared tooltip element
    _heatmap.tooltip = document.createElement('div');
    _heatmap.tooltip.className = 'heatmap__tooltip';
    _heatmap.tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_heatmap.tooltip);

    // Build initial cells for the default model
    const model = CLAUDE_MODELS[state.modelIndex];
    buildHeatmapCells(getHeatmapCellCount(model.contextWindow));
  }

  /**
   * Build (or rebuild) heatmap cells when the total cell count changes.
   */
  function buildHeatmapCells(count) {
    if (!_heatmap.grid) return;
    _heatmap.cellCount = count;
    _heatmap.cells = [];
    _heatmap.cellCategories = [];
    _heatmap.grid.innerHTML = '';

    for (var i = 0; i < count; i++) {
      var cell = document.createElement('div');
      cell.className = 'heatmap__cell heatmap__cell--remaining';
      cell.dataset.index = i;
      _heatmap.grid.appendChild(cell);
      _heatmap.cells.push(cell);
      _heatmap.cellCategories.push('remaining');
    }

    // Attach a single delegated mousemove + mouseleave on the grid for performance
    _heatmap.grid.addEventListener('mousemove', heatmapMouseMove);
    _heatmap.grid.addEventListener('mouseleave', heatmapMouseLeave);
  }

  /**
   * Show tooltip near the hovered cell.
   */
  function heatmapMouseMove(e) {
    var cell = e.target.closest('.heatmap__cell');
    if (!cell) {
      _heatmap.tooltip.classList.remove('heatmap__tooltip--visible');
      return;
    }

    var idx = parseInt(cell.dataset.index, 10);
    if (isNaN(idx)) return;

    var model = CLAUDE_MODELS[state.modelIndex];
    var tokensPerCell = model.contextWindow / _heatmap.cellCount;
    var rangeStart = Math.floor(idx * tokensPerCell) + 1;
    var rangeEnd = Math.floor((idx + 1) * tokensPerCell);
    var category = _heatmap.cellCategories[idx] || 'remaining';
    var catLabel = category.charAt(0).toUpperCase() + category.slice(1);

    _heatmap.tooltip.textContent = 'Tokens ' + formatNumber(rangeStart) + ' - ' + formatNumber(rangeEnd) + ' (' + catLabel + ')';
    _heatmap.tooltip.classList.add('heatmap__tooltip--visible');

    // Position near cursor
    var tx = e.clientX + 12;
    var ty = e.clientY - 32;

    // Keep tooltip in viewport
    var tw = _heatmap.tooltip.offsetWidth;
    if (tx + tw > window.innerWidth - 8) {
      tx = e.clientX - tw - 8;
    }
    if (ty < 4) {
      ty = e.clientY + 16;
    }

    _heatmap.tooltip.style.left = tx + 'px';
    _heatmap.tooltip.style.top = ty + 'px';
  }

  function heatmapMouseLeave() {
    _heatmap.tooltip.classList.remove('heatmap__tooltip--visible');
  }

  /**
   * Update the heatmap cells based on current token state.
   * Only updates cells whose category has changed (efficient diffing).
   */
  function updateHeatmap() {
    if (!_heatmap.grid || _heatmap.cellCount === 0) return;

    var model = CLAUDE_MODELS[state.modelIndex];
    var desiredCount = getHeatmapCellCount(model.contextWindow);

    // Rebuild grid if cell count changed (model switch)
    if (desiredCount !== _heatmap.cellCount) {
      buildHeatmapCells(desiredCount);
    }

    var totalCells = _heatmap.cellCount;
    var tokensPerCell = model.contextWindow / totalCells;

    // Calculate how many cells each category occupies (in order: system, user, assistant, tools, remaining)
    var catOrder = ['system', 'user', 'assistant', 'tools'];
    var catCells = {};
    var usedCells = 0;

    catOrder.forEach(function (cat) {
      var cells = Math.round(state.tokens[cat] / tokensPerCell);
      // Don't let rounding exceed remaining cells
      cells = Math.min(cells, totalCells - usedCells);
      catCells[cat] = cells;
      usedCells += cells;
    });

    // Get active colors (custom or default)
    var catColors = {};
    catOrder.forEach(function (cat) {
      catColors[cat] = getCatColor(cat);
    });

    // Fill cells left-to-right, top-to-bottom
    var cellIdx = 0;
    for (var c = 0; c < catOrder.length; c++) {
      var cat = catOrder[c];
      var count = catCells[cat];
      for (var j = 0; j < count; j++) {
        if (cellIdx >= totalCells) break;
        if (_heatmap.cellCategories[cellIdx] !== cat) {
          _heatmap.cellCategories[cellIdx] = cat;
          var cell = _heatmap.cells[cellIdx];
          cell.className = 'heatmap__cell heatmap__cell--' + cat;
          cell.style.backgroundColor = catColors[cat];
        }
        cellIdx++;
      }
    }

    // Fill remaining cells
    for (; cellIdx < totalCells; cellIdx++) {
      if (_heatmap.cellCategories[cellIdx] !== 'remaining') {
        _heatmap.cellCategories[cellIdx] = 'remaining';
        var remCell = _heatmap.cells[cellIdx];
        remCell.className = 'heatmap__cell heatmap__cell--remaining';
        remCell.style.backgroundColor = '';
      }
    }

    // Update legend dot colors to match custom colors
    updateHeatmapLegendColors(catColors);
  }

  /**
   * Keep the legend dots in sync with any custom category colors.
   */
  function updateHeatmapLegendColors(catColors) {
    var legendEl = document.getElementById('heatmap-legend');
    if (!legendEl) return;
    var dots = legendEl.querySelectorAll('.heatmap__legend-dot:not(.heatmap__legend-dot--remaining)');
    var catOrder = ['system', 'user', 'assistant', 'tools'];
    dots.forEach(function (dot, i) {
      if (catOrder[i] && catColors[catOrder[i]]) {
        dot.style.backgroundColor = catColors[catOrder[i]];
      }
    });
  }


  // ---- Category Color Helpers ----

  /**
   * Get the active color for a category, falling back to the default.
   */
  function getCatColor(cat) {
    return state.customColors[cat] || TOKEN_CATEGORIES.find(c => c.id === cat).color;
  }

  /**
   * Apply current custom colors to all UI elements: dots, sliders, bars, gauge segments.
   */
  function applyCustomColors() {
    categories.forEach(cat => {
      const color = getCatColor(cat);
      if (dotEls[cat]) dotEls[cat].style.background = color;
      if (sliders[cat]) sliders[cat].style.setProperty('--slider-color', color);
      if (barEls[cat]) barEls[cat].style.setProperty('--cat-color', color);
      // Sync breakdown bar segment & label colors
      if (breakdownSegments[cat]) breakdownSegments[cat].style.setProperty('--seg-color', color);
      if (breakdownLabels[cat]) breakdownLabels[cat].style.color = color;
    });
    gauge.setSegmentColors(categories.map(getCatColor));
    if (gaugeCompare) {
      gaugeCompare.setSegmentColors(categories.map(getCatColor));
    }
    // Re-render heatmap to pick up new colors
    if (_heatmap.grid && _heatmap.cellCount > 0) {
      // Force all cells to re-render by clearing cached categories
      _heatmap.cellCategories = _heatmap.cellCategories.map(function () { return ''; });
      updateHeatmap();
    }
  }

  function saveColors() {
    try {
      localStorage.setItem(COLORS_KEY, JSON.stringify(state.customColors));
    } catch (e) { /* ignore */ }
  }

  function loadColors() {
    try {
      const raw = localStorage.getItem(COLORS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      categories.forEach(cat => {
        if (typeof data[cat] === 'string') {
          state.customColors[cat] = data[cat];
        }
      });
    } catch (e) { /* ignore */ }
  }

  /**
   * Initialize click-to-cycle on category color dots.
   */
  function initColorCycling() {
    categories.forEach(cat => {
      const dot = dotEls[cat];
      if (!dot) return;
      dot.title = 'Click to cycle color';
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        const palette = COLOR_PRESETS[cat];
        const current = getCatColor(cat);
        const idx = palette.indexOf(current);
        const next = palette[(idx + 1) % palette.length];
        state.customColors[cat] = next;
        applyCustomColors();
        saveColors();
      });
    });
  }

  // ---- Gauge Animations ----

  /**
   * Trigger the burst animation on the gauge container.
   */
  function triggerGaugeBurst() {
    if (!gaugeContainer) return;
    gaugeContainer.classList.remove('gauge-container--burst');
    void gaugeContainer.offsetWidth;
    gaugeContainer.classList.add('gauge-container--burst');
    gaugeContainer.addEventListener('animationend', function handler() {
      gaugeContainer.classList.remove('gauge-container--burst');
      gaugeContainer.removeEventListener('animationend', handler);
    });
  }

  /**
   * Trigger screen shake on the primary gauge card when entering danger zone.
   */
  function triggerDangerShake() {
    if (!gaugeCardPrimary) return;
    gaugeCardPrimary.classList.remove('gauge-card--shake');
    void gaugeCardPrimary.offsetWidth;
    gaugeCardPrimary.classList.add('gauge-card--shake');
    gaugeCardPrimary.addEventListener('animationend', function handler() {
      gaugeCardPrimary.classList.remove('gauge-card--shake');
      gaugeCardPrimary.removeEventListener('animationend', handler);
    });
  }

  // ---- Init Models ----
  function initModelSelect() {
    if (!modelSelect || !compareModelSelect) return;
    CLAUDE_MODELS.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${m.name}`;
      modelSelect.appendChild(opt);
    });
    modelSelect.addEventListener('change', () => {
      state.modelIndex = parseInt(modelSelect.value);
      state.activePreset = null;
      updateSliderMax();
      clampTokens();
      render();
      save();
    });

    // Populate compare model select
    CLAUDE_MODELS.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${m.name}`;
      compareModelSelect.appendChild(opt);
    });
    compareModelSelect.value = state.compareModelIndex;
    compareModelSelect.addEventListener('change', () => {
      state.compareModelIndex = parseInt(compareModelSelect.value);
      renderCompareGauge();
      save();
    });
  }

  // ---- Init Presets ----
  function initPresets() {
    if (!presetsGrid) return;
    PRESETS.forEach((preset, i) => {
      const btn = document.createElement('button');
      btn.classList.add('preset-btn');
      btn.dataset.presetIndex = i;
      const keys = typeof I18n !== 'undefined' ? I18n.getPresetKeys(i) : null;
      const name = keys ? I18n.t(keys.name) : preset.name;
      const desc = keys ? I18n.t(keys.desc) : preset.description;
      btn.innerHTML = `<span class="preset-btn__icon">${preset.icon}</span>${name}`;
      btn.title = desc;
      btn.setAttribute('aria-label', name + ': ' + desc);
      btn.addEventListener('click', () => applyPreset(i));
      presetsGrid.appendChild(btn);
    });
  }

  function applyPreset(index) {
    const preset = PRESETS[index];
    const model = CLAUDE_MODELS[state.modelIndex];

    categories.forEach(cat => {
      state.tokens[cat] = Math.round(model.contextWindow * preset.allocation[cat]);
    });
    state.activePreset = index;
    clearActiveTemplate();

    // Trigger burst animation on preset switch
    triggerGaugeBurst();

    syncSlidersFromState();
    pushTimelineSnapshot();
    render();
    save();
  }

  /**
   * Clear the active template visual state when another action changes the sliders.
   */
  function clearActiveTemplate() {
    if (_activeTemplateId === null) return;
    _activeTemplateId = null;
    var allCards = document.querySelectorAll('.template-card');
    allCards.forEach(function (card) {
      card.classList.remove('template-card--active');
    });
    var allBtns = document.querySelectorAll('.template-card__apply-btn');
    allBtns.forEach(function (btn) {
      btn.classList.remove('template-card__apply-btn--applied');
      btn.textContent = 'Apply';
    });
  }

  // ---- Slider & Input Logic ----
  function updateSliderMax() {
    const model = CLAUDE_MODELS[state.modelIndex];
    categories.forEach(cat => {
      if (sliders[cat]) sliders[cat].max = model.contextWindow;
      if (inputs[cat]) inputs[cat].max = model.contextWindow;
    });
  }

  function clampTokens() {
    const model = CLAUDE_MODELS[state.modelIndex];
    categories.forEach(cat => {
      state.tokens[cat] = Math.min(state.tokens[cat], model.contextWindow);
    });
    // Ensure total doesn't exceed context
    const total = categories.reduce((s, c) => s + state.tokens[c], 0);
    if (total > model.contextWindow) {
      const scale = model.contextWindow / total;
      categories.forEach(cat => {
        state.tokens[cat] = Math.round(state.tokens[cat] * scale);
      });
    }
  }

  function syncSlidersFromState() {
    categories.forEach(cat => {
      if (sliders[cat]) sliders[cat].value = state.tokens[cat];
      if (inputs[cat]) inputs[cat].value = state.tokens[cat];
    });
  }

  function initSliders() {
    categories.forEach(cat => {
      if (!sliders[cat] || !inputs[cat]) return;
      // Slider input
      sliders[cat].addEventListener('input', () => {
        const val = parseInt(sliders[cat].value) || 0;
        state.tokens[cat] = val;
        enforceMax(cat);
        inputs[cat].value = state.tokens[cat];
        state.activePreset = null;
        clearActiveTemplate();
        pushTimelineSnapshot();
        scheduleRender();
        save();
      });

      // Number input
      inputs[cat].addEventListener('input', () => {
        const val = parseInt(inputs[cat].value) || 0;
        state.tokens[cat] = Math.max(0, val);
        enforceMax(cat);
        sliders[cat].value = state.tokens[cat];
        state.activePreset = null;
        clearActiveTemplate();
        pushTimelineSnapshot();
        scheduleRender();
        save();
      });

      inputs[cat].addEventListener('blur', () => {
        inputs[cat].value = state.tokens[cat];
      });
    });
  }

  /**
   * If total tokens exceeds context window, reduce the changed category to fit.
   */
  function enforceMax(changedCat) {
    const model = CLAUDE_MODELS[state.modelIndex];
    const total = categories.reduce((s, c) => s + state.tokens[c], 0);
    if (total > model.contextWindow) {
      const excess = total - model.contextWindow;
      state.tokens[changedCat] = Math.max(0, state.tokens[changedCat] - excess);
    }
  }

  // ---- Timeline ----
  // Debounce timeline pushes so rapid slider drags don't flood it
  let _timelineDebounce = null;
  let _lastTimelineTotal = -1;

  function pushTimelineSnapshot() {
    clearTimeout(_timelineDebounce);
    _timelineDebounce = setTimeout(() => {
      const model = CLAUDE_MODELS[state.modelIndex];
      const total = categories.reduce((s, c) => s + state.tokens[c], 0);

      // Skip if nothing changed
      if (total === _lastTimelineTotal) return;
      _lastTimelineTotal = total;

      const percent = model.contextWindow > 0 ? (total / model.contextWindow) * 100 : 0;

      const snapshot = {
        tokens: { ...state.tokens },
        modelIndex: state.modelIndex,
        percent: Math.min(percent, 100),
        total: total,
        contextWindow: model.contextWindow,
      };

      state.timeline.push(snapshot);
      if (state.timeline.length > MAX_TIMELINE) {
        state.timeline.shift();
      }

      renderTimeline();
    }, 300);
  }

  function renderTimeline() {
    const snapshots = state.timeline;
    const snapshotsLabel = typeof I18n !== 'undefined' ? I18n.t('snapshots') : 'snapshots';
    timelineCount.textContent = `${snapshots.length} / ${MAX_TIMELINE} ${snapshotsLabel}`;

    if (snapshots.length === 0) {
      const emptyText = typeof I18n !== 'undefined' ? I18n.t('adjustSlidersToRecord') : 'Adjust sliders to record snapshots';
      timelineChart.innerHTML = `<div class="timeline-empty">${emptyText}</div>`;
      renderSparklines();
      return;
    }

    timelineChart.innerHTML = '';

    const usedLabel = typeof I18n !== 'undefined' ? I18n.t('used') : 'used';
    snapshots.forEach((snap, i) => {
      const bar = document.createElement('div');
      bar.classList.add('timeline-bar');

      const pct = snap.percent;
      const remainPct = 100 - pct;

      // Compute segment percentages relative to context window
      const segPcts = {};
      categories.forEach(cat => {
        segPcts[cat] = snap.contextWindow > 0 ? (snap.tokens[cat] / snap.contextWindow) * 100 : 0;
      });

      // Build stacked bar from bottom to top: system, user, assistant, tools, remaining
      // Remaining goes on top
      const remainSeg = document.createElement('div');
      remainSeg.classList.add('timeline-bar__segment', 'timeline-bar__segment--remaining');
      remainSeg.style.height = remainPct + '%';
      bar.appendChild(remainSeg);

      // Segments in reverse order so tools is on top, system on bottom
      ['tools', 'assistant', 'user', 'system'].forEach(cat => {
        const seg = document.createElement('div');
        seg.classList.add('timeline-bar__segment', `timeline-bar__segment--${cat}`);
        seg.style.height = segPcts[cat] + '%';
        bar.appendChild(seg);
      });

      // Tooltip
      const tooltip = document.createElement('div');
      tooltip.classList.add('timeline-bar__tooltip');
      tooltip.textContent = `${pct.toFixed(1)}% ${usedLabel}`;
      bar.appendChild(tooltip);

      // Animate in with a stagger
      bar.style.animation = `fadeSlideIn 0.3s ease ${i * 0.03}s both`;

      timelineChart.appendChild(bar);
    });

    renderSparklines();
  }

  // ---- Sparklines ----
  function renderSparklines() {
    const snapshots = state.timeline;

    categories.forEach(cat => {
      const container = document.getElementById(`${cat}-sparkline`);
      if (!container) return;

      const color = SPARKLINE_COLORS[cat];
      const gradId = `spark-grad-${cat}`;

      // Get last 10 values for this category
      const last10 = snapshots.slice(-MAX_TIMELINE);
      const values = last10.map(s => s.tokens[cat] || 0);

      // SVG dimensions (viewBox coordinates)
      const W = 100;
      const H = 24;
      const padY = 2; // vertical padding so line doesn't clip edges

      // If no data or all zeros, draw a flat baseline
      if (values.length === 0) {
        container.innerHTML =
          `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
            `<line x1="0" y1="${H - padY}" x2="${W}" y2="${H - padY}" stroke="${color}" stroke-opacity="0.25" stroke-width="1" />` +
          `</svg>`;
        return;
      }

      const maxVal = Math.max(...values, 1); // avoid division by zero
      const count = values.length;

      // Compute points
      const points = values.map((v, i) => {
        const x = count === 1 ? W / 2 : (i / (count - 1)) * W;
        const y = padY + (H - 2 * padY) * (1 - v / maxVal);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });

      const polylineStr = points.join(' ');
      // Closed polygon for the gradient fill area (goes down to bottom-right, then bottom-left)
      const firstX = count === 1 ? (W / 2).toFixed(1) : '0.0';
      const lastX = count === 1 ? (W / 2).toFixed(1) : W.toFixed(1);
      const fillStr = `${polylineStr} ${lastX},${H} ${firstX},${H}`;

      container.innerHTML =
        `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
          `<defs>` +
            `<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
              `<stop offset="0%" stop-color="${color}" stop-opacity="0.25" />` +
              `<stop offset="100%" stop-color="${color}" stop-opacity="0" />` +
            `</linearGradient>` +
          `</defs>` +
          `<polygon points="${fillStr}" fill="url(#${gradId})" />` +
          `<polyline points="${polylineStr}" fill="none" stroke="${color}" stroke-opacity="0.6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />` +
        `</svg>`;
    });
  }

  // ---- Comparison Mode ----
  function initCompareMode() {
    if (!compareToggle) return;
    compareToggle.addEventListener('click', () => {
      state.compareMode = !state.compareMode;
      toggleCompareMode();
      save();
    });
  }

  function toggleCompareMode() {
    // Update ARIA pressed state
    compareToggle.setAttribute('aria-pressed', state.compareMode ? 'true' : 'false');

    if (state.compareMode) {
      compareToggle.classList.add('compare-btn--active');
      gaugeSection.classList.add('gauge-section--compare');
      gaugeCardCompare.style.display = '';

      // Lazily create compare gauge
      if (!gaugeCompare) {
        gaugeCompare = new GaugeRenderer('gauge-container-compare');
        // Apply custom colors to the compare gauge too
        gaugeCompare.setSegmentColors(categories.map(getCatColor));
      }

      // Set compare model select to a different model than primary if same
      if (state.compareModelIndex === state.modelIndex) {
        state.compareModelIndex = (state.modelIndex + 1) % CLAUDE_MODELS.length;
        compareModelSelect.value = state.compareModelIndex;
      }

      renderCompareGauge();
    } else {
      compareToggle.classList.remove('compare-btn--active');
      gaugeSection.classList.remove('gauge-section--compare');
      gaugeCardCompare.style.display = 'none';
    }

    // Update primary label visibility
    updateModelLabels();
  }

  function updateModelLabels() {
    if (state.compareMode) {
      gaugeLabelPrimary.textContent = CLAUDE_MODELS[state.modelIndex].name;
      gaugeLabelCompare.textContent = CLAUDE_MODELS[state.compareModelIndex].name;
    } else {
      gaugeLabelPrimary.textContent = '';
      gaugeLabelCompare.textContent = '';
    }
  }

  function renderCompareGauge() {
    if (!gaugeCompare || !state.compareMode) return;

    const compareModel = CLAUDE_MODELS[state.compareModelIndex];

    // Apply the same token allocations but clamped to the compare model's context window
    const compareTokens = {};
    let total = 0;
    categories.forEach(cat => {
      compareTokens[cat] = Math.min(state.tokens[cat], compareModel.contextWindow);
      total += compareTokens[cat];
    });

    // Scale down if total exceeds compare model's window
    if (total > compareModel.contextWindow && total > 0) {
      const scale = compareModel.contextWindow / total;
      categories.forEach(cat => {
        compareTokens[cat] = Math.round(compareTokens[cat] * scale);
      });
      total = categories.reduce((s, c) => s + compareTokens[c], 0);
    }

    gaugeCompare.update(compareTokens, compareModel.contextWindow);

    // Update compare status
    const percent = compareModel.contextWindow > 0 ? (total / compareModel.contextWindow) * 100 : 0;

    // Update compare gauge ARIA progressbar
    const compareContainer = document.getElementById('gauge-container-compare');
    if (compareContainer) {
      compareContainer.setAttribute('aria-valuenow', Math.round(percent));
    }

    const statusText = gaugeStatusCompare.querySelector('.gauge-status__text');
    gaugeStatusCompare.classList.remove('gauge-status--warning', 'gauge-status--danger');
    if (percent >= 90) {
      gaugeStatusCompare.classList.add('gauge-status--danger');
      statusText.textContent = typeof I18n !== 'undefined' ? I18n.t('statusCritical') : 'Critical';
    } else if (percent >= 70) {
      gaugeStatusCompare.classList.add('gauge-status--warning');
      statusText.textContent = typeof I18n !== 'undefined' ? I18n.t('statusWarning') : 'Warning';
    } else {
      statusText.textContent = typeof I18n !== 'undefined' ? I18n.t('statusNormal') : 'Normal';
    }

    updateModelLabels();
  }

  // ---- Render ----
  function render() {
    const model = CLAUDE_MODELS[state.modelIndex];
    const total = categories.reduce((s, c) => s + state.tokens[c], 0);
    const percent = model.contextWindow > 0 ? (total / model.contextWindow) * 100 : 0;

    // Update gauge
    gauge.update(state.tokens, model.contextWindow);

    // Update primary gauge ARIA progressbar
    if (gaugeContainer) {
      gaugeContainer.setAttribute('aria-valuenow', Math.round(percent));
    }

    // Update particle system with current usage
    particles.setUsage(percent);

    // Update cards (with animated counters)
    categories.forEach(cat => {
      var oldVal = parseDisplayedNumber(valueEls[cat]);
      var newVal = state.tokens[cat];
      animateValue(valueEls[cat], oldVal, newVal, 300);
      const pct = model.contextWindow > 0 ? (state.tokens[cat] / model.contextWindow) * 100 : 0;
      barEls[cat].style.width = pct + '%';
      percentEls[cat].textContent = pct.toFixed(1) + '%';
      // Update meter ARIA values
      const meterEl = barEls[cat].parentElement;
      if (meterEl && meterEl.hasAttribute('aria-valuenow')) {
        meterEl.setAttribute('aria-valuenow', Math.round(pct));
      }
    });

    // Update usage breakdown bar & labels
    updateUsageBreakdown(model, total);

    // Update context window heatmap
    updateHeatmap();

    // Update sparklines
    renderSparklines();

    // Stats bar (animated counters)
    var oldTotalUsed = parseDisplayedNumber(statTotalUsed);
    var oldRemaining = parseDisplayedNumber(statRemaining);
    animateValue(statTotalUsed, oldTotalUsed, total, 300);
    animateValue(statRemaining, oldRemaining, Math.max(0, model.contextWindow - total), 300);
    statContextWindow.textContent = formatTokensShort(model.contextWindow);
    statOutputLimit.textContent = formatTokensShort(model.outputLimit);

    // Status indicator (with i18n)
    const statusText = gaugeStatus.querySelector('.gauge-status__text');
    gaugeStatus.classList.remove('gauge-status--warning', 'gauge-status--danger');
    const isDanger = percent >= 90;
    if (isDanger) {
      gaugeStatus.classList.add('gauge-status--danger');
      statusText.textContent = typeof I18n !== 'undefined' ? I18n.t('statusCritical') : 'Critical';
    } else if (percent >= 70) {
      gaugeStatus.classList.add('gauge-status--warning');
      statusText.textContent = typeof I18n !== 'undefined' ? I18n.t('statusWarning') : 'Warning';
    } else {
      statusText.textContent = typeof I18n !== 'undefined' ? I18n.t('statusNormal') : 'Normal';
    }

    // Remaining color
    statRemaining.style.color = percent >= 90 ? '#EF4444' : percent >= 70 ? '#F59E0B' : '#10B981';

    // Trigger screen shake when first entering danger zone (>90%)
    if (isDanger && !_wasDanger) {
      triggerDangerShake();
    }
    _wasDanger = isDanger;

    // Preset button active state
    document.querySelectorAll('.preset-btn').forEach((btn, i) => {
      btn.classList.toggle('preset-btn--active', i === state.activePreset);
    });

    // Update comparison gauge if active
    if (state.compareMode) {
      renderCompareGauge();
    }

    // Update analytics panel
    updateAnalytics();

    // Update pricing comparison table
    updatePricingTable();

    // Update conversation turns estimate
    updateConversationTurns();

    // Update dashboard if visible
    if (typeof Dashboard !== 'undefined' && Dashboard.isVisible()) {
      Dashboard.update(state);
    }
  }

  // ---- Keyboard Shortcuts ----
  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'r' || e.key === 'R') {
        resetState();
      } else if (e.key >= '1' && e.key <= '4') {
        applyPreset(parseInt(e.key) - 1);
      } else if (e.key === 'c' || e.key === 'C') {
        state.compareMode = !state.compareMode;
        toggleCompareMode();
        save();
      } else if (e.key === 't' || e.key === 'T') {
        toggleTheme();
      } else if (e.key === 'd' || e.key === 'D') {
        if (typeof Dashboard !== 'undefined') Dashboard.toggle(state);
      }
    });
  }

  function resetState() {
    // Cancel any running counter animations
    Object.keys(_activeAnimations).forEach(function (id) {
      cancelAnimationFrame(_activeAnimations[id]);
      delete _activeAnimations[id];
    });
    categories.forEach(cat => { state.tokens[cat] = 0; });
    state.activePreset = null;
    syncSlidersFromState();
    pushTimelineSnapshot();
    render();
    save();
  }

  // ---- Persistence ----
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        modelDataVersion: MODEL_DATA_VERSION,
        modelIndex: state.modelIndex,
        tokens: state.tokens,
        activePreset: state.activePreset,
        compareMode: state.compareMode,
        compareModelIndex: state.compareModelIndex,
        timeline: state.timeline,
      }));
    } catch (e) { /* quota exceeded, ignore */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);

      // Migration: if saved data is from v1 (no modelDataVersion), remap model indices
      var needsMigration = !data.modelDataVersion || data.modelDataVersion < MODEL_DATA_VERSION;

      if (typeof data.modelIndex === 'number') {
        if (needsMigration && typeof migrateModelIndex === 'function') {
          state.modelIndex = migrateModelIndex(data.modelIndex);
        } else if (data.modelIndex < CLAUDE_MODELS.length) {
          state.modelIndex = data.modelIndex;
        }
      }
      if (data.tokens) {
        categories.forEach(cat => {
          if (typeof data.tokens[cat] === 'number') {
            state.tokens[cat] = data.tokens[cat];
          }
        });
      }
      if (typeof data.activePreset === 'number') {
        state.activePreset = data.activePreset;
      }
      if (typeof data.compareMode === 'boolean') {
        state.compareMode = data.compareMode;
      }
      if (typeof data.compareModelIndex === 'number') {
        if (needsMigration && typeof migrateModelIndex === 'function') {
          state.compareModelIndex = migrateModelIndex(data.compareModelIndex);
        } else if (data.compareModelIndex < CLAUDE_MODELS.length) {
          state.compareModelIndex = data.compareModelIndex;
        }
      }
      if (Array.isArray(data.timeline)) {
        state.timeline = data.timeline.slice(-MAX_TIMELINE);
      }

      // If migrated, re-save immediately with new version
      if (needsMigration) {
        save();
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- Usage Breakdown Bar ----
  const BREAKDOWN_ICONS = { system: '⚙️', user: '👤', assistant: '🤖', tools: '🔧' };

  function updateUsageBreakdown(model, total) {
    categories.forEach(cat => {
      const pct = model.contextWindow > 0 ? (state.tokens[cat] / model.contextWindow) * 100 : 0;
      if (breakdownSegments[cat]) {
        breakdownSegments[cat].style.width = pct > 0 ? pct + '%' : '0%';
        // Sync color with custom color
        const color = getCatColor(cat);
        breakdownSegments[cat].style.setProperty('--seg-color', color);
      }
      if (breakdownLabels[cat]) {
        breakdownLabels[cat].textContent = BREAKDOWN_ICONS[cat] + ' ' + Math.round(pct) + '%';
        breakdownLabels[cat].style.color = getCatColor(cat);
      }
    });

    // Token-per-dollar indicator
    if (breakdownCostLine) {
      // Blended cost: average of input & output price per MTok, weighted by usage
      const inputTokens = ['system', 'user', 'tools'].reduce((s, c) => s + state.tokens[c], 0);
      const outputTokens = state.tokens.assistant;
      const costPerMil = total > 0
        ? ((inputTokens / total) * model.pricing.inputPerMTok + (outputTokens / total) * model.pricing.outputPerMTok)
        : model.pricing.inputPerMTok;
      // tokens per $0.001 = (0.001 / (costPerMil / 1_000_000)) = 1000 / costPerMil
      const tokensPerMilli = costPerMil > 0 ? Math.round(1000 / costPerMil) : 0;
      breakdownCostLine.textContent = '~' + formatNumber(tokensPerMilli) + ' tokens per $0.001';
    }
  }

  // ---- Analytics & Insights ----
  const COST_CATEGORIES_INPUT = ['system', 'user', 'tools'];
  const COST_CATEGORIES_OUTPUT = ['assistant'];

  function initAnalytics() {
    const toggle = document.getElementById('analytics-toggle');
    const card = document.getElementById('analytics-card');
    if (!toggle || !card) return;

    toggle.addEventListener('click', () => {
      const isOpen = card.classList.toggle('analytics-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

      // Lazy init: update analytics content on first open
      if (isOpen && !_analyticsInited) {
        _analyticsInited = true;
        updateAnalytics();
      }
    });
  }

  /**
   * Calculate efficiency score (0-100) based on:
   * - Token diversity: are multiple categories being used?
   * - Remaining headroom: sweet spot is 10-30% remaining
   */
  function calcEfficiencyScore(tokens, contextWindow) {
    const total = categories.reduce((s, c) => s + tokens[c], 0);
    if (total === 0 || contextWindow === 0) return 0;

    const remainPct = ((contextWindow - total) / contextWindow) * 100;

    // Diversity score (0-50): how many categories are used & how balanced
    const nonZero = categories.filter(c => tokens[c] > 0).length;
    const diversityBase = (nonZero / categories.length) * 30; // up to 30 pts for using all categories

    // Balance bonus: penalise if one category dominates (>70% of used)
    let balanceBonus = 0;
    if (total > 0) {
      const maxCatPct = Math.max(...categories.map(c => tokens[c] / total));
      balanceBonus = (1 - maxCatPct) * 20; // up to 20 pts for balance
    }

    // Headroom score (0-50): sweet spot is 10-30% remaining
    let headroomScore = 0;
    if (remainPct >= 10 && remainPct <= 30) {
      headroomScore = 50; // perfect
    } else if (remainPct > 30 && remainPct <= 50) {
      headroomScore = 35;
    } else if (remainPct > 50 && remainPct <= 80) {
      headroomScore = 20;
    } else if (remainPct > 80) {
      headroomScore = 10; // too much room, probably underutilized
    } else if (remainPct >= 5 && remainPct < 10) {
      headroomScore = 30; // tight but ok
    } else {
      headroomScore = 10; // <5% remaining — dangerously close
    }

    return Math.min(100, Math.round(diversityBase + balanceBonus + headroomScore));
  }

  function getScoreLabel(score) {
    if (score >= 80) return { label: 'Excellent', cls: 'excellent', color: 'var(--accent-green)' };
    if (score >= 60) return { label: 'Good', cls: 'good', color: 'var(--accent-blue)' };
    if (score >= 40) return { label: 'Fair', cls: 'fair', color: 'var(--accent-amber)' };
    return { label: 'Poor', cls: 'poor', color: 'var(--accent-red)' };
  }

  /**
   * Calculate estimated cost per request based on model pricing.
   * Input = system + user + tools, Output = assistant.
   */
  function calcCostEstimate(tokens, model) {
    const inputTokens = COST_CATEGORIES_INPUT.reduce((s, c) => s + tokens[c], 0);
    const outputTokens = COST_CATEGORIES_OUTPUT.reduce((s, c) => s + tokens[c], 0);

    const inputCost = (inputTokens / 1_000_000) * model.pricing.inputPerMTok;
    const outputCost = (outputTokens / 1_000_000) * model.pricing.outputPerMTok;

    return inputCost + outputCost;
  }

  /**
   * Generate optimization tips based on current token allocation.
   */
  function generateTips(tokens, contextWindow) {
    const total = categories.reduce((s, c) => s + tokens[c], 0);
    if (total === 0 || contextWindow === 0) {
      return [{ text: 'Adjust sliders to see personalized tips', cls: '' }];
    }

    const tips = [];
    const systemPct = tokens.system / contextWindow;
    const toolsPct = tokens.tools / contextWindow;
    const remainPct = (contextWindow - total) / contextWindow;

    if (systemPct > 0.10) {
      tips.push({ text: 'Consider reducing system prompt length', cls: 'analytics-tip--amber' });
    }
    if (toolsPct > 0.30) {
      tips.push({ text: 'Heavy tool usage detected \u2014 consider schema optimization', cls: 'analytics-tip--amber' });
    }
    if (remainPct < 0.10) {
      tips.push({ text: 'Near limit \u2014 consider summarizing conversation history', cls: 'analytics-tip--red' });
    }
    if (remainPct > 0.80) {
      tips.push({ text: 'Plenty of room \u2014 you can add more context', cls: 'analytics-tip--green' });
    }

    // Always have at least one tip
    if (tips.length === 0) {
      if (remainPct >= 0.10 && remainPct <= 0.30) {
        tips.push({ text: 'Great headroom balance \u2014 context usage looks optimal', cls: 'analytics-tip--green' });
      } else {
        tips.push({ text: 'Usage looks reasonable for this configuration', cls: 'analytics-tip--blue' });
      }
    }

    // Cap at 3 tips
    return tips.slice(0, 3);
  }

  /**
   * Update the analytics panel with current state.
   */
  function updateAnalytics() {
    // Skip if analytics panel hasn't been opened yet (lazy init)
    if (!_analyticsInited) return;

    const model = CLAUDE_MODELS[state.modelIndex];

    // Efficiency score
    const score = calcEfficiencyScore(state.tokens, model.contextWindow);
    const scoreInfo = getScoreLabel(score);
    const scoreValueEl = document.getElementById('score-value');
    const scoreBadgeEl = document.getElementById('score-badge');
    if (scoreValueEl) {
      scoreValueEl.textContent = score;
      scoreValueEl.style.color = scoreInfo.color;
    }
    if (scoreBadgeEl) {
      scoreBadgeEl.textContent = scoreInfo.label;
      scoreBadgeEl.className = 'analytics-score__badge analytics-score__badge--' + scoreInfo.cls;
    }

    // Trigger confetti when score first reaches Excellent
    if (scoreInfo.label === 'Excellent' && _prevScoreLabel !== 'Excellent') {
      triggerConfetti();
    }
    _prevScoreLabel = scoreInfo.label;

    // Cost estimate
    const cost = calcCostEstimate(state.tokens, model);
    const costValueEl = document.getElementById('cost-value');
    if (costValueEl) {
      costValueEl.textContent = '$' + cost.toFixed(3);
    }

    // Optimization tips
    const tips = generateTips(state.tokens, model.contextWindow);
    const tipsList = document.getElementById('tips-list');
    if (tipsList) {
      tipsList.innerHTML = '';
      tips.forEach(tip => {
        const li = document.createElement('li');
        li.className = 'analytics-tip' + (tip.cls ? ' ' + tip.cls : '');
        li.textContent = tip.text;
        tipsList.appendChild(li);
      });
    }
  }

  // ---- Model Cost Comparison ----
  let _pricingInited = false;

  function initPricing() {
    const toggle = document.getElementById('pricing-toggle');
    const card = document.getElementById('pricing-card');
    if (!toggle || !card) return;

    toggle.addEventListener('click', () => {
      const isOpen = card.classList.toggle('pricing-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

      if (isOpen && !_pricingInited) {
        _pricingInited = true;
        updatePricingTable();
      }
    });
  }

  /**
   * Calculate input/output/total cost for a given model using current token allocations.
   */
  function calcModelCost(tokens, model) {
    var inputTokens = ['system', 'user', 'tools'].reduce(function (s, c) { return s + tokens[c]; }, 0);
    var outputTokens = tokens.assistant;
    var inputCost = (inputTokens / 1000000) * model.pricing.inputPerMTok;
    var outputCost = (outputTokens / 1000000) * model.pricing.outputPerMTok;
    return { inputCost: inputCost, outputCost: outputCost, totalCost: inputCost + outputCost };
  }

  /**
   * Update the pricing comparison table with costs for all models based on current slider values.
   */
  function updatePricingTable() {
    if (!_pricingInited) return;

    var tbody = document.getElementById('pricing-tbody');
    var recEl = document.getElementById('pricing-recommendation');
    if (!tbody) return;

    var currentModelIndex = state.modelIndex;
    var total = categories.reduce(function (s, c) { return s + state.tokens[c]; }, 0);

    // Calculate costs for all models
    var rows = CLAUDE_MODELS.map(function (model, idx) {
      var costs = calcModelCost(state.tokens, model);
      return {
        index: idx,
        name: model.name,
        inputCost: costs.inputCost,
        outputCost: costs.outputCost,
        totalCost: costs.totalCost
      };
    });

    // Find most expensive and cheapest
    var maxCost = 0;
    var minCost = Infinity;
    var cheapestIdx = 0;
    rows.forEach(function (r) {
      if (r.totalCost > maxCost) maxCost = r.totalCost;
      if (r.totalCost < minCost) { minCost = r.totalCost; cheapestIdx = r.index; }
    });

    // If all costs are zero (no tokens), treat uniformly
    var allZero = total === 0;

    tbody.innerHTML = '';

    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.className = 'pricing-tr';

      var isActive = r.index === currentModelIndex;
      var isCheapest = r.index === cheapestIdx && !allZero;
      var isExpensive = maxCost > 0 && r.totalCost === maxCost && !allZero;

      if (isActive) tr.classList.add('pricing-tr--active');
      if (isCheapest) tr.classList.add('pricing-tr--cheapest');

      // Model name cell
      var tdModel = document.createElement('td');
      tdModel.className = 'pricing-td pricing-td--model';
      var nameStr = '';
      if (isActive) nameStr += '<span class="pricing-active-dot"></span>';
      nameStr += r.name.replace(/\s*\(\d+K?\)/, ''); // strip context size for brevity
      if (isCheapest) nameStr += '<span class="pricing-cheapest-badge">Best</span>';
      tdModel.innerHTML = nameStr;
      tr.appendChild(tdModel);

      // Input cost
      var tdInput = document.createElement('td');
      tdInput.className = 'pricing-td pricing-td--num';
      tdInput.textContent = '$' + r.inputCost.toFixed(3);
      tr.appendChild(tdInput);

      // Output cost
      var tdOutput = document.createElement('td');
      tdOutput.className = 'pricing-td pricing-td--num';
      tdOutput.textContent = '$' + r.outputCost.toFixed(3);
      tr.appendChild(tdOutput);

      // Total cost
      var tdTotal = document.createElement('td');
      tdTotal.className = 'pricing-td pricing-td--num pricing-td--total';
      tdTotal.textContent = '$' + r.totalCost.toFixed(3);
      tr.appendChild(tdTotal);

      // Savings
      var tdSavings = document.createElement('td');
      tdSavings.className = 'pricing-td pricing-td--num pricing-td--savings';
      if (allZero || isExpensive || maxCost === 0) {
        tdSavings.innerHTML = '<span class="pricing-savings--none">\u2014</span>';
      } else {
        var savingsPct = Math.round((1 - r.totalCost / maxCost) * 100);
        tdSavings.innerHTML = '<span class="pricing-savings--positive">' + savingsPct + '%&nbsp;\u2193</span>';
      }
      tr.appendChild(tdSavings);

      tbody.appendChild(tr);
    });

    // Recommendation line
    if (recEl) {
      if (allZero) {
        recEl.textContent = '';
      } else {
        var cheapestModel = CLAUDE_MODELS[cheapestIdx];
        var cheapestName = cheapestModel.name.replace(/\s*\(\d+K?\)/, '');
        var savingsVsMax = maxCost > 0 ? Math.round((1 - minCost / maxCost) * 100) : 0;
        if (savingsVsMax > 0 && cheapestIdx !== currentModelIndex) {
          recEl.innerHTML = '<strong>Best value:</strong> ' + cheapestName +
            ' saves ' + savingsVsMax + '% vs most expensive with the same context';
        } else if (cheapestIdx === currentModelIndex && savingsVsMax > 0) {
          recEl.innerHTML = '<strong>Great choice!</strong> ' + cheapestName +
            ' is already the most cost-effective option (' + savingsVsMax + '% savings)';
        } else {
          recEl.textContent = '';
        }
      }
    }
  }

  // ---- Token Estimator ----
  const ESTIMATOR_CHIPS = [
    { label: '1 page of code',    tokens: 400,  category: 'user' },
    { label: '1 system prompt',   tokens: 500,  category: 'system' },
    { label: '1 long response',   tokens: 2000, category: 'assistant' },
    { label: '1 tool schema',     tokens: 300,  category: 'tools' },
    { label: '10 tool calls',     tokens: 3000, category: 'tools' },
  ];

  // CJK Unicode ranges (common blocks)
  const CJK_REGEX = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\u{20000}-\u{2FA1F}]/u;

  function estimateTokens(text) {
    if (!text) return 0;
    let tokens = 0;
    let nonCjkBuffer = '';
    for (const ch of text) {
      if (CJK_REGEX.test(ch)) {
        // Flush non-CJK buffer first
        if (nonCjkBuffer) {
          const words = nonCjkBuffer.split(/\s+/).filter(Boolean);
          tokens += words.length * 1.3;
          nonCjkBuffer = '';
        }
        tokens += 0.4;  // CJK: ~0.4 tokens per character
      } else {
        nonCjkBuffer += ch;
      }
    }
    // Flush remaining non-CJK
    if (nonCjkBuffer) {
      const words = nonCjkBuffer.split(/\s+/).filter(Boolean);
      tokens += words.length * 1.3;
    }
    return Math.round(tokens);
  }

  function addTokensToCategory(category, amount) {
    const model = CLAUDE_MODELS[state.modelIndex];
    const currentTotal = categories.reduce((s, c) => s + state.tokens[c], 0);
    const available = model.contextWindow - currentTotal;
    const clamped = Math.max(0, Math.min(amount, available));
    state.tokens[category] += clamped;
    state.activePreset = null;
    syncSlidersFromState();
    pushTimelineSnapshot();
    render();
    save();
  }

  function initEstimator() {
    const toggle = document.getElementById('estimator-toggle');
    const card = document.getElementById('estimator-card');

    if (!toggle || !card) return;

    // Only wire up the toggle; defer full init until first open
    toggle.addEventListener('click', () => {
      const isOpen = card.classList.toggle('estimator-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

      // Lazy init: build chips and bind textarea events on first open
      if (isOpen && !_estimatorInited) {
        _estimatorInited = true;
        _initEstimatorBody();
      }
    });
  }

  function _initEstimatorBody() {
    const textarea = document.getElementById('estimator-textarea');
    const countEl = document.getElementById('estimator-count');
    const addBtn = document.getElementById('estimator-add-btn');
    const addTarget = document.getElementById('estimator-add-target');
    const chipsContainer = document.getElementById('estimator-chips');

    // Live token estimation from textarea
    let _estimateDebounce = null;
    textarea.addEventListener('input', () => {
      clearTimeout(_estimateDebounce);
      _estimateDebounce = setTimeout(() => {
        const count = estimateTokens(textarea.value);
        countEl.textContent = formatNumber(count);
      }, 150);
    });

    // Add estimated tokens button
    addBtn.addEventListener('click', () => {
      const count = estimateTokens(textarea.value);
      if (count > 0) {
        addTokensToCategory(addTarget.value, count);
      }
    });

    // Build quick-estimate chips
    ESTIMATOR_CHIPS.forEach(chip => {
      const btn = document.createElement('button');
      btn.classList.add('estimator-chip');
      btn.innerHTML = `${chip.label} <span class="estimator-chip__tokens">(~${formatNumber(chip.tokens)})</span>`;
      btn.title = `Add ~${formatNumber(chip.tokens)} tokens to ${chip.category}`;
      btn.setAttribute('aria-label', `${chip.label}: add approximately ${formatNumber(chip.tokens)} tokens to ${chip.category}`);
      btn.addEventListener('click', () => {
        addTokensToCategory(chip.category, chip.tokens);
      });
      chipsContainer.appendChild(btn);
    });
  }

  // ---- API Response Parser ----
  let _parsedUsage = null;     // Last parsed usage data
  let _mappedTokens = null;    // Mapped token distribution
  let _simAnimFrame = null;    // requestAnimationFrame ID for simulation
  let _simRunning = false;     // Whether simulation is active

  function initApiParser() {
    const toggle = document.getElementById('api-parser-toggle');
    const card = document.getElementById('api-parser-card');

    if (!toggle || !card) return;

    // Only wire up the toggle; defer full init until first open
    toggle.addEventListener('click', () => {
      const isOpen = card.classList.toggle('api-parser-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

      // Lazy init: bind parse/clear/apply/simulate buttons on first open
      if (isOpen && !_apiParserInited) {
        _apiParserInited = true;
        _initApiParserBody();
      }
    });
  }

  function _initApiParserBody() {
    const textarea = document.getElementById('api-response-textarea');
    const parseBtn = document.getElementById('api-parse-btn');
    const clearBtn = document.getElementById('api-clear-btn');
    const applyBtn = document.getElementById('api-apply-btn');
    const simulateBtn = document.getElementById('api-simulate-btn');
    const stopBtn = document.getElementById('api-simulate-stop-btn');

    // Parse button
    parseBtn.addEventListener('click', () => {
      parseApiResponse(textarea.value);
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
      textarea.value = '';
      _parsedUsage = null;
      _mappedTokens = null;
      document.getElementById('api-parser-result').style.display = 'none';
      document.getElementById('api-parser-error').style.display = 'none';
    });

    // Apply button
    applyBtn.addEventListener('click', () => {
      if (_mappedTokens) {
        applyParsedTokens(_mappedTokens);
      }
    });

    // Simulate buttons
    simulateBtn.addEventListener('click', startSimulation);
    stopBtn.addEventListener('click', stopSimulation);
  }

  /**
   * Parse a Claude API response JSON string and extract usage data.
   */
  function parseApiResponse(jsonStr) {
    const resultEl = document.getElementById('api-parser-result');
    const errorEl = document.getElementById('api-parser-error');

    // Hide previous
    resultEl.style.display = 'none';
    errorEl.style.display = 'none';
    _parsedUsage = null;
    _mappedTokens = null;

    if (!jsonStr || !jsonStr.trim()) {
      showParserError('Please paste a Claude API response JSON.');
      return;
    }

    let data;
    try {
      data = JSON.parse(jsonStr.trim());
    } catch (e) {
      showParserError('Invalid JSON: ' + e.message);
      return;
    }

    // Find the usage field — support both top-level and nested
    let usage = data.usage;
    if (!usage && data.message && data.message.usage) {
      usage = data.message.usage;
    }
    if (!usage || typeof usage !== 'object') {
      showParserError('No "usage" field found in the JSON. Expected a Claude API response with usage metadata.');
      return;
    }

    const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
    const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
    const cacheCreation = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
    const cacheRead = typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0;

    _parsedUsage = { inputTokens, outputTokens, cacheCreation, cacheRead };

    // Map tokens to categories
    // System gets ~10% of input, Tools get ~15% of input, User gets the rest
    const systemTokens = Math.round(inputTokens * 0.10);
    const toolsTokens = Math.round(inputTokens * 0.15);
    const userTokens = inputTokens - systemTokens - toolsTokens;
    const assistantTokens = outputTokens;

    _mappedTokens = {
      system: systemTokens,
      user: userTokens,
      assistant: assistantTokens,
      tools: toolsTokens,
    };

    // Display parsed values
    document.getElementById('parsed-input-tokens').textContent = formatNumber(inputTokens);
    document.getElementById('parsed-output-tokens').textContent = formatNumber(outputTokens);
    document.getElementById('parsed-cache-creation').textContent = formatNumber(cacheCreation);
    document.getElementById('parsed-cache-read').textContent = formatNumber(cacheRead);

    // Display mapping preview
    document.getElementById('mapped-system').textContent = formatNumber(systemTokens);
    document.getElementById('mapped-user').textContent = formatNumber(userTokens);
    document.getElementById('mapped-assistant').textContent = formatNumber(assistantTokens);
    document.getElementById('mapped-tools').textContent = formatNumber(toolsTokens);

    resultEl.style.display = '';
  }

  function showParserError(msg) {
    const errorEl = document.getElementById('api-parser-error');
    errorEl.textContent = msg;
    errorEl.style.display = '';
  }

  /**
   * Apply parsed and mapped tokens to the gauge sliders.
   */
  function applyParsedTokens(mapped) {
    const model = CLAUDE_MODELS[state.modelIndex];

    // Clamp total to context window
    let total = categories.reduce((s, c) => s + mapped[c], 0);
    if (total > model.contextWindow && total > 0) {
      const scale = model.contextWindow / total;
      categories.forEach(cat => {
        mapped[cat] = Math.round(mapped[cat] * scale);
      });
    }

    categories.forEach(cat => {
      state.tokens[cat] = mapped[cat];
    });

    state.activePreset = null;
    triggerGaugeBurst();
    syncSlidersFromState();
    pushTimelineSnapshot();
    render();
    save();
    updateConversationTurns();
  }

  /**
   * Simulate a multi-turn conversation growing over 5 seconds.
   * Uses requestAnimationFrame for smooth animation.
   */
  function startSimulation() {
    if (_simRunning) return;
    _simRunning = true;

    const simulateBtn = document.getElementById('api-simulate-btn');
    const stopBtn = document.getElementById('api-simulate-stop-btn');
    const statusEl = document.getElementById('api-simulate-status');

    simulateBtn.style.display = 'none';
    stopBtn.style.display = '';
    statusEl.textContent = 'Simulating...';

    const model = CLAUDE_MODELS[state.modelIndex];
    const targetTotal = Math.round(model.contextWindow * 0.85); // Simulate to 85%

    // Define per-turn token distribution (typical conversation pattern)
    const turnPattern = {
      system: 0.03,    // System set once
      user: 0.35,      // User messages grow
      assistant: 0.50, // Assistant messages dominate
      tools: 0.12,     // Some tool usage
    };

    // Reset to zero for simulation
    categories.forEach(cat => { state.tokens[cat] = 0; });

    const DURATION = 5000; // 5 seconds
    const startTime = performance.now();
    let turnCount = 0;
    let lastTurnTime = 0;
    const TURN_INTERVAL = 300; // "turn" every 300ms for visual effect

    function animateFrame(now) {
      if (!_simRunning) return;

      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION, 1);

      // Ease-in-out cubic
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const currentTarget = Math.round(targetTotal * eased);

      // Distribute tokens according to pattern
      categories.forEach(cat => {
        state.tokens[cat] = Math.round(currentTarget * turnPattern[cat]);
      });

      // Count simulated "turns"
      if (elapsed - lastTurnTime > TURN_INTERVAL) {
        turnCount++;
        lastTurnTime = elapsed;
        statusEl.textContent = 'Simulating... Turn ' + turnCount;
      }

      syncSlidersFromState();
      render();
      updateConversationTurns();

      if (progress < 1) {
        _simAnimFrame = requestAnimationFrame(animateFrame);
      } else {
        // Simulation complete
        finishSimulation(turnCount);
      }
    }

    _simAnimFrame = requestAnimationFrame(animateFrame);
  }

  function finishSimulation(turnCount) {
    _simRunning = false;
    _simAnimFrame = null;

    const simulateBtn = document.getElementById('api-simulate-btn');
    const stopBtn = document.getElementById('api-simulate-stop-btn');
    const statusEl = document.getElementById('api-simulate-status');

    simulateBtn.style.display = '';
    stopBtn.style.display = 'none';
    statusEl.textContent = 'Done! ' + turnCount + ' turns simulated.';

    // Clear status after 3s
    setTimeout(() => {
      if (!_simRunning) {
        statusEl.textContent = '';
      }
    }, 3000);

    pushTimelineSnapshot();
    save();
  }

  function stopSimulation() {
    _simRunning = false;
    if (_simAnimFrame) {
      cancelAnimationFrame(_simAnimFrame);
      _simAnimFrame = null;
    }

    const simulateBtn = document.getElementById('api-simulate-btn');
    const stopBtn = document.getElementById('api-simulate-stop-btn');
    const statusEl = document.getElementById('api-simulate-status');

    simulateBtn.style.display = '';
    stopBtn.style.display = 'none';
    statusEl.textContent = 'Stopped.';

    setTimeout(() => {
      if (!_simRunning) {
        statusEl.textContent = '';
      }
    }, 2000);

    pushTimelineSnapshot();
    save();
  }

  /**
   * Update the conversation turns counter.
   * Estimates remaining turns based on average message size per turn.
   */
  function updateConversationTurns() {
    const turnsValueEl = document.getElementById('turns-remaining');
    const turnsDetailEl = document.getElementById('turns-detail');
    if (!turnsValueEl || !turnsDetailEl) return;

    const model = CLAUDE_MODELS[state.modelIndex];
    const total = categories.reduce((s, c) => s + state.tokens[c], 0);
    const remaining = model.contextWindow - total;

    if (total === 0 || remaining <= 0) {
      turnsValueEl.textContent = total === 0 ? '--' : '0';
      turnsDetailEl.textContent = total === 0 ? 'Based on avg. message size' : 'Context window is full';
      turnsValueEl.style.color = '';
      return;
    }

    // Calculate average per-turn cost: (user + assistant) tokens represent one turn
    const userTokens = state.tokens.user;
    const assistantTokens = state.tokens.assistant;
    const turnTokens = userTokens + assistantTokens;

    // Use timeline history for a better estimate if available
    let avgTurnSize;
    if (state.timeline.length >= 2) {
      const recent = state.timeline.slice(-5);
      const turnSizes = recent.map(s => (s.tokens.user || 0) + (s.tokens.assistant || 0));
      avgTurnSize = turnSizes.reduce((s, v) => s + v, 0) / turnSizes.length;
    } else {
      avgTurnSize = turnTokens;
    }

    if (avgTurnSize <= 0) {
      turnsValueEl.textContent = '--';
      turnsDetailEl.textContent = 'Need user + assistant tokens to estimate';
      turnsValueEl.style.color = '';
      return;
    }

    const estimatedTurns = Math.floor(remaining / avgTurnSize);
    turnsValueEl.textContent = estimatedTurns.toLocaleString();

    const avgFormatted = formatNumber(Math.round(avgTurnSize));
    turnsDetailEl.textContent = '~' + avgFormatted + ' tokens/turn avg.';

    // Color-code the value
    if (estimatedTurns <= 3) {
      turnsValueEl.style.color = 'var(--accent-red)';
    } else if (estimatedTurns <= 10) {
      turnsValueEl.style.color = 'var(--accent-amber)';
    } else {
      turnsValueEl.style.color = 'var(--accent-green)';
    }
  }

  // ---- Prompt Templates ----
  function initTemplates() {
    const toggle = document.getElementById('templates-toggle');
    const card = document.getElementById('templates-card');

    if (!toggle || !card) return;

    toggle.addEventListener('click', () => {
      const isOpen = card.classList.toggle('templates-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

      if (isOpen && !_templatesInited) {
        _templatesInited = true;
        _initTemplatesBody();
      }
    });
  }

  function _initTemplatesBody() {
    const grid = document.getElementById('templates-grid');
    if (!grid) return;

    PROMPT_TEMPLATES.forEach(function (tpl) {
      var totalTokens = tpl.systemTokens + tpl.avgUserTokens + tpl.avgAssistantTokens + tpl.avgToolTokens;

      var card = document.createElement('div');
      card.className = 'template-card';
      card.dataset.templateId = tpl.id;

      // Compute segment percentages for the mini bar
      var sysPct = (tpl.systemTokens / totalTokens) * 100;
      var userPct = (tpl.avgUserTokens / totalTokens) * 100;
      var asstPct = (tpl.avgAssistantTokens / totalTokens) * 100;
      var toolPct = (tpl.avgToolTokens / totalTokens) * 100;

      // Header: icon + name + description
      var headerHTML =
        '<div class="template-card__header">' +
          '<span class="template-card__icon" aria-hidden="true">' + tpl.icon + '</span>' +
          '<div class="template-card__info">' +
            '<div class="template-card__name">' + tpl.name + '</div>' +
            '<div class="template-card__desc">' + tpl.description + '</div>' +
            '<div class="template-card__tokens">' + formatNumber(totalTokens) + ' tokens total</div>' +
          '</div>' +
        '</div>';

      // Mini proportional bar
      var barHTML =
        '<div class="template-card__bar">' +
          '<div class="template-card__bar-seg template-card__bar-seg--system" style="width:' + sysPct.toFixed(1) + '%"></div>' +
          '<div class="template-card__bar-seg template-card__bar-seg--user" style="width:' + userPct.toFixed(1) + '%"></div>' +
          '<div class="template-card__bar-seg template-card__bar-seg--assistant" style="width:' + asstPct.toFixed(1) + '%"></div>' +
          '<div class="template-card__bar-seg template-card__bar-seg--tools" style="width:' + toolPct.toFixed(1) + '%"></div>' +
          '<div class="template-card__bar-seg template-card__bar-seg--remaining"></div>' +
        '</div>';

      // Apply button
      var btnHTML =
        '<button class="template-card__apply-btn" data-template-id="' + tpl.id + '" ' +
          'title="Apply ' + tpl.name + ' template to sliders" ' +
          'aria-label="Apply ' + tpl.name + ' template: ' + tpl.description + '">' +
          'Apply' +
        '</button>';

      card.innerHTML = headerHTML + barHTML + btnHTML;
      grid.appendChild(card);
    });

    // Delegate click events on apply buttons
    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('.template-card__apply-btn');
      if (!btn) return;
      var templateId = btn.dataset.templateId;
      applyTemplate(templateId);
    });
  }

  /**
   * Apply a prompt template by smoothly animating sliders to the target values.
   */
  function applyTemplate(templateId) {
    var tpl = PROMPT_TEMPLATES.find(function (t) { return t.id === templateId; });
    if (!tpl) return;

    var targetTokens = {
      system: tpl.systemTokens,
      user: tpl.avgUserTokens,
      assistant: tpl.avgAssistantTokens,
      tools: tpl.avgToolTokens
    };

    // Clamp total to context window
    var model = CLAUDE_MODELS[state.modelIndex];
    var total = categories.reduce(function (s, c) { return s + targetTokens[c]; }, 0);
    if (total > model.contextWindow && total > 0) {
      var scale = model.contextWindow / total;
      categories.forEach(function (cat) {
        targetTokens[cat] = Math.round(targetTokens[cat] * scale);
      });
    }

    // Update active template tracking
    _activeTemplateId = templateId;
    state.activePreset = null;

    // Update active visual state on cards
    var allCards = document.querySelectorAll('.template-card');
    allCards.forEach(function (card) {
      card.classList.toggle('template-card--active', card.dataset.templateId === templateId);
    });
    var allBtns = document.querySelectorAll('.template-card__apply-btn');
    allBtns.forEach(function (btn) {
      var isActive = btn.dataset.templateId === templateId;
      btn.classList.toggle('template-card__apply-btn--applied', isActive);
      btn.textContent = isActive ? 'Applied \u2713' : 'Apply';
    });

    // Smoothly animate sliders to target values
    animateSlidersTo(targetTokens);
  }

  /**
   * Animate all sliders smoothly from current to target values over 400ms.
   */
  function animateSlidersTo(targetTokens) {
    var startTokens = {};
    categories.forEach(function (cat) {
      startTokens[cat] = state.tokens[cat];
    });

    var duration = 400;
    var startTime = performance.now();

    function step(now) {
      var elapsed = now - startTime;
      var progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      var eased = 1 - Math.pow(1 - progress, 3);

      categories.forEach(function (cat) {
        var val = Math.round(startTokens[cat] + (targetTokens[cat] - startTokens[cat]) * eased);
        state.tokens[cat] = val;
        if (sliders[cat]) sliders[cat].value = val;
        if (inputs[cat]) inputs[cat].value = val;
      });

      render();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        // Ensure final values are exact
        categories.forEach(function (cat) {
          state.tokens[cat] = targetTokens[cat];
        });
        syncSlidersFromState();
        triggerGaugeBurst();
        pushTimelineSnapshot();
        render();
        save();
      }
    }

    requestAnimationFrame(step);
  }

  // ---- Context Budget Planner ----
  /**
   * Planner recommendation profiles.
   * Each combination of answers maps to a model index, token allocation proportions,
   * and a utilization target.
   */
  const PLANNER_PROFILES = {
    // Use-case base allocations (proportions of context window)
    usecase: {
      'simple-chat':  { system: 0.02, user: 0.08, assistant: 0.12, tools: 0.00 },
      'code-assist':  { system: 0.05, user: 0.15, assistant: 0.25, tools: 0.10 },
      'doc-analysis': { system: 0.03, user: 0.45, assistant: 0.15, tools: 0.02 },
      'agentic':      { system: 0.06, user: 0.10, assistant: 0.20, tools: 0.30 },
    },
    // Conversation length multipliers (scale user + assistant proportionally)
    length: {
      'short':     1.0,
      'medium':    1.8,
      'long':      2.8,
      'very-long': 4.0,
    },
    // Tool adjustments (added to tools allocation)
    tools: {
      'none':    0.00,
      'light':   0.03,
      'heavy':   0.10,
      'agentic': 0.20,
    },
    // Budget -> model index preference: [cheapest, balanced, max]
    budget: {
      'cheapest':  [6, 6, 6],  // Haiku always for cheapest (index 6 = Claude 3.5 Haiku)
      'balanced':  [6, 5, 1],  // Haiku, 3.5 Sonnet, 4 Sonnet
      'max':       [1, 0, 0],  // 4 Sonnet, 4 Opus, 4 Opus
    },
  };

  /**
   * Compute a recommendation from planner answers.
   * Returns { modelIndex, tokens: { system, user, assistant, tools }, utilization, cost }
   */
  function computePlannerRecommendation(usecase, length, tools, budget) {
    // Start with use-case base allocation
    var base = PLANNER_PROFILES.usecase[usecase];
    if (!base) return null;

    var alloc = {
      system: base.system,
      user: base.user,
      assistant: base.assistant,
      tools: base.tools,
    };

    // Scale user + assistant by conversation length
    var lenMult = PLANNER_PROFILES.length[length] || 1.0;
    alloc.user *= lenMult;
    alloc.assistant *= lenMult;

    // Add tools overhead
    var toolsAdd = PLANNER_PROFILES.tools[tools] || 0;
    alloc.tools += toolsAdd;

    // Compute total utilization
    var totalProportion = alloc.system + alloc.user + alloc.assistant + alloc.tools;

    // Determine complexity tier for model selection (0=low, 1=mid, 2=high)
    var complexityScore = 0;
    if (usecase === 'code-assist' || usecase === 'agentic') complexityScore++;
    if (length === 'long' || length === 'very-long') complexityScore++;
    if (tools === 'heavy' || tools === 'agentic') complexityScore++;
    var tier = Math.min(complexityScore, 2);

    // Need large context window?
    var needsLargeContext = totalProportion > 0.80 || length === 'very-long';

    // Select model from budget preferences
    var budgetModels = PLANNER_PROFILES.budget[budget] || [3, 2, 1];
    var modelIdx = budgetModels[tier];

    // If we need very large context and selected model doesn't have 1M, consider 1M Sonnet
    if (needsLargeContext && budget === 'max') {
      modelIdx = 4; // Claude 4.5 Sonnet (1M)
    }

    var model = CLAUDE_MODELS[modelIdx];

    // Cap total utilization at a sensible max (leave headroom)
    var maxUtil = 0.85;
    if (totalProportion > maxUtil) {
      var scale = maxUtil / totalProportion;
      alloc.system *= scale;
      alloc.user *= scale;
      alloc.assistant *= scale;
      alloc.tools *= scale;
      totalProportion = maxUtil;
    }

    // Convert proportions to token counts
    var tokens = {
      system: Math.round(alloc.system * model.contextWindow),
      user: Math.round(alloc.user * model.contextWindow),
      assistant: Math.round(alloc.assistant * model.contextWindow),
      tools: Math.round(alloc.tools * model.contextWindow),
    };

    var totalTokens = tokens.system + tokens.user + tokens.assistant + tokens.tools;
    var utilization = model.contextWindow > 0 ? (totalTokens / model.contextWindow) * 100 : 0;

    // Estimate cost
    var inputTokens = tokens.system + tokens.user + tokens.tools;
    var outputTokens = tokens.assistant;
    var cost = (inputTokens / 1000000) * model.pricing.inputPerMTok +
               (outputTokens / 1000000) * model.pricing.outputPerMTok;

    return {
      modelIndex: modelIdx,
      modelName: model.name,
      tokens: tokens,
      utilization: Math.round(utilization),
      cost: cost,
    };
  }

  function initPlanner() {
    var toggle = document.getElementById('planner-toggle');
    var card = document.getElementById('planner-card');

    if (!toggle || !card) return;

    toggle.addEventListener('click', function () {
      var isOpen = card.classList.toggle('planner-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

      if (isOpen && !_plannerInited) {
        _plannerInited = true;
        _initPlannerBody();
      }
    });
  }

  function _initPlannerBody() {
    var radios = document.querySelectorAll('.planner-radio');
    var resultEl = document.getElementById('planner-result');
    var applyBtn = document.getElementById('planner-apply-btn');

    // Track current recommendation
    var _currentRec = null;

    // Listen for any radio change
    radios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        _currentRec = updatePlannerRecommendation();
      });
    });

    // Apply button
    applyBtn.addEventListener('click', function () {
      if (!_currentRec) return;

      // Update model selector
      state.modelIndex = _currentRec.modelIndex;
      modelSelect.value = _currentRec.modelIndex;

      // Update token allocations
      categories.forEach(function (cat) {
        state.tokens[cat] = _currentRec.tokens[cat];
      });

      state.activePreset = null;
      updateSliderMax();
      triggerGaugeBurst();
      syncSlidersFromState();
      pushTimelineSnapshot();
      render();
      save();
    });

    function updatePlannerRecommendation() {
      var usecase = getRadioValue('planner-usecase');
      var length = getRadioValue('planner-length');
      var tools = getRadioValue('planner-tools');
      var budget = getRadioValue('planner-budget');

      // Need all 4 answers
      if (!usecase || !length || !tools || !budget) {
        resultEl.style.display = 'none';
        return null;
      }

      var rec = computePlannerRecommendation(usecase, length, tools, budget);
      if (!rec) {
        resultEl.style.display = 'none';
        return null;
      }

      // Populate result
      document.getElementById('planner-rec-model').textContent = rec.modelName;
      document.getElementById('planner-rec-system').textContent = formatNumber(rec.tokens.system);
      document.getElementById('planner-rec-user').textContent = formatNumber(rec.tokens.user);
      document.getElementById('planner-rec-assistant').textContent = formatNumber(rec.tokens.assistant);
      document.getElementById('planner-rec-tools').textContent = formatNumber(rec.tokens.tools);

      var summaryEl = document.getElementById('planner-rec-summary');
      var costStr = rec.cost < 0.01 ? '<$0.01' : '$' + rec.cost.toFixed(2);
      summaryEl.innerHTML = 'We recommend <strong>' + rec.modelName + '</strong> with ~' +
        rec.utilization + '% context utilization. Estimated cost: <strong>' + costStr + '/request</strong>.';

      resultEl.style.display = '';
      return rec;
    }

    function getRadioValue(name) {
      var checked = document.querySelector('input[name="' + name + '"]:checked');
      return checked ? checked.value : null;
    }
  }

  // ---- Conversation Replay ----
  function initReplay() {
    const toggle = document.getElementById('replay-toggle');
    const card = document.getElementById('replay-card');

    if (!toggle || !card) return;

    toggle.addEventListener('click', () => {
      const isOpen = card.classList.toggle('replay-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

      if (isOpen && !_replayInited) {
        _replayInited = true;
        _initReplayBody();
      }
    });
  }

  function _initReplayBody() {
    const scenarioSelect = document.getElementById('replay-scenario-select');
    const playBtn = document.getElementById('replay-play-btn');
    const pauseBtn = document.getElementById('replay-pause-btn');
    const resetBtn = document.getElementById('replay-reset-btn');

    // Populate scenario dropdown
    REPLAY_SCENARIOS.forEach((scenario, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = scenario.name + ' (' + scenario.turns.length + ' turns)';
      scenarioSelect.appendChild(opt);
    });

    scenarioSelect.addEventListener('change', () => {
      _replayState.scenarioIndex = parseInt(scenarioSelect.value);
      replayReset();
    });

    playBtn.addEventListener('click', replayPlay);
    pauseBtn.addEventListener('click', replayPause);
    resetBtn.addEventListener('click', replayReset);
  }

  function replayPlay() {
    if (_replayState.playing) return;

    const scenario = REPLAY_SCENARIOS[_replayState.scenarioIndex];
    if (!scenario) return;

    // If replay is complete, reset first
    if (_replayState.currentTurn > scenario.turns.length) {
      replayReset();
    }

    _replayState.playing = true;

    const playBtn = document.getElementById('replay-play-btn');
    const pauseBtn = document.getElementById('replay-pause-btn');
    playBtn.style.display = 'none';
    pauseBtn.style.display = '';

    // If starting from scratch, apply system tokens first
    if (_replayState.currentTurn === 0) {
      _replayState.cumulativeTokens = { system: 0, user: 0, assistant: 0, tools: 0 };
      _replayState.cumulativeTokens.system = scenario.systemTokens;
      _replayState.currentTurn = 1;
      _replayState.currentHalf = 'user';

      // Clear the log
      const log = document.getElementById('replay-log');
      log.innerHTML = '';

      // Add system prompt entry
      replayAddLogEntry('system', 'System prompt loaded', scenario.systemTokens);
      replayApplyToGauge();
    }

    // Start the turn-by-turn timer (each half-turn = 500ms, so 1 full turn = 1s)
    replayScheduleNext();
  }

  function replayPause() {
    _replayState.playing = false;
    if (_replayState.timerId) {
      clearTimeout(_replayState.timerId);
      _replayState.timerId = null;
    }

    const playBtn = document.getElementById('replay-play-btn');
    const pauseBtn = document.getElementById('replay-pause-btn');
    playBtn.style.display = '';
    pauseBtn.style.display = 'none';
  }

  function replayReset() {
    replayPause();

    _replayState.currentTurn = 0;
    _replayState.currentHalf = 'user';
    _replayState.cumulativeTokens = { system: 0, user: 0, assistant: 0, tools: 0 };

    // Reset progress bar
    const progressFill = document.getElementById('replay-progress-fill');
    const progressLabel = document.getElementById('replay-progress-label');
    const scenario = REPLAY_SCENARIOS[_replayState.scenarioIndex];
    if (progressFill) progressFill.style.width = '0%';
    if (progressLabel) progressLabel.textContent = 'Turn 0 / ' + (scenario ? scenario.turns.length : 0);

    // Clear log
    const log = document.getElementById('replay-log');
    if (log) log.innerHTML = '<div class="replay-log__empty">Select a scenario and press Play</div>';

    // Reset gauge to zero
    categories.forEach(cat => { state.tokens[cat] = 0; });
    syncSlidersFromState();
    render();
  }

  function replayScheduleNext() {
    if (!_replayState.playing) return;

    const scenario = REPLAY_SCENARIOS[_replayState.scenarioIndex];
    if (!scenario) return;

    const turnIndex = _replayState.currentTurn - 1; // 0-based index

    if (turnIndex >= scenario.turns.length) {
      // Replay complete
      replayPause();
      replayAddLogEntry('system', 'Replay complete!', 0);
      return;
    }

    _replayState.timerId = setTimeout(() => {
      replayAdvance();
    }, 500);
  }

  function replayAdvance() {
    if (!_replayState.playing) return;

    const scenario = REPLAY_SCENARIOS[_replayState.scenarioIndex];
    const turnIndex = _replayState.currentTurn - 1;
    const turn = scenario.turns[turnIndex];

    if (_replayState.currentHalf === 'user') {
      // Add user tokens
      _replayState.cumulativeTokens.user += turn.user;
      replayAddLogEntry('user', 'Turn ' + _replayState.currentTurn + ': User sends message', turn.user);
      _replayState.currentHalf = 'assistant';

      replayApplyToGauge();
      replayUpdateProgress();
      replayScheduleNext();

    } else {
      // Add assistant (+ tools) tokens
      _replayState.cumulativeTokens.assistant += turn.assistant;
      if (turn.tools > 0) {
        _replayState.cumulativeTokens.tools += turn.tools;
      }

      const toolsNote = turn.tools > 0
        ? ' (incl. +' + formatNumber(turn.tools) + ' tool tokens)'
        : '';
      replayAddLogEntry('assistant', 'Turn ' + _replayState.currentTurn + ': Assistant responds' + toolsNote, turn.assistant);

      if (turn.tools > 0) {
        replayAddLogEntry('tools', 'Turn ' + _replayState.currentTurn + ': Tool calls executed', turn.tools);
      }

      // Move to next turn
      _replayState.currentTurn++;
      _replayState.currentHalf = 'user';

      replayApplyToGauge();
      replayUpdateProgress();
      replayScheduleNext();
    }
  }

  function replayApplyToGauge() {
    const model = CLAUDE_MODELS[state.modelIndex];
    const cumulative = _replayState.cumulativeTokens;

    // Clamp to context window
    let total = categories.reduce((s, c) => s + cumulative[c], 0);
    if (total > model.contextWindow && total > 0) {
      const scale = model.contextWindow / total;
      categories.forEach(cat => {
        state.tokens[cat] = Math.round(cumulative[cat] * scale);
      });
    } else {
      categories.forEach(cat => {
        state.tokens[cat] = cumulative[cat];
      });
    }

    state.activePreset = null;
    syncSlidersFromState();
    render();
  }

  function replayUpdateProgress() {
    const scenario = REPLAY_SCENARIOS[_replayState.scenarioIndex];
    if (!scenario) return;

    const totalTurns = scenario.turns.length;
    // currentTurn is 1-based and points to next turn after assistant phase, so completed = currentTurn - 1
    // But we show progress based on half-turns for smooth feel
    const completedTurns = _replayState.currentHalf === 'user'
      ? _replayState.currentTurn - 1
      : _replayState.currentTurn - 0.5;
    const displayTurn = Math.min(Math.ceil(completedTurns), totalTurns);

    const progressPct = totalTurns > 0 ? (completedTurns / totalTurns) * 100 : 0;

    const progressFill = document.getElementById('replay-progress-fill');
    const progressLabel = document.getElementById('replay-progress-label');

    if (progressFill) progressFill.style.width = Math.min(progressPct, 100) + '%';
    if (progressLabel) progressLabel.textContent = 'Turn ' + displayTurn + ' / ' + totalTurns;
  }

  function replayAddLogEntry(type, text, tokens) {
    const log = document.getElementById('replay-log');
    if (!log) return;

    // Remove empty placeholder
    const empty = log.querySelector('.replay-log__empty');
    if (empty) empty.remove();

    const icons = { system: '⚙️', user: '👤', assistant: '🤖', tools: '🔧' };

    const entry = document.createElement('div');
    entry.className = 'replay-log__entry replay-log__entry--' + type;

    const icon = document.createElement('span');
    icon.className = 'replay-log__icon';
    icon.textContent = icons[type] || '';
    icon.setAttribute('aria-hidden', 'true');

    const textSpan = document.createElement('span');
    textSpan.className = 'replay-log__text';
    textSpan.textContent = text;

    entry.appendChild(icon);
    entry.appendChild(textSpan);

    if (tokens > 0) {
      const tokensSpan = document.createElement('span');
      tokensSpan.className = 'replay-log__tokens';
      tokensSpan.textContent = '+' + formatNumber(tokens);
      entry.appendChild(tokensSpan);
    }

    log.appendChild(entry);

    // Auto-scroll to bottom
    log.scrollTop = log.scrollHeight;
  }

  // ---- Dashboard ----
  function initDashboard() {
    var btn = document.getElementById('dashboard-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (typeof Dashboard !== 'undefined') {
        Dashboard.toggle(state);
      }
    });
  }

  // ---- Boot ----
  function init() {
    initModelSelect();
    initPresets();
    initSliders();
    initKeyboard();
    initCompareMode();
    initDashboard();
    initEstimator();
    initAnalytics();
    initPricing();
    initApiParser();
    initTemplates();
    initPlanner();
    initReplay();
    initHeatmap();
    initTheme();
    initColorCycling();
    initLangSelector();
    initShareButtons();

    // Load custom colors from localStorage
    loadColors();
    applyCustomColors();

    // URL params take priority over localStorage
    const loadedFromURL = loadURLParams();
    const loaded = loadedFromURL || load();
    modelSelect.value = state.modelIndex;
    compareModelSelect.value = state.compareModelIndex;
    updateSliderMax();

    if (!loaded) {
      // Apply default preset
      applyPreset(0);
    } else {
      clampTokens();
      syncSlidersFromState();
      render();
    }

    // Restore compare mode state
    if (state.compareMode) {
      toggleCompareMode();
    }

    // Restore timeline
    renderTimeline();

    // Apply i18n
    if (typeof I18n !== 'undefined') {
      I18n.applyTranslations();
    }

    // Show onboarding tooltip on first visit
    initOnboardingTooltip();
  }

  // ---- Theme Toggle ----
  function toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('claude-ctx-theme', 'dark'); } catch (e) { /* ignore */ }
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      try { localStorage.setItem('claude-ctx-theme', 'light'); } catch (e) { /* ignore */ }
    }
  }

  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    // Load saved theme
    try {
      const saved = localStorage.getItem('claude-ctx-theme');
      if (saved === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    } catch (e) { /* ignore */ }

    btn.addEventListener('click', toggleTheme);
  }

  // ---- Language Selector ----
  function initLangSelector() {
    if (typeof I18n === 'undefined') return;

    // Initialize i18n (detects browser language or loads saved preference).
    // I18n.init() internally calls buildLanguageSelector() which attaches
    // a change listener to #lang-select, so we don't add another one here.
    I18n.init();

    const langSelect = document.getElementById('lang-select');
    if (!langSelect) return;

    langSelect.value = I18n.getLanguage();
  }

  // ---- Share / Export Buttons ----
  function initShareButtons() {
    if (typeof ShareModule === 'undefined') return;

    const btnExport = document.getElementById('btn-export-png');
    const btnShare = document.getElementById('btn-share-link');
    const btnCopy = document.getElementById('btn-copy-stats');

    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const model = CLAUDE_MODELS[state.modelIndex];
        const total = categories.reduce((s, c) => s + state.tokens[c], 0);
        const percent = model.contextWindow > 0 ? (total / model.contextWindow) * 100 : 0;
        ShareModule.exportPNG(state.tokens, model, percent);
        ShareModule.flashButton(btnExport);
      });
    }

    if (btnShare) {
      btnShare.addEventListener('click', () => {
        ShareModule.copyShareLink(state.modelIndex, state.tokens);
        ShareModule.flashButton(btnShare);
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const model = CLAUDE_MODELS[state.modelIndex];
        const total = categories.reduce((s, c) => s + state.tokens[c], 0);
        const percent = model.contextWindow > 0 ? (total / model.contextWindow) * 100 : 0;
        ShareModule.copyStats(state.tokens, model, percent);
        ShareModule.flashButton(btnCopy);
      });
    }
  }

  // ---- URL Params ----
  /**
   * Check for share URL params. Returns true if params were found and applied.
   */
  function loadURLParams() {
    if (typeof ShareModule === 'undefined') return false;
    var params = ShareModule.parseURLParams();
    if (!params) return false;

    state.modelIndex = Math.min(params.modelIndex, CLAUDE_MODELS.length - 1);
    categories.forEach(function (cat) {
      state.tokens[cat] = params.tokens[cat] || 0;
    });
    state.activePreset = null;
    return true;
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
