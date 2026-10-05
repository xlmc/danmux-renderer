const canonical = data => data.toString('utf8').replace(/\r\n/g, '\n');
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const base = new URL('../vendor/danmux/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json',base)));
for (const [file, hash] of Object.entries(manifest.files)) {
 const data=readFileSync(new URL(file,base));
 if(createHash('sha256').update(canonical(data)).digest('hex')!==hash) throw new Error(`Vendored contract changed: ${file}`);
 if(process.argv[2] && canonical(data)!==canonical(readFileSync(resolve(process.argv[2],file)))) throw new Error(`Upstream differs: ${file}`);
}
console.log(`Upstream contract verified: ${manifest.commit}`);
