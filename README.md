# The F1 Race 🏎️

A browser-based arcade racing prototype set on a Fuji-inspired circuit, with Mount Fuji on the horizon. Built with plain HTML, CSS, JavaScript modules, and the HTML Canvas API — no framework or build step required.

## Run locally

JavaScript modules need to be served over HTTP; opening `index.html` directly may block module loading.

```bash
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000).

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
├── css/main.css
└── js/
    ├── main.js
    ├── game.js
    ├── renderer.js
    ├── physics.js
    ├── track.js
    ├── opponents.js
    └── controls.js
```

## Current features

- Responsive racing-game interface and live HUD
- Pseudo-3D perspective road with animated track markings
- Fuji-inspired distant mountain scenery and roadside trees
- Player car with arcade acceleration, braking and steering
- Five AI rivals with distinct pace, skill and lane movement
- Opponent cars rendered into the road perspective
- Live six-driver standings and player race position
- Three-lap session timer, countdown and chequered-flag finish
- Keyboard and touch controls

## AI and race model

Rivals use lightweight pace-based driving logic. Their speed varies with driver skill, corner load and a smooth pace rhythm. Small lane changes and spacing adjustments help avoid cars visually overlapping. Standings are recalculated from cumulative race distance.

This is an original arcade prototype, not a licensed Formula 1 product or a full-accuracy motorsport simulator. Full circuit geometry, detailed vehicle models, audio, collisions, pit strategy and saved lap records remain future milestones.

## Development notes

- Keep application code in `js/` and styles in `css/`.
- Use ES modules and avoid adding a build system unless the project needs one.
- Test keyboard and touch controls at desktop and mobile viewport sizes.
