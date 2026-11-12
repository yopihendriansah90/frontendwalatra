import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createAuthSessionHandler} from '../scripts/auth-session.mjs';
import {authRequest,getCart,createOrder,createPayment,paymentQR} from '../static/catalog/auth-client.js';

test('Commerce client forwards selection, idempotency, processing and validation codes',async()=>{
  const original=globalThis.fetch;const seen=[];
  try{
    globalThis.fetch=async(url,init)=>{seen.push({url,init});return Response.json({success:true,data:null},{status:202});};
    await getCart([301,302]);assert.match(seen[0].url,/cart_item_ids%5B%5D=301.*cart_item_ids%5B%5D=302/);
    assert.equal((await createOrder({checkout_token:'preview'},'order-key')).httpStatus,202);
    await createPayment(501,'bca_va','payment-key');assert.equal(seen[2].init.headers['Idempotency-Key'],'payment-key');
    globalThis.fetch=async()=>Response.json({success:false,message:'Checkout berubah',code:'CHECKOUT_CHANGED',errors:{checkout_token:['Ulangi preview']}},{status:409});
    await assert.rejects(authRequest('/checkout/preview'),e=>e.status===409&&e.code==='CHECKOUT_CHANGED'&&e.errors.checkout_token[0]==='Ulangi preview');
    globalThis.fetch=async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
    assert.equal((await paymentQR(501,7)).type,'image/png');
  }finally{globalThis.fetch=original;}
});

test('Session bridge protects commerce routes, forwards only supported queries and serves authenticated QR',async()=>{
  const seen=[];
  const upstream=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    seen.push({url:req.url,method:req.method,headers:req.headers,body:raw?JSON.parse(raw):null});
    res.setHeader('Content-Type','application/json');
    if(req.url.endsWith('/verify-otp'))res.end(JSON.stringify({success:true,data:{token:'1|private-token',user:{id:1,name:'Tester'}}}));
    else if(req.url.endsWith('/auth/me'))res.end(JSON.stringify({success:true,data:{user:{id:1,name:'Tester'}}}));
    else if(req.url.endsWith('/qr-code')){res.setHeader('Content-Type','image/png');res.end(Buffer.from([137,80,78,71]));}
    else if(req.url.endsWith('/payment/refresh')){res.statusCode=202;res.end(JSON.stringify({success:false,code:'PAYMENT_PROCESSING',data:null}));}
    else res.end(JSON.stringify({success:true,data:{id:501}}));
  });
  const frontend=http.createServer();
  try{
    upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
    const handler=createAuthSessionHandler({apiBaseURL:`http://127.0.0.1:${upstream.address().port}/api/v1`});
    frontend.on('request',async(req,res)=>{if(!await handler(req,res)){res.statusCode=404;res.end();}});
    frontend.listen(0,'127.0.0.1');await once(frontend,'listening');
    const base=`http://127.0.0.1:${frontend.address().port}`;
    assert.equal((await fetch(base+'/auth/session/orders')).status,401);
    const login=await fetch(base+'/auth/session/verify-otp',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
    const cookie=login.headers.get('Set-Cookie').split(';')[0];assert.equal((await login.text()).includes('private-token'),false);
    const send=(route,method='GET',body,key)=>fetch(base+'/auth/session'+route,{method,headers:{Origin:base,Cookie:cookie,...(key?{'Idempotency-Key':key}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    await send('/cart?cart_item_ids[]=301&cart_item_ids[]=302&store_id=9');
    assert.match(seen.at(-1).url,/cart_item_ids%5B%5D=301&cart_item_ids%5B%5D=302$/);
    await send('/orders','POST',{cart_item_ids:[301],checkout_token:'preview'},'checkout-key');
    assert.equal(seen.at(-1).headers['idempotency-key'],'checkout-key');assert.equal(seen.at(-1).headers.authorization,'Bearer 1|private-token');
    await send('/orders/501/payment','POST',{method:'qris'},'payment-key');assert.equal(seen.at(-1).headers['idempotency-key'],'payment-key');
    const qr=await send('/orders/501/payments/7/qr-code');assert.equal(qr.headers.get('Content-Type'),'image/png');assert.equal(qr.headers.get('Cache-Control'),'no-store');assert.equal((await qr.arrayBuffer()).byteLength,4);
    const processing=await send('/orders/501/payment/refresh','POST',{});assert.equal(processing.status,202);assert.equal((await processing.json()).code,'PAYMENT_PROCESSING');
    await send('/orders?page=2&user_id=999');assert.equal(seen.at(-1).url,'/api/v1/orders?page=2');
    assert.equal((await send('/orders/501/unsupported','POST',{})).status,404);
    assert.equal((await fetch(base+'/auth/session/orders',{method:'POST',headers:{Origin:'https://untrusted.example',Cookie:cookie},body:'{}'})).status,403);
  }finally{frontend.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>frontend.close(r)),new Promise(r=>upstream.close(r))]);}
});
