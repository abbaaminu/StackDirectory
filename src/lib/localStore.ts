/**
 * localStorage helpers shared by the directory surfaces.
 *
 * Every read is defensive (private mode, quota exceeded, hand-edited JSON), so
 * a broken entry degrades to an empty default instead of breaking a render.
 * The key names live here because they are a cross-component contract: the
 * acquisition offer written by `AcquisitionModal` is the same record the deal
 * room reads back in offline/demo mode.
 */
export const STORAGE_KEYS = {
  /** Locally queued submissions when Supabase is not configured. */
  tools: "stackdirectory_tools",
  /** Upvoted listing ids for the current device. */
  votedTools: "voted_tools",
  /** Bookmarked listing ids for the current device. */
  savedTools: "stackdirectory_saved_tools",
  /** Acquisition offers (AcquisitionModal ↔ DealRoomModal). */
  acquisitionOffers: "stackdirectory_acquisition_offers",
  dealConversations: "stackdirectory_deal_conversations",
  dealMessages: "stackdirectory_deal_messages",
} as const;

/** Reads a JSON array; returns `[]` for missing, malformed or non-array data. */
export function readJsonArray<T>(key: string): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Writes a JSON array; returns `false` when persistence is unavailable. */
export function writeJsonArray<T>(key: string, value: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Reads a JSON array, keeping only string entries (used for id lists). */
export const readStringArray = (key: string): string[] =>
  readJsonArray<unknown>(key).filter((value): value is string => typeof value === "string");

/** Persists a list of ids; returns `false` when persistence is unavailable. */
export const writeStringArray = (key: string, ids: string[]): boolean =>
  writeJsonArray(key, ids);
