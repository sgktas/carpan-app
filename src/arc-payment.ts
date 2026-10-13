/* carpan-localized */
import { t } from './i18n/index';
import { getAddress, isAddress } from 'viem';
import { parseUsdc } from './onchain-money';

export function paymentDetails(recipient: string, amount: string, sender?: string) {
  if (!isAddress(recipient, { strict: false })) throw new Error(t("Geçerli bir EVM cüzdan adresi girin."));
  const to = getAddress(recipient);
  if (sender && to.toLowerCase() === sender.toLowerCase()) {
    throw new Error(t("Kendi cüzdanınıza gönderim yapılamaz."));
  }
  let rawAmount: bigint;
  try { rawAmount = parseUsdc(amount); }
  catch { throw new Error(t("Miktarı en fazla 6 ondalık basamakla girin.")); }
  if (rawAmount <= 0n) throw new Error(t("Miktar sıfırdan büyük olmalı."));
  return { to, rawAmount, amount: amount.trim() };
}

export function paymentRequestUrl(origin: string, recipient: string, amount: string) {
  const details = paymentDetails(recipient, amount);
  const url = new URL('/arc', origin);
  url.searchParams.set('to', details.to);
  url.searchParams.set('amount', details.amount);
  return url.toString();
}

export function paymentRequestFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const to = params.get('to');
  const amount = params.get('amount');
  if (!to || !amount) return null;
  return paymentDetails(to, amount);
}
