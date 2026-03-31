# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[2.0.0]: https://github.com/Zey413/claude-context-visualizer/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Zey413/claude-context-visualizer/releases/tag/v1.0.0
