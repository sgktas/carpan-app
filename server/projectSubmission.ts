import { getAddress, isAddress } from 'viem';

export type ProjectSubmission = {
  name: string; description: string; officialDomain: string; arcContractAddress: string | null;
  referralLinkPattern: string; referralMode: 'url' | 'code';
  validParticipationCondition: string; participantBenefit: string; allowsFreeParticipation: boolean;
};

/** Catalogue-only projects reuse the existing participation flag; old clients keep their referral flow. */
export function parseProjectSubmission(value: unknown): ProjectSubmission {
  const d = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (typeof d.name !== 'string' || !d.name.trim() || typeof d.officialDomain !== 'string' || !d.officialDomain.trim()) {
    throw new Error('Proje adı ve resmî alan adı gerekli');
  }
  if (d.description !== undefined && typeof d.description !== 'string') throw new Error('Proje açıklaması geçersiz');
  if (d.allowsFreeParticipation !== undefined && typeof d.allowsFreeParticipation !== 'boolean') {
    throw new Error('Referans programı seçimi geçersiz');
  }
  // Missing flag means the former API shape, which always registered a referral programme.
  const allowsFreeParticipation = d.allowsFreeParticipation ?? true;
  const name = d.name.trim(), description = (d.description as string | undefined)?.trim() || '';
  const officialDomain = d.officialDomain.trim().toLowerCase();
  if (name.length > 120 || description.length > 2000) throw new Error('Proje alanlarından biri çok uzun');
  if (!/^(?=.{1,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(officialDomain)) throw new Error('Resmî alan adı geçersiz');
  if (d.arcContractAddress !== undefined && d.arcContractAddress !== null && typeof d.arcContractAddress !== 'string') {
    throw new Error('Arc kontrat adresi geçersiz');
  }
  const rawAddress = typeof d.arcContractAddress === 'string' ? d.arcContractAddress.trim() : '';
  if (rawAddress && !isAddress(rawAddress)) throw new Error('Arc kontrat adresi geçersiz');
  const arcContractAddress = rawAddress ? getAddress(rawAddress).toLowerCase() : null;
  let referralMode: 'url' | 'code' = 'url', referralLinkPattern = `https://${officialDomain}`;
  let validParticipationCondition = '', participantBenefit = '';
  if (allowsFreeParticipation) {
    if (d.referralMode !== undefined && d.referralMode !== 'url' && d.referralMode !== 'code') throw new Error('Katılım yöntemi geçersiz');
    referralMode = d.referralMode === 'code' ? 'code' : 'url';
    if (typeof d.referralLinkPattern !== 'string' || !d.referralLinkPattern.trim() ||
      typeof d.validParticipationCondition !== 'string' || !d.validParticipationCondition.trim() ||
      typeof d.participantBenefit !== 'string' || !d.participantBenefit.trim()) {
      throw new Error('Referans programı için yönlendirme adresi, katılım koşulu ve katılımcı faydası gerekli');
    }
    referralLinkPattern = d.referralLinkPattern.trim();
    validParticipationCondition = d.validParticipationCondition.trim(); participantBenefit = d.participantBenefit.trim();
    if (referralLinkPattern.length > 2048 || validParticipationCondition.length > 500 || participantBenefit.length > 500) {
      throw new Error('Proje alanlarından biri çok uzun');
    }
    if (referralMode === 'url' && !referralLinkPattern.includes('{code}')) throw new Error("referralLinkPattern '{code}' içermelidir");
    if (referralMode === 'code' && referralLinkPattern.includes('{code}')) throw new Error('Kodla katılımda yönlendirme adresi sabit olmalı; davet kodu kartta gösterilir');
    try {
      const url = new URL(referralLinkPattern.replaceAll('{code}', 'carpan-check'));
      if (url.protocol !== 'https:' || url.username || url.password ||
        (url.hostname !== officialDomain && !url.hostname.endsWith(`.${officialDomain}`))) {
        throw new Error('Link deseni resmî HTTPS alan adıyla eşleşmiyor');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Link deseni resmî HTTPS alan adıyla eşleşmiyor') throw error;
      throw new Error('Link deseni geçersiz');
    }
  }
  return { name, description, officialDomain, arcContractAddress, referralLinkPattern, referralMode,
    validParticipationCondition, participantBenefit, allowsFreeParticipation };
}
