import type {CollectionProof} from './collections';

export type FinanceInboxSuggestion={requestId:string;reference:string;customer:string;invoice:string;remainingRaw18:string;amountMatches:boolean;payerMatches:boolean;afterRequest:boolean;beforeDue:boolean};
export type FinanceInboxItem={proof:CollectionProof;observedAt:string;linkedRequestId:string|null;suggestions:FinanceInboxSuggestion[]};
export type FinanceInboxCoverage={wallet:string;fromBlock:string;toBlock:string;fetchedAt:string;checkedTransactions:number;candidateTransactions:number;failedTransactions:number;truncated:boolean;blockWindow:number;transactionLimit:number};
export type FinanceInbox={wallets:string[];selectedWallet:string|null;items:FinanceInboxItem[];coverage:FinanceInboxCoverage|null;refreshAfter:string|null;source:'arc_system_events';scope:'bounded_incoming_usdc';includesGas:true};
