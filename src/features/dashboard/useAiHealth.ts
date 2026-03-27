import { useChromeStorage } from "@/hooks/useChromeStorage";
import { AiHealthStatus } from "../ai/aiService";

export const useAiHealth = () => {
  const [aiHealth] = useChromeStorage<AiHealthStatus>("nexus_ai_health", "up");
  return aiHealth;
};
