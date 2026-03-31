/**
 * Claude Context Window Visualizer — Model Definitions
 * Defines Claude models, token categories, color schemes, and usage presets.
 */

const CLAUDE_MODELS = [
  {
    id: 'claude-4-opus-1m',
    name: 'Claude 4 Opus (1M)',
    contextWindow: 1000000,
    outputLimit: 32000,
    color: '#A855F7',
    description: 'Most capable, 1M token context',
    pricing: { inputPerMTok: 15, outputPerMTok: 75 }
  },
  {
    id: 'claude-4-sonnet-200k',
    name: 'Claude 4 Sonnet (200K)',
    contextWindow: 200000,
    outputLimit: 16000,
    color: '#6366F1',
    description: 'Balanced performance, 200K context',
    pricing: { inputPerMTok: 3, outputPerMTok: 15 }
  },
  {
    id: 'claude-3.5-sonnet-200k',
    name: 'Claude 3.5 Sonnet (200K)',
    contextWindow: 200000,
    outputLimit: 8192,
    color: '#3B82F6',
    description: 'Fast & intelligent, 200K context',
    pricing: { inputPerMTok: 3, outputPerMTok: 15 }
  },
  {
    id: 'claude-3.5-haiku-200k',
    name: 'Claude 3.5 Haiku (200K)',
    contextWindow: 200000,
    outputLimit: 8192,
    color: '#06B6D4',
    description: 'Fastest, cost-effective, 200K context',
    pricing: { inputPerMTok: 0.80, outputPerMTok: 4 }
  },
  {
    id: 'claude-3-opus-200k',
    name: 'Claude 3 Opus (200K)',
    contextWindow: 200000,
    outputLimit: 4096,
    color: '#8B5CF6',
    description: 'Previous gen flagship, 200K context',
    pricing: { inputPerMTok: 15, outputPerMTok: 75 }
  }
];

const TOKEN_CATEGORIES = [
  {
    id: 'system',
    label: 'System Prompt',
    color: '#8B5CF6',
    icon: '⚙️',
    description: 'System instructions and context'
  },
  {
    id: 'user',
    label: 'User Messages',
    color: '#3B82F6',
    icon: '👤',
    description: 'User input and queries'
  },
  {
    id: 'assistant',
    label: 'Assistant Output',
    color: '#10B981',
    icon: '🤖',
    description: 'Claude\'s responses'
  },
  {
    id: 'tools',
    label: 'Tool Use',
    color: '#F59E0B',
    icon: '🔧',
    description: 'Tool calls, results, and schemas'
  }
];

const REMAINING_COLOR = '#1E1B2E';
const REMAINING_STROKE = '#2D2A3E';

const PRESETS = [
  {
    id: 'light-chat',
    name: 'Light Chat',
    icon: '💬',
    description: 'Simple conversation',
    // Proportions relative to context window
    allocation: { system: 0.02, user: 0.05, assistant: 0.08, tools: 0.0 }
  },
  {
    id: 'long-conversation',
    name: 'Long Conversation',
    icon: '📜',
    description: 'Extended multi-turn dialogue',
    allocation: { system: 0.03, user: 0.25, assistant: 0.35, tools: 0.02 }
  },
  {
    id: 'tool-heavy',
    name: 'Tool-Heavy Agent',
    icon: '🛠️',
    description: 'Agent with many tool calls',
    allocation: { system: 0.05, user: 0.10, assistant: 0.20, tools: 0.35 }
  },
  {
    id: 'near-limit',
    name: 'Near Limit',
    icon: '🔥',
    description: 'Context window almost full',
    allocation: { system: 0.04, user: 0.30, assistant: 0.40, tools: 0.18 }
  }
];

/**
 * Format a number with commas: 1000000 → "1,000,000"
 */
function formatNumber(n) {
  return Math.round(n).toLocaleString();
}

/**
 * Format tokens in short form: 200000 → "200K", 1000000 → "1M"
 */
function formatTokensShort(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return n.toString();
}
