import {Link} from 'react-router-dom';
import {ArrowUpRight,ExternalLink,FileText,Layers3,ShieldCheck} from 'lucide-react';
import {useI18n} from '../i18n';
import type {EcosystemAsset,EcosystemEntry} from '../ecosystem';
import {EcosystemUpcoming,EcosystemProjectNotifications} from './EcosystemUpdates';
import './ecosystem-research.css';

export function EcosystemResearchProfile({project,assets,saved,ready}:{project:EcosystemEntry;assets:EcosystemAsset[];saved:string[];ready:boolean}){
 const {language}=useI18n();
 const s=(en:string,tr:string)=>language==='en'?en:tr;
 const profile=project.profile;
 const tokens=assets.filter(a=>a.projectId===project.id);
 const external=(url:string,label:string)=><a href={url} target="_blank" rel="noopener noreferrer">{label}<ExternalLink size={13}/></a>;
 const sources=[...project.sources];
 for(const item of profile?.resources||[])if(!sources.some(source=>source.url===item.url))sources.push({title:item.title[language],url:item.url,checkedAt:project.sources[0]?.checkedAt||'2026-10-09'});
 for(const item of [...project.research?.funding.sources||[],...project.research?.milestones.map(m=>m.source)||[]])if(!sources.some(source=>source.url===item.url))sources.push(item);
 return <>
  <nav className="eco-profile-nav" aria-label={s('Project research sections','Proje araştırma bölümleri')}>
   <a href="#overview">{s('Overview','Genel bakış')}</a><a href="#research">{s('Arc footprint','Arc bağlantıları')}</a><a href="#development">{s('Funding & development','Yatırım ve geliştirme')}</a><a href="#updates">{s('Announcements','Duyurular')}</a><a href="#sources">{s('Sources','Kaynaklar')}</a>
   <span>{s('Research snapshot','Araştırma incelemesi')} · {project.research?.checkedAt||project.sources[0]?.checkedAt}</span>
  </nav>
  <div className="eco-research-layout">
   <div className="eco-research-primary">
    <section className="eco-panel eco-brief" id="overview">
     <span className="eco-kicker">{s('PROJECT BRIEF','PROJE ÖZETİ')}</span><h2>{s('What it does','Ne sunuyor?')}</h2>
     <p className="eco-overview-copy">{profile?.overview[language]||project.description[language]}</p>
     {!!profile?.capabilities.length&&<div className="eco-capabilities">{profile.capabilities.map((item,index)=><span key={index}>{item[language]}</span>)}</div>}
     <div className="eco-arc-context"><ShieldCheck size={19}/><div><h3>{s('How it relates to Arc','Arc ile ilişkisi')}</h3><p>{profile?.arcContext[language]||s('Review the official sources and address evidence for this project.','Bu projenin resmî kaynaklarını ve adres kanıtlarını incele.')}</p></div></div>
    </section>
    <section className="eco-panel eco-evidence-panel" id="research">
     <div className="eco-section-heading"><h2>{s('Arc footprint','Arc bağlantıları')}</h2><span>{project.id==='eco_arc'?s('NETWORK RESEARCH','AĞ ARAŞTIRMASI'):`${project.addresses.length} ${s('SOURCED ADDRESSES','KAYNAKLI ADRES')}`}</span></div>
     {project.id==='eco_arc'?<div className="eco-profile-assets"><p className="eco-muted">{s('Research the network through transfers, documented assets and the explorer. Public token launch and supply-market data are not inferred from the network roadmap.','Ağı transferler, belgelenmiş varlıklar ve gezgin üzerinden incele. Ağ yol haritasından halka açık token lansmanı veya arz/piyasa verisi çıkarımı yapılmaz.')}</p><div className="eco-asset-chips"><Link to="/arc">{s('Arc Terminal','Arc Terminali')}<ArrowUpRight size={13}/></Link><Link to="/ecosystem?view=tokens">{s('Arc markets','Arc piyasaları')}<ArrowUpRight size={13}/></Link></div></div>:<>
     <p className="eco-muted">{s('Inspect the current chain evidence in Terminal, then return to the project’s sources.','Güncel zincir kanıtını Terminal’de incele, ardından proje kaynaklarına dön.')}</p>
     {project.addresses.length?project.addresses.map(a=><article className="eco-address" key={a.address}>
      <div><strong>{a.label}</strong><span>Arc {a.chainId===5042?'Mainnet':'Testnet'}</span><code>{a.address}</code></div>
      <div>{a.chainId===5042?<><Link className="eco-terminal-link" to={`/arc/contracts/${a.address}`}>Terminal<ArrowUpRight size={14}/></Link><Link to={`/arc?view=flow&address=${a.address}`}>{s('Flow map','Akış haritası')}<ArrowUpRight size={14}/></Link></>:external(`https://explorer.testnet.arc.io/address/${a.address}`,s('Testnet explorer','Testnet gezgini'))}{external(a.sourceUrl,s('Address source','Adres kaynağı'))}</div>
     </article>):<div className="eco-no-contract"><Layers3 size={22}/><div><strong>{s('No sourced Arc contract in this snapshot','Bu incelemede kaynaklı Arc kontratı yok')}</strong><p>{s('The project’s official resources remain available. No contract is inferred from its name or token on another chain.','Projenin resmî kaynakları kullanılabilir. Adından veya başka ağdaki tokenından kontrat çıkarımı yapılmaz.')}</p></div></div>}
     <div className="eco-profile-assets"><h3>{s('Arc token contracts','Arc token kontratları')}</h3>{tokens.length?<div className="eco-asset-chips">{tokens.map(a=><Link key={a.address} to={`/arc/contracts/${a.address}`}>{a.symbol}<ArrowUpRight size={14}/></Link>)}</div>:<p className="eco-muted">{s('No Arc token contract sourced for this entry. Tokens on other networks are outside this snapshot.','Bu kayıt için kaynaklı Arc token kontratı yok. Diğer ağlardaki tokenlar bu incelemenin kapsamı dışında.')}</p>}<Link className="eco-market-link" to="/ecosystem?view=tokens">{s('Open Arc asset directory','Arc varlık kataloğunu aç')}<ArrowUpRight size={14}/></Link></div>
    </>}
    </section>
    {project.research&&<section className="eco-panel eco-funding-panel" id="development">
     <div className="eu-dossier-heading"><h2 className="eu-research-heading">{s('Funding & development','Yatırım ve geliştirme')}</h2><small className="eu-research-date">{s('Official sources reviewed','Resmî kaynak incelemesi')} · {project.research.checkedAt}</small></div>
     <div className="eu-research-funding"><h3>{s('Funding context','Yatırım bağlamı')}</h3><p>{project.research.funding.summary[language]}</p>{project.research.funding.parentId&&<Link className="eu-parent-financing" to={`/ecosystem/${project.research.funding.parentId}#development`}>{s('View Circle company financing','Circle şirket finansmanını incele')}<ArrowUpRight size={13}/></Link>}
      {!!project.research.funding.rounds.length&&<div className="eu-funding-timeline">{project.research.funding.rounds.map(round=><article className="eu-funding-round" key={round.source.url}>
       <div className="eu-timeline-date"><span>{s('Source published','Kaynak yayın tarihi')}</span><time dateTime={round.announcedAt}>{round.announcedAt}</time></div>
       <div className="eu-round-content"><div className="eu-round-title"><div><h4>{round.title[language]}</h4><strong>{new Intl.NumberFormat(language==='en'?'en-US':'tr-TR',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(round.amountUsd)}</strong></div>{external(round.source.url,s('Financing source','Finansman kaynağı'))}</div><details className="eu-investor-details"><summary>{s('Investors named in source','Kaynakta adı geçen yatırımcılar')}<span>{round.investors.length}</span></summary><div>{round.investors.map(investor=><span key={investor}>{investor}</span>)}</div></details></div>
      </article>)}</div>}
     </div>
     <h3>{s('Development & roadmap','Geliştirme ve yol haritası')}</h3><div className="eu-development-timeline">{project.research.milestones.map((m,index)=><article className="eu-milestone" key={index}>
      <div className="eu-milestone-marker" aria-hidden="true">{String(index+1).padStart(2,'0')}</div><div><div className="eu-milestone-meta"><span className="eu-state">{m.status==='released'?s('Released · source announcement','Yayında · kaynak duyurusu'):m.status==='planned'?s('Announced plan','Duyurulan plan'):s('Documented capability','Belgelenmiş işlev')}</span>{m.date&&<small>{m.date}</small>}</div><h3>{m.title[language]}</h3><p>{m.summary[language]}</p>{external(m.source.url,s('Development source','Geliştirme kaynağı'))}</div>
     </article>)}</div>
    </section>}
    <EcosystemUpcoming projects={[project]} projectId={project.id}/>
   </div>
   <aside className="eco-research-sidebar">
    <section className="eco-panel eco-next-step"><span className="eco-kicker">{s('CONTINUE YOUR RESEARCH','ARAŞTIRMANA DEVAM ET')}</span><h2>{s('From discovery to action.','Keşiften kullanıma.')}</h2><p className="eco-muted">{s('Use Carpan’s existing tools to explore Arc.','Arc’ı incelemek için Carpan’ın araçlarını kullan.')}</p><div>{profile?.actions.map(item=><Link key={item.to} to={item.to}>{item.label[language]}<ArrowUpRight size={16}/></Link>)}</div><Link className="eco-watchlist-link" to="/ecosystem?view=watchlist">{s('My project watchlist','Proje takip listem')}<ArrowUpRight size={14}/></Link></section>
    <section className="eco-panel eco-sources-panel" id="sources"><div className="eco-section-heading"><h2>{s('Research sources','Araştırma kaynakları')}</h2><FileText size={18}/></div>{sources.map((source,index)=><article className="eco-source" key={source.url}><span className="eco-source-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><div>{external(source.url,language==='tr'?({'Arc contract reference':'Arc kontrat referansı','Arc ecosystem directory':'Arc ekosistem kataloğu','Arc integration documentation':'Arc entegrasyon belgeleri','Official website':'Resmî site'}[source.title]||source.title):source.title)}<small>{new URL(source.url).hostname}<br/>{s('Reviewed','İncelendi')} {source.checkedAt}</small></div></article>)}{project.logo&&<div className="eco-logo-attribution">{external(project.logo.sourceUrl,s('Logo source','Logo kaynağı'))}</div>}<p className="eco-muted eco-source-note">{s('Listings and source reviews do not imply a partnership or security endorsement.','Kayıtlar ve kaynak incelemeleri ortaklık veya güvenlik onayı anlamına gelmez.')}</p></section>
    <EcosystemProjectNotifications projects={[project]} saved={saved} ready={ready} projectId={project.id}/>
   </aside>
  </div>
 </>;
}
