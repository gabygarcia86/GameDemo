// localStorage wrapper that never throws (private browsing, blocked storage, quota).

const PREFIX = 'skateboardNinjas.';

export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage unavailable: the game still works, it just won't remember.
    }
  },
};
