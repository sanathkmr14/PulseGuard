// In-memory SWR (Stale-While-Revalidate) Cache for instant UI navigation
const store = new Map();

export const swrCache = {
    get: (key) => store.get(key) || null,
    set: (key, data) => store.set(key, data),
    has: (key) => store.has(key),
    delete: (key) => store.delete(key),
    clear: () => store.clear()
};
