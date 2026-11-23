# The F1 Race 🏎️

A browser-based arcade racing prototype set on a Fuji-inspired circuit, with Mount Fuji on the horizon. Built with plain HTML, CSS, JavaScript modules, and the HTML Canvas API — no framework or build step required.

## Run locally

JavaScript modules need to be served over HTTP; opening `index.html` directly may block module loading.

### Python
```bash
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000).

### VS Code
Use the Live Server extension and open `index.html` with Live Server.

## Controls

| Action | Keyboard | Mobile |
| --- | --- | --- |
| Accelerate | W / ↑ | GO |
| Brake | S / ↓ | BRAKE |
| Steer left | A / ← | ◀ |
| Steer right | D / → | ▶ |

## Project structure

```text
F1-Race/
├── index.html
├── README.md
├── .gitignore
├── css/
│   └── main.css
└── js/
    ├── main.js       # Application entry point and HUD wiring
    ├── game.js       # Race state, countdown, laps and animation loop
    ├── renderer.js   # Canvas scene, perspective road, scenery and car
    ├── physics.js    # Arcade acceleration, braking and steering
    ├── track.js      # Track curve helpers
    └── controls.js   # Keyboard and touch input
```

## Current prototype

- Responsive racing-game interface and HUD
- Pseudo-3D perspective road with animated track markings
- Fuji-inspired distant mountain scenery and roadside trees
- Player car with arcade acceleration, braking and steering
- Three-lap session timer and countdown
- Keyboard and touch controls

This is an original arcade prototype, not a licensed Formula 1 product or a full-accuracy motorsport simulator. Opponent AI, detailed vehicle models, audio, collisions, track-specific geometry and saved lap records are future milestones.

## Development notes

- Keep application code in `js/` and styles in `css/`.
- Use ES modules and avoid adding a build system unless the project needs one.
- Test keyboard and touch controls at both desktop and mobile viewport sizes.
