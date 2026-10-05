import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run via npm run check:package');
function run(args,cwd) { return execFileSync(process.execPath,[npmCli,...args],{cwd,encoding:'utf8'}); }
const temp=mkdtempSync(join(tmpdir(),'danmux-renderer-package-'));
try {
 const pack=JSON.parse(run(['pack','--json','--pack-destination',temp],process.cwd()))[0];
 const consumer=join(temp,'consumer');
 const {mkdirSync}=await import('node:fs'); mkdirSync(consumer);
 writeFileSync(join(consumer,'package.json'),'{"private":true,"type":"module"}');
 run(['install','--ignore-scripts','--no-audit','--no-fund',join(temp,pack.filename)],consumer);
 const smoke=`import {drawDanmuxComment,readCommentStyle} from 'danmux-renderer/paint';
import {DanmuxCanvasRenderer} from 'danmux-renderer';
if(typeof drawDanmuxComment!=='function'||typeof readCommentStyle!=='function'||typeof DanmuxCanvasRenderer!=='function')throw Error('exports');
console.log('Packed root and paint imports passed without DOM');`;
 writeFileSync(join(consumer,'smoke.mjs'),smoke);
 console.log(execFileSync(process.execPath,['--conditions=browser','smoke.mjs'],{cwd:consumer,encoding:'utf8'}));
 for(const file of ['types/index.d.ts','types/paint.d.ts','vendor/danmux/LICENSE','vendor/danmux/manifest.json',
  'mobile/README.md','mobile/android/README.md',
  'mobile/android/src/main/kotlin/io/github/xlmc/danmu/gradient/GradientStyle.kt',
  'mobile/android/src/main/kotlin/io/github/xlmc/danmu/gradient/GradientPainter.kt']) readFileSync(join(consumer,'node_modules/danmux-renderer',file));
 if(pack.files.some(file=>/^mobile\/android\/(build|\.gradle)\//.test(file.path))) throw Error('Android build artifacts must not be packaged');
 writeFileSync(join(consumer,'consumer.ts'),readFileSync(new URL('./typecheck.ts',import.meta.url)));
 execFileSync(process.execPath,[resolve('node_modules/typescript/lib/tsc.js'),'--noEmit','--strict','--module','nodenext','--target','ES2022',join(consumer,'consumer.ts')],{cwd:process.cwd(),encoding:'utf8'});
 console.log(`Package verified: ${pack.filename}; ${pack.files.length} files`);
} finally { rmSync(temp,{recursive:true,force:true}); }
