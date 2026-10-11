/**
 * Paddle checkout event helpers.
 *
 * Paddle Billing's JS SDK (the one `SubmitModal.tsx` loads from
 * `window.Paddle`) reports the event name on `event.name` — `checkout.completed`,
 * `checkout.closed`, `checkout.error`. Classic Paddle payloads used
 * `event.event_type`, and the earlier code only ever looked at `event_type`, so
 * a real Billing `checkout.completed` never matched anything.
 *
 * Keeping the normalisation here (instead of inline in the component) makes the
 * "did the customer actually pay?" question unit-testable.
 */

/** Event name Paddle emits once the buyer's transaction has been paid. */
export const PADDLE_CHECKOUT_COMPLETED = "checkout.completed";
/** Event name Paddle emits when the buyer dismisses the overlay. */
export const PADDLE_CHECKOUT_CLOSED = "checkout.closed";
/** Event name Paddle emits when the overlay could not be shown/paid. */
export const PADDLE_CHECKOUT_ERROR = "checkout.error";

/** Minimal shape of the object Paddle hands to `eventCallback`. */
export type PaddleCheckoutEvent = {
  /** Paddle Billing (v2) field. */
  name?: string;
  /** Classic Paddle field, still accepted as a fallback. */
  event_type?: string;
};

/** Reads the event name from either SDK generation; `""` when absent. */
export const readPaddleEventName = (
  event?: PaddleCheckoutEvent | null,
): string => (event?.name ?? event?.event_type ?? "").trim();

/**
 * True only for a completed checkout — the single signal that may create the
 * paid Featured listing. `checkout.completed` fires after Paddle has taken
 * payment, so no database write may happen before this returns true.
 */
export const isPaddleCheckoutCompleted = (
  event?: PaddleCheckoutEvent | null,
): boolean => readPaddleEventName(event) === PADDLE_CHECKOUT_COMPLETED;

/**
 * True when the buyer abandoned the overlay (closed it or it errored). Any
 * listing held for that checkout must be discarded: nothing was paid for.
 */
export const isPaddleCheckoutAbandoned = (
  event?: PaddleCheckoutEvent | null,
): boolean => {
  const name = readPaddleEventName(event);
  return name === PADDLE_CHECKOUT_CLOSED || name === PADDLE_CHECKOUT_ERROR;
};
