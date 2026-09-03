import { createClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const pendingToolDefaults = {
  status: "pending" as const,
  is_approved: false,
};

if (!isSupabaseConfigured) {
  console.warn(
    "Supabase environment variables missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.",
  );
}

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!)
  : null;

export default supabase;
