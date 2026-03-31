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
  };

  const STORAGE_KEY = 'claude-ctx-viz';
  const MAX_TIMELINE = 10;

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

  const sliders = {};
  const inputs = {};
  const valueEls = {};
  const barEls = {};
  const percentEls = {};

  const categories = ['system', 'user', 'assistant', 'tools'];
  categories.forEach(cat => {
    sliders[cat] = document.getElementById(`slider-${cat}`);
    inputs[cat] = document.getElementById(`input-${cat}`);
    valueEls[cat] = document.getElementById(`${cat}-value`);
    barEls[cat] = document.getElementById(`${cat}-bar`);
    percentEls[cat] = document.getElementById(`${cat}-percent`);
  });

  const statTotalUsed = document.getElementById('stat-total-used');
  const statRemaining = document.getElementById('stat-remaining');
  const statContextWindow = document.getElementById('stat-context-window');
  const statOutputLimit = document.getElementById('stat-output-limit');

  // ---- Gauge ----
  const gauge = new GaugeRenderer('gauge-container');
  let gaugeCompare = null; // Created lazily when compare mode is activated

  // ---- Particle System ----
  const particles = new ParticleSystem();
  particles.start();

  // ---- Init Models ----
  function initModelSelect() {
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

    syncSlidersFromState();
    pushTimelineSnapshot();
    render();
    save();
  }

  // ---- Slider & Input Logic ----
  function updateSliderMax() {
    const model = CLAUDE_MODELS[state.modelIndex];
    categories.forEach(cat => {
      sliders[cat].max = model.contextWindow;
      inputs[cat].max = model.contextWindow;
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
      sliders[cat].value = state.tokens[cat];
      inputs[cat].value = state.tokens[cat];
    });
  }

  function initSliders() {
    categories.forEach(cat => {
      // Slider input
      sliders[cat].addEventListener('input', () => {
        const val = parseInt(sliders[cat].value) || 0;
        state.tokens[cat] = val;
        enforceMax(cat);
        inputs[cat].value = state.tokens[cat];
        state.activePreset = null;
        pushTimelineSnapshot();
        render();
        save();
      });

      // Number input
      inputs[cat].addEventListener('input', () => {
        const val = parseInt(inputs[cat].value) || 0;
        state.tokens[cat] = Math.max(0, val);
        enforceMax(cat);
        sliders[cat].value = state.tokens[cat];
        state.activePreset = null;
        pushTimelineSnapshot();
        render();
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
  }

  // ---- Comparison Mode ----
  function initCompareMode() {
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
    const gaugeContainer = document.getElementById('gauge-container');
    if (gaugeContainer) {
      gaugeContainer.setAttribute('aria-valuenow', Math.round(percent));
    }

    // Update particle system with current usage
    particles.setUsage(percent);

    // Update cards
    categories.forEach(cat => {
      valueEls[cat].textContent = formatNumber(state.tokens[cat]);
      const pct = model.contextWindow > 0 ? (state.tokens[cat] / model.contextWindow) * 100 : 0;
      barEls[cat].style.width = pct + '%';
      percentEls[cat].textContent = pct.toFixed(1) + '%';
      // Update meter ARIA values
      const meterEl = barEls[cat].parentElement;
      if (meterEl && meterEl.hasAttribute('aria-valuenow')) {
        meterEl.setAttribute('aria-valuenow', Math.round(pct));
      }
    });

    // Stats bar
    statTotalUsed.textContent = formatNumber(total);
    statRemaining.textContent = formatNumber(Math.max(0, model.contextWindow - total));
    statContextWindow.textContent = formatTokensShort(model.contextWindow);
    statOutputLimit.textContent = formatTokensShort(model.outputLimit);

    // Status indicator (with i18n)
    const statusText = gaugeStatus.querySelector('.gauge-status__text');
    gaugeStatus.classList.remove('gauge-status--warning', 'gauge-status--danger');
    if (percent >= 90) {
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

    // Preset button active state
    document.querySelectorAll('.preset-btn').forEach((btn, i) => {
      btn.classList.toggle('preset-btn--active', i === state.activePreset);
    });

    // Update comparison gauge if active
    if (state.compareMode) {
      renderCompareGauge();
    }
  }

  // ---- Keyboard Shortcuts ----
  function initKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.key === 'r' || e.key === 'R') {
        resetState();
      } else if (e.key >= '1' && e.key <= '4') {
        applyPreset(parseInt(e.key) - 1);
      } else if (e.key === 'c' || e.key === 'C') {
        state.compareMode = !state.compareMode;
        toggleCompareMode();
        save();
      }
    });
  }

  function resetState() {
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
      if (typeof data.modelIndex === 'number' && data.modelIndex < CLAUDE_MODELS.length) {
        state.modelIndex = data.modelIndex;
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
      if (typeof data.compareModelIndex === 'number' && data.compareModelIndex < CLAUDE_MODELS.length) {
        state.compareModelIndex = data.compareModelIndex;
      }
      if (Array.isArray(data.timeline)) {
        state.timeline = data.timeline.slice(-MAX_TIMELINE);
      }
      return true;
    } catch (e) {
      return false;
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
    const textarea = document.getElementById('estimator-textarea');
    const countEl = document.getElementById('estimator-count');
    const addBtn = document.getElementById('estimator-add-btn');
    const addTarget = document.getElementById('estimator-add-target');
    const chipsContainer = document.getElementById('estimator-chips');

    if (!toggle || !card) return;

    // Collapsible toggle
    toggle.addEventListener('click', () => {
      const isOpen = card.classList.toggle('estimator-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

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

  // ---- Boot ----
  function init() {
    initModelSelect();
    initPresets();
    initSliders();
    initKeyboard();
    initCompareMode();
    initEstimator();
    initTheme();
    initLangSelector();
    initShareButtons();
    initURLParams();

    const loaded = load();
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
  }

  // ---- Theme Toggle ----
  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const moonIcon = btn.querySelector('.icon-moon');
    const sunIcon = btn.querySelector('.icon-sun');

    // Load saved theme
    const saved = localStorage.getItem('claude-ctx-theme');
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      if (moonIcon) moonIcon.style.display = 'none';
      if (sunIcon) sunIcon.style.display = 'block';
    }

    btn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        if (moonIcon) moonIcon.style.display = 'block';
        if (sunIcon) sunIcon.style.display = 'none';
        localStorage.setItem('claude-ctx-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        if (moonIcon) moonIcon.style.display = 'none';
        if (sunIcon) sunIcon.style.display = 'block';
        localStorage.setItem('claude-ctx-theme', 'light');
      }
    });
  }

  // ---- Language Selector ----
  function initLangSelector() {
    if (typeof I18n === 'undefined') return;

    // Initialize i18n (detects browser language or loads saved preference)
    I18n.init();

    const langSelect = document.getElementById('lang-select');
    if (!langSelect) return;

    langSelect.value = I18n.getLanguage();
    langSelect.addEventListener('change', () => {
      I18n.setLanguage(langSelect.value);
    });
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
        ShareModule.showToast(typeof I18n !== 'undefined' ? I18n.t('pngExported') : 'PNG exported!');
      });
    }

    if (btnShare) {
      btnShare.addEventListener('click', async () => {
        await ShareModule.copyShareLink(state.modelIndex, state.tokens);
        ShareModule.showToast(typeof I18n !== 'undefined' ? I18n.t('linkCopied') : 'Share link copied!');
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const model = CLAUDE_MODELS[state.modelIndex];
        const total = categories.reduce((s, c) => s + state.tokens[c], 0);
        const percent = model.contextWindow > 0 ? (total / model.contextWindow) * 100 : 0;
        await ShareModule.copyStats(state.tokens, model, percent);
        ShareModule.showToast(typeof I18n !== 'undefined' ? I18n.t('statsCopied') : 'Stats copied!');
      });
    }
  }

  // ---- URL Params ----
  function initURLParams() {
    if (typeof ShareModule === 'undefined') return;
    const params = ShareModule.parseURLParams();
    if (params) {
      state.modelIndex = Math.min(params.modelIndex, CLAUDE_MODELS.length - 1);
      categories.forEach(cat => {
        state.tokens[cat] = params.tokens[cat] || 0;
      });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
