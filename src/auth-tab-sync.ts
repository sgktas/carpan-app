export const AUTH_CHANGE_KEY='carpan.auth.changed';
/** A timestamp signal only: identities, session cookies and tokens never enter storage. */
export function announceAuthChange(host:Pick<Window,'localStorage'>=window){
 try{host.localStorage.setItem(AUTH_CHANGE_KEY,`${Date.now()}:${Math.random()}`);}catch{/* Focus/visibility refresh still works in private browsing. */}
}
type EventHost=Pick<Window,'addEventListener'|'removeEventListener'>;
type PageHost=Pick<Document,'addEventListener'|'removeEventListener'|'visibilityState'>;
export function subscribeAuthRefresh(refresh:()=>void,host:EventHost=window,page:PageHost=document){
 const focus=()=>{if(page.visibilityState==='visible')refresh();};
 const changed=(event:StorageEvent)=>{if(event.key===AUTH_CHANGE_KEY)refresh();};
 host.addEventListener('focus',focus);host.addEventListener('storage',changed);page.addEventListener('visibilitychange',focus);
 return()=>{host.removeEventListener('focus',focus);host.removeEventListener('storage',changed);page.removeEventListener('visibilitychange',focus);};
}
