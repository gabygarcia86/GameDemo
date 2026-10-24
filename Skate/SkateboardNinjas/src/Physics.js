// Small arcade-physics helpers. The skater only needs ballistic arcs, so these
// closed-form functions double as the level generator's "can this jump be made?"
// checks.

export const Physics = {
  // Height of an arc launched from y0 with upward speed vy after t seconds.
  heightAt(y0, vy, t, g) {
    return y0 + vy * t - 0.5 * g * t * t;
  },

  // Time at which the arc passes downward through height h (null if it never reaches h).
  descendTime(y0, vy, h, g) {
    const d = vy * vy - 2 * g * (h - y0);
    if (d < 0) return null;
    return (vy + Math.sqrt(d)) / g;
  },

  // Time at which the arc passes upward through height h (0 if it starts above h).
  ascendTime(y0, vy, h, g) {
    if (y0 >= h) return 0;
    const d = vy * vy - 2 * g * (h - y0);
    if (d < 0) return null;
    return (vy - Math.sqrt(d)) / g;
  },

  // Horizontal distance during which an arc stays above height h.
  spanAbove(y0, vy, h, g, speed) {
    const up = Physics.ascendTime(y0, vy, h, g);
    const down = Physics.descendTime(y0, vy, h, g);
    if (up === null || down === null) return 0;
    return Math.max(0, down - up) * speed;
  },

  approach(value, target, maxDelta) {
    if (value < target) return Math.min(target, value + maxDelta);
    return Math.max(target, value - maxDelta);
  },
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
