/**
 * Small state gate for the pre-race start sequence.
 * Input is ignored during the countdown and becomes available after GO.
 */
export function createRaceStartGate() {
  let locked = false;
  return {
    begin() { locked = true; },
    release() { locked = false; },
    acceptsInput() { return !locked; },
    reset() { locked = false; }
  };
}
