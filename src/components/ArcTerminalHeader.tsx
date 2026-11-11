import {CarpanHomeLink} from './CarpanHomeLink';
/* carpan-localized */

import {useEffect,useRef,useState} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {Search} from 'lucide-react';
import {CarpanEmblem} from './CarpanEmblem';
import {BRAND} from '../brand';
import {useI18n} from '../i18n';
import {CarpanHeaderControls} from './CarpanHeaderControls';
import {CommandPalette} from './terminal/CommandPalette';
import {TerminalGroupLinks,TerminalSubNav} from './terminal/TerminalNav';

export function ArcTerminalHeader({active='overview'}:{active?:string}) {
  const [paletteOpen,setPaletteOpen]=useState(false);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const {t}=useI18n();
  const location=useLocation();
  const overviewModule=['about','api','account','dashboard'].includes(active);
  const financeModule=active==='finance'||active==='bridge'||active==='collections'||active==='invoices';
  const ecosystemModule=location.pathname.startsWith('/ecosystem')||location.pathname.startsWith('/onchain/projects');
  const communityModule=ecosystemModule||['/projects','/referral-center','/my-links','/participations','/incoming'].includes(location.pathname);
  const terminalModule=!(overviewModule||ecosystemModule||communityModule||financeModule);
  // "/" and Ctrl/Cmd+K open the command palette from any header; typing in a field never triggers it.
  useEffect(()=>{
    const open=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      const typing=['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable;
      if((event.key==='k'||event.key==='K')&&(event.ctrlKey||event.metaKey)){event.preventDefault();setPaletteOpen(true);}
      else if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!typing){event.preventDefault();setPaletteOpen(true);}
    };
    window.addEventListener('keydown',open);return()=>window.removeEventListener('keydown',open);
  },[]);
  return <>
  <header className="at-header" data-module={financeModule?'finance':communityModule?'social':['dashboard','account'].includes(active)?'account':'terminal'}>
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
      </>:<TerminalGroupLinks active={active}/>}
    </nav>
    <button ref={triggerRef} type="button" className="at-header-search" aria-haspopup="dialog" aria-label={t('Komut paleti')} onClick={()=>setPaletteOpen(true)}><Search size={16}/><span>{t('Adres, işlem, blok veya token ara')}</span><kbd>/</kbd></button>
    <CarpanHeaderControls/>
  </header>
  {terminalModule&&<TerminalSubNav active={active}/>}
  <CommandPalette open={paletteOpen} onClose={()=>setPaletteOpen(false)}/>
  </>;
}
