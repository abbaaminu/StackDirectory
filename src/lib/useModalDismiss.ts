import { useEffect, useRef } from "react";

/**
 * Open modals, innermost last. Escape is delivered to the top of the stack only,
 * so a dialog opened on top of another (the sign-in prompt over an open listing,
 * the offer form inside the deal room) closes the layer the visitor is actually
 * looking at instead of dismissing every open overlay at once.
 */
const openModals: symbol[] = [];

/**
 * Scroll locks are reference-counted: the page scrolls again only once the last
 * modal has closed. Restoring `overflow` per modal meant closing the inner one
 * unlocked the page behind the modal that was still on screen.
 */
let scrollLocks = 0;
let overflowBeforeFirstLock = "";

/**
 * Shared dismissal behaviour for the overlay modals: locks background scrolling
 * while `isOpen` is true and closes on Escape.
 *
 * `onClose` is read through a ref, so the listeners are registered once per open
 * instead of being torn down and re-added on every parent render - App passes
 * inline arrow functions, so every render would otherwise re-run the effect.
 */
export function useModalDismiss(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    // Identity of this particular open modal inside the shared stack.
    const token = Symbol("modal");
    openModals.push(token);

    if (scrollLocks === 0) {
      overflowBeforeFirstLock = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLocks += 1;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Only the innermost overlay reacts; the others stay open underneath it.
      if (openModals[openModals.length - 1] !== token) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);

      const index = openModals.lastIndexOf(token);
      if (index !== -1) openModals.splice(index, 1);

      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = overflowBeforeFirstLock;
    };
  }, [isOpen]);
}
