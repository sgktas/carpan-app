import type {FinanceExportBatchView} from './finance-operations-contract';

export type FinanceIntegrationScope='movements:read'|'exports:read'|'accounting:write';
export type FinanceIntegrationView={id:string;organizationId:string;name:string;createdAt:string;createdBy:string;disabledAt:string|null};
export type FinanceIntegrationKey={id:string;integrationId:string;name:string;prefix:string;scopes:FinanceIntegrationScope[];createdAt:string;expiresAt:string;revokedAt:string|null;lastUsedAt:string|null};
export type FinanceWebhookEndpoint={id:string;url:string;enabled:boolean;version:number;createdAt:string;updatedAt:string};
export type FinanceWebhookDelivery={id:string;integrationId:string;batchId:string;walletId:string;eventId:string;endpointVersion:number;status:'pending'|'delivering'|'delivered'|'failed'|'cancelled';attempts:number;manualRetries:number;nextAttemptAt:string|null;deliveredAt:string|null;lastHttpStatus:number|null;lastError:string|null;createdAt:string};
export type FinanceAccountingAcknowledgement={id:string;integrationId:string;walletId:string;batchId:string;movementId:string;decisionVersion:number;externalRecordId:string;recordedAt:string;keyId:string};
export type FinanceIntegrationAvailability={webhooks:boolean};
export type FinanceIntegrationList={integrations:FinanceIntegrationView[];available:FinanceIntegrationAvailability};
export type FinanceIntegrationDetail={integration:FinanceIntegrationView;keys:FinanceIntegrationKey[];webhook:FinanceWebhookEndpoint|null;deliveries:FinanceWebhookDelivery[];acknowledgements:FinanceAccountingAcknowledgement[];available:FinanceIntegrationAvailability};
export type FinanceIntegrationBatchChoice=FinanceExportBatchView & {walletId:string;walletLabel:string};
