// Client-side utilities for CarpanInvoice
import { keccak256, toBytes, encodeAbiParameters, parseAbiParameters } from 'viem'

/**
 * Hash a plaintext reference string client-side.
 * The contract only ever sees bytes32 — plaintext never touches the chain.
 */
export function hashReference(reference: string): `0x${string}` {
  return keccak256(toBytes(reference))
}

/**
 * Derive the invoice key off-chain, matching the contract's
 * keccak256(abi.encode(creator, referenceHash)).
 */
export function computeInvoiceKey(creator: `0x${string}`, referenceHash: `0x${string}`): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('address, bytes32'),
      [creator, referenceHash]
    )
  )
}

export const STATUS_LABELS: Record<number, string> = {
  0: 'Pending',
  1: 'Paid',
  2: 'Cancelled',
}

export const STATUS_COLORS: Record<number, string> = {
  0: 'var(--warning)',
  1: 'var(--success)',
  2: 'var(--muted)',
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatExpiry(expiry: number): string {
  if (expiry === 0) return 'No expiry'
  return new Date(expiry * 1000).toLocaleString()
}
