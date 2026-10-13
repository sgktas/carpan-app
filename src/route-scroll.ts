export type ScrollLocation = {pathname:string;hash:string};
export type RouteScrollPlan = {kind:'preserve'} | {kind:'top'} | {kind:'anchor';id:string};

/** Query filters and tabs keep their reading position; pages and anchor targets do not. */
export function routeScrollPlan(previous:ScrollLocation|null,next:ScrollLocation):RouteScrollPlan {
  const pageChanged=!previous||previous.pathname!==next.pathname;
  if(!pageChanged&&previous.hash===next.hash)return {kind:'preserve'};
  if(next.hash){
    try{
      const id=decodeURIComponent(next.hash.slice(1));
      // The email callback fragment is a credential, not a document anchor.
      if(id&&!id.startsWith('email_token='))return {kind:'anchor',id};
    }catch{/* A malformed fragment cannot prevent the page from opening. */}
  }
  return {kind:pageChanged?'top':'preserve'};
}
