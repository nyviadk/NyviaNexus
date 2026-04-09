import { useCallback, useSyncExternalStore } from "react";

// --- TYPES ---

export type SetValueAction<T> = T | ((prev: T) => T);

interface ChromeStorageStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  set: (action: SetValueAction<T>) => void;
}

/**
 * Type-safe tjek for at se om en action er en funktion (callback) eller en direkte værdi.
 */
const isFunction = <T>(action: SetValueAction<T>): action is (prev: T) => T => {
  return typeof action === "function";
};

/**
 * Opretter en ekstern store for en enkelt chrome.storage.local nøgle.
 * Bruger in-memory cache til synkron getSnapshot (krav fra useSyncExternalStore).
 * Hydrerer asynkront ved første subscribe og lytter på chrome.storage.onChanged.
 */
const createChromeStorageStore = <T>(
  key: string,
  defaultValue: T,
): ChromeStorageStore<T> => {
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
    /** Opdaterer værdien i chrome.storage og in-memory cache (understøtter nu callback ligesom useState) */
    set(action: SetValueAction<T>) {
      // Vi bruger vores type-guard for typesikkert at kalde funktionen med den nuværende state
      const newValue = isFunction(action) ? action(cached) : action;

      // Optimistic UI: Opdater cachen og tving et re-render i det aktuelle vindue med det samme
      cached = newValue;
      notify();

      // Send asynkront til storage (hvilket vil trigge 'onChanged' i andre vinduer)
      chrome.storage.local.set({ [key]: newValue });
    },
  };
};

// Cache af stores så vi ikke opretter nye ved hvert kald.
// Vi bruger unknown i cachen for at undgå 'any' og bevare type-sikkerhed via type casting i getOrCreateStore.
const storeCache = new Map<string, ChromeStorageStore<unknown>>();

const getOrCreateStore = <T>(
  key: string,
  defaultValue: T,
): ChromeStorageStore<T> => {
  if (!storeCache.has(key)) {
    storeCache.set(
      key,
      createChromeStorageStore<T>(
        key,
        defaultValue,
      ) as ChromeStorageStore<unknown>,
    );
  }
  return storeCache.get(key)! as ChromeStorageStore<T>;
};

/**
 * Hook der læser en chrome.storage.local nøgle via useSyncExternalStore.
 * Returnerer [value, setValue] ligesom useState, inklusiv understøttelse for 'functional state updates'.
 */
export const useChromeStorage = <T>(
  key: string,
  defaultValue: T,
): [T, (action: SetValueAction<T>) => void] => {
  const store = getOrCreateStore<T>(key, defaultValue);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const setValue = useCallback(
    (action: SetValueAction<T>) => store.set(action),
    [store],
  );
  return [value, setValue];
};
