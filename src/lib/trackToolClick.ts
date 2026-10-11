import type { Tool } from "../types/directory";
import supabase from "./supabase";

/**
 * Fire-and-forget referral click tracking. Navigation is handled by the anchor
 * itself, so this never blocks or cancels the click.
 */
export const handleVisitWebsite = (tool: Tool): void => {
  if (!supabase) return;

  void Promise.resolve(supabase.rpc("increment_tool_clicks", { tool_id: tool.id } as never))
    .then(({ error }) => {
      if (error) console.error("Failed to track tool click:", error.message);
    })
    .catch((error: unknown) => {
      console.error("Failed to track tool click:", error);
    });
};
