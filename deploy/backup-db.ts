import { createConsistentBackup, productionPaths, pruneBackups } from './backup-tools';
import {existsSync} from 'node:fs';
const paths = productionPaths();
const target = createConsistentBackup(paths.database, paths.backups);
const removed = pruneBackups(paths.backups, Number(process.env.CARPAN_BACKUP_RETENTION_DAYS || 30), 7);
console.log(JSON.stringify({ ok: true, backup: target, webhookKeyBackup:existsSync(target+'.finance-webhooks.key'), removed, offsite: 'not_configured' }));
