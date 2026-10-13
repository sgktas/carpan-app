import type {AccountLoginMethod} from './types';

/** IDs identify a management action only. They cannot authenticate a session. */
export type ManagedAccountSession={
  id:string;
  method:AccountLoginMethod|null;
  createdAt:string;
  expiresAt:string;
  current:boolean;
};
export type AccountSessions={
  sessions:ManagedAccountSession[];
  total:number;
  limit:100;
  truncated:boolean;
};
export type AccountSessionRevocation={revoked:number;sessions:AccountSessions};
