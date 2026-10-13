export type ArcAlertKind = 'usdc_transfer' | 'token_transfer' | 'deployment';
export type ArcAlertRule = {
  id: string; address: string; name: string; kind: ArcAlertKind;
  direction: 'all' | 'in' | 'out'; minimum: string; enabled: boolean;
  token:string;symbol:string;decimals:number;
  createdAt: string; lastCheckedAt: string | null; error: string | null;
};
export type ArcAlertNotification = {
  id: string; ruleId: string; name: string; address: string; kind: ArcAlertKind;
  hash: string; block: number; timestamp: string; direction: string;
  raw: string | null; peer: string | null; readAt: string | null;
  token:string;symbol:string;decimals:number;
};
export type ArcAlertDashboard = {rules: ArcAlertRule[]; notifications: ArcAlertNotification[]; unread: number};
export type ArcAlertDraft = Pick<ArcAlertRule,'address'|'name'|'kind'|'direction'|'minimum'> & {token?:string};
