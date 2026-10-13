import {useLayoutEffect,useRef} from 'react';
import {useLocation} from 'react-router-dom';
import {routeScrollPlan,type ScrollLocation} from '../route-scroll';

/** Router links use pushState, so they need explicit document/async-anchor scrolling. */
export function RouteScroll(){
  const {pathname,hash}=useLocation();
  const previous=useRef<ScrollLocation|null>(null);
  const pending=useRef<(ScrollLocation&{id:string})|null>(null);
  useLayoutEffect(()=>{
    const next={pathname,hash},pageChanged=!previous.current||previous.current.pathname!==pathname;
    let plan=routeScrollPlan(previous.current,next);previous.current=next;
    if(plan.kind==='anchor')pending.current={...next,id:plan.id};
    else if(plan.kind==='preserve'&&pending.current?.pathname===pathname&&pending.current.hash===hash){
      // StrictMode may clean up and restart an effect while its lazy target is pending.
      plan={kind:'anchor',id:pending.current.id};
    }else pending.current=null;
    if(plan.kind==='preserve')return;
    if(pageChanged||plan.kind==='top')window.scrollTo({top:0,left:0,behavior:'instant'});
    if(plan.kind!=='anchor')return;
    const reachTarget=()=>{
      const target=document.getElementById(plan.id);
      if(!target)return false;
      pending.current=null;
      target.scrollIntoView({block:'start',behavior:'instant'});return true;
    };
    if(reachTarget())return;
    // Lazy routes and fetched project profiles may mount after this effect.
    const observer=new MutationObserver(()=>{if(reachTarget())stop();});
    const stop=()=>{observer.disconnect();window.clearTimeout(timeout);window.removeEventListener('wheel',cancel);window.removeEventListener('touchmove',cancel);window.removeEventListener('keydown',onKey);};
    const cancel=()=>{pending.current=null;stop();};
    const onKey=(event:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancel();};
    const timeout=window.setTimeout(cancel,15000);
    observer.observe(document.body,{childList:true,subtree:true});
    // An explicit attempt to scroll takes precedence over a delayed anchor.
    window.addEventListener('wheel',cancel,{passive:true});window.addEventListener('touchmove',cancel,{passive:true});window.addEventListener('keydown',onKey);
    return stop;
  },[pathname,hash]);
  return null;
}
