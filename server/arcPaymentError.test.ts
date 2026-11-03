import {test,expect} from 'bun:test';
import {arcPaymentError} from '../src/arc-payment-error';
test('only wallet rejection code establishes cancellation; RPC denied is uncertain',()=>{
 expect(arcPaymentError({cause:{code:4001}})).toContain('cancelled');
 expect(arcPaymentError(Error('access denied by RPC'))).toContain('could not be verified');
 expect(arcPaymentError(Error('receipt timeout'))).toContain('before starting another payment');
 expect(arcPaymentError(Error('execution reverted'))).not.toContain('reverted on-chain');
});
test('explicit Arc restriction and fee evidence receive actionable messages',()=>{
 expect(arcPaymentError({cause:Error('USDC: account is blacklisted')})).toContain('address restriction');
 expect(arcPaymentError(Error('fee cap too low'))).toContain('whether a transaction was submitted');
 const cycle={message:'timeout',cause:null as unknown};cycle.cause=cycle;expect(arcPaymentError(cycle)).toContain('could not be verified');
});
