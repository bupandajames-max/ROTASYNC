// Best-effort invite email notification.
//
// The authoritative access grant is the Firestore invite/membership record
// (written under the manager-only create rule). This notification is purely a
// convenience so the invitee knows to sign in. It is deliberately
// fire-and-forget: any failure (email provider not configured, network error)
// is swallowed so it can never turn a SUCCESSFUL invite into a user-visible
// failure. The server endpoint is likewise credential-gated and returns
// { sent: false } rather than erroring when no provider is configured.

export interface InviteEmailParams {
  email: string;
  roleLabel: string;
  facilityName?: string;
  organizationName?: string;
  invitedBy?: string;
}

export type InviteEmailResult =
  | { sent: true }
  | { sent: false; reason: string };

export async function sendInviteEmailNotification(
  params: InviteEmailParams
): Promise<InviteEmailResult> {
  try {
    const res = await fetch('/api/send-invite-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        appUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.sent) return { sent: true };
    return { sent: false, reason: (data && data.reason) || `status-${res.status}` };
  } catch (err: any) {
    return { sent: false, reason: err?.message || 'network-error' };
  }
}
