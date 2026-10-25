// SPDX-License-Identifier: UNLICENSED — Carpan Finance
// No deployment, publication or signing in this file.
// oxlint-disable react/set-state-in-effect -- state machine: useEffect drives step transitions in response to wagmi receipt events (external system). Cascading re-renders are bounded and intentional; this is the only correct pattern for responding to async on-chain events in React.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  useAccount,
  useConfig,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useReadContract,
} from 'wagmi'
import { getAccount } from '@wagmi/core'
import {useNavigate} from 'react-router-dom'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import {
  Loader2,
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { CARPAN_INVOICE_ABI } from './invoiceAbi'
import { ACTIVE_CHAIN_NAME, CONTRACT_ADDRESS, ACTIVE_CHAIN_ID, USDC_ADDRESS } from './invoiceConfig'
import { formatAddress, formatExpiry, STATUS_LABELS } from './invoiceUtils'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { InvoicePaymentReceipt } from './InvoicePaymentReceipt'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * State machine:
 *
 *  enter ──lookup──▶ review
 *                     │
 *               (needs approval?)
 *               yes ──▶ [Allow click] ──▶ approve ──receipt✓──▶ review
 *                                                               (Pay button now active)
 *               no  ──────────────────────────────────────────▶ review
 *                     │
 *               [Pay click] ──▶ pay ──receipt✓──▶ done
 *
 * "approve" = wallet open / confirming approval tx
 * "pay"     = wallet open / confirming pay tx
 * "done"    = pay receipt confirmed success
 *
 * Any rejection or revert returns to 'review' with an error message so the
 * user can retry without re-entering the key.
 */
type Step = 'enter' | 'review' | 'approve' | 'pay' | 'done'

interface InvoiceData {
  creator: `0x${string}`
  recipient: `0x${string}`
  amount: bigint
  expiry: number
  status: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

/** Format a bigint USDC raw amount to up to 6 significant decimal places. */
export function formatUsdc6(raw: bigint): string {
  return (
    Amount.fromRaw(raw, usdcDecimalsFor(ACTIVE_CHAIN_ID))
      .toFixed(6)
      .replace(/\.?0+$/, '') || '0'
  )
}

function parseErrorMsg(err: Error | null | undefined): string | null {
  if (!err) return null
  const m = err.message?.toLowerCase() ?? ''
  if (m.includes('user rejected') || m.includes('denied')) return 'Transaction cancelled — you can try again.'
  if (m.includes('invoicenotpending')) return 'This invoice is no longer pending.'
  if (m.includes('invoiceexpired')) return 'This invoice has expired.'
  if (m.includes('insufficient')) return 'Insufficient USDC balance.'
  if (m.includes('reverted')) return 'Transaction reverted on-chain. Please refresh and retry.'
  return 'Transaction failed. Please try again.'
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

function PreviewRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>
        {label}
      </span>
      <span
        className={`text-xs font-semibold ${mono ? 'mono' : ''}`}
        style={{ color: 'var(--ink-2)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PayInvoice({initialKey = ''}: {initialKey?: string}) {
  const { address, chainId, isConnected } = useAccount()
  const navigate = useNavigate()
  const { switchChain } = useSwitchChain()
  // Wagmi config — used for synchronous post-await account snapshots
  const wagmiConfig = useConfig()

  // ── State machine ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('enter')
  const [invoiceKeyInput, setInvoiceKeyInput] = useState(initialKey)
  const [invoiceKey, setInvoiceKey] = useState<`0x${string}` | undefined>()

  // Hashes kept for receipt watchers; set in effects, never in render
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const [payHash, setPayHash] = useState<`0x${string}` | undefined>()

  // User-facing error message (rejection / revert / guard failure)
  const [flowError, setFlowError] = useState<string | null>(null)

  // Busy flag: true while refresh-before-sign is in flight; prevents double-click
  const [refreshing, setRefreshing] = useState(false)

  // Guard: prevent concurrent sign requests
  const signingRef = useRef(false)

  // ── Cancellation token — incremented whenever account/key/chain changes ────
  // Any in-flight async handler captures the token at click-time and aborts if
  // it has changed by the time the awaits complete.
  const cancelTokenRef = useRef(0)

  // ── Live clock — ticks every second ───────────────────────────────────────
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  // ── Invalidate in-flight callbacks on account / chain / key change ─────────
  // Stale hashes and flow state from a previous wallet/invoice must not bleed through.
  // cancelTokenRef is also bumped so any awaiting handler aborts when it resumes.
  const prevAddressRef = useRef(address)
  const prevChainIdRef = useRef(chainId)
  const prevKeyRef     = useRef(invoiceKey)
  useEffect(() => {
    const addrChanged  = prevAddressRef.current !== address
    const chainChanged = prevChainIdRef.current !== chainId
    const keyChanged   = prevKeyRef.current     !== invoiceKey
    prevAddressRef.current = address
    prevChainIdRef.current = chainId
    prevKeyRef.current     = invoiceKey
    if ((addrChanged || chainChanged || keyChanged) && step !== 'enter') {
      cancelTokenRef.current++
      setApproveHash(undefined)
      setPayHash(undefined)
      signingRef.current = false
      if (addrChanged) {
        setStep('review')
        setFlowError('Wallet changed — please re-verify before paying.')
      } else if (chainChanged) {
        setStep('review')
        setFlowError('Network changed — please re-verify before paying.')
      }
      // key change: step is already being reset by handleLookup
    }
  }, [address, chainId, invoiceKey, step])

  // ── On-chain reads ─────────────────────────────────────────────────────────
  const {
    data: rawInvoice,
    isLoading: invoiceLoading,
    refetch: refetchInvoice,
  } = useReadContract(
    invoiceKey && CONTRACT_ADDRESS
      ? {
          address: CONTRACT_ADDRESS,
          abi: CARPAN_INVOICE_ABI,
          functionName: 'getInvoice',
          args: [invoiceKey],
          chainId: ACTIVE_CHAIN_ID,
        }
      : undefined,
  )

  const invoice = rawInvoice
  const notFound = invoice?.creator === ZERO_ADDR
  const invoiceIsPending = invoice?.status === 0
  const isExpired = !!invoice && invoice.expiry !== 0 && nowSec > invoice.expiry

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract(
    address && CONTRACT_ADDRESS
      ? {
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, CONTRACT_ADDRESS],
          chainId: ACTIVE_CHAIN_ID,
        }
      : undefined,
  )

  const needsApproval =
    !!invoice && allowanceRaw !== undefined && allowanceRaw < invoice.amount

  // ── Write hooks ───────────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    data: approveWriteHash,
    isPending: approvePending,
    error: approveWriteErr,
    reset: resetApprove,
  } = useWriteContract()

  const {
    writeContract: writePay,
    data: payWriteHash,
    isPending: payPending,
    error: payWriteErr,
    reset: resetPay,
  } = useWriteContract()

  // ── Capture write hashes in effects (never in render) ─────────────────────
  useEffect(() => {
    if (approveWriteHash && step === 'approve' && approveWriteHash !== approveHash) {
      setApproveHash(approveWriteHash)
    }
  }, [approveWriteHash, step, approveHash])

  useEffect(() => {
    if (payWriteHash && step === 'pay' && payWriteHash !== payHash) {
      setPayHash(payWriteHash)
    }
  }, [payWriteHash, step, payHash])

  // ── Receipt watchers (explicit Arc Testnet chainId) ────────────────────────
  const {
    isLoading: approveConfirming,
    isSuccess: approveReceiptSuccess,
    data: approveReceipt,
  } = useWaitForTransactionReceipt({
    hash: approveHash,
    chainId: ACTIVE_CHAIN_ID,
  })

  const {
    isLoading: payConfirming,
    isSuccess: payReceiptSuccess,
    data: payReceipt,
    isError: payReceiptError,
    refetch: recheckPayReceipt,
  } = useWaitForTransactionReceipt({
    hash: payHash,
    chainId: ACTIVE_CHAIN_ID,
  })

  // ── Transition: approve confirmed → pay step ───────────────────────────────
  useEffect(() => {
    if (!approveReceiptSuccess || step !== 'approve') return
    // Inspect receipt.status before trusting success
    if (approveReceipt?.status !== 'success') {
      setFlowError('Approval transaction reverted. Please try again.')
      setStep('review')
      signingRef.current = false
      return
    }
    void refetchAllowance().then(() => {
      // Return to 'review' — the Pay button requires a separate explicit click.
      // Payment NEVER proceeds automatically after approval.
      setStep('review')
      setFlowError(null)
      signingRef.current = false
    })
  }, [approveReceiptSuccess, approveReceipt, step, refetchAllowance])

  // ── Transition: pay confirmed → done ──────────────────────────────────────
  useEffect(() => {
    if (!payReceiptSuccess || step !== 'pay') return
    if (payReceipt?.status !== 'success') {
      setFlowError('Payment transaction reverted. Please refresh and retry.')
      setStep('review')
      resetPay()
      setPayHash(undefined)
      signingRef.current = false
      return
    }
    setStep('done')
    if (invoiceKey && payHash) navigate('/finance/invoices?invoice='+invoiceKey+'&receipt='+payHash, {replace:true})
    toast.success('Transaction confirmed — checking payment receipt')
    signingRef.current = false
  }, [payReceiptSuccess, payReceipt, step, resetPay, invoiceKey, payHash, navigate])

  // ── Propagate write errors to flowError in effects ─────────────────────────
  useEffect(() => {
    if (approveWriteErr) {
      setFlowError(parseErrorMsg(approveWriteErr))
      signingRef.current = false
      // Rejection returns to review so the button is re-enabled
      if (step === 'approve') setStep('review')
    }
  }, [approveWriteErr, step])

  useEffect(() => {
    if (payWriteErr) {
      setFlowError(parseErrorMsg(payWriteErr))
      signingRef.current = false
      if (step === 'pay') setStep('review')
    }
  }, [payWriteErr, step])

  // ── refreshBeforeSigning: returns fresh data, fails closed ─────────────────
  /**
   * Returns the latest invoice + allowance values from the network.
   * Throws if either read fails, returns an error, or returns undefined.
   * Fail-closed: a query may return stale cached data alongside isError=true
   * (e.g. network outage after a previous success). We reject the cached data
   * in that case — an unknown/error state must never proceed to signing.
   */
  const refreshBeforeSigning = useCallback(async (): Promise<{
    freshInvoice: InvoiceData
    freshAllowance: bigint
  }> => {
    const [invResult, allowResult] = await Promise.all([
      refetchInvoice(),
      refetchAllowance(),
    ])

    // Reject on query error even when stale data is present in the result
    if (invResult.isError || invResult.error) {
      throw new Error('Could not read invoice from network.')
    }
    if (allowResult.isError || allowResult.error) {
      throw new Error('Could not read USDC allowance from network.')
    }

    const freshInvoice   = invResult.data
    const freshAllowance = allowResult.data

    if (!freshInvoice) throw new Error('Could not read invoice from network.')
    if (freshInvoice.creator === ZERO_ADDR) throw new Error('Invoice does not exist.')
    if (freshAllowance === undefined) throw new Error('Could not read USDC allowance from network.')

    return { freshInvoice, freshAllowance }
  }, [refetchInvoice, refetchAllowance])

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleLookup() {
    const trimmed = invoiceKeyInput.trim()
    if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
      cancelTokenRef.current++ // invalidate any in-flight handler from the old key
      setInvoiceKey(trimmed as `0x${string}`)
      setApproveHash(undefined)
      setPayHash(undefined)
      setFlowError(null)
      resetApprove()
      resetPay()
      signingRef.current = false
      setStep('review')
    }
  }

  async function handleApprove() {
    if (!invoice || !CONTRACT_ADDRESS || !isConnected || wrongChain) return
    if (signingRef.current || refreshing) return
    signingRef.current = true
    setFlowError(null)
    setRefreshing(true)

    // Capture click-time values for post-await comparison
    const clickToken   = cancelTokenRef.current
    const clickAddress = address
    const clickKey     = invoiceKey

    try {
      const { freshInvoice, freshAllowance } = await refreshBeforeSigning()

      // Abort if account/key/chain changed while awaiting (cancel token bumped by effect)
      if (cancelTokenRef.current !== clickToken) {
        throw new Error('Context changed during refresh — please try again.')
      }

      // Synchronous post-await account snapshot — NOT the stale render closure
      const snap = getAccount(wagmiConfig)
      if (!snap.isConnected || snap.address !== clickAddress) {
        throw new Error('Wallet disconnected or changed during refresh.')
      }
      if (snap.chainId !== ACTIVE_CHAIN_ID) {
        throw new Error('Wrong network — please switch to the selected Arc network.')
      }
      if (snap.address !== clickAddress) {
        throw new Error('Wallet address changed during refresh.')
      }
      if (invoiceKey !== clickKey) {
        throw new Error('Invoice key changed during refresh.')
      }

      // Use current wall-clock time at signing event, not render-closure nowSec
      const nowAtSign = Math.floor(Date.now() / 1000)

      // Fail-closed guards on fresh data
      if (freshInvoice.creator === ZERO_ADDR) throw new Error('Invoice does not exist.')
      if (freshInvoice.status !== 0) throw new Error('Invoice is no longer pending.')
      if (freshInvoice.expiry !== 0 && nowAtSign > freshInvoice.expiry) throw new Error('Invoice has expired.')
      if (freshAllowance >= freshInvoice.amount) {
        // Allowance already sufficient — return to review so Pay button requires an explicit click.
        // Payment NEVER proceeds automatically.
        setStep('review')
        setFlowError(null)
        signingRef.current = false
        setRefreshing(false)
        return
      }

      setStep('approve')
      setRefreshing(false)
      writeApprove({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, freshInvoice.amount],
        chainId: ACTIVE_CHAIN_ID,
      })
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Refresh failed. Please try again.')
      setStep('review')
      signingRef.current = false
      setRefreshing(false)
    }
  }

  async function handlePay() {
    if (!invoiceKey || !CONTRACT_ADDRESS || !isConnected || wrongChain) return
    if (signingRef.current || refreshing) return
    signingRef.current = true
    setFlowError(null)
    setRefreshing(true)

    // Capture click-time values for post-await comparison
    const clickToken   = cancelTokenRef.current
    const clickAddress = address
    const clickKey     = invoiceKey

    try {
      const { freshInvoice, freshAllowance } = await refreshBeforeSigning()

      // Abort if account/key/chain changed while awaiting (cancel token bumped by effect)
      if (cancelTokenRef.current !== clickToken) {
        throw new Error('Context changed during refresh — please try again.')
      }

      // Synchronous post-await account snapshot — NOT the stale render closure
      const snap = getAccount(wagmiConfig)
      if (!snap.isConnected || snap.address !== clickAddress) {
        throw new Error('Wallet disconnected or changed during refresh.')
      }
      if (snap.chainId !== ACTIVE_CHAIN_ID) {
        throw new Error('Wrong network — please switch to the selected Arc network.')
      }
      if (invoiceKey !== clickKey) {
        throw new Error('Invoice key changed during refresh.')
      }

      // Use current wall-clock time at signing event, not render-closure nowSec
      const nowAtSign = Math.floor(Date.now() / 1000)

      // Fail-closed guards on fresh data
      if (freshInvoice.creator === ZERO_ADDR) throw new Error('Invoice does not exist.')
      if (freshInvoice.status !== 0) throw new Error('Invoice is no longer pending.')
      if (freshInvoice.expiry !== 0 && nowAtSign > freshInvoice.expiry) throw new Error('Invoice has expired.')
      if (freshAllowance < freshInvoice.amount) throw new Error('Insufficient USDC allowance. Please approve first.')

      setStep('pay')
      setRefreshing(false)
      writePay({
        address: CONTRACT_ADDRESS,
        abi: CARPAN_INVOICE_ABI,
        functionName: 'payInvoice',
        args: [clickKey],
        chainId: ACTIVE_CHAIN_ID,
      })
    } catch (err) {
      setFlowError(err instanceof Error ? err.message : 'Refresh failed. Please try again.')
      setStep('review')
      signingRef.current = false
      setRefreshing(false)
    }
  }

  function handleReset() {
    navigate('/finance/invoices', {replace:true})
    cancelTokenRef.current++ // invalidate any in-flight handler
    setStep('enter')
    setInvoiceKey(undefined)
    setInvoiceKeyInput('')
    setApproveHash(undefined)
    setPayHash(undefined)
    setFlowError(null)
    resetApprove()
    resetPay()
    signingRef.current = false
    setRefreshing(false)
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const isBusy = refreshing || approvePending || approveConfirming || payPending || payConfirming

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="flex size-8 items-center justify-center rounded-xl"
          style={{ background: 'rgba(172,152,239,0.14)' }}
        >
          <CreditCard className="size-4" style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          Pay Invoice
        </h2>
      </div>

      <div style={glass.card} className="p-5 space-y-4">

        {/* ── Key entry (visible at enter and review) ── */}
        {(step === 'enter' || step === 'review') && (
          <>
            <div className="space-y-1.5">
              <label
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--subtle)' }}
              >
                Invoice Key
              </label>
              <div style={glass.inner} className="px-3 py-2.5">
                <input
                  className="mono w-full bg-transparent text-sm outline-none placeholder:opacity-40"
                  style={{ color: 'var(--ink)' }}
                  placeholder="0x…64-char hex"
                  value={invoiceKeyInput}
                  onChange={e => {
                    setInvoiceKeyInput(e.target.value.trim())
                    if (step !== 'enter') {
                      setStep('enter')
                      setFlowError(null)
                    }
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                />
              </div>
              {invoiceKeyInput && !/^0x[0-9a-fA-F]{64}$/.test(invoiceKeyInput) && (
                <p className="text-[11px]" style={{ color: 'var(--danger)' }}>
                  Must be 0x + 64 hex chars
                </p>
              )}
            </div>

            {step === 'enter' && (
              <button
                disabled={!CONTRACT_ADDRESS || !/^0x[0-9a-fA-F]{64}$/.test(invoiceKeyInput)}
                onClick={handleLookup}
                className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#09090c' }}
              >
                Fetch Invoice
              </button>
            )}
          </>
        )}

        {/* ── Review: loading ── */}
        {step === 'review' && invoiceLoading && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="size-4 animate-spin" style={{ color: 'var(--muted)' }} />
            <span className="text-sm" style={{ color: 'var(--muted)' }}>Loading invoice…</span>
          </div>
        )}

        {/* ── Review: not found ── */}
        {step === 'review' && !invoiceLoading && notFound && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No invoice found for this key.
          </p>
        )}

        {/* ── Review: invoice loaded ── */}
        {step === 'review' && !invoiceLoading && invoice && !notFound && (
          <>
            {/* Confirmation card */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-strong)' }}>
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: 'rgba(172,152,239,0.10)', borderBottom: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4" style={{ color: 'var(--accent)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                    Payment Confirmation
                  </span>
                </div>
                <button
                  onClick={() => {
                    setFlowError(null)
                    void Promise.all([refetchInvoice(), refetchAllowance()])
                  }}
                  disabled={isBusy}
                  className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-70 disabled:opacity-30"
                  style={{ color: 'var(--subtle)' }}
                  title="Refresh invoice and allowance from network"
                >
                  <RefreshCw className="size-3" />
                  Refresh
                </button>
              </div>

              <div className="px-4 py-1">
                <div className="py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--subtle)' }}>
                    You will send exactly
                  </p>
                  <p className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {formatUsdc6(invoice.amount)}
                    <span className="ml-1.5 text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
                  </p>
                </div>
                <PreviewRow label="Network" value={ACTIVE_CHAIN_NAME} />
                <PreviewRow label="To (Recipient)" value={formatAddress(invoice.recipient)} mono />
                <PreviewRow label="From (You)" value={address ? formatAddress(address) : '—'} mono />
                <PreviewRow label="Status" value={STATUS_LABELS[invoice.status] ?? '—'} />
                <PreviewRow label="Expiry" value={formatExpiry(invoice.expiry)} />
                {invoice.expiry !== 0 && invoiceIsPending && !isExpired && (
                  <div className="py-2 text-[11px]" style={{ color: 'var(--subtle)' }}>
                    Expires in{' '}
                    <span className="mono tabular-nums" style={{ color: 'var(--warning)' }}>
                      {Math.max(0, invoice.expiry - nowSec)}s
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Flow error (guard failures, rejections, reverts) */}
            {flowError && (
              <div
                className="rounded-xl px-4 py-3 flex items-start gap-2"
                style={{ background: 'rgba(255,157,177,0.09)', border: '1px solid rgba(255,157,177,0.24)' }}
              >
                <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                <p className="text-xs" style={{ color: 'var(--danger)' }}>{flowError}</p>
              </div>
            )}

            {/* Not-pending warning */}
            {!invoiceIsPending && (
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-2"
                style={{ background: 'rgba(237,203,136,0.10)', border: '1px solid rgba(237,203,136,0.22)' }}
              >
                <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--warning)' }} />
                <p className="text-xs" style={{ color: 'var(--warning)' }}>
                  Invoice is {STATUS_LABELS[invoice.status]?.toLowerCase()} — payment not allowed.
                </p>
              </div>
            )}

            {/* Expired warning */}
            {isExpired && invoiceIsPending && (
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-2"
                style={{ background: 'rgba(237,203,136,0.10)', border: '1px solid rgba(237,203,136,0.22)' }}
              >
                <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--warning)' }} />
                <p className="text-xs" style={{ color: 'var(--warning)' }}>
                  This invoice has expired. The on-chain transaction will revert.
                </p>
              </div>
            )}

            {/* Approve CTA (needs approval and payable) */}
            {needsApproval && invoiceIsPending && !isExpired && (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  Step 1: Allow the invoice contract to transfer exactly{' '}
                  <strong>{formatUsdc6(invoice.amount)} USDC</strong> on your behalf.
                </p>
                {wrongChain ? (
                  <button
                    onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold"
                    style={{ background: 'var(--warning)', color: '#09090c' }}
                  >
                    Switch to {ACTIVE_CHAIN_NAME}
                  </button>
                ) : (
                  <button
                    disabled={isBusy || !isConnected}
                    onClick={() => { void handleApprove() }}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border-strong)' }}
                  >
                    {refreshing
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Checking…</span>
                      : approvePending
                        ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm in wallet…</span>
                        : approveConfirming
                          ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Approval confirming…</span>
                          : 'Allow USDC Transfer'}
                  </button>
                )}
              </div>
            )}

            {/* Pay CTA (allowance sufficient and payable) */}
            {!needsApproval && invoiceIsPending && !isExpired && (
              <div className="space-y-2">
                {approveHash && (
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                    Step 2: Confirm the payment transaction in your wallet.
                  </p>
                )}
                {wrongChain ? (
                  <button
                    onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold"
                    style={{ background: 'var(--warning)', color: '#09090c' }}
                  >
                    Switch to {ACTIVE_CHAIN_NAME}
                  </button>
                ) : (
                  <button
                    disabled={isBusy || !isConnected}
                    onClick={() => { void handlePay() }}
                    className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: 'var(--accent)', color: '#09090c' }}
                  >
                    {refreshing
                      ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Checking…</span>
                      : payPending
                        ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm in wallet…</span>
                        : payConfirming
                          ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirming…</span>
                          : `Pay ${formatUsdc6(invoice.amount)} USDC`}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Approve in-flight (wallet open / confirming) ── */}
        {step === 'approve' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3 py-6">
              <Loader2 className="size-5 animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                {approvePending ? 'Waiting for wallet approval…' : 'Approval confirming on-chain…'}
              </span>
            </div>
            <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
              Approve the USDC transfer in your wallet. Once confirmed, return here to complete payment.
            </p>
          </div>
        )}

        {/* ── Pay in-flight (wallet open / confirming) ── */}
        {step === 'pay' && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3 py-6">
              <Loader2 className="size-5 animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                {payPending ? 'Waiting for your wallet signature…' : payHash ? 'Payment submitted — waiting for onchain confirmation…' : 'Preparing payment…'}
              </span>
            </div>
            {payReceiptError && <div role="alert"><p>Confirmation is temporarily unavailable. This does not mean payment failed. Do not pay again.</p><button type="button" onClick={() => void recheckPayReceipt()}>Check payment status again</button></div>}
            {approveHash && (
              <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
                Step 2 — approve complete. Confirm the payment in your wallet.
              </p>
            )}
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && (
          <div className="space-y-4">
            {payHash && invoiceKey && <InvoicePaymentReceipt hash={payHash} invoiceKey={invoiceKey}/>}
            <button
              onClick={handleReset}
              className="w-full rounded-2xl py-3 text-sm font-semibold"
              style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
            >
              Pay another invoice
            </button>
          </div>
        )}

      </div>
    </section>
  )
}
