import {expect,test} from 'bun:test';
import {createFinanceApiAvailabilityGuard} from './apiAvailability';
import type {Request,Response} from 'express';
test('closed API rejects reads, key creation and delivery even with credentials before service handlers',()=>{
  let calls=0;
  for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE']){
    let status=200,body:unknown;const headers:Record<string,string>={};
    const req={method,headers:{authorization:'Bearer existing-test-key',cookie:'authenticated=admin'}} as unknown as Request;
    const res={set:(name:string,value:string)=>{headers[name]=value;},status:(code:number)=>{status=code;return res;},json:(value:unknown)=>{body=value;return res;}} as unknown as Response;
    createFinanceApiAvailabilityGuard(false)(req,res,()=>{calls++;});
    expect(status).toBe(503);expect(body).toMatchObject({code:'api_not_open'});expect(headers['Cache-Control']).toBe('private, no-store');
  }
  expect(calls).toBe(0);
});
test('explicit launch switch delegates to the existing authorization boundary',()=>{
  let calls=0;createFinanceApiAvailabilityGuard(true)({} as Request,{} as Response,()=>{calls++;});expect(calls).toBe(1);
});
