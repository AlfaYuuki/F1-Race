# The F1 Race 🏎️

A full-screen browser racing game inspired by Fuji Speedway, with Mount Fuji on the horizon. Built with HTML, CSS, JavaScript ES modules and Canvas — no framework or build step required.

## Run locally

Requires Node.js 20+ for the optional validation scripts. The game itself is static and can be served by any local HTTP server.

```bash
python -m http.server 8000
```

Open http://localhost:8000.

## Controls

On first launch the game asks what you are racing on — **Android** or **Windows** — and switches the controls and on-screen layout to match. The choice is remembered on the device; change it any time with the 🎮 button (top bar) or the **CONTROLS** link on the start card.

### Android (phone / tablet)

| Action | Control |
| --- | --- |
| Accelerate | **GO** button (hold) |
| Brake | **BRAKE** button (hold) |
| Steer | **◀ ▶** buttons, or optional **tilt steering** (turn the phone like a wheel; calibrates to your hold angle when a race starts, with an *invert* option) |
| Pause / resume | Pause button |
| Fullscreen / audio | Top-bar buttons |

A Bluetooth gamepad also works. Tilt uses the motion sensor, so it needs HTTPS (GitHub Pages is fine) and falls back to the buttons if no sensor is found.

### Windows (PC)

| Action | Control |
| --- | --- |
| Accelerate | W / ↑ |
| Brake | S / ↓ / Space |
| Steer | A D / ← → |
| Pause / resume | P / Esc |
| Fullscreen | F |
| Toggle engine audio | M |
| Gamepad | RT gas · LT brake · left stick / D-pad steer · Start pause |

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

### Milestone 8 — Real-time 3D and mobile rendering
- Replaced the flat road scene with a low-poly WebGL 3D scene: perspective road, elevation, curbs, trees, mountains and 3D cars
- Kept the existing 2D Canvas renderer as an automatic fallback when WebGL is unavailable
- Capped render resolution and device-pixel ratio for mobile GPU and memory budgets
- Added context-loss handling, orientation/resize updates and mobile safe-area spacing
- Preserved the existing HUD, race logic, AI, championship and touch controls


### Race-world motion and circuit atmosphere fix
- Road segments and roadside scenery now scroll continuously relative to player distance, making forward movement visible at speed.
- Added a checkered start/finish stripe at the start line and each lap crossing.
- Added spectator grandstands and coloured crowd rows on both sides of the track.
- Preserved the chase-camera view, existing controls, physics, HUD, AI and mobile layout.

### Milestone 9 — Race feel and immersion
- Added a five-light start sequence followed by a green GO prompt
- Added a smooth, partial chase-camera follow so the car visibly moves across the circuit without losing track context
- Camera height responds subtly to speed and acceleration changes
- Added suspension movement and tyre rubber marks during high lateral-load moments
- Preserved the full-screen Fuji scene, existing touch/keyboard controls, AI and championship

### Milestone 10 — Platform control picker
- First-run chooser for Android (touch + optional tilt) or Windows (keyboard + gamepad), saved per device and switchable at any time
- Touch buttons are shown only in the Android profile; keyboard hints only in the Windows profile
- Analog steering axis in the physics step (used by tilt and gamepad sticks); keyboard/button steering is unchanged
