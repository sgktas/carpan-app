import { useState } from 'react'
import { useReadContract } from 'wagmi'
import { Search } from 'lucide-react'
import { CARPAN_INVOICE_ABI } from './invoiceAbi'
import { CONTRACT_ADDRESS, ACTIVE_CHAIN_ID } from './invoiceConfig'
import { formatAddress, formatExpiry, STATUS_LABELS, STATUS_COLORS } from './invoiceUtils'
import { Amount, usdcDecimalsFor } from '@/onchain-money'

/** Up to 6 significant decimal places, trailing zeros stripped. */
function formatUsdc6(raw: bigint): string {
  return Amount.fromRaw(raw, usdcDecimalsFor(ACTIVE_CHAIN_ID)).toFixed(6)
    .replace(/\.?0+$/, '') || '0'
}

const glass = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
  } as React.CSSProperties,
  inner: {
    background: 'var(--surface-muted)',
    border: '1px solid var(--border)',
    borderRadius: '14px',
  } as React.CSSProperties,
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs shrink-0 font-medium" style={{ color: 'var(--subtle)' }}>{label}</span>
      <span
        className={`text-xs text-right break-all ${mono ? 'mono' : ''}`}
        style={{ color: 'var(--ink-2)' }}
      >
        {value}
      </span>
    </div>
  )
}

export function LookupInvoice({initialKey = ''}: {initialKey?: string}) {
  const [input, setInput] = useState(initialKey)
  const [queryKey, setQueryKey] = useState<`0x${string}` | undefined>(/^0x[0-9a-f]{64}$/i.test(initialKey) ? initialKey as `0x${string}` : undefined)

  const { data, isLoading, isError } = useReadContract(
    queryKey && CONTRACT_ADDRESS
      ? {
          address: CONTRACT_ADDRESS,
          abi: CARPAN_INVOICE_ABI,
          functionName: 'getInvoice',
          args: [queryKey],
          chainId: ACTIVE_CHAIN_ID,
        }
      : undefined
  )

  const invoice = data as
    | { creator: string; recipient: string; amount: bigint; expiry: number; status: number }
    | undefined

  const notFound = invoice && invoice.creator === '0x0000000000000000000000000000000000000000'

  function handleLookup() {
    const trimmed = input.trim()
    if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
      setQueryKey(trimmed as `0x${string}`)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="flex size-8 items-center justify-center rounded-xl"
          style={{ background: 'rgba(172,152,239,0.14)' }}
        >
          <Search className="size-4" style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Lookup Invoice
        </h2>
      </div>

      <div style={glass.card} className="p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
            Invoice Key
          </label>
          <div style={glass.inner} className="flex gap-2 items-center px-3 py-2.5">
            <input
              className="mono flex-1 bg-transparent text-sm outline-none placeholder:opacity-40"
              style={{ color: 'var(--ink)' }}
              placeholder="0x…64-char hex key"
              value={input}
              onChange={e => setInput(e.target.value.trim())}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
            />
          </div>
          {input && !/^0x[0-9a-fA-F]{64}$/.test(input) && (
            <p className="text-[11px]" style={{ color: 'var(--danger)' }}>
              Must be a 32-byte hex key (0x + 64 chars)
            </p>
          )}
        </div>

        <button
          disabled={!CONTRACT_ADDRESS || !/^0x[0-9a-fA-F]{64}$/.test(input)}
          onClick={handleLookup}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)', color: '#09090c' }}
        >
          Lookup
        </button>

        {isLoading && (
          <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
            Loading…
          </p>
        )}

        {isError && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            Failed to read contract.
          </p>
        )}

        {notFound && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No invoice found for this key.
          </p>
        )}

        {invoice && !notFound && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {/* Status badge row */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Invoice
              </span>
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  background: `${STATUS_COLORS[invoice.status]}20`,
                  color: STATUS_COLORS[invoice.status],
                  border: `1px solid ${STATUS_COLORS[invoice.status]}40`,
                }}
              >
                {STATUS_LABELS[invoice.status] ?? 'Unknown'}
              </span>
            </div>

            {/* Details */}
            <div className="px-4 py-1">
              {/* Amount hero */}
              <div className="py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--subtle)' }}>Amount</p>
                <p className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formatUsdc6(invoice.amount)}
                  <span className="ml-1.5 text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
                </p>
              </div>
              <Row label="Creator" value={formatAddress(invoice.creator)} mono />
              <Row label="Recipient" value={formatAddress(invoice.recipient)} mono />
              <Row
                label="Expiry"
                value={formatExpiry(invoice.expiry)}
              />
              <Row label="Invoice Key" value={`${queryKey!.slice(0, 10)}…${queryKey!.slice(-6)}`} mono />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
