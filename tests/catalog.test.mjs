import test from 'node:test';
import assert from 'node:assert/strict';
import {number,money,itemPrice,itemKey,detailURL,paramsFromURL,selection,mediaURL,imageURLs} from '../static/catalog/model.js';
import {request,ApiError} from '../static/catalog/api.js';

test('Decimal prices, zero, missing values and bundle prices keep their meaning',()=>{
  assert.equal(number('0.00'),0);assert.equal(number(null),null);assert.equal(number('wrong'),null);
  assert.match(money('25000.00'),/25\.000/);assert.match(money('0'),/0/);assert.equal(money(null),'Harga belum tersedia');
  assert.match(itemPrice({type:'product',price:{min:'25000.00',max:45000}}),/25\.000.*45\.000/);
  assert.equal(itemPrice({type:'bundle',price:{value:'40000.00'}}),money(40000));
});
test('A product and bundle can share a listing ID without sharing a key or detail route',()=>{
  const product={type:'product',listing_id:5,slug:'dua kata'},bundle={...product,type:'bundle'};
  assert.notEqual(itemKey(product),itemKey(bundle));assert.equal(detailURL(product),'/product/dua%20kata/?listing=5');assert.equal(detailURL(bundle),'/bundle/dua%20kata/?listing=5');
});
test('Listing and variant IDs, not SKU or master ID, control detail selection',()=>{
  const d={stores:[{listing_id:9},{listing_id:12}],variants:[{id:1,sku:'test'},{id:2}]};
  assert.equal(selection(d,new URLSearchParams('listing=12&variant=2'),'product').listing.listing_id,12);
  assert.equal(selection(d,new URLSearchParams('listing=bad&variant=test'),'product').variant.id,1);
  assert.deepEqual(selection({stores:[]},new URLSearchParams(),'product'),{listing:null,variant:null});
});
test('Legacy search parameters normalize while API query filters are preserved',()=>{
  const p=paramsFromURL('/search?find=kulit&sort=5&min_price=0&store=toko&per_page=50&page=2');
  assert.equal(p.get('q'),'kulit');assert.equal(p.get('sort'),'price_asc');assert.equal(p.get('min_price'),'0');assert.equal(p.get('store'),'toko');assert.equal(p.get('page'),'2');assert.equal(p.get('find'),null);
  assert.equal(paramsFromURL('/product').get('sort'),'latest');assert.equal(paramsFromURL('/search?q=herbal').get('sort'),'relevance');
});
test('Media falls back to original URLs and rejects executable protocols',()=>{
  const base='https://example.test/api/v1';assert.equal(mediaURL('javascript:alert(1)',base),null);assert.equal(mediaURL('/storage/a.png',base),'https://example.test/storage/a.png');
  assert.deepEqual(imageURLs({preview:null,full:null,url:'/storage/a.png'},base),['https://example.test/storage/a.png']);
});
test('Client follows the envelope and preserves server validation failures',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async(url,init)=>{assert.equal(init.credentials,'omit');assert.equal(init.headers.Accept,'application/json');return new Response(JSON.stringify({data:[],meta:{total:0},success:true}),{status:200});};
    assert.equal((await request('/catalog',new URLSearchParams('q=empty'))).meta.total,0);
    globalThis.fetch=async()=>new Response(JSON.stringify({success:false,message:'Harga maksimum tidak valid',errors:{max_price:['Periksa harga']}}),{status:422});
    await assert.rejects(request('/catalog',new URLSearchParams('max_price=-1')),e=>e instanceof ApiError&&e.status===422&&e.errors.max_price[0]==='Periksa harga');
    globalThis.fetch=async()=>new Response(JSON.stringify({success:false,message:'Produk tidak ditemukan.'}),{status:404});
    await assert.rejects(request('/catalog/products/absent'),e=>e.status===404);
    globalThis.fetch=async()=>new Response('invalid JSON');await assert.rejects(request('/catalog'),/tidak dapat dibaca/);
  }finally{globalThis.fetch=original;}
});
test('Identical requests share transport; cancelling one caller does not cancel another',async()=>{
  const original=globalThis.fetch;let calls=0,complete;
  try{
    globalThis.fetch=()=>{calls++;return new Promise(resolve=>complete=resolve);};
    const controller=new AbortController();const a=request('/catalog/categories',undefined,controller.signal);const b=request('/catalog/categories');
    const cancelled=assert.rejects(a,e=>e.name==='AbortError');controller.abort();await cancelled;
    complete(new Response(JSON.stringify({success:true,data:[]})));assert.deepEqual((await b).data,[]);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
test('429 shares a Retry-After cooldown without sending another request',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({retry_after:30,message:'Tunggu'}),{status:429,headers:{'Retry-After':'2'}});};
    const start=Date.now();await assert.rejects(request('/catalog'),e=>e.status===429&&e.retryAt>=start+1900);
    await assert.rejects(request('/catalog/categories'),e=>e.status===429);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
