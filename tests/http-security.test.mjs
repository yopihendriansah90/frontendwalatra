import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';

test('Malformed request targets return 400 and the server remains available',async()=>{
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,['scripts/serve-local.mjs','--port',String(port)],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  try{
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error(stderr);})]);
    for(const target of ['//[','http://[','/%E0%A4%A']){
      const reply=await new Promise((resolve,reject)=>{
        const socket=net.connect(port,'127.0.0.1');let raw='';
        socket.setTimeout(3000,()=>socket.destroy(new Error('Request timed out')));
        socket.on('connect',()=>socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`));
        socket.on('data',data=>raw+=data);socket.on('error',reject);socket.on('end',()=>resolve(raw));
      });
      assert.match(reply,/^HTTP\/1.1 400 /,target+' must not terminate the process');
      assert.equal((await fetch(`http://127.0.0.1:${port}/auth/session/me`)).status,401);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/.env`)).status,403);
    const response=await fetch(`http://127.0.0.1:${port}/auth/session/me`);
    assert.equal(response.headers.get('X-Frame-Options'),'DENY');
    assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
    assert.equal(child.exitCode,null,stderr);
  }finally{child.kill();await once(child,'exit').catch(()=>{});}
});
