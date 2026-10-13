import type {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
import {isAddress} from 'viem';
export function initProjectAddresses(db:Database){db.run(`CREATE TABLE IF NOT EXISTS project_addresses(
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL,address TEXT NOT NULL,role TEXT NOT NULL,label TEXT NOT NULL,
 source_url TEXT NOT NULL,source_note TEXT NOT NULL,reviewed_by TEXT NOT NULL,reviewed_at TEXT NOT NULL,
 revoked_at TEXT,UNIQUE(project_id,address))`);db.run('CREATE INDEX IF NOT EXISTS project_address_lookup ON project_addresses(address,revoked_at)');}
export function projectAddresses(db:Database,id:string){return db.query(`SELECT id,project_id AS projectId,address,role,label,
 source_url AS sourceUrl,source_note AS sourceNote,reviewed_at AS reviewedAt FROM project_addresses WHERE project_id=? AND revoked_at IS NULL ORDER BY reviewed_at DESC`).all(id);}
export function saveProjectAddress(db:Database,projectId:string,domain:string,reviewer:string,value:unknown){
 const d=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 if(typeof d.address!=='string'||!isAddress(d.address.trim()))throw new Error('Geçerli bir Arc adresi gir.');
 if(!['contract','treasury','deployer','other'].includes(String(d.role)))throw new Error('Adres rolünü seç.');
 if(typeof d.label!=='string'||!d.label.trim()||d.label.length>60||/[\x00-\x1f]/.test(d.label))throw new Error('Adres adı 1–60 karakter olmalı.');
 if(typeof d.sourceNote!=='string'||!d.sourceNote.trim()||d.sourceNote.length>1000)throw new Error('Kaynağın adres bağlantısını nasıl doğruladığını açıkla.');
 if(d.reviewed!==true)throw new Error('Kaynak incelemesini onayla.');
 let url:URL;try{url=new URL(String(d.sourceUrl));}catch{throw new Error('Geçerli bir resmî kaynak bağlantısı gir.');}
 if(url.protocol!=='https:'||url.username||url.password||url.href.length>2048||
   !(url.hostname===domain||url.hostname.endsWith('.'+domain)))throw new Error('Kaynak projenin resmî HTTPS alan adında olmalı.');
 const address=d.address.trim().toLowerCase(),now=new Date().toISOString();
 const count=db.query('SELECT COUNT(*) AS n FROM project_addresses WHERE project_id=? AND revoked_at IS NULL').get(projectId) as {n:number};
 const exists=db.query('SELECT id FROM project_addresses WHERE project_id=? AND address=? AND revoked_at IS NULL').get(projectId,address);
 if(count.n>=30&&!exists)throw new Error('Bir proje için en fazla 30 adres kaydedilir.');
 db.run(`INSERT INTO project_addresses(id,project_id,address,role,label,source_url,source_note,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?)
 ON CONFLICT(project_id,address) DO UPDATE SET role=excluded.role,label=excluded.label,source_url=excluded.source_url,
 source_note=excluded.source_note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,revoked_at=NULL`,
 [randomUUID(),projectId,address,d.role,d.label.trim(),url.href,d.sourceNote.trim(),reviewer,now]);
 return projectAddresses(db,projectId);
}
export function relatedProjects(db:Database,address:string,demo:boolean){return db.query(`SELECT p.id,p.name,p.official_domain AS officialDomain,
 a.label,a.role,a.source_url AS sourceUrl,a.source_note AS sourceNote,a.reviewed_at AS reviewedAt
 FROM project_addresses a JOIN projects p ON p.id=a.project_id
 WHERE a.address=? AND a.revoked_at IS NULL AND p.status='approved' AND p.is_demo=? ORDER BY p.name`).all(address,demo?1:0);}
