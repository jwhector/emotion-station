import { createClient } from "@supabase/supabase-js";

// Vite inlines VITE_-prefixed vars at build time. The anon key is public by design;
// security rests on the row-level-security policies on the `submissions` table.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// `configured` lets the data layer fall back to mock pieces gracefully when the
// env vars are missing (e.g. a local checkout without a .env.local).
export const configured = Boolean(url && anonKey);

export const supabase = configured ? createClient(url, anonKey) : null;
