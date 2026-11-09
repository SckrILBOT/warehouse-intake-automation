import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const output=resolve(root,'..','releases','public-source-'+stamp);
if(existsSync(output))throw new Error('Release path already exists');
mkdirSync(output,{recursive:true});
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
for(const file of new Set(files)){
  if(file==='.openai/hosting.json'||file==='.env.example')continue;
  if(/(^|\/)(\.git|\.local|\.wrangler|node_modules|outputs|work|\.taste-skill|\.sites-runtime)(\/|$)/.test(file)||/(^|\/)\.env/.test(file)||/\.credential\.xml$/.test(file))continue;
  const destination=resolve(output,file),inside=relative(output,destination);
  if(inside.startsWith('..')||isAbsolute(inside))throw new Error('Invalid output path');
  if(!existsSync(join(root,file)))continue;
  mkdirSync(dirname(destination),{recursive:true});copyFileSync(join(root,file),destination);
}
mkdirSync(join(output,'.openai'),{recursive:true});
writeFileSync(join(output,'.openai','hosting.json'),JSON.stringify({d1:'DB',r2:'BUCKET'},null,2)+'\n');
writeFileSync(join(output,'.env.example'),readFileSync(join(root,'.env.example')));
// A public checkout must not reveal the owner's real warehouse directory.
// Keep code, the fixture and the example configuration consistent.
const privateWorkPath=readFileSync(join(root,'lib/cloud-mail.ts'),'utf8').match(/export const WORK_PATH='([^']+)'/)?.[1];
if(!privateWorkPath)throw new Error('Cannot identify the work path for sanitization');
for(const file of ['lib/cloud-mail.ts','tests/cloud-mail.test.ts','.env.example']){
  const destination=join(output,file);
  writeFileSync(destination,readFileSync(destination,'utf8').replaceAll(privateWorkPath,'/Warehouse/Stock.xlsx'));
}
console.log(output);
