import { useCallback, useSyncExternalStore } from "react";

/**
 * Opretter en ekstern store for en enkelt chrome.storage.local nøgle.
 * Bruger in-memory cache til synkron getSnapshot (krav fra useSyncExternalStore).
 * Hydrerer asynkront ved første subscribe og lytter på chrome.storage.onChanged.
 */
const createChromeStorageStore = <T>(key: string, defaultValue: T) => {
  let cached: T = defaultValue;
  let hydrated = false;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((l) => l());

  // Hydrér fra chrome.storage (kun én gang)
  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;
    chrome.storage.local.get(key).then((result) => {
      if (result[key] !== undefined) {
        cached = result[key] as T;
        notify();
      }
    });
  };

  // Chrome storage change listener
  const storageHandler = (
    changes: { [k: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area === "local" && changes[key]) {
      cached = changes[key].newValue as T;
      notify();
    }
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        hydrate();
        chrome.storage.onChanged.addListener(storageHandler);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          chrome.storage.onChanged.removeListener(storageHandler);
        }
      };
    },
    getSnapshot() {
      return cached;
    },
    /** Opdaterer værdien i chrome.storage og in-memory cache */
    set(value: T) {
      cached = value;
      chrome.storage.local.set({ [key]: value });
      notify();
    },
  };
};

// Cache af stores så vi ikke opretter nye ved hvert kald
const storeCache = new Map<string, ReturnType<typeof createChromeStorageStore>>();

const getOrCreateStore = <T>(key: string, defaultValue: T) => {
  if (!storeCache.has(key)) {
    storeCache.set(key, createChromeStorageStore(key, defaultValue));
  }
  return storeCache.get(key)! as ReturnType<typeof createChromeStorageStore<T>>;
};

/**
 * Hook der læser en chrome.storage.local nøgle via useSyncExternalStore.
 * Returnerer [value, setValue] ligesom useState.
 */
export const useChromeStorage = <T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] => {
  const store = getOrCreateStore(key, defaultValue);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const setValue = useCallback((v: T) => store.set(v), [store]);
  return [value as T, setValue];
};
