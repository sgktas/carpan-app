import { expect, test } from 'bun:test';
import { paymentDetails, paymentRequestFromSearch, paymentRequestUrl } from '../src/arc-payment.ts';

const alice = '0x1111111111111111111111111111111111111111';
const bob = '0x2222222222222222222222222222222222222222';

test('Arc payment uses 6 decimal USDC amounts and validates the recipient', () => {
  expect(paymentDetails(bob, '1.000001', alice).rawAmount).toBe(1_000_001n);
  expect(() => paymentDetails(bob, '1.0000001', alice)).toThrow();
  expect(() => paymentDetails(bob, '0', alice)).toThrow();
  expect(() => paymentDetails('invalid', '1', alice)).toThrow();
  expect(() => paymentDetails(alice, '1', alice)).toThrow();
});

test('payment request prefills a link but requires a separate wallet send', () => {
  const url = paymentRequestUrl('https://refvox.example', bob, '2.5');
  expect(url).toBe(`https://refvox.example/arc?to=${bob}&amount=2.5`);
  expect(paymentRequestFromSearch(new URL(url).search)).toMatchObject({ to: bob, rawAmount: 2_500_000n });
  expect(paymentRequestFromSearch('')).toBeNull();
  expect(() => paymentRequestFromSearch('?to=invalid&amount=2.5')).toThrow();
});
