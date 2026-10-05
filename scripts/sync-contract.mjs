const canonical = data => data.toString('utf8').replace(/\r\n/g, '\n');
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const upstream=process.argv[2]; if(!upstream)throw Error('Usage: node scripts/sync-contract.mjs <danmux checkout>');
const base=fileURLToPath(new URL('../vendor/danmux/',import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(base,'manifest.json')));
for(const file of Object.keys(manifest.files)) {
 const source=resolve(upstream,file), dest=resolve(base,file); mkdirSync(dirname(dest),{recursive:true}); copyFileSync(source,dest);
 manifest.files[file]=createHash('sha256').update(canonical(readFileSync(dest))).digest('hex');
}
manifest.commit=execFileSync('git',['rev-parse','HEAD'],{cwd:upstream,encoding:'utf8'}).trim();
writeFileSync(resolve(base,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Contract synchronized; run tests and review before committing');
