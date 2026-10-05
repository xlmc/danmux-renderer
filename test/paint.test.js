import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawDanmuxComment, readCommentStyle, parseWireComment } from '../src/paint.js';
import { parseWireComments, DanmuxCanvasRenderer } from '../src/index.js';
const cases = JSON.parse(readFileSync(new URL('../vendor/danmux/fixtures/client-linear-v1.json', import.meta.url)));
const good = cases.find(e => e.name === 'linear-fill').comment;
function context() {
  const c = { font: '20px serif', globalAlpha: 0.5, fillStyle: 'red', strokeStyle: 'blue',
    globalCompositeOperation: 'source-over', calls: [], stack: [],
    save() { this.stack.push(Object.fromEntries(Object.entries(this).filter(([,v]) => typeof v !== 'function' && !Array.isArray(v)))); },
    restore() { Object.assign(this, this.stack.pop()); },
    measureText() { this.calls.push(['measure', this.font]); return { width: 100 }; },
    createLinearGradient(...args) { const g = { args, stops: [], addColorStop(p,c) { this.stops.push([p,c]); } }; this.calls.push(['gradient',g]); return g; },
    fillText(...args) { this.calls.push(['fill',this.fillStyle,this.globalAlpha,...args]); },
    strokeText(...args) { this.calls.push(['stroke',this.strokeStyle,this.globalAlpha,...args]); },
    clearRect() {}, setTransform() {},
  }; return c;
}
for (const entry of cases) test(`shared contract: ${entry.name}`, () => {
  const style = readCommentStyle(entry.comment);
  assert.equal(Boolean(style.fill),entry.fill);
  assert.equal(Boolean(style.stroke),entry.stroke);
  assert.equal(parseWireComment(entry.comment,0).hasGradient,entry.fill || entry.stroke);
});
test('wire fill is gradient fill, not white-core stroke; caller state and data retained', () => {
 const c=context(); const before=JSON.stringify(good);
 assert.equal(drawDanmuxComment(c,good,{x:10,y:20,font:'30px sans-serif'}).enhanced,true);
 assert.equal(c.calls.some(x=>x[0]==='stroke'),false);
 const fill=c.calls.find(x=>x[0]==='fill'); assert.equal(typeof fill[1],'object'); assert.equal(fill[2],0.5);
 assert.equal(c.font,'20px serif'); assert.equal(c.fillStyle,'red'); assert.equal(c.stack.length,0);
 assert.equal(c.calls[0][1],'30px sans-serif'); assert.equal(JSON.stringify(good),before);
});
test('stroke preserves Base fill and applies gradient only to outline', () => {
 const c=context(); const comment=cases.find(x=>x.name==='stroke').comment;
 drawDanmuxComment(c,comment,{strokeWidth:3});
 assert.equal(typeof c.calls.find(x=>x[0]==='stroke')[1],'object');
 assert.equal(c.calls.find(x=>x[0]==='fill')[1],'#ffffff');
});
test('plain, unknown version and disabled effects leave host fallback completely untouched', () => {
 for (const comment of [cases[0].comment,cases[2].comment,good]) {
  const c=context(); const r=drawDanmuxComment(c,comment,{useEffects:comment!==good});
  assert.equal(r.handled,false); assert.equal(c.calls.length,0);
 }
});
test('fallback draw keeps black zero', () => {
 const c=context(); assert.equal(drawDanmuxComment(c,cases[0].comment,{fallback:'draw'}).enhanced,false);
 assert.equal(c.calls.find(x=>x[0]==='fill')[1],'#000000');
});
test('explicit Bilibili preset keeps white core and gradient outline', () => {
 const c=context(); drawDanmuxComment(c,good,{material:{profile:'bilibili'}});
 assert.equal(c.calls.some(x=>x[0]==='stroke' && typeof x[1]==='object'),true);
 assert.equal(c.calls.some(x=>x[0]==='fill' && x[1]==='rgba(255, 255, 255, 1)'),true);
});
for (const angle of [0,90,180,270]) test(`Canvas direction ${angle}`, () => {
 const c=context(), comment=structuredClone(good); comment.danmux.effects[0].source.angle=angle;
 drawDanmuxComment(c,comment,{x:10,y:20,width:100,height:40});
 const a=c.calls.find(x=>x[0]==='gradient')[1].args;
 const dx=a[2]-a[0], dy=a[3]-a[1];
 assert.ok(angle===0 ? dx>0 && Math.abs(dy)<1e-8 : angle===90 ? dy>0 && Math.abs(dx)<1e-8 : angle===180 ? dx<0 && Math.abs(dy)<1e-8 : dy<0 && Math.abs(dx)<1e-8);
});
test('invalid optional effect cannot hide valid sibling; canonical sorting and alpha retained', () => {
 const comment=structuredClone(good); comment.danmux.effects.unshift({type:'unknown'});
 comment.danmux.effects[1].source.stops.reverse(); const style=readCommentStyle(comment);
 assert.equal(style.fill.source.stops[0].position,0); assert.equal(style.fill.source.stops[0].alpha,0.85); assert.ok(style.diagnostics.length);
});
test('paint exception restores host state', () => {
 const c=context(); c.fillText=()=>{throw new Error('canvas failure');};
 assert.throws(()=>drawDanmuxComment(c,good),/canvas failure/);
 assert.equal(c.stack.length,0); assert.equal(c.fillStyle,'red'); assert.equal(c.font,'20px serif');
});
test('ordinary JSON envelope and array need no format negotiation', () => {
 assert.deepEqual(parseWireComments({count:1,comments:[good]}),parseWireComments([good]));
});
test('invalid geometry rejected before paint', () => {
 const c=context(); assert.throws(()=>drawDanmuxComment(c,good,{x:NaN}),TypeError); assert.equal(c.calls.length,0);
});
test('fill and stroke compose without changing effect semantics', () => {
 const comment=structuredClone(good); const stroke=structuredClone(comment.danmux.effects[0]); stroke.target='stroke'; comment.danmux.effects.push(stroke);
 const c=context(); drawDanmuxComment(c,comment);
 assert.equal(typeof c.calls.find(x=>x[0]==='fill')[1],'object'); assert.equal(typeof c.calls.find(x=>x[0]==='stroke')[1],'object');
});
test('excess effects fall back, duplicate targets isolate and partial preset overrides merge', () => {
 const comment=structuredClone(good); comment.danmux.effects=Array(9).fill(comment.danmux.effects[0]);
 assert.equal(drawDanmuxComment(context(),comment).handled,false);
 comment.danmux.effects=comment.danmux.effects.slice(0,2);
 assert.equal(readCommentStyle(comment).diagnostics[0].code,'duplicate_target');
 assert.equal(drawDanmuxComment(context(),good,{material:{profile:'bilibili',halo:{shadow:{alpha:0.1}}}}).enhanced,true);
});


test('versioned Base-only has no error; absent color safely falls back to white', () => {
 assert.deepEqual(readCommentStyle({p:'0,1,16777215',m:'base',danmux:{extensionVersion:1}}).diagnostics,[]);
 assert.equal(parseWireComment({p:'0,1',m:'no color'},0).color,'#ffffff');
});
