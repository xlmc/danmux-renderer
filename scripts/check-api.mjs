import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCommentStyle } from '../src/paint.js';
const api=process.argv[2]; if(!api)throw Error('Usage: node scripts/check-api.mjs <danmu_api checkout>');
const load=p=>import(pathToFileURL(resolve(api,'danmu_api',p)));
const {Globals}=await load('configs/globals.js');
const {convertToDanmakuJson,formatDanmuResponse}=await load('utils/danmu-util.js');
const {applyOffset}=await load('utils/offset-util.js');
const input=[{p:'1,1,16777215,[tencent]',m:'pipeline fixture'},{p:'2,1,0,[tencent]',m:'black fallback'}];
for(const [enabled,chance,expected] of [['true','100',true],['false','100',false],['true','0',false]]) {
 Globals.init({LOG_LEVEL:'error',BLOCKED_WORDS:'',BLOCK_DOMESTIC_CELEBRITIES:'false',GROUP_MINUTE:'0',DANMU_LIMIT:'0',LIKE_SWITCH:'false',CONVERT_COLOR:'default',GRADIENT_ENABLED:enabled,GRADIENT_CHANCE:chance});
 const converted=convertToDanmakuJson(structuredClone(input),'tencent');
 const payload=await formatDanmuResponse({count:2,comments:converted}).json();
 assert.equal(payload.comments.length,2);
 assert.equal(Boolean(readCommentStyle(payload.comments[0]).fill),expected);
 assert.equal(readCommentStyle(payload.comments[1]).fill,null);
 assert.equal(payload.comments[1].p.split(',')[2],'0');
 const offset={count:2,comments:applyOffset(converted,5)};
 const shifted=await formatDanmuResponse(offset).json();
 assert.equal(Boolean(readCommentStyle(shifted.comments[0]).fill),expected);
 assert.equal(Number(shifted.comments[0].p.split(',')[0]),6);
 console.log(`API ordinary JSON -> renderer: enabled=${enabled}, chance=${chance}, gradient=${expected}`);
}
