// Fuji-inspired 4.563 km arcade layout. Curvature and elevation are sampled by lap progress.
export const LAP_DISTANCE = 4563;
export const TOTAL_LAPS = 3;
export const TOTAL_DISTANCE = LAP_DISTANCE * TOTAL_LAPS;

// Positive values bend the road to the right; values are smoothed between corner landmarks.
const SECTIONS = [
  [0.00, 0.02], [0.055, 0.02], [0.085, 0.58], [0.115, 0.72],
  [0.145, -0.42], [0.19, -0.72], [0.225, 0.18], [0.27, 0.12],
  [0.315, -0.66], [0.35, -0.74], [0.385, 0.24], [0.43, 0.08],
  [0.48, 0.78], [0.515, 0.82], [0.55, -0.18], [0.60, -0.08],
  [0.65, 0.62], [0.69, 0.7], [0.73, -0.42], [0.78, -0.55],
  [0.82, 0.18], [0.87, 0.08], [0.91, -0.38], [0.95, -0.2], [1, 0.02]
];
const ELEVATION = [
  [0, 0.08], [0.12, 0.24], [0.24, 0.08], [0.36, -0.18],
  [0.49, -0.28], [0.61, -0.06], [0.74, 0.22], [0.86, 0.1], [1, 0.08]
];
function sample(points, progress) {
  const p = ((progress % 1) + 1) % 1;
  let i = 0;
  while (i < points.length - 2 && p > points[i + 1][0]) i++;
  const [x0, y0] = points[i], [x1, y1] = points[i + 1];
  const t = Math.max(0, Math.min(1, (p - x0) / (x1 - x0)));
  const smooth = t * t * (3 - 2 * t);
  return y0 + (y1 - y0) * smooth;
}
export function curveAt(progress) { return sample(SECTIONS, progress); }
export function elevationAt(progress) { return sample(ELEVATION, progress); }
export function trackInfo(progress) {
  const p = ((progress % 1) + 1) % 1;
  return { curve: curveAt(p), elevation: elevationAt(p), progress: p };
}
