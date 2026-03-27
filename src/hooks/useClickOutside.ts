import { useEffect, RefObject } from "react";

export const useClickOutside = (
  ref: RefObject<HTMLElement | null>,
  onClickOutside: () => void,
) => {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClickOutside]);
};
