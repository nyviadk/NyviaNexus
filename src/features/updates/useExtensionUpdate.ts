import { useChromeStorage } from "@/hooks/useChromeStorage";

export const useExtensionUpdate = () => {
  const [updateAvailable] = useChromeStorage("nexus_update_pending", false);

  const applyUpdate = () => {
    chrome.runtime.sendMessage({ type: "APPLY_EXTENSION_UPDATE" });
  };

  return { updateAvailable: Boolean(updateAvailable), applyUpdate };
};
