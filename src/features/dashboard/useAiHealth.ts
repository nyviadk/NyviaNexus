import { useEffect, useState } from "react";
import { AiHealthStatus } from "../ai/aiService";

export const useAiHealth = () => {
  const [aiHealth, setAiHealth] = useState<AiHealthStatus>("up");

  useEffect(() => {
    chrome.storage.local.get("nexus_ai_health").then((res) => {
      if (res.nexus_ai_health)
        setAiHealth(res.nexus_ai_health as AiHealthStatus);
    });

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local" && changes.nexus_ai_health) {
        setAiHealth(changes.nexus_ai_health.newValue as AiHealthStatus);
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  return aiHealth;
};
