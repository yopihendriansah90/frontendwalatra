import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBundleComponents} from '../static/catalog/bundle-components.js';
import {imageURLs,mediaAssetURL} from '../static/catalog/model.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const item=(slug='herbal',id=2,image_url=null)=>({product:{slug,name:'Herbal'},variant:{id,name:'Besar',image_url},quantity:1});
function setup(request,{observe=false}={}){
  const el=(tag,attrs={},...children)=>({tag,attrs,children:children.flat(),append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
  let observer;
  class Observer{
    constructor(callback){this.callback=callback;this.targets=new Set();observer=this;}
    observe(target){this.targets.add(target);}
    unobserve(target){this.targets.delete(target);}
    disconnect(){this.targets.clear();}
    show(target){this.callback([{target,isIntersecting:true}]);}
  }
  const render=createBundleComponents({el,link:(href,label,attrs)=>el('a',{href,...attrs},label),picture:(urls,alt,options={})=>({urls,alt,...options}),request,imageURLs,mediaAssetURL,apiBase:'https://api.test/api/v1',apiMediaBase:'https://api.test',Observer:observe?Observer:null});
  const controller=new AbortController();
  return {render:items=>render(items,controller.signal),controller,get observer(){return observer;}};
}
const media=row=>row.children[0].children[0];

test('Component links retain the bundled variant, including encoded product slugs',()=>{
  const h=setup(async()=>({data:{}}));
  const [row]=h.render([item('herbal besar',22,'/storage/variant.jpg')]);
  assert.equal(row.children[0].attrs.href,'/product/herbal%20besar/?variant=22');
});

test('Offscreen components wait for visibility before fetching missing photos',async()=>{
  let calls=0;
  const h=setup(async()=>{calls++;return {data:{variants:[{id:2,image_url:'/storage/photo.jpg'}]}};},{observe:true});
  const [row]=h.render([item()]);
  assert.equal(calls,0);
  h.observer.show(media(row));await tick();
  assert.equal(calls,1);
  assert.deepEqual(media(row).children[0].urls,['https://api.test/storage/photo.jpg']);
});

test('A broken photo loads an alternative without retrying the failed URL',async()=>{
  let calls=0;
  const h=setup(async()=>{calls++;return {data:{variants:[{id:2,image_url:'/storage/broken.jpg'}],stores:[{images:[{url:'/storage/backup.jpg'}]}]}};});
  const [row]=h.render([item('herbal',2,'/storage/broken.jpg')]);
  assert.equal(calls,0);
  media(row).children[0].onExhausted();await tick();
  assert.equal(calls,1);
  assert.deepEqual(media(row).children[0].urls,['https://api.test/storage/backup.jpg']);
  assert.equal(media(row).children[0].onExhausted,undefined);
});

test('Repeated products share one detail response but display their own variants',async()=>{
  let calls=0;
  const h=setup(async()=>{calls++;return {data:{variants:[{id:2,image_url:'/storage/large.jpg'},{id:3,image_url:'/storage/small.jpg'}]}};});
  const rows=h.render([item('herbal',2),item('herbal',3)]);await tick();
  assert.equal(calls,1);
  assert.deepEqual(rows.map(row=>media(row).children[0].urls[0]),['https://api.test/storage/large.jpg','https://api.test/storage/small.jpg']);
});

test('Large bundles fetch at most three product details concurrently',async()=>{
  let active=0,peak=0,calls=0;
  const pending=[];
  const h=setup(()=>{calls++;active++;peak=Math.max(peak,active);return new Promise(resolve=>pending.push(()=>{active--;resolve({data:{}});}));});
  h.render(Array.from({length:20},(_,n)=>item('herbal-'+n)));
  assert.equal(calls,3);
  while(pending.length){pending.shift()();await tick();}
  assert.equal(calls,20);assert.equal(peak,3);
});

test('Rate limiting stops queued photo requests and keeps the placeholders',async()=>{
  let calls=0;
  const h=setup(async()=>{calls++;throw {status:429};});
  const rows=h.render(Array.from({length:20},(_,n)=>item('herbal-'+n)));await tick();
  assert.equal(calls,3);
  assert.ok(rows.every(row=>media(row).children[0].urls.length===0));
});

test('Navigation cancels queued work and prevents late photo updates',async()=>{
  const pending=[];
  const h=setup(()=>new Promise(resolve=>pending.push(resolve)));
  const rows=h.render(Array.from({length:8},(_,n)=>item('herbal-'+n)));
  h.controller.abort();
  for(const resolve of pending)resolve({data:{image_url:'/storage/late.jpg'}});
  await tick();
  assert.equal(pending.length,3);
  assert.ok(rows.every(row=>media(row).children[0].urls.length===0));
});
