// Arc's native fee quantities have 18 decimals; this floor is in wei per gas.
// Source: https://docs.arc.io/arc/references/gas-and-fees
export const ARC_MIN_MAX_FEE_PER_GAS = 20_000_000_000n;
export function arcFeeQuote(fees:{maxFeePerGas:bigint;maxPriorityFeePerGas:bigint}) {
 if(fees.maxFeePerGas<0n||fees.maxPriorityFeePerGas<0n)throw Error('Invalid Arc fee estimate.');
 const maxFeePerGas=[fees.maxFeePerGas,fees.maxPriorityFeePerGas,ARC_MIN_MAX_FEE_PER_GAS].reduce((a,b)=>a>b?a:b);
 return {...fees,maxFeePerGas};
}
