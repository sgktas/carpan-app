import { useEffect, useRef, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { getAccount } from 'wagmi/actions'
import { config } from '@/config'
import { isAddress } from 'viem'
import { toast } from 'sonner'
import { Loader2, FileText, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'
import { CARPAN_INVOICE_ABI } from './invoiceAbi'
import { ACTIVE_CHAIN_NAME, CONTRACT_ADDRESS, ACTIVE_CHAIN_ID } from './invoiceConfig'
import { hashReference, computeInvoiceKey } from './invoiceUtils'
import { parseAmount } from '@/onchain-money'

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

export function CreateInvoice() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()

  const [reference, setReference] = useState('')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [expiry, setExpiry] = useState('')
  const [created, setCreated] = useState<{ key: string; refHash: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)
  const [preflightError, setPreflightError] = useState<string | null>(null)
  const submitted = useRef<{ key: string; refHash: string } | null>(null)
  const busy = useRef(false)
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN_ID })

  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()
  const { data: receipt, isLoading: isConfirming, isError: receiptError } = useWaitForTransactionReceipt({ hash, chainId: ACTIVE_CHAIN_ID })

  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  const referenceHash = reference.trim() ? hashReference(reference.trim()) : undefined
  const invoiceKey =
    referenceHash && address
      ? computeInvoiceKey(address, referenceHash)
      : undefined

  const canSubmit =
    !wrongChain &&
    isConnected &&
    !!CONTRACT_ADDRESS &&
    reference.trim() &&
    isAddress(recipient) &&
    parseFloat(amount) > 0 &&
    !isPending &&
    !checking &&
    !isConfirming

  async function handleCreate() {
    if (busy.current || !canSubmit || !CONTRACT_ADDRESS || !referenceHash || !invoiceKey || !publicClient || !address) return
    busy.current = true
    setChecking(true)
    setPreflightError(null)
    try {
    const parsedAmount = parseAmount(ACTIVE_CHAIN_ID, amount)
    const expiryTs = expiry ? Math.floor(new Date(expiry).getTime() / 1000) : 0
    if (recipient.toLowerCase() === '0x0000000000000000000000000000000000000000' || !/^\d+(\.\d{1,6})?$/.test(amount) || parsedAmount.raw <= 0n || (expiry && (!Number.isFinite(expiryTs) || expiryTs <= Date.now() / 1000 || expiryTs > 4294967295))) throw new Error('Enter a nonzero recipient, a valid amount (up to 6 decimals), and future expiry.')
    const existing = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CARPAN_INVOICE_ABI, functionName: 'getInvoice', args: [invoiceKey] })
    if (existing.creator !== '0x0000000000000000000000000000000000000000') throw new Error('An invoice with this reference already exists. Use Lookup to view it.')
    await publicClient.simulateContract({ address: CONTRACT_ADDRESS, abi: CARPAN_INVOICE_ABI, functionName: 'createInvoice', args: [referenceHash, recipient as `0x${string}`, parsedAmount.raw, expiryTs], account: address })
    const current = getAccount(config)
    if (current.address !== address || current.chainId !== ACTIVE_CHAIN_ID || !current.isConnected) throw new Error('Wallet changed. Review the form and try again.')
    submitted.current = { key: invoiceKey, refHash: referenceHash }
    setCreated(null)

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CARPAN_INVOICE_ABI,
      functionName: 'createInvoice',
      args: [referenceHash, recipient, parsedAmount.raw, expiryTs],
      chainId: ACTIVE_CHAIN_ID,
    })
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : 'Cannot verify invoice. Try again.')
    } finally {
      busy.current = false
      setChecking(false)
    }
  }

  useEffect(() => {
    if (receipt?.status !== 'success' || !submitted.current) return
    setCreated(submitted.current)
    submitted.current = null
    toast.success('Invoice created on-chain')
    setReference('')
    setRecipient('')
    setAmount('')
    setExpiry('')
    reset()
  }, [receipt, reset])

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const errorMsg = preflightError || (receipt?.status === 'reverted' || receiptError ? 'Creation failed on-chain. The invoice was not created by this transaction.' : null) || (isError
    ? error?.message?.includes('InvoiceAlreadyExists')
      ? 'An invoice with this reference already exists for your address.'
      : error?.message?.includes('user rejected')
        ? 'Transaction cancelled.'
        : 'Transaction failed. Check inputs and try again.'
    : null)

  return (
    <section className="space-y-4">
      {hash && <a className="block break-all text-xs" href={`${ACTIVE_CHAIN_ID === 5042 ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io"}/tx/${hash}`} target="_blank" rel="noreferrer">Creation transaction: {hash}</a>}
      {/* Title */}
      <div className="flex items-center gap-2">
        <div
          className="flex size-8 items-center justify-center rounded-xl"
          style={{ background: 'rgba(172,152,239,0.14)' }}
        >
          <FileText className="size-4" style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          New Invoice
        </h2>
      </div>

      <fieldset disabled={checking || isPending || isConfirming} style={glass.card} className="p-5 space-y-4 min-w-0">
        {/* Reference */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
            Reference
          </label>
          <div style={glass.inner} className="px-3 py-2.5">
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:opacity-40"
              style={{ color: 'var(--ink)' }}
              placeholder="INV-2026-001 or any private identifier"
              value={reference}
              onChange={e => setReference(e.target.value)}
            />
          </div>
          <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>
            Only the hash is recorded publicly. Hashing is not encryption; do not enter personal data.
          </p>
          {referenceHash && (
            <p className="mono text-[10px] truncate" style={{ color: 'var(--muted)' }}>
              Hash: {referenceHash}
            </p>
          )}
        </div>

        {/* Recipient */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
            Recipient Address
          </label>
          <div style={glass.inner} className="px-3 py-2.5">
            <input
              className="mono w-full bg-transparent text-sm outline-none placeholder:opacity-40"
              style={{ color: 'var(--ink)' }}
              placeholder="0x…"
              value={recipient}
              onChange={e => setRecipient(e.target.value.trim())}
            />
          </div>
          {recipient && !isAddress(recipient) && (
            <p className="text-[11px]" style={{ color: 'var(--danger)' }}>
              Invalid address
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
            Amount
          </label>
          <div style={glass.inner} className="flex items-center gap-2 px-3 py-2.5">
            <input
              inputMode="decimal"
              className="display w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:opacity-30"
              style={{ color: 'var(--ink)' }}
              placeholder="0.00"
              value={amount}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
              }}
            />
            <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--subtle)' }}>
              USDC
            </span>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>
            Exact amount — payer transfers this directly to recipient. 6-decimal USDC precision.
          </p>
        </div>

        {/* Expiry */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
            Expiry (optional)
          </label>
          <div style={glass.inner} className="px-3 py-2.5">
            <input
              type="datetime-local"
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: expiry ? 'var(--ink)' : 'var(--muted)', colorScheme: 'dark' }}
              value={expiry}
              onChange={e => setExpiry(e.target.value)}
            />
          </div>
          <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>
            Leave blank for no expiry.
          </p>
        </div>

        {/* Not deployed banner */}
        {!CONTRACT_ADDRESS && (
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-2"
            style={{ background: 'rgba(237,203,136,0.10)', border: '1px solid rgba(237,203,136,0.22)' }}
          >
            <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--warning)' }} />
            <p className="text-xs" style={{ color: 'var(--warning)' }}>
              Contract not deployed. Set <code className="mono">VITE_CARPAN_INVOICE_ADDRESS</code> in{' '}
              <code className="mono">.env</code> after deploying to enable writes.
            </p>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div
            className="rounded-xl px-4 py-3"
            style={{ background: 'rgba(255,157,177,0.10)', border: '1px solid rgba(255,157,177,0.22)' }}
          >
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{errorMsg}</p>
          </div>
        )}

        {/* CTA */}
        {wrongChain ? (
          <button
            onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--warning)', color: '#09090c' }}
          >
            Switch to {ACTIVE_CHAIN_NAME}
          </button>
        ) : (
          <button
            disabled={!canSubmit}
            onClick={handleCreate}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#09090c' }}
          >
            {!isConnected
              ? 'Connect Wallet'
              : checking
                ? 'Checking invoice…'
              : isPending
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm in wallet…</span>
                : isConfirming
                  ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirming…</span>
                  : 'Create Invoice'}
          </button>
        )}
      </fieldset>

      {/* Success: show invoice key */}
      {created && (
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: 'rgba(140,219,178,0.09)', border: '1px solid rgba(140,219,178,0.22)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
              Invoice created
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Share this invoice key with the payer. Your reference stays private.
          </p>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={glass.inner}
          >
            <code className="mono flex-1 truncate text-[11px]" style={{ color: 'var(--ink-2)' }}>
              {created.key}
            </code>
            <button
              onClick={() => { void copyKey(created.key) }}
              className="shrink-0 transition-opacity hover:opacity-70"
              title="Copy invoice key"
            >
              {copied
                ? <CheckCircle2 className="size-3.5" style={{ color: 'var(--success)' }} />
                : <Copy className="size-3.5" style={{ color: 'var(--muted)' }} />}
            </button>
          </div>
          <button
            className="text-xs underline-offset-2 hover:underline"
            onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/finance/invoices?invoice=${created.key}`).then(() => toast.success('Request link copied')) }}
          >Copy request link</button>
          <button
            className="text-xs underline-offset-2 hover:underline"
            style={{ color: 'var(--subtle)' }}
            onClick={() => setCreated(null)}
          >
            Create another
          </button>
        </div>
      )}
    </section>
  )
}
