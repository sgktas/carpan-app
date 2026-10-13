import {describe,expect,test} from 'bun:test';
import {filterDiscovery} from '../src/discovery-filters';
import type {DiscoveryTransfer} from '../src/discovery-transfers';
const asset={address:`0x${'a'.repeat(40)}`,symbol:'TOKEN',decimals:18};
const item={token:asset.address,decimals:18,raw:'1000000000000000001',nftId:null,timestamp:'2026-10-04T12:00:00Z'} as DiscoveryTransfer;
describe('loaded discovery filters',()=>{
 test('18-decimal thresholds stay exact and exclude other assets/NFTs',()=>{const other={...item,token:`0x${'b'.repeat(40)}`};expect(filterDiscovery([item,other,{...item,nftId:'1'}],{minimum:'1.000000000000000001',from:'',to:''},asset)).toEqual([item]);expect(filterDiscovery([item],{minimum:'1.000000000000000002',from:'',to:''},asset)).toEqual([]);});
 test('mixed assets cannot receive a shared minimum',()=>{expect(()=>filterDiscovery([item],{minimum:'1',from:'',to:''},null)).toThrow();});
 test('date boundaries are inclusive; missing timestamps cannot match',()=>{expect(filterDiscovery([item,{...item,timestamp:null}],{minimum:'',from:'2026-10-04T12:00:00Z',to:'2026-10-04T12:00:00Z'},null)).toEqual([item]);expect(()=>filterDiscovery([item],{minimum:'',from:'2026-10-05',to:'2026-10-04'},null)).toThrow();});
});
