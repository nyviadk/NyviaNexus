import { useCallback, useEffect, useState } from "react";

export const useFolderStates = () => {
  const [folderStates, setFolderStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    chrome.storage.local.get("nexus_folder_states").then((result) => {
      if (result.nexus_folder_states) {
        setFolderStates(result.nexus_folder_states as Record<string, boolean>);
      }
    });
  }, []);

  const handleToggleFolder = useCallback((itemId: string, isOpen: boolean) => {
    setFolderStates((prev) => {
      const newState = { ...prev, [itemId]: isOpen };
      chrome.storage.local.set({ nexus_folder_states: newState });
      return newState;
    });
  }, []);

  return { folderStates, handleToggleFolder };
};
