import type {EcosystemUpdate} from './ecosystem';
export function scheduleState(update:EcosystemUpdate,now=Date.now()):'upcoming'|'active'|'past'|'undated'{
 if(!update.schedule)return 'undated';
 const {start,end,precision}=update.schedule;
 const limit=Date.parse(end)+(precision==='instant'?0:86_400_000);
 return now>=limit?'past':now<Date.parse(start)?'upcoming':'active';
}
