/**
 * Claude Context Window Visualizer — Model Definitions v2.1
 * Defines Claude models, token categories, color schemes, and usage presets.
 * Updated: March 2026 — includes Opus 4.6 & Sonnet 4.6 with 1M context.
 */

'use strict';

/**
 * Model data version for localStorage migration.
 * Bump this when the model array changes order or composition.
 */
const MODEL_DATA_VERSION = 3;

/**
 * Old model IDs from v1 for migration mapping.
 */
const V1_MODEL_MIGRATION = [
  'claude-4-opus',
  'claude-4-sonnet',
  'claude-3.5-sonnet',
  'claude-3.5-haiku',
  'claude-3-opus',
];

/**
 * v2 model IDs for v2→v3 migration.
 */
const V2_MODEL_IDS = [
  'claude-4-opus', 'claude-4-sonnet', 'claude-4.5-opus', 'claude-4.5-sonnet',
  'claude-4.5-sonnet-1m', 'claude-3.5-sonnet', 'claude-3.5-haiku', 'claude-3-opus',
];

const CLAUDE_MODELS = [
  // ---- Latest (4.6) ----
  {
    id: 'claude-4.6-opus',
    name: 'Claude Opus 4.6',
    contextWindow: 1000000,
    outputLimit: 128000,
    color: '#E879F9',
    tier: 'flagship',
    generation: '4.6',
    description: 'Most capable, 1M context, 128K output',
    pricing: { inputPerMTok: 5, outputPerMTok: 25, cacheWritePerMTok: 6.25, cacheReadPerMTok: 0.50 }
  },
  {
    id: 'claude-4.6-sonnet',
    name: 'Claude Sonnet 4.6',
    contextWindow: 1000000,
    outputLimit: 64000,
    color: '#C084FC',
    tier: 'balanced',
    generation: '4.6',
    description: 'Fast & capable, 1M context',
    pricing: { inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 }
  },
  // ---- 4.5 ----
  {
    id: 'claude-4.5-sonnet',
    name: 'Claude Sonnet 4.5',
    contextWindow: 200000,
    outputLimit: 64000,
    color: '#818CF8',
    tier: 'balanced',
    generation: '4.5',
    description: 'Balanced performance, 200K context',
    pricing: { inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 }
  },
  // ---- 4.0 ----
  {
    id: 'claude-4-opus',
    name: 'Claude Opus 4',
    contextWindow: 200000,
    outputLimit: 32000,
    color: '#A855F7',
    tier: 'flagship',
    generation: '4',
    description: 'Top-tier intelligence, complex reasoning',
    pricing: { inputPerMTok: 15, outputPerMTok: 75, cacheWritePerMTok: 18.75, cacheReadPerMTok: 1.50 }
  },
  {
    id: 'claude-4-sonnet',
    name: 'Claude Sonnet 4',
    contextWindow: 200000,
    outputLimit: 64000,
    color: '#6366F1',
    tier: 'balanced',
    generation: '4',
    description: 'High performance, 64K output',
    pricing: { inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 }
  },
  // ---- 3.5 ----
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    outputLimit: 8192,
    color: '#3B82F6',
    tier: 'legacy',
    generation: '3.5',
    description: 'Fast & intelligent, legacy',
    pricing: { inputPerMTok: 3, outputPerMTok: 15, cacheWritePerMTok: 3.75, cacheReadPerMTok: 0.30 }
  },
  {
    id: 'claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    outputLimit: 8192,
    color: '#06B6D4',
    tier: 'speed',
    generation: '3.5',
    description: 'Fastest, most cost-effective',
    pricing: { inputPerMTok: 0.80, outputPerMTok: 4, cacheWritePerMTok: 1.00, cacheReadPerMTok: 0.08 }
  },
  // ---- 3 ----
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    contextWindow: 200000,
    outputLimit: 4096,
    color: '#8B5CF6',
    tier: 'legacy',
    generation: '3',
    description: 'Previous gen flagship, legacy',
    pricing: { inputPerMTok: 15, outputPerMTok: 75, cacheWritePerMTok: 18.75, cacheReadPerMTok: 1.50 }
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
 * Migrate a v1 or v2 model index to the v3 model index.
 * Returns the new index, or 0 if unmappable.
 */
function migrateModelIndex(oldIndex, fromVersion) {
  var targetId;
  if (fromVersion === 1 || !fromVersion) {
    if (oldIndex < 0 || oldIndex >= V1_MODEL_MIGRATION.length) return 0;
    targetId = V1_MODEL_MIGRATION[oldIndex];
  } else if (fromVersion === 2) {
    if (oldIndex < 0 || oldIndex >= V2_MODEL_IDS.length) return 0;
    targetId = V2_MODEL_IDS[oldIndex];
  } else {
    return oldIndex < CLAUDE_MODELS.length ? oldIndex : 0;
  }
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
