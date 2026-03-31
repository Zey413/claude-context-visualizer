# Claude Context Window Visualizer

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat&logo=pwa&logoColor=white)

Interactive visualization of Claude's context window token usage. Features an animated SVG donut gauge, model comparison mode, token estimator, API response parser, analytics panel, conversation simulator, usage timeline, and full internationalization -- all in a zero-dependency PWA with dark glassmorphism UI.

<p align="center">
  <img src="https://img.shields.io/badge/Claude-Context_Visualizer-8B5CF6?style=for-the-badge" alt="Claude Context Visualizer"/>
</p>

<p align="center">
  <a href="https://zey413.github.io/claude-context-visualizer/"><strong>Live Demo</strong></a>
</p>

---

## Features

### Core

- **Animated SVG donut gauge** -- smooth arc transitions with color-coded segments (System / User / Assistant / Tools)
- **Horizontal stacked bar** -- secondary visualization below the gauge with percentage labels
- **5 Claude models** -- Claude 4 Opus (1M), Claude 4 Sonnet (200K), Claude 3.5 Sonnet (200K), Claude 3.5 Haiku (200K), Claude 3 Opus (200K)
- **Interactive sliders** -- per-category token allocation with linked number inputs
- **4 quick presets** -- Light Chat, Long Conversation, Tool-Heavy Agent, Near Limit
- **Dark glassmorphism UI** -- frosted-glass cards, gradient glows, smooth CSS transitions

### Analytics & Insights

- **Efficiency score** -- 0-100 score based on token diversity and context headroom
- **API cost estimate** -- per-request cost using real model pricing ($15/$3/$0.80 per MTok)
- **Optimization tips** -- dynamic suggestions based on current token allocation
- **Token-per-dollar indicator** -- shows tokens per $0.001 for cost awareness
- **Mini sparkline charts** -- inline trend graphs in each category card from timeline history

### Tools & Integration

- **API response parser** -- paste Claude API response JSON to auto-extract token usage
- **Conversation simulator** -- animate context filling up over 5 seconds (10 simulated turns)
- **Remaining turns counter** -- estimates conversation turns left based on average message size
- **Token estimator** -- paste text to estimate token count (CJK-aware), plus quick-estimate chips
- **Model comparison mode** -- side-by-side gauges to compare allocations across two models

### Export & Share

- **Export PNG** -- high-quality 800x600 image with full gauge and category breakdown
- **Share URL** -- encode current state in URL query params for easy sharing
- **Copy stats** -- formatted text summary to clipboard

### Platform & Experience

- **Light / dark theme toggle** -- smooth transition, preference persisted
- **Internationalization (i18n)** -- English, Chinese (中文), Japanese (日本語)
- **PWA support** -- installable standalone app with offline service worker cache
- **Accessibility** -- ARIA labels, roles, live regions, WCAG AA contrast, focus management
- **Welcome onboarding** -- first-visit tooltip guiding new users
- **Confetti celebration** -- particle burst when efficiency score reaches "Excellent"
- **Print stylesheet** -- clean printable layout with white background
- **SEO optimized** -- Open Graph, Twitter Card, sitemap.xml, robots.txt
- **localStorage persistence** -- all preferences and state survive page reloads
- **Category color cycling** -- click category dots to customize colors
- **Canvas particle background** -- reacts to usage percentage (speeds up and turns red at >80%)
- **Keyboard shortcuts** -- full keyboard navigation (see table below)

---

## Getting Started

No build tools, no dependencies. Just open the file:

```bash
open index.html
```

Or serve it locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Or visit the hosted version: **https://zey413.github.io/claude-context-visualizer/**

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
| `T` | Toggle **light / dark theme** |

> Shortcuts are disabled while typing in input fields.

---

## Models Supported

| Model | Context Window | Output Limit |
|-------|---------------|-------------|
| Claude 4 Opus | 1,000,000 | 32,000 |
| Claude 4 Sonnet | 200,000 | 16,000 |
| Claude 3.5 Sonnet | 200,000 | 8,192 |
| Claude 3.5 Haiku | 200,000 | 8,192 |
| Claude 3 Opus | 200,000 | 4,096 |

---

## Tech Stack

Pure client-side -- zero dependencies.

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | CSS3 (custom properties, glassmorphism, grid) |
| Logic | Vanilla JavaScript (ES6+) |
| Graphics | SVG (donut gauge) + Canvas (particle background) |
| Storage | localStorage |
| PWA | Service Worker + Web App Manifest |
| i18n | Custom JS translation module (EN / 中文 / 日本語) |

---

## Project Structure

```
claude-context-visualizer/
├── index.html          # Main entry point (30KB, all panels & markup)
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline cache, v3)
├── robots.txt          # Search engine directives
├── sitemap.xml         # Sitemap for SEO
├── css/
│   └── style.css       # Glassmorphism theme, animations, print styles (42KB)
├── js/
│   ├── models.js       # Model definitions, pricing, presets, categories
│   ├── i18n.js         # Internationalization (EN/中文/日本語)
│   ├── gauge.js        # SVG donut gauge renderer with animations
│   ├── particles.js    # Canvas particle background system
│   ├── share.js        # Export PNG, share URL, copy stats
│   └── app.js          # State, sliders, analytics, API parser, simulator (46KB)
└── assets/
    └── favicon.svg     # App icon (SVG gauge)
```

---

## License

MIT

---

Built by [@Zey413](https://github.com/Zey413)
