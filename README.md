# Claude Context Window Visualizer

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat&logo=pwa&logoColor=white)

Interactive visualization of Claude's context window token usage. Features an animated SVG donut gauge, model comparison mode, token estimator, usage timeline, and full internationalization -- all in a zero-dependency PWA with dark glassmorphism UI.

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
- **5 Claude models** -- Claude 4 Opus (1M), Claude 4 Sonnet (200K), Claude 3.5 Sonnet (200K), Claude 3.5 Haiku (200K), Claude 3 Opus (200K)
- **Interactive sliders** -- per-category token allocation with linked number inputs
- **4 quick presets** -- Light Chat, Long Conversation, Tool-Heavy Agent, Near Limit
- **Dark glassmorphism UI** -- frosted-glass cards, gradient glows, smooth CSS transitions

### Advanced

- **Canvas particle background** -- dynamic particle effect that reacts to overall usage percentage
- **Usage timeline** -- records and displays the last 10 token-usage snapshots as a mini bar chart
- **Model comparison mode** -- side-by-side gauges to compare how the same allocation looks across two models
- **Token estimator** -- paste text to estimate token count, plus quick-estimate chips for common content sizes; add results directly to any category
- **Export / Share / Copy** -- export the gauge as a PNG image, generate a shareable URL, or copy stats to clipboard
- **Light / dark theme toggle** -- switch between light and dark modes; preference is persisted
- **Internationalization (i18n)** -- full UI translations for English, Chinese (中文), and Japanese (日本語)
- **PWA support** -- installable as a standalone app with service worker for offline use
- **Accessibility** -- ARIA labels, `role` attributes, `aria-live` regions, and screen-reader-friendly markup throughout
- **localStorage persistence** -- model selection, token values, theme, and language survive page reloads
- **Keyboard shortcuts** -- operate the entire app without a mouse (see table below)

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
├── index.html          # Main entry point
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline support)
├── css/
│   └── style.css       # Glassmorphism theme & layout
├── js/
│   ├── models.js       # Model definitions, presets, token categories
│   ├── gauge.js        # SVG donut gauge renderer
│   ├── particles.js    # Canvas particle background
│   ├── i18n.js         # Internationalization strings & logic
│   ├── share.js        # Export PNG, share URL, copy stats
│   └── app.js          # State management, sliders, persistence
└── assets/
    └── favicon.svg     # App icon
```

---

## License

MIT

---

Built by [@Zey413](https://github.com/Zey413)
