// A looping sequence of gentle bends, represented as a continuous road curve.
export function curveAt(position) {
  const p = position % 1;
  return Math.sin(p * Math.PI * 2) * 0.62 + Math.sin(p * Math.PI * 6 + 0.7) * 0.18;
}
export function sceneryAt(position) {
  return Math.sin(position * Math.PI * 2);
}
