/**
 * Compact live timing labels for the race tower.
 * Gaps are shown as simulated distance, not estimated seconds.
 */
export function formatGap({ position, state, distance = 0, aheadDistance = 0, lapDistance = 4563 } = {}) {
  if (state === 'ready') return 'GRID';
  if (Number(position) <= 1) return 'LEAD';

  const gapMeters = Math.max(0, (Number(aheadDistance) || 0) - (Number(distance) || 0));
  const lapLength = Math.max(1, Number(lapDistance) || 4563);
  const lapsBehind = Math.floor(gapMeters / lapLength);

  return lapsBehind > 0 ? `+${lapsBehind}L` : `+${Math.round(gapMeters)}m`;
}
