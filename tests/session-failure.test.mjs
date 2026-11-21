import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createAuthSessionHandler} from '../scripts/auth-session.mjs';

const response=()=>({headers:{},setHeader(key,value){this.headers[key]=value;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=JSON.parse(body);}});
test('Unavailable rate storage fails closed with 503',async()=>{
  const handler=createAuthSessionHandler({apiBaseURL:'https://backend.test/api/v1',consumeRate:async()=>{throw new Error('REDIS_PASSWORD=private-token');}});
  const req=Readable.from(['{}']);Object.assign(req,{url:'/auth/session/request-otp',method:'POST',headers:{origin:'http://localhost',host:'localhost'},socket:{remoteAddress:'127.0.0.1'}});
  const res=response();await handler(req,res);assert.equal(res.status,503);
  assert.doesNotMatch(JSON.stringify(res.body),/REDIS_PASSWORD|private-token/);
});
test('Unavailable session storage returns 503 without leaking errors or authenticating',async()=>{
  const handler=createAuthSessionHandler({apiBaseURL:'https://backend.test/api/v1',sessionStore:{async get(){throw new Error('PASSWORD=private-token');}}});
  const res=response();
  await handler({url:'/auth/session/me',method:'GET',headers:{cookie:'walatra_session='+'a'.repeat(43)}},res);
  assert.equal(res.status,503);assert.equal(res.body.success,false);
  assert.doesNotMatch(JSON.stringify(res.body),/PASSWORD|private-token/);
});
test('Upstream debug responses never reach the browser',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>Response.json({success:false,message:'PASSWORD=private-token',trace:['private-path'],exception:'InternalClass'},{status:500});
    const handler=createAuthSessionHandler({apiBaseURL:'https://backend.test/api/v1'});
    const req=Readable.from([JSON.stringify({phone:'081234567890'})]);
    Object.assign(req,{url:'/auth/session/request-otp',method:'POST',headers:{origin:'http://localhost',host:'localhost'},socket:{remoteAddress:'127.0.0.1'}});
    const res=response();await handler(req,res);
    assert.equal(res.status,500);assert.equal(res.body.code,'UPSTREAM_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(res.body),/PASSWORD|private-token|private-path|InternalClass/);
  }finally{globalThis.fetch=original;}
});
