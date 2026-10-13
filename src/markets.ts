export type MarketToken={address:string;symbol:string;name:string;native:boolean};
export type ArcMarketPool={
 id:string;kind:'contract'|'pool-id';name:string;dex:string;base:MarketToken;quote:MarketToken;
 basePriceUsd:number|null;quotePriceUsd:number|null;change24h:number|null;volume24hUsd:number|null;
 liquidityUsd:number|null;transactions24h:number|null;createdAt:string|null;sourceUrl:string;
};
export type MarketSnapshot<T>={data:T;status:'fresh'|'stale'|'unavailable';retrievedAt:string|null;reason:string|null;source:'GeckoTerminal';chainId:5042};
export type MarketCandle={time:number;open:number;high:number;low:number;close:number;volume:number};
export type MarketRange='24h'|'7d';
