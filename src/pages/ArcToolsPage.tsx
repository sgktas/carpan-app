import {CarpanHomeLink} from '../components/CarpanHomeLink';
import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { WalletConnectionButton } from '../components/WalletConnectionButton';
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import { ArrowLeft, ArrowUpRight, Check, Copy, ExternalLink, Wallet } from 'lucide-react';
import { erc20Abi, formatUnits, zeroAddress } from 'viem';
import { toast } from 'sonner';
import { CarpanEmblem } from '../components/CarpanEmblem';
import { getUsdc } from '../onchain-facts';
import { formatUsdc } from '../onchain-money';
import { paymentDetails, paymentRequestFromSearch, paymentRequestUrl } from '../arc-payment';
import './arc-tools.css';

const ARC_TESTNET = 5042002;
const USDC = getUsdc(ARC_TESTNET)?.address as `0x${string}`;
const EXPLORER = 'https://explorer.testnet.arc.io';

type Preview = { to: `0x${string}`; amount: string; rawAmount: bigint; fee: bigint };

function feeLabel(raw: bigint) {
  const value = Number(formatUnits(raw, 18));
  return value > 0 && value < 0.000001 ? '<0,000001 USDC' : `≈ ${value.toLocaleString(getLocale(), { maximumFractionDigits: 6 })} USDC`;
}

export function ArcToolsPage() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: ARC_TESTNET });
  const [tab, setTab] = useState<'send' | 'request'>('send');
  const [initialRequest] = useState(() => {
    try { return paymentRequestFromSearch(window.location.search); }
    catch { return null; }
  });
  const [recipient, setRecipient] = useState(initialRequest?.to || '');
  const [amount, setAmount] = useState(initialRequest?.amount || '');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestLink, setRequestLink] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [transactionHash, setTransactionHash] = useState('');
  const { data: balance, refetch: refreshBalance, isPending: balanceLoading } = useReadContract({
    address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address || zeroAddress],
    chainId: ARC_TESTNET, query: { enabled: Boolean(address) },
  });

  const prepare = async () => {
    if (!address || !publicClient) throw new Error(t("Önce cüzdan bağlayın."));
    const details = paymentDetails(recipient, amount, address);
    const currentBalance = await publicClient.readContract({ address: USDC, abi: erc20Abi,
      functionName: 'balanceOf', args: [address] });
    if (currentBalance < details.rawAmount) throw new Error(t("USDC bakiyesi bu miktar için yetersiz."));
    const gas = await publicClient.estimateContractGas({ address: USDC, abi: erc20Abi,
      functionName: 'transfer', args: [details.to, details.rawAmount], account: address });
    const feeData = await publicClient.estimateFeesPerGas();
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (!gasPrice) throw new Error(t("Ağ ücreti hesaplanamadı. Tekrar deneyin."));
    const fee = gas * gasPrice;
    const nativeBalance = await publicClient.getBalance({ address });
    // Arc exposes one USDC pool in two decimal views. The 18-decimal view is
    // used only here to check transfer plus gas, never as a second UI balance.
    if (nativeBalance < details.rawAmount * 1_000_000_000_000n + fee * 12n / 10n) {
      throw new Error(t("Transfer ve ağ ücreti için yeterli USDC yok. Daha küçük bir miktar deneyin."));
    }
    return { ...details, fee };
  };

  const showPreview = async () => {
    setBusy(true); setTransactionHash('');
    try { setPreview(await prepare()); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : t("İşlem hazırlanamadı.")); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!preview || !address || !publicClient) return;
    if (chainId !== ARC_TESTNET) { toast.error(t("Cüzdanı Arc Testnet ağına geçirin.")); return; }
    setBusy(true);
    try {
      const current = await prepare();
      if (current.to !== preview.to || current.rawAmount !== preview.rawAmount) {
        throw new Error(t("Alıcı veya miktar değişti. İşlemi yeniden gözden geçirin."));
      }
      const hash = await writeContractAsync({ address: USDC, abi: erc20Abi,
        functionName: 'transfer', args: [current.to, current.rawAmount], chainId: ARC_TESTNET });
      setTransactionHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(t("İşlem zincirde başarısız oldu."));
      setPreview(null);
      setRecipient(''); setAmount('');
      await refreshBalance();
      toast.success(t("USDC transferi Arc Testnet üzerinde tamamlandı."));
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : t("Transfer tamamlanamadı.")); }
    finally { setBusy(false); }
  };

  const createRequest = () => {
    if (!address) { toast.error(t("Ödeme isteği için cüzdan bağlayın.")); return; }
    try { setRequestLink(paymentRequestUrl(window.location.origin, address, requestAmount)); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : t("Ödeme isteği oluşturulamadı.")); }
  };

  const copyRequest = async () => {
    try { await navigator.clipboard.writeText(requestLink); toast.success(t("Ödeme bağlantısı kopyalandı.")); }
    catch { toast.error(t("Bağlantı kopyalanamadı. Metni elle kopyalayabilirsiniz.")); }
  };

  return <div className="arc-tool">
    <header className="arc-tool-header"><div className="arc-tool-wrap arc-tool-nav">
      <CarpanHomeLink className="arc-tool-brand"><CarpanEmblem size={35}/>Carpan</CarpanHomeLink>
      <div className="arc-tool-links"><Link to="/arc" className="arc-tool-back"><ArrowLeft size={16}/> {t("Arc Terminali")}</Link>
        <Link to="/" className="arc-tool-back">{t("Ana sayfa")}</Link></div>
    </div></header>
    <main className="arc-tool-wrap">
      <div className="arc-tool-intro"><span className="arc-tool-kicker">{t("CARPAN · ARC ARAÇLARI")}</span>
        <h1>{translateText("Arc’ta USDC")}<br/><em>{t("gönder ve iste.")}</em></h1>
        <p>{t("Cüzdanından USDC gönder veya sana ödeme yapılması için paylaşılabilir bağlantı oluştur. Hesap açmak gerekmez.")}</p>
        <div className="arc-tool-network">{t("Arc Testnet · Deneme USDC")}<a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">{t("Test USDC edin")}<ArrowUpRight size={13}/></a></div>
      </div>
      <div className="arc-tool-grid">
        <section className="arc-tool-card arc-tool-wallet" aria-label={t("Arc cüzdanı")}>
          <div className="arc-tool-card-title"><Wallet size={20}/><h2>{t("Cüzdanın")}</h2></div>
          {!address ? <><p>{t("Bakiyeni görmek ve işlem yapmak için cüzdan bağla.")}</p><WalletConnectionButton/></> : <>
            <div className="arc-tool-address">{address}</div>
            <div className="arc-tool-balance"><span>{t("Arc Testnet bakiyesi")}</span><strong>{balanceLoading ? t("Yükleniyor…") : balance === undefined ? '—' : `${formatUsdc(balance)} USDC`}</strong></div>
            <div className="arc-tool-wallet-actions"><button onClick={() => refreshBalance()}>{translateText("Bakiyeyi yenile")}</button>
              <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer">{t("Explorer’da gör")}<ExternalLink size={13}/></a></div>
            {chainId !== ARC_TESTNET && <div className="arc-tool-network-alert"><span>{t("İşlem için Arc Testnet ağına geç.")}</span><button onClick={() => switchChainAsync({ chainId: ARC_TESTNET }).catch(() => toast.error(t("Ağ değiştirilemedi.")))}>{t("Ağı değiştir")}</button></div>}
          </>}
        </section>

        <section className="arc-tool-card arc-tool-workspace" aria-label={t("USDC işlemleri")}>
          <div className="arc-tool-tabs" role="tablist" aria-label={t("İşlem türü")}>
            <button role="tab" aria-selected={tab === 'send'} className={tab === 'send' ? 'active' : ''} onClick={() => setTab('send')}>{t("USDC gönder")}</button>
            <button role="tab" aria-selected={tab === 'request'} className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}>{t("Ödeme iste")}</button>
          </div>
          {tab === 'send' ? <div className="arc-tool-form">
            {initialRequest && <div className="arc-tool-notice">{t("Ödeme isteği bağlantısından geldin. Alıcıyı ve miktarı cüzdan onayından önce kontrol et.")}</div>}
            <label htmlFor="arc-recipient">{t("Alıcı cüzdan adresi")}</label>
            <input id="arc-recipient" value={recipient} onChange={event => { setRecipient(event.target.value); setPreview(null); }} placeholder="0x…" spellCheck={false} autoComplete="off"/>
            <label htmlFor="arc-amount">{translateText("Miktar · USDC")}</label>
            <input id="arc-amount" value={amount} onChange={event => { setAmount(event.target.value); setPreview(null); }} placeholder={t("Örn. 2.50")} inputMode="decimal" autoComplete="off"/>
            {!preview ? <button className="arc-tool-primary" onClick={showPreview} disabled={!address || busy || !recipient || !amount}>{t("İşlemi gözden geçir")}<ArrowUpRight size={16}/></button> :
              <div className="arc-tool-preview"><h3>{t("Gönderimi onayla")}</h3>
                <dl><div><dt>{t("Alıcı")}</dt><dd>{preview.to}</dd></div><div><dt>{translateText("Miktar")}</dt><dd>{preview.amount} USDC</dd></div><div><dt>{t("Tahmini ağ ücreti")}</dt><dd>{feeLabel(preview.fee)}</dd></div><div><dt>{t("Ağ")}</dt><dd>Arc Testnet</dd></div></dl>
                <p>{t("Transfer onaylandıktan sonra geri alınamaz. Ağ ücreti aynı USDC bakiyesinden ödenir.")}</p>
                <div className="arc-tool-preview-actions"><button onClick={() => setPreview(null)} disabled={busy}>{t("Düzenle")}</button><button className="arc-tool-primary" onClick={send} disabled={busy || chainId !== ARC_TESTNET}>{busy ? t("İşlem bekleniyor…") : t("Cüzdanda onayla")}</button></div>
              </div>}
            {transactionHash && <a className="arc-tool-tx" href={`${EXPLORER}/tx/${transactionHash}`} target="_blank" rel="noopener noreferrer"><Check size={16}/> {t("İşlemi Arc Explorer’da gör")}<ExternalLink size={14}/></a>}
          </div> : <div className="arc-tool-form">
            <p className="arc-tool-form-intro">{t("Miktarı belirle, bağlantıyı paylaş. Bağlantıyı açan kişi alıcı adresini görür ve ödemeyi kendi cüzdanında onaylar.")}</p>
            <label htmlFor="arc-request-amount">{t("İstenecek miktar · USDC")}</label>
            <input id="arc-request-amount" value={requestAmount} onChange={event => { setRequestAmount(event.target.value); setRequestLink(''); }} placeholder={t("Örn. 5")} inputMode="decimal" autoComplete="off"/>
            <button className="arc-tool-primary" onClick={createRequest} disabled={!address || !requestAmount}>{t("Bağlantı oluştur")}<ArrowUpRight size={16}/></button>
            {requestLink && <div className="arc-tool-request-result"><span>{t("Ödeme bağlantın")}</span><code>{requestLink}</code><button onClick={copyRequest}><Copy size={15}/> {t("Bağlantıyı kopyala")}</button></div>}
          </div>}
        </section>
      </div>
      <p className="arc-tool-footnote">{t("Bu araç Arc Testnet üzerinde çalışır. Ödeme bağlantısı bir ödeme garantisi değildir; gelen ödemeyi cüzdanında veya Arc Explorer’da kontrol et.")}</p>
    </main>
  </div>;
}
