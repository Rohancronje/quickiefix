/** In-memory AsyncStorage shim for tests (mirrors the async API surface used). */
const store = new Map<string, string>();

export default {
  getItem: async (key: string): Promise<string | null> =>
    store.has(key) ? (store.get(key) as string) : null,
  setItem: async (key: string, value: string): Promise<void> => {
    store.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    store.delete(key);
  },
  clear: async (): Promise<void> => {
    store.clear();
  },
  getAllKeys: async (): Promise<string[]> => [...store.keys()],
};
