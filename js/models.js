/**
 * Claude Context Window Visualizer — Model Definitions v2.0
 * Defines Claude models, token categories, color schemes, and usage presets.
 * Updated: March 2026 — reflects current Anthropic model lineup.
 */

'use strict';

/**
 * Model data version for localStorage migration.
 * Bump this when the model array changes order or composition.
 */
const MODEL_DATA_VERSION = 2;

/**
 * Old model IDs from v1 for migration mapping.
 * Maps old index → new model ID so share URLs and saved state survive upgrades.
 */
const V1_MODEL_MIGRATION = [
  'claude-4-opus',        // v1 index 0 → Claude 4 Opus
  'claude-4-sonnet',      // v1 index 1 → Claude 4 Sonnet
  'claude-3.5-sonnet',    // v1 index 2 → Claude 3.5 Sonnet
  'claude-3.5-haiku',     // v1 index 3 → Claude 3.5 Haiku
  'claude-3-opus',        // v1 index 4 → Claude 3 Opus
];

const CLAUDE_MODELS = [
  {
    id: 'claude-4-opus',
    name: 'Claude 4 Opus',
    contextWindow: 200000,
    outputLimit: 32000,
    color: '#A855F7',
    tier: 'flagship',
    description: 'Top-tier intelligence, complex reasoning',
    pricing: { inputPerMTok: 15, outputPerMTok: 75 }
  },
  {
    id: 'claude-4-sonnet',
    name: 'Claude 4 Sonnet',
    contextWindow: 200000,
    outputLimit: 64000,
    color: '#6366F1',
    tier: 'balanced',
    description: 'High performance, 64K output',
    pricing: { inputPerMTok: 3, outputPerMTok: 15 }
  },
  {
    id: 'claude-4.5-opus',
    name: 'Claude 4.5 Opus',
    contextWindow: 200000,
    outputLimit: 32000,
    color: '#D946EF',
    tier: 'flagship',
    description: 'Enhanced Opus with deeper reasoning',
    pricing: { inputPerMTok: 15, outputPerMTok: 75 }
  },
  {
    id: 'claude-4.5-sonnet',
    name: 'Claude 4.5 Sonnet',
    contextWindow: 200000,
    outputLimit: 64000,
    color: '#818CF8',
    tier: 'balanced',
    description: 'Latest balanced model, fast & capable',
    pricing: { inputPerMTok: 3, outputPerMTok: 15 }
  },
  {
    id: 'claude-4.5-sonnet-1m',
    name: 'Claude 4.5 Sonnet (1M)',
    contextWindow: 1000000,
    outputLimit: 64000,
    color: '#F472B6',
    tier: 'extended',
    description: 'Extended thinking, 1M context window',
    pricing: { inputPerMTok: 3, outputPerMTok: 15 }
  },
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    outputLimit: 8192,
    color: '#3B82F6',
    tier: 'legacy',
    description: 'Fast & intelligent, legacy',
    pricing: { inputPerMTok: 3, outputPerMTok: 15 }
  },
  {
    id: 'claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    outputLimit: 8192,
    color: '#06B6D4',
    tier: 'speed',
    description: 'Fastest, most cost-effective',
    pricing: { inputPerMTok: 0.80, outputPerMTok: 4 }
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    contextWindow: 200000,
    outputLimit: 4096,
    color: '#8B5CF6',
    tier: 'legacy',
    description: 'Previous gen flagship, legacy',
    pricing: { inputPerMTok: 15, outputPerMTok: 75 }
  }
];

const TOKEN_CATEGORIES = [
  {
    id: 'system',
    label: 'System Prompt',
    color: '#8B5CF6',
    icon: '\u2699\uFE0F',
    description: 'System instructions and context'
  },
  {
    id: 'user',
    label: 'User Messages',
    color: '#3B82F6',
    icon: '\uD83D\uDC64',
    description: 'User input and queries'
  },
  {
    id: 'assistant',
    label: 'Assistant Output',
    color: '#10B981',
    icon: '\uD83E\uDD16',
    description: 'Claude\'s responses'
  },
  {
    id: 'tools',
    label: 'Tool Use',
    color: '#F59E0B',
    icon: '\uD83D\uDD27',
    description: 'Tool calls, results, and schemas'
  }
];

const REMAINING_COLOR = '#1E1B2E';
const REMAINING_STROKE = '#2D2A3E';

const PRESETS = [
  {
    id: 'light-chat',
    name: 'Light Chat',
    icon: '\uD83D\uDCAC',
    description: 'Simple conversation',
    allocation: { system: 0.02, user: 0.05, assistant: 0.08, tools: 0.0 }
  },
  {
    id: 'long-conversation',
    name: 'Long Conversation',
    icon: '\uD83D\uDCDC',
    description: 'Extended multi-turn dialogue',
    allocation: { system: 0.03, user: 0.25, assistant: 0.35, tools: 0.02 }
  },
  {
    id: 'tool-heavy',
    name: 'Tool-Heavy Agent',
    icon: '\uD83D\uDEE0\uFE0F',
    description: 'Agent with many tool calls',
    allocation: { system: 0.05, user: 0.10, assistant: 0.20, tools: 0.35 }
  },
  {
    id: 'near-limit',
    name: 'Near Limit',
    icon: '\uD83D\uDD25',
    description: 'Context window almost full',
    allocation: { system: 0.04, user: 0.30, assistant: 0.40, tools: 0.18 }
  }
];

/**
 * Migrate a v1 model index to the corresponding v2 model index.
 * Returns the new index, or 0 if unmappable.
 */
function migrateModelIndex(oldIndex) {
  if (oldIndex < 0 || oldIndex >= V1_MODEL_MIGRATION.length) return 0;
  var targetId = V1_MODEL_MIGRATION[oldIndex];
  var newIndex = CLAUDE_MODELS.findIndex(function (m) { return m.id === targetId; });
  return newIndex >= 0 ? newIndex : 0;
}

/**
 * Format a number with commas: 1000000 -> "1,000,000"
 */
function formatNumber(n) {
  return Math.round(n).toLocaleString();
}

/**
 * Format tokens in short form: 200000 -> "200K", 1000000 -> "1M"
 */
function formatTokensShort(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return n.toString();
}
