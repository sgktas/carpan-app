import {useEffect, useRef} from 'react';
import {Link, type LinkProps, useLocation, useNavigate} from 'react-router-dom';

function scrollToHomeTop(onComplete: () => void) {
  if (window.scrollY === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo({top:0,left:0,behavior:'instant'});
    onComplete();
    return () => {};
  }
  const from = window.scrollY, started = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (event: KeyboardEvent) => {
    if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) stop();
  };
  const tick = (now: number) => {
    const progress = Math.min(1, (now - started) / 620);
    window.scrollTo({top:from * Math.pow(1 - progress, 3),left:0,behavior:'instant'});
    if (progress < 1) frame = requestAnimationFrame(tick);
    else { stop(); onComplete(); }
  };
  window.addEventListener('wheel', stop, {passive:true});
  window.addEventListener('touchstart', stop, {passive:true});
  window.addEventListener('keydown', onKey);
  frame = requestAnimationFrame(tick);
  return stop;
}

/** Re-selecting Home also returns to the top of an already open homepage. */
export function CarpanHomeLink({onClick,...props}:Omit<LinkProps,'to'>){
  const {pathname}=useLocation();
  const navigate=useNavigate();
  const cancel=useRef<(() => void)|null>(null);
  useEffect(()=>()=>{cancel.current?.();},[pathname]);
  return <Link {...props} to="/" onClick={event=>{
    onClick?.(event);
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||props.target&&props.target!=='_self')return;
    event.preventDefault();
    cancel.current?.();
    cancel.current=scrollToHomeTop(()=>{if(pathname!=='/')navigate('/');});
  }}/>;
}
