export const PENDING_REFERRAL_INTENT_KEY = 'refvox.pending-referral-intent';

export interface ReferralIntent {
  projectId: string;
  linkId: string;
}

export function parseReferralIntent(search: string): ReferralIntent | null {
  const params = new URLSearchParams(search);
  const projectId = params.get('projectId');
  const linkId = params.get('linkId');
  if (!projectId || !linkId || projectId.length > 128 || linkId.length > 128) return null;
  return { projectId, linkId };
}

export function referralIntentPath(intent: ReferralIntent): string {
  const params = new URLSearchParams({ projectId: intent.projectId, linkId: intent.linkId });
  return `/projects?${params.toString()}`;
}

export function readPendingReferralIntent(): ReferralIntent | null {
  try {
    const serialized = sessionStorage.getItem(PENDING_REFERRAL_INTENT_KEY);
    if (!serialized) return null;
    const value = JSON.parse(serialized) as Partial<ReferralIntent> & { expiresAt?: number };
    if (typeof value.projectId !== 'string' || typeof value.linkId !== 'string' ||
        value.projectId.length > 128 || value.linkId.length > 128 || !value.projectId || !value.linkId ||
        typeof value.expiresAt !== 'number' || value.expiresAt < Date.now()) return null;
    return { projectId: value.projectId, linkId: value.linkId };
  } catch {
    return null;
  }
}

export function rememberReferralIntent(intent: ReferralIntent | null): void {
  try {
    if (intent) sessionStorage.setItem(PENDING_REFERRAL_INTENT_KEY, JSON.stringify({
      ...intent,
      expiresAt: Date.now() + 30 * 60 * 1000,
    }));
  } catch {
    // The referral still works for signed-in users if browser storage is unavailable.
  }
}

export function clearReferralIntent(): void {
  try { sessionStorage.removeItem(PENDING_REFERRAL_INTENT_KEY); } catch { /* storage may be blocked */ }
}
