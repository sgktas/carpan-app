import {test,expect} from 'bun:test';
import {arcFeeQuote,ARC_MIN_MAX_FEE_PER_GAS} from '../src/arc-fees';
import {checkoutBudget} from '../src/collection-checkout';
test('Arc floor raises an underpriced quote and the same cap funds the payment reserve',()=>{
 const fees=arcFeeQuote({maxFeePerGas:1n,maxPriorityFeePerGas:0n});
 expect(fees.maxFeePerGas).toBe(ARC_MIN_MAX_FEE_PER_GAS);
 const budget=checkoutBudget(100000n,1000000n,1000000000000000000n,50000n,fees.maxFeePerGas);
 expect(budget.gasReserve).toBe(1200000000000000n);
 expect(checkoutBudget(100000n,100000n,100000000000000000n,50000n,fees.maxFeePerGas).ready).toBe(false);
});
test('Arc preserves higher live fees and never quotes a tip above the fee cap',()=>{
 expect(arcFeeQuote({maxFeePerGas:50_000_000_000n,maxPriorityFeePerGas:1n}).maxFeePerGas).toBe(50_000_000_000n);
 expect(arcFeeQuote({maxFeePerGas:1n,maxPriorityFeePerGas:30_000_000_000n}).maxFeePerGas).toBe(30_000_000_000n);
 expect(()=>arcFeeQuote({maxFeePerGas:-1n,maxPriorityFeePerGas:0n})).toThrow();
});
