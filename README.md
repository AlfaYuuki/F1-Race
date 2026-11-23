# The F1 Race 🏎️

A lightweight browser-based arcade racing prototype set at a fictionalized Fuji-inspired circuit, with Mount Fuji on the horizon.

## Run locally

Because the JavaScript uses ES modules, run it through a local development server rather than opening `index.html` directly.

### Option 1: Python
```bash
python -m http.server 8000
```
Then visit http://localhost:8000

### Option 2: VS Code
Install the **Live Server** extension, right-click `index.html`, and choose **Open with Live Server**.

## Controls
- W / ↑: accelerate
- S / ↓: brake
- A / ←: steer left
- D / →: steer right
- Touch controls are available on narrow/mobile screens.

## Architecture
- `js/main.js` — application entry point and UI wiring
- `js/game.js` — race state, countdown, laps and animation loop
- `js/renderer.js` — Canvas scenery, perspective road and player car
- `js/physics.js` — arcade speed and steering model
- `js/track.js` — track curve helpers
- `js/controls.js` — keyboard and touch input
- `css/main.css` — responsive visual system

## Current prototype scope
This is an original pseudo-3D arcade prototype, not a licensed Formula 1 simulation. It currently includes a player car, perspective road, scenery, basic arcade handling, a three-lap timer, HUD and touch controls. Competitors, detailed vehicle models, sound, collisions and track-specific accuracy are planned for later milestones.

## Next milestones
1. Add opponents and race positions.
2. Improve track geometry, corner variety and collision handling.
3. Add car selection, upgrades and a garage.
4. Add audio, settings and persistent best-lap records.
5. Optimize rendering and accessibility across devices.
