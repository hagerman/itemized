import "@testing-library/jest-dom/vitest";

// Node 25+ exposes an experimental global localStorage without --localstorage-file,
// which can leave jsdom's window.localStorage undefined or without Storage methods.
if (typeof window !== "undefined" && typeof window.localStorage?.getItem !== "function") {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
}
