/* carpan-localized */
import { localized } from './i18n/index';
export type ProjectAddress={id:string;projectId:string;address:string;role:'contract'|'treasury'|'deployer'|'other';label:string;sourceUrl:string;sourceNote:string;reviewedAt:string};
export type RelatedProject={id:string;name:string;officialDomain:string;label:string;role:string;sourceUrl:string;sourceNote:string;reviewedAt:string};
export const addressRoles=localized({contract:'Kontrat',treasury:'Hazine',deployer:'Dağıtıcı',other:'Diğer'});
