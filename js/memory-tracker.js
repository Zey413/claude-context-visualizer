/**
 * Claude Context Window Visualizer — Claude Code Memory Tracker
 * Visualizes how Claude Code allocates its context window internally:
 *  - System prompt, MEMORY.md, env info, MCP tools, user files, conversation
 * Includes an interactive session simulation.
 */

'use strict';

const MemoryTracker = (function () {
  let _inited = false;

  // Claude Code fixed overhead (approximate token counts)
  const MEMORY_SEGMENTS = [
    { id: 'system-prompt', label: 'System Prompt', tokens: 4200, color: '#8B5CF6', icon: '⚙️',
      desc: 'Core instructions for behavior, tool use, and safety' },
    { id: 'memory-md', label: 'MEMORY.md', tokens: 680, color: '#A855F7', icon: '🧠',
      desc: 'Auto-memory from previous sessions (first 200 lines or 25KB)' },
    { id: 'env-info', label: 'Environment Info', tokens: 280, color: '#6366F1', icon: '🖥️',
      desc: 'Working directory, platform, shell, OS, git branch/status' },
    { id: 'mcp-tools', label: 'MCP Tools (deferred)', tokens: 120, color: '#3B82F6', icon: '🔧',
      desc: 'Tool availability metadata; schemas loaded on-demand' },
    { id: 'user-files', label: 'User Files', tokens: 0, color: '#10B981', icon: '📁',
      desc: 'Code files read during the session (variable)' },
    { id: 'conversation', label: 'Conversation', tokens: 0, color: '#F59E0B', icon: '💬',
      desc: 'User messages + assistant responses accumulated over turns' },
  ];

  const FIXED_OVERHEAD = 4200 + 680 + 280 + 120; // 5,280 tokens

  // Simulation scenarios
  const SIM_SCENARIOS = [
    {
      name: 'Quick Fix',
      desc: '3-turn bug fix session',
      steps: [
        { type: 'file-read', label: 'Read src/app.js', tokens: 1500 },
        { type: 'user', label: 'User: "Fix the null check"', tokens: 200 },
        { type: 'assistant', label: 'Assistant: analyzes + fixes', tokens: 3000 },
        { type: 'file-read', label: 'Read test/app.test.js', tokens: 800 },
        { type: 'user', label: 'User: "Run tests"', tokens: 100 },
        { type: 'assistant', label: 'Assistant: runs tests + confirms', tokens: 2000 },
      ]
    },
    {
      name: 'Feature Build',
      desc: '8-turn feature implementation',
      steps: [
        { type: 'file-read', label: 'Read 5 source files', tokens: 8000 },
        { type: 'user', label: 'User: "Add auth middleware"', tokens: 500 },
        { type: 'assistant', label: 'Assistant: plans architecture', tokens: 4000 },
        { type: 'mcp-expand', label: 'MCP: load tool schemas', tokens: 2500 },
        { type: 'user', label: 'User: "Implement JWT validation"', tokens: 300 },
        { type: 'assistant', label: 'Assistant: writes code + tests', tokens: 8000 },
        { type: 'file-read', label: 'Read package.json + config', tokens: 1200 },
        { type: 'user', label: 'User: "Add error handling"', tokens: 250 },
        { type: 'assistant', label: 'Assistant: refactors + adds try/catch', tokens: 5000 },
        { type: 'user', label: 'User: "Run full test suite"', tokens: 150 },
        { type: 'assistant', label: 'Assistant: executes + reports', tokens: 3000 },
        { type: 'file-read', label: 'Read 3 more files for review', tokens: 4500 },
        { type: 'user', label: 'User: "Commit and push"', tokens: 200 },
        { type: 'assistant', label: 'Assistant: git commit + push', tokens: 2500 },
      ]
    },
    {
      name: 'Codebase Exploration',
      desc: 'Reading many files with deep analysis',
      steps: [
        { type: 'file-read', label: 'Read project structure (10 files)', tokens: 15000 },
        { type: 'user', label: 'User: "How does auth work?"', tokens: 300 },
        { type: 'assistant', label: 'Assistant: explains architecture', tokens: 6000 },
        { type: 'file-read', label: 'Read 8 more source files', tokens: 12000 },
        { type: 'user', label: 'User: "Find all API endpoints"', tokens: 200 },
        { type: 'assistant', label: 'Assistant: searches + lists', tokens: 5000 },
        { type: 'mcp-expand', label: 'MCP: search tools activated', tokens: 3000 },
        { type: 'file-read', label: 'Read test files', tokens: 8000 },
        { type: 'user', label: 'User: "Generate architecture diagram"', tokens: 400 },
        { type: 'assistant', label: 'Assistant: creates ASCII diagram', tokens: 4000 },
      ]
    }
  ];

  // Simulation state
  var _simState = {
    scenarioIndex: 0,
    stepIndex: 0,
    playing: false,
    timerId: null,
    segments: null, // copy of MEMORY_SEGMENTS with running totals
  };

  function init() {
    var toggle = document.getElementById('memory-toggle');
    var card = document.getElementById('memory-card');
    if (!toggle || !card) return;

    toggle.addEventListener('click', function () {
      var isOpen = card.classList.toggle('memory-card--open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen && !_inited) {
        _inited = true;
        _buildBody();
        _renderStatic();
      }
    });
  }

  function _buildBody() {
    // Scenario selector
    var select = document.getElementById('memory-scenario');
    if (select) {
      SIM_SCENARIOS.forEach(function (sc, i) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = sc.name + ' (' + sc.steps.length + ' steps)';
        select.appendChild(opt);
      });
      select.addEventListener('change', function () {
        _simState.scenarioIndex = parseInt(select.value);
        _simReset();
      });
    }

    // Play / Pause / Reset buttons
    var playBtn = document.getElementById('memory-play');
    var pauseBtn = document.getElementById('memory-pause');
    var resetBtn = document.getElementById('memory-reset');

    if (playBtn) playBtn.addEventListener('click', _simPlay);
    if (pauseBtn) pauseBtn.addEventListener('click', _simPause);
    if (resetBtn) resetBtn.addEventListener('click', _simReset);
  }

  /**
   * Render the static overhead breakdown.
   */
  function _renderStatic() {
    var container = document.getElementById('memory-breakdown');
    if (!container) return;

    container.innerHTML = '';

    // Fixed overhead visual
    var overheadHTML = '<div class="memory-overhead">';
    overheadHTML += '<div class="memory-overhead__title">📦 Fixed Startup Overhead: <strong>' + formatNumber(FIXED_OVERHEAD) + ' tokens</strong></div>';
    overheadHTML += '<div class="memory-overhead__bar">';

    var fixedSegs = MEMORY_SEGMENTS.slice(0, 4); // system, memory, env, mcp
    fixedSegs.forEach(function (seg) {
      var pct = (seg.tokens / FIXED_OVERHEAD) * 100;
      overheadHTML += '<div class="memory-overhead__seg" style="width:' + pct.toFixed(1) + '%;background:' + seg.color + '" title="' + seg.label + ': ' + formatNumber(seg.tokens) + '"></div>';
    });
    overheadHTML += '</div>';

    // Labels
    overheadHTML += '<div class="memory-overhead__labels">';
    fixedSegs.forEach(function (seg) {
      overheadHTML += '<div class="memory-overhead__label">' +
        '<span class="memory-overhead__dot" style="background:' + seg.color + '"></span>' +
        '<span>' + seg.icon + ' ' + seg.label + '</span>' +
        '<span class="memory-overhead__tokens">' + formatNumber(seg.tokens) + '</span>' +
        '</div>';
    });
    overheadHTML += '</div>';
    overheadHTML += '</div>';

    // Segment detail cards
    var detailHTML = '<div class="memory-details">';
    MEMORY_SEGMENTS.forEach(function (seg) {
      detailHTML += '<div class="memory-detail">' +
        '<div class="memory-detail__header">' +
          '<span class="memory-detail__icon">' + seg.icon + '</span>' +
          '<span class="memory-detail__label">' + seg.label + '</span>' +
          '<span class="memory-detail__tokens" style="color:' + seg.color + '">' +
            (seg.tokens > 0 ? formatNumber(seg.tokens) : 'Variable') +
          '</span>' +
        '</div>' +
        '<div class="memory-detail__desc">' + seg.desc + '</div>' +
        '</div>';
    });
    detailHTML += '</div>';

    container.innerHTML = overheadHTML + detailHTML;
  }

  // ---- Simulation ----
  function _simPlay() {
    if (_simState.playing) return;
    _simState.playing = true;

    var playBtn = document.getElementById('memory-play');
    var pauseBtn = document.getElementById('memory-pause');
    if (playBtn) playBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = '';

    // Init segments if first play
    if (!_simState.segments) {
      _simState.segments = MEMORY_SEGMENTS.map(function (seg) {
        return { id: seg.id, label: seg.label, tokens: seg.tokens, color: seg.color, icon: seg.icon };
      });
      _simState.stepIndex = 0;
      _addSimLog('system', '⚙️ Session started — ' + formatNumber(FIXED_OVERHEAD) + ' tokens loaded');
      _renderSimBar();
    }

    _simScheduleNext();
  }

  function _simPause() {
    _simState.playing = false;
    if (_simState.timerId) {
      clearTimeout(_simState.timerId);
      _simState.timerId = null;
    }

    var playBtn = document.getElementById('memory-play');
    var pauseBtn = document.getElementById('memory-pause');
    if (playBtn) playBtn.style.display = '';
    if (pauseBtn) pauseBtn.style.display = 'none';
  }

  function _simReset() {
    _simPause();
    _simState.segments = null;
    _simState.stepIndex = 0;

    var log = document.getElementById('memory-sim-log');
    if (log) log.innerHTML = '<div class="memory-sim-log__empty">Press Play to simulate a session</div>';

    var bar = document.getElementById('memory-sim-bar');
    if (bar) bar.innerHTML = '';

    var progress = document.getElementById('memory-sim-progress');
    if (progress) progress.textContent = '';
  }

  function _simScheduleNext() {
    if (!_simState.playing) return;

    var scenario = SIM_SCENARIOS[_simState.scenarioIndex];
    if (_simState.stepIndex >= scenario.steps.length) {
      _addSimLog('system', '✅ Session complete!');
      _simPause();
      return;
    }

    _simState.timerId = setTimeout(function () {
      _simAdvance();
    }, 600);
  }

  function _simAdvance() {
    if (!_simState.playing) return;

    var scenario = SIM_SCENARIOS[_simState.scenarioIndex];
    var step = scenario.steps[_simState.stepIndex];

    // Add tokens to the right segment
    switch (step.type) {
      case 'file-read':
        _addToSeg('user-files', step.tokens);
        break;
      case 'user':
        _addToSeg('conversation', step.tokens);
        break;
      case 'assistant':
        _addToSeg('conversation', step.tokens);
        break;
      case 'mcp-expand':
        _addToSeg('mcp-tools', step.tokens);
        break;
    }

    var typeIcon = {
      'file-read': '📁',
      'user': '👤',
      'assistant': '🤖',
      'mcp-expand': '🔧',
    };

    _addSimLog(step.type, (typeIcon[step.type] || '') + ' ' + step.label + ' (+' + formatNumber(step.tokens) + ')');
    _renderSimBar();

    _simState.stepIndex++;

    var progress = document.getElementById('memory-sim-progress');
    if (progress) {
      progress.textContent = 'Step ' + _simState.stepIndex + ' / ' + scenario.steps.length;
    }

    _simScheduleNext();
  }

  function _addToSeg(segId, amount) {
    if (!_simState.segments) return;
    for (var i = 0; i < _simState.segments.length; i++) {
      if (_simState.segments[i].id === segId) {
        _simState.segments[i].tokens += amount;
        break;
      }
    }
  }

  function _renderSimBar() {
    var bar = document.getElementById('memory-sim-bar');
    if (!bar || !_simState.segments) return;

    var total = _simState.segments.reduce(function (s, seg) { return s + seg.tokens; }, 0);
    if (total === 0) { bar.innerHTML = ''; return; }

    var html = '';
    _simState.segments.forEach(function (seg) {
      if (seg.tokens <= 0) return;
      var pct = (seg.tokens / total) * 100;
      html += '<div class="memory-sim-bar__seg" style="width:' + pct.toFixed(2) + '%;background:' + seg.color + '" title="' + seg.label + ': ' + formatNumber(seg.tokens) + ' (' + pct.toFixed(1) + '%)"></div>';
    });

    bar.innerHTML = html;

    // Update total counter
    var totalEl = document.getElementById('memory-sim-total');
    if (totalEl) totalEl.textContent = formatNumber(total) + ' tokens total';
  }

  function _addSimLog(type, text) {
    var log = document.getElementById('memory-sim-log');
    if (!log) return;

    var empty = log.querySelector('.memory-sim-log__empty');
    if (empty) empty.remove();

    var entry = document.createElement('div');
    entry.className = 'memory-sim-log__entry memory-sim-log__entry--' + type;
    entry.textContent = text;

    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  return {
    init: init
  };
})();
