import {expect,test} from 'bun:test';
import {routeScrollPlan} from '../src/route-scroll';

test('opening a different page starts at its heading rather than the previous footer',()=>{
  expect(routeScrollPlan({pathname:'/',hash:''},{pathname:'/finance',hash:''})).toEqual({kind:'top'});
  expect(routeScrollPlan({pathname:'/finance',hash:''},{pathname:'/ecosystem/eco_circle',hash:''})).toEqual({kind:'top'});
  expect(routeScrollPlan(null,{pathname:'/',hash:''})).toEqual({kind:'top'});
});

test('tabs, search filters and unchanged section targets preserve reading position',()=>{
  expect(routeScrollPlan({pathname:'/ecosystem',hash:''},{pathname:'/ecosystem',hash:''})).toEqual({kind:'preserve'});
  expect(routeScrollPlan({pathname:'/ecosystem/eco_circle',hash:'#development'},{pathname:'/ecosystem/eco_circle',hash:'#development'})).toEqual({kind:'preserve'});
  expect(routeScrollPlan({pathname:'/ecosystem/eco_circle',hash:'#development'},{pathname:'/ecosystem/eco_circle',hash:''})).toEqual({kind:'preserve'});
});

test('same-page and cross-page research links target the decoded document section',()=>{
  expect(routeScrollPlan({pathname:'/ecosystem/eco_gateway',hash:''},{pathname:'/ecosystem/eco_circle',hash:'#development'})).toEqual({kind:'anchor',id:'development'});
  expect(routeScrollPlan({pathname:'/ecosystem/eco_circle',hash:'#overview'},{pathname:'/ecosystem/eco_circle',hash:'#sources'})).toEqual({kind:'anchor',id:'sources'});
  expect(routeScrollPlan(null,{pathname:'/about',hash:'#how%20it%20works'})).toEqual({kind:'anchor',id:'how it works'});
});

test('malformed or auth fragments cannot become document anchors or break navigation',()=>{
  expect(routeScrollPlan({pathname:'/',hash:''},{pathname:'/login',hash:'#%E0%A4%A'})).toEqual({kind:'top'});
  expect(routeScrollPlan({pathname:'/login',hash:''},{pathname:'/login',hash:'#%E0%A4%A'})).toEqual({kind:'preserve'});
  expect(routeScrollPlan(null,{pathname:'/login',hash:'#email_token=fixture-only'})).toEqual({kind:'top'});
});
