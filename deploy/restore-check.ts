import { renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBackupRestore, listBackups, productionPaths } from './backup-tools';

const paths = productionPaths(), latest = listBackups(paths.backups)[0];
if (!latest) throw new Error('No production backup available for restore check');
const result = checkBackupRestore(latest.file, paths.root);
const marker = join(paths.root, 'restore-check.json');
writeFileSync(marker + '.tmp', JSON.stringify(result), { mode: 0o600 });
renameSync(marker + '.tmp', marker);
console.log(JSON.stringify(result));
