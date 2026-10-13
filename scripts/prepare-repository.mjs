import {copyFileSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {repositoryFiles} from './repository-files.mjs';
import {checkRepositoryFiles} from './repository-guard.mjs';
const root=process.cwd(),files=repositoryFiles(root);checkRepositoryFiles(root,files);
mkdirSync(join(root,'.local'),{recursive:true});const output=mkdtempSync(join(root,'.local','carpan-repository-'));
for(const file of files){const target=join(output,file);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(root,file),target);}
checkRepositoryFiles(output,files);
const manifest=files.map(file=>({file,sha256:createHash('sha256').update(readFileSync(join(output,file))).digest('hex')}));
writeFileSync(join(root,'.local','repository-export-latest.json'),JSON.stringify({output,createdAt:new Date().toISOString(),files:manifest},null,2));
console.log(JSON.stringify({output,files:files.length,privateDataIncluded:false,gitPublished:false}));
