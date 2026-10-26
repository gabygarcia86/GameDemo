/**
 * localStorage wrapper that never throws. Private browsing, disabled cookies or
 * a full quota simply fall back to in-memory defaults.
 */
const PREFIX = 'galacticSquadron.';

export const storage = {
  get(key, fallback) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
