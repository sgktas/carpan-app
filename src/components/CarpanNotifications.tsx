import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {Bell,ArrowUpRight,RefreshCw,X} from 'lucide-react';
import {api} from '../api';
import {useAuth} from '../hooks/useAuth';
import {useI18n} from '../i18n';
import {useCarpanLogin} from './CarpanLogin';
import type {ArcAlertDashboard} from '../arc-alerts';
import type {EcosystemNotificationInbox} from '../ecosystem';
import './carpan-notifications.css';

/** Fetch only when opened or manually refreshed; reading never marks anything read. */
export function CarpanNotifications({open,onToggle,onClose}:{open:boolean;onToggle:()=>void;onClose:()=>void}){
  const {user}=useAuth(),{language,t}=useI18n(),{openLogin}=useCarpanLogin();
  const location=useLocation();
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),closeButton=useRef<HTMLButtonElement>(null);
  const [snapshot,setSnapshot]=useState<{owner:string;arc:ArcAlertDashboard|null;ecosystem:EcosystemNotificationInbox|null}|null>(null);
  const [busy,setBusy]=useState(false),[failures,setFailures]=useState<string[]>([]),[retry,setRetry]=useState(0);
  const owner=user?.id;
  const current=snapshot?.owner===owner?snapshot:null;
  const s=(en:string,tr:string)=>language==='en'?en:tr;
  useEffect(()=>{onClose();},[location.pathname,location.search,owner]);
  useEffect(()=>{
    if(!open)return;
    closeButton.current?.focus();
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))onClose();};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){onClose();trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  useEffect(()=>{
    setSnapshot(null);setFailures([]);setBusy(false);
    if(!open||!owner)return;
    let active=true;setBusy(true);
    void Promise.allSettled([api.arcAlerts(),api.ecosystemNotifications()]).then(([arc,ecosystem])=>{
      if(!active)return;
      setSnapshot({owner,arc:arc.status==='fulfilled'?arc.value:null,ecosystem:ecosystem.status==='fulfilled'?ecosystem.value:null});
      setFailures([...(arc.status==='rejected'?['Terminal']:[]),...(ecosystem.status==='rejected'?['Ecosystem']:[])]);
      setBusy(false);
    });
    return()=>{active=false;};
  },[open,owner,retry]);
  const unread=current?.arc&&current.ecosystem?current.arc.unread+current.ecosystem.unread:null;
  const items=[
    ...(current?.arc?.notifications||[]).map(n=>({id:`arc-${n.id}`,title:n.name,detail:n.kind==='deployment'?s('New contract deployment','Yeni kontrat dağıtımı'):`${n.symbol} · ${n.direction==='in'?t('Giriş'):t('Çıkış')}`,at:n.timestamp,read:!!n.readAt,source:'Terminal',to:`/arc/addresses/${n.address}?tx=${n.hash}&token=${n.token}`})),
    ...(current?.ecosystem?.notifications||[]).map(n=>({id:`eco-${n.id}`,title:n.update.title[language],detail:n.kind==='reminder'?s('Deadline reminder','Son tarih hatırlatması'):s('Project update','Proje güncellemesi'),at:n.createdAt,read:!!n.readAt,source:'Ecosystem',to:`/ecosystem/${encodeURIComponent(n.projectId)}#notifications`}))
  ].sort((a,b)=>Number(a.read)-Number(b.read)||Date.parse(b.at)-Date.parse(a.at)).slice(0,8);
  return <div className="carpan-notification-control" ref={root}>
    <button ref={trigger} type="button" className="carpan-preferences-trigger carpan-notification-trigger" aria-label={t('Bildirimler')} title={t('Bildirimler')} aria-expanded={open} aria-controls="carpan-notification-panel" onClick={onToggle}><Bell size={20} strokeWidth={1.8}/></button>
    {open&&<section id="carpan-notification-panel" className="carpan-notification-panel" aria-label={t('Bildirimler')}>
      <header><div><strong>{t('Bildirimler')}</strong><small>{s('Your activity, in one place.','Takip ettiğin hareketler bir arada.')}</small></div><button ref={closeButton} type="button" aria-label={t('Kapat')} onClick={()=>{onClose();trigger.current?.focus();}}><X size={17}/></button></header>
      {!user?<div className="carpan-notification-empty"><Bell size={26}/><strong>{s('Keep up with what matters.','Önemli gelişmeleri takip et.')}</strong><p>{s('Sign in to see your wallet alerts and project updates.','Cüzdan alarmlarını ve proje bildirimlerini görmek için giriş yap.')}</p><button type="button" onClick={()=>{onClose();openLogin(location.pathname+location.search+location.hash);}}>{t('Giriş yap')}</button></div>:<>
        <div className="carpan-notification-summary"><span>{busy?s('Loading…','Yükleniyor…'):unread===null?s('Inbox','Bildirim kutusu'):`${unread} ${s('unread','okunmamış')}`}</span><button type="button" disabled={busy} onClick={()=>setRetry(v=>v+1)} aria-label={s('Refresh notifications','Bildirimleri yenile')}><RefreshCw size={15}/></button></div>
        {!!failures.length&&<p className="carpan-notification-error" role="alert">{s('Could not load: ','Yüklenemedi: ')}{failures.join(', ')}. {s('Try refreshing.','Yenilemeyi dene.')}</p>}
        {busy?<p className="carpan-notification-loading" role="status">{s('Loading your notifications…','Bildirimlerin yükleniyor…')}</p>:items.length?<div className="carpan-notification-list">{items.map(item=><Link key={item.id} to={item.to} onClick={onClose} className={item.read?'':'is-unread'}><span className="carpan-notification-dot"/><div><small>{item.source} · {item.detail}</small><strong>{item.title}</strong><time dateTime={item.at}>{new Date(item.at).toLocaleString(language==='en'?'en-GB':'tr-TR',{dateStyle:'short',timeStyle:'short'})}</time></div><ArrowUpRight size={14}/></Link>)}</div>:!failures.length&&<div className="carpan-notification-empty"><Bell size={26}/><strong>{s('You’re all caught up.','Yeni bildirim yok.')}</strong><p>{s('Wallet alerts and enabled project updates appear here.','Cüzdan alarmları ve açtığın proje bildirimleri burada görünür.')}</p></div>}
        <nav><Link to="/arc?view=alerts" onClick={onClose}>{s('Wallet alerts','Cüzdan alarmları')}<ArrowUpRight size={13}/></Link><Link to="/ecosystem?view=watchlist#notifications" onClick={onClose}>{s('Project notifications','Proje bildirimleri')}<ArrowUpRight size={13}/></Link></nav>
      </>}
    </section>}
  </div>;
}
