# The F1 Race 🏎️

A full-screen browser arcade racer inspired by Fuji Speedway, with Mount Fuji on the horizon. Built with plain HTML, CSS, JavaScript modules and the HTML Canvas API — no framework or build step required.

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
| Pause / resume | ESC | Pause button |
| Fullscreen | Fullscreen button | Fullscreen button |

## Milestone 4

- Full-viewport race scene; no permanent side website panel or boxed-in game window
- Floating race telemetry and compact live timing overlay
- Fullscreen toggle and pause/resume
- Fuji-inspired 4.563 km lap model with 16-corner-style curvature sequence and elevation profile
- Improved throttle response, speed-dependent steering, lateral inertia, drag and braking
- Off-track grip loss and speed penalty
- Rival proximity detection with contact response and cooldown
- Touch controls and responsive HUD

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

## Simulation notes

This is an original arcade racing game using a Fuji-inspired layout and simplified vehicle dynamics. It is not a licensed Formula 1 product or a professional-grade motorsport simulator. Circuit geometry is stylized rather than a surveyed, meter-accurate reproduction of the real circuit.

## Development

- Keep application code in `js/` and styles in `css/`.
- Use ES modules and avoid adding a build system unless the project needs one.
- Test keyboard and touch controls at desktop and mobile viewport sizes.
