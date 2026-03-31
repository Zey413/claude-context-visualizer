# Claude Context Window Visualizer

![Version](https://img.shields.io/badge/version-3.4.0-8B5CF6)
![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat&logo=pwa&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

Interactive visualization of Claude's context window token usage. Features an animated SVG donut gauge, **realtime context monitor**, **alert timeline with replay**, **token waterfall analysis**, **context compaction simulator**, **model cost heatmap**, **all-model comparison dashboard**, **advanced charts (Pie/Radar/Trend)**, **Claude Code memory tracker**, **token flow stream animation**, model comparison mode, token estimator, API response parser, analytics panel, conversation simulator, usage timeline, and full internationalization -- all in a zero-dependency PWA with dark glassmorphism UI.

<p align="center">
  <img src="https://img.shields.io/badge/Claude-Context_Visualizer_v3.4-8B5CF6?style=for-the-badge" alt="Claude Context Visualizer v3.4"/>
</p>

<p align="center">
  <a href="https://zey413.github.io/claude-context-visualizer/"><strong>Live Demo</strong></a>
</p>

---

## What's New in v3.4

- **Token Calculator** -- Enhanced text-to-token estimator with CJK/code-aware heuristics, real-time stats, cost estimation, and quick-apply buttons.
- **Keyboard Help** -- Press `?` to view all keyboard shortcuts in a searchable modal panel.
- **Service Worker Fix** -- Network-first caching strategy ensures returning visitors always get the latest version.

## What's New in v3.3

- **Conversation Log Analyzer** -- Batch analysis of Claude API responses with drag-drop support. Statistics dashboard, trend charts, and integration with Waterfall/Timeline modules.
- **Custom Template Builder** -- Create, save, and share reusable token allocation templates with visual SVG preview. Supports up to 10 templates with localStorage persistence.
- **First-load fix** -- Dashboard now always shows data on first visit (detects zero-state and applies "Long Conversation" preset).

## What's New in v3.2

- **Guided Tour** -- 7-step interactive onboarding highlights key features with overlay, auto-scroll, and progress indicators.
- **Optimization Advisor** -- Smart rule engine analyzes your token allocation and recommends improvements (system prompt size, caching, model selection, tool overhead).
- **Config Exporter** -- Export current configuration as JSON, YAML, Markdown report, or Claude API snippet with one click.
- **Better Default Experience** -- First-time visitors now see "Long Conversation" preset (65% usage) instead of empty dashboard.

## What's New in v3.1

- **Context Compaction Simulator** -- Simulate `/compact` command with 4 strategies (Balanced, Keep System, Keep Recent, Minimize Tools). Animated before/after comparison with configurable compression ratio.
- **Model Cost Heatmap** -- Interactive matrix comparing request costs across all 8 Claude models × 5 usage scenarios. Color-coded with "Best Value" badges.
- **Demo Data Seeding** -- New visitors see pre-filled sample data in Token Waterfall and Alert Timeline.
- **Emoji Fix** -- Fixed Unicode surrogate pair display issues across all modules.
- **Mobile Optimization** -- 250+ lines of responsive CSS, touch targets, landscape mode support.

## What's New in v3.0

- **Realtime Context Monitor** -- Live dashboard with Canvas ring gauge, consumption rate tracking, capacity prediction, and danger alerts. Parse Claude Code `/context` output directly or run live simulations.
- **Alert Timeline & Replay** -- SVG stacked area timeline with 3-tier smart alerts (80%/90%/95%), toast notifications, replay controls with 4 speed settings, and draggable progress bar.
- **Token Waterfall Analysis** -- Per-turn waterfall chart with cumulative overlay, click-to-expand detail panels, bulk JSON import, and staggered animation rendering.
- **MIT License** -- Added proper LICENSE file to the repository.

## What's New in v2.2

- **3 critical bug fixes** from comprehensive audit
- **Scroll entrance animations** — cards fade in as you scroll
- **Micro-interaction polish** — button press feedback, card hover lift, chevron rotation
- **Focus-visible accessibility** — purple outline rings on all interactive elements
- **prefers-reduced-motion** — all animations respect accessibility preferences

## What's New in v2.1

- **Claude Opus 4.6** & **Sonnet 4.6** — 1M context, latest flagship models
- **Health Monitor HUD** — always-visible bar with usage ring, cost ticker, danger alerts
- **Sankey Flow Diagram** — beautiful SVG token lifecycle visualization
- **Prompt Cache Savings** — see how caching cuts costs by up to 90%
- **Cost Forecast** — project daily/monthly/yearly costs with budget tracking
- **Prompt caching pricing** on all models

## What's New in v2.0

- **8 Claude models** with current pricing (including Claude 4.5 Sonnet 1M)
- **All-Model Dashboard** (D key) -- fullscreen comparison of every model
- **Advanced Charts** -- Pie, Radar (5-axis analysis), Trend Line
- **Claude Code Memory Tracker** -- visualize the 5,280-token startup overhead
- **Session Simulator** -- 3 scenarios with step-by-step animated replay
- **Token Flow Stream** -- mesmerizing canvas particle animation
- **Automatic migration** from v1 saved state

---

## Features

### Core

- **Animated SVG donut gauge** -- smooth arc transitions with color-coded segments (System / User / Assistant / Tools)
- **Horizontal stacked bar** -- secondary visualization below the gauge with percentage labels
- **8 Claude models** -- Opus 4, Sonnet 4, Opus 4.5, Sonnet 4.5, Sonnet 4.5 (1M), 3.5 Sonnet, 3.5 Haiku, 3 Opus
- **Interactive sliders** -- per-category token allocation with linked number inputs
- **4 quick presets** -- Light Chat, Long Conversation, Tool-Heavy Agent, Near Limit
- **Dark glassmorphism UI** -- frosted-glass cards, gradient glows, smooth CSS transitions

### Dashboard & Charts

- **All-Model Comparison Dashboard** -- fullscreen overlay with proportional context bars, tier badges, cost comparison
- **Pie Chart** -- donut-style token distribution with interactive segments
- **Radar Chart** -- 5-axis analysis (Utilization, Diversity, Efficiency, Headroom, Balance)
- **Trend Line Chart** -- stacked area showing token usage across timeline snapshots

### Claude Code Integration

- **Memory Tracker** -- visualize Claude Code's internal context allocation:
  - System Prompt: ~4,200 tokens
  - MEMORY.md: ~680 tokens
  - Environment Info: ~280 tokens
  - MCP Tools (deferred): ~120 tokens
  - Total fixed overhead: **5,280 tokens**
- **Session Simulator** -- 3 interactive scenarios (Quick Fix, Feature Build, Codebase Exploration)
- **Token Flow Stream** -- canvas-based particle animation showing tokens flowing to context window

### Analytics & Insights

- **Efficiency score** -- 0-100 score based on token diversity and context headroom
- **API cost estimate** -- per-request cost using real model pricing
- **Optimization tips** -- dynamic suggestions based on current token allocation
- **Token-per-dollar indicator** -- shows tokens per $0.001 for cost awareness
- **Mini sparkline charts** -- inline trend graphs in each category card

### Tools & Integration

- **API response parser** -- paste Claude API response JSON to auto-extract token usage
- **Conversation simulator** -- animate context filling over 5 seconds
- **Remaining turns counter** -- estimates conversation turns left
- **Token estimator** -- paste text to estimate token count (CJK-aware)
- **Model comparison mode** -- side-by-side gauges for two models
- **Context budget planner** -- quiz-based model & allocation recommendations
- **Prompt templates** -- 6 real-world presets (Coding, Support, Data, Writer, RAG, Claude Code)
- **Conversation replay** -- 3 selectable scenarios with play/pause/reset

### Export & Share

- **Export PNG** -- high-quality 800x600 image with gauge and breakdown
- **Share URL** -- encode current state in URL query params
- **Copy stats** -- formatted text summary to clipboard

### Platform & Experience

- **Light / dark theme toggle** -- persisted preference
- **Internationalization (i18n)** -- English, Chinese, Japanese
- **PWA support** -- installable standalone app with offline cache
- **Accessibility** -- ARIA labels, roles, live regions, WCAG AA
- **Keyboard shortcuts** -- full keyboard navigation
- **localStorage persistence** -- all state survives reloads
- **Category color cycling** -- click dots to customize colors
- **Canvas particle background** -- reacts to usage percentage
- **Confetti celebration** -- triggers on "Excellent" efficiency score
- **Print stylesheet** -- clean printable layout
- **SEO optimized** -- Open Graph, Twitter Card, sitemap

---

## Getting Started

No build tools, no dependencies. Just open:

```bash
open index.html
```

Or serve locally:

```bash
python3 -m http.server 8000
# visit http://localhost:8000
```

Or visit: **https://zey413.github.io/claude-context-visualizer/**

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Reset all token values to zero |
| `1` | Apply **Light Chat** preset |
| `2` | Apply **Long Conversation** preset |
| `3` | Apply **Tool-Heavy Agent** preset |
| `4` | Apply **Near Limit** preset |
| `C` | Toggle **model comparison** mode |
| `D` | Toggle **all-model dashboard** |
| `T` | Toggle **light / dark theme** |

> Shortcuts are disabled while typing in input fields.

---

## Models Supported

| Model | Context Window | Output Limit | Tier |
|-------|---------------|-------------|------|
| Claude Opus 4.6 | 1,000,000 | 128,000 | Flagship |
| Claude Sonnet 4.6 | 1,000,000 | 64,000 | Balanced |
| Claude Sonnet 4.5 | 200,000 | 64,000 | Balanced |
| Claude Opus 4 | 200,000 | 32,000 | Flagship |
| Claude Sonnet 4 | 200,000 | 64,000 | Balanced |
| Claude 3.5 Sonnet | 200,000 | 8,192 | Legacy |
| Claude 3.5 Haiku | 200,000 | 8,192 | Speed |
| Claude 3 Opus | 200,000 | 4,096 | Legacy |

---

## Tech Stack

Pure client-side -- zero dependencies.

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | CSS3 (custom properties, glassmorphism, grid) |
| Logic | Vanilla JavaScript (ES6+) |
| Graphics | SVG (gauge, charts) + Canvas (particles, stream) |
| Storage | localStorage |
| PWA | Service Worker + Web App Manifest |
| i18n | Custom JS translation module (EN / ZH / JA) |

---

## Project Structure

```
claude-context-visualizer/
├── index.html              # Main entry point
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline cache, v10)
├── robots.txt              # Search engine directives
├── sitemap.xml             # Sitemap for SEO
├── CHANGELOG.md            # Release notes
├── css/
│   └── style.css           # Glassmorphism theme, all component styles
├── js/
│   ├── models.js           # 8 Claude models, pricing, presets, migration
│   ├── i18n.js             # Internationalization (EN/ZH/JA)
│   ├── gauge.js            # SVG donut gauge renderer
│   ├── particles.js        # Canvas particle background
│   ├── share.js            # Export PNG, share URL, copy stats
│   ├── dashboard.js        # All-model comparison dashboard
│   ├── charts.js           # SVG charts (Pie, Radar, Trend)
│   ├── memory-tracker.js   # Claude Code memory visualization
│   ├── stream.js           # Token flow stream animation
│   ├── health-monitor.js   # Real-time context health HUD
│   ├── sankey.js           # SVG Sankey flow diagram
│   ├── cache-viz.js        # Prompt cache savings visualizer
│   ├── cost-forecast.js    # Cost forecast & budget tracker
│   ├── scroll-fx.js        # Scroll animations & micro-interactions
│   └── app.js              # State, sliders, analytics, simulator
└── assets/
    └── favicon.svg         # App icon
```

---

## License

MIT

---

Built by [@Zey413](https://github.com/Zey413)
