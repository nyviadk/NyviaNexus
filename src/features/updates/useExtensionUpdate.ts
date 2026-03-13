import { useState, useEffect } from "react";

export const useExtensionUpdate = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // 1. Tjek om flaget allerede er sat ved opstart
    chrome.storage.local.get("nexus_update_pending", (data) => {
      if (data?.nexus_update_pending) {
        setUpdateAvailable(true);
      }
    });

    // 2. Lyt efter ændringer i realtid
    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && changes.nexus_update_pending) {
        // Sikrer typesikkerhed (kaster 'unknown' til en ægte boolean)
        setUpdateAvailable(Boolean(changes.nexus_update_pending.newValue));
      }
    };

    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  const applyUpdate = () => {
    // Bed background-scriptet om at gemme tilstand og genstarte
    chrome.runtime.sendMessage({ type: "APPLY_EXTENSION_UPDATE" });
  };

  return { updateAvailable, applyUpdate };
};
