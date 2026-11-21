import test from 'node:test';
import assert from 'node:assert/strict';
import {clientIdentity,identityHeaders} from '../scripts/client-identity.mjs';
import {memoryRateLimiter} from '../scripts/rate-limit.mjs';

test('Forwarded client IP is accepted only through explicitly trusted proxy hops',()=>{
  const req=(remote,forwarded)=>({socket:{remoteAddress:remote},headers:{'x-forwarded-for':forwarded}});
  assert.equal(clientIdentity()(req('198.51.100.10','192.0.2.99')),'198.51.100.10');
  const trusted=clientIdentity(['127.0.0.1','10.0.0.0/8']);
  assert.equal(trusted(req('::ffff:127.0.0.1','192.0.2.99, 198.51.100.10, 10.0.0.2')),'198.51.100.10');
  assert.equal(trusted(req('127.0.0.1','malformed')),'127.0.0.1');
  assert.throws(()=>clientIdentity(['invalid']));
  assert.throws(()=>clientIdentity(['127.0.0.1/']));
  assert.throws(()=>clientIdentity(['0.0.0.0/0']));
});
test('Rate budgets are isolated and reset only after expiry',async()=>{
  let time=100000;const consume=memoryRateLimiter({now:()=>time});
  assert.equal((await consume('A',1,1000)).allowed,true);
  assert.equal((await consume('A',1,1000)).allowed,false);
  assert.equal((await consume('B',1,1000)).allowed,true);
  time+=1000;assert.equal((await consume('A',1,1000)).allowed,true);
});
test('Bridge identity is signed with timestamp, method and path',()=>{
  const headers=identityHeaders('192.0.2.10','POST','/api/v1/auth/customer/request-otp','s'.repeat(32));
  assert.equal(headers['X-Walatra-Client-IP'],'192.0.2.10');
  assert.match(headers['X-Walatra-Client-Signature'],/^[a-f0-9]{64}$/);
  assert.notEqual(headers['X-Walatra-Client-Signature'],identityHeaders('192.0.2.10','POST','/other','s'.repeat(32))['X-Walatra-Client-Signature']);
});
