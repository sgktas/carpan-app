import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t } from '../i18n/index';
import React, { useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useDeployContract, usePublicClient, useWriteContract } from 'wagmi';
import { decodeEventLog, keccak256, parseAbi, toHex } from 'viem';
import { useAuth } from '../hooks/useAuth';
import { getUsdc } from '../onchain-facts';
import { escrowTestBytecode } from '../escrow-test-bytecode';

const CHAIN_ID = 5042002;
const USDC = getUsdc(CHAIN_ID)!;
const UNIT_PRICE = 20_000n; // 0.02 USDC, 6 decimals
const TOTAL = UNIT_PRICE * 2n;
const FEE_BPS = 500n;
const STORE_KEY = 'refvox-escrow-test-v1';
const ABI = parseAbi([
  'constructor(address usdcToken_, address initialOracle, address initialPlatformFeeRecipient, address initialOwner)',
  'function owner() view returns (address)',
  'function oracle() view returns (address)',
  'function usdcToken() view returns (address)',
  'function depositOrder(bytes32 orderId, uint256 pricePerReferral, uint256 platformFeeBps, uint256 maxReferrals, uint256 expiresAt)',
  'function releasePayment(bytes32 orderId, bytes32 participationId, address participant)',
  'function refundBudget(bytes32 orderId, uint256 amount)',
  'function participationPaid(bytes32 participationId) view returns (bool)',
  'function getOrder(bytes32 orderId) view returns ((address projectOwner, uint256 totalBudget, uint256 usedBudget, uint256 refundedBudget, uint256 pricePerReferral, uint256 platformFeeBps, uint256 maxReferrals, uint256 paidReferrals, uint256 expiresAt, bool active))',
  'event PaymentReleased(bytes32 indexed orderId, bytes32 indexed participationId, address indexed participant, uint256 participantShare, uint256 platformShare)',
]);
const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

type Step = 'deploy' | 'approve' | 'deposit' | 'release' | 'refund' | 'complete';
type TestRun = {
  account: string;
  contract?: `0x${string}`;
  orderId: `0x${string}`;
  participationId: `0x${string}`;
  step: Step;
  pending?: { step: Step; hash: `0x${string}` };
  hashes: Partial<Record<Step, `0x${string}`>>;
};

function readRun(): TestRun | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) as TestRun : null;
  } catch {
    return null;
  }
}

function newRun(account: string): TestRun {
  return {
    account: account.toLowerCase(),
    orderId: keccak256(toHex(`refvox-order-${crypto.randomUUID()}`)),
    participationId: keccak256(toHex(`refvox-participation-${crypto.randomUUID()}`)),
    step: 'deploy',
    hashes: {},
  };
}

const nextStep: Record<Exclude<Step, 'complete'>, Step> = {
  deploy: 'approve', approve: 'deposit', deposit: 'release',
  release: 'refund', refund: 'complete',
};

export function EscrowTestPage() {
  const { user } = useAuth();
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: CHAIN_ID });
  const { deployContractAsync } = useDeployContract();
  const { writeContractAsync } = useWriteContract();
  const [run, setRun] = useState<TestRun | null>(readRun);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (user?.role !== 'admin') return <p className="p-6">{t("Yalnızca yönetici erişebilir.")}</p>;

  const save = (updated: TestRun) => {
    localStorage.setItem(STORE_KEY, JSON.stringify(updated));
    setRun(updated);
  };
  const requireReady = () => {
    if (!address || chainId !== CHAIN_ID || !client) throw new Error(t("Cüzdanı Arc Testnet (5042002) ağına bağlayın."));
    if (run && run.account !== address.toLowerCase()) throw new Error(t("Bu test başka bir cüzdanla başladı."));
    return address;
  };
  const verifyState = async (current: TestRun, step: Step, contract?: `0x${string}`) => {
    if (!client) throw new Error(t("Arc Testnet bağlantısı hazır değil."));
    const target = contract || current.contract;
    if (!target) throw new Error(t("Test sözleşmesi adresi bulunamadı."));
    if (step === 'deploy') {
      const [owner, oracle, token] = await Promise.all([
        client.readContract({ address: target, abi: ABI, functionName: 'owner' }),
        client.readContract({ address: target, abi: ABI, functionName: 'oracle' }),
        client.readContract({ address: target, abi: ABI, functionName: 'usdcToken' }),
      ]);
      if (owner.toLowerCase() !== current.account || oracle.toLowerCase() !== current.account ||
          token.toLowerCase() !== USDC.address.toLowerCase()) throw new Error(t("Dağıtımın sahip, oracle veya USDC adresi beklenen değer değil."));
    }
    if (step === 'approve') {
      const allowance = await client.readContract({ address: USDC.address as `0x${string}`, abi: USDC_ABI,
        functionName: 'allowance', args: [current.account as `0x${string}`, target] });
      if (allowance < TOTAL) throw new Error(t("USDC harcama izni zincirde görünmüyor."));
    }
    if (step === 'deposit' || step === 'release' || step === 'refund') {
      const order = await client.readContract({ address: target, abi: ABI, functionName: 'getOrder', args: [current.orderId] });
      if (order.projectOwner.toLowerCase() !== current.account || order.totalBudget !== TOTAL) {
        throw new Error(t("Test siparişi zincirde beklenen bütçeyle görünmüyor."));
      }
      if (step === 'deposit' && (order.usedBudget !== 0n || order.refundedBudget !== 0n)) {
        throw new Error(t("Yatırma sonrası sipariş bakiyesi beklenen durumda değil."));
      }
      if (step === 'release' || step === 'refund') {
        const paid = await client.readContract({ address: target, abi: ABI,
          functionName: 'participationPaid', args: [current.participationId] });
        if (!paid || order.usedBudget !== UNIT_PRICE || order.paidReferrals !== 1n) {
          throw new Error(t("Ödeme zincirde beklenen katılıma işlenmedi."));
        }
      }
      if (step === 'refund' && (order.refundedBudget !== UNIT_PRICE || order.active)) {
        throw new Error(t("İade sonrası sipariş durumu beklenen gibi değil."));
      }
    }
  };
  const finishReceipt = async (current: TestRun, step: Exclude<Step, 'complete'>, hash: `0x${string}`) => {
    if (!client) throw new Error(t("Arc Testnet bağlantısı hazır değil."));
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(t("Zincir işlemi başarısız oldu: ") + hash);
    const contract = step === 'deploy' ? receipt.contractAddress ?? undefined : current.contract;
    if (step === 'deploy' && !contract) throw new Error(t("Dağıtım işleminde sözleşme adresi bulunamadı."));
    await verifyState(current, step, contract);
    if (step === 'release') {
      const event = receipt.logs.find(log => {
        if (log.address.toLowerCase() !== contract?.toLowerCase()) return false;
        try {
          const decoded = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics });
          return decoded.eventName === 'PaymentReleased' &&
            decoded.args.participantShare === 19_000n && decoded.args.platformShare === 1_000n;
        } catch { return false; }
      });
      if (!event) throw new Error(t("Ödeme paylaşımı eventi 0.019 / 0.001 USDC olarak doğrulanamadı."));
    }
    const updated: TestRun = { ...current, contract, step: nextStep[step], pending: undefined,
      hashes: { ...current.hashes, [step]: hash } };
    save(updated);
    setMessage(t("{0} işlemi zincirde doğrulandı.", [step]));
  };
  const act = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const signer = requireReady();
      const current = run || newRun(signer);
      if (!run) save(current);
      if (current.pending) {
        await finishReceipt(current, current.pending.step as Exclude<Step, 'complete'>, current.pending.hash);
        return;
      }
      if (current.step === 'complete') return;
      const step = current.step;
      let hash: `0x${string}`;
      if (step === 'deploy') {
        hash = await deployContractAsync({ abi: ABI, bytecode: escrowTestBytecode,
          args: [USDC.address as `0x${string}`, signer, signer, signer], chainId: CHAIN_ID });
      } else {
        const contract = current.contract;
        if (!contract) throw new Error(t("Önce test sözleşmesini dağıtın."));
        if (step === 'approve') {
          const balance = await client!.readContract({ address: USDC.address as `0x${string}`, abi: USDC_ABI,
            functionName: 'balanceOf', args: [signer] });
          if (balance < TOTAL) throw new Error(t("Test için en az 0.04 USDC ve işlem ücreti gerekiyor."));
          hash = await writeContractAsync({ address: USDC.address as `0x${string}`, abi: USDC_ABI,
            functionName: 'approve', args: [contract, TOTAL], chainId: CHAIN_ID });
        } else if (step === 'deposit') {
          hash = await writeContractAsync({ address: contract, abi: ABI, functionName: 'depositOrder',
            args: [current.orderId, UNIT_PRICE, FEE_BPS, 2n, BigInt(Math.floor(Date.now() / 1000) + 86400)],
            chainId: CHAIN_ID });
        } else if (step === 'release') {
          hash = await writeContractAsync({ address: contract, abi: ABI, functionName: 'releasePayment',
            args: [current.orderId, current.participationId, signer], chainId: CHAIN_ID });
        } else {
          hash = await writeContractAsync({ address: contract, abi: ABI, functionName: 'refundBudget',
            args: [current.orderId, UNIT_PRICE], chainId: CHAIN_ID });
        }
      }
      const pending: TestRun = { ...current, pending: { step, hash } };
      save(pending);
      await finishReceipt(pending, step, hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const currentStep = run?.pending?.step ?? run?.step ?? 'deploy';
  const labels: Record<Step, string> = {
    deploy: t("1. Test sözleşmesini dağıt"), approve: '2. 0.04 USDC harcama izni ver',
    deposit: t("3. 0.04 USDC yatır"), release: t("4. 0.02 USDC ödeme dağıt"),
    refund: '5. Kalan 0.02 USDC iade et', complete: t("Test tamamlandı"),
  };
  return <div className="space-y-5 max-w-3xl">
    <h1 className="text-2xl font-bold">{translateText("Arc Testnet escrow testi")}</h1>
    <p>{t("Bu sayfa Carpan sözleşmesini ayrı bir test adresine dağıtır. Eski sözleşme")}<code className="break-all"> 0x9f0fde304d80e15e57f22f1c6f15e48dd6e16a9a</code> {t("yerinde kalır. Test cüzdanı sahip, oracle ve ücret alıcısı olur.")}</p>
    <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <p className="font-semibold">{t("İşlemler hakkında")}</p>
      <p>{t("Bu denetlenmemiş yerel kaynak koduyla yapılan testnet denemesidir. Beş ayrı cüzdan onayı ve Arc Testnet işlem ücretleri gerekir. Toplam 0.04 test USDC yatırılır; 0.02 USDC dağıtılır, kalan 0.02 USDC iade edilir. Deneme katılımı gerçek bir referans doğrulaması değildir.")}</p>
      <p>{t("Ödeme alıcısı ve platform ücret alıcısı bu testte aynı cüzdandır; zincir eventi 0.019 / 0.001 USDC paylaşımını ayrı ayrı gösterir.")}</p>
    </div>
    <ConnectKitButton />
    <p>{t("Cüzdan:")}{address || t("bağlı değil")} {t("· Ağ:")}{chainId || 'bilinmiyor'}</p>
    {run?.contract && <p>{t("Test sözleşmesi:")}<a className="underline break-all" target="_blank" rel="noreferrer"
      href={`https://explorer.testnet.arc.io/address/${run.contract}`}>{run.contract}</a></p>}
    <button className="rounded-lg px-5 py-3 font-semibold disabled:opacity-50"
      style={{ background: 'var(--accent)', color: '#07111f' }}
      disabled={busy || !address || chainId !== CHAIN_ID || run?.step === 'complete'}
      onClick={act}>{busy ? t("Zincir onayı bekleniyor…") : run?.pending ? t("Bekleyen işlemi kontrol et") : labels[currentStep]}</button>
    {message && <p className="text-emerald-400">{message}</p>}
    {error && <p className="text-red-400 break-words">{error}</p>}
    {run && <div className="space-y-1 text-sm">
      <p>{t("Sıradaki adım:")}{labels[currentStep]}</p>
      {Object.entries(run.hashes).map(([step, hash]) => <p key={step}>{step}: <a className="underline break-all"
        target="_blank" rel="noreferrer" href={`https://explorer.testnet.arc.io/tx/${hash}`}>{hash}</a></p>)}
      {run.pending && <p>{t("Bekleyen işlem:")}<a className="underline break-all" target="_blank" rel="noreferrer"
        href={`https://explorer.testnet.arc.io/tx/${run.pending.hash}`}>{run.pending.hash}</a></p>}
    </div>}
  </div>;
}
