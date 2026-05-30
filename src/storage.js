// The EMBODIED component expects a platform-provided `window.storage` API for
// persisting submissions in the gallery. On a normal web deployment (e.g.
// Vercel) that API does not exist, so we provide a localStorage-backed shim
// that matches the shape the component relies on:
//   storage.set(key, value)        -> Promise<void>
//   storage.get(key)               -> Promise<{ value: string | null }>
//   storage.list(prefix)           -> Promise<{ keys: string[] }>
// The trailing boolean argument in the original calls is ignored here.

const PREFIX = "embodied:";

function installStorageShim() {
  if (typeof window === "undefined" || window.storage) return;

  const safeLocal = () => {
    try {
      const probe = "__embodied_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return null;
    }
  };

  const ls = safeLocal();
  const memory = new Map();

  const read = (key) => (ls ? ls.getItem(PREFIX + key) : memory.get(key) ?? null);
  const write = (key, value) => (ls ? ls.setItem(PREFIX + key, value) : memory.set(key, value));
  const keysOf = () => {
    if (ls) {
      const out = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
      }
      return out;
    }
    return [...memory.keys()];
  };

  window.storage = {
    async set(key, value) {
      write(key, value);
    },
    async get(key) {
      return { value: read(key) };
    },
    async list(prefix = "") {
      return { keys: keysOf().filter((k) => k.startsWith(prefix)) };
    },
  };
}

installStorageShim();
