// Builds the visible stretch of road as a real curved 3D path.
//
// The camera sits behind the player looking along +Z. Every road point carries
// its heading (h), unit forward vector (dx,dz) and right-hand normal (nx,nz),
// so scenery, kerbs, cars and grandstands can all be placed relative to the
// bending road instead of a straight corridor. The heading is pinned to 0 at the
// player's position so the camera always looks down the road under the car.
import { curveAt, elevationAt } from './track.js';

export const CORNER_SHARPNESS = 0.0085;   // radians of heading change per metre per unit curvature
export const HILL_HEIGHT = 7;             // metres of vertical range scaled onto the sampled elevation
export const PIVOT_Z = 9;                 // where the player's car sits in world space

export function buildRoadPath({ position = 0, lapDistance = 4563, segments = 118, segmentLength = 4.2, curveFn = curveAt, elevationFn = elevationAt } = {}) {
  const travelled = ((position * lapDistance) % lapDistance + lapDistance) % lapDistance;
  const scroll = travelled % segmentLength;
  const raw = [0];                      // cumulative heading before pinning to the player
  for (let i = 0; i < segments; i++) {
    const s = i * segmentLength - scroll;
    raw.push(raw[i] + curveFn(position + (s + segmentLength / 2) / lapDistance) * CORNER_SHARPNESS * segmentLength);
  }
  const pivotIndex = (PIVOT_Z + scroll) / segmentLength;
  const lo = Math.floor(pivotIndex), frac = pivotIndex - lo;
  const pivotHeading = raw[lo] + (raw[Math.min(segments, lo + 1)] - raw[lo]) * frac;
  const baseElevation = elevationFn(position + PIVOT_Z / lapDistance);

  const points = raw.map((heading, i) => {
    const h = heading - pivotHeading;
    const s = i * segmentLength - scroll;
    return {
      i, s, h, x: 0, z: s,
      y: (elevationFn(position + s / lapDistance) - baseElevation) * HILL_HEIGHT,
      dx: Math.sin(h), dz: Math.cos(h), nx: Math.cos(h), nz: -Math.sin(h)
    };
  });
  // Integrate outward from the player's position (x = 0 at PIVOT_Z).
  const anchor = Math.min(segments, lo + 1);
  const first = points[anchor];
  const back = (PIVOT_Z - first.s);
  first.x = Math.sin((points[lo].h + first.h) / 2) * back;
  first.z = PIVOT_Z + Math.cos((points[lo].h + first.h) / 2) * back;
  for (let i = anchor + 1; i <= segments; i++) {
    const mean = (points[i - 1].h + points[i].h) / 2;
    points[i].x = points[i - 1].x + Math.sin(mean) * segmentLength;
    points[i].z = points[i - 1].z + Math.cos(mean) * segmentLength;
  }
  for (let i = anchor - 1; i >= 0; i--) {
    const mean = (points[i + 1].h + points[i].h) / 2;
    points[i].x = points[i + 1].x - Math.sin(mean) * segmentLength;
    points[i].z = points[i + 1].z - Math.cos(mean) * segmentLength;
  }
  return { points, scroll, travelled, segmentLength, pivotHeading };
}

// Linear interpolation along the path by distance s (metres from the camera origin).
export function pointAt(path, s) {
  const { points, segmentLength, scroll } = path;
  const f = Math.max(0, Math.min(points.length - 1.0001, (s + scroll) / segmentLength));
  const i = Math.floor(f), t = f - i, a = points[i], b = points[i + 1];
  const h = a.h + (b.h - a.h) * t;
  return { s, h, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
    dx: Math.sin(h), dz: Math.cos(h), nx: Math.cos(h), nz: -Math.sin(h) };
}

// A world position `offset` metres to the right of the road centre line.
export const lateral = (p, offset) => [p.x + p.nx * offset, p.z + p.nz * offset];
