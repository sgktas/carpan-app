// CarpanInvoice ABI — generated from contracts/CarpanInvoice.sol
// SPDX-License-Identifier: UNLICENSED
export const CARPAN_INVOICE_ABI = [
  // errors
  { type: 'error', name: 'InvoiceAlreadyExists', inputs: [] },
  { type: 'error', name: 'InvoiceExpired', inputs: [] },
  { type: 'error', name: 'InvoiceNotFound', inputs: [] },
  { type: 'error', name: 'InvoiceNotPending', inputs: [] },
  { type: 'error', name: 'NotInvoiceCreator', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },

  // events
  {
    type: 'event',
    name: 'InvoiceCreated',
    inputs: [
      { name: 'invoiceKey', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'expiry', type: 'uint32', indexed: false },
      { name: 'referenceHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'InvoicePaid',
    inputs: [
      { name: 'invoiceKey', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'InvoiceCancelled',
    inputs: [
      { name: 'invoiceKey', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
    ],
  },

  // constructor
  {
    type: 'constructor',
    inputs: [{ name: 'usdc_', type: 'address' }],
    stateMutability: 'nonpayable',
  },

  // state-changing
  {
    type: 'function',
    name: 'createInvoice',
    inputs: [
      { name: 'referenceHash', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'expiry', type: 'uint32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'payInvoice',
    inputs: [{ name: 'invoiceKey', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'cancelInvoice',
    inputs: [{ name: 'invoiceKey', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // read-only
  {
    type: 'function',
    name: 'getInvoice',
    inputs: [{ name: 'invoiceKey', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'creator', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'expiry', type: 'uint32' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'computeKey',
    inputs: [
      { name: 'creator', type: 'address' },
      { name: 'referenceHash', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'USDC',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const
