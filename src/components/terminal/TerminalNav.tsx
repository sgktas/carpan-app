import {Link} from 'react-router-dom';
import {useI18n} from '../../i18n';
import {NAV_GROUPS,activeGroup} from '../../terminal-command';
import './terminal-nav.css';
import './terminal-layout.css';

/** Top-level Terminal groups: Canlı · Keşfet · İzleme. The `active` value is the page's existing view key. */
export function TerminalGroupLinks({active}:{active:string}){
 const {t}=useI18n(),group=activeGroup(active);
 return <>{NAV_GROUPS.map(g=><Link key={g.key} to={g.to} aria-current={group===g.key?'page':undefined}>{t(g.label)}</Link>)}</>;
}

/** Second row: the pages of the selected group, so pages that used to be reachable only by side links are visible. */
export function TerminalSubNav({active}:{active:string}){
 const {t}=useI18n(),group=NAV_GROUPS.find(g=>g.key===activeGroup(active));
 if(!group||!group.items.length)return null;
 return <nav className="at-subnav" aria-label={t(group.label)}>
  {group.items.map(item=><Link key={item.key} to={item.to} aria-current={item.key===active?'page':undefined}>{t(item.label)}</Link>)}
 </nav>;
}
