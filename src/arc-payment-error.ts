import {walletRejected} from './collection-checkout';
export function arcPaymentError(error:unknown):string {
 if(walletRejected(error))return 'Transaction cancelled in your wallet.';
 let current=error as {message?:string;cause?:unknown};const seen=new Set<unknown>();let text='';
 for(let i=0;i<8&&current&&!seen.has(current);i++){seen.add(current);text+=' '+String(current.message||'');current=current.cause as typeof current;}
 if(/blocklist|blacklist|account is frozen/i.test(text))return 'Arc reported a USDC address restriction. Do not resend; inspect the wallet transaction and contact the relevant provider.';
 if(/transfer to (?:the )?zero address|invalid receiver/i.test(text))return 'The recipient is invalid for this USDC transfer. Check the recipient and any existing transaction before trying again.';
 if(/max fee per gas less than block base fee|fee cap too low/i.test(text))return 'The network fee quote is too low. Check whether a transaction was submitted before refreshing the quote.';
 return 'Submission outcome could not be verified. Check your wallet and any transaction hash before starting another payment.';
}
