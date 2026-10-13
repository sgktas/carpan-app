import { Database } from 'bun:sqlite';
import { chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const backupName = /^refbridge-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.db$/;
export function backupTimestamp(name: string) {
  const match = backupName.exec(name);
  if (!match) return NaN;
  const iso = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`, timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === iso ? timestamp : NaN;
}
export function listBackups(directory: string) {
  const root = realpathSync(directory);
  return readdirSync(root).flatMap(name => {
    const time = backupTimestamp(name), file = join(root, name);
    if (!Number.isFinite(time) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) return [];
    return [{ file, name, time }];
  }).sort((a, b) => b.time - a.time);
}

export type FinanceBackupOptions={webhookEncryptionKey?:string;webhookEncryptionKeyFile?:string};
const webhookKeySuffix='.finance-webhooks.key';
function entryExists(file:string){try{lstatSync(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
function syncFile(file:string,directory=false){const descriptor=openSync(file,directory?'r':'r+');try{fsyncSync(descriptor);}finally{closeSync(descriptor);}}
function safeRegularFile(file:string,root:string){
  const path=resolve(file);if(dirname(path)!==root||!path.startsWith(root+sep))throw new Error('Backup file escaped its directory');
  const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||realpathSync(path)!==path)throw new Error('Expected regular backup file');return path;
}
function validatedKey(raw:string):string{if(!/^[0-9a-f]{64}$/i.test(raw))throw new Error('Finance webhook encryption key is invalid');return raw.toLowerCase();}
function configuredWebhookKey(options:FinanceBackupOptions):string|null{
  let raw=options.webhookEncryptionKey??(options.webhookEncryptionKeyFile===undefined?process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY:undefined);
  if(options.webhookEncryptionKey===undefined&&raw?.trim()==='')raw=undefined;
  if(raw!==undefined)return validatedKey(raw);
  const file=options.webhookEncryptionKeyFile??process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY_FILE;if(!file)return null;
  try{const info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size>128)throw new Error('Invalid key file');return validatedKey(readFileSync(file,'utf8').trim());}catch{throw new Error('Finance webhook encryption key file is invalid');}
}
function verifyWebhookKey(database:Database,key:string|null){
  const table=database.query("SELECT name FROM sqlite_master WHERE type='table' AND name='finance_webhook_endpoints'").get();if(!table)return;
  const keys=database.query('SELECT DISTINCT key_id FROM finance_webhook_endpoints').all() as {key_id:string}[];if(!keys.length)return;
  if(!key)throw new Error('Finance webhook encryption key is required for this backup');
  const fingerprint=createHash('sha256').update(Buffer.from(key,'hex')).digest('hex').slice(0,16);
  if(keys.some(item=>item.key_id!==fingerprint))throw new Error('Finance webhook backup encryption key does not match');
}

export function createConsistentBackup(file: string, directory: string, now = new Date(), options:FinanceBackupOptions={}) {
  // Capture and validate the key before creating a database snapshot; no secret is logged or returned.
  const key=configuredWebhookKey(options);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const root = realpathSync(directory), source = realpathSync(file);
  const target = join(root, `refbridge-${now.toISOString().replace(/[:.]/g, '-')}.db`);
  if (source === target) throw new Error('Backup must not replace the source database');
  if(entryExists(target)||entryExists(target+webhookKeySuffix))throw new Error('Backup snapshot already exists');
  const temporary=join(root,`.backup-${randomUUID()}.db.part`),sidecar=target+webhookKeySuffix;let createdSidecar=false,published=false;
  const database = new Database(source, { readonly: true });
  try {
    try{verifyWebhookKey(database,key);database.query('VACUUM INTO ?').run(temporary);}finally{database.close();}
    const check = new Database(temporary, { readonly: true });
    try {
      if ((check.query('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check !== 'ok')throw new Error('Backup integrity failed');
      verifyWebhookKey(check,key);
    } finally { check.close(); }
    chmodSync(temporary,0o600);syncFile(temporary);
    if(key){writeFileSync(sidecar,key+'\n',{flag:'wx',mode:0o600});createdSidecar=true;chmodSync(sidecar,0o600);syncFile(sidecar);}
    // Publish the named database last, after its matching key sidecar is durable on this filesystem.
    linkSync(temporary,target);published=true;if(process.platform!=='win32')syncFile(root,true);return target;
  }finally{
    if(entryExists(temporary))unlinkSync(safeRegularFile(temporary,root));
    if(createdSidecar&&!published&&entryExists(sidecar))unlinkSync(safeRegularFile(sidecar,root));
  }
}

/** Only named, regular snapshots older than retention; always retain the newest minimum. */
export function pruneBackups(directory: string, days = 30, keepMinimum = 7, now = Date.now()) {
  if (!Number.isInteger(days) || days < 7 || days > 365 || !Number.isInteger(keepMinimum) || keepMinimum < 2) {
    throw new Error('Invalid backup retention policy');
  }
  const root = realpathSync(directory), files = listBackups(root), deleted: string[] = [];
  for (const item of files.slice(keepMinimum)) {
    if (item.time >= now - days * 86_400_000) continue;
    const target = resolve(item.file);
    if (dirname(target) !== root || !target.startsWith(root + sep) || !backupName.test(basename(target))) {
      throw new Error('Backup pruning escaped its directory');
    }
    safeRegularFile(target,root);
    const sidecar=target+webhookKeySuffix;
    // Verify the exact paired path before removing either member; arbitrary key files are untouched.
    if(entryExists(sidecar))safeRegularFile(sidecar,root);
    unlinkSync(target);if(entryExists(sidecar))unlinkSync(sidecar);deleted.push(item.name);
  }
  return deleted;
}

function removeRestoreScratch(scratch: string, root: string) {
  const target = realpathSync(scratch);
  if (dirname(target) !== root || !basename(target).startsWith('.restore-check-')) throw new Error('Restore cleanup escaped scratch directory');
  rmSync(target, { recursive: true, force: true });
}

/** Restore into a scratch clone, validate schema and a rolled-back write; never touch live DB. */
export function checkBackupRestore(backup: string, scratchRoot: string) {
  const source = resolve(backup);
  if (!backupName.test(basename(source)) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) throw new Error('Expected regular backup file');
  const root = realpathSync(scratchRoot), scratch = mkdtempSync(join(root, '.restore-check-'));
  try {
    const clone = join(scratch, 'restored.sqlite'); copyFileSync(source, clone);
    const database = new Database(clone);
    try {
      const integrity = (database.query('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
      if (integrity !== 'ok') throw new Error('Restored backup integrity failed');
      const names = new Set((database.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name));
      for (const table of ['users', 'sessions', 'arc_indexer_state']) if (!names.has(table)) throw new Error(`Restored backup missing ${table}`);
      const sidecar=source+webhookKeySuffix;let key:string|null=null;
      if(entryExists(sidecar)){const keyFile=safeRegularFile(sidecar,dirname(source));if(lstatSync(keyFile).size>128)throw new Error('Finance webhook backup key file is invalid');key=validatedKey(readFileSync(keyFile,'utf8').trim());}
      verifyWebhookKey(database,key);
      database.exec('BEGIN IMMEDIATE');
      try {
        database.exec('CREATE TABLE __carpan_restore_probe (value TEXT)');
        database.run('INSERT INTO __carpan_restore_probe VALUES(?)', ['restored']);
        if ((database.query('SELECT value FROM __carpan_restore_probe').get() as { value: string }).value !== 'restored') throw new Error('Restore write check failed');
      } finally { database.exec('ROLLBACK'); }
      return { ok: true, backup: basename(source), checkedAt: new Date().toISOString() };
    } finally { database.close(); }
  } finally {
    removeRestoreScratch(scratch, root);
  }
}

export function productionPaths() {
  const root = realpathSync('/opt/carpan/shared'), file = process.env.REFBRIDGE_DB_PATH;
  if (!file) throw new Error('REFBRIDGE_DB_PATH is required');
  const database = realpathSync(file);
  if (!database.startsWith(root + sep)) throw new Error('Expected database inside production shared directory');
  const backups = join(root, 'backups');
  if (existsSync(backups) && realpathSync(backups) !== backups) throw new Error('Backup directory must not be a symlink');
  return { root, database, backups };
}
