/** First-party server observations. Counts never establish a human visitor. */
export type ProductUsageModule = 'finance' | 'terminal' | 'ecosystem' | 'auth' | 'account' | 'bridge' | 'integration';
export type ProductUsageClient = 'ahrefsbot' | 'gptbot' | 'other_crawler' | 'authenticated_account' | 'internal_admin' | 'unclassified' | 'service_api';
export type ProductUsageStatus = 'success' | 'redirect' | 'client_error' | 'server_error';
export type ProductUsageEvent = 'product_read' | 'finance_refresh_request' | 'finance_change_request' | 'collection_change_request' | 'export_request' | 'watchlist_change_request' | 'terminal_change_request' | 'ecosystem_change_request' | 'referral_change_request' | 'account_change_request' | 'bridge_history_request' | 'login_google' | 'login_email' | 'login_wallet' | 'login_x';
export type ProductUsageStockId = 'accounts' | 'verified_wallet_accounts' | 'business_workspaces' | 'business_wallets' | 'collection_requests' | 'collection_receipts' | 'saved_projects' | 'terminal_watches' | 'network_watches' | 'referral_cards' | 'referral_participations' | 'export_batches';
export type ProductUsageStock = { id: ProductUsageStockId; value: number | null; available: boolean; basis: 'current_records'; };
export type ProductUsageDaily = { day: string; activeAccounts: number; loginEvents: number; actionRequests: number; authenticatedRequests: number; crawlerRequests: number; unclassifiedRequests: number; integrationRequests: number; };
export type ProductUsageSummary = {
  schema: 'carpan.product-usage.v1'; generatedAt: string; includeAdmin: boolean;
  range: { days: 7 | 30 | 90; fromDay: string; toDay: string; timezone: 'UTC'; measurementSince: string; retentionDays: 90; };
  totals: Omit<ProductUsageDaily, 'day'>;
  days: ProductUsageDaily[];
  events: { module: ProductUsageModule; event: ProductUsageEvent; requests: number; activeAccounts: number; }[];
  traffic: { module: ProductUsageModule; client: ProductUsageClient; status: ProductUsageStatus; requests: number; }[];
  stock: ProductUsageStock[];
};
