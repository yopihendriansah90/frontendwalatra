import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from 'redis';
import {memorySessionStore,redisSessionStore} from '../scripts/session-store.mjs';

test('Memory sessions expire without being extended by reads',async()=>{
  let time=100;const store=memorySessionStore({now:()=>time});
  await store.set('id',{token:'private',expiresAt:200});
  assert.equal((await store.get('id')).token,'private');time=200;
  assert.equal(await store.get('id'),null);
});
test('Redis shares encrypted sessions and atomic rate limits across instances and restart',async()=>{
  const options={url:process.env.TEST_REDIS_URL||'redis://127.0.0.1:6379',secret:'s'.repeat(32),prefix:'walatra:test:'+randomUUID()+':'};
  const inspect=createClient({url:options.url});inspect.on('error',()=>{});
  const first=await redisSessionStore(options),second=await redisSessionStore(options);let restarted;
  try{
    await inspect.connect();
    const item={token:'7|sensitive-bearer-token',expiresAt:Date.now()+5000};
    await first.set('id',item);assert.deepEqual(await second.get('id'),item);
    const keys=await inspect.keys(options.prefix+'session:*');
    assert.equal(keys.length,1);assert.ok(await inspect.pTTL(keys[0])>0);
    assert.ok(!(await inspect.get(keys[0])).includes(item.token));
    await first.close();restarted=await redisSessionStore(options);assert.deepEqual(await restarted.get('id'),item);
    const attempts=await Promise.all(Array.from({length:10},(_,index)=>(index%2?second:restarted).consumeRate('same-client',3,1000)));
    assert.equal(attempts.filter(a=>a.allowed).length,3);
    await second.delete('id');assert.equal(await restarted.get('id'),null);
    await restarted.set('tampered',item);
    const stored=(await inspect.keys(options.prefix+'session:*'))[0];
    await inspect.set(stored,'tampered');assert.equal(await second.get('tampered'),null);
  }finally{
    if(inspect.isReady){const keys=await inspect.keys(options.prefix+'*');if(keys.length)await inspect.del(keys);await inspect.close();}
    await Promise.all([first.close(),second.close(),restarted?.close()]);
  }
});
