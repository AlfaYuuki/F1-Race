# The F1 Race 🏎️

A full-screen browser racing game inspired by Fuji Speedway, with Mount Fuji on the horizon. Built with HTML, CSS, JavaScript ES modules and Canvas — no framework or build step required.

## Run locally

Requires Node.js 20+ for the optional validation scripts. The game itself is static and can be served by any local HTTP server.

```bash
python -m http.server 8000
```

Open http://localhost:8000.

## Controls

| Action | Keyboard | Mobile |
| --- | --- | --- |
| Accelerate | W / ↑ | GO |
| Brake | S / ↓ | BRAKE |
| Steer left | A / ← | ◀ |
| Steer right | D / → | ▶ |
| Pause / resume | ESC | Pause button |
| Fullscreen | Fullscreen button | Fullscreen button |
| Toggle engine audio | M | Audio button |

## Milestones

### Milestone 4 — Fuji circuit and driving physics
- Full-viewport game canvas with floating HUD; no permanent website sidebar
- Fuji-inspired 4.563 km circuit, stylized curvature and elevation
- Throttle, braking, steering inertia, drag, off-track grip loss and contact response
- AI opponents, touch controls, pause and fullscreen

### Milestone 5 — Racing immersion
- Gear and RPM telemetry, lap/sector timing and synthesized engine audio
- Trackside grandstands, racing boards, tire smoke and impact feedback

### Milestone 6 — Reliability and quality checks
- Node-based project validation and automated core simulation tests
- Duplicate HTML ID and missing DOM-reference detection
- Relative JavaScript import checks
- Cleaned project documentation and reproducible test commands

## Quality checks

```bash
npm test
npm run check
```

The automated suite checks track sampling, physics bounds/reset behavior, AI standings, unique HTML IDs and module import paths. It does not replace testing in real desktop and mobile browsers.

## Simulation notes

This is an original arcade simulation using a Fuji-inspired layout and simplified vehicle dynamics. It is not a licensed Formula 1 product or a professional motorsport simulator. Circuit geometry is stylized, not a surveyed reproduction of the real circuit.

### Milestone 7 — Advanced AI and championship mode
- AI drivers use skill, aggression, corner confidence, traffic awareness and passing-line decisions
- Five-round championship with a points table, round results and season winner
- Championship progress is saved locally on the device; quick race remains available
