import {readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {repositoryFiles} from './repository-files.mjs';
export function checkRepositoryFiles(root,files){const issues=[];
 for(const file of files){const rel=relative(root,resolve(root,file)).replaceAll('\\','/');if(rel.startsWith('../')||rel.startsWith('/')||/(^|\/)(?:\.env(?:\..*)?|\.local|\.codex|\.aws|\.ssh)(?:\/|$)/.test(rel)||/\.(?:db|sqlite)(?:-|\.|$)|\.tar\.gz$|\.(?:pem|key|p12|log|jsonl)$/.test(rel)){issues.push(`${rel}: private/runtime file`);continue;}
  if(!/\.(?:[cm]?js|tsx?|json|md|yml|yaml|sh|example|toml)$/.test(rel))continue;
  const value=readFileSync(resolve(root,file),'utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value))issues.push(`${rel}: private key material`);
  if(/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|AKIA[A-Z0-9]{16})\b/.test(value))issues.push(`${rel}: credential-shaped value`);
  if(/(?:PRIVATE_KEY|CLIENT_SECRET|RPC_PROXY_TOKEN|RESEND_API_KEY|BLOCKSCOUT_PRO_API_KEY)\s*[:=]\s*["']?(?:0x[a-fA-F0-9]{64}|[A-Za-z0-9_-]{28,})/.test(value))issues.push(`${rel}: credential assignment`);
 }
 if(issues.length)throw Error(issues.join('\n'));return {files:files.length,ok:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=process.cwd();let files;try{files=execFileSync('git',['ls-files','-z'],{cwd:root,stdio:['ignore','pipe','ignore']}).toString().split('\0').filter(Boolean);}catch{files=repositoryFiles(root);}console.log(JSON.stringify(checkRepositoryFiles(root,files)));}
