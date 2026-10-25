// IndexedDB persistence for browser-imported songs and recompiled charts.
// Data never leaves the device. Falls back to an in-memory store (session
// only) when IndexedDB is unavailable, e.g. in some private-browsing modes.
//
// Stores
//   songs      { id, title, artist, ... }            imported song metadata
//   audio      { id, blob | buffer, type }            imported audio files
//   charts     { key: "<songId>/<difficulty>", songId, chart }
//   overrides  { id, settings, bpm, confidence, ... } recompile results for built-in songs

const DB_NAME = 'touch-the-beat';
const DB_VERSION = 1;
const STORES = { songs: 'id', audio: 'id', charts: 'key', overrides: 'id' };

const req = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

class IndexedDBStore {
  constructor(db) {
    this.db = db;
    this.persistent = true;
  }

  tx(store, mode = 'readonly') {
    return this.db.transaction(store, mode).objectStore(store);
  }

  get(store, key) {
    return req(this.tx(store).get(key));
  }

  getAll(store) {
    return req(this.tx(store).getAll());
  }

  async put(store, value) {
    const t = this.db.transaction(store, 'readwrite');
    t.objectStore(store).put(value);
    await new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted (storage full?)'));
    });
  }

  async delete(store, key) {
    await req(this.tx(store, 'readwrite').delete(key));
  }

  async deletePrefix(store, prefix) {
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    await req(this.tx(store, 'readwrite').delete(range));
  }

  async clear(store) {
    await req(this.tx(store, 'readwrite').clear());
  }
}

class MemoryStore {
  constructor() {
    this.data = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
    this.persistent = false;
  }
  async get(store, key) {
    return this.data[store].get(key);
  }
  async getAll(store) {
    return [...this.data[store].values()];
  }
  async put(store, value) {
    this.data[store].set(value[STORES[store]], value);
  }
  async delete(store, key) {
    this.data[store].delete(key);
  }
  async deletePrefix(store, prefix) {
    for (const k of [...this.data[store].keys()]) if (String(k).startsWith(prefix)) this.data[store].delete(k);
  }
  async clear(store) {
    this.data[store].clear();
  }
}

export async function openStore() {
  if (typeof indexedDB === 'undefined') return new MemoryStore();
  try {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    const db = await Promise.race([
      req(open),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB open timed out')), 4000)),
    ]);
    // ask the browser not to evict imported songs under storage pressure
    navigator.storage?.persist?.().catch(() => {});
    return new IndexedDBStore(db);
  } catch (err) {
    console.warn('IndexedDB unavailable, imported songs will only last this session:', err);
    return new MemoryStore();
  }
}
