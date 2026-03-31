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
      sliders[cat].style.setProperty('--slider-color', color);
      barEls[cat].style.setProperty('--cat-color', color);
      // Sync breakdown bar segment & label colors
      if (breakdownSegments[cat]) breakdownSegments[cat].style.setProperty('--seg-color', color);
      if (breakdownLabels[cat]) breakdownLabels[cat].style.color = color;
    });
    gauge.setSegmentColors(categories.map(getCatColor));
    if (gaugeCompare) {
      gaugeCompare.setSegmentColors(categories.map(getCatColor));
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

    // Trigger burst animation on preset switch
    triggerGaugeBurst();

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

    // Update usage breakdown bar & labels
    updateUsageBreakdown(model, total);

    // Update sparklines
    renderSparklines();

    // Stats bar
    statTotalUsed.textContent = formatNumber(total);
    statRemaining.textContent = formatNumber(Math.max(0, model.contextWindow - total));
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
    initAnalytics();
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
  }

  // ---- Theme Toggle ----
  function toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('claude-ctx-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('claude-ctx-theme', 'light');
    }
  }

  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    // Load saved theme
    const saved = localStorage.getItem('claude-ctx-theme');
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }

    btn.addEventListener('click', toggleTheme);
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
