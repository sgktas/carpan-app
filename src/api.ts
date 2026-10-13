/* carpan-localized */
import { t } from './i18n/index';
/**
 * Carpan API client — all calls go through the Vite proxy to /api/*
 */

const BASE = '/api';

// Remove the legacy JavaScript-readable bearer token; sessions now use HttpOnly cookies.
if (typeof localStorage !== 'undefined') localStorage.removeItem('rb_session');

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(t(err.error || "İstek başarısız"));
  }
  return res.json();
}

export const api = {
  financeIntegrations:{
    list:(org:string)=>req<import('./finance-integrations-contract').FinanceIntegrationList>('GET',`/finance/integrations/organizations/${encodeURIComponent(org)}`),
    create:(org:string,name:string,ownerId:string)=>req<{integration:import('./finance-integrations-contract').FinanceIntegrationView}>('POST',`/finance/integrations/organizations/${encodeURIComponent(org)}`,{name,ownerId}),
    detail:(org:string,id:string)=>req<import('./finance-integrations-contract').FinanceIntegrationDetail>('GET',`/finance/integrations/organizations/${encodeURIComponent(org)}/${encodeURIComponent(id)}`),
    batches:(org:string,id:string)=>req<{items:import('./finance-integrations-contract').FinanceIntegrationBatchChoice[]}>('GET',`/finance/integrations/organizations/${encodeURIComponent(org)}/${encodeURIComponent(id)}/exports`),
    createKey:(org:string,id:string,value:{name:string;scopes:import('./finance-integrations-contract').FinanceIntegrationScope[];expiresInDays:30|90|365},ownerId:string)=>req<{key:import('./finance-integrations-contract').FinanceIntegrationKey;secret:string}>('POST',`/finance/integrations/organizations/${encodeURIComponent(org)}/${encodeURIComponent(id)}/keys`,{...value,ownerId}),
    revokeKey:(org:string,id:string,keyId:string,ownerId:string)=>req<{ok:true}>('POST',`/finance/integrations/organizations/${encodeURIComponent(org)}/${encodeURIComponent(id)}/keys/${encodeURIComponent(keyId)}/revoke`,{ownerId}),
    saveWebhook:(org:string,id:string,value:{url:string;enabled:boolean;rotateSecret?:true},ownerId:string)=>req<{endpoint:import('./finance-integrations-contract').FinanceWebhookEndpoint;secret?:string}>('PUT',`/finance/integrations/organizations/${encodeURIComponent(org)}/${encodeURIComponent(id)}/webhook`,{...value,ownerId}),
    send:(org:string,id:string,walletId:string,batchId:string,ownerId:string)=>req<{delivery:import('./finance-integrations-contract').FinanceWebhookDelivery}>('POST',`/finance/integrations/organizations/${encodeURIComponent(org)}/${encodeURIComponent(id)}/deliveries`,{walletId,batchId,ownerId}),
    retry:(org:string,id:string,deliveryId:string,ownerId:string)=>req<{delivery:import('./finance-integrations-contract').FinanceWebhookDelivery}>('POST',`/finance/integrations/organizations/${encodeURIComponent(org)}/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/retry`,{ownerId}),
  },
  financeOperations:{
    organizations:()=>req<import('./finance-operations-contract').FinanceOrganizationView[]>('GET','/finance/operations/organizations'),
    personal:(ownerId:string)=>req<import('./finance-operations-contract').FinanceOrganizationView>('POST','/finance/operations/organizations/personal',{ownerId}),
    createOrganization:(name:string,ownerId:string)=>req<import('./finance-operations-contract').FinanceOrganizationView>('POST','/finance/operations/organizations',{name,ownerId}),
    wallets:(org:string)=>req<import('./finance-operations-contract').FinanceBusinessWalletView[]>('GET',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets`),
    addWallet:(org:string,label:string,address:string,ownerId:string)=>req<import('./finance-operations-contract').FinanceBusinessWalletView>('POST',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets`,{chainId:5042,label,address,ownerId}),
    counterparties:(org:string)=>req<import('./finance-operations-contract').FinanceCounterpartyView[]>('GET',`/finance/operations/organizations/${encodeURIComponent(org)}/counterparties`),
    saveCounterparty:(org:string,value:unknown,ownerId:string,id?:string)=>req<import('./finance-operations-contract').FinanceCounterpartyView>(id?'PUT':'POST',`/finance/operations/organizations/${encodeURIComponent(org)}/counterparties${id?`/${encodeURIComponent(id)}`:''}`,{...(value as object),ownerId}),
    state:(org:string,wallet:string)=>req<import('./finance-operations-contract').FinanceOperationSnapshot>('GET',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets/${encodeURIComponent(wallet)}/movements`),
    refresh:(org:string,wallet:string,ownerId:string,older=false)=>req<import('./finance-operations-contract').FinanceOperationSnapshot>('POST',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets/${encodeURIComponent(wallet)}/refresh`,{ownerId,older}),
    history:(org:string,wallet:string,ownerId:string,cursor?:string)=>req<import('./finance-operations-contract').FinanceHistoryResponse>('POST',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets/${encodeURIComponent(wallet)}/history`,{ownerId,...cursor?{cursor}:{}}),
    import:(org:string,wallet:string,hash:string,ownerId:string)=>req<import('./finance-operations-contract').FinanceOperationSnapshot>('POST',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets/${encodeURIComponent(wallet)}/import`,{ownerId,hash}),
    decision:(org:string,wallet:string,id:string,value:import('./finance-operations-contract').FinanceDecisionUpdate,ownerId:string)=>req<import('./finance-operations-contract').FinanceOperationDecision>('PUT',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets/${encodeURIComponent(wallet)}/movements/${encodeURIComponent(id)}`,{...value,ownerId}),
    bulk:(org:string,wallet:string,items:{id:string;expectedVersion:number}[],status:'review'|'approved',ownerId:string)=>req<unknown>('POST',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets/${encodeURIComponent(wallet)}/decisions/bulk`,{items,status,ownerId}),
    export:(org:string,wallet:string,ids:string[],idempotencyKey:string,expectedVersions:Record<string,number>,ownerId:string)=>req<{payload:unknown}>('POST',`/finance/operations/organizations/${encodeURIComponent(org)}/wallets/${encodeURIComponent(wallet)}/exports`,{ids,idempotencyKey,expectedVersions,ownerId}),
  },
  ecosystem:()=>req<import('./ecosystem').EcosystemCatalog>('GET','/ecosystem'),
  ecosystemUpdates:()=>req<import('./ecosystem').EcosystemUpdateFeed>('GET','/ecosystem/updates'),
  ecosystemNotifications:()=>req<import('./ecosystem').EcosystemNotificationInbox>('GET','/ecosystem/notifications'),
  setEcosystemSubscription:(id:string,updates:boolean,reminders:boolean)=>req<import('./ecosystem').EcosystemSubscription>('PUT',`/ecosystem/notifications/subscriptions/${encodeURIComponent(id)}`,{updates,reminders}),
  readEcosystemNotification:(id:string)=>req<{ok:true}>('POST',`/ecosystem/notifications/${encodeURIComponent(id)}/read`,{}),
  marketPools:(view:'top'|'new'='top',token?:string)=>req<import('./markets').MarketSnapshot<import('./markets').ArcMarketPool[]>>('GET',`/ecosystem/markets?${new URLSearchParams({view,...token?{token}:{}})}`),
  marketPool:(id:string)=>req<import('./markets').MarketSnapshot<import('./markets').ArcMarketPool[]>>('GET',`/ecosystem/markets/pools/${encodeURIComponent(id)}`),
  marketChart:(id:string,range:import('./markets').MarketRange,side:'base'|'quote')=>req<import('./markets').MarketSnapshot<import('./markets').MarketCandle[]>>('GET',`/ecosystem/markets/pools/${encodeURIComponent(id)}/chart?${new URLSearchParams({range,side})}`),
  accountSessions:{
    list:()=>req<import('./account-sessions').AccountSessions>('GET','/account/sessions'),
    revoke:(id:string)=>req<import('./account-sessions').AccountSessionRevocation>('DELETE',`/account/sessions/${encodeURIComponent(id)}`),
    revokeOthers:()=>req<import('./account-sessions').AccountSessionRevocation>('POST','/account/sessions/revoke-others',{}),
  },
  bridgeHistory:(environment:import('./arc-bridge').BridgeEnvironment,wallet:string)=>req<{snapshots:string[];scope:string;verified:false}>('GET',`/bridge/history?${new URLSearchParams({environment,wallet})}`),
  saveBridgeHistory:(environment:import('./arc-bridge').BridgeEnvironment,wallet:string,snapshot:string)=>req<{ok:true;id:string;stored:boolean}>('POST','/bridge/history',{environment,wallet,snapshot}),
  collections:()=>req<import('./collections').CollectionRequest[]>('GET','/finance/requests'),
  financeInbox:(wallet='')=>req<import('./finance-inbox').FinanceInbox>('GET',`/finance/inbox${wallet?`?wallet=${encodeURIComponent(wallet)}`:''}`),
  refreshFinanceInbox:(wallet:string)=>req<import('./finance-inbox').FinanceInbox>('POST','/finance/inbox/refresh',{wallet}),
  assignFinanceInbox:(requestId:string,hash:string,logIndex:number)=>req<import('./collections').CollectionRequest>('POST','/finance/inbox/assign',{requestId,hash,logIndex}),
  createCollection:(draft:import('./collections').CollectionDraft)=>req<import('./collections').CollectionRequest>('POST','/finance/requests',draft),
  collectionProof:(id:string,hash:string)=>req<import('./collections').CollectionRequest>('POST',`/finance/requests/${encodeURIComponent(id)}/proofs`,{hash}),
  collectionDecision:(id:string,hash:string,logIndex:number,decision:string)=>req<import('./collections').CollectionRequest>('PATCH',`/finance/requests/${encodeURIComponent(id)}/proofs`,{hash,logIndex,decision}),
  collectionAudit:(id:string,before='')=>req<import('./collections').CollectionAuditPage>('GET',`/finance/requests/${encodeURIComponent(id)}/audit${before?`?before=${encodeURIComponent(before)}`:''}`),
  cancelCollection:(id:string)=>req<import('./collections').CollectionRequest>('POST',`/finance/requests/${encodeURIComponent(id)}/cancel`),
  publicCollection:(token:string)=>req<import('./collections').PublicCollection>('GET',`/finance/pay/${encodeURIComponent(token)}`),
  financeDecisions:(address:string,ids:string[])=>req<{decisions:Record<string,import('./arc-finance').FinanceDecision>}>('POST',`/arc/finance/${encodeURIComponent(address)}/decisions/read`,{ids}),
  saveFinanceDecision:(address:string,id:string,decision:import('./arc-finance').FinanceDecision,ownerId:string)=>req<import('./arc-finance').FinanceDecision>('PUT',`/arc/finance/${encodeURIComponent(address)}/decisions`,{id,...decision,ownerId}),
  discoveryTransfers:(testnets=false,type='',scope='priority')=>req<import('./discovery-transfers').DiscoveryFeed>('GET',`/onchain/transfers?testnets=${testnets?'1':'0'}&type=${encodeURIComponent(type)}&scope=${encodeURIComponent(scope)}`),
  networkDirectory:()=>req<import('./chain-explorer').NetworkDirectory>('GET','/onchain/networks'),
  explorerData:(chain:string,query:import('./chain-explorer').ExplorerQuery)=>req<import('./chain-explorer').ExplorerResult>('GET',`/onchain/networks/${encodeURIComponent(chain)}/data?${new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined) as [string,string][])}`),
  networkWatchlist:()=>req<import('./chain-explorer').NetworkWatch[]>('GET','/onchain/watchlist'),
  saveNetworkWatch:(chain:string,address:string,label='')=>req<import('./chain-explorer').NetworkWatch[]>('PUT',`/onchain/networks/${encodeURIComponent(chain)}/watchlist`,{address,label}),
  removeNetworkWatch:(chain:string,address:string)=>req<import('./chain-explorer').NetworkWatch[]>('DELETE',`/onchain/networks/${encodeURIComponent(chain)}/watchlist`,{address}),
  projectAddresses:(id:string)=>req<import('./project-onchain').ProjectAddress[]>('GET',`/discover/projects/${encodeURIComponent(id)}/addresses`),
  relatedProjects:(address:string)=>req<import('./project-onchain').RelatedProject[]>('GET',`/arc/addresses/${encodeURIComponent(address)}/projects`),
  saveProjectAddress:(id:string,draft:unknown)=>req<import('./project-onchain').ProjectAddress[]>('POST',`/projects/${encodeURIComponent(id)}/addresses`,draft),
  revokeProjectAddress:(id:string,addressId:string)=>req<{ok:true}>('DELETE',`/projects/${encodeURIComponent(id)}/addresses/${encodeURIComponent(addressId)}`),
  // Auth
  logout: () => req<{ ok: boolean }>('POST', '/auth/logout'),
  me: () => req<{ user: import('./types').User; demoMode: boolean }>('GET', '/auth/me'),

  // Auth: X OAuth
  xOAuthStart: (redirect?: string) =>
    req<{ authUrl: string } | { error: string; demoMode: boolean; setup: object }>('GET', `/auth/x/start${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`),
  googleOAuthStart: (redirect?: string) =>
    req<{ authUrl: string }>('GET', `/auth/google/start${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`),
  xAccountLinkStart: (redirect='/settings?tab=security') =>
    req<{authUrl:string}>('POST',`/auth/x/link/start?redirect=${encodeURIComponent(redirect)}`,{}),
  xAccountDisconnect:()=>req<{disconnected:boolean}>('POST','/account/x/disconnect',{}),
  authStatus: () =>
    req<{ demoMode: boolean; xLoginAvailable: boolean; googleLoginAvailable: boolean; emailLoginAvailable: boolean;
      authenticated: boolean; user: import('./types').User | null; session: import('./types').AccountSession|null }>('GET', '/auth/status'),
  walletLoginChallenge: (address: string) =>
    req<{ nonce: string; message: string; expiresAt: string }>('POST', '/auth/wallet/challenge', { address }),
  walletLoginComplete: (address: string, nonce: string, message: string, signature: string) =>
    req<{ user: import('./types').User }>('POST', '/auth/wallet/complete', { address, nonce, message, signature }),
  emailLoginStart: (email: string, redirect = '/') =>
    req<{ ok: boolean; message: string }>('POST', '/auth/email/start', { email, redirect }),
  emailLoginComplete: (token: string) =>
    req<{ user: import('./types').User }>('POST', '/auth/email/complete', { token }),

  // Wallet
  walletNonce: () => req<{ nonce: string; message: string }>('POST', '/wallet/nonce', {}),
  googleWalletLinkPreview:(address:string)=>req<{nonce:string;message:string;expiresAt:string;address:string;email:string}>('POST','/wallet/google-link/preview',{address}),
  googleWalletLinkComplete:(nonce:string,signature:string)=>req<{user:import('./types').User}>('POST','/wallet/google-link/complete',{nonce,signature}),
  verifyWallet: (address: string, signature: string, message: string, nonce: string, chainId?: number) =>
    req<{ ok: boolean; address: string; user: import('./types').User }>('POST', '/wallet/verify', { address, signature, message, nonce, chainId }),

  // Projects
  discoverProjects: () => req<import('./types').Project[]>('GET', '/discover/projects'),
  discoverProject: (id: string) => req<import('./types').Project>('GET', `/discover/projects/${encodeURIComponent(id)}`),
  openProject: (id: string) => req<{ url: string; referral: boolean; referralCode?: string }>('POST', `/discover/projects/${encodeURIComponent(id)}/open`, {}),
  savedProjects: () => req<import('./types').Project[]>('GET', '/saved-projects'),
  saveProject: (id: string) => req<{ saved: true }>('POST', `/saved-projects/${encodeURIComponent(id)}`, {}),
  unsaveProject: (id: string) => req<{ saved: false }>('DELETE', `/saved-projects/${encodeURIComponent(id)}`),
  projects: (status?: string) => req<import('./types').Project[]>('GET', `/projects${status ? `?status=${status}` : ''}`),
  submitProject: (data: Partial<import('./types').Project>) => req<import('./types').Project>('POST', '/projects/submit', data),
  approveProject: (id: string) => req<import('./types').Project>('POST', `/projects/${id}/approve`),
  rejectProject: (id: string, reason: string) => req<import('./types').Project>('POST', `/projects/${id}/reject`, { reason }),
  sponsorProject: (id: string, days: 0 | 30) => req<import('./types').Project>('POST', `/projects/${id}/sponsor`, { days }),

  // Arc Radar
  arcStatus: () => req<import('./types').ArcIndexerStatus>('GET', '/arc/status'),
  arcTransferFeed: (minimum='1',cursor='') => req<import('./arc-wallet').ArcTransferFeed>('GET', `/arc/transfers?${new URLSearchParams({minimum,cursor})}`),
  arcDeployments: (options: { limit?: number; offset?: number; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.q) params.set('q', options.q);
    const serialized = params.toString();
    const suffix = serialized ? `?${serialized}` : '';
    return req<import('./types').ArcDeployment[]>('GET', `/arc/deployments${suffix}`);
  },
  arcVerifiedContracts: () => req<import('./types').ArcVerifiedContract[]>('GET', '/arc/verified'),
  arcContractProfile: (address: string) =>
    req<import('./types').ArcContractProfile>('GET', `/arc/contracts/${encodeURIComponent(address)}`),
  arcAddressProfile: (address: string) =>
    req<import('./types').ArcAddressProfile>('GET', `/arc/addresses/${encodeURIComponent(address)}`),
  arcWalletOverview: (address: string) => req<import('./arc-wallet').WalletOverview>('GET', `/arc/wallets/${encodeURIComponent(address)}`),
  arcWalletResearch: (address:string)=>req<import('./arc-wallet').WalletResearch>('GET',`/arc/wallets/${encodeURIComponent(address)}/research`),
  arcAlerts: ()=>req<import('./arc-alerts').ArcAlertDashboard>('GET','/arc/alerts'),
  createArcAlert: (draft:import('./arc-alerts').ArcAlertDraft)=>req<{id:string}>('POST','/arc/alerts',draft),
  setArcAlertEnabled: (id:string,enabled:boolean)=>req<{ok:true}>('PATCH',`/arc/alerts/${encodeURIComponent(id)}`,{enabled}),
  deleteArcAlert: (id:string)=>req<{ok:true}>('DELETE',`/arc/alerts/${encodeURIComponent(id)}`),
  markArcAlertsRead: ()=>req<{ok:true}>('POST','/arc/alerts/read',{}),
  arcWalletHistory: (address: string, filters: import('./arc-wallet').WalletFilters, cursor = '') =>
    req<import('./arc-wallet').WalletHistory>('GET', `/arc/wallets/${encodeURIComponent(address)}/transfers?${new URLSearchParams({...filters,cursor})}`),
  arcWalletLabel: (address: string) => req<{label:string}>('GET', `/arc/wallets/${encodeURIComponent(address)}/label`),
  saveArcWalletLabel: (address: string, label: string) => req<{label:string}>('PUT', `/arc/wallets/${encodeURIComponent(address)}/label`, {label}),
  arcFollowing: () => req<import('./types').ArcFollowedContract[]>('GET', '/arc/following'),
  followArcContract: (contractAddress: string) =>
    req<{ following: true; contractAddress: string }>('POST', '/arc/following', { contractAddress }),
  unfollowArcContract: (contractAddress: string) =>
    req<{ following: false; contractAddress: string }>('DELETE', `/arc/following/${encodeURIComponent(contractAddress)}`),
  markArcActivitySeen: (contractAddress: string) =>
    req<{ ok: true }>('POST', `/arc/following/${encodeURIComponent(contractAddress)}/seen`, {}),

  // Referral links
  myLinks: () => req<import('./types').ReferralLink[]>('GET', '/referral-links/mine'),
  addLink: (data: { projectId: string; referralCode: string }) =>
    req<import('./types').ReferralLink>('POST', '/referral-links', data),
  activateLink: (id: string) => req<import('./types').ReferralLink>('POST', `/referral-links/${id}/activate`, {}),
  referralProgram: () => req<import('./types').ReferralProgramStatus>('GET', '/referral-program/mine'),
  referralCards: () => req<import('./types').ReferralCard[]>('GET', '/referral-center/cards'),
  leaderboard: (period: 'week' | 'month' | 'all') =>
    req<import('./types').LeaderboardEntry[]>('GET', `/referral-program/leaderboard?period=${period}`),
  myPublicProfile: () => req<{ handle: string; name: string }>('GET', '/profile/me'),
  updatePublicProfile: (handle: string, name: string) =>
    req<{ handle: string; name: string }>('PATCH', '/profile/me', { handle, name }),

  // Participations
  reserve: (projectId: string, referralLinkId?: string) =>
    req<import('./types').ReservationResult>('POST', '/participations/reserve', { projectId, referralLinkId, participationType: 'free' }),
  submitParticipation: (reservationId: string, proof?: string) =>
    req<import('./types').Participation>('POST', '/participations/submit', { reservationId, proof }),
  myParticipations: () => req<import('./types').Participation[]>('GET', '/participations/mine'),
  incomingParticipations: () => req<import('./types').Participation[]>('GET', '/participations/incoming'),
  disputeParticipation: (id: string, note: string) =>
    req<import('./types').Participation>('POST', `/participations/${id}/dispute`, { note }),

  // Admin participation
  verifyParticipation: (id: string) => req<import('./types').Participation>('POST', `/participations/${id}/verify`),
  rejectParticipation: (id: string, reason: string) =>
    req<import('./types').Participation>('POST', `/participations/${id}/reject`, { reason }),

  // Admin
  productUsage:(days:7|30|90=7,includeAdmin=false)=>req<import('./product-usage-contract').ProductUsageSummary>('GET',`/admin/usage?${new URLSearchParams({days:String(days),includeAdmin:String(includeAdmin)})}`),
  explorerUsage:()=>req<{day:string;pro_calls:number;credits:number;public_calls:number;cache_hits:number;errors:number;remaining:number|null;limit:number;reserve:number;available:number;mode:string;resetAt:string}>('GET','/admin/onchain/api-usage'),
  adminStats: () => req<import('./types').AdminStats>('GET', '/admin/stats'),
  adminLogs: () => req<import('./types').AdminLog[]>('GET', '/admin/logs'),
  adminUsers: () => req<import('./types').User[]>('GET', '/admin/users'),
  adminParticipations: (status?: string) =>
    req<import('./types').Participation[]>('GET', `/admin/participations${status ? `?status=${status}` : ''}`),

};
