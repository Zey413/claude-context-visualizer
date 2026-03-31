/**
 * Claude Context Window Visualizer — Data Generator Module
 * Generates simulated conversation data for testing and demo purposes.
 * Provides preset scenarios (simple Q&A, coding, document analysis, etc.)
 * and random generation utilities with optional seeded PRNG for reproducibility.
 *
 * Data format per turn:
 *   { turn: Number, system: Number, user: Number, assistant: Number, tools: Number }
 *
 * API:  window.DataGenerator = { getScenarios, generate, generateRandom }
 */

'use strict';

var DataGenerator = (function () {

  // =========================================================================
  // Seeded Pseudo-Random Number Generator (Mulberry32)
  // Produces deterministic sequences when given the same seed.
  // =========================================================================

  /**
   * Create a seeded PRNG using the Mulberry32 algorithm.
   * @param {number} seed - Integer seed value.
   * @returns {function(): number} Returns a function that yields [0, 1) floats.
   */
  function _createRNG(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Return a random integer in [min, max] (inclusive) using the given PRNG.
   * @param {function} rng - PRNG function returning [0,1).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function _randInt(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  // =========================================================================
  // Scenario Definitions
  // =========================================================================

  /**
   * Each scenario specifies:
   *   id          - unique key
   *   name        - human-readable name
   *   description - short explanation
   *   numTurns    - number of conversation turns
   *   generator   - function(turnIndex, numTurns, contextWindow, rng) => turn object
   *
   * The generator receives a 0-based turnIndex.
   */
  var SCENARIOS = {

    // ------------------------------------------------------------------
    // simpleQA: Short, predictable exchanges. No tool usage.
    // ------------------------------------------------------------------
    simpleQA: {
      id: 'simpleQA',
      name: 'Simple Q&A',
      description: 'Short question-and-answer session (10 turns, no tool use)',
      numTurns: 10,
      generator: function (idx, _numTurns, _ctxWin, rng) {
        return {
          turn:      idx + 1,
          system:    idx === 0 ? _randInt(rng, 300, 600) : 0,
          user:      _randInt(rng, 300, 800),
          assistant: _randInt(rng, 500, 1500),
          tools:     0
        };
      }
    },

    // ------------------------------------------------------------------
    // codingSession: Heavier assistant output, moderate tool calls.
    // ------------------------------------------------------------------
    codingSession: {
      id: 'codingSession',
      name: 'Coding Session',
      description: 'Programming assistance with code generation and tool use (15 turns)',
      numTurns: 15,
      generator: function (idx, _numTurns, _ctxWin, rng) {
        return {
          turn:      idx + 1,
          system:    idx === 0 ? _randInt(rng, 400, 800) : 0,
          user:      _randInt(rng, 500, 2000),
          assistant: _randInt(rng, 1000, 5000),
          tools:     _randInt(rng, 500, 3000)
        };
      }
    },

    // ------------------------------------------------------------------
    // documentAnalysis: First turn has a very large user payload (the
    // uploaded document). Subsequent turns are progressively smaller as
    // follow-up questions reference earlier context.
    // ------------------------------------------------------------------
    documentAnalysis: {
      id: 'documentAnalysis',
      name: 'Document Analysis',
      description: 'Large document upload then progressive analysis (5 turns)',
      numTurns: 5,
      generator: function (idx, numTurns, _ctxWin, rng) {
        var isFirst = idx === 0;

        // User payload shrinks linearly from large to small
        var userMin, userMax;
        if (isFirst) {
          userMin = 15000;
          userMax = 30000;
        } else {
          // Decay factor: each subsequent turn is smaller
          var decay = 1 - (idx / numTurns);
          userMin = Math.round(300 * decay + 200);
          userMax = Math.round(2000 * decay + 400);
        }

        // Assistant produces longer summaries early, shorter answers later
        var assistMin = isFirst ? 2000 : Math.round(800 * (1 - idx / numTurns) + 400);
        var assistMax = isFirst ? 6000 : Math.round(3000 * (1 - idx / numTurns) + 800);

        return {
          turn:      idx + 1,
          system:    idx === 0 ? _randInt(rng, 500, 1000) : 0,
          user:      _randInt(rng, userMin, userMax),
          assistant: _randInt(rng, assistMin, assistMax),
          tools:     isFirst ? 0 : _randInt(rng, 0, 500)
        };
      }
    },

    // ------------------------------------------------------------------
    // agentWorkflow: Heavy tool usage pattern — the model repeatedly
    // calls external tools (file read/write, web search, etc.).
    // ------------------------------------------------------------------
    agentWorkflow: {
      id: 'agentWorkflow',
      name: 'Agent Workflow',
      description: 'Autonomous agent with heavy tool usage (20 turns)',
      numTurns: 20,
      generator: function (idx, _numTurns, _ctxWin, rng) {
        // User messages are short directives after the initial prompt
        var userTokens = idx === 0
          ? _randInt(rng, 800, 2000)
          : _randInt(rng, 100, 600);

        return {
          turn:      idx + 1,
          system:    idx === 0 ? _randInt(rng, 800, 1500) : 0,
          user:      userTokens,
          assistant: _randInt(rng, 500, 2500),
          tools:     _randInt(rng, 2000, 8000)
        };
      }
    },

    // ------------------------------------------------------------------
    // longConversation: Gradually growing turns that approach the
    // context window limit. Simulates a session where context
    // accumulates until the window is nearly full.
    // ------------------------------------------------------------------
    longConversation: {
      id: 'longConversation',
      name: 'Long Conversation',
      description: 'Extended chat that gradually approaches the context window limit (30 turns)',
      numTurns: 30,
      generator: function (idx, numTurns, ctxWin, rng) {
        // Target ~90% usage by the final turn.
        // Each turn's "budget" grows with a quadratic curve so early turns
        // are light and later turns are heavier.
        var progress = idx / (numTurns - 1);            // 0..1
        var budgetFraction = 0.9 / numTurns;             // avg fraction per turn
        var scaledBudget = ctxWin * budgetFraction * (0.4 + 1.2 * progress);

        // Distribute ~15% user, ~60% assistant, ~15% tools, ~10% system (first only)
        var userShare      = 0.15 + rng() * 0.05;
        var assistantShare = 0.55 + rng() * 0.10;
        var toolsShare     = 0.10 + rng() * 0.10;

        var userTokens      = Math.round(scaledBudget * userShare);
        var assistantTokens = Math.round(scaledBudget * assistantShare);
        var toolsTokens     = Math.round(scaledBudget * toolsShare);

        // Clamp minimum values so bars are always visible
        userTokens      = Math.max(userTokens, 200);
        assistantTokens = Math.max(assistantTokens, 400);
        toolsTokens     = Math.max(toolsTokens, 0);

        return {
          turn:      idx + 1,
          system:    idx === 0 ? _randInt(rng, 500, 1200) : 0,
          user:      userTokens,
          assistant: assistantTokens,
          tools:     toolsTokens
        };
      }
    }
  };

  // =========================================================================
  // Public Helpers
  // =========================================================================

  /**
   * Return metadata for all available scenarios.
   * @returns {Array<{id: string, name: string, description: string, numTurns: number}>}
   */
  function getScenarios() {
    var list = [];
    for (var key in SCENARIOS) {
      if (SCENARIOS.hasOwnProperty(key)) {
        var s = SCENARIOS[key];
        list.push({
          id:          s.id,
          name:        s.name,
          description: s.description,
          numTurns:    s.numTurns
        });
      }
    }
    return list;
  }

  /**
   * Generate a full conversation dataset for a given scenario.
   *
   * @param {string}  scenarioId    - One of the SCENARIOS keys.
   * @param {number}  [contextWindow=200000] - Context window size in tokens.
   * @param {number}  [seed]        - Optional PRNG seed for reproducibility.
   * @returns {Array<Object>} Array of turn objects.
   * @throws {Error} If scenarioId is unknown.
   */
  function generate(scenarioId, contextWindow, seed) {
    var scenario = SCENARIOS[scenarioId];
    if (!scenario) {
      throw new Error('DataGenerator: unknown scenario "' + scenarioId + '". ' +
        'Available: ' + Object.keys(SCENARIOS).join(', '));
    }

    var ctxWin = contextWindow || 200000;
    var rng = _createRNG(seed != null ? seed : Date.now());
    var turns = [];

    for (var i = 0; i < scenario.numTurns; i++) {
      turns.push(scenario.generator(i, scenario.numTurns, ctxWin, rng));
    }

    return turns;
  }

  /**
   * Generate a random conversation with the specified number of turns.
   * Token distributions are randomized per turn — no specific scenario pattern.
   *
   * @param {number}  numTurns       - Number of turns to generate (1–100).
   * @param {number}  [contextWindow=200000] - Context window size in tokens.
   * @param {number}  [seed]         - Optional PRNG seed for reproducibility.
   * @returns {Array<Object>} Array of turn objects.
   */
  function generateRandom(numTurns, contextWindow, seed) {
    var count  = Math.max(1, Math.min(numTurns || 10, 100));
    var ctxWin = contextWindow || 200000;
    var rng    = _createRNG(seed != null ? seed : Date.now());
    var turns  = [];

    // Compute a rough per-turn budget so the total stays within the window.
    // Target 60–85% total utilisation.
    var targetUtil  = 0.60 + rng() * 0.25;
    var totalBudget = ctxWin * targetUtil;
    var avgPerTurn  = totalBudget / count;

    for (var i = 0; i < count; i++) {
      // Per-turn jitter: 40%–160% of average budget
      var turnBudget = avgPerTurn * (0.4 + rng() * 1.2);

      // Random category split
      var hasTools = rng() > 0.3;   // ~70% chance of tool use in a random turn
      var userPct  = 0.10 + rng() * 0.25;
      var assistPct = 0.30 + rng() * 0.35;
      var toolsPct = hasTools ? (0.05 + rng() * 0.25) : 0;
      var total    = userPct + assistPct + toolsPct;

      turns.push({
        turn:      i + 1,
        system:    i === 0 ? _randInt(rng, 300, 1200) : 0,
        user:      Math.max(50, Math.round(turnBudget * (userPct / total))),
        assistant: Math.max(100, Math.round(turnBudget * (assistPct / total))),
        tools:     hasTools ? Math.max(0, Math.round(turnBudget * (toolsPct / total))) : 0
      });
    }

    return turns;
  }

  // =========================================================================
  // Expose Public API
  // =========================================================================

  return {
    /**
     * List all available preset scenarios.
     * @returns {Array<{id, name, description, numTurns}>}
     */
    getScenarios: getScenarios,

    /**
     * Generate conversation data for a preset scenario.
     * @param {string}  scenarioId
     * @param {number}  [contextWindow=200000]
     * @param {number}  [seed]
     * @returns {Array<{turn, system, user, assistant, tools}>}
     */
    generate: generate,

    /**
     * Generate a random conversation with arbitrary turn count.
     * @param {number}  numTurns
     * @param {number}  [contextWindow=200000]
     * @param {number}  [seed]
     * @returns {Array<{turn, system, user, assistant, tools}>}
     */
    generateRandom: generateRandom
  };

})();

// Assign to window for global access
window.DataGenerator = DataGenerator;
