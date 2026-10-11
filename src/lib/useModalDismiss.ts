import { useEffect, useRef } from "react";

/**
 * Shared dismissal behaviour for the overlay modals: locks background scrolling
 * while `isOpen` is true and closes on Escape.
 *
 * `onClose` is read through a ref, so the listeners are registered once per open
 * instead of being torn down and re-added on every parent render - App passes
 * inline arrow functions, so every render would otherwise re-run the effect. The
 * previous `overflow` value is restored rather than reset to `"unset"`, so a
 * modal opened on top of another one can never leave the page unscrollable (or
 * scrollable) behind the modal that is still open.
 */
export function useModalDismiss(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);
}
