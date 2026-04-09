import { useChromeStorage } from "@/hooks/useChromeStorage";
import { useCallback } from "react";

export const useFolderStates = () => {
  // Vi bruger nu vores udvidede hook som håndterer både cache, lyttere og local storage
  const [folderStates, setFolderStates] = useChromeStorage<
    Record<string, boolean>
  >("nexus_folder_states", {});

  const handleToggleFolder = useCallback(
    (itemId: string, isOpen: boolean) => {
      // Takket være opdateringen af useChromeStorage kan vi nu bruge functional state updates
      setFolderStates((prev) => ({
        ...prev,
        [itemId]: isOpen,
      }));
    },
    [setFolderStates],
  );

  return { folderStates, handleToggleFolder };
};
