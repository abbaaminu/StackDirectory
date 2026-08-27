import { createClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase environment variables missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.",
  );
}

export const supabase = createClient<Database>(
  supabaseUrl ?? "",
  supabaseAnonKey ?? "",
);

export default supabase;
