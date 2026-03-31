# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-03-31

### Added
- **Realtime Context Monitor** (`realtime-monitor.js`, 33KB) — Live dashboard for monitoring Claude Code context window usage in real-time
  - Canvas-based ring gauge with gradient colors (green->yellow->red)
  - Horizontal bar charts for per-category token breakdown
  - Token consumption rate indicator (tokens/min)
  - Capacity prediction (estimated minutes until context window is full)
  - Danger alerts with blinking animation at 80%/95% thresholds
  - Rolling 60-point sparkline trend history
  - Parse Claude Code `/context` command output directly
  - Live simulation mode with configurable parameters

- **Alert Timeline & Replay** (`alert-timeline.js`, 40KB) — SVG-based stacked area timeline with intelligent alert system
  - Stacked area chart showing System/User/Assistant/Tools over time
  - 3-tier threshold lines (80% warning, 90% danger, 95% critical)
  - Toast notification system for context window alerts
  - Replay controls with play/pause/reset and 4 speed settings (0.5x/1x/2x/4x)
  - Draggable progress bar for timeline scrubbing
  - Summary statistics: total tokens, avg per turn, peak usage, estimated remaining turns

- **Token Waterfall Analysis** (`token-waterfall.js`, 34KB) — Per-turn waterfall/Gantt chart with detailed analysis
  - Stacked horizontal bars for each conversation turn
  - Cumulative usage curve overlay with gradient coloring
  - Click-to-expand turn detail panel with breakdown pie chart
  - Bulk JSON import for analyzing real conversation data
  - Staggered row animation (100ms delay per row)
  - Hover tooltips with detailed token statistics
  - Export conversation data as JSON

- **MIT LICENSE file** — Added missing license file (previously only mentioned in README)
- **NEW badge** — Animated gradient badge on new feature sections
- **Section description text** — Explanatory text for each new module

### Changed
- Service worker bumped to `ctx-viz-v11` with 3 new JS files cached
- Footer version updated to v3.0.0
- Footer keyboard shortcuts now include `D` for Dashboard
- `app.js` updated with new module initialization and data pipeline
  - `initNewModuleToggle()` helper for collapsible sections
  - `render()` feeds live data to RealtimeMonitor and AlertTimeline
- Added ~600 lines of new CSS for Realtime Monitor, Alert Timeline, and Token Waterfall sections

### Technical
- Total new code: ~107KB across 3 new modules
- All modules follow existing IIFE pattern with `window.*` public API
- Full dark/light theme support for all new components
- Responsive design for mobile (breakpoints at 700px and 600px)
- ARIA attributes and keyboard navigation support

## [2.2.0] - 2026-03-31

### Fixed
- CacheViz parameter mismatch (passed model object instead of modelIndex)
- SankeyDiagram missing `isInited()` in public API
- 40+ missing CSS classes for CacheViz module (slider, comparison, breakdown, recommendation)

### Added
- **Scroll entrance animations** — IntersectionObserver-based fade-in with staggered delays
- **Button press feedback** — 0.96x scale on mousedown for tactile feel
- **Card hover lift** — translateY(-2px) with purple shadow on glass cards
- **Chevron rotation** — 180deg animated rotation on collapsible section open/close
- **Focus-visible rings** — purple outline on all interactive elements for accessibility
- **Preset hover glow** — subtle purple shadow on hover
- **Progress bar transitions** — smooth width animations on token bars
- **prefers-reduced-motion** support — all animations disabled for accessibility
- New `js/scroll-fx.js` module (auto-initializes)

### Changed
- Service worker cache bumped to v10

## [2.1.0] - 2026-03-31

### Added
- **Claude Opus 4.6** (1M context, 128K output, $5/$25) — latest flagship model
- **Claude Sonnet 4.6** (1M context, 64K output, $3/$15) — latest balanced model
- **Prompt caching pricing** fields on all models (cacheWritePerMTok, cacheReadPerMTok)
- **Health Monitor HUD** — always-visible compact bar with usage ring, cost ticker, remaining tokens, model badge, danger pulse alert, estimated turns
- **Sankey Flow Diagram** — pure SVG Sankey showing token lifecycle: input categories merge into context window with curved bezier paths, separate output flow
- **Prompt Cache Savings Visualizer** — interactive cache hit rate slider, side-by-side cached/uncached cost comparison, savings breakdown table, optimization recommendations
- **Cost Forecast & Budget Tracker** — daily request projections (per-request → yearly), all-model monthly cost comparison bars, budget progress bar with alerts
- **v2→v3 localStorage migration** for model indices
- i18n keys for all new features (EN, ZH-CN, JA)

### Changed
- Models reorganized by generation (4.6 → 4.5 → 4 → 3.5 → 3)
- Removed deprecated Claude 4.5 Opus and Claude 4.5 Sonnet (1M) variants
- Budget planner now recommends 4.6 models for max and large-context scenarios
- Service worker cache bumped to v9
- MODEL_DATA_VERSION bumped to 3

### Performance
- Agent Teams: 4 features built in parallel by independent agents
- All new modules follow lazy-init pattern
- Health monitor uses lightweight SVG ring (no canvas overhead)
- Sankey diagram uses efficient path calculations

## [2.0.0] - 2026-03-31

### Added
- **Updated model lineup**: 8 Claude models (Opus 4, Sonnet 4, Opus 4.5, Sonnet 4.5, Sonnet 4.5 1M, 3.5 Sonnet, 3.5 Haiku, 3 Opus) with current pricing
- **All-Model Comparison Dashboard**: fullscreen overlay showing every model side-by-side with proportional context bars, tier badges, and cost comparison
- **Advanced Charts module**: pure SVG charts (Pie, Radar, Trend Line) with animated transitions and responsive design
- **Claude Code Memory Tracker**: visualizes Claude Code's internal context allocation (System Prompt 4200, MEMORY.md 680, Environment 280, MCP Tools 120 = 5280 tokens fixed overhead)
- **Session Simulator**: 3 interactive scenarios (Quick Fix, Feature Build, Codebase Exploration) with step-by-step animated replay
- **Token Flow Stream**: canvas-based animated particle visualization showing tokens flowing toward the context window, color-coded by category
- **Dashboard keyboard shortcut** (D) and header toggle button
- **Model tier badges**: flagship, balanced, speed, legacy, extended
- **localStorage migration**: v1 model indices automatically mapped to v2 model array
- **MODEL_DATA_VERSION**: versioned state schema with automatic migration on load

### Changed
- Model data updated from 5 outdated models to 8 current Claude models
- Budget planner model indices updated for new array layout
- Service worker cache bumped to v8 with all new JS modules
- Footer keyboard hint now includes Dashboard shortcut
- i18n translations updated with keys for all new features (EN, ZH-CN, JA)
- Manifest description updated for v2.0

### Performance
- New modules use same lazy initialization pattern as v1 (panels only init on first open)
- Charts use pure SVG (no canvas overhead) with efficient DOM updates
- Dashboard overlay uses backdrop-filter for native GPU-accelerated blur
- Token stream pauses animation loop when collapsed

## [1.0.0] - 2026-03-31

### Added
- SVG donut gauge with animated segments and color-coded arcs (System / User / Assistant / Tools)
- 5 Claude model support with API pricing data (Claude 4 Opus 1M, Claude 4 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus)
- Interactive sliders with linked number inputs for per-category token allocation
- 4 quick presets (Light Chat, Long Conversation, Tool-Heavy Agent, Near Limit)
- Canvas particle background system that reacts to usage percentage
- Usage timeline with 10 snapshots and oldest-to-latest axis
- Model comparison mode with side-by-side gauges
- Token estimator with CJK-aware character counting and quick-estimate chips
- API response parser to auto-extract token usage from Claude JSON responses
- Conversation simulator animating context filling over 5 seconds (10 turns)
- Remaining turns counter based on average message size
- Conversation replay with 3 selectable scenarios and play/pause/reset controls
- Model pricing comparison table with per-request cost and savings column
- Analytics panel with efficiency score (0-100), cost estimate, and optimization tips
- Mini sparkline charts in each category card from timeline history
- Horizontal usage breakdown bar with percentage labels and cost-per-token line
- Export PNG (800x600 with full gauge and breakdown)
- Share URL (state encoded in query params)
- Copy Stats (formatted text summary to clipboard)
- Light/dark theme toggle with smooth transition and persisted preference
- Internationalization (i18n) for English, Chinese (中文), and Japanese (日本語)
- PWA with service worker offline cache (cache-first strategy, v6)
- Web App Manifest for standalone installable app
- Accessibility: ARIA labels, roles, live regions, WCAG AA contrast, focus management
- Welcome onboarding tooltip for first-time visitors
- Confetti celebration particle burst when efficiency score reaches "Excellent"
- Print stylesheet with clean white-background layout
- SEO optimization: Open Graph, Twitter Card, sitemap.xml, robots.txt
- Category color customization (click dots to cycle colors)
- Holographic gauge card border animation
- Keyboard shortcuts (R Reset, 1-4 Presets, C Compare, T Theme)
- localStorage persistence for all preferences and state

### Performance
- requestAnimationFrame-based render throttle for gauge updates
- CSS containment (`contain: layout style paint`) and compositor hints (`will-change`, `transform: translateZ(0)`)
- Particle system mobile optimization with reduced count and simplified rendering
- Lazy panel initialization for collapsible sections
- `content-visibility: auto` for offscreen panels to skip rendering

### Fixed
- Progressive enhancement for `color-mix()` CSS function (fallback for older browsers)
- Null guards throughout codebase (gauge, sliders, inputs, canvas, model selects)
- Proper animation cleanup on reset (clears intervals and restores state)
- Duplicate event listener removal (lang selector)
- Stray closing brace in CSS removed
- Null check in gauge `setSegmentColors` and PNG export canvas context

[2.2.0]: https://github.com/Zey413/claude-context-visualizer/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Zey413/claude-context-visualizer/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Zey413/claude-context-visualizer/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Zey413/claude-context-visualizer/releases/tag/v1.0.0
