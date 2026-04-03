import { useState, useEffect, useCallback } from "react";

export const useNativeZoom = () => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Hent det aktuelle zoom-niveau når komponenten mounter
  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.getZoom) {
      chrome.tabs.getZoom((currentZoom) => {
        setZoomLevel(currentZoom);
      });

      // Lyt efter ændringer (f.eks. hvis brugeren bruger Ctrl + Scroll)
      const handleZoomChange = (
        zoomChangeInfo: chrome.tabs.OnZoomChangeInfo,
      ) => {
        setZoomLevel(zoomChangeInfo.newZoomFactor);
      };

      chrome.tabs.onZoomChange.addListener(handleZoomChange);

      return () => {
        chrome.tabs.onZoomChange.removeListener(handleZoomChange);
      };
    }
  }, []);

  // Funktion til at ændre zoom (delta er f.eks. 0.1 for +10% eller -0.1 for -10%)
  const changeZoom = useCallback((delta: number) => {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.setZoom) {
      chrome.tabs.getZoom((currentZoom) => {
        // Begræns zoom mellem 50% og 200% for at undgå ekstreme tilfælde
        const newZoom = Math.min(Math.max(currentZoom + delta, 0.5), 2.0);
        chrome.tabs.setZoom(newZoom);
        setZoomLevel(newZoom);
      });
    } else {
      // Fallback for lokal test udenfor udvidelsen
      setZoomLevel((prev) => Math.min(Math.max(prev + delta, 0.5), 2.0));
    }
  }, []);

  return { zoomLevel, changeZoom };
};
