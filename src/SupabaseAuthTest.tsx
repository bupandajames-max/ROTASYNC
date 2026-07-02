import React, { useEffect, useState } from 'react';
import { supabase, signInWithGoogleSupabase, signOutSupabase } from './supabaseClient';

// Temporary Phase 0 spike harness — NOT part of the app, only reachable via
// ?supabaseTest=1 (see main.tsx). Exists solely to click-test Google OAuth
// through Supabase Auth and confirm a resulting session can read/write
// against the RLS policies in supabase/migrations/0001_core_schema.sql.
// Delete once Phase 0 is validated and Phase 1+ wiring begins for real.
export default function SupabaseAuthTest() {
  const [session, setSession] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[] | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [insertResult, setInsertResult] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  const testReadOrgs = async () => {
    setOrgError(null);
    const { data, error } = await supabase.from('organizations').select('*');
    if (error) setOrgError(error.message);
    setOrgs(data);
  };

  const testCreateOrg = async () => {
    if (!session?.user) return;
    setInsertResult(null);
    const orgId = `test-org-${Date.now()}`;
    const { error } = await supabase.from('organizations').insert({
      id: orgId,
      name: 'Supabase Auth Test Org',
      owner_uid: session.user.id,
    });
    setInsertResult(error ? `FAILED: ${error.message}` : `SUCCESS: created ${orgId}`);
  };

  // Tailwind's base reset strips default browser button chrome (border,
  // background, cursor) unless a component explicitly restyles it — this
  // file never did, so the buttons rendered as inert-looking plain text
  // even though they were always real, functioning <button> elements.
  const btnStyle: React.CSSProperties = {
    padding: '8px 14px',
    border: '1px solid #333',
    borderRadius: 4,
    background: '#f0f0f0',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 13,
  };

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }}>
      <h2>Supabase Auth Test (Phase 0 spike)</h2>

      {!session ? (
        <button style={btnStyle} onClick={() => signInWithGoogleSupabase()}>Sign in with Google (Supabase)</button>
      ) : (
        <div>
          <p>Signed in as: <strong>{session.user.email}</strong></p>
          <p>auth.uid(): <code>{session.user.id}</code></p>
          <button style={btnStyle} onClick={() => signOutSupabase()}>Sign out</button>
        </div>
      )}

      <hr style={{ margin: '20px 0' }} />

      <button style={btnStyle} onClick={testReadOrgs}>Test: read organizations</button>
      <div>
        {orgError && <p style={{ color: 'red' }}>Read error: {orgError}</p>}
        {orgs && <pre>{JSON.stringify(orgs, null, 2)}</pre>}
      </div>

      <hr style={{ margin: '20px 0' }} />

      <button style={{ ...btnStyle, opacity: session ? 1 : 0.4, cursor: session ? 'pointer' : 'not-allowed' }} onClick={testCreateOrg} disabled={!session}>
        Test: create an organization I own (should succeed once signed in)
      </button>
      {insertResult && <p>{insertResult}</p>}
    </div>
  );
}
