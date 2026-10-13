import {spawnSync} from 'node:child_process';
import {basename} from 'node:path';
const npmCli=process.env.npm_execpath;
if(!npmCli||basename(npmCli)!=='npm-cli.js')throw Error('Run verification with npm run verify.');
for(const task of ['repo:check','lint','typecheck','test','build']){const result=spawnSync(process.execPath,[npmCli,'run',task],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
