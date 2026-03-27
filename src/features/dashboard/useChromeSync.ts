import { useState, useEffect, useCallback } from "react";
import { WinMapping } from "../background/main";
import { DashboardMessage } from "./types";
import { useChromeStorage } from "@/hooks/useChromeStorage";

export const useChromeSync = (user: { uid: string } | null) => {
  const [activeMappings] = useChromeStorage<[number, WinMapping][]>(
    "nexus_active_windows",
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

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [user, refreshChromeWindows]);

  return { activeMappings, currentWindowId, restorationStatus, chromeWindows };
};
