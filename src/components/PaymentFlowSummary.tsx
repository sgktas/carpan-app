import type {ExplorerRow} from '../chain-explorer';
import {useI18n} from '../i18n/index';
import {summarizeTreasury,treasuryAmount,usdcPage} from '../treasury-review';
export function PaymentFlowSummary({rows,chain,wallet}:{rows:ExplorerRow[];chain:string;wallet:string}){
  const {language}=useI18n(),tr=language==='tr';const filtered=usdcPage(rows,chain,wallet),summary=summarizeTreasury(filtered,wallet);
  if(!filtered.length)return null;
  return <section className="cx-coverage"><h3>{tr?'Ödeme ilişkileri':'Payment relationships'}</h3><p>{tr?'Yüklenen Circle USDC olayları':'Loaded Circle USDC events'}: +{treasuryAmount(summary.incoming)} / −{treasuryAmount(summary.outgoing)} USDC</p>
    {summary.peers.slice(0,10).map(peer=><p key={peer.address}><code>{peer.address}</code> · {peer.count} {tr?'transfer':'transfers'} · +{treasuryAmount(peer.incoming)} / −{treasuryAmount(peer.outgoing)}</p>)}
    <p>{tr?'Yalnız yüklenen sayfalardan hesaplanır. Kendine transfer ve gas giriş/çıkışa eklenmez. Sahiplik ve ödeme amacı zincir olayından belirlenemez; Finans incelemesi gerekir.':'Computed only from loaded pages. Self transfers and gas are excluded from incoming/outgoing. Events alone cannot establish ownership or business purpose; review in Finance.'}</p>
  </section>;
}
