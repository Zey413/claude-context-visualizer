/**
 * Claude Context Window Visualizer — App Controller
 * State management, sliders, events, presets, localStorage.
 */

(function () {
  'use strict';

  // ---- State ----
  const state = {
    modelIndex: 0,
    tokens: { system: 0, user: 0, assistant: 0, tools: 0 },
    activePreset: null,
  };

  const STORAGE_KEY = 'claude-ctx-viz';

  // ---- DOM References ----
  const modelSelect = document.getElementById('model-select');
  const gaugeStatus = document.getElementById('gauge-status');
  const presetsGrid = document.getElementById('presets-grid');

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
  }

  // ---- Init Presets ----
  function initPresets() {
    PRESETS.forEach((preset, i) => {
      const btn = document.createElement('button');
      btn.classList.add('preset-btn');
      btn.dataset.presetIndex = i;
      btn.innerHTML = `<span class="preset-btn__icon">${preset.icon}</span>${preset.name}`;
      btn.title = preset.description;
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

  // ---- Render ----
  function render() {
    const model = CLAUDE_MODELS[state.modelIndex];
    const total = categories.reduce((s, c) => s + state.tokens[c], 0);
    const percent = model.contextWindow > 0 ? (total / model.contextWindow) * 100 : 0;

    // Update gauge
    gauge.update(state.tokens, model.contextWindow);

    // Update cards
    categories.forEach(cat => {
      valueEls[cat].textContent = formatNumber(state.tokens[cat]);
      const pct = model.contextWindow > 0 ? (state.tokens[cat] / model.contextWindow) * 100 : 0;
      barEls[cat].style.width = pct + '%';
      percentEls[cat].textContent = pct.toFixed(1) + '%';
    });

    // Stats bar
    statTotalUsed.textContent = formatNumber(total);
    statRemaining.textContent = formatNumber(Math.max(0, model.contextWindow - total));
    statContextWindow.textContent = formatTokensShort(model.contextWindow);
    statOutputLimit.textContent = formatTokensShort(model.outputLimit);

    // Status indicator
    const statusText = gaugeStatus.querySelector('.gauge-status__text');
    gaugeStatus.classList.remove('gauge-status--warning', 'gauge-status--danger');
    if (percent >= 90) {
      gaugeStatus.classList.add('gauge-status--danger');
      statusText.textContent = 'Critical';
    } else if (percent >= 70) {
      gaugeStatus.classList.add('gauge-status--warning');
      statusText.textContent = 'Warning';
    } else {
      statusText.textContent = 'Normal';
    }

    // Remaining color
    statRemaining.style.color = percent >= 90 ? '#EF4444' : percent >= 70 ? '#F59E0B' : '#10B981';

    // Preset button active state
    document.querySelectorAll('.preset-btn').forEach((btn, i) => {
      btn.classList.toggle('preset-btn--active', i === state.activePreset);
    });
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
      }
    });
  }

  function resetState() {
    categories.forEach(cat => { state.tokens[cat] = 0; });
    state.activePreset = null;
    syncSlidersFromState();
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
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- Boot ----
  function init() {
    initModelSelect();
    initPresets();
    initSliders();
    initKeyboard();

    const loaded = load();
    modelSelect.value = state.modelIndex;
    updateSliderMax();

    if (!loaded) {
      // Apply default preset
      applyPreset(0);
    } else {
      clampTokens();
      syncSlidersFromState();
      render();
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
