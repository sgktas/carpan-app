import { expect, test } from 'bun:test';
import { classifyWalletCode } from './arcWallet';

test('wallet classification distinguishes EIP-7702 delegation from deployed contracts and rejects malformed code', () => {
  const delegate = '0x1234567890123456789012345678901234567890';
  expect(classifyWalletCode('0x')).toEqual({ accountType: 'wallet', delegationAddress: null });
  expect(classifyWalletCode(`0xef0100${delegate.slice(2)}`)).toEqual({ accountType: 'delegated_wallet', delegationAddress: delegate });
  expect(classifyWalletCode(`0xEF0100${delegate.slice(2)}`)).toEqual({ accountType: 'delegated_wallet', delegationAddress: delegate });
  expect(classifyWalletCode('0x6080604052')).toEqual({ accountType: 'contract', delegationAddress: null });
  expect(classifyWalletCode(`0xef0100${delegate.slice(2)}ff`).accountType).toBe('contract');
  expect(classifyWalletCode(`0xef0100${'0'.repeat(40)}`).accountType).toBe('contract');
  expect(classifyWalletCode('0xabc').accountType).toBeNull();
  expect(classifyWalletCode(null).accountType).toBeNull();
});
