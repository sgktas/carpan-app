// No authoritative third-party project verification adapter is implemented yet.
// Keep this allowlist empty until an official API or authenticated webhook is
// implemented and verified for a project.
export const TRUSTED_PROJECT_PROOF_METHODS: ReadonlySet<string> = new Set();

export function hasTrustedProjectProof(validationMethod: string): boolean {
  return TRUSTED_PROJECT_PROOF_METHODS.has(validationMethod);
}

export function paidReferralFlowEnabled(isDemoMode: boolean, validationMethod: string): boolean {
  return isDemoMode || hasTrustedProjectProof(validationMethod);
}
