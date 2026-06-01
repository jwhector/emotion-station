import { supabase, configured } from "./supabaseClient.js";

// Shared gallery persistence backed by a Supabase `submissions` table.
// The in-app submission shape is { id, emotion, presetId, lockedCols, path, ts };
// the table uses snake_case columns, so we map on the way in and out.

export async function saveSubmission(sub) {
  if (!configured) return; // no backend configured -> piece simply isn't shared
  const { error } = await supabase.from("submissions").insert({
    id: sub.id,
    emotion: sub.emotion,
    preset_id: sub.presetId,
    locked_cols: sub.lockedCols,
    path: sub.path,
    ts: sub.ts,
  });
  if (error) throw error;
}

export async function fetchRecentSubmissions(limit = 16) {
  if (!configured) return []; // -> caller falls back to MOCKS
  const { data, error } = await supabase
    .from("submissions")
    .select("id,emotion,preset_id,locked_cols,path,ts")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    emotion: r.emotion,
    presetId: r.preset_id,
    lockedCols: r.locked_cols,
    path: r.path,
    ts: r.ts,
  }));
}
