import { useCallback } from "react";

/**
 * Callback ref der åbner en <dialog> som modal ved mount.
 * Erstatter useEffect + useRef + dialogRef.showModal() mønsteret.
 *
 * Brug: <dialog ref={dialogRef} ...>
 */
export const useDialogOpen = () => {
  return useCallback((node: HTMLDialogElement | null) => {
    if (node && !node.open) {
      node.showModal();
    }
  }, []);
};
