import { createClient } from '@supabase/supabase-js';
import supabaseConfig from '../supabase-client-config.json';

// Phase 0 spike client — proves auth + RLS work together against the
// schema in supabase/migrations/0001_core_schema.sql. Not wired into the
// app's data flows yet; see the platform decision memo for the full
// migration plan. anonKey is safe to ship to the browser (same trust model
// as firebase-applet-config.json) — it has no privileges beyond what RLS
// grants; the service_role key (server/ETL-only, never here) is what
// actually bypasses RLS.
export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

export async function signInWithGoogleSupabase() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // window.location.origin alone drops the current path/query — for
      // this spike that meant losing ?supabaseTest=1 on the way back,
      // landing on the real app (with its own separate Firebase session)
      // instead of the test harness. href preserves it.
      redirectTo: window.location.href,
    },
  });
  if (error) {
    console.error('Supabase Google sign-in failed:', error);
    throw error;
  }
  return data;
}

export async function signOutSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Supabase sign-out failed:', error);
  }
}

export async function getSupabaseUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
