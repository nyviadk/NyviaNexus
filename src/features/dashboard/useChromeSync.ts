import { useState, useEffect, useCallback } from "react";
import { WinMapping } from "../background/main";
import { DashboardMessage } from "./types";

export const useChromeSync = (user: { uid: string } | null) => {
  const [activeMappings, setActiveMappings] = useState<[number, WinMapping][]>(
    [],
  );
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [restorationStatus, setRestorationStatus] = useState<string | null>(
    null,
  );
  const [chromeWindows, setChromeWindows] = useState<chrome.windows.Window[]>(
    [],
  );

  const refreshChromeWindows = useCallback(() => {
    chrome.windows.getAll({ populate: false }, (wins) =>
      setChromeWindows(wins),
    );
  }, []);

  useEffect(() => {
    if (user) {
      chrome.windows.getCurrent((win) => win.id && setCurrentWindowId(win.id));

      chrome.storage.local.get(["nexus_active_windows"], (data) => {
        if (data?.nexus_active_windows) {
          setActiveMappings(
            data.nexus_active_windows as [number, WinMapping][],
          );
        }
      });

      chrome.runtime.sendMessage({ type: "GET_RESTORING_STATUS" }, (res) =>
        setRestorationStatus(res || null),
      );
      refreshChromeWindows();
    }

    const messageListener = (msg: DashboardMessage) => {
      if (msg.type === "RESTORATION_STATUS_CHANGE")
        setRestorationStatus(
          typeof msg.payload === "string" ? msg.payload : null,
        );
      if (msg.type === "PHYSICAL_WINDOWS_CHANGED") refreshChromeWindows();
    };

    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local") {
        if (changes.nexus_active_windows) {
          const newMappings = (changes.nexus_active_windows.newValue || []) as [
            number,
            WinMapping,
          ][];
          setActiveMappings(newMappings);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [user, refreshChromeWindows]);

  return { activeMappings, currentWindowId, restorationStatus, chromeWindows };
};
