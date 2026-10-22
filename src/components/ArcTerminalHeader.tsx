import {CarpanHomeLink} from './CarpanHomeLink';
/* carpan-localized */

import {useEffect,useRef,useState, type FormEvent} from 'react';
import {Link, useNavigate, useLocation} from 'react-router-dom';
import {Search} from 'lucide-react';
import {isAddress} from 'viem';
import {CarpanEmblem} from './CarpanEmblem';
import {BRAND} from '../brand';
import {useI18n} from '../i18n';
import {CarpanHeaderControls} from './CarpanHeaderControls';

export function ArcTerminalHeader({active='overview'}:{active?:string}) {
  const [query,setQuery]=useState('');
  const navigate=useNavigate();const searchRef=useRef<HTMLInputElement>(null);
  const {t}=useI18n();
  const location=useLocation();
  const researchChain='5042';
  const overviewModule=['about','api','account','dashboard'].includes(active);
  const financeModule=active==='finance'||active==='bridge'||active==='collections'||active==='invoices';
  const ecosystemModule=location.pathname.startsWith('/ecosystem')||location.pathname.startsWith('/onchain/projects');
  const communityModule=ecosystemModule||['/projects','/referral-center','/my-links','/participations','/incoming'].includes(location.pathname);
  const selected=['contracts','verified','token','labels','explorer'].includes(active)?'overview':active;
  useEffect(()=>{const focus=(event:KeyboardEvent)=>{const target=event.target as HTMLElement;if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(target.tagName)&&!target.isContentEditable){event.preventDefault();searchRef.current?.focus();}};window.addEventListener('keydown',focus);return()=>window.removeEventListener('keydown',focus);},[]);
  function search(event:FormEvent){event.preventDefault();const value=query.trim();if(!value)return;
    if(/^0x[0-9a-f]{64}$/i.test(value)){navigate(`/arc?view=explorer&chain=${researchChain}&hash=${encodeURIComponent(value)}&data=tx`);return;}
    navigate(active==='explorer'?`/arc?view=explorer&chain=${researchChain}&${isAddress(value)?'address':/^0x[0-9a-f]{64}$/i.test(value)?'hash':'q'}=${encodeURIComponent(value)}&data=${isAddress(value)?'transfers':/^0x[0-9a-f]{64}$/i.test(value)?'tx':'search'}`:isAddress(value)?`/arc/addresses/${value.toLowerCase()}`:
      /^usdc$/i.test(value)?'/arc?view=token':`/arc?view=contracts&q=${encodeURIComponent(value)}`);
  }
  return <header className="at-header" data-module={financeModule?'finance':communityModule?'social':['dashboard','account'].includes(active)?'account':'terminal'}>
    <CarpanHomeLink className="at-brand" aria-label={BRAND.name}><CarpanEmblem size={30}/><span><strong>{BRAND.wordmark}</strong></span></CarpanHomeLink>
    <nav className="at-navigation" aria-label={overviewModule||ecosystemModule?t("Carpan çalışma alanları"):communityModule?t("Ekosistem modülleri"):financeModule?t("Finans modülleri"):t("Terminal modülleri")}>
      {overviewModule||ecosystemModule?<><Link to="/finance">{t("Finans")}</Link><Link to="/arc">{t("Terminal")}</Link><Link to="/ecosystem" aria-current={ecosystemModule?'page':undefined}>{t("Ecosystem")}</Link><Link to="/developers" aria-current={active==='api'?'page':undefined}>API</Link></>:communityModule?<>
        <Link to="/ecosystem" aria-current={location.pathname.startsWith('/ecosystem')?'page':undefined}>{t('Ecosystem')}</Link>
        <Link to="/referral-center" aria-current={location.pathname==='/referral-center'?'page':undefined}>{t('Referans merkezi')}</Link>
        <Link to="/my-links" aria-current={location.pathname==='/my-links'?'page':undefined}>{t('Kartlarım')}</Link>
        <Link to="/projects" aria-current={location.pathname==='/projects'?'page':undefined}>{t('Proje yönetimi')}</Link>
      </>:financeModule?<>
        <Link to="/finance" aria-current={active==='finance'?'page':undefined}>{t('Finans paneli')}</Link>
        <Link to="/finance/collections" aria-current={active==='collections'||active==='invoices'?'page':undefined}>{t('Tahsilatlar')}</Link>
        <Link to="/arc?view=bridge&environment=mainnet" aria-current={active==='bridge'?'page':undefined}>{t('USDC köprüsü')}</Link>
      </>:([['overview',t("Keşif")],['flow',t("Akış haritası")],['following',t("Takip listem")],['alerts',t("Alarmlar")]] as const).map(([key,title])=>
        <Link key={key} to={key==='overview'?'/arc':`/arc?view=${key}`} aria-current={selected===key?'page':undefined}>{t(title)}</Link>)}
    </nav>
    <form className="at-header-search" onSubmit={search}><Search size={16}/><input ref={searchRef} aria-label={t('Terminal araması')} placeholder={t('Adres, işlem veya token ara')} value={query} onChange={e=>setQuery(e.target.value)}/><kbd>/</kbd></form>
    <CarpanHeaderControls/>
  </header>;
}


