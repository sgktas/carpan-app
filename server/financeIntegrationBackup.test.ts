import {describe,expect,it} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,symlinkSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join,resolve,sep} from 'node:path';
import {checkBackupRestore,createConsistentBackup,listBackups,pruneBackups} from '../deploy/backup-tools';
import {webhookConfigurationAvailable} from './financeWebhooks';

const key='3'.repeat(64),otherKey='4'.repeat(64),date=new Date('2026-10-12T12:00:00.000Z'),suffix='.finance-webhooks.key';
function isolated(action:(folder:string)=>void){
  const folder=mkdtempSync(join(tmpdir(),'carpan-integration-backup-')),root=resolve(folder);if(!root.startsWith(resolve(tmpdir())+sep))throw new Error('Unsafe test scratch path');
  try{action(folder);}finally{rmSync(root,{recursive:true,force:true});}
}
function source(folder:string,withEndpoint=true){
  const file=join(folder,'fixture.sqlite'),db=new Database(file);try{
    db.exec('CREATE TABLE users(id TEXT);CREATE TABLE sessions(token TEXT);CREATE TABLE arc_indexer_state(chain_id INTEGER);CREATE TABLE finance_webhook_endpoints(id TEXT,key_id TEXT,secret_ciphertext TEXT)');db.run('INSERT INTO users VALUES(?)',['fixture']);
    if(withEndpoint){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(Buffer.from('org:endpoint'));const data=Buffer.concat([cipher.update('whsec_fixture_signing_secret','utf8'),cipher.final()]);db.run('INSERT INTO finance_webhook_endpoints VALUES(?,?,?)',['endpoint',createHash('sha256').update(Buffer.from(key,'hex')).digest('hex').slice(0,16),JSON.stringify({v:1,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('hex')})]);}
  }finally{db.close();}return file;
}
describe('Finance webhook encryption backup and scratch restoration',()=>{
  it('backs up matched database and private key sidecar, retaining decryptability and no secret in the result',()=>isolated(folder=>{
    const original=source(folder),backup=createConsistentBackup(original,join(folder,'backups'),date,{webhookEncryptionKey:key}),sidecar=backup+suffix;
    expect(readFileSync(sidecar,'utf8').trim()).toBe(key);expect(listBackups(join(folder,'backups')).map(item=>item.file)).toEqual([backup]);
    if(process.platform!=='win32'){expect(lstatSync(sidecar).mode&0o777).toBe(0o600);expect(lstatSync(backup).mode&0o777).toBe(0o600);}
    const db=new Database(backup,{readonly:true});try{
      const row=db.query('SELECT secret_ciphertext FROM finance_webhook_endpoints').get() as {secret_ciphertext:string},box=JSON.parse(row.secret_ciphertext);const decipher=createDecipheriv('aes-256-gcm',Buffer.from(readFileSync(sidecar,'utf8').trim(),'hex'),Buffer.from(box.iv,'hex'));decipher.setAAD(Buffer.from('org:endpoint'));decipher.setAuthTag(Buffer.from(box.tag,'hex'));expect(Buffer.concat([decipher.update(Buffer.from(box.data,'hex')),decipher.final()]).toString('utf8')).toBe('whsec_fixture_signing_secret');
    }finally{db.close();}
    const proof=checkBackupRestore(backup,folder);expect(proof.ok).toBe(true);expect(JSON.stringify(proof)).not.toContain(key);expect(readdirSync(folder).some(name=>name.startsWith('.restore-check-'))).toBe(false);expect(readdirSync(join(folder,'backups')).some(name=>name.startsWith('.backup-'))).toBe(false);
  }));
  it('fails before publishing a snapshot when a configured key is invalid, missing or mismatched',()=>isolated(folder=>{
    const original=source(folder),backups=join(folder,'backups');
    for(const value of ['',otherKey,'secret-not-a-hex-key'])expect(()=>createConsistentBackup(original,backups,date,{webhookEncryptionKey:value})).toThrow();
    expect(()=>createConsistentBackup(original,backups,date,{webhookEncryptionKeyFile:join(folder,'missing-key')})).toThrow();
    if(existsSync(backups))expect(readdirSync(backups)).toHaveLength(0);
    const file=join(folder,'master.key');writeFileSync(file,key+'\n',{mode:0o600});const backup=createConsistentBackup(original,backups,date,{webhookEncryptionKeyFile:file});expect(checkBackupRestore(backup,folder).ok).toBe(true);
    const before=readFileSync(backup);expect(()=>createConsistentBackup(original,backups,date,{webhookEncryptionKey:key})).toThrow();expect(readFileSync(backup)).toEqual(before);expect(readFileSync(backup+suffix,'utf8').trim()).toBe(key);
  }));
  it('rejects missing, malformed and mismatched restore keys and removes scratch after each failure',()=>isolated(folder=>{
    const backup=createConsistentBackup(source(folder),join(folder,'backups'),date,{webhookEncryptionKey:key}),sidecar=backup+suffix;
    unlinkSync(sidecar);expect(()=>checkBackupRestore(backup,folder)).toThrow();
    for(const wrong of ['not-a-key',otherKey,'3'.repeat(129)]){writeFileSync(sidecar,wrong,{mode:0o600});expect(()=>checkBackupRestore(backup,folder)).toThrow();expect(readdirSync(folder).some(name=>name.startsWith('.restore-check-'))).toBe(false);}
    writeFileSync(sidecar,key+'\n',{mode:0o600});expect(checkBackupRestore(backup,folder).ok).toBe(true);
    const db=new Database(backup,{readonly:true});try{expect(db.query('SELECT count(*) AS n FROM users').get()).toEqual({n:1});}finally{db.close();}
  }));
  it('keeps legacy empty-endpoint backups recoverable and still validates an optional existing sidecar',()=>isolated(folder=>{
    const original=source(folder,false),backup=createConsistentBackup(original,join(folder,'backups'),date,{webhookEncryptionKeyFile:''});expect(existsSync(backup+suffix)).toBe(false);expect(checkBackupRestore(backup,folder).ok).toBe(true);
    writeFileSync(backup+suffix,'invalid',{mode:0o600});expect(()=>checkBackupRestore(backup,folder)).toThrow();writeFileSync(backup+suffix,key+'\n',{mode:0o600});expect(checkBackupRestore(backup,folder).ok).toBe(true);
  }));
  it('uses the configured key file when the environment key is blank and rejects a malformed nonempty key',()=>isolated(folder=>{
    const original=source(folder),file=join(folder,'master.key'),beforeKey=process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY,beforeFile=process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY_FILE;writeFileSync(file,key+'\n',{mode:0o600});
    try{
      process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY='  ';process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY_FILE=file;expect(webhookConfigurationAvailable()).toBe(true);const backup=createConsistentBackup(original,join(folder,'backups'),date);expect(readFileSync(backup+suffix,'utf8').trim()).toBe(key);
      process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY='malformed';expect(webhookConfigurationAvailable()).toBe(false);expect(()=>createConsistentBackup(original,join(folder,'invalid'),date)).toThrow();expect(existsSync(join(folder,'invalid'))).toBe(false);
      delete process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY;delete process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY_FILE;expect(()=>createConsistentBackup(original,join(folder,'missing'),date)).toThrow();expect(listBackups(join(folder,'missing'))).toHaveLength(0);
    }finally{
      if(beforeKey===undefined)delete process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY;else process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY=beforeKey;if(beforeFile===undefined)delete process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY_FILE;else process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY_FILE=beforeFile;
    }
  }));
  it('prunes only matched regular sidecars of removed named snapshots and preserves unrelated files',()=>isolated(folder=>{
    for(let day=1;day<=9;day++){const file=join(folder,`refbridge-2026-01-${String(day).padStart(2,'0')}T00-00-00-000Z.db`);writeFileSync(file,'fixture');writeFileSync(file+suffix,key,{mode:0o600});}
    const unrelated=join(folder,'private-master.key'),orphan=join(folder,'refbridge-other.db'+suffix);writeFileSync(unrelated,key);writeFileSync(orphan,otherKey);
    const removed=pruneBackups(folder,30,7,date.getTime());expect(removed).toHaveLength(2);expect(listBackups(folder)).toHaveLength(7);for(const name of removed){expect(existsSync(join(folder,name))).toBe(false);expect(existsSync(join(folder,name)+suffix)).toBe(false);}expect(readFileSync(unrelated,'utf8')).toBe(key);expect(readFileSync(orphan,'utf8')).toBe(otherKey);
  }));
  it('refuses a nonregular paired sidecar before removing its snapshot',()=>isolated(folder=>{
    for(let day=1;day<=9;day++)writeFileSync(join(folder,`refbridge-2026-01-${String(day).padStart(2,'0')}T00-00-00-000Z.db`),'fixture');
    const target=join(folder,'refbridge-2026-01-02T00-00-00-000Z.db');mkdirSync(target+suffix);expect(()=>pruneBackups(folder,30,7,date.getTime())).toThrow();expect(existsSync(target)).toBe(true);expect(lstatSync(target+suffix).isDirectory()).toBe(true);
  }));
  it('refuses paired symlinks without touching their target on supported POSIX filesystems',()=>{
    if(process.platform==='win32')return;
    isolated(folder=>{
      const backup=createConsistentBackup(source(folder),join(folder,'backups'),date,{webhookEncryptionKey:key}),external=join(folder,'master.key');writeFileSync(external,key,{mode:0o600});unlinkSync(backup+suffix);symlinkSync(external,backup+suffix);expect(()=>checkBackupRestore(backup,folder)).toThrow();expect(readFileSync(external,'utf8')).toBe(key);expect(basename(backup)).toMatch(/^refbridge-/);
    });
  });
});
