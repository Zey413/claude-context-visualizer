# Claude Context Window Visualizer

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![No Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)

Interactive visualization of Claude's context window token usage with animated SVG gauge and dark glassmorphism UI.

<p align="center">
  <img src="https://img.shields.io/badge/Claude-Context_Visualizer-8B5CF6?style=for-the-badge" alt="Claude Context Visualizer"/>
</p>

---

## Features

- **Animated SVG donut gauge** — smooth arc transitions with real-time token usage rendering
- **Color-coded segments** — distinct colors for System (purple), User (blue), Assistant (green), and Tools (amber)
- **Multiple Claude model support** — switch between 1M and 200K context models
- **Interactive sliders** — fine-tune token values per category with linked number inputs
- **Quick presets** — jump to common scenarios (Light Chat, Long Conversation, Tool-Heavy Agent, Near Limit)
- **Dark glassmorphism theme** — frosted-glass cards with subtle background glows
- **Responsive design** — works on desktop and mobile viewports
- **localStorage persistence** — your settings survive page reloads
- **Keyboard shortcuts** — fast preset switching and reset without touching the mouse

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

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Apply **Light Chat** preset |
| `2` | Apply **Long Conversation** preset |
| `3` | Apply **Tool-Heavy Agent** preset |
| `4` | Apply **Near Limit** preset |
| `R` | Reset all token values to zero |

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

Pure client-side — zero dependencies.

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | CSS3 (custom properties, glassmorphism, grid) |
| Logic | Vanilla JavaScript (ES6+) |
| Graphics | SVG (programmatic donut gauge) |
| Storage | localStorage |

---

## Project Structure

```
claude-context-visualizer/
├── index.html          # Main entry point
├── css/
│   └── style.css       # Glassmorphism theme & layout
├── js/
│   ├── models.js       # Model definitions, presets, token categories
│   ├── gauge.js        # SVG donut gauge renderer
│   └── app.js          # State management, sliders, persistence
└── assets/
    └── favicon.svg     # App icon
```

---

## License

MIT

---

Built by [@Zey413](https://github.com/Zey413)
