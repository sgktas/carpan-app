import { describe, expect, it } from 'bun:test';
import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem';
import { bytes32Id, verifyReleaseReceipt, verifyRefundReceipt, type ChainReceipt } from './chain';

const escrow = '0x1111111111111111111111111111111111111111';
const participant = '0x2222222222222222222222222222222222222222';
const owner = '0x3333333333333333333333333333333333333333';
const topicAddress = (value: string) => `0x${value.slice(2).padStart(64, '0')}`;
const releaseTopic = keccak256(toHex('PaymentReleased(bytes32,bytes32,address,uint256,uint256)'));
const refundTopic = keccak256(toHex('BudgetRefunded(bytes32,uint256,address)'));
const releaseLog = {
  address: escrow,
  topics: [releaseTopic, bytes32Id('order_1'), bytes32Id('part_1'), topicAddress(participant)],
  data: encodeAbiParameters(parseAbiParameters('uint256,uint256'), [500_000n, 500_000n]),
};
const refundLog = {
  address: escrow,
  topics: [refundTopic, bytes32Id('order_1'), topicAddress(owner)],
  data: encodeAbiParameters(parseAbiParameters('uint256'), [1_000_000n]),
};
const base: ChainReceipt = {
  status: '0x1', to: escrow, from: owner, blockNumber: '0x1', logs: [releaseLog, refundLog],
};

describe('Arc escrow receipt verification', () => {
  const payout = { escrow, orderId: 'order_1', participationId: 'part_1', participant,
    participantShare: 500_000n, platformShare: 500_000n };
  const refund = { escrow, orderId: 'order_1', owner, amount: 1_000_000n };

  it('matches exact order, participation, recipient and payout amounts', () => {
    expect(() => verifyReleaseReceipt(base, payout)).not.toThrow();
    expect(() => verifyReleaseReceipt(base, { ...payout, orderId: 'order_2' })).toThrow();
    expect(() => verifyReleaseReceipt(base, { ...payout, participant: owner })).toThrow();
    expect(() => verifyReleaseReceipt(base, { ...payout, platformShare: 400_000n })).toThrow();
  });

  it('rejects reverted, wrong-contract and malformed payout receipts', () => {
    expect(() => verifyReleaseReceipt({ ...base, status: '0x0' }, payout)).toThrow();
    expect(() => verifyReleaseReceipt({ ...base, to: owner }, payout)).toThrow();
    expect(() => verifyReleaseReceipt({ ...base, logs: [{ ...releaseLog, data: '0x' }] }, payout)).toThrow();
  });

  it('matches the refund owner and exact amount', () => {
    expect(() => verifyRefundReceipt(base, refund)).not.toThrow();
    expect(() => verifyRefundReceipt(base, { ...refund, owner: participant })).toThrow();
    expect(() => verifyRefundReceipt(base, { ...refund, amount: 2_000_000n })).toThrow();
    expect(() => verifyRefundReceipt({ ...base, logs: [releaseLog] }, refund)).toThrow();
  });
});
