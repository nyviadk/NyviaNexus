import { useState, useEffect, useCallback, useRef } from "react";

interface SidebarConfig {
  width: number;
  locked: boolean;
}

const DEFAULT_WIDTH = 384; // w-96
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;

export const useSidebarResize = () => {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isLocked, setIsLocked] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Hent gemte indstillinger med det samme
  useEffect(() => {
    chrome.storage.local.get("nexus_sidebar_config").then((result) => {
      const config = result.nexus_sidebar_config as SidebarConfig | undefined;
      if (config) {
        if (config.width) setWidth(config.width);
        if (config.locked !== undefined) setIsLocked(config.locked);
      }
      setIsHydrated(true);
    });
  }, []);

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      if (isLocked) return;
      e.preventDefault();
      setIsResizing(true);
    },
    [isLocked],
  );

  const stopResizing = useCallback(() => {
    if (!isResizing) return;
    setIsResizing(false);
    chrome.storage.local.set({
      nexus_sidebar_config: { width, locked: isLocked },
    });
  }, [width, isLocked, isResizing]);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        // Vi bruger clientX direkte da sidebaren er left-aligned
        const newWidth = Math.min(Math.max(e.clientX, MIN_WIDTH), MAX_WIDTH);
        setWidth(newWidth);
      }
    },
    [isResizing],
  );

  const resetWidth = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
    chrome.storage.local.set({
      nexus_sidebar_config: { width: DEFAULT_WIDTH, locked: isLocked },
    });
  }, [isLocked]);

  const toggleLock = useCallback(() => {
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    chrome.storage.local.set({
      nexus_sidebar_config: { width, locked: nextLocked },
    });
  }, [width, isLocked]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
    } else {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return {
    width,
    isLocked,
    isResizing,
    isHydrated,
    sidebarRef,
    startResizing,
    toggleLock,
    resetWidth,
  };
};
