import {expect,test} from 'bun:test';
import {startVisiblePolling,type VisibilitySource} from '../src/visible-polling';

test('hidden research tabs stop requests, returning refreshes once, disposal blocks queued ticks',()=>{
  let changes:(()=>void)|undefined,tick:(()=>void)|undefined,calls=0,created=0,cancelled=0;
  const page:VisibilitySource={hidden:true,addEventListener(_type,listener){changes=listener;},removeEventListener(){changes=undefined;}};
  const dispose=startVisiblePolling(()=>calls++,60000,page,{setInterval(callback){tick=callback;return ++created;},clearInterval(){cancelled++;}});
  expect(created).toBe(0);expect(calls).toBe(0);
  page.hidden=false;changes?.();expect(created).toBe(1);expect(calls).toBe(1);
  tick?.();expect(calls).toBe(2);
  page.hidden=true;changes?.();expect(cancelled).toBe(1);tick?.();expect(calls).toBe(2);
  page.hidden=false;changes?.();expect(created).toBe(2);expect(calls).toBe(3);
  dispose();tick?.();expect(cancelled).toBe(2);expect(changes).toBeUndefined();expect(calls).toBe(3);
});
