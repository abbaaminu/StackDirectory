/**
 * Local (offline/demo) acquisition offer record.
 *
 * Lives here rather than inline in `AcquisitionModal` because it is a contract
 * between two components and a bug in it is invisible on screen:
 * `DealRoomModal` lists a device's offers with `item.buyer_id === userId`, so an
 * offer written without `buyer_id` was saved "successfully" and then never
 * appeared in the deal room it was supposed to open.
 */
export type LocalAcquisitionOffer = {
  id: string;
  tool_id: string;
  buyer_id: string;
  buyer_name: string;
  buyer_email: string;
  offer_amount: number;
  message: string | null;
  status: "pending";
  created_at: string;
};

/** Builds the record stored in `STORAGE_KEYS.acquisitionOffers`. */
export const buildLocalAcquisitionOffer = (input: {
  toolId: string;
  userId: string;
  buyerName: string;
  buyerEmail: string;
  offerAmount: number;
  message?: string;
  /** Injectable clock so the generated id/timestamp stay deterministic in tests. */
  now?: Date;
}): LocalAcquisitionOffer => {
  const now = input.now ?? new Date();
  const timestamp = now.getTime();
  return {
    id: `offer_${input.toolId}_${timestamp}`,
    tool_id: input.toolId,
    buyer_id: input.userId,
    buyer_name: input.buyerName.trim(),
    buyer_email: input.buyerEmail.trim(),
    offer_amount: input.offerAmount,
    message: input.message?.trim() ? input.message.trim() : null,
    status: "pending",
    created_at: now.toISOString(),
  };
};
