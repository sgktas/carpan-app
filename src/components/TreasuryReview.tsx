import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../api';
import {useI18n} from '../i18n/index';
import type {ExplorerResult,ExplorerRow,NetworkDirectory} from '../chain-explorer';
import {TREASURY_CHAINS,TREASURY_PILOT,summarizeTreasury,treasuryAmount,usdcPage,validTreasuryAddress} from '../treasury-review';
import {PaymentContext} from './PaymentContext';
import './treasury-review.css';

type Snapshot={chain:string;wallet:string;page:ExplorerResult;rows:ExplorerRow[]};
export function TreasuryReview(){
  const {language}=useI18n(),text=(en:string,tr:string)=>language==='tr'?tr:en;
  const [directory,setDirectory]=useState<NetworkDirectory|null>(null),[directoryError,setDirectoryError]=useState('');
  const [wallet,setWallet]=useState(''),[chain,setChain]=useState('5042'),[snapshots,setSnapshots]=useState<Snapshot[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState<string|null>(null);
  const generation=useRef(0),loading=useRef(false);
  useEffect(()=>{let active=true;void api.networkDirectory().then(d=>{if(active)setDirectory(d);}).catch(()=>{if(active)setDirectoryError(text('Network directory unavailable.','Ağ dizini alınamadı.'));});return()=>{active=false;generation.current++;};},[]);
  const chosen=TREASURY_CHAINS.find(c=>c.id===chain)!,current=snapshots.find(s=>s.chain===chain&&s.wallet===wallet.trim().toLowerCase());
  const rows=snapshots.filter(s=>s.wallet===wallet.trim().toLowerCase()).flatMap(s=>s.rows),summary=summarizeTreasury(rows,wallet);
  async function load(event?:FormEvent,more=false){
    event?.preventDefault();if(loading.current)return;
    const address=wallet.trim().toLowerCase();if(!validTreasuryAddress(address)){setError(text('Enter a valid EVM wallet address.','Geçerli bir EVM cüzdan adresi gir.'));return;}
    if(!directory?.networks.some(n=>n.id===chain&&n.isTestnet===false)){setError(text('This mainnet is not available from the provider directory.','Bu mainnet sağlayıcı dizininde mevcut değil.'));return;}
    const id=++generation.current;loading.current=true;setBusy(true);setError('');const selectedChain=chain;
    try{
      const page=await api.explorerData(selectedChain,{kind:'transfers',address,type:'ERC-20',...(more&&current?.page.nextCursor?{cursor:current.page.nextCursor}:{})});
      if(id!==generation.current)return;
      if(page.network.id!==selectedChain)throw Error('Provider returned a different chain.');
      const filtered=usdcPage(page.items,selectedChain,address),merged=usdcPage([...(more?current?.rows||[]:[]),...filtered],selectedChain,address);
      setSnapshots(old=>[...old.filter(s=>s.chain!==selectedChain||s.wallet!==address),{chain:selectedChain,wallet:address,page,rows:merged}]);setExpanded(null);
    }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:text('Source unavailable.','Kaynak alınamadı.'));}
    finally{loading.current=false;if(id===generation.current)setBusy(false);}
  }
  const short=(v:string)=>`${v.slice(0,8)}…${v.slice(-6)}`;
  async function inspectPilot(){
    if(loading.current)return;const id=++generation.current;loading.current=true;setBusy(true);setError('');setWallet(TREASURY_PILOT.wallet);setChain(TREASURY_PILOT.chain);setExpanded(null);
    try{const page=await api.explorerData(TREASURY_PILOT.chain,{kind:'txTransfers',hash:TREASURY_PILOT.hash});if(id!==generation.current)return;
      if(page.network.id!==TREASURY_PILOT.chain)throw Error('Provider returned a different chain.');
      setSnapshots(old=>[...old.filter(s=>s.wallet!==TREASURY_PILOT.wallet||s.chain!==TREASURY_PILOT.chain),{chain:TREASURY_PILOT.chain,wallet:TREASURY_PILOT.wallet,page,rows:usdcPage(page.items,TREASURY_PILOT.chain,TREASURY_PILOT.wallet)}]);
    }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'Provider unavailable.');}finally{loading.current=false;if(id===generation.current)setBusy(false);}
  }
  return <main className="tr-review"><header><h1>{text('Review business USDC payments','İşletme USDC ödemelerini incele')}</h1><p>{text('Start with a wallet. Inspect payments, research a counterparty, then review Arc records in your private workspace.','Bir cüzdanla başla. Ödemeleri incele, karşı tarafı araştır, ardından Arc kayıtlarını özel çalışma alanında değerlendir.')}</p></header>
    <ol className="tr-steps"><li>{text('1. Load payments','1. Ödemeleri yükle')}</li><li>{text('2. Explain the movement','2. Hareketi incele')}</li><li><Link to="/finance?view=operations">{text('3. Review and export Arc records','3. Arc kayıtlarını incele ve dışa aktar')}</Link></li></ol>
    <button disabled={busy} onClick={()=>void inspectPilot()}>{text('Inspect the real 0.10 USDC pilot','Gerçek 0,10 USDC pilotunu incele')}</button><p className="tr-note">{text('Reads the existing mainnet payment between the builder’s own wallets through Blockscout. No new transaction or wallet signature. This is a controlled pilot, not customer revenue.','Geliştiricinin kendi cüzdanları arasındaki mevcut mainnet ödemesini Blockscout üzerinden okur. Yeni işlem veya cüzdan imzası gerekmez. Kontrollü pilottur; müşteri geliri değildir.')}</p>
    <form onSubmit={load}><label>{text('Business wallet address','İşletme cüzdan adresi')}<input required pattern="0x[0-9a-fA-F]{40}" value={wallet} disabled={busy} onChange={e=>{setWallet(e.target.value);setExpanded(null);setError('');}} placeholder="0x…"/></label><label>{text('Network','Ağ')}<select disabled={busy} value={chain} onChange={e=>{setChain(e.target.value);setExpanded(null);setError('');}}>{TREASURY_CHAINS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button disabled={busy||!directory}>{busy?text('Loading…','Yükleniyor…'):text('Load Blockscout payments','Blockscout ödemelerini yükle')}</button></form>
    {(error||directoryError)&&<p role="alert">{error||directoryError}</p>}
    <p className="tr-note">{text('One provider page per click; only Circle-issued USDC contracts count. Coverage is partial, not a complete wallet history or balance. Networks are loaded individually. Gas, self transfers and other tokens are excluded from incoming/outgoing totals.','Her tıklamada bir kaynak sayfası; yalnız Circle USDC kontratları sayılır. Kapsam kısmidir; tam cüzdan geçmişi veya bakiye değildir. Ağlar tek tek yüklenir. Gas, kendine transferler ve diğer tokenlar giriş/çıkış toplamına eklenmez.')}</p>
    <div className="tr-totals"><article>{text('Loaded incoming','Yüklenen giriş')}<strong>{treasuryAmount(summary.incoming)} USDC</strong></article><article>{text('Loaded outgoing','Yüklenen çıkış')}<strong>{treasuryAmount(summary.outgoing)} USDC</strong></article><article>{text('Observed counterparties','Görülen karşı taraflar')}<strong>{summary.peers.length}</strong></article></div>
    <p>{text('Loaded networks','Yüklenen ağlar')}: {snapshots.filter(s=>s.wallet===wallet.trim().toLowerCase()).map(s=>s.page.network.name).join(', ')||'—'}</p>
    {current&&<><p>{current.page.source} · {current.page.cached?text('Cached','Önbellek'):text('Provider read','Kaynak okuması')} · {current.page.fetchedAt}</p>
      {!current.rows.length&&<p>{text('No eligible USDC transfers in the loaded pages. Continue to older pages if available.','Yüklenen sayfalarda uygun USDC transferi bulunmadı. Varsa eski sayfalara devam et.')}</p>}
      <p className="tr-mobile-hint">{text("Swipe the table horizontally to see payment evidence.","Ödeme kanıtını görmek için tabloyu yatay kaydır.")}</p><div className="tr-table" tabIndex={0} role="region" aria-label={text("USDC payment evidence table","USDC ödeme kanıt tablosu")}><table><thead><tr><th>{text('Date / UTC','Tarih / UTC')}</th><th>{text('From → To','Gönderen → Alıcı')}</th><th>USDC</th><th>{text('Evidence','Kanıt')}</th></tr></thead><tbody>{current.rows.map(row=><tr key={row.id}><td>{row.timestamp||'—'}</td><td><button onClick={()=>setExpanded(expanded===row.id?null:row.id)}>{short(row.from!)} → {short(row.to!)}</button>{expanded===row.id&&<PaymentContext chain={chain} address={row.from===current.wallet?row.to!:row.from!} token={chosen.token}/>}</td><td>{treasuryAmount(row.raw!)}</td><td><Link to={`/arc?view=explorer&chain=${chain}&hash=${row.hash}&address=${current.wallet}&data=tx`}>{text('Terminal','Terminal')}</Link>{' · '}<a href={`${current.page.network.explorer}/tx/${row.hash}`} target="_blank" rel="noopener noreferrer">Blockscout Explorer</a></td></tr>)}</tbody></table></div>
      {current.page.nextCursor&&current.page.kind==='transfers'&&<button disabled={busy} onClick={()=>void load(undefined,true)}>{text('Load next provider page','Sonraki kaynak sayfasını yükle')}</button>}</>}
    {!!summary.peers.length&&<section><h2>{text('Who paid whom?','Kim kime ödeme yaptı?')}</h2><p>{text('Grouped from loaded token events. Payment purpose, ownership and bridge matching require your review.','Yüklenen token olaylarından gruplandı. Ödeme amacı, sahiplik ve köprü eşleştirmesi kullanıcı incelemesi gerektirir.')}</p>{summary.peers.slice(0,20).map(peer=><p key={peer.address}><code>{peer.address}</code> · {peer.count} {text('transfers','transfer')} · +{treasuryAmount(peer.incoming)} / −{treasuryAmount(peer.outgoing)} USDC</p>)}</section>}
    <p className="tr-note">{text('This public research view does not save private business records. Arc receipt verification and business approval happen in Business movements; other chains are research-only at this stage.','Bu herkese açık araştırma görünümü özel işletme kaydı oluşturmaz. Arc makbuz doğrulaması ve işletme onayı İşletme hareketlerinde yapılır; diğer zincirler bu aşamada araştırma amaçlıdır.')}</p>
  </main>;
}
