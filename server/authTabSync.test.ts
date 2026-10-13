import {test,expect} from 'bun:test';
import {AUTH_CHANGE_KEY,announceAuthChange,subscribeAuthRefresh} from '../src/auth-tab-sync';
function hosts(){return {host:new EventTarget(),page:Object.assign(new EventTarget(),{visibilityState:'visible'})};}
test('other-tab identity change reloads authoritative auth; unrelated preference storage is ignored',()=>{
 const {host,page}=hosts();let reads=0;
 const unsubscribe=subscribeAuthRefresh(()=>reads++,host as unknown as Window,page as unknown as Document);
 const storage=(key:string)=>host.dispatchEvent(Object.assign(new Event('storage'),{key}));
 storage('carpan-language');expect(reads).toBe(0);storage(AUTH_CHANGE_KEY);expect(reads).toBe(1);
 host.dispatchEvent(new Event('focus'));expect(reads).toBe(2);
 page.visibilityState='hidden';page.dispatchEvent(new Event('visibilitychange'));expect(reads).toBe(2);
 page.visibilityState='visible';page.dispatchEvent(new Event('visibilitychange'));expect(reads).toBe(3);
 unsubscribe();storage(AUTH_CHANGE_KEY);host.dispatchEvent(new Event('focus'));page.dispatchEvent(new Event('visibilitychange'));expect(reads).toBe(3);
});
test('auth announcements store only a non-identifying signal and tolerate blocked storage',()=>{
 const written:{key:string;value:string}[]=[];
 announceAuthChange({localStorage:{setItem:(key:string,value:string)=>written.push({key,value})} as unknown as Storage});
 expect(written).toHaveLength(1);expect(written[0].key).toBe(AUTH_CHANGE_KEY);expect(written[0].value).toMatch(/^\d+:0\.\d+$/);
 expect(()=>announceAuthChange({localStorage:{setItem:()=>{throw Error('Storage blocked');}} as unknown as Storage})).not.toThrow();
});
