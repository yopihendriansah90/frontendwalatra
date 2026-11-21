import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProductionSettings,securityHeaders} from '../scripts/security-headers.mjs';

test('Production refuses insecure cookies, API transport, session store and missing secrets',()=>{
  const safe={NODE_ENV:'production',APP_ORIGIN:'https://shop.example.test',SESSION_STORE:'redis',SESSION_ENCRYPTION_KEY:'e'.repeat(32),BACKEND_BRIDGE_SECRET:'b'.repeat(32)};
  assert.doesNotThrow(()=>assertProductionSettings(safe,'https://api.example.test/api/v1'));
  for(const changes of [{COOKIE_SECURE:'false'},{APP_ORIGIN:'http://shop.example.test'},{SESSION_STORE:'memory'},{SESSION_ENCRYPTION_KEY:''},{BACKEND_BRIDGE_SECRET:''},{REDIS_URL:'redis://remote.example.test'},{CSP_MODE:'report-only'}]){
    assert.throws(()=>assertProductionSettings({...safe,...changes},'https://api.example.test/api/v1'));
  }
  assert.throws(()=>assertProductionSettings(safe,'http://api.example.test'));
});
test('CSP supports archived inline scripts through hashes without allowing arbitrary inline execution',()=>{
  const headers=securityHeaders({apiBaseURL:'https://api.example.test/v1',production:true,html:'<script>window.safe=true;</script>'});
  assert.match(headers['Content-Security-Policy'],/'sha256-/);
  assert.match(headers['Content-Security-Policy'],/frame-ancestors 'none'/);
  assert.doesNotMatch(headers['Content-Security-Policy'].split(';').find(s=>s.trim().startsWith('script-src ')),/unsafe-inline|unsafe-eval/);
  assert.equal(headers['X-Frame-Options'],'DENY');assert.ok(headers['Strict-Transport-Security']);
});
