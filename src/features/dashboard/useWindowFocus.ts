import { useState, useEffect } from "react";

export function useWindowFocus(): boolean {
  // Tracker om vinduet faktisk har fokus. Når brugeren klikker
  // på et andet vindue, blurrer vinduet og browseren re-evaluerer
  // hover-state. Vi bruger denne state til at undgå hover-flashing.
  const [windowFocused, setWindowFocused] = useState<boolean>(
    typeof document !== "undefined" ? document.hasFocus() : true,
  );

  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return windowFocused;
}
