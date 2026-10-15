import supabase from "./supabase";

/**
 * Access token of the signed-in Supabase user, or `null` when there is none.
 *
 * The admin queue, the deal room and the audience sync all need to prove *who*
 * is calling before a serverless function will act, and a session can expire
 * between two clicks - so the token is always fetched from the client at call
 * time instead of being cached in component state.
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn("Could not read the Supabase session:", error.message);
    return null;
  }
  return data.session?.access_token ?? null;
};

/** `Authorization` header for the authenticated API calls, or `{}` when signed out. */
export const authorizationHeader = async (): Promise<Record<string, string>> => {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
