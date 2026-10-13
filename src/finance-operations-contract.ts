import type {FinanceMovementScan,FinanceMovementCoverage} from './finance-movements';

export type FinanceOrganizationView={id:string;name:string;kind:'personal'|'business';role:'owner'|'admin'|'reviewer'|'viewer'};
export type FinanceBusinessWalletView={id:string;address:string;label:string;registrationSource:'verified_wallet'|'collection_recipient'};
export type FinanceCounterpartyView={id:string;name:string;code:string;kind:'customer'|'supplier'|'other';addresses:{chainId:5042;address:string;label:string}[]};
export type FinanceOperationDecision={category:'review'|'collection'|'payment'|'internal'|'refund'|'other';reference:string;counterpartyId:string|null;status:'new'|'review'|'approved';version:number;updatedAt:string|null};
export type FinanceExportBatchView={id:string;createdAt:string;movementCount:number;status:'generated';accountingStatus:'not_submitted'};
export type FinanceOperationSnapshot={scan:FinanceMovementScan|null;decisions:Record<string,FinanceOperationDecision>;exportBatches:FinanceExportBatchView[];loadedRanges:FinanceMovementCoverage[]};
export type FinanceHistoryReport={sources:string[];candidateTransactions:number;checkedTransactions:number;importedMovements:number;failedTransactions:number;remainingCandidates:number;hasMore:boolean;complete:false;scope:'discovered_receipts';fetchedAt:string;warnings:string[];explorer:{available:boolean;cached:boolean;stale:boolean;fetchedAt:string|null}|null};
export type FinanceHistoryResponse={state:FinanceOperationSnapshot;history:FinanceHistoryReport;nextCursor:string|null};
export type FinanceDecisionUpdate=Omit<FinanceOperationDecision,'version'|'updatedAt'> & {expectedVersion:number};
