import test from 'node:test';
import assert from 'node:assert/strict';
import { DanmuxCanvasRenderer } from '../src/index.js';
function target() { return { listeners:new Map(), addEventListener(k,f){this.listeners.set(k,f);}, removeEventListener(k){this.listeners.delete(k);}, emit(k){this.listeners.get(k)?.();} }; }
function setup() {
 const calls=[]; const ctx={font:'20px serif',globalAlpha:1,save(){},restore(){},measureText(){return{width:100};},fillText(...a){calls.push(a);},strokeText(){},clearRect(){},setTransform(){},createLinearGradient(){return{addColorStop(){}};}};
 const makeCanvas=()=>({style:{},width:0,height:0,removed:false,setAttribute(){},getContext(){return ctx;},remove(){this.removed=true;}});
 const window=Object.assign(target(),{devicePixelRatio:1});
 const document=Object.assign(target(),{createElement:makeCanvas});
 const globals={window,document,getComputedStyle:()=>({position:'relative'}),requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},cancelAnimationFrame:id=>callbacks.delete(id),ResizeObserver:undefined};
 let id=0; const callbacks=new Map(); const saved={};
 for(const[k,v]of Object.entries(globals)){saved[k]=Object.getOwnPropertyDescriptor(globalThis,k);Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});}
 const container={style:{},appendChild(){},getBoundingClientRect(){return{width:800,height:400};}};
 return { window, document, callbacks, container, calls, ctx, canvas:makeCanvas(),
 cleanup(){for(const[k,v]of Object.entries(saved)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}} };
}
test('full renderer keeps caller canvas, removes owned canvas and listeners', () => {
 const env=setup(); try {
  const video=Object.assign(target(),{currentTime:2,paused:true,ended:false});
  const r=new DanmuxCanvasRenderer({container:env.container,video,canvas:env.canvas});
  assert.deepEqual(r.load({comments:[{p:'1,1,0,[fixture]',m:'fallback'}]}),{total:1,withGradient:0});
  assert.equal(r.latestFrameStats.fallback,1); r.destroy();
  assert.equal(env.canvas.removed,false); assert.equal(video.listeners.size,0); assert.equal(env.window.listeners.size,0); assert.equal(env.document.listeners.size,0);
  const owned=new DanmuxCanvasRenderer({container:env.container}); owned.destroy(); assert.equal(owned.canvas.removed,true);
 }finally{env.cleanup();}
});
test('pause, seek, time source, resize and stop remain host-time driven', () => {
 const env=setup(); try {
  const video=Object.assign(target(),{currentTime:2,paused:true,ended:false});
  const r=new DanmuxCanvasRenderer({container:env.container,video});
  r.load({comments:[{p:'1,1,16777215,[fixture]',m:'timed'}]}); assert.equal(r.latestFrameStats.fallback,1);
  video.paused=false; video.emit('play'); assert.equal(env.callbacks.size,1);
  video.paused=true; video.emit('pause'); r.stop(); assert.equal(env.callbacks.size,0);
  video.currentTime=50; video.emit('seeked'); assert.equal(r.latestFrameStats.fallback,0);
  r.tick(2); assert.equal(r.latestFrameStats.fallback,1);
  r.setOptions({material:{fontSizeRatio:0.04}}); assert.equal(r.viewport.fontSize,32);
  env.window.emit('resize'); assert.equal(r.viewport.width,800);
  r.destroy(); assert.equal(env.callbacks.size,0);
 }finally{env.cleanup();}
});
