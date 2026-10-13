export type EcosystemStage = 'mainnet'|'testnet'|'announced'|'participant'|'unclassified';
export type EcosystemSource = {title:string;url:string;checkedAt:string};
export type EcosystemText = {en:string;tr:string};
export type EcosystemMilestone = {title:EcosystemText;summary:EcosystemText;status:'released'|'planned'|'documented';date:string|null;source:EcosystemSource};
export type EcosystemResearch = {
 checkedAt:string;
 funding:{status:'sourced'|'parent'|'not-confirmed';summary:EcosystemText;parentId?:string;rounds:{title:EcosystemText;amountUsd:number;announcedAt:string;investors:string[];source:EcosystemSource}[];sources:EcosystemSource[]};
 milestones:EcosystemMilestone[];
};
export type EcosystemUpdate = {
 id:string;projectId:string;kind:'launch'|'program'|'development';title:EcosystemText;summary:EcosystemText;
 publishedAt:string|null;source:EcosystemSource;revision:string;
 schedule:{start:string;end:string;precision:'instant'|'day'|'week';timeZone:string}|null;
};
export type EcosystemUpdateFeed = {updates:EcosystemUpdate[];checkedAt:string;mode:'reviewed'};
export type EcosystemSubscription = {projectId:string;updates:boolean;reminders:boolean;enabledAt:string};
export type EcosystemNotification = {id:string;projectId:string;kind:'update'|'reminder';update:EcosystemUpdate;createdAt:string;readAt:string|null};
export type EcosystemNotificationInbox = {subscriptions:EcosystemSubscription[];notifications:EcosystemNotification[];unread:number};
export type EcosystemProfile = {
  overview:EcosystemText;capabilities:EcosystemText[];arcContext:EcosystemText;
  resources:{title:EcosystemText;url:string}[];
  actions:{label:EcosystemText;to:string}[];
};
export type EcosystemEntry = {
  id:string;name:string;domain:string;category:string;stage:EcosystemStage;
  description:{en:string;tr:string};color:string;sources:EcosystemSource[];
  addresses:{address:string;label:string;sourceUrl:string;chainId:5042|5042002}[];
  referral:boolean;curated:boolean;
  logo?:{src:string;sourceUrl:string;background:string};
  profile?:EcosystemProfile;
  research?:EcosystemResearch;
};
export type EcosystemAsset = {symbol:string;name:string;address:string;decimals:number;kind:string;sourceUrl:string;projectId:string;checkedAt:string};
export type EcosystemCatalog = {projects:EcosystemEntry[];assets:EcosystemAsset[];checkedAt:string};
